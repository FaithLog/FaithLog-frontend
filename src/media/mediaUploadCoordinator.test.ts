import {describe, expect, it, vi} from 'vitest';

import {FaithLogApiError} from '../api/apiError';
import {
  resumeMediaUploadCompletion,
  runMediaUpload,
  type UploadedMediaReservation,
} from './mediaUploadCoordinator';

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

  it('polls PROCESSING completion until READY without uploading the binary again', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({assetId: 91, status: 'PROCESSING', retryAfterMs: 0})
      .mockResolvedValueOnce({
        assetId: 91,
        status: 'READY',
        sha256: 'a'.repeat(64),
        byteSize: 900,
        width: 800,
        height: 600,
      });
    const upload = vi.fn(async () => undefined);
    const waitForRetry = vi.fn(async () => undefined);

    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api: {
        reserve: vi.fn(async () => reservation()),
        complete,
        getAccessUrls: vi.fn(),
      },
      transport: {upload},
      completeRetry: {maxAttempts: 3, wait: waitForRetry},
    })).resolves.toMatchObject({assetId: 91, status: 'READY', sha256: 'a'.repeat(64)});

    expect(upload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(waitForRetry).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable complete conflict and preserves the successful upload', async () => {
    const complete = vi.fn()
      .mockRejectedValueOnce(new FaithLogApiError({
        kind: 'conflict',
        status: 409,
        code: 'MEDIA_ASSET_PROCESSING',
        message: '처리 중입니다.',
      }))
      .mockResolvedValueOnce({
        assetId: 91,
        status: 'READY',
        sha256: 'a'.repeat(64),
        byteSize: 900,
        width: 800,
        height: 600,
      });
    const upload = vi.fn(async () => undefined);

    await runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api: {reserve: vi.fn(async () => reservation()), complete, getAccessUrls: vi.fn()},
      transport: {upload},
      completeRetry: {maxAttempts: 3, wait: vi.fn(async () => undefined)},
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('rejects READY when completion metadata does not match the uploaded image', async () => {
    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api: {
        reserve: vi.fn(async () => reservation()),
        complete: vi.fn(async () => ({
          assetId: 91,
          status: 'READY' as const,
          sha256: 'b'.repeat(64),
          byteSize: 900,
          width: 800,
          height: 600,
        })),
        getAccessUrls: vi.fn(),
      },
      transport: {upload: vi.fn(async () => undefined)},
    })).rejects.toMatchObject({detail: {code: 'INVALID_SERVER_RESPONSE'}});
  });

  it('accepts equivalent READY sha256 metadata regardless of hex casing', async () => {
    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api: {
        reserve: vi.fn(async () => reservation()),
        complete: vi.fn(async () => ({
          assetId: 91,
          status: 'READY' as const,
          sha256: 'A'.repeat(64),
          byteSize: 900,
          width: 800,
          height: 600,
        })),
        getAccessUrls: vi.fn(),
      },
      transport: {upload: vi.fn(async () => undefined)},
    })).resolves.toMatchObject({assetId: 91, status: 'READY'});
  });

  it('returns a retryable pending error after bounded PROCESSING attempts', async () => {
    const complete = vi.fn(async () => ({
      assetId: 91,
      status: 'PROCESSING' as const,
      retryAfterMs: 0,
    }));

    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api: {reserve: vi.fn(async () => reservation()), complete, getAccessUrls: vi.fn()},
      transport: {upload: vi.fn(async () => undefined)},
      completeRetry: {maxAttempts: 2, wait: vi.fn(async () => undefined)},
    })).rejects.toMatchObject({
      detail: {kind: 'conflict', code: 'MEDIA_COMPLETE_PROCESSING'},
    });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('resumes completion after bounded PROCESSING without reserving or uploading again', async () => {
    const reserve = vi.fn(async () => reservation());
    const upload = vi.fn(async () => undefined);
    const complete = vi.fn()
      .mockResolvedValueOnce({assetId: 91, status: 'PROCESSING', retryAfterMs: 0});
    let uploaded: UploadedMediaReservation | undefined;
    const api = {reserve, complete, getAccessUrls: vi.fn()};

    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api,
      transport: {upload},
      completeRetry: {maxAttempts: 1, wait: vi.fn(async () => undefined)},
      onUploaded: (reservation) => {
        uploaded = reservation;
      },
    })).rejects.toMatchObject({detail: {code: 'MEDIA_COMPLETE_PROCESSING'}});

    expect(uploaded).toEqual({assetId: 91, campusId: 1, sha256: 'a'.repeat(64)});
    if (!uploaded) throw new Error('uploaded reservation was not captured');
    complete.mockResolvedValueOnce({
      assetId: 91,
      status: 'READY',
      sha256: 'a'.repeat(64),
      byteSize: 900,
      width: 800,
      height: 600,
    });

    await expect(resumeMediaUploadCompletion({
      accessToken: 'access',
      api,
      uploaded,
      completeRetry: {maxAttempts: 1, wait: vi.fn(async () => undefined)},
    })).resolves.toMatchObject({assetId: 91, status: 'READY'});

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('exposes a campus-bound uploaded identity before honoring cancellation after upload', async () => {
    const controller = new AbortController();
    const complete = vi.fn();
    const onUploaded = vi.fn();

    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api: {
        reserve: vi.fn(async () => reservation()),
        complete,
        getAccessUrls: vi.fn(),
      },
      transport: {
        upload: vi.fn(async () => {
          controller.abort();
        }),
      },
      signal: controller.signal,
      onUploaded,
    })).rejects.toMatchObject({detail: {code: 'MEDIA_UPLOAD_CANCELED'}});

    expect(onUploaded).toHaveBeenCalledWith({
      assetId: 91,
      campusId: 1,
      sha256: 'a'.repeat(64),
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('stops completion polling when canceled between attempts', async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => ({
      assetId: 91,
      status: 'PROCESSING' as const,
      retryAfterMs: 0,
    }));

    await expect(runMediaUpload({
      accessToken: 'access',
      campusId: 1,
      image: normalizedImage(),
      api: {reserve: vi.fn(async () => reservation()), complete, getAccessUrls: vi.fn()},
      transport: {upload: vi.fn(async () => undefined)},
      signal: controller.signal,
      completeRetry: {
        maxAttempts: 3,
        wait: vi.fn(async () => controller.abort()),
      },
    })).rejects.toMatchObject({detail: {code: 'MEDIA_UPLOAD_CANCELED'}});
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

function reservation() {
  return {
    assetId: 91,
    uploadUrl: 'https://r2.example.test/upload',
    requiredHeaders: {},
    expiresAt: '2026-08-03T15:10:00Z',
  };
}

function normalizedImage() {
  return {
    localId: 'local-1',
    uri: 'file:///normalized.jpg',
    contentType: 'image/jpeg' as const,
    byteSize: 1024,
    width: 1200,
    height: 900,
    sha256: 'a'.repeat(64),
    exifRemoved: true as const,
    orientationCorrected: true as const,
  };
}
