import {beforeEach, describe, expect, it} from 'vitest';

import {
  executeMockRequest,
  mealMockAccessTokens,
  resetMockAdapterStateForTests,
} from './mockAdapter';

describe('poll mock authorization and state boundaries', () => {
  beforeEach(() => resetMockAdapterStateForTests());

  it('requires a same-campus administrator to create a general poll', async () => {
    const unauthenticated = await executeMockRequest('/api/v1/admin/campuses/1/polls', {
      method: 'POST',
      body: JSON.stringify(createRequest()),
    });
    const nonAdmin = await executeMockRequest('/api/v1/admin/campuses/2/polls', {
      method: 'POST',
      headers: authHeaders(mealMockAccessTokens.otherCampusDuty),
      body: JSON.stringify(createRequest()),
    });

    expect(unauthenticated.status).toBe(401);
    expect(nonAdmin.status).toBe(403);
  });

  it('creates a unique poll whose list, detail, and results share one identity', async () => {
    const createdResponse = await executeMockRequest('/api/v1/admin/campuses/1/polls', {
      method: 'POST',
      headers: authHeaders(mealMockAccessTokens.activeDuty),
      body: JSON.stringify(createRequest()),
    });
    expect(createdResponse.status).toBe(200);
    const created = await dataOf<{id: number}>(createdResponse);
    expect(created.id).not.toBe(701);

    const mealResponse = await executeMockRequest('/api/v1/campuses/1/meal/polls', {
      method: 'POST',
      headers: authHeaders(mealMockAccessTokens.activeDuty),
      body: JSON.stringify({
        title: '새 밥 투표',
        isAnonymous: false,
        endsAt: '2099-08-04T00:00:00.000Z',
        options: [
          {content: '밥 A', sortOrder: 0},
          {content: '밥 B', sortOrder: 1},
        ],
        allowUserOptionAdd: false,
      }),
    });
    const meal = await dataOf<{id: number}>(mealResponse);
    expect(meal.id).toBeGreaterThan(created.id);

    const [listResponse, detailResponse, resultsResponse, fixtureResponse] = await Promise.all([
      executeMockRequest('/api/v1/campuses/1/polls', {
        method: 'GET',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
      }),
      executeMockRequest(`/api/v1/campuses/1/polls/${created.id}`, {
        method: 'GET',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
      }),
      executeMockRequest(`/api/v1/campuses/1/polls/${created.id}/results`, {
        method: 'GET',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
      }),
      executeMockRequest('/api/v1/campuses/1/polls/701', {
        method: 'GET',
        headers: authHeaders(mealMockAccessTokens.activeDuty),
      }),
    ]);
    const list = await dataOf<Array<Record<string, unknown>>>(listResponse);
    const detail = await dataOf<Record<string, unknown>>(detailResponse);
    const results = await dataOf<Record<string, unknown>>(resultsResponse);
    const fixture = await dataOf<Record<string, unknown>>(fixtureResponse);

    expect(list.find((item) => item.id === created.id)).toMatchObject({
      id: created.id,
      title: '새 공지 투표',
      pollType: 'CUSTOM',
      selectionType: 'MULTIPLE',
      responded: false,
    });
    expect(detail).toMatchObject({
      id: created.id,
      title: '새 공지 투표',
      pollType: 'CUSTOM',
      selectionType: 'MULTIPLE',
    });
    expect(results).toMatchObject({
      pollId: created.id,
      title: '새 공지 투표',
      pollType: 'CUSTOM',
      selectionType: 'MULTIPLE',
      respondedCount: 0,
    });
    expect(results.optionResults).toEqual([
      expect.objectContaining({content: 'A', responseCount: 0}),
      expect.objectContaining({content: 'B', responseCount: 0}),
    ]);
    expect(fixture).toMatchObject({id: 701, title: '커피 주문 투표'});
  });

  it('keeps seeded requester responses coherent with aggregate fixtures', async () => {
    const headers = authHeaders(mealMockAccessTokens.otherDuty);
    const [listResponse, detailResponse, resultsResponse, closedDetailResponse, closedResultsResponse] =
      await Promise.all([
        executeMockRequest('/api/v1/campuses/1/polls', {method: 'GET', headers}),
        executeMockRequest('/api/v1/campuses/1/polls/702', {method: 'GET', headers}),
        executeMockRequest('/api/v1/campuses/1/polls/702/results', {method: 'GET', headers}),
        executeMockRequest('/api/v1/campuses/1/polls/705', {
          method: 'GET',
          headers: authHeaders(mealMockAccessTokens.activeDuty),
        }),
        executeMockRequest('/api/v1/campuses/1/polls/705/results', {
          method: 'GET',
          headers: authHeaders(mealMockAccessTokens.activeDuty),
        }),
      ]);
    const list = await dataOf<Array<Record<string, unknown>>>(listResponse);
    const detail = await dataOf<Record<string, unknown>>(detailResponse);
    const results = await dataOf<{optionResults: Array<{respondents: Array<{userId: number}>}>}>(
      resultsResponse,
    );
    const closedDetail = await dataOf<Record<string, unknown>>(closedDetailResponse);
    const closedResults = await dataOf<{
      respondedCount: number;
      optionResults: Array<{id: number; responseCount: number}>;
    }>(closedResultsResponse);

    expect(list.find((poll) => poll.id === 702)).toMatchObject({
      responded: true,
      manageableByMe: false,
    });
    expect(detail).toMatchObject({
      responded: true,
      manageableByMe: false,
      myResponse: expect.objectContaining({optionIds: [911]}),
    });
    expect(results.optionResults.some((option) =>
      option.respondents.some((respondent) => respondent.userId === 8))).toBe(true);
    expect(closedDetail).toMatchObject({
      responded: true,
      myResponse: expect.objectContaining({optionIds: [951]}),
    });
    expect(closedResults.respondedCount).toBe(1);
    expect(closedResults.optionResults).toContainEqual(
      expect.objectContaining({id: 951, responseCount: 1}),
    );
  });
});

function createRequest() {
  return {
    title: '새 공지 투표',
    pollType: 'CUSTOM',
    selectionType: 'MULTIPLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    startsAt: '2026-08-03T00:00:00.000Z',
    endsAt: '2099-08-04T00:00:00.000Z',
    options: [
      {content: 'A', priceAmount: 0, sortOrder: 1},
      {content: 'B', priceAmount: 0, sortOrder: 2},
    ],
    notice: '공지',
    imageAssetIds: [],
  };
}

function authHeaders(token: string) {
  return {Authorization: `Bearer ${token}`};
}

async function dataOf<T>(response: Response): Promise<T> {
  return (await response.json() as {data: T}).data;
}
