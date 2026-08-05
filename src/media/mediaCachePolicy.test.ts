import {describe, expect, it} from 'vitest';

import {
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_TTL_MS,
  buildMediaCacheKey,
  selectMediaCacheEntriesToDelete,
} from './mediaCachePolicy';

describe('media local cache policy', () => {
  it('uses a stable asset/hash/variant key independent of signed URL rotation', () => {
    expect(buildMediaCacheKey({assetId: 3, sha256: 'a'.repeat(64), variant: 'detail'})).toBe(
      `3-${'a'.repeat(64)}-detail`,
    );
  });

  it('uses the same 200MB cache budget for PDF documents', () => {
    expect(buildMediaCacheKey({assetId: 31, sha256: 'b'.repeat(64), variant: 'document'})).toBe(
      `31-${'b'.repeat(64)}-document`,
    );
  });

  it('deletes entries older than seven days and then evicts least recently used over 200MB', () => {
    const now = Date.parse('2026-08-03T00:00:00Z');
    const expired = {key: 'expired', byteSize: 1, lastAccessedAt: now - MEDIA_CACHE_TTL_MS - 1};
    const old = {key: 'old', byteSize: 120 * 1024 * 1024, lastAccessedAt: now - 1_000};
    const fresh = {key: 'fresh', byteSize: 100 * 1024 * 1024, lastAccessedAt: now - 100};

    expect(selectMediaCacheEntriesToDelete([fresh, expired, old], now)).toEqual(['expired', 'old']);
    expect(MEDIA_CACHE_MAX_BYTES).toBe(200 * 1024 * 1024);
  });
});
