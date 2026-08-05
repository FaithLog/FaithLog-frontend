import {describe, expect, it} from 'vitest';

import {
  buildImageCacheKey,
  planImageCacheCleanup,
  planImageCacheNamespaceCleanup,
} from './announcementImageCache';

describe('announcement image cache policy', () => {
  it('uses asset, immutable hash, and variant instead of signed urls', () => {
    expect(buildImageCacheKey({
      assetId: 9,
      namespace: 'account-42',
      sha256: 'a'.repeat(64),
      variant: 'thumbnail',
    })).toBe(`announcement-images/v1/account-42/9/${'a'.repeat(64)}/thumbnail`);
  });

  it('expires entries after seven days and applies the image half of the shared cache budget', () => {
    const now = Date.parse('2026-08-10T00:00:00Z');
    const result = planImageCacheCleanup([
      entry('expired', 10, now - 8 * day),
      entry('old', 60, now - 3 * day),
      entry('new', 50, now - day),
    ], now);
    expect(result.deleteKeys).toEqual(['expired', 'old']);
    expect(result.keepKeys).toEqual(['new']);
  });

  it('deletes only the signed-in namespace during logout cleanup', () => {
    const entries = [
      entry('account-42-thumbnail', 1, 1, 'account-42'),
      entry('account-42-detail', 1, 2, 'account-42'),
      entry('account-99-thumbnail', 1, 3, 'account-99'),
    ];

    expect(planImageCacheNamespaceCleanup(entries, 'account-42')).toEqual({
      deleteKeys: ['account-42-thumbnail', 'account-42-detail'],
      keepKeys: ['account-99-thumbnail'],
    });
  });

  it('fails closed on invalid byte metadata without poisoning the LRU total', () => {
    const now = Date.parse('2026-08-10T00:00:00Z');
    const result = planImageCacheCleanup([
      entry('nan', Number.NaN, now - day),
      entry('fraction', 0.5 / (1024 * 1024), now - day),
      entry('valid', 1, now - day),
    ], now);

    expect(result.deleteKeys).toEqual(['nan', 'fraction']);
    expect(result.keepKeys).toEqual(['valid']);
  });
});

const day = 24 * 60 * 60 * 1000;
function entry(key: string, megabytes: number, lastAccessedAt: number, namespace = 'account-42') {
  return {key, lastAccessedAt, namespace, sizeBytes: megabytes * 1024 * 1024};
}
