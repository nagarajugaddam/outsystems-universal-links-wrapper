#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * Recursively search for a file under a directory
 */
function findFileRecursively(startDir, fileName, maxDepth = 6) {
  function _search(dir, depth) {
    if (depth > maxDepth) return null;
    let entries;
    try { entries = fs.readdirSync(dir); } catch (e) { return null; }
    for (const ent of entries) {
      const full = path.join(dir, ent);
      let stat;
      try { stat = fs.statSync(full); } catch(e) { continue; }
      if (stat.isFile() && ent === fileName) return full;
      if (stat.isDirectory()) {
        const found = _search(full, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return _search(startDir, 0);
}

function tryReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('[replace_editconfig] Failed to parse JSON from', file, e.message);
    return null;
  }
}

module.exports = function(context) {
  try {
    const projectRoot = context.opts.projectRoot || process.cwd();
    const repoRoot = path.resolve(__dirname, '..'); // plugin repo root

    // 1. Find plugin_options.json anywhere under project root (recursively)
    const optsPath = findFileRecursively(projectRoot, 'plugin_options.json', 6) 
                  || findFileRecursively(repoRoot, 'plugin_options.json', 3);

    if (!optsPath) {
      console.log('[replace_editconfig] plugin_options.json not found. Skipping.');
      return;
    }

    const opts = tryReadJson(optsPath);
    if (!opts || !opts.UL_HOST) {
      console.log('[replace_editconfig] UL_HOST not found in plugin_options.json. Skipping.');
      return;
    }
    const ulHost = opts.UL_HOST;

    // 2. Load plugin.xml
    const pluginXmlPath = path.join(repoRoot, 'plugin.xml');
    if (!fs.existsSync(pluginXmlPath)) {
      console.warn('[replace_editconfig] plugin.xml not found at', pluginXmlPath);
      return;
    }
    const xml = fs.readFileSync(pluginXmlPath, 'utf8');

    // 3. Backup plugin.xml once
    const bak = pluginXmlPath + '.bak';
    if (!fs.existsSync(bak)) fs.writeFileSync(bak, xml, 'utf8');

    // 4. Replace $UL_HOST placeholder with real value
    const replaced = xml.replace(/\$UL_HOST/g, ulHost);
    if (replaced === xml) {
      console.log('[replace_editconfig] No $UL_HOST placeholder found in plugin.xml.');
      return;
    }

    fs.writeFileSync(pluginXmlPath, replaced, 'utf8');
    console.log('[replace_editconfig] Updated plugin.xml with UL_HOST =', ulHost, 'from', optsPath);
  } catch (err) {
    console.error('[replace_editconfig] Fatal error:', err.stack || err);
  }
};
