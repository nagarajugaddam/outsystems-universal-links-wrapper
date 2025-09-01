#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const et = require('elementtree');

module.exports = function(context) {
    const platforms = context.opts.platforms;
    if (!platforms.includes('ios') && !platforms.includes('android')) {
        return;
    }

    const projectRoot = context.opts.projectRoot;
    const configPath = path.join(projectRoot, 'config.xml');
    if (!fs.existsSync(configPath)) return;

    const xmlData = fs.readFileSync(configPath, 'utf8');
    const etree = et.parse(xmlData);

    // Remove existing universal-links to avoid duplicates
    const existing = etree.findall('universal-links');
    existing.forEach(e => etree.getroot().remove(e));

    // Add new universal-links
    const pluginVars = context.opts.pluginVariables || {};
    const ulHost = pluginVars.UL_HOST || 'myamu-dev.apus.edu';
    const ulScheme = pluginVars.UL_SCHEME || 'https';
    const ulEvent = pluginVars.UL_EVENT || 'ul_deeplink';
    const ulPaths = pluginVars.UL_PATHS || "<path url='/campaign/*'/><path url='/campaign'/>";

    const ulElement = et.Element('universal-links');
    const hostElement = et.SubElement(ulElement, 'host', { name: ulHost, scheme: ulScheme, event: ulEvent });
    // Inject paths directly as raw XML
    hostElement.text = ulPaths;

    etree.getroot().append(ulElement);

    fs.writeFileSync(configPath, etree.write({ xml_declaration: true }), 'utf8');
    console.log('✅ <universal-links> injected into config.xml for Universal Links');
};



const fs = require('fs');
const path = require('path');
module.exports = function(context) {
    const platforms = context.opts.platforms;
    if (!platforms.includes('ios') && !platforms.includes('android')) return;

    const projectRoot = context.opts.projectRoot;
    const configXmlPath = path.join(projectRoot, 'config.xml');

    let configXml = fs.readFileSync(configXmlPath, 'utf8');

    const ulHost = context.opts.pluginVariables?.UL_HOST || 'myamu-dev.apus.edu';
    const ulScheme = context.opts.pluginVariables?.UL_SCHEME || 'https';
    const ulEvent = context.opts.pluginVariables?.UL_EVENT || 'ul_deeplink';
    const ulPaths = context.opts.pluginVariables?.UL_PATHS || "<path url='/campaign/*'/><path url='/campaign'/>";

    const universalLinksBlock = `
<universal-links>
    <host name="${ulHost}" scheme="${ulScheme}" event="${ulEvent}">
        ${ulPaths}
    </host>
</universal-links>
`;

    // Replace or append the block
    if (configXml.includes('<universal-links>')) {
        configXml = configXml.replace(/<universal-links>[\s\S]*?<\/universal-links>/, universalLinksBlock);
    } else {
        // Append before </widget> closing tag
        configXml = configXml.replace('</widget>', `${universalLinksBlock}\n</widget>`);
    }

    fs.writeFileSync(configXmlPath, configXml, 'utf8');
    console.log('✅ Universal Links injected with real values.');
};

