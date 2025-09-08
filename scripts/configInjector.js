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
  // read a .js file that does: module.exports = { ... };
  try {
    if (!fs.existsSync(p)) return null;
    let txt = fs.readFileSync(p, 'utf8').trim();
    // remove leading "module.exports =" and trailing semicolon if present
    txt = txt.replace(/^\s*module\.exports\s*=\s*/, '');
    txt = txt.replace(/;\s*$/, '');
    // Now try to parse the remainder as JSON
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

module.exports = function(context) {
  try {
    const platforms = context.opts.platforms || [];
    if (!platforms.includes('android') && !platforms.includes('ios')) {
      console.log('configInjector: no ios/android platform in this run — skipping.');
      return;
    }

    const root = context.opts.projectRoot || process.cwd();
    const configXml = path.join(root, 'config.xml');
    if (!fs.existsSync(configXml)) {
      console.warn('configInjector: config.xml not found at', configXml);
      return;
    }

    // 1) Prefer context.opts.pluginVariables if present
    const pluginVars = context.opts.pluginVariables || (context.opts.plugin && context.opts.plugin.variables) || null;

    // 2) Attempt to find plugin_options.json or plugin_options.js anywhere under project root (recursively)
    let fileCfg = null;
    let fileUsed = null;

    const jsonPath = findFileRecursively(root, 'plugin_options.json', 6);
    const jsPath = findFileRecursively(root, 'plugin_options.js', 6);

    if (jsonPath) {
      fileCfg = tryReadJson(jsonPath);
      fileUsed = jsonPath;
    } else if (jsPath) {
      fileCfg = tryReadJsModuleJson(jsPath) || tryReadJson(jsPath); // fallback
      fileUsed = jsPath;
    }

    if (!fileCfg) {
      console.log('configInjector: no plugin_options file found under project root (searched recursively).');
    } else {
      console.log('configInjector: loaded plugin options from', fileUsed);
    }

    // 3) environment fallback
    const env = process.env;

    function pick(name, defaultValue) {
      if (pluginVars) {
        if (pluginVars[name] !== undefined && pluginVars[name] !== null) return pluginVars[name];
        if (pluginVars.options && pluginVars.options[name] !== undefined && pluginVars.options[name] !== null) return pluginVars.options[name];
      }
      if (fileCfg && fileCfg[name] !== undefined && fileCfg[name] !== null) return fileCfg[name];
      if (env[name] !== undefined && env[name] !== null) return env[name];
      return defaultValue;
    }

    const ulHost = pick('UL_HOST', 'myapu-dev.apus.edu');
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

    let xml = fs.readFileSync(configXml,'utf8');
    if (xml.includes('<universal-links>')) {
      xml = xml.replace(/<universal-links>[\s\S]*?<\/universal-links>/, block);
      console.log('configInjector: replaced <universal-links>');
    } else {
      xml = xml.replace('</widget>', `${block}\n</widget>`);
      console.log('configInjector: appended <universal-links>');
    }
    fs.writeFileSync(configXml, xml, 'utf8');

    console.log('configInjector: used pluginVars?', !!pluginVars, 'fileUsed:', fileUsed);
    console.log('configInjector: UL_HOST=' + ulHost, 'UL_PATHS=' + JSON.stringify(pathsArray));
  } catch (err) {
    console.error('configInjector: fatal error', err && err.stack ? err.stack : err);
    throw err;
  }
};
