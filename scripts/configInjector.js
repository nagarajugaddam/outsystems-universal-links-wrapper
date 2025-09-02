#!/usr/bin/env node
module.exports = function(context) {
  // Require inside function to avoid "already declared" in shared contexts
  const fs = require('fs');
  const path = require('path');

  try {
    const platforms = (context && context.opts && context.opts.platforms) || [];
    console.log('[UL] Running configInjector - platforms:', platforms);

    if (!platforms.includes('ios') && !platforms.includes('android')) {
      console.log('[UL] No iOS/Android platform detected. Skipping.');
      return;
    }

    const projectRoot = context.opts && context.opts.projectRoot || process.cwd();
    const configXmlPath = path.join(projectRoot, 'config.xml');
    console.log('[UL] config.xml path:', configXmlPath);

    if (!fs.existsSync(configXmlPath)) {
      console.error('[UL] config.xml not found. Aborting UL injection.');
      return;
    }

    let configXml = fs.readFileSync(configXmlPath, 'utf8');

    const vars = (context && context.opts && context.opts.pluginVariables) || {};
    console.log('[UL] pluginVariables:', vars);

    const ulHost   = vars.UL_HOST   || 'myamu-dev.apus.edu';
    const ulScheme = vars.UL_SCHEME || 'https';
    const ulEvent  = vars.UL_EVENT  || 'ul_deeplink';
    let   ulPaths  = vars.UL_PATHS  || "<path url='/campaign/*'/><path url='/campaign'/>";

    // If UL_PATHS looks like CSV (no '<'), convert to <path/> elements
    if (typeof ulPaths === 'string' && !ulPaths.includes('<')) {
      ulPaths = ulPaths
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<path url='${p}'/>`)
        .join('');
    }

    const universalLinksBlock =
`<universal-links>
  <host name="${ulHost}" scheme="${ulScheme}" event="${ulEvent}">
    ${ulPaths}
  </host>
</universal-links>`;

    if (configXml.includes('<universal-links')) {
      console.log('[UL] Updating existing <universal-links> block...');
      configXml = configXml.replace(
        /<universal-links>[\s\S]*?<\/universal-links>/,
        universalLinksBlock
      );
    } else if (configXml.includes('</widget>')) {
      console.log('[UL] Inserting new <universal-links> block...');
      configXml = configXml.replace('</widget>', `${universalLinksBlock}\n</widget>`);
    } else {
      console.error('[UL] No </widget> found in config.xml. Cannot insert UL block.');
      return;
    }

    fs.writeFileSync(configXmlPath, configXml, 'utf8');
    console.log('[UL] ✅ Universal Links injected successfully.');
    console.log('[UL] ✅ Host:', ulHost, 'Scheme:', ulScheme, 'Event:', ulEvent, 'Paths:', ulPaths);
  } catch (e) {
    console.error('[UL] ❌ configInjector failed:', e && e.stack || e);
    throw e;
  }
};
