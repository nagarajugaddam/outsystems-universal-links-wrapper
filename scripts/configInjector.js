#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function tryReadJson(p) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) { console.warn('parse err', p, e && e.message); }
  return null;
}

module.exports = function(context) {
  const platforms = context.opts.platforms || [];
  if (!platforms.includes('android') && !platforms.includes('ios')) return;

  const root = context.opts.projectRoot || process.cwd();
  const configXml = path.join(root, 'config.xml');
  if (!fs.existsSync(configXml)) { console.warn('config.xml not found'); return; }

  // 1) Prefer context.opts.pluginVariables if provided
  const pluginVars = context.opts.pluginVariables || (context.opts.plugin && context.opts.plugin.variables) || null;

  // 2) Then try plugin_options.json in likely resource locations
  const candidates = [
    path.join(root, 'plugin_options.json'),
    path.join(root, 'App_Resources', 'plugin_options.json'),
    path.join(root, 'Resources', 'plugin_options.json'),
    path.join(root, 'resources', 'plugin_options.json'),
    path.join(root, 'www', 'App_Resources', 'plugin_options.json'),
    path.join(root, 'platforms', 'android', 'app', 'src', 'main', 'assets', 'plugin_options.json'),
    path.join(root, 'platforms', 'ios', 'plugin_options.json')
  ];

  let fileCfg = null, fileUsed = null;
  for (const c of candidates) {
    const cfg = tryReadJson(c);
    if (cfg) { fileCfg = cfg; fileUsed = c; break; }
  }

  // 3) environment fallback
  const env = process.env;

  function pick(n, d) {
    if (pluginVars) {
      if (pluginVars[n] !== undefined) return pluginVars[n];
      if (pluginVars.options && pluginVars.options[n] !== undefined) return pluginVars.options[n];
    }
    if (fileCfg && fileCfg[n] !== undefined) return fileCfg[n];
    if (env[n] !== undefined) return env[n];
    return d;
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
};
