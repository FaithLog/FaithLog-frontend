import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  createMockReadyMediaAssetForCampus,
  executeMockRequest,
  mealMockAccessTokens,
  resetMockAdapterStateForTests,
} from '../api/mockAdapter';

describe('media mock adapter', () => {
  beforeEach(() => resetMockAdapterStateForTests());
  afterEach(() => vi.useRealTimers());

  it('keeps reservation metadata through idempotent-ready completion and ordered admin preview', async () => {
    const reservedResponse = await executeMockRequest(
      '/api/v1/admin/campuses/1/media-assets/upload-reservations',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({
          contentType: 'image/jpeg',
          byteSize: 2048,
          sha256: 'b'.repeat(64),
        }),
      },
    );
    const reserved = (await reservedResponse.json()).data as {assetId: number};

    const pendingAccessResponse = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({assetIds: [reserved.assetId]}),
      },
    );
    expect(pendingAccessResponse.status).toBe(404);

    const completedResponse = await executeMockRequest(
      `/api/v1/admin/campuses/1/media-assets/${reserved.assetId}/complete`,
      {method: 'POST', headers: authHeaders(mealMockAccessTokens.activeDuty)},
    );
    await expect(completedResponse.json()).resolves.toMatchObject({
      data: {assetId: reserved.assetId, status: 'READY', byteSize: 2048, sha256: 'b'.repeat(64)},
    });

    const accessResponse = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({assetIds: [reserved.assetId, 90_001]}),
      },
    );
    const access = (await accessResponse.json()).data as {assets: Array<{assetId: number}>};
    expect(access.assets.map((asset) => asset.assetId)).toEqual([reserved.assetId, 90_001]);
  });

  it('allows a member to access READY media only after attachment to a visible poll', async () => {
    const assetId = createMockReadyMediaAssetForCampus(1);
    const memberAccessBeforeAttachment = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherDuty),
        body: JSON.stringify({assetIds: [assetId]}),
      },
    );
    const adminPreview = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({assetIds: [assetId]}),
      },
    );

    expect(memberAccessBeforeAttachment.status).toBe(404);
    expect(adminPreview.status).toBe(200);

    const attachResponse = await executeMockRequest(
      '/api/v1/admin/campuses/1/polls/701/notice',
      {
        method: 'PATCH',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({
          title: '커피 주문 투표',
          notice: '공개 첨부',
          imageAssetIds: [assetId],
        }),
      },
    );
    const memberAccessAfterAttachment = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherDuty),
        body: JSON.stringify({assetIds: [assetId]}),
      },
    );

    expect(attachResponse.status).toBe(200);
    expect(memberAccessAfterAttachment.status).toBe(200);
  });

  it('revokes member access when an asset becomes unattached but preserves admin preview', async () => {
    const assetId = createMockReadyMediaAssetForCampus(1);
    for (const imageAssetIds of [[assetId], []]) {
      const response = await executeMockRequest(
        '/api/v1/admin/campuses/1/polls/701/notice',
        {
          method: 'PATCH',
          headers: authHeaders(mealMockAccessTokens.activeDuty),
          body: JSON.stringify({
            title: '커피 주문 투표',
            notice: '첨부 변경',
            imageAssetIds,
          }),
        },
      );
      expect(response.status).toBe(200);
    }

    const memberAccess = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherDuty),
        body: JSON.stringify({assetIds: [assetId]}),
      },
    );
    const adminPreview = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({assetIds: [assetId]}),
      },
    );

    expect(memberAccess.status).toBe(404);
    expect(adminPreview.status).toBe(200);
  });

  it('does not expose media attached only to a future hidden poll or partially mint a batch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    const hiddenAssetId = createMockReadyMediaAssetForCampus(1);
    const createResponse = await executeMockRequest('/api/v1/admin/campuses/1/polls', {
      method: 'POST',
      headers: authHeaders(mealMockAccessTokens.activeDuty),
      body: JSON.stringify({
        title: '공개 전 투표',
        pollType: 'CUSTOM',
        selectionType: 'SINGLE',
        isAnonymous: false,
        allowUserOptionAdd: false,
        startsAt: '2099-08-03T00:00:00.000Z',
        endsAt: '2099-08-04T00:00:00.000Z',
        options: [
          {content: 'A', priceAmount: 0, sortOrder: 1},
          {content: 'B', priceAmount: 0, sortOrder: 2},
        ],
        notice: '아직 숨김',
        imageAssetIds: [hiddenAssetId],
      }),
    });
    expect(createResponse.status).toBe(200);
    await expect(createResponse.json()).resolves.toMatchObject({
      data: {status: 'SCHEDULED', imageAssetIds: [hiddenAssetId]},
    });

    vi.setSystemTime(new Date('2099-08-03T12:00:00.000Z'));

    const allowedMemberAccess = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherDuty),
        body: JSON.stringify({assetIds: [90_001]}),
      },
    );

    const memberAccess = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherDuty),
        body: JSON.stringify({assetIds: [90_001, hiddenAssetId]}),
      },
    );
    const adminPreview = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({assetIds: [hiddenAssetId]}),
      },
    );

    expect(allowedMemberAccess.status).toBe(200);
    expect(memberAccess.status).toBe(404);
    expect(adminPreview.status).toBe(200);
  });

  it('requires an authenticated campus admin for media reservations', async () => {
    const response = await executeMockRequest(
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

    expect(response.status).toBe(401);
  });

  it('does not expose another campus poll asset through access URLs', async () => {
    const response = await executeMockRequest(
      '/api/v1/campuses/2/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherCampusDuty),
        body: JSON.stringify({assetIds: [90_001]}),
      },
    );

    expect(response.status).toBe(404);
  });

  it('rejects attaching a completed reservation to a different campus poll', async () => {
    const reservedResponse = await executeMockRequest(
      '/api/v1/admin/campuses/1/media-assets/upload-reservations',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({
          contentType: 'image/jpeg',
          byteSize: 2048,
          sha256: 'c'.repeat(64),
        }),
      },
    );
    const reserved = (await reservedResponse.json()).data as {assetId: number};
    await executeMockRequest(
      `/api/v1/admin/campuses/1/media-assets/${reserved.assetId}/complete`,
      {method: 'POST', headers: authHeaders(mealMockAccessTokens.activeDuty)},
    );

    const createResponse = await executeMockRequest(
      '/api/v1/campuses/2/meal/polls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherCampusDuty),
        body: JSON.stringify({
          title: '다른 캠퍼스 투표',
          isAnonymous: false,
          endsAt: '2099-08-04T00:00:00.000Z',
          options: [
            {content: 'A', sortOrder: 0},
            {content: 'B', sortOrder: 1},
          ],
          allowUserOptionAdd: false,
          notice: '첨부 경계',
          imageAssetIds: [reserved.assetId],
        }),
      },
    );

    expect(createResponse.status).toBe(400);
    const accessResponse = await executeMockRequest(
      '/api/v1/campuses/2/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherCampusDuty),
        body: JSON.stringify({assetIds: [reserved.assetId]}),
      },
    );
    expect(accessResponse.status).toBe(404);
  });

  it('rejects an unregistered asset instead of minting access through a notice reference', async () => {
    const mutationResponse = await executeMockRequest(
      '/api/v1/admin/campuses/1/polls/701/notice',
      {
        method: 'PATCH',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({
          title: '커피 주문 투표',
          notice: '위조 이미지',
          imageAssetIds: [999_999],
        }),
      },
    );
    expect(mutationResponse.status).toBe(400);

    const accessResponse = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({assetIds: [999_999]}),
      },
    );
    expect(accessResponse.status).toBe(404);
  });

  it('accepts an attached centrally registered mock-picker asset for only its campus', async () => {
    const assetId = createMockReadyMediaAssetForCampus(1);
    const mutationResponse = await executeMockRequest(
      '/api/v1/admin/campuses/1/polls/701/notice',
      {
        method: 'PATCH',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({
          title: '커피 주문 투표',
          notice: '등록 이미지',
          imageAssetIds: [assetId],
        }),
      },
    );
    expect(mutationResponse.status).toBe(200);

    const ownAccess = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
        body: JSON.stringify({assetIds: [assetId]}),
      },
    );
    const otherAccess = await executeMockRequest(
      '/api/v1/campuses/2/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherCampusDuty),
        body: JSON.stringify({assetIds: [assetId]}),
      },
    );
    expect(ownAccess.status).toBe(200);
    expect(otherAccess.status).toBe(404);
  });

  it('accepts globally distinct registered assets through meal and coffee create flows', async () => {
    const mealAssetId = createMockReadyMediaAssetForCampus(1);
    const mealResponse = await executeMockRequest('/api/v1/campuses/1/meal/polls', {
      method: 'POST',
      headers: authHeaders(mealMockAccessTokens.activeDuty),
      body: JSON.stringify({
        title: '이미지 밥 투표',
        isAnonymous: false,
        endsAt: '2099-08-04T00:00:00.000Z',
        options: [
          {content: 'A', sortOrder: 0},
          {content: 'B', sortOrder: 1},
        ],
        allowUserOptionAdd: false,
        notice: '밥 공지',
        imageAssetIds: [mealAssetId],
      }),
    });

    const coffeeAssetId = createMockReadyMediaAssetForCampus(1);
    const coffeeResponse = await executeMockRequest('/api/v1/admin/campuses/1/polls', {
      method: 'POST',
      headers: authHeaders(mealMockAccessTokens.activeDuty),
      body: JSON.stringify({
        title: '이미지 커피 투표',
        pollType: 'COFFEE',
        selectionType: 'SINGLE',
        isAnonymous: false,
        allowUserOptionAdd: true,
        startsAt: '2026-08-03T00:00:00.000Z',
        endsAt: '2099-08-04T00:00:00.000Z',
        options: [{content: '커피', priceAmount: 4_500, sortOrder: 1}],
        notice: '커피 공지',
        imageAssetIds: [coffeeAssetId],
      }),
    });

    expect(mealResponse.status).toBe(200);
    expect(coffeeResponse.status).toBe(200);
    expect(coffeeAssetId).toBeGreaterThan(mealAssetId);

    const mealMemberAccess = await executeMockRequest(
      '/api/v1/campuses/1/media-assets/access-urls',
      {
        method: 'POST',
        headers: authHeaders(mealMockAccessTokens.otherDuty),
        body: JSON.stringify({assetIds: [mealAssetId]}),
      },
    );
    expect(mealMemberAccess.status).toBe(200);
  });
});

function authHeaders(token: string) {
  return {Authorization: `Bearer ${token}`};
}
