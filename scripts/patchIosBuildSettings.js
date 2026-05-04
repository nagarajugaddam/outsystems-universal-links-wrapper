#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
  try {
    const root = context.opts.projectRoot || process.cwd();
    const iosPlatformDir = path.join(root, 'platforms', 'ios');
    if (!fs.existsSync(iosPlatformDir)) {
      console.log('patchIosBuildSettings: platforms/ios not present, skipping');
      return;
    }

    // Patch Podfile: add warn_for_unused_master_specs_repo => false
    const podfilePath = path.join(iosPlatformDir, 'Podfile');
    if (fs.existsSync(podfilePath)) {
      let podfile = fs.readFileSync(podfilePath, 'utf8');
      if (!/warn_for_unused_master_specs_repo/.test(podfile)) {
        if (/install!\s+['"]cocoapods['"]/.test(podfile)) {
          podfile = podfile.replace(/install!\s+(['"])cocoapods\1(.*)/, (m, q, rest) => {
            if (/warn_for_unused_master_specs_repo/.test(rest)) return m;
            // add option to existing install! line
            const newRest = rest.trim().endsWith(',') ? rest + " :warn_for_unused_master_specs_repo => false" : rest + ", :warn_for_unused_master_specs_repo => false";
            return `install! ${q}cocoapods${q}${newRest}`;
          });
        } else {
          // insert an install! line at top
          podfile = "install! 'cocoapods', :warn_for_unused_master_specs_repo => false\n" + podfile;
        }
        fs.writeFileSync(podfilePath, podfile, 'utf8');
        console.log('patchIosBuildSettings: Podfile patched with warn_for_unused_master_specs_repo => false');
      } else {
        console.log('patchIosBuildSettings: Podfile already contains warn_for_unused_master_specs_repo, skipping');
      }
    } else {
      console.log('patchIosBuildSettings: Podfile not found, skipping Podfile patch');
    }

    // Patch project.pbxproj files: set build settings to $(inherited)
    const projFiles = fs.readdirSync(iosPlatformDir).filter(n => n.endsWith('.xcodeproj'));
    if (projFiles.length === 0) {
      console.log('patchIosBuildSettings: no .xcodeproj found, skipping pbxproj patch');
      return;
    }

    projFiles.forEach(proj => {
      const pbxPath = path.join(iosPlatformDir, proj, 'project.pbxproj');
      if (!fs.existsSync(pbxPath)) {
        console.log('patchIosBuildSettings: project.pbxproj not found for', proj);
        return;
      }

      let pbx = fs.readFileSync(pbxPath, 'utf8');
      let changed = false;

      // Replace ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES assignments
      const aesRegex = /ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES\s*=\s*[^;]+;/g;
      pbx = pbx.replace(aesRegex, (m) => {
        changed = true;
        return 'ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = $(inherited);';
      });

      // Replace LD_RUNPATH_SEARCH_PATHS assignments
      const lrRegex = /LD_RUNPATH_SEARCH_PATHS\s*=\s*[^;]+;/g;
      pbx = pbx.replace(lrRegex, (m) => {
        changed = true;
        return 'LD_RUNPATH_SEARCH_PATHS = $(inherited);';
      });

      if (changed) {
        fs.writeFileSync(pbxPath, pbx, 'utf8');
        console.log('patchIosBuildSettings: patched', pbxPath);
      } else {
        console.log('patchIosBuildSettings: no relevant build settings found in', pbxPath);
      }
    });
  } catch (err) {
    console.warn('patchIosBuildSettings: unexpected error', err && (err.stack || err.message || err));
  }
};
