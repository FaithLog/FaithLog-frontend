import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const resolveConfig = require('../../app.config.js');

describe('iOS RNFirebase 26 Swift Package Manager linkage', () => {
  it('uses dynamic frameworks instead of static Firebase SPM linkage', () => {
    const {plugins} = resolveConfig({config: {ios: {}, android: {}}});
    const buildProperties = plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    expect(buildProperties).toBeDefined();
    expect(buildProperties[1].ios.useFrameworks).toBe('dynamic');
    expect(plugins).toContain('@react-native-firebase/app');
    expect(plugins).toContain('@react-native-firebase/messaging');
    expect(plugins).toContain('@react-native-firebase/crashlytics');
  });
});
