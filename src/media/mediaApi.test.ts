import {describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  toPositiveIntegerPathSegment(value: unknown, name: string) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Invalid ${name}`);
    }
    return String(value);
  },
}));

import {
  chunkMediaAssetIds,
  createMediaApi,
  createProductionMediaApi,
} from './mediaApi';

describe('approved media API contract', () => {
  it('reserves an upload with the exact approved path and body', async () => {
    const request = vi.fn().mockResolvedValue({
      assetId: 101,
      uploadUrl: 'https://signed.invalid/put',
      requiredHeaders: {'Content-Type': 'image/jpeg'},
      expiresAt: '2026-08-03T03:10:00Z',
    });
    const api = createMediaApi({request});

    await api.reserve('token', 7, {
      contentType: 'image/jpeg',
      byteSize: 1234,
      sha256: 'a'.repeat(64),
    });

    expect(request).toHaveBeenCalledWith(
      '/api/v1/admin/campuses/7/media-assets/upload-reservations',
      expect.objectContaining({
        accessToken: 'token',
        method: 'POST',
        body: {contentType: 'image/jpeg', byteSize: 1234, sha256: 'a'.repeat(64)},
      }),
    );
  });

  it('completes idempotently through the approved asset path', async () => {
    const request = vi.fn().mockResolvedValue({
      assetId: 101,
      status: 'READY',
      sha256: 'b'.repeat(64),
      byteSize: 42,
      width: 100,
      height: 100,
    });
    const api = createMediaApi({request});

    await api.complete('token', 7, 101);

    expect(request).toHaveBeenCalledWith(
      '/api/v1/admin/campuses/7/media-assets/101/complete',
      expect.objectContaining({accessToken: 'token', method: 'POST'}),
    );
  });

  it('parses PROCESSING as a pending completion result instead of a malformed READY response', async () => {
    const request = vi.fn().mockImplementation((_path: string, options: {
      responseParser: (value: unknown) => unknown;
    }) => Promise.resolve(options.responseParser({
      assetId: 101,
      status: 'PROCESSING',
      retryAfterMs: 25,
    })));
    const api = createMediaApi({request});

    await expect(api.complete('token', 7, 101)).resolves.toEqual({
      assetId: 101,
      status: 'PROCESSING',
      retryAfterMs: 25,
    });
  });

  it('batches access URL requests at 100 ids without N+1 calls', async () => {
    const request = vi.fn().mockImplementation((_path: string, options: {
      body: {assetIds: number[]};
      responseParser: (value: unknown) => unknown;
    }) =>
      Promise.resolve(options.responseParser({
        assets: options.body.assetIds.map((assetId) => ({
          assetId,
          thumbnailUrl: `https://signed.invalid/${assetId}/thumb`,
          detailUrl: `https://signed.invalid/${assetId}/detail`,
          expiresAt: '2026-08-03T03:10:00Z',
        })),
      })),
    );
    const api = createMediaApi({request});
    const ids = Array.from({length: 205}, (_value, index) => index + 1);

    const result = await api.getAccessUrls('token', 7, ids);

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map((call) => call[1].body.assetIds.length)).toEqual([100, 100, 5]);
    expect(result.map((asset) => asset.assetId)).toEqual(ids);
    expect(chunkMediaAssetIds(ids).map((chunk) => chunk.length)).toEqual([100, 100, 5]);
  });

  it('fails closed when an ordered response does not match the request', async () => {
    const api = createMediaApi({
      request: vi.fn().mockImplementation((_path: string, options: {
        responseParser: (value: unknown) => unknown;
      }) => Promise.resolve(options.responseParser({
          assets: [{
            assetId: 2,
            thumbnailUrl: 'https://signed.invalid/2/thumb',
            detailUrl: 'https://signed.invalid/2/detail',
            expiresAt: '2026-08-03T03:10:00Z',
          }],
        }))),
    });

    await expect(api.getAccessUrls('token', 7, [1])).rejects.toMatchObject({
      detail: {code: 'INVALID_SERVER_RESPONSE'},
    });
  });

  it('keeps the approved media transport available without guessing poll DTOs', () => {
    expect(createProductionMediaApi()).toBeDefined();
  });
});
