import {describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => {
  class TestFaithLogApiError extends Error {
    readonly detail: {kind: string; code?: string; message: string; status?: number};

    constructor(detail: {kind: string; code?: string; message: string; status?: number}) {
      super(detail.message);
      this.detail = detail;
    }
  }

  return {
    apiRequest: vi.fn(),
    FaithLogApiError: TestFaithLogApiError,
    isMockModeEnabled: vi.fn(() => false),
  };
});

import {createMealApi, type MealRequestDispatcher} from './mealApi';

describe('typed confirmed MEAL API', () => {
  it('uses the documented archived and paging query in production', async () => {
    const {request, spy} = createRequestHarness([
      {content: [], page: 0, size: 10, totalElements: 0, totalPages: 0},
      {content: [], page: 0, size: 10, totalElements: 0, totalPages: 0},
    ]);
    const api = createMealApi({isMockMode: () => false, request});

    await api.listPolls('token', 1);
    await api.listPolls('token', 1, {includeArchived: true, status: 'CLOSED'});
    expect(spy.mock.calls[0]?.[0]).toBe(
      '/api/v1/campuses/1/meal/polls?page=0&size=10&sort=createdAt%2Cdesc&includeArchived=false',
    );
    expect(spy.mock.calls[1]?.[0]).toContain('includeArchived=true');
  });

  it('uses the MEAL management list, never the general user poll list', async () => {
    const {request, spy} = createRequestHarness([{
      content: [], page: 0, size: 10, totalElements: 0, totalPages: 0,
    }]);
    const api = createMealApi({isMockMode: () => true, request});

    await api.listPolls('token', 3, {page: 0, size: 10, sort: 'endsAt,desc', status: 'CLOSED'});

    expect(spy).toHaveBeenCalledWith(
      '/api/v1/campuses/3/meal/polls?status=CLOSED&page=0&size=10&sort=endsAt%2Cdesc&includeArchived=false',
      expect.objectContaining({accessToken: 'token', method: 'GET'}),
    );
  });

  it('uses backend-filtered own-account and own-settlement endpoints', async () => {
    const {request, spy} = createRequestHarness([
      [],
      {campusId: 4, campusName: '캠퍼스', region: '서울', members: [], page: 0, size: 10, totalElements: 0, totalPages: 0, summary: {totalAmount: 0, unpaidAmount: 0, paidAmount: 0, waivedAmount: 0, canceledAmount: 0}},
    ]);
    const api = createMealApi({isMockMode: () => true, request});

    await api.getMyPaymentAccounts('token', 4, 7, true);
    await api.getMySettlement('token', 4, 7);

    expect(spy.mock.calls[0]?.[0]).toBe(
      '/api/v1/campuses/4/meal/payment-accounts/me?includeInactive=true',
    );
    expect(spy.mock.calls[1]?.[0]).toBe(
      '/api/v1/campuses/4/meal/charges/my-accounts?includeArchived=false&page=0&size=10',
    );
  });

  it('dispatches POST/DELETE duty operations without changing a campus role', async () => {
    const {request, spy} = createRequestHarness([
      {assignmentId: 20, campusId: 1, userId: 9, name: '밥담당', email: 'meal@example.test', dutyType: 'MEAL', isActive: true, assignedAt: '2026-07-13T03:00:00.000Z'},
      null,
    ]);
    const api = createMealApi({isMockMode: () => true, request});

    await api.assignDuty('token', 1, {userId: 9});
    await api.revokeDuty('token', 1, 20);

    expect(spy.mock.calls[0]).toEqual([
      '/api/v1/admin/campuses/1/duty-assignments/meal',
      expect.objectContaining({method: 'POST', body: {userId: 9}}),
    ]);
    expect(spy.mock.calls[1]?.[0]).toBe(
      '/api/v1/admin/campuses/1/duty-assignments/meal/20',
    );
  });

  it('sends one batch charge request and never the superseded option endpoint', async () => {
    const {request, spy} = createRequestHarness([{
      pollId: 100,
      paymentAccountId: 10,
      chargedMemberCount: 3,
      requestedTotalAmount: 10000,
      actualTotalAmount: 10002,
      roundingAdjustment: 2,
      chargedAt: '2026-07-13T03:00:00.000Z',
      groups: [{
        optionId: 1001,
        calculationType: 'GROUP_TOTAL',
        responseCount: 3,
        enteredAmount: 10000,
        amountPerMember: 3334,
        requestedTotalAmount: 10000,
        actualTotalAmount: 10002,
        roundingAdjustment: 2,
      }],
    }]);
    const api = createMealApi({isMockMode: () => true, request});

    await api.createCharges('token', 1, 100, {
      paymentAccountId: 10,
      groups: [{optionId: 1001, calculationType: 'GROUP_TOTAL', enteredAmount: 10000}],
    });

    expect(spy).toHaveBeenCalledWith(
      '/api/v1/campuses/1/meal/polls/100/charges',
      expect.objectContaining({method: 'POST'}),
    );
    expect(spy.mock.calls[0]?.[0]).not.toContain('meal-charge-groups');
  });
});

function createRequestHarness(responses: unknown[]) {
  const spy = vi.fn((_path: string, _options: unknown) => undefined);
  const request: MealRequestDispatcher = async (path, options) => {
    spy(path, options);
    return options.responseParser(responses.shift());
  };

  return {request, spy};
}
