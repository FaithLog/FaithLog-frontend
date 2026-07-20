import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const source = fs.readFileSync(
  path.join(import.meta.dirname, 'FaithLogApp.tsx'),
  'utf8',
);

describe('session check launch branding', () => {
  it('uses the FaithLog app logo instead of the temporary F monogram', () => {
    const launchScreen = source.slice(
      source.indexOf('function LaunchAuthCheckScreen'),
      source.indexOf('function SessionExpiredScreen'),
    );

    expect(launchScreen).toContain("require('../../assets/icon.png')");
    expect(launchScreen).toContain('accessibilityLabel="FaithLog 앱 로고"');
    expect(launchScreen).not.toContain('>F</Text>');
  });
});
