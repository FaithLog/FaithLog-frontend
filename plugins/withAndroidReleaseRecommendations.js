const {
  AndroidConfig,
  withAndroidManifest,
  withAndroidStyles,
} = require('@expo/config-plugins');

const DEPRECATED_SYSTEM_BAR_ITEMS = new Set([
  'android:statusBarColor',
  'android:navigationBarColor',
  'android:navigationBarDividerColor',
  'android:enforceStatusBarContrast',
  'android:enforceNavigationBarContrast',
]);

function withResizableMainActivity(config) {
  return withAndroidManifest(config, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults).$;

    activity['android:resizeableActivity'] = 'true';
    delete activity['android:screenOrientation'];

    return config;
  });
}

function withEdgeToEdgeTheme(config) {
  return withAndroidStyles(config, (config) => {
    for (const style of config.modResults.resources.style || []) {
      style.item = (style.item || []).filter(
        (item) => !DEPRECATED_SYSTEM_BAR_ITEMS.has(item.$?.name),
      );
    }

    return config;
  });
}

function withAndroidReleaseRecommendations(config) {
  return withEdgeToEdgeTheme(withResizableMainActivity(config));
}

module.exports = withAndroidReleaseRecommendations;
