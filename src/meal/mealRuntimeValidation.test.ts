import {describe, expect, it} from 'vitest';

import {
  parseClosedMealPollDetail,
  parseCreatedMealPollDetail,
  parseMealChargeResult,
  parseMealPaymentAccounts,
  parseMealPollDetail,
  parseMealPollList,
  parseMealPollListForContext,
  parseMealSettlement,
  parseMyMealDutyAssignment,
} from './mealRuntimeValidation';

describe('MEAL runtime validation', () => {
  it('accepts active and inactive MEAL self duty responses without an assignment id', () => {
    expect(
      parseMyMealDutyAssignment({campusId: 1, dutyType: 'MEAL', isActive: true, userId: 7}),
    ).toMatchObject({dutyType: 'MEAL', isActive: true});
    expect(parseMyMealDutyAssignment({campusId: 1, dutyType: 'MEAL', isActive: false, userId: 7}).isActive).toBe(false);
    expect(() =>
      parseMyMealDutyAssignment({campusId: 1, dutyType: 'COFFEE', isActive: true, userId: 7}),
    ).toThrow('Invalid API response');
    expect(() =>
      parseMyMealDutyAssignment({assignmentId: 9, campusId: 1, dutyType: 'MEAL', isActive: true, userId: 7}),
    ).toThrow('Invalid API response');
  });

  it('requires OPEN create responses and CLOSED manual-close responses', () => {
    const open = mealMutation();

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
      title: '지난달 점심',
      startsAt: '2026-06-01T03:00:00.000Z',
      endsAt: '2026-06-01T04:00:00.000Z',
      status: 'CLOSED',
      settlementStatus: 'NOT_CHARGED',
    };

    expect(parseMealPollList({content: [poll], page: 0, size: 20, totalElements: 1, totalPages: 1}).content[0]).toEqual(poll);
    expect(() => parseMealPollList({content: [poll, {...poll}], page: 0, size: 20, totalElements: 2, totalPages: 1})).toThrowError(
      expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}),
    );
    expect(() => parseMealPollList({content: [{...poll, undocumented: true}], page: 0, size: 20, totalElements: 1, totalPages: 1})).toThrow('Invalid API response');
  });

  it('binds management list content to the requested status', () => {
    const poll = mealPollSummary({status: 'OPEN'});

    expect(() => parseMealPollListForContext(
      {content: [poll], page: 0, size: 20, totalElements: 1, totalPages: 1},
      {campusId: 1, page: 0, size: 20, status: 'CLOSED'},
    )).toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
  });

  it.each([
    ['inconsistent total page count', {content: [mealPollSummary()], page: 0, size: 20, totalElements: 100, totalPages: 1}],
    ['non-empty elements with zero pages', {content: [mealPollSummary()], page: 0, size: 20, totalElements: 1, totalPages: 0}],
    ['empty list with a nonzero total page count', {content: [], page: 0, size: 20, totalElements: 0, totalPages: 1}],
    ['out-of-bounds page', {content: [], page: 1, size: 20, totalElements: 1, totalPages: 1}],
    ['sparse first page', {content: [mealPollSummary()], page: 0, size: 20, totalElements: 2, totalPages: 1}],
  ])('rejects malformed pagination metadata: %s', (_label, payload) => {
    expect(() => parseMealPollList(payload)).toThrowError(
      expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}),
    );
  });

  it('accepts canonical empty and partially filled last pages', () => {
    expect(parseMealPollList({content: [], page: 0, size: 20, totalElements: 0, totalPages: 0}))
      .toMatchObject({page: 0, totalElements: 0, totalPages: 0});
    expect(parseMealPollList({
      content: [mealPollSummary({id: 121})],
      page: 1,
      size: 20,
      totalElements: 21,
      totalPages: 2,
    })).toMatchObject({page: 1, totalElements: 21, totalPages: 2});
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
    ['invalid charged arithmetic', (detail: ReturnType<typeof mealDetail>) => {
      detail.options[0]!.charge.actualTotalAmount = 9999;
    }],
    ['partial terminal settlement', (detail: ReturnType<typeof mealDetail>) => {
      detail.options.push({
        optionId: 1002,
        content: '김치찌개',
        responseCount: 1,
        userAdded: false,
        charge: notCharged(),
      });
    }],
    ['charged zero-response option', (detail: ReturnType<typeof mealDetail>) => {
      detail.options.push({
        optionId: 1002,
        content: '샐러드',
        responseCount: 0,
        userAdded: false,
        charge: {
          chargeStatus: 'CHARGED',
          chargedByMe: true,
          paymentAccountId: 10,
          calculationType: 'PER_MEMBER',
          enteredAmount: 8000,
          amountPerMember: 8000,
          requestedTotalAmount: 8000,
          actualTotalAmount: 8000,
          roundingAdjustment: 0,
          chargedAt: '2026-07-13T03:00:00.000Z',
        },
      });
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

  it('validates aggregate settlement member uniqueness and amount summaries', () => {
    const settlement = mealSettlement();
    expect(parseMealSettlement(settlement).summary.totalAmount).toBe(10002);

    expect(() => parseMealSettlement({
      ...settlement,
      members: [...settlement.members, {...settlement.members[0]}],
    })).toThrowError(expect.objectContaining({code: 'INVALID_SERVER_RESPONSE'}));
    expect(() => parseMealSettlement({
      ...settlement,
      summary: {...settlement.summary, totalAmount: 10001},
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
  const summary = {totalAmount: 10002, unpaidAmount: 10002, paidAmount: 0, waivedAmount: 0, canceledAmount: 0};
  return {
    campusId: 1,
    campusName: '서울캠퍼스',
    region: '서울',
    summary,
    members: [{userId: 7, name: '멤버', email: 'member@example.test', ...summary}],
    page: 0,
    size: 10,
    totalElements: 1,
    totalPages: 1,
  };
}

type MutableMealDetailFixture = {
  id: number;
  campusId: number;
  title: string;
  pollType: string;
  selectionType: string;
  isAnonymous: boolean;
  allowUserOptionAdd: boolean;
  startsAt: string;
  endsAt: string;
  status: string;
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
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-13T02:00:00.000Z',
    status: 'CLOSED',
    options: [
      {
        optionId: 1001,
        content: '제육볶음',
        responseCount: 3,
        userAdded: false,
        charge: charge.chargeStatus === 'NOT_CHARGED'
          ? notCharged()
          : {paymentAccountId: null, ...charge},
      },
    ],
  };
}

function mealPollSummary(patch: Record<string, unknown> = {}) {
  return {
    id: 101,
    title: '점심',
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-13T02:00:00.000Z',
    status: 'CLOSED',
    settlementStatus: 'NOT_CHARGED',
    ...patch,
  };
}

function mealMutation() {
  return {
    id: 101, campusId: 1, templateId: null, title: '점심', pollType: 'MEAL',
    selectionType: 'SINGLE', isAnonymous: false, allowUserOptionAdd: true,
    chargeGenerationType: 'NONE', paymentCategory: null, paymentAccountId: null,
    startsAt: '2026-07-13T01:00:00.000Z', endsAt: '2026-07-14T01:00:00.000Z',
    status: 'OPEN',
    options: [{id: 1001, content: '제육볶음', composeMenuCode: null, priceAmount: 0, sortOrder: 0, userAdded: false}],
  };
}

function notCharged() {
  return {chargeStatus: 'NOT_CHARGED', calculationType: null, enteredAmount: null, amountPerMember: null, requestedTotalAmount: null, actualTotalAmount: null, roundingAdjustment: null, paymentAccountId: null, chargedByMe: false, chargedAt: null};
}
