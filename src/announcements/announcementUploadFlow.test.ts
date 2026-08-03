import {describe, expect, it, vi} from 'vitest';

import {uploadAnnouncementImage} from './announcementUploadFlow';

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
    expect(progress.mock.calls.map(([value]) => value)).toEqual([0, 0.5, 1]);
    expect(uploader).toHaveBeenCalledWith(expect.objectContaining({headers: {'Content-Type': 'image/jpeg'}, uploadUrl: 'https://upload.example/5'}), expect.any(Function), undefined);
  });

  it('fails closed without an approved native binary uploader', async () => {
    await expect(uploadAnnouncementImage({api: {reserveMediaUpload: vi.fn(), completeMediaUpload: vi.fn()}, campusId: 1, file: {byteSize: 10, contentType: 'image/jpeg', localUri: 'file:///safe.jpg', sha256: 'a'.repeat(64)}, onProgress: vi.fn(), token: 'token'})).rejects.toMatchObject({code: 'MEDIA_NATIVE_UPLOADER_UNAVAILABLE'});
  });
});
