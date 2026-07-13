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
import type {MealChargeRequest, MealPollCreateRequest} from './mealTypes';

describe('MEAL request context identity', () => {
  it('rejects a self-duty response for another campus or user', async () => {
    const {api} = harness([
      {assignmentId: 9, campusId: 2, dutyType: 'MEAL', isActive: true, userId: 7},
      {assignmentId: 9, campusId: 1, dutyType: 'MEAL', isActive: true, userId: 999},
    ]);

    await expect(api.getMyDuty('token', 1, 7)).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.getMyDuty('token', 1, 7)).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
  });

  it('rejects all own-account and settlement data when any owner or campus differs', async () => {
    const wrongAccount = mealAccount({campusId: 2, ownerUserId: 999});
    const {api} = harness([
      [wrongAccount],
      wrongAccount,
      wrongAccount,
      settlement(wrongAccount),
    ]);

    await expect(api.getMyPaymentAccounts('token', 1, 7, true)).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.createPaymentAccount('token', 1, 7, accountCreate())).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.deactivatePaymentAccount('token', 1, 7, 10)).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.getMySettlement('token', 1, 7)).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
  });

  it('rejects list, detail, create, and close responses outside the requested campus or poll', async () => {
    const {api} = harness([
      {content: [mealPoll({campusId: 2})], page: 0, size: 20, totalElements: 1, totalPages: 1},
      mealDetail({campusId: 2}),
      mealDetail({campusId: 2, id: 102, status: 'OPEN'}),
      mealDetail({id: 999, status: 'CLOSED'}),
    ]);

    await expect(api.listPolls('token', 1, {page: 0, size: 20})).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.getPollDetail('token', 1, 101)).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.createPoll('token', 1, pollCreate())).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.closePoll('token', 1, 101)).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
  });

  it('rejects management list items outside the requested status filter', async () => {
    const {api} = harness([{
      content: [mealPoll({status: 'OPEN'})],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    }]);

    await expect(api.listPolls('token', 1, {page: 0, size: 20, status: 'CLOSED'}))
      .rejects.toMatchObject({code: 'INVALID_SERVER_RESPONSE'});
  });

  it('rejects an admin assignment response that does not match campus, user, and active duty', async () => {
    const {api} = harness([
      {assignmentId: 9, campusId: 2, dutyType: 'MEAL', isActive: true, userId: 8, name: '담당자', email: 'meal@example.test'},
      {assignmentId: 9, campusId: 1, dutyType: 'MEAL', isActive: false, userId: 8, name: '담당자', email: 'meal@example.test'},
    ]);

    await expect(api.assignDuty('token', 1, {userId: 8})).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
    await expect(api.assignDuty('token', 1, {userId: 8})).rejects.toMatchObject({
      code: 'INVALID_SERVER_RESPONSE',
    });
  });

  it('binds a charge result to the requested poll, account, and exact groups', async () => {
    const base = chargeResult();
    const {api} = harness([
      {...base, pollId: 999},
      {...base, paymentAccountId: 11},
      {...base, groups: [{...base.groups[0], optionId: 1002}]},
      {...base, groups: [{...base.groups[0], enteredAmount: 12000, amountPerMember: 4000, requestedTotalAmount: 12000, actualTotalAmount: 12000, roundingAdjustment: 0}], requestedTotalAmount: 12000, actualTotalAmount: 12000, roundingAdjustment: 0},
    ]);
    const request = chargeRequest();

    for (let index = 0; index < 4; index += 1) {
      await expect(api.createCharges('token', 1, 101, request)).rejects.toMatchObject({
        code: 'INVALID_SERVER_RESPONSE',
      });
    }
  });

  it('reconstructs and validates a charge body before dispatch', async () => {
    const {api, requestSpy} = harness([chargeResult()]);
    const validRequest = chargeRequest();
    const requestWithExtra = {
      ...validRequest,
      internalNote: 'must not leave the device',
      groups: validRequest.groups.map((group) => ({...group, paymentAccountId: 77})),
    };

    await api.createCharges('token', 1, 101, requestWithExtra);
    expect(requestSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({body: chargeRequest()}),
    );

    for (const malformed of [
      {paymentAccountId: 10, groups: [chargeRequest().groups[0], chargeRequest().groups[0]]},
      {paymentAccountId: 10, groups: [{optionId: 1001, calculationType: 'INVALID', enteredAmount: 10000}]},
      {paymentAccountId: 10, groups: [{optionId: 1001, calculationType: 'GROUP_TOTAL', enteredAmount: 1.5}]},
      {paymentAccountId: 10, groups: [{optionId: 0, calculationType: 'GROUP_TOTAL', enteredAmount: 10000}]},
    ]) {
      const next = harness([]);
      expect(() => next.api.createCharges('token', 1, 101, malformed as MealChargeRequest)).toThrow();
      expect(next.requestSpy).not.toHaveBeenCalled();
    }
  });

  it('reconstructs account and poll creation bodies and rejects malformed polls before dispatch', async () => {
    const account = mealAccount();
    const createdPoll = mealDetail({status: 'OPEN'});
    const {api, requestSpy} = harness([account, createdPoll]);
    const accountWithExtra = {...accountCreate(), ownerUserId: 999};
    const pollWithExtra = {
      ...pollCreate(),
      startsAt: '2020-01-01T00:00:00.000Z',
      options: [{content: '한식', internalId: 1}, {content: '중식', internalId: 2}],
    };
    await api.createPaymentAccount('token', 1, 7, accountWithExtra);
    await api.createPoll('token', 1, pollWithExtra);

    expect(requestSpy.mock.calls[0]?.[1]).toEqual(expect.objectContaining({body: accountCreate()}));
    expect(requestSpy.mock.calls[1]?.[1]).toEqual(expect.objectContaining({body: pollCreate()}));

    for (const malformed of [
      {...pollCreate(), allowUserOptionAdd: 'true'},
      {...pollCreate(), endsAt: 'invalid'},
      {...pollCreate(), options: [{content: '한식'}, {content: ' 한식 '}]},
      {...pollCreate(), options: [{content: '한식'}]},
    ]) {
      const next = harness([]);
      expect(() => next.api.createPoll('token', 1, malformed as MealPollCreateRequest)).toThrow();
      expect(next.requestSpy).not.toHaveBeenCalled();
    }
  });
});

function harness(responses: unknown[]) {
  const requestSpy = vi.fn();
  const request: MealRequestDispatcher = async (path, options) => {
    requestSpy(path, options);
    return options.responseParser(responses.shift());
  };
  return {api: createMealApi({isMockMode: () => true, request}), requestSpy};
}

function mealAccount(patch: Record<string, unknown> = {}) {
  return {
    id: 10,
    campusId: 1,
    ownerUserId: 7,
    accountType: 'MEAL',
    nickname: '점심 계좌',
    bankName: '신한은행',
    accountNumber: '110-000-000000',
    accountHolder: '샘플 사용자',
    isActive: true,
    createdAt: '2026-07-13T03:00:00.000Z',
    deactivatedAt: null,
    ...patch,
  };
}

function accountCreate() {
  return {nickname: '점심 계좌', bankName: '신한은행', accountNumber: '110', accountHolder: '샘플 사용자'};
}

function mealPoll(patch: Record<string, unknown> = {}) {
  return {
    id: 101,
    campusId: 1,
    title: '점심 투표',
    description: null,
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    allowUserOptionAdd: true,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-14T01:00:00.000Z',
    status: 'CLOSED',
    settlementStatus: 'NOT_CHARGED',
    totalResponseCount: 3,
    ...patch,
  };
}

function mealDetail(patch: Record<string, unknown> = {}) {
  return {
    ...mealPoll(patch),
    options: [{optionId: 1001, content: '제육볶음', responseCount: 3, userAdded: false, charge: {chargeStatus: 'NOT_CHARGED'}}],
  };
}

function pollCreate() {
  return {title: '점심', description: '', endsAt: '2027-07-14T01:00:00.000Z', options: [{content: '한식'}, {content: '중식'}], allowUserOptionAdd: true};
}

function chargeRequest(): MealChargeRequest {
  return {paymentAccountId: 10, groups: [{optionId: 1001, calculationType: 'GROUP_TOTAL', enteredAmount: 10000}]};
}

function chargeResult() {
  return {
    pollId: 101,
    paymentAccountId: 10,
    chargedMemberCount: 3,
    requestedTotalAmount: 10000,
    actualTotalAmount: 10002,
    roundingAdjustment: 2,
    chargedAt: '2026-07-13T03:00:00.000Z',
    groups: [{optionId: 1001, calculationType: 'GROUP_TOTAL', responseCount: 3, enteredAmount: 10000, amountPerMember: 3334, requestedTotalAmount: 10000, actualTotalAmount: 10002, roundingAdjustment: 2}],
  };
}

function settlement(account: ReturnType<typeof mealAccount>) {
  return {
    accounts: [{account, charges: [], summary: {chargedMemberCount: 0, requestedTotalAmount: 0, actualTotalAmount: 0, roundingAdjustment: 0}}],
    summary: {chargedMemberCount: 0, requestedTotalAmount: 0, actualTotalAmount: 0, roundingAdjustment: 0},
  };
}
