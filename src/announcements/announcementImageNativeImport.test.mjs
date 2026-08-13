import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const nativeSource = readFileSync(
  new URL('./announcementImageFileSystem.native.ts', import.meta.url),
  'utf8',
);
const adapterSource = readFileSync(new URL('./announcementImageCacheAdapter.ts', import.meta.url), 'utf8');

describe('announcement image native file-system boundary', () => {
  it('loads expo-file-system synchronously before signed-out cache cleanup runs', () => {
    expect(nativeSource).toContain("import {Directory, File, Paths} from 'expo-file-system';");
    expect(nativeSource).not.toContain("await import('expo-file-system')");
    expect(adapterSource).toContain("from './announcementImageFileSystem'");
  });
});
