import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const source = fs.readFileSync(
  path.join(import.meta.dirname, 'FaithLogApp.tsx'),
  'utf8',
);

function readPngDimensions(assetName) {
  const bytes = fs.readFileSync(path.join(import.meta.dirname, '../../assets', assetName));

  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');

  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}

describe('session check launch branding', () => {
  it('uses the FaithLog app logo instead of the temporary F monogram', () => {
    const launchScreen = source.slice(
      source.indexOf('function LaunchAuthCheckScreen'),
      source.indexOf('function SessionExpiredScreen'),
    );

    expect(launchScreen).toContain("require('../../assets/launch-logo.png')");
    expect(launchScreen).toContain('resizeMode="cover"');
    expect(launchScreen).not.toContain("require('../../assets/icon-ios.png')");
    expect(launchScreen).not.toContain("require('../../assets/icon.png')");
    expect(launchScreen).toContain('accessibilityLabel="FaithLog 앱 로고"');
    expect(launchScreen).not.toContain('>F</Text>');
  });

  it('ships density-specific runtime bitmaps instead of decoding the 1024px store icon', () => {
    expect(readPngDimensions('launch-logo.png')).toEqual({height: 112, width: 112});
    expect(readPngDimensions('launch-logo@2x.png')).toEqual({height: 224, width: 224});
    expect(readPngDimensions('launch-logo@3x.png')).toEqual({height: 336, width: 336});
  });
});
