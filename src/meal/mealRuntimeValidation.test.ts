import {describe, expect, it} from 'vitest';

import {
  parseClosedMealPollDetail,
  parseCreatedMealPollDetail,
  parseMealChargeResult,
  parseMealPaymentAccounts,
  parseMealPollDetail,
  parseMealPollList,
  parseMealSettlement,
  parseMyMealDutyAssignment,
} from './mealRuntimeValidation';

describe('MEAL runtime validation', () => {
  it('accepts only an active MEAL self duty response', () => {
    expect(
      parseMyMealDutyAssignment({assignmentId: 9, campusId: 1, dutyType: 'MEAL', isActive: true, userId: 7}),
    ).toMatchObject({assignmentId: 9, dutyType: 'MEAL', isActive: true});
    expect(() =>
      parseMyMealDutyAssignment({assignmentId: 9, campusId: 1, dutyType: 'COFFEE', isActive: true, userId: 7}),
    ).toThrow('Invalid API response');
    expect(() =>
      parseMyMealDutyAssignment({assignmentId: 9, campusId: 1, dutyType: 'MEAL', isActive: false, userId: 7}),
    ).toThrow('Invalid API response');
  });

  it('requires OPEN create responses and CLOSED manual-close responses', () => {
    const open = mealDetail({chargeStatus: 'NOT_CHARGED'});
    open.status = 'OPEN';

    expect(parseCreatedMealPollDetail(open).status).toBe('OPEN');
    expect(() => parseClosedMealPollDetail(open)).toThrow('Invalid API response');

    const closed = {...open, status: 'CLOSED'};
    expect(parseClosedMealPollDetail(closed).status).toBe('CLOSED');
    expect(() => parseCreatedMealPollDetail(closed)).toThrow('Invalid API response');
  });

  it('validates own MEAL accounts without accepting a different category', () => {
    const account = {
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
    };

    expect(parseMealPaymentAccounts([account])).toEqual([account]);
    expect(() => parseMealPaymentAccounts([account, {...account}])).toThrowError(
      expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}),
    );
    expect(() => parseMealPaymentAccounts([{...account, accountType: 'COFFEE'}])).toThrow(
      'Invalid API response',
    );
  });

  it('keeps old CLOSED polls in the management payload and requires MEAL/SINGLE', () => {
    const poll = {
      id: 101,
      campusId: 1,
      title: '지난달 점심',
      description: null,
      pollType: 'MEAL',
      selectionType: 'SINGLE',
      allowUserOptionAdd: true,
      startsAt: '2026-06-01T03:00:00.000Z',
      endsAt: '2026-06-01T04:00:00.000Z',
      status: 'CLOSED',
      settlementStatus: 'NOT_CHARGED',
      totalResponseCount: 3,
    };

    expect(parseMealPollList({content: [poll], page: 0, size: 20, totalElements: 1, totalPages: 1}).content[0]).toEqual(poll);
    expect(() => parseMealPollList({content: [poll, {...poll}], page: 0, size: 20, totalElements: 2, totalPages: 1})).toThrowError(
      expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}),
    );
    expect(() => parseMealPollList({content: [{...poll, pollType: 'COFFEE'}], page: 0, size: 20, totalElements: 1, totalPages: 1})).toThrow('Invalid API response');
    expect(() => parseMealPollList({content: [{...poll, selectionType: 'MULTIPLE'}], page: 0, size: 20, totalElements: 1, totalPages: 1})).toThrow('Invalid API response');
  });

  it('rejects leaked account identifiers when another duty owner charged the poll', () => {
    const detail = mealDetail({
      chargeStatus: 'CHARGED',
      chargedByMe: false,
      paymentAccountId: 10,
      calculationType: 'GROUP_TOTAL',
      enteredAmount: 10000,
      amountPerMember: 3334,
      requestedTotalAmount: 10000,
      actualTotalAmount: 10002,
      roundingAdjustment: 2,
      chargedMemberCount: 3,
      chargedAt: '2026-07-13T03:00:00.000Z',
    });

    expect(() => parseMealPollDetail(detail)).toThrow('Invalid API response');
  });

  it('accepts chargedByMe=false only with private account details omitted', () => {
    const detail = mealDetail({
      chargeStatus: 'CHARGED',
      chargedByMe: false,
      calculationType: 'GROUP_TOTAL',
      enteredAmount: 10000,
      amountPerMember: 3334,
      requestedTotalAmount: 10000,
      actualTotalAmount: 10002,
      roundingAdjustment: 2,
      chargedMemberCount: 3,
      chargedAt: '2026-07-13T03:00:00.000Z',
    });

    expect(parseMealPollDetail(detail).options[0]?.charge).toMatchObject({
      chargedByMe: false,
      paymentAccountId: null,
    });
  });

  it.each([
    ['duplicate option ids', (detail: ReturnType<typeof mealDetail>) => {
      detail.options.push({...detail.options[0]!});
    }],
    ['response total mismatch', (detail: ReturnType<typeof mealDetail>) => {
      detail.totalResponseCount = 4;
    }],
    ['charged member mismatch', (detail: ReturnType<typeof mealDetail>) => {
      detail.options[0]!.charge.chargedMemberCount = 2;
    }],
    ['invalid charged arithmetic', (detail: ReturnType<typeof mealDetail>) => {
      detail.options[0]!.charge.actualTotalAmount = 9999;
    }],
    ['partial terminal settlement', (detail: ReturnType<typeof mealDetail>) => {
      detail.options.push({
        optionId: 1002,
        content: '김치찌개',
        responseCount: 1,
        userAdded: false,
        charge: {chargeStatus: 'NOT_CHARGED'},
      });
      detail.totalResponseCount = 4;
    }],
  ])('rejects INVALID_SERVER_RESPONSE for %s', (_label, mutate) => {
    const detail = mealDetail({
      chargeStatus: 'CHARGED',
      chargedByMe: true,
      paymentAccountId: 10,
      calculationType: 'GROUP_TOTAL',
      enteredAmount: 10000,
      amountPerMember: 3334,
      requestedTotalAmount: 10000,
      actualTotalAmount: 10002,
      roundingAdjustment: 2,
      chargedMemberCount: 3,
      chargedAt: '2026-07-13T03:00:00.000Z',
    });
    mutate(detail);

    expect(() => parseMealPollDetail(detail)).toThrowError(
      expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}),
    );
  });

  it('validates unique charge groups, safe arithmetic, and result totals', () => {
    const result = chargeResult();
    expect(parseMealChargeResult(result)).toMatchObject({actualTotalAmount: 10002});

    expect(() => parseMealChargeResult({
      ...result,
      groups: [...result.groups, {...result.groups[0]}],
    })).toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
    expect(() => parseMealChargeResult({...result, actualTotalAmount: 10001}))
      .toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
    expect(() => parseMealChargeResult({
      ...result,
      actualTotalAmount: Number.MAX_SAFE_INTEGER,
      requestedTotalAmount: Number.MAX_SAFE_INTEGER,
      groups: [{
        ...result.groups[0],
        calculationType: 'PER_MEMBER',
        enteredAmount: Number.MAX_SAFE_INTEGER,
        amountPerMember: Number.MAX_SAFE_INTEGER,
        requestedTotalAmount: Number.MAX_SAFE_INTEGER,
        actualTotalAmount: Number.MAX_SAFE_INTEGER,
        roundingAdjustment: 0,
      }],
    })).toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
  });

  it('validates settlement account/charge uniqueness and nested/global summaries', () => {
    const settlement = mealSettlement();
    expect(parseMealSettlement(settlement).summary.actualTotalAmount).toBe(10002);

    expect(() => parseMealSettlement({
      ...settlement,
      accounts: [...settlement.accounts, {...settlement.accounts[0]}],
    })).toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
    expect(() => parseMealSettlement({
      ...settlement,
      summary: {...settlement.summary, roundingAdjustment: 1},
    })).toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
    expect(() => parseMealSettlement({
      ...settlement,
      accounts: [{
        ...settlement.accounts[0],
        summary: {...settlement.accounts[0]!.summary, actualTotalAmount: 10001},
      }],
    })).toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
  });
});

function chargeResult() {
  return {
    pollId: 101,
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
  };
}

function mealSettlement() {
  const account = {
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
  };
  const charges = [3334, 3334, 3334].map((amount, index) => ({
    chargeId: 8000 + index,
    pollId: 101,
    pollTitle: '점심',
    optionContent: '제육볶음',
    memberName: `멤버 ${index + 1}`,
    amount,
    status: 'UNPAID',
    chargedAt: '2026-07-13T03:00:00.000Z',
  }));
  const summary = {
    chargedMemberCount: 3,
    requestedTotalAmount: 10000,
    actualTotalAmount: 10002,
    roundingAdjustment: 2,
  };
  return {accounts: [{account, charges, summary}], summary};
}

type MutableMealDetailFixture = {
  id: number;
  campusId: number;
  title: string;
  description: null;
  pollType: string;
  selectionType: string;
  allowUserOptionAdd: boolean;
  startsAt: string;
  endsAt: string;
  status: string;
  settlementStatus: string;
  totalResponseCount: number;
  options: Array<{
    optionId: number;
    content: string;
    responseCount: number;
    userAdded: boolean;
    charge: Record<string, unknown>;
  }>;
};

function mealDetail(charge: Record<string, unknown>): MutableMealDetailFixture {
  return {
    id: 101,
    campusId: 1,
    title: '점심',
    description: null,
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    allowUserOptionAdd: true,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-13T02:00:00.000Z',
    status: 'CLOSED',
    settlementStatus: charge.chargeStatus === 'CHARGED' ? 'CHARGED' : 'NOT_CHARGED',
    totalResponseCount: 3,
    options: [
      {
        optionId: 1001,
        content: '제육볶음',
        responseCount: 3,
        userAdded: false,
        charge: {paymentAccountId: null, ...charge},
      },
    ],
  };
}
