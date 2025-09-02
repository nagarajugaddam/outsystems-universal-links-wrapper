#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    const platforms = context.opts.platforms;
    if (!platforms.includes('ios') && !platforms.includes('android')) return;

    const projectRoot = context.opts.projectRoot;
    const configXmlPath = path.join(projectRoot, 'config.xml'); // source config.xml

    let configXml = fs.readFileSync(configXmlPath, 'utf8');

    // Plugin variables with defaults
    const ulHost = context.opts.pluginVariables?.UL_HOST || 'myamu-dev.apus.edu';
    const ulScheme = context.opts.pluginVariables?.UL_SCHEME || 'https';
    const ulEvent = context.opts.pluginVariables?.UL_EVENT || 'ul_deeplink';
    const ulPaths = context.opts.pluginVariables?.UL_PATHS
        ? context.opts.pluginVariables.UL_PATHS.split(',').map(p => `<path url='${p.trim()}'/>`).join('')
        : "<path url='/campaign/*'/><path url='/campaign'/>";

    const universalLinksBlock = `
<universal-links>
    <host name="${ulHost}" scheme="${ulScheme}" event="${ulEvent}">
        ${ulPaths}
    </host>
</universal-links>
`;

    // Replace or append the block in config.xml
    if (configXml.includes('<universal-links>')) {
        configXml = configXml.replace(/<universal-links>[\s\S]*?<\/universal-links>/, universalLinksBlock);
    } else {
        configXml = configXml.replace('</widget>', `${universalLinksBlock}\n</widget>`);
    }

    fs.writeFileSync(configXmlPath, configXml, 'utf8');
    console.log('✅ Permanent Universal Links injected into source config.xml');
};
