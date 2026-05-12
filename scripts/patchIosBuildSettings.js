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

    // NOTE:
    // This script previously attempted to patch `project.pbxproj` using regex replacements
    // for build settings like `LD_RUNPATH_SEARCH_PATHS`. On newer MABS/Xcode/CocoaPods
    // toolchains, that approach can corrupt the pbxproj and cause `pod install` failures:
    //   Nanaimo::Reader::ParseError - Dictionary missing ';' ... found '('
    //
    // Since MABS 12 already runs CocoaPods successfully earlier in the pipeline, and since
    // pbxproj changes are inherently fragile, we no longer modify `project.pbxproj` here.
    console.log('patchIosBuildSettings: skipping pbxproj patch (disabled to avoid CocoaPods parse errors)');
  } catch (err) {
    console.warn('patchIosBuildSettings: unexpected error', err && (err.stack || err.message || err));
  }
};
