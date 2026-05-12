/*
Script activates support for Universal Links in the application by setting proper preferences in the xcode project file.
Which is:
- deployment target set to iOS 9.0
- .entitlements file added to project PBXGroup and PBXFileReferences section
- path to .entitlements file added to Code Sign Entitlements preference
*/

var path = require('path');
var compare = require('node-version-compare');
var ConfigXmlHelper = require('../configXmlHelper.js');
var IOS_DEPLOYMENT_TARGET = '8.0';
var COMMENT_KEY = /_comment$/;
var context;

module.exports = {
  enableAssociativeDomainsCapability: enableAssociativeDomainsCapability
}

// region Public API

/**
 * Activate associated domains capability for the application.
 *
 * @param {Object} cordovaContext - cordova context object
 */
function enableAssociativeDomainsCapability(cordovaContext) {
  context = cordovaContext;

  // Some toolchains (notably newer CocoaPods/xcodeproj) are strict about the Xcode project
  // file format. Older JS project writers can emit a pbxproj that later fails to parse
  // during `pod install` (e.g. Nanaimo::Reader::ParseError mentioning build settings like
  // LD_RUNPATH_SEARCH_PATHS). Since this plugin can still function by generating entitlements
  // and association files, allow skipping pbxproj writes via a config.xml preference.
  //
  // <preference name="UL_SKIP_XCODE_PBXPROJ" value="true" />
  try {
    var ConfigXmlHelper = require('../configXmlHelper.js');
    var helper = new ConfigXmlHelper(context);
    if (helper.getPreferenceValue && helper.getPreferenceValue('UL_SKIP_XCODE_PBXPROJ') === 'true') {
      console.warn('Universal Links: skipping Xcode project edits (UL_SKIP_XCODE_PBXPROJ=true).');
      return;
    }
  } catch (e) {}

  var projectFile = loadProjectFile();

  // adjust preferences
  var didChangeProject = activateAssociativeDomains(projectFile.xcode);

  // add entitlements file to pbxfilereference
  didChangeProject = addPbxReference(projectFile.xcode) || didChangeProject;

  // save changes
  if (!didChangeProject) {
    return;
  }

  projectFile.write();
}

// endregion

// region Alter project file preferences

/**
 * Activate associated domains support in the xcode project file:
 * - set deployment target to ios 9;
 * - add .entitlements file to Code Sign Entitlements preference.
 *
 * @param {Object} xcodeProject - xcode project preferences; all changes are made in that instance
 */
function activateAssociativeDomains(xcodeProject) {
  var configurations = nonComments(xcodeProject.pbxXCBuildConfigurationSection());
  var entitlementsFilePath = pathToEntitlementsFile();
  var config;
  var buildSettings;
  var deploymentTargetIsUpdated;
  var didChange = false;

  for (config in configurations) {
    buildSettings = configurations[config].buildSettings;
    var desiredEntitlements = '"' + entitlementsFilePath + '"';
    if (buildSettings['CODE_SIGN_ENTITLEMENTS'] !== desiredEntitlements) {
      buildSettings['CODE_SIGN_ENTITLEMENTS'] = desiredEntitlements;
      didChange = true;
    }

    // if deployment target is less then the required one - increase it
    if (buildSettings['IPHONEOS_DEPLOYMENT_TARGET']) {
      if (compare(buildSettings['IPHONEOS_DEPLOYMENT_TARGET'], IOS_DEPLOYMENT_TARGET) == -1) {
        buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = IOS_DEPLOYMENT_TARGET;
        deploymentTargetIsUpdated = true;
        didChange = true;
      }
    } else {
      buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = IOS_DEPLOYMENT_TARGET;
      deploymentTargetIsUpdated = true;
      didChange = true;
    }
  }

  if (deploymentTargetIsUpdated) {
    console.log('IOS project now has deployment target set as: ' + IOS_DEPLOYMENT_TARGET);
  }

  console.log('IOS project Code Sign Entitlements now set to: ' + entitlementsFilePath);

  return didChange;
}

// endregion

// region PBXReference methods

/**
 * Add .entitlemets file into the project.
 *
 * @param {Object} xcodeProject - xcode project preferences; all changes are made in that instance
 */
function addPbxReference(xcodeProject) {
  var fileReferenceSection = nonComments(xcodeProject.pbxFileReferenceSection());
  var entitlementsFileName = path.basename(pathToEntitlementsFile());

  if (isPbxReferenceAlreadySet(fileReferenceSection, entitlementsFileName)) {
    console.log('Entitlements file is in reference section.');
    return false;
  }

  console.log('Entitlements file is not in references section, adding it');
  xcodeProject.addResourceFile(entitlementsFileName);
  return true;
}

/**
 * Check if .entitlemets file reference already set.
 *
 * @param {Object} fileReferenceSection - PBXFileReference section
 * @param {String} entitlementsRelativeFilePath - relative path to entitlements file
 * @return true - if reference is set; otherwise - false
 */
function isPbxReferenceAlreadySet(fileReferenceSection, entitlementsRelativeFilePath) {
  var isAlreadyInReferencesSection = false;
  var uuid;
  var fileRefEntry;

  for (uuid in fileReferenceSection) {
    fileRefEntry = fileReferenceSection[uuid];
    if (fileRefEntry.path && fileRefEntry.path.indexOf(entitlementsRelativeFilePath) > -1) {
      isAlreadyInReferencesSection = true;
      break;
    }
  }

  return isAlreadyInReferencesSection;
}

// region Xcode project file helpers

/**
 * Load iOS project file from platform specific folder.
 *
 * @return {Object} projectFile - project file information
 */
function loadProjectFile() {
  var platform_ios;
  var projectFile;
  
  try {
      // try pre-5.0 cordova structure
      platform_ios = context.requireCordovaModule('cordova-lib/src/plugman/platforms')['ios'];
      projectFile = platform_ios.parseProjectFile(iosPlatformPath());
  } catch (e) {
      try {
          // let's try cordova 5.0 structure
          platform_ios = context.requireCordovaModule('cordova-lib/src/plugman/platforms/ios');
          projectFile = platform_ios.parseProjectFile(iosPlatformPath());
      } catch (e) {
          // Then cordova 7.0
          var project_files = require('glob').sync(path.join(iosPlatformPath(), '*.xcodeproj', 'project.pbxproj'));
          
          if (project_files.length === 0) {
              throw new Error('does not appear to be an xcode project (no xcode project file)');
          }
          
          var pbxPath = project_files[0];
          
          var xcodeproj = require('xcode').project(pbxPath);
          xcodeproj.parseSync();
          
          projectFile = {
              'xcode': xcodeproj,
              write: function () {
                  var fs = require('fs');
                  
              var frameworks_file = path.join(iosPlatformPath(), 'frameworks.json');
              var frameworks = {};
              try {
                  frameworks = context.requireCordovaModule(frameworks_file);
              } catch (e) { }
              
              fs.writeFileSync(pbxPath, xcodeproj.writeSync());
                  if (Object.keys(frameworks).length === 0){
                      // If there is no framework references remain in the project, just remove this file
                      require('shelljs').rm('-rf', frameworks_file);
                      return;
                  }
                  fs.writeFileSync(frameworks_file, JSON.stringify(this.frameworks, null, 4));
              }
          };
      }
  }
  
  return projectFile;
  } 

/**
 * Remove comments from the file.
 *
 * @param {Object} obj - file object
 * @return {Object} file object without comments
 */
function nonComments(obj) {
  var keys = Object.keys(obj);
  var newObj = {};

  for (var i = 0, len = keys.length; i < len; i++) {
    if (!COMMENT_KEY.test(keys[i])) {
      newObj[keys[i]] = obj[keys[i]];
    }
  }

  return newObj;
}

// endregion

// region Path helpers

function iosPlatformPath() {
  return path.join(projectRoot(), 'platforms', 'ios');
}

function projectRoot() {
  return context.opts.projectRoot;
}

function pathToEntitlementsFile() {
  var configXmlHelper = new ConfigXmlHelper(context),
    projectName = configXmlHelper.getProjectName(),
    fileName = projectName + '.entitlements';

  return path.join(projectName, 'Resources', fileName);
}

// endregion
