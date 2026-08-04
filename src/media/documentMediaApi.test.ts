import {describe, expect, it, vi} from 'vitest';

import {createDocumentMediaApi} from './documentMediaApi';

describe('provisional document media API', () => {
  it('fails closed in production before dispatch while the REST contract is pending', async () => {
    const request = vi.fn();
    const api = createDocumentMediaApi({contractStatus: 'pending', request});
    await expect(api.reserve('token', 7, {
      byteSize: 123,
      contentType: 'application/pdf',
      fileName: '안내.pdf',
      sha256: 'a'.repeat(64),
    })).rejects.toMatchObject({detail: {code: 'API_CONTRACT_PENDING'}});
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the existing endpoints and preserves ordered access-url results when confirmed', async () => {
    const request = vi.fn(async (path, options) => {
      if (path.endsWith('/upload-reservations')) return options.responseParser({
        assetId: 31, uploadUrl: 'https://r2.example/upload',
        requiredHeaders: {'Content-Type': 'application/pdf'}, expiresAt: '2026-08-04T12:00:00Z',
      });
      if (path.endsWith('/31/complete')) return options.responseParser({
        assetId: 31, campusId: 7, status: 'READY', assetKind: 'PDF',
        contentType: 'application/pdf', fileName: '안내.pdf', sha256: 'a'.repeat(64),
        byteSize: 123, width: null, height: null,
      });
      return options.responseParser({assets: [31, 32].map((assetId) => ({
        assetId, assetKind: 'PDF', fileName: `${assetId}.pdf`, contentType: 'application/pdf',
        byteSize: assetId, sha256: String(assetId).padStart(64, '0'),
        thumbnailUrl: null, detailUrl: null, downloadUrl: `https://r2.example/${assetId}`,
        expiresAt: '2026-08-04T12:00:00Z',
      }))});
    });
    const api = createDocumentMediaApi({contractStatus: 'confirmed', request});
    const reservation = await api.reserve('token', 7, {
      byteSize: 123, contentType: 'application/pdf', fileName: '안내.pdf', sha256: 'a'.repeat(64),
    });
    expect(reservation.requiredHeaders).toEqual({'Content-Type': 'application/pdf'});
    await expect(api.complete('token', 7, 31)).resolves.toMatchObject({assetKind: 'PDF', width: null, height: null});
    await expect(api.getAccessUrls('token', 7, [31, 32])).resolves.toEqual([
      expect.objectContaining({assetId: 31, downloadUrl: 'https://r2.example/31'}),
      expect.objectContaining({assetId: 32, downloadUrl: 'https://r2.example/32'}),
    ]);
  });
});
