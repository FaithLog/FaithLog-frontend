import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const appEntry = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const analyticsSource = fs.readFileSync(
  path.join(root, 'src/analytics/nativeFirebaseAnalytics.ts'),
  'utf8',
);
const analyticsContract = fs.readFileSync(
  path.join(root, 'src/analytics/analyticsContract.ts'),
  'utf8',
);
const androidScreenReportingPlugin = fs.readFileSync(
  path.join(root, 'plugins/withFirebaseAnalyticsScreenReporting.js'),
  'utf8',
);

describe('Firebase Analytics native configuration', () => {
  it('uses the matching React Native Firebase package and Expo config plugin', () => {
    expect(packageJson.dependencies['@react-native-firebase/analytics']).toBe('25.1.0');
    expect(packageJson.dependencies['@react-native-firebase/app']).toBe('^25.1.0');
    expect(appConfig).toContain("'@react-native-firebase/analytics'");
    expect(appConfig).toMatch(/withoutAdIdSupport:\s*true/);
    expect(appJson.expo.android.blockedPermissions).toContain(
      'com.google.android.gms.permission.AD_ID',
    );
  });

  it('initializes collection from the app entry without creating another Firebase app', () => {
    expect(appEntry).toContain('initializeNativeFirebaseAnalytics');
    expect(analyticsSource).toContain('getAnalytics()');
    expect(analyticsSource).not.toContain('initializeApp');
  });

  it('disables automatic screen reporting so manual screen views are not duplicated', () => {
    expect(appConfig).toContain('FirebaseAutomaticScreenReportingEnabled');
    expect(appConfig).toContain('withFirebaseAnalyticsScreenReporting');
    expect(androidScreenReportingPlugin).toContain("'tools:replace': 'android:value'");
  });

  it('does not add measurement ids, user identity APIs, advertising ids, or personal data fields', () => {
    const analyticsImplementation = `${appEntry}\n${appConfig}\n${analyticsSource}\n${analyticsContract}`;

    expect(analyticsImplementation).not.toMatch(/G-[A-Z0-9]+/);
    expect(analyticsImplementation).not.toContain('setUserId');
    expect(analyticsImplementation).not.toContain('setUserProperty');
    expect(analyticsImplementation).not.toMatch(/phone|campusName|authorization|fcmToken|advertisingId/i);
  });
});
