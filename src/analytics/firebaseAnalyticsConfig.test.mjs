import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const appEntry = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const analyticsSource = fs.readFileSync(
  path.join(root, 'src/analytics/nativeFirebaseAnalytics.ts'),
  'utf8',
);

describe('Firebase Analytics native configuration', () => {
  it('uses the matching React Native Firebase package and Expo config plugin', () => {
    expect(packageJson.dependencies['@react-native-firebase/analytics']).toBe('25.1.0');
    expect(packageJson.dependencies['@react-native-firebase/app']).toBe('^25.1.0');
    expect(appConfig).toContain("'@react-native-firebase/analytics'");
    expect(appConfig).toMatch(/withoutAdIdSupport:\s*true/);
  });

  it('initializes collection from the app entry without creating another Firebase app', () => {
    expect(appEntry).toContain('initializeNativeFirebaseAnalytics');
    expect(analyticsSource).toContain('getAnalytics()');
    expect(analyticsSource).not.toContain('initializeApp');
  });

  it('does not add measurement ids, custom events, user ids, or personal data', () => {
    const analyticsImplementation = `${appEntry}\n${appConfig}\n${analyticsSource}`;

    expect(analyticsImplementation).not.toMatch(/G-[A-Z0-9]+/);
    expect(analyticsImplementation).not.toContain('logEvent');
    expect(analyticsImplementation).not.toContain('setUserId');
    expect(analyticsImplementation).not.toMatch(/email|phone|campusName|authorization|fcmToken/i);
  });
});
