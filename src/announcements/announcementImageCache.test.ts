import {describe, expect, it} from 'vitest';

import {buildImageCacheKey, planImageCacheCleanup} from './announcementImageCache';

describe('announcement image cache policy', () => {
  it('uses asset, immutable hash, and variant instead of signed urls', () => {
    expect(buildImageCacheKey({assetId: 9, sha256: 'a'.repeat(64), variant: 'thumbnail'})).toBe(`9-${'a'.repeat(64)}-thumbnail`);
  });

  it('expires entries after seven days and then applies a 200MB LRU bound', () => {
    const now = Date.parse('2026-08-10T00:00:00Z');
    const result = planImageCacheCleanup([
      entry('expired', 10, now - 8 * day),
      entry('old', 120, now - 3 * day),
      entry('new', 100, now - day),
    ], now);
    expect(result.deleteKeys).toEqual(['expired', 'old']);
    expect(result.keepKeys).toEqual(['new']);
  });
});

const day = 24 * 60 * 60 * 1000;
function entry(key: string, megabytes: number, lastAccessedAt: number) {
  return {key, lastAccessedAt, sizeBytes: megabytes * 1024 * 1024};
}
