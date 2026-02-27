#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
  try {
    let pluginVars = context.opts.pluginVariables || (context.opts.plugin && context.opts.plugin.variables) || null;
    if (Array.isArray(pluginVars)) {
      const obj = {};
      pluginVars.forEach(v => { if (v.name) obj[v.name] = v.value; });
      pluginVars = obj;
    }
    if (!pluginVars) {
      console.log('savePluginVars: No plugin variables found. Skipping save.');
      return;
    }
    const root = context.opts.projectRoot || process.cwd();
    const varsPath = path.join(root, 'plugin_vars.json');
    fs.writeFileSync(varsPath, JSON.stringify(pluginVars, null, 2), 'utf8');
    console.log('savePluginVars: Saved plugin variables to', varsPath);
  } catch (err) {
    console.error('savePluginVars: fatal error', err && err.stack ? err.stack : err);
    throw err;
  }
};
