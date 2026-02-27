#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    // Check if we are on Android
    const platforms = context.opts.platforms || [];
    if (!platforms.includes('android')) {
        console.log('configInjector: not running on android platform');
        return;
    }

    console.log("configInjector: Running OutSystems DeepLink Config Injector...");

    const root = context.opts.projectRoot || process.cwd();
    const configXmlPath = path.join(root, 'config.xml');

    if (!fs.existsSync(configXmlPath)) {
        console.error("configInjector: config.xml not found!");
        return;
    }

    // Read config.xml to extract the universal-links values that Cordova already substituted
    let xmlContent = fs.readFileSync(configXmlPath, 'utf8');

    console.log("configInjector: xmlContent read from config.xml:", xmlContent); 

    
    // Extract values from the universal-links block
    const hostMatch = xmlContent.match(/<host[^>]*name="([^"]+)"[^>]*scheme="([^"]+)"[^>]*event="([^"]+)"/);
    const pathsMatch = xmlContent.match(/<host[^>]*>([\s\S]*?)<\/host>/);
    
    let ulHost = '';
    let ulScheme = 'https';
    let ulEvent = 'ul_deeplink';
    let ulPathsRaw = '';
    
    if (hostMatch) {
        ulHost = hostMatch[1];
        ulScheme = hostMatch[2];
        ulEvent = hostMatch[3];
        console.log(`configInjector: extracted from config.xml - UL_HOST=${ulHost}, UL_SCHEME=${ulScheme}, UL_EVENT=${ulEvent}`);
    }
    
    if (pathsMatch) {
        ulPathsRaw = pathsMatch[1];
    }

    if (!ulHost) {
        console.warn("configInjector: WARNING: UL_HOST was not found in config.xml. Deep linking config might fail.");
        return;
    }

    // Parse paths from XML format
    const pathRegex = /<path\s+url=['"]([^'"]+)['"]/g;
    let pathMatch;
    const pathsArray = [];
    while ((pathMatch = pathRegex.exec(ulPathsRaw)) !== null) {
        pathsArray.push(pathMatch[1]);
    }

    const pathsXml = pathsArray.length > 0 
        ? pathsArray.map(p => `<path url='${p}'/>`).join('\n        ')
        : `<path url='/campaign/*'/>\n        <path url='/campaign'/>`;

    const universalLinksBlock = `
    <universal-links>
        <host name="${ulHost}" scheme="${ulScheme}" event="${ulEvent}">
            ${pathsXml}
        </host>
    </universal-links>`;

    // Update config.xml with the reconstructed block
    if (xmlContent.includes('<universal-links>')) {
        console.log(`configInjector: Updating <universal-links> for host: ${ulHost}`);
        xmlContent = xmlContent.replace(/<universal-links>[\s\S]*?<\/universal-links>/, universalLinksBlock);
    } else {
        console.log(`configInjector: Injecting new <universal-links> for host: ${ulHost}`);
        xmlContent = xmlContent.replace('</widget>', `${universalLinksBlock}\n</widget>`);
    }

    fs.writeFileSync(configXmlPath, xmlContent, 'utf8');
    console.log("configInjector: config.xml updated successfully with values:", {UL_HOST: ulHost, UL_SCHEME: ulScheme, UL_EVENT: ulEvent, UL_PATHS: pathsArray});
};