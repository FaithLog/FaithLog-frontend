import {describe, expect, it, vi} from 'vitest';

import {runPdfUpload} from './pdfUploadCoordinator';

const file = {byteSize: 128, contentType: 'application/pdf' as const, fileName: '안내.pdf', sha256: 'a'.repeat(64), uri: 'file:///private/notice.pdf'};

describe('PDF upload coordinator', () => {
  it('runs reservation, exact-header PUT, then complete without app Authorization', async () => {
    const order: string[] = [];
    const api = {
      reserve: vi.fn(async () => { order.push('reserve'); return {assetId: 31, uploadUrl: 'https://r2.example/upload', requiredHeaders: {'Content-Type': 'application/pdf', 'x-amz-checksum-sha256': 'opaque'}, expiresAt: '2026-08-04T12:00:00Z'}; }),
      complete: vi.fn(async () => { order.push('complete'); return {assetId: 31, assetKind: 'PDF' as const, status: 'READY' as const, contentType: 'application/pdf' as const, fileName: '안내.pdf', sha256: 'b'.repeat(64), byteSize: 128, width: null, height: null}; }),
      getAccessUrls: vi.fn(),
    };
    const upload = vi.fn(async ({headers}) => { order.push('put'); expect(headers).toEqual({'Content-Type': 'application/pdf', 'x-amz-checksum-sha256': 'opaque'}); expect(headers.Authorization).toBeUndefined(); });
    await expect(runPdfUpload({accessToken: 'secret', api, campusId: 7, file, transport: {upload}}))
      .resolves.toMatchObject({assetId: 31, status: 'READY'});
    expect(order).toEqual(['reserve', 'put', 'complete']);
  });

  it('does not call complete after a failed PUT', async () => {
    const api = {reserve: vi.fn(async () => ({assetId: 31, uploadUrl: 'https://r2.example/upload', requiredHeaders: {}, expiresAt: '2026-08-04T12:00:00Z'})), complete: vi.fn(), getAccessUrls: vi.fn()};
    await expect(runPdfUpload({accessToken: 'secret', api, campusId: 7, file, transport: {upload: vi.fn(async () => { throw new Error('offline'); })}})).rejects.toThrow('offline');
    expect(api.complete).not.toHaveBeenCalled();
  });
});
