#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { json } = require('stream/consumers');

module.exports = function(context) {
    // 1. Check if we are on Android (iOS handles this differently usually, but we can do both)
    const platforms = context.opts.platforms || [];
    if (!platforms.includes('android')) {
        return;
    }

    console.log("Running OutSystems DeepLink Config Injector...");

    const root = context.opts.projectRoot || process.cwd();
    const configXmlPath = path.join(root, 'config.xml');

    if (!fs.existsSync(configXmlPath)) {
        console.error("Config : config.xml not found!");
        return;
    }

    // 2. GET VARIABLES FROM OUTSYSTEMS / CLI
    // This is the magic part. We look at the arguments passed during install.
    const cliVariables = context.opts.plugin ? context.opts.plugin.pluginVariables : {};


    console.log("Config : Plugin variables received from CLI:", JSON.stringify(context.opts, null, 2));
    
    // Fallback: If running via 'cordova prepare', variables might not be in context.opts.plugin
    // We can try to grab them from process.env if OutSystems sets them there, 
    // or rely on what is already in config.xml if we are just updating.
    
    const ulHost = cliVariables['UL_HOST'];
    const ulScheme = cliVariables['UL_SCHEME'] || 'https';
    const ulEvent = cliVariables['UL_EVENT'] || 'ul_deeplink';
    const ulPaths = cliVariables['UL_PATHS'] || '/campaign/*,/campaign'; // Default fallback

    if (!ulHost) {
        console.warn("Config :  WARNING: UL_HOST variable was not found in plugin variables. Deep linking config might fail.");
        // If we can't find the variable, we stop to avoid writing "undefined"
        return; 
    }

    // 3. Construct the XML Block
    // Handle comma-separated paths if multiple are passed
    const pathsArray = ulPaths.split(',').map(p => p.trim());
    const pathsXml = pathsArray.map(p => `<path url="${p}" />`).join('\n        ');

    const universalLinksBlock = `
    <universal-links>
        <host name="${ulHost}" scheme="${ulScheme}" event="${ulEvent}">
            ${pathsXml}
        </host>
    </universal-links>`;

    // 4. Inject into config.xml
    let xmlContent = fs.readFileSync(configXmlPath, 'utf8');

    if (xmlContent.includes('<universal-links>')) {
        // Replace existing block
        console.log(`Config : Updating <universal-links> for host: ${ulHost}`);
        xmlContent = xmlContent.replace(/<universal-links>[\s\S]*?<\/universal-links>/, universalLinksBlock);
    } else {
        // Append before widget close
        console.log(`Config : Injecting new <universal-links> for host: ${ulHost}`);
        xmlContent = xmlContent.replace('</widget>', `${universalLinksBlock}\n</widget>`);
    }

    fs.writeFileSync(configXmlPath, xmlContent, 'utf8');
    console.log("Config : config.xml updated successfully.");
};