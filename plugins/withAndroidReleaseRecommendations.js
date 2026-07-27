const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
  withAndroidStyles,
} = require('@expo/config-plugins');

const OPTIMIZED_PROGUARD_FILE = 'proguard-android-optimize.txt';
const LEGACY_PROGUARD_FILE_PATTERN =
  /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g;
const OPTIMIZED_RESOURCE_SHRINKING_KEY = 'android.r8.optimizedResourceShrinking';

const DEPRECATED_SYSTEM_BAR_ITEMS = new Set([
  'android:statusBarColor',
  'android:navigationBarColor',
  'android:navigationBarDividerColor',
  'android:enforceStatusBarContrast',
  'android:enforceNavigationBarContrast',
]);

function enableR8OptimizingDefaults(contents) {
  if (contents.includes(OPTIMIZED_PROGUARD_FILE)) {
    return contents;
  }

  if (!LEGACY_PROGUARD_FILE_PATTERN.test(contents)) {
    throw new Error(
      'Unable to enable R8 optimization: Expo Android release ProGuard configuration was not found.',
    );
  }

  LEGACY_PROGUARD_FILE_PATTERN.lastIndex = 0;
  return contents.replace(
    LEGACY_PROGUARD_FILE_PATTERN,
    'getDefaultProguardFile("proguard-android-optimize.txt")',
  );
}

function enableOptimizedResourceShrinking(properties) {
  const nextProperties = properties.filter(
    (property) =>
      property.type !== 'property' || property.key !== OPTIMIZED_RESOURCE_SHRINKING_KEY,
  );

  nextProperties.push({
    type: 'property',
    key: OPTIMIZED_RESOURCE_SHRINKING_KEY,
    value: 'true',
  });

  return nextProperties;
}

function withR8Optimizations(config) {
  const withOptimizedDefaults = withAppBuildGradle(config, (config) => {
    config.modResults.contents = enableR8OptimizingDefaults(config.modResults.contents);
    return config;
  });

  return withGradleProperties(withOptimizedDefaults, (config) => {
    config.modResults = enableOptimizedResourceShrinking(config.modResults);
    return config;
  });
}

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
  return withR8Optimizations(withEdgeToEdgeTheme(withResizableMainActivity(config)));
}

module.exports = withAndroidReleaseRecommendations;
module.exports.__internal = {
  enableOptimizedResourceShrinking,
  enableR8OptimizingDefaults,
};
