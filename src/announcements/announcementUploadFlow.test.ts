import {describe, expect, it, vi} from 'vitest';

import {
  MediaAssetCompletionRejectedError,
  MediaAssetProcessingError,
  MediaBinaryUploadHttpError,
  MediaBinaryUploadUncertainError,
  retryAnnouncementImageUpload,
  resumeAnnouncementImageCompletion,
  uploadAnnouncementImage,
} from './announcementUploadFlow';
import {FaithLogApiError} from '../api/apiError';

describe('announcement upload orchestration', () => {
  it('reserves, uploads with required headers, reports progress, and finalizes', async () => {
    const progress = vi.fn();
    const api = {
      reserveMediaUpload: vi.fn(async () => ({assetId: 5, uploadUrl: 'https://upload.example/5', requiredHeaders: {'Content-Type': 'image/jpeg'}, expiresAt: '2026-08-03T10:00:00Z'})),
      completeMediaUpload: vi.fn(async () => ({assetId: 5, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64), status: 'READY' as const})),
    };
    const uploader = vi.fn(async (_request, onProgress: (value: number) => void) => { onProgress(0.5); onProgress(1); });
    const result = await uploadAnnouncementImage({api, campusId: 1, file: {byteSize: 10, contentType: 'image/jpeg', localUri: 'file:///safe-local-image.jpg', sha256: 'a'.repeat(64)}, onProgress: progress, token: 'token', uploader});
    expect(result.assetId).toBe(5);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([0, 0.5, 0.99, 1]);
    expect(uploader).toHaveBeenCalledWith(expect.objectContaining({headers: {'Content-Type': 'image/jpeg'}, uploadUrl: 'https://upload.example/5'}), expect.any(Function), undefined);
    expect(api.completeMediaUpload).toHaveBeenCalledWith('token', 1, {
      assetId: 5,
      byteSize: 10,
      contentType: 'image/jpeg',
      sha256: 'a'.repeat(64),
    });
  });

  it('polls a bounded number of times while completion is PROCESSING', async () => {
    const identity = {assetId: 5, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const api = {
      reserveMediaUpload: vi.fn(async () => ({assetId: 5, uploadUrl: 'https://upload.example/5', requiredHeaders: {'Content-Type': 'image/jpeg'}, expiresAt: '2026-08-03T10:00:00Z'})),
      completeMediaUpload: vi.fn()
        .mockResolvedValueOnce({...identity, status: 'PROCESSING' as const})
        .mockResolvedValueOnce({...identity, status: 'PROCESSING' as const})
        .mockResolvedValueOnce({...identity, status: 'READY' as const}),
    };
    const wait = vi.fn(async () => undefined);
    const progress = vi.fn();

    await expect(uploadAnnouncementImage({
      api,
      campusId: 1,
      completionPolling: {intervalMs: 25, maxAttempts: 3, wait},
      file: {...identity, localUri: 'file:///safe.jpg'},
      onProgress: progress,
      token: 'token',
      uploader: vi.fn(async () => undefined),
    })).resolves.toMatchObject({status: 'READY'});
    expect(api.completeMediaUpload).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenNthCalledWith(1, 25, undefined);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([0, 1]);
  });

  it('returns a retryable media-processing error when bounded polling is exhausted', async () => {
    const identity = {assetId: 5, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const progress = vi.fn();
    const api = {
      reserveMediaUpload: vi.fn(async () => ({assetId: 5, uploadUrl: 'https://upload.example/5', requiredHeaders: {'Content-Type': 'image/jpeg'}, expiresAt: '2026-08-03T10:00:00Z'})),
      completeMediaUpload: vi.fn(async () => ({...identity, status: 'PROCESSING' as const})),
    };

    let processingError: MediaAssetProcessingError | null = null;
    try {
      await uploadAnnouncementImage({
        api,
        campusId: 1,
        completionPolling: {intervalMs: 0, maxAttempts: 2, wait: vi.fn(async () => undefined)},
        file: {...identity, localUri: 'file:///safe.jpg'},
        onProgress: progress,
        token: 'token',
        uploader: vi.fn(async () => undefined),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MediaAssetProcessingError);
      processingError = error as MediaAssetProcessingError;
    }

    expect(processingError?.identity).toEqual(identity);
    expect(api.completeMediaUpload).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([0]);

    const resumeApi = {
      ...api,
      completeMediaUpload: vi.fn(async () => ({...identity, status: 'READY' as const})),
    };
    await expect(resumeAnnouncementImageCompletion({
      api: resumeApi,
      campusId: 1,
      completionPolling: {intervalMs: 0, maxAttempts: 1},
      identity: processingError!.identity,
      token: 'token',
    })).resolves.toMatchObject({assetId: 5, status: 'READY'});
    expect(api.reserveMediaUpload).toHaveBeenCalledTimes(1);
    expect(api.completeMediaUpload).toHaveBeenCalledTimes(2);
    expect(resumeApi.completeMediaUpload).toHaveBeenCalledTimes(1);
  });

  it('preserves the reservation identity when a completion response has an unknown outcome', async () => {
    const identity = {
      assetId: 5,
      byteSize: 10,
      contentType: 'image/jpeg' as const,
      sha256: 'a'.repeat(64),
    };
    const api = {
      reserveMediaUpload: vi.fn(async () => ({
        assetId: identity.assetId,
        expiresAt: '2026-08-03T10:00:00Z',
        requiredHeaders: {'Content-Type': 'image/jpeg'},
        uploadUrl: 'https://upload.example/5',
      })),
      completeMediaUpload: vi.fn()
        .mockRejectedValueOnce(new Error('completion response lost'))
        .mockResolvedValueOnce({...identity, status: 'READY' as const}),
    };
    const uploader = vi.fn(async () => undefined);
    let completionError: MediaAssetProcessingError | null = null;

    try {
      await uploadAnnouncementImage({
        api,
        campusId: 1,
        completionPolling: {intervalMs: 0, maxAttempts: 1},
        file: {...identity, localUri: 'file:///safe.jpg'},
        onProgress: vi.fn(),
        token: 'token',
        uploader,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MediaAssetProcessingError);
      completionError = error as MediaAssetProcessingError;
    }

    await expect(resumeAnnouncementImageCompletion({
      api,
      campusId: 1,
      completionPolling: {intervalMs: 0, maxAttempts: 1},
      identity: completionError!.identity,
      token: 'token',
    })).resolves.toMatchObject({assetId: identity.assetId, status: 'READY'});
    expect(completionError?.identity).toEqual(identity);
    expect(api.reserveMediaUpload).toHaveBeenCalledTimes(1);
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(api.completeMediaUpload).toHaveBeenCalledTimes(2);
    expect(api.completeMediaUpload).toHaveBeenLastCalledWith('token', 1, identity);
  });

  it('retries an ambiguous signed PUT with the same reservation before completing', async () => {
    const file = {
      byteSize: 10,
      contentType: 'image/jpeg' as const,
      localUri: 'file:///safe.jpg',
      sha256: 'a'.repeat(64),
    };
    const reservation = {
      assetId: 5,
      expiresAt: '2026-08-03T10:00:00Z',
      requiredHeaders: {'Content-Type': 'image/jpeg', 'x-upload-token': 'signed'},
      uploadUrl: 'https://upload.example/5',
    };
    const identity = {
      assetId: reservation.assetId,
      byteSize: file.byteSize,
      contentType: file.contentType,
      sha256: file.sha256,
    };
    const api = {
      reserveMediaUpload: vi.fn(async () => reservation),
      completeMediaUpload: vi.fn(async () => ({...identity, status: 'READY' as const})),
    };
    const uploader = vi.fn()
      .mockRejectedValueOnce(new Error('PUT response lost'))
      .mockResolvedValueOnce(undefined);
    let uncertainError: MediaBinaryUploadUncertainError | null = null;

    try {
      await uploadAnnouncementImage({
        api,
        campusId: 1,
        file,
        onProgress: vi.fn(),
        token: 'token',
        uploader,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MediaBinaryUploadUncertainError);
      uncertainError = error as MediaBinaryUploadUncertainError;
    }

    expect(uncertainError?.context).toEqual({file, identity, reservation});
    await expect(retryAnnouncementImageUpload({
      api,
      campusId: 1,
      context: uncertainError!.context,
      onProgress: vi.fn(),
      token: 'token',
      uploader,
    })).resolves.toMatchObject({assetId: identity.assetId, status: 'READY'});

    expect(api.reserveMediaUpload).toHaveBeenCalledTimes(1);
    expect(uploader).toHaveBeenCalledTimes(2);
    expect(uploader.mock.calls[1]?.[0]).toEqual({
      headers: reservation.requiredHeaders,
      localUri: file.localUri,
      uploadUrl: reservation.uploadUrl,
    });
    expect(api.completeMediaUpload).toHaveBeenCalledWith('token', 1, identity);
  });

  it('does not relabel a known signed-endpoint HTTP rejection as an ambiguous PUT', async () => {
    const api = {
      reserveMediaUpload: vi.fn(async () => ({
        assetId: 5,
        expiresAt: '2026-08-03T10:00:00Z',
        requiredHeaders: {'Content-Type': 'image/jpeg'},
        uploadUrl: 'https://upload.example/5',
      })),
      completeMediaUpload: vi.fn(),
    };

    const upload = uploadAnnouncementImage({
      api,
      campusId: 1,
      file: {
        byteSize: 10,
        contentType: 'image/jpeg',
        localUri: 'file:///safe.jpg',
        sha256: 'a'.repeat(64),
      },
      onProgress: vi.fn(),
      token: 'token',
      uploader: vi.fn().mockRejectedValue(new MediaBinaryUploadHttpError(403)),
    });

    await expect(upload).rejects.toBeInstanceOf(MediaBinaryUploadHttpError);
    await expect(upload).rejects.not.toBeInstanceOf(MediaBinaryUploadUncertainError);
    expect(api.completeMediaUpload).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', {kind: 'conflict' as const, message: 'identity conflict', status: 409}],
    ['permission', {kind: 'permissionDenied' as const, message: 'forbidden', status: 403}],
    ['session', {kind: 'sessionExpired' as const, message: 'expired', status: 401}],
  ])('preserves authoritative %s completion failure without misreporting PROCESSING', async (_label, detail) => {
    const identity = {assetId: 5, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const api = {
      reserveMediaUpload: vi.fn(async () => ({assetId: 5, expiresAt: '', requiredHeaders: {}, uploadUrl: 'https://upload.example/5'})),
      completeMediaUpload: vi.fn().mockRejectedValue(new FaithLogApiError(detail)),
    };

    const completion = uploadAnnouncementImage({
      api,
      campusId: 1,
      completionPolling: {maxAttempts: 1},
      file: {...identity, localUri: 'file:///safe.jpg'},
      onProgress: vi.fn(),
      token: 'token',
      uploader: vi.fn(async () => undefined),
    });

    await expect(completion).rejects.toBeInstanceOf(MediaAssetCompletionRejectedError);
    await expect(completion).rejects.not.toBeInstanceOf(MediaAssetProcessingError);
  });

  it('maps completion rate limiting to identity-preserving retry guidance', async () => {
    const identity = {assetId: 5, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const api = {
      reserveMediaUpload: vi.fn(),
      completeMediaUpload: vi.fn().mockRejectedValue(new FaithLogApiError({
        kind: 'error',
        message: 'slow down',
        status: 429,
      })),
    };

    await expect(resumeAnnouncementImageCompletion({
      api,
      campusId: 1,
      completionPolling: {maxAttempts: 1},
      identity,
      token: 'token',
    })).rejects.toMatchObject({
      identity,
      name: 'MediaAssetProcessingError',
      reason: 'rateLimited',
    });
  });

  it('fails closed without an approved native binary uploader', async () => {
    await expect(uploadAnnouncementImage({api: {reserveMediaUpload: vi.fn(), completeMediaUpload: vi.fn()}, campusId: 1, file: {byteSize: 10, contentType: 'image/jpeg', localUri: 'file:///safe.jpg', sha256: 'a'.repeat(64)}, onProgress: vi.fn(), token: 'token'})).rejects.toMatchObject({code: 'MEDIA_NATIVE_UPLOADER_UNAVAILABLE'});
  });

  it('does not reserve or complete after cancellation reaches a side-effect boundary', async () => {
    const identity = {assetId: 5, byteSize: 10, contentType: 'image/jpeg' as const, sha256: 'a'.repeat(64)};
    const beforeReserve = new AbortController();
    beforeReserve.abort(new Error('removed'));
    const firstApi = {
      reserveMediaUpload: vi.fn(),
      completeMediaUpload: vi.fn(),
    };
    await expect(uploadAnnouncementImage({
      api: firstApi,
      campusId: 1,
      file: {...identity, localUri: 'file:///safe.jpg'},
      onProgress: vi.fn(),
      signal: beforeReserve.signal,
      token: 'token',
      uploader: vi.fn(),
    })).rejects.toThrow('removed');
    expect(firstApi.reserveMediaUpload).not.toHaveBeenCalled();

    const afterUpload = new AbortController();
    const secondApi = {
      reserveMediaUpload: vi.fn(async () => ({
        assetId: 5,
        expiresAt: '2026-08-03T10:00:00Z',
        requiredHeaders: {},
        uploadUrl: 'https://upload.example/5',
      })),
      completeMediaUpload: vi.fn(),
    };
    await expect(uploadAnnouncementImage({
      api: secondApi,
      campusId: 1,
      file: {...identity, localUri: 'file:///safe.jpg'},
      onProgress: vi.fn(),
      signal: afterUpload.signal,
      token: 'token',
      uploader: vi.fn(async () => {
        afterUpload.abort(new Error('removed after put'));
      }),
    })).rejects.toThrow('removed after put');
    expect(secondApi.reserveMediaUpload).toHaveBeenCalledTimes(1);
    expect(secondApi.completeMediaUpload).not.toHaveBeenCalled();
  });
});
