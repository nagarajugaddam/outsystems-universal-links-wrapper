#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

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
    let pluginVars = context.opts.pluginVariables || (context.opts.plugin && context.opts.plugin.variables) || null;

    // Support array form (as in plugin install variables)
    if (Array.isArray(pluginVars)) {
      const obj = {};
      pluginVars.forEach(v => { if (v.name) obj[v.name] = v.value; });
      pluginVars = obj;
    }

    // If pluginVars is still null, try to read from plugin_vars.json
    if (!pluginVars) {
      const varsPath = path.join(root, 'plugin_vars.json');
      if (fs.existsSync(varsPath)) {
        try {
          pluginVars = JSON.parse(fs.readFileSync(varsPath, 'utf8'));
          console.log('configInjector: loaded pluginVars from plugin_vars.json');
        } catch (e) {
          console.warn('configInjector: failed to parse plugin_vars.json', e && e.message);
        }
      }
    }

    // 2) environment fallback
    const env = process.env;

    function pick(name, defaultValue) {
      if (pluginVars) {
        if (pluginVars[name] !== undefined && pluginVars[name] !== null) return pluginVars[name];
        if (pluginVars.options && pluginVars.options[name] !== undefined && pluginVars.options[name] !== null) return pluginVars.options[name];
      }
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

    let xml = fs.readFileSync(configXml,'utf8');
    if (xml.includes('<universal-links>')) {
      xml = xml.replace(/<universal-links>[\s\S]*?<\/universal-links>/, block);
      console.log('configInjector: replaced <universal-links>');
    } else {
      xml = xml.replace('</widget>', `${block}\n</widget>`);
      console.log('configInjector: appended <universal-links>');
    }
    fs.writeFileSync(configXml, xml, 'utf8');

    console.log('configInjector: used pluginVars?', !!pluginVars);
    console.log('configInjector: UL_HOST=' + ulHost, 'UL_PATHS=' + JSON.stringify(pathsArray));
  } catch (err) {
    console.error('configInjector: fatal error', err && err.stack ? err.stack : err);
    throw err;
  }
};
