import {describe, expect, it, vi} from 'vitest';

import {openAnnouncementDocument} from './announcementDocumentOpen';

describe('announcement PDF open flow', () => {
  it('resolves the authorized access URL, caches by asset/hash, and opens the local PDF', async () => {
    const api = {
      getAccessUrls: vi.fn(async () => [{
        assetId: 31,
        assetKind: 'PDF' as const,
        byteSize: 128,
        contentType: 'application/pdf' as const,
        detailUrl: null,
        downloadUrl: 'https://signed.example/announcement.pdf',
        expiresAt: '2026-08-05T13:00:00Z',
        fileName: '공지.pdf',
        sha256: 'a'.repeat(64),
        thumbnailUrl: null,
      }]),
    };
    const cache = {
      download: vi.fn(async () => 'file:///cache/announcement.pdf'),
      exists: vi.fn(async () => false),
      resolveUri: vi.fn(() => 'file:///cache/announcement.pdf'),
      touch: vi.fn(async () => undefined),
    };
    const open = vi.fn(async () => undefined);

    await openAnnouncementDocument({
      accessToken: 'access-token',
      api,
      assetId: 31,
      cache,
      campusId: 1,
      open,
    });

    expect(api.getAccessUrls).toHaveBeenCalledWith('access-token', 1, [31]);
    expect(cache.download).toHaveBeenCalledWith({
      cacheKey: `31-${'a'.repeat(64)}-document`,
      signedUrl: 'https://signed.example/announcement.pdf',
    });
    expect(open).toHaveBeenCalledWith('file:///cache/announcement.pdf');
  });

  it('does not open a mismatched access response', async () => {
    const open = vi.fn();
    await expect(openAnnouncementDocument({
      accessToken: 'access-token',
      api: {getAccessUrls: vi.fn(async () => [])},
      assetId: 31,
      cache: {
        download: vi.fn(),
        exists: vi.fn(),
        resolveUri: vi.fn(),
        touch: vi.fn(),
      },
      campusId: 1,
      open,
    })).rejects.toThrow('metadata mismatch');
    expect(open).not.toHaveBeenCalled();
  });
});
