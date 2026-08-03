import {beforeEach, describe, expect, it} from 'vitest';

import {executeMockRequest, resetMockAdapterStateForTests} from '../api/mockAdapter';

describe('media mock adapter', () => {
  beforeEach(() => resetMockAdapterStateForTests());

  it('keeps reservation metadata through idempotent-ready completion and ordered access lookup', async () => {
    const reservedResponse = await executeMockRequest(
      '/api/v1/admin/campuses/1/media-assets/upload-reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          contentType: 'image/jpeg',
          byteSize: 2048,
          sha256: 'b'.repeat(64),
        }),
      },
    );
    const reserved = (await reservedResponse.json()).data as {assetId: number};

    const completedResponse = await executeMockRequest(
      `/api/v1/admin/campuses/1/media-assets/${reserved.assetId}/complete`,
      {method: 'POST'},
    );
    await expect(completedResponse.json()).resolves.toMatchObject({
      data: {assetId: reserved.assetId, status: 'READY', byteSize: 2048, sha256: 'b'.repeat(64)},
    });

    const accessResponse = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {method: 'POST', body: JSON.stringify({assetIds: [reserved.assetId, 90_001]})},
    );
    const access = (await accessResponse.json()).data as {assets: Array<{assetId: number}>};
    expect(access.assets.map((asset) => asset.assetId)).toEqual([reserved.assetId, 90_001]);
  });
});
