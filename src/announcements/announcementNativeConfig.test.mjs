import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const appConfig = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const easConfig = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const environmentExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('announcement native media configuration', () => {
  it('pins Expo SDK-compatible media modules and requests photo-library access only', () => {
    expect(packageJson.dependencies['expo-crypto']).toBe('~56.0.4');
    expect(packageJson.dependencies['expo-image-manipulator']).toBe('~56.0.23');
    expect(packageJson.dependencies['expo-image-picker']).toBe('~56.0.22');
    expect(appConfig).toContain("'expo-image-picker'");
    expect(appConfig).toMatch(/cameraPermission:\s*false/);
    expect(appConfig).toMatch(/microphonePermission:\s*false/);
    expect(appConfig).toContain('photosPermission');
  });

  it('enables the confirmed announcement contract in every native build profile', () => {
    expect(environmentExample).toContain('EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED=true');
    expect(easConfig.build.development.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED).toBe('true');
    expect(easConfig.build.preview.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED).toBe('true');
    expect(easConfig.build.production.env.EXPO_PUBLIC_ANNOUNCEMENTS_ENABLED).toBe('true');
  });
});
