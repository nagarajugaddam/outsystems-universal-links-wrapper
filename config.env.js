/**
 * Environment Configuration for Universal Links
 * This file contains environment-specific values for deep linking configuration
 * Supports multiple apps (AMU, APU) with different domain configurations
 * 
 * The APP_TYPE environment variable determines which config to use:
 * - Set APP_TYPE=amu for AMU app
 * - Set APP_TYPE=apu for APU app
 */

module.exports = {
  // AMU App - Stage environment
  amu: {
    UL_HOST: 'myamu-stg.apus.edu',
    UL_SCHEME: 'https',
    UL_EVENT: 'ul_deeplink',
    UL_PATHS: "<path url='/campaign/*' /><path url='/campaign' />"
  },

  // APU App - Stage environment
  apu: {
    UL_HOST: 'myapu-stg.apus.edu',
    UL_SCHEME: 'https',
    UL_EVENT: 'ul_deeplink',
    UL_PATHS: "<path url='/campaign/*' /><path url='/campaign' />"
  }
};
