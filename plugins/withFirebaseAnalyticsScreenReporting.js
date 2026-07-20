const {AndroidConfig, withAndroidManifest} = require('@expo/config-plugins');

const METADATA_NAME = 'google_analytics_automatic_screen_reporting_enabled';

function withFirebaseAnalyticsScreenReporting(config) {
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const metadata = application['meta-data'] || [];
    const existing = metadata.find((item) => item.$?.['android:name'] === METADATA_NAME);

    if (existing) {
      existing.$['android:value'] = 'false';
      existing.$['tools:replace'] = 'android:value';
    } else {
      metadata.push({
        $: {
          'android:name': METADATA_NAME,
          'android:value': 'false',
          'tools:replace': 'android:value',
        },
      });
    }

    application['meta-data'] = metadata;
    return config;
  });
}

module.exports = withFirebaseAnalyticsScreenReporting;
