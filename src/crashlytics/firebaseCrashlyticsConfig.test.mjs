import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const appEntry = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const firebaseJson = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const crashlyticsSource = fs.readFileSync(
  path.join(root, 'src/crashlytics/nativeFirebaseCrashlytics.ts'),
  'utf8',
);

describe('Firebase Crashlytics native configuration', () => {
  it('uses the matching React Native Firebase package and Expo config plugin', () => {
    expect(packageJson.dependencies['@react-native-firebase/crashlytics']).toBe('25.1.0');
    expect(appConfig).toContain("'@react-native-firebase/crashlytics'");
  });

  it('starts disabled natively and lets production JS opt in on the default app', () => {
    expect(firebaseJson['react-native'].crashlytics_auto_collection_enabled).toBe(false);
    expect(firebaseJson['react-native'].crashlytics_debug_enabled).toBe(false);
    expect(
      firebaseJson['react-native'].crashlytics_is_error_generation_on_js_crash_enabled,
    ).toBe(true);
    expect(
      firebaseJson['react-native'].crashlytics_javascript_exception_handler_chaining_enabled,
    ).toBe(false);
    expect(appEntry).toContain('initializeNativeFirebaseCrashlytics');
    expect(crashlyticsSource).toContain('getCrashlytics()');
    expect(crashlyticsSource).not.toContain('initializeApp');
  });

  it('does not attach identities, custom attributes, logs, or raw errors', () => {
    const implementation = `${appEntry}\n${appConfig}\n${crashlyticsSource}`;

    expect(implementation).not.toContain('setUserId');
    expect(implementation).not.toContain('setAttribute');
    expect(implementation).not.toContain('setAttributes');
    expect(implementation).not.toContain('recordError');
    expect(implementation).not.toMatch(/\.log\s*\(/);
    expect(implementation).not.toMatch(/email|campusId|userId|authorization|fcmToken|jwt/i);
  });
});
