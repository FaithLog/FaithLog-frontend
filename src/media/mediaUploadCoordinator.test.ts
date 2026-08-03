import {describe, expect, it, vi} from 'vitest';

import {runMediaUpload} from './mediaUploadCoordinator';

describe('media upload coordinator', () => {
  it('reserves, directly uploads with required headers, and finalizes exactly once', async () => {
    const reserve = vi.fn(async () => ({
      assetId: 91,
      uploadUrl: 'https://r2.example.test/upload',
      requiredHeaders: {'Content-Type': 'image/jpeg', 'x-checksum': 'abc'},
      expiresAt: '2026-08-03T15:10:00Z',
    }));
    const upload = vi.fn(async ({onProgress}: {onProgress: (progress: number) => void}) => {
      onProgress(0.5);
      onProgress(1);
    });
    const complete = vi.fn(async () => ({
      assetId: 91,
      status: 'READY' as const,
      sha256: 'a'.repeat(64),
      byteSize: 1024,
      width: 1200,
      height: 900,
    }));
    const onProgress = vi.fn();

    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: {
        localId: 'local-1',
        uri: 'file:///normalized.jpg',
        contentType: 'image/jpeg',
        byteSize: 1024,
        width: 1200,
        height: 900,
        sha256: 'a'.repeat(64),
        exifRemoved: true,
        orientationCorrected: true,
      },
      api: {reserve, complete, getAccessUrls: vi.fn()},
      transport: {upload},
      onProgress,
    })).resolves.toMatchObject({assetId: 91, status: 'READY'});

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'file:///normalized.jpg',
      uploadUrl: 'https://r2.example.test/upload',
      headers: {'Content-Type': 'image/jpeg', 'x-checksum': 'abc'},
    }));
    expect(complete).toHaveBeenCalledWith('access', 1, 91);
    expect(onProgress.mock.calls.map(([value]) => value)).toEqual([0, 0.5, 1]);
  });

  it('does not finalize when direct upload fails or is canceled', async () => {
    const complete = vi.fn();
    const api = {
      reserve: vi.fn(async () => ({
        assetId: 91,
        uploadUrl: 'https://r2.example.test/upload',
        requiredHeaders: {},
        expiresAt: '2026-08-03T15:10:00Z',
      })),
      complete,
      getAccessUrls: vi.fn(),
    };
    const controller = new AbortController();
    controller.abort();
    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: {
        localId: 'local-1', uri: 'file:///normalized.jpg', contentType: 'image/jpeg',
        byteSize: 1024, width: 1200, height: 900, sha256: 'a'.repeat(64),
        exifRemoved: true, orientationCorrected: true,
      },
      api,
      transport: {upload: vi.fn()},
      signal: controller.signal,
    })).rejects.toMatchObject({detail: {code: 'MEDIA_UPLOAD_CANCELED'}});
    expect(complete).not.toHaveBeenCalled();
  });
});
