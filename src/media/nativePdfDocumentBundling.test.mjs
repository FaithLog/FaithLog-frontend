import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

describe('native PDF document bundling', () => {
  it('bundles the native picker instead of downloading a split module after the tap', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./nativePdfDocumentDependencies.native.ts', import.meta.url)),
      'utf8',
    );

    expect(source).toContain("from 'expo-document-picker'");
    expect(source).not.toContain("import('expo-document-picker')");
  });
});
