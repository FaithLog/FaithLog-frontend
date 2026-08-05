import {describe, expect, it, vi} from 'vitest';

import {openWeeklyMaterialDocument} from './weeklyMaterialDocument';

const material = {
  materialType: 'SHARING_SHEET' as const,
  mediaAssetId: 41,
  fileName: '나눔지.pdf',
  byteSize: 4096,
  sha256: 'b'.repeat(64),
  updatedAt: '2026-08-03T01:00:00Z',
  uploadedByName: '관리자',
};

describe('openWeeklyMaterialDocument', () => {
  it('requests a short-lived URL only on open and uses the stable document cache key', async () => {
    const getAccessUrls = vi.fn(async () => [{
      assetId: 41,
      assetKind: 'PDF' as const,
      contentType: 'application/pdf' as const,
      fileName: '나눔지.pdf',
      sha256: 'b'.repeat(64),
      byteSize: 4096,
      thumbnailUrl: null,
      detailUrl: null,
      downloadUrl: 'https://signed.example/document',
      expiresAt: '2026-08-03T02:00:00Z',
    }]);
    const open = vi.fn();
    const cache = {
      download: vi.fn(async () => 'file:///cache/41-document.pdf'),
      exists: vi.fn(async () => false),
      resolveUri: vi.fn(() => 'file:///cache/existing.pdf'),
      touch: vi.fn(async () => undefined),
    };

    await openWeeklyMaterialDocument({
      accessToken: 'access',
      api: {getAccessUrls} as never,
      cache,
      campusId: 7,
      material,
      open,
    });

    expect(getAccessUrls).toHaveBeenCalledWith('access', 7, [41]);
    expect(cache.download).toHaveBeenCalledWith({
      cacheKey: `41-${'b'.repeat(64)}-document`,
      signedUrl: 'https://signed.example/document',
    });
    expect(open).toHaveBeenCalledWith('file:///cache/41-document.pdf');
  });

  it('fails closed when the access response does not match the metadata', async () => {
    const getAccessUrls = vi.fn(async () => [{
      assetId: 41,
      sha256: 'c'.repeat(64),
      downloadUrl: 'https://signed.example/document',
    }]);
    const open = vi.fn();
    await expect(openWeeklyMaterialDocument({
      accessToken: 'access',
      api: {getAccessUrls} as never,
      cache: {} as never,
      campusId: 7,
      material,
      open,
    })).rejects.toThrow('metadata');
    expect(open).not.toHaveBeenCalled();
  });
});
