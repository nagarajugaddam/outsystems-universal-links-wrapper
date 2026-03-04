#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function tryReadJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.warn('configInjector: JSON parse err for', p, e && e.message);
    return null;
  }
}

function tryReadJsModuleJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    let txt = fs.readFileSync(p, 'utf8').trim();
    txt = txt.replace(/^\s*module\.exports\s*=\s*/, '');
    txt = txt.replace(/;\s*$/, '');
    return JSON.parse(txt);
  } catch (e) {
    console.warn('configInjector: JS->JSON parse err for', p, e && e.message);
    return null;
  }
}

function findFileRecursively(startDir, fileName, maxDepth = 6) {
  const seen = new Set();
  function _search(dir, depth) {
    if (depth > maxDepth) return null;
    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return null; }
    for (const ent of entries) {
      const full = path.join(dir, ent);
      if (seen.has(full)) continue;
      seen.add(full);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile() && (ent === fileName)) return full;
        if (stat.isDirectory()) {
          const found = _search(full, depth + 1);
          if (found) return found;
        }
      } catch (e) { /* ignore */ }
    }
    return null;
  }
  return _search(startDir, 0);
}

// Helper to extract preference from config.xml content
function getPreferenceValue(xmlContent, prefName) {
    const rx = new RegExp(`<preference\\s+name="${prefName}"\\s+value="([^"]+)"`, 'i');
    const match = xmlContent.match(rx);
    return match ? match[1] : null;
}

module.exports = function(context) {
  try {
    const platforms = context.opts.platforms || [];
    if (!platforms.includes('android') && !platforms.includes('ios')) {
      console.log('configInjector: no ios/android platform in this run — skipping.');
      return;
    }

    const root = context.opts.projectRoot || process.cwd();
    const configXmlPath = path.join(root, 'config.xml');
    
    if (!fs.existsSync(configXmlPath)) {
      console.warn('configInjector: config.xml not found at', configXmlPath);
      return;
    }

    // 1. Read config.xml immediately to find the Environment preference
    let xmlContent = fs.readFileSync(configXmlPath, 'utf8');
    const envValue = getPreferenceValue(xmlContent, 'AppEnvironment'); // matches value from Extensibility Config
    
    console.log(`configInjector: Detected Environment: ${envValue || 'default'}`);

    // 2. Determine filenames based on environment
    let targetJsonName = 'plugin_options.json';
    let targetJsName = 'plugin_options.js';

    if (envValue) {
        targetJsonName = `plugin_options_${envValue}.json`;
        targetJsName = `plugin_options_${envValue}.js`;
    }

    // 3. Search recursively
    let fileCfg = null;
    let fileUsed = null;

    let jsonPath = findFileRecursively(root, targetJsonName, 6);
    let jsPath = findFileRecursively(root, targetJsName, 6);

    // FALLBACK: If specific environment file not found, try default
    if (!jsonPath && !jsPath && envValue) {
        console.warn(`configInjector: ${targetJsonName} not found. Falling back to default.`);
        jsonPath = findFileRecursively(root, 'plugin_options.json', 6);
        jsPath = findFileRecursively(root, 'plugin_options.js', 6);
    }

    if (jsonPath) {
      fileCfg = tryReadJson(jsonPath);
      fileUsed = jsonPath;
    } else if (jsPath) {
      fileCfg = tryReadJsModuleJson(jsPath) || tryReadJson(jsPath); 
      fileUsed = jsPath;
    }

    if (!fileCfg) {
      console.log('configInjector: no plugin_options file found under project root.');
    } else {
      console.log('configInjector: loaded plugin options from', fileUsed);
    }

    // 4. Merge Logic (Plugin Vars vs File Config vs Process Env)
    const pluginVars = context.opts.pluginVariables || (context.opts.plugin && context.opts.plugin.variables) || null;
    const env = process.env;

    function pick(name, defaultValue) {
      // Priority 1: Plugin Vars (Installation time)
      if (pluginVars) {
        if (pluginVars[name] !== undefined && pluginVars[name] !== null) return pluginVars[name];
        if (pluginVars.options && pluginVars.options[name] !== undefined && pluginVars.options[name] !== null) return pluginVars.options[name];
      }
      // Priority 2: JSON/JS File Config
      if (fileCfg && fileCfg[name] !== undefined && fileCfg[name] !== null) return fileCfg[name];
      // Priority 3: Process Environment
      if (env[name] !== undefined && env[name] !== null) return env[name];
      return defaultValue;
    }

    const ulHost = pick('UL_HOST', '');
    const ulScheme = pick('UL_SCHEME', 'https');
    const ulEvent = pick('UL_EVENT', 'ul_deeplink');
    const ulPathsRaw = pick('UL_PATHS', ['/campaign/*','/campaign']);

    const pathsArray = Array.isArray(ulPathsRaw) ? ulPathsRaw :
      (typeof ulPathsRaw === 'string' && ulPathsRaw.indexOf('<path') !== -1
        ? (function(){ let m; const regex=/url\s*=\s*['"]([^'"]+)['"]/g, arr=[]; while((m=regex.exec(ulPathsRaw))){arr.push(m[1]);} return arr; })()
        : (typeof ulPathsRaw === 'string' ? ulPathsRaw.split(',').map(s=>s.trim()) : [String(ulPathsRaw)]));

    const pathsXml = pathsArray.map(p=>`<path url='${p}'/>`).join('');

    const block = `
    <universal-links>
      <host name="${ulHost}" scheme="${ulScheme}" event="${ulEvent}">
        ${pathsXml}
      </host>
    </universal-links>
    `;

    // 5. Inject into XML
    if (xmlContent.includes('<universal-links>')) {
        xmlContent = xmlContent.replace(/<universal-links>[\s\S]*?<\/universal-links>/, block);
      console.log('configInjector: replaced <universal-links>');
    } else {
        xmlContent = xmlContent.replace('</widget>', `${block}\n</widget>`);
      console.log('configInjector: appended <universal-links>');
    }
    
    fs.writeFileSync(configXmlPath, xmlContent, 'utf8');

    console.log('configInjector: UL_HOST=' + ulHost);
  } catch (err) {
    console.error('configInjector: fatal error', err && err.stack ? err.stack : err);
    throw err;
  }
};