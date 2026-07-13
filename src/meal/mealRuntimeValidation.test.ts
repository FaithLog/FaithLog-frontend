import {describe, expect, it} from 'vitest';

import {
  parseClosedMealPollDetail,
  parseCreatedMealPollDetail,
  parseMealPaymentAccounts,
  parseMealPollDetail,
  parseMealPollList,
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
});

function mealDetail(charge: Record<string, unknown>) {
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
