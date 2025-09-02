#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const plist = require('plist'); // We'll use the plist module to parse/write .entitlements

module.exports = function(context) {
    const platforms = context.opts.platforms;
    if (!platforms.includes('ios')) {
        console.log('⚡ Skipping iOS entitlements on non-iOS platform.');
        return;
    }

    const projectRoot = context.opts.projectRoot;
    const iosPlatform = path.join(projectRoot, 'platforms/ios');

    const appName = fs.readdirSync(iosPlatform)
        .find(f => f.endsWith('.xcodeproj'))
        .replace('.xcodeproj', '');

    // const entitlementsPath = path.join(iosPlatform, appName, 'Resources', `${appName}.entitlements`);
    const entitlementsPath = path.join(iosPlatform, appName, `${appName}.entitlements`);


    const ulHost = context.opts.pluginVariables && context.opts.pluginVariables.UL_HOST
        ? context.opts.pluginVariables.UL_HOST
        : 'myamu-dev.apus.edu';

    let entitlements = {};

    // If file exists, read and parse it
    if (fs.existsSync(entitlementsPath)) {
        const existingContent = fs.readFileSync(entitlementsPath, 'utf8');
        entitlements = plist.parse(existingContent);
    }

    // Ensure the Associated Domains array exists
    if (!entitlements['com.apple.developer.associated-domains']) {
        entitlements['com.apple.developer.associated-domains'] = [];
    }

    const domains = entitlements['com.apple.developer.associated-domains'];

    // Add the new domain if not already present
    const applinksEntry = `applinks:${ulHost}`;
    if (!domains.includes(applinksEntry)) {
        domains.push(applinksEntry);
        entitlements['com.apple.developer.associated-domains'] = domains;
    }

    // Write back the updated plist
    const plistContent = plist.build(entitlements);
    if (!fs.existsSync(path.dirname(entitlementsPath))) {
        fs.mkdirSync(path.dirname(entitlementsPath), { recursive: true });
    }
    fs.writeFileSync(entitlementsPath, plistContent, 'utf8');

    console.log('✅ iOS entitlements updated (merged) with Associated Domains:', applinksEntry);
};
