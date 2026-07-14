import {describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  FaithLogApiError: class TestFaithLogApiError extends Error {
    constructor(readonly detail: {code?: string; kind: string; message: string; status?: number}) {
      super(detail.message);
    }
  },
  isMockModeEnabled: vi.fn(() => false),
}));

import {createMealApi, type MealRequestDispatcher} from './mealApi';
import {
  parseMealPollDetail,
  parseMealPollList,
  parseMealSettlement,
  parseMyMealDutyAssignment,
} from './mealRuntimeValidation';

describe('MEAL canonical REST Docs contract', () => {
  it('accepts assignment-free inactive self duty as a valid negative response', () => {
    expect(parseMyMealDutyAssignment({
      campusId: 1,
      dutyType: 'MEAL',
      isActive: false,
      userId: 7,
    })).toEqual({campusId: 1, dutyType: 'MEAL', isActive: false, userId: 7});
    expect(() => parseMyMealDutyAssignment({
      assignmentId: 9,
      campusId: 1,
      dutyType: 'MEAL',
      isActive: true,
      userId: 7,
    })).toThrow('Invalid API response');
  });

  it('dispatches confirmed production endpoints and keeps the undocumented list query absent', async () => {
    const responses = [
      {campusId: 1, dutyType: 'MEAL', isActive: true, userId: 7},
      {content: [], page: 0, size: 20, totalElements: 0, totalPages: 0},
      settlementFixture(),
    ];
    const spy = vi.fn();
    const request: MealRequestDispatcher = async (path, options) => {
      spy(path, options);
      return options.responseParser(responses.shift());
    };
    const api = createMealApi({isMockMode: () => false, request});

    await api.getMyDuty('token', 1, 7);
    await api.listPolls('token', 1);
    await api.getMySettlement('token', 1, 7);

    expect(spy.mock.calls.map((call) => call[0])).toEqual([
      '/api/v1/campuses/1/duty-assignments/me/meal',
      '/api/v1/campuses/1/meal/polls',
      '/api/v1/campuses/1/meal/charges/my-accounts',
    ]);
  });

  it('serializes the exact create body and parses the generic Poll response', async () => {
    const response = createdPollFixture();
    const spy = vi.fn();
    const request: MealRequestDispatcher = async (path, options) => {
      spy(path, options);
      return options.responseParser(response);
    };
    const api = createMealApi({isMockMode: () => false, request});

    await expect(api.createPoll('token', 1, {
      title: '점심',
      isAnonymous: false,
      allowUserOptionAdd: true,
      endsAt: '2099-07-14T01:00:00.000Z',
      options: [{content: '한식', sortOrder: 0}, {content: '중식', sortOrder: 1}],
    })).resolves.toMatchObject({id: 101, status: 'OPEN'});
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/campuses/1/meal/polls',
      expect.objectContaining({
        body: {
          title: '점심',
          isAnonymous: false,
          allowUserOptionAdd: true,
          endsAt: '2099-07-14T01:00:00.000Z',
          options: [{content: '한식', sortOrder: 0}, {content: '중식', sortOrder: 1}],
        },
      }),
    );
  });

  it('parses the generic Poll close response separately from management detail', async () => {
    const closed = {...createdPollFixture(), status: 'CLOSED'};
    const spy = vi.fn();
    const request: MealRequestDispatcher = async (path, options) => {
      spy(path, options);
      return options.responseParser(closed);
    };
    const api = createMealApi({isMockMode: () => false, request});

    await expect(api.closePoll('token', 1, 101)).resolves.toMatchObject({id: 101, status: 'CLOSED'});
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/campuses/1/meal/polls/101/close',
      expect.objectContaining({method: 'PATCH'}),
    );
  });

  it('accepts only the documented management list and detail DTOs', () => {
    const summary = managementSummaryFixture();
    expect(parseMealPollList({
      content: [summary], page: 0, size: 20, totalElements: 1, totalPages: 1,
    }).content).toEqual([summary]);
    expect(() => parseMealPollList({
      content: [{...summary, totalResponseCount: 3}],
      page: 0, size: 20, totalElements: 1, totalPages: 1,
    })).toThrow('Invalid API response');

    const detail = managementDetailFixture();
    expect(parseMealPollDetail(detail).options[0]?.responseCount).toBe(3);
    expect(() => parseMealPollDetail({
      ...detail,
      settlementStatus: 'CHARGED',
    })).toThrow('Invalid API response');
    expect(() => parseMealPollDetail({
      ...detail,
      options: [{
        ...detail.options[0],
        charge: {...detail.options[0]!.charge, chargedMemberCount: 3},
      }],
    })).toThrow('Invalid API response');
  });

  it('parses the documented campus/member aggregate settlement without account detail inference', () => {
    expect(parseMealSettlement(settlementFixture())).toEqual(settlementFixture());
  });
});

function managementSummaryFixture() {
  return {
    id: 101,
    title: '점심 투표',
    status: 'CLOSED',
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-14T01:00:00.000Z',
    settlementStatus: 'CHARGED',
  };
}

function managementDetailFixture() {
  return {
    id: 101,
    campusId: 1,
    title: '점심 투표',
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-14T01:00:00.000Z',
    status: 'CLOSED',
    options: [{
      optionId: 1001,
      content: '제육볶음',
      responseCount: 3,
      userAdded: false,
      charge: {
        chargeStatus: 'CHARGED',
        calculationType: 'GROUP_TOTAL',
        enteredAmount: 10000,
        amountPerMember: 3334,
        requestedTotalAmount: 10000,
        actualTotalAmount: 10002,
        roundingAdjustment: 2,
        paymentAccountId: 10,
        chargedByMe: true,
        chargedAt: '2026-07-13T03:00:00.000Z',
      },
    }],
  };
}

function createdPollFixture() {
  return {
    id: 101,
    campusId: 1,
    templateId: null,
    title: '점심',
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    chargeGenerationType: 'NONE',
    paymentCategory: null,
    paymentAccountId: null,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2099-07-14T01:00:00.000Z',
    status: 'OPEN',
    options: [
      {id: 1001, content: '한식', composeMenuCode: null, priceAmount: 0, sortOrder: 0, userAdded: false},
      {id: 1002, content: '중식', composeMenuCode: null, priceAmount: 0, sortOrder: 1, userAdded: false},
    ],
  };
}

function settlementFixture() {
  return {
    campusId: 1,
    campusName: '샘플 캠퍼스',
    region: '서울',
    summary: {
      totalAmount: 10000,
      unpaidAmount: 8000,
      paidAmount: 2000,
      waivedAmount: 0,
      canceledAmount: 0,
    },
    members: [{
      userId: 8,
      name: '멤버',
      email: 'member@example.test',
      totalAmount: 10000,
      unpaidAmount: 8000,
      paidAmount: 2000,
      waivedAmount: 0,
      canceledAmount: 0,
    }],
  };
}
