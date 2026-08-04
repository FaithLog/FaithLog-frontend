import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../../api/tokenStorage', () => ({
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(() => 0),
  getStoredAuthSession: vi.fn(),
  getStoredTokens: vi.fn(),
  isAccessTokenOwnedByAuthSession: vi.fn(async () => true),
  isAuthSessionGenerationCurrent: vi.fn(() => true),
  isAuthSessionRequestAllowed: vi.fn(() => true),
  saveTokens: vi.fn(),
}));

import {
  addUserPollOption,
  fetchPollDetail,
  fetchPollResults,
  fetchPolls,
  savePollResponse,
} from '../../api/client';
import {
  executeMockRequest,
  mealMockAccessTokens,
  resetMockAdapterStateForTests,
} from '../../api/mockAdapter';
import {
  createPollNoticeMutationApi,
  updatePublishedPollNotice,
} from './pollNoticeMutationApi';

describe('published poll notice mutation boundary', () => {
  beforeEach(() => {
    resetMockAdapterStateForTests();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://faithlog-549871256004.asia-northeast3.run.app';
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
  });

  it('dispatches the confirmed production update contract', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      code: 'SUCCESS',
      message: 'ok',
      data: pollMutationResponse({title: '제목 유지', notice: '운영 공지', imageAssetIds: []}),
      timestamp: '2026-08-04T00:00:00Z',
    }), {status: 200, headers: {'Content-Type': 'application/json'}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        code: 'SUCCESS',
        message: 'ok',
        data: pollDetail({title: '제목 유지', notice: '운영 공지', imageAssetIds: []}),
        timestamp: '2026-08-04T00:00:00Z',
      }), {status: 200, headers: {'Content-Type': 'application/json'}}));

    await expect(updatePublishedPollNotice('token', {
      campusId: 1,
      pollId: 701,
      pollType: 'CUSTOM',
      title: '제목 유지',
      notice: '운영 공지',
      imageAssetIds: [],
    })).resolves.toMatchObject({id: 701, notice: '운영 공지'});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/admin/campuses/1/polls/701/notice',
      expect.objectContaining({method: 'PATCH'}),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/campuses/1/polls/701',
      expect.objectContaining({method: 'GET'}),
    );
  });

  it('keeps general and meal paths behind one injectable interface', async () => {
    const request = vi.fn().mockImplementation((path: string, options: {
      body: unknown;
      responseParser: (value: unknown) => unknown;
    }) => Promise.resolve(options.responseParser(pollDetail({
      id: path.includes('/901/') ? 901 : 701,
      pollType: path.includes('/meal/') ? 'MEAL' : 'CUSTOM',
      ...options.body as object,
    }))));
    const api = createPollNoticeMutationApi({
      capabilities: {
        canAccessMedia: true,
        canEditPublishedNotice: true,
        canReadNotice: true,
      },
      fetchDetail: vi.fn().mockImplementation((_token, _campusId, pollId) =>
        Promise.resolve(pollDetail({
          id: pollId,
          pollType: pollId === 901 ? 'MEAL' : 'CUSTOM',
          ...(request.mock.calls.at(-1)?.[1].body as object),
        }))),
      request,
    });

    await api.update('token', {
      campusId: 1, pollId: 701, pollType: 'CUSTOM', title: '일반', notice: null, imageAssetIds: [],
    });
    await api.update('token', {
      campusId: 1, pollId: 901, pollType: 'MEAL', title: '밥', notice: '안내', imageAssetIds: [9],
    });

    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/admin/campuses/1/polls/701/notice',
      '/api/v1/campuses/1/meal/polls/901/notice',
    ]);
    expect(request.mock.calls.map(([, options]) => options.body)).toEqual([
      {title: '일반', notice: null, imageAssetIds: []},
      {title: '밥', notice: '안내', imageAssetIds: [9]},
    ]);
  });

  it('rejects a mutation response that crosses the requested poll identity', async () => {
    const request = vi.fn().mockImplementation((_path: string, options: {
      responseParser: (value: unknown) => unknown;
    }) => Promise.resolve(options.responseParser(pollDetail({id: 999}))));
    const api = createPollNoticeMutationApi({
      capabilities: {
        canAccessMedia: true,
        canEditPublishedNotice: true,
        canReadNotice: true,
      },
      fetchDetail: vi.fn(),
      request,
    });

    await expect(api.update('token', {
      campusId: 1,
      pollId: 701,
      pollType: 'CUSTOM',
      title: '일반',
      notice: null,
      imageAssetIds: [],
    })).rejects.toMatchObject({detail: {code: 'INVALID_SERVER_RESPONSE'}});
  });

  it('persists mock general edits without replacing response or management capabilities', async () => {
    enableMockMode();
    const token = mealMockAccessTokens.activeDuty;
    const addedOption = await addUserPollOption(token, 1, 702, {content: '핫도그'});
    const savedResponse = await savePollResponse(token, 1, 702, {
      optionIds: [addedOption.id],
    });
    const before = await fetchPollDetail(token, 1, 702);
    const beforeResults = await fetchPollResults(token, 1, 702);
    expect(beforeResults.optionResults).toContainEqual(expect.objectContaining({
      id: addedOption.id,
      responseCount: 1,
    }));

    await updatePublishedPollNotice(token, {
      campusId: 1,
      pollId: 702,
      pollType: before.pollType,
      title: '수정된 일반 투표 제목',
      notice: null,
      imageAssetIds: [],
    });
    expect((await fetchPolls(token, 1)).find((poll) => poll.id === 702))
      .toMatchObject({id: 702, hasNotice: false});

    const updated = await updatePublishedPollNotice(token, {
      campusId: 1,
      pollId: 702,
      pollType: before.pollType,
      title: '수정된 일반 투표 제목',
      notice: '  수정된 공지  ',
      imageAssetIds: [90_002, 90_001, 90_002],
    });
    const detail = await fetchPollDetail(token, 1, 702);
    const results = await fetchPollResults(token, 1, 702);
    const summary = (await fetchPolls(token, 1)).find((poll) => poll.id === 702);

    expect(updated).toMatchObject({
      id: 702,
      title: '수정된 일반 투표 제목',
      notice: '수정된 공지',
      imageAssetIds: [90_002, 90_001],
    });
    expect(detail).toMatchObject({
      id: before.id,
      title: '수정된 일반 투표 제목',
      responded: before.responded,
      manageableByMe: before.manageableByMe,
      allowUserOptionAdd: before.allowUserOptionAdd,
      myResponse: savedResponse,
      notice: '수정된 공지',
      imageAssetIds: [90_002, 90_001],
    });
    expect(detail.options).toEqual(before.options);
    expect(detail.options).toContainEqual(expect.objectContaining({id: addedOption.id}));
    expect(summary).toMatchObject({
      id: 702,
      title: '수정된 일반 투표 제목',
      hasNotice: true,
    });
    expect(results.title).toBe('수정된 일반 투표 제목');
    expect(results.respondedCount).toBe(beforeResults.respondedCount);
    expect(results.optionResults).toEqual(beforeResults.optionResults);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps coffee response, result, and requester capabilities isolated through notice edits', async () => {
    enableMockMode();
    const adminToken = mealMockAccessTokens.activeDuty;
    const memberToken = mealMockAccessTokens.otherDuty;
    const savedResponse = await savePollResponse(adminToken, 1, 701, {optionIds: [902]});
    const beforeResults = await fetchPollResults(adminToken, 1, 701);

    expect((await fetchPolls(adminToken, 1)).find((poll) => poll.id === 701)).toMatchObject({
      responded: true,
      manageableByMe: true,
    });
    expect(beforeResults.optionResults).toEqual([
      expect.objectContaining({id: 901, responseCount: 0}),
      expect.objectContaining({
        id: 902,
        responseCount: 1,
        respondents: [expect.objectContaining({userId: 7})],
      }),
    ]);
    await expect(fetchPollDetail(memberToken, 1, 701)).resolves.toMatchObject({
      responded: false,
      manageableByMe: false,
      myResponse: null,
    });

    await updatePublishedPollNotice(adminToken, {
      campusId: 1,
      pollId: 701,
      pollType: 'COFFEE',
      title: '수정된 커피 주문 투표',
      notice: '커피 공지',
      imageAssetIds: [90_002],
    });
    const detail = await fetchPollDetail(adminToken, 1, 701);
    const results = await fetchPollResults(adminToken, 1, 701);

    expect(detail).toMatchObject({
      myResponse: savedResponse,
      responded: true,
      manageableByMe: true,
    });
    expect(results).toEqual({...beforeResults, title: '수정된 커피 주문 투표'});
    await expect(fetchPollDetail(memberToken, 1, 701)).resolves.toMatchObject({
      responded: false,
      manageableByMe: false,
      myResponse: null,
    });
  });

  it('persists mock meal edits while preserving the meal response and user-option flow', async () => {
    enableMockMode();
    const token = mealMockAccessTokens.activeDuty;
    const addedOption = await addUserPollOption(token, 1, 901, {content: '순두부'});
    const savedResponse = await savePollResponse(token, 1, 901, {
      optionIds: [addedOption.id],
    });
    const before = await fetchPollDetail(token, 1, 901);
    const beforeResults = await fetchPollResults(token, 1, 901);

    await updatePublishedPollNotice(token, {
      campusId: 1,
      pollId: 901,
      pollType: 'MEAL',
      title: '수정된 밥 투표 제목',
      notice: '밥 투표 공지',
      imageAssetIds: [90_002, 90_001],
    });
    const detail = await fetchPollDetail(token, 1, 901);
    const results = await fetchPollResults(token, 1, 901);
    const summary = (await fetchPolls(token, 1)).find((poll) => poll.id === 901);

    expect(detail).toMatchObject({
      id: before.id,
      title: '수정된 밥 투표 제목',
      allowUserOptionAdd: before.allowUserOptionAdd,
      manageableByMe: before.manageableByMe,
      myResponse: savedResponse,
      notice: '밥 투표 공지',
      imageAssetIds: [90_002, 90_001],
    });
    expect(detail.options).toEqual(before.options);
    expect(detail.options).toContainEqual(expect.objectContaining({id: addedOption.id}));
    expect(summary).toMatchObject({
      id: 901,
      title: '수정된 밥 투표 제목',
      hasNotice: true,
    });
    expect(results.title).toBe('수정된 밥 투표 제목');
    expect(results.respondedCount).toBe(beforeResults.respondedCount);
    expect(results.optionResults).toEqual(beforeResults.optionResults);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an overlength mock title without mutating the published poll', async () => {
    enableMockMode();
    const token = mealMockAccessTokens.activeDuty;
    const before = await fetchPollDetail(token, 1, 701);

    const response = await executeMockRequest(
      '/api/v1/admin/campuses/1/polls/701/notice',
      {
        method: 'PATCH',
        headers: {Authorization: `Bearer ${token}`},
        body: JSON.stringify({
          title: '가'.repeat(501),
          notice: '변경되면 안 되는 공지',
          imageAssetIds: [90_001],
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(fetchPollDetail(token, 1, 701)).resolves.toEqual(before);
  });

  it('keeps mock poll lists and details scoped to the authenticated campus', async () => {
    enableMockMode();
    const token = mealMockAccessTokens.otherCampusDuty;

    await expect(fetchPolls(token, 2)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({id: 701})]),
    );
    await expect(fetchPollDetail(token, 2, 701)).rejects.toMatchObject({
      detail: {code: 'POLL_NOT_FOUND'},
    });
  });
});

function enableMockMode() {
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
}

function pollDetail(patch: Record<string, unknown> = {}) {
  return {
    id: 701,
    campusId: 1,
    title: '테스트',
    pollType: 'CUSTOM',
    selectionType: 'SINGLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    startsAt: '2026-08-03T00:00:00Z',
    endsAt: '2026-08-04T00:00:00Z',
    status: 'OPEN',
    responded: false,
    manageableByMe: true,
    templateId: null,
    chargeGenerationType: 'NONE',
    paymentCategory: null,
    paymentAccountId: null,
    options: [{id: 1, content: 'A', composeMenuCode: null, priceAmount: 0, sortOrder: 1}],
    myResponse: null,
    ...patch,
  };
}

function pollMutationResponse(patch: Record<string, unknown> = {}) {
  const {manageableByMe: _manageableByMe, myResponse: _myResponse, responded: _responded, ...response} =
    pollDetail(patch);
  return response;
}
