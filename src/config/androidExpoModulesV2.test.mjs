import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const configureApp = require('../../app.config.js');

describe('Android Expo Modules v2 release registration', () => {
  it('preserves the provider and module constructors used through reflection', () => {
    const config = configureApp({config: {}});
    const [, properties] = config.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    const rules = properties.android.extraProguardRules;

    expect(rules).toContain('-keep class expo.modules.ExpoModulesV2ModuleList {');
    expect(rules).toContain('public <init>();');
    expect(rules).toContain('public java.util.List getModules();');
    expect(rules).toContain('-keep class * extends io.github.expo.modules.v2.Module { *; }');
    expect(rules).toContain('-keep class io.github.expo.modules.v2.** { *; }');
    expect(rules).toContain('-keep class io.github.expo.kolibri.** { *; }');
    expect(rules).toContain('-keep class expo.modules.crypto.** { *; }');
    expect(rules).toContain('-keep class expo.modules.application.** { *; }');
    expect(properties.android.enableMinifyInReleaseBuilds).toBe(true);
  });
});
