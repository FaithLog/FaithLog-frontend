const {withAndroidManifest, withInfoPlist} = require('@expo/config-plugins');

const TOSS_SCHEME = 'supertoss';

function withTossRemittance(config) {
  config = withInfoPlist(config, (config) => {
    const current = Array.isArray(config.modResults.LSApplicationQueriesSchemes)
      ? config.modResults.LSApplicationQueriesSchemes
      : [];
    config.modResults.LSApplicationQueriesSchemes = [...new Set([...current, TOSS_SCHEME])];
    return config;
  });

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const queries = manifest.queries ?? [];
    const alreadyConfigured = queries.some((query) =>
      query.intent?.some((intent) =>
        intent.data?.some((data) => data.$?.['android:scheme'] === TOSS_SCHEME),
      ),
    );

    if (!alreadyConfigured) {
      queries.push({
        intent: [{
          action: [{$: {'android:name': 'android.intent.action.VIEW'}}],
          category: [{$: {'android:name': 'android.intent.category.BROWSABLE'}}],
          data: [{$: {'android:scheme': TOSS_SCHEME}}],
        }],
      });
    }
    manifest.queries = queries;
    return config;
  });
}

module.exports = withTossRemittance;
