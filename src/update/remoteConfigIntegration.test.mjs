import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Remote Config force-update integration', () => {
  it('keeps native dependencies and config plugins aligned', () => {
    const packageJson = JSON.parse(read('package.json'));
    const appConfig = read('app.config.js');

    expect(packageJson.dependencies['expo-application']).toBe('~56.0.3');
    expect(packageJson.dependencies['@react-native-firebase/remote-config']).toBe('^25.1.0');
    expect(appConfig).toContain("'@react-native-firebase/app'");
    expect(appConfig).toContain("'@react-native-firebase/analytics'");
    expect(appConfig).toContain("'@react-native-firebase/messaging'");
  });

  it('places the update gate outside auth and navigation bootstrap', () => {
    const app = read('App.tsx');
    expect(app).toContain('<AppUpdateGate>');
    expect(app).toContain('<FaithLogApp />');
    expect(app.indexOf('<AppUpdateGate>')).toBeLessThan(app.indexOf('<FaithLogApp />'));
  });

  it('does not hardcode the next EAS build numbers in production update code', () => {
    const production = [
      'src/update/updatePolicy.ts',
      'src/update/updateConfig.ts',
      'src/update/updateGateCoordinator.ts',
      'src/update/nativeRemoteUpdateConfig.ts',
      'src/update/AppUpdateGate.tsx',
    ].map(read).join('\n');

    expect(production).not.toMatch(/nativeBuildVersion\s*[?:=].*['"](?:36|14)['"]/);
    expect(production).not.toContain('console.log');
    expect(production).not.toContain('console.error');
    expect(production).not.toContain('console.warn');
  });
});
