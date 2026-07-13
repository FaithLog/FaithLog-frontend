import {describe, expect, it} from 'vitest';

import type {ApiError} from '../api/types';
import {
  beginMealChargeSubmit,
  buildMealChargeConfirmation,
  buildMealChargeRequest,
  buildMealPollCreateRequest,
  calculateMealChargeGroup,
  createMealChargeSubmitGate,
  finishMealChargeSubmit,
  formatMealLocalDeadline,
  getMealErrorPresentation,
  notifyMealSessionExpired,
  parseMealLocalDeadline,
} from './mealModel';
import type {MealPollDetail} from './mealTypes';

describe('MEAL product contract', () => {
  it('creates MEAL polls with only the five approved fields and a future endsAt', () => {
    const request = buildMealPollCreateRequest(
      {
        allowUserOptionAdd: true,
        description: '점심 메뉴를 골라 주세요.',
        endsAt: '2026-07-14T03:00:00.000Z',
        options: ['제육볶음', '김치찌개'],
        title: '화요일 점심',
      },
      new Date('2026-07-13T03:00:00.000Z'),
    );

    expect(request).toEqual({
      title: '화요일 점심',
      description: '점심 메뉴를 골라 주세요.',
      endsAt: '2026-07-14T03:00:00.000Z',
      options: [{content: '제육볶음'}, {content: '김치찌개'}],
      allowUserOptionAdd: true,
    });
    expect(request).not.toHaveProperty('startsAt');
    expect(request).not.toHaveProperty('paymentAccountId');
    expect(request).not.toHaveProperty('amount');
    expect(request).not.toHaveProperty('selectionType');
  });

  it('rejects current/past endsAt and duplicate or blank options before dispatch', () => {
    const now = new Date('2026-07-13T03:00:00.000Z');
    const base = {
      allowUserOptionAdd: false,
      description: '',
      endsAt: '2026-07-13T03:00:00.000Z',
      options: ['제육볶음', '제육볶음'],
      title: '점심',
    };

    expect(() => buildMealPollCreateRequest(base, now)).toThrow('마감 시간');
    expect(() =>
      buildMealPollCreateRequest(
        {...base, endsAt: '2026-07-13T04:00:00.000Z'},
        now,
      ),
    ).toThrow('중복');
    expect(() =>
      buildMealPollCreateRequest(
        {...base, endsAt: '2026-07-13T04:00:00.000Z', options: [' ']},
        now,
      ),
    ).toThrow('선택지');
  });

  it('uses a localized date field contract and rejects impossible calendar dates', () => {
    const local = new Date(2026, 6, 14, 18, 5);
    expect(formatMealLocalDeadline(local)).toEqual({date: '2026년 7월 14일', time: '18:05'});
    expect(parseMealLocalDeadline({date: '2026년 7월 14일', time: '18:05'}))
      .toBe(local.toISOString());
    expect(() => parseMealLocalDeadline({date: '2026년 2월 30일', time: '18:05'}))
      .toThrow('올바른');
  });

  it('uses integer-only PER_MEMBER calculations', () => {
    expect(calculateMealChargeGroup('PER_MEMBER', 8000, 3)).toEqual({
      actualTotalAmount: 24000,
      amountPerMember: 8000,
      enteredAmount: 8000,
      requestedTotalAmount: 24000,
      roundingAdjustment: 0,
    });
  });

  it('rounds GROUP_TOTAL up using integer arithmetic', () => {
    expect(calculateMealChargeGroup('GROUP_TOTAL', 10000, 3)).toEqual({
      actualTotalAmount: 10002,
      amountPerMember: 3334,
      enteredAmount: 10000,
      requestedTotalAmount: 10000,
      roundingAdjustment: 2,
    });
    expect(calculateMealChargeGroup('GROUP_TOTAL', 9000, 3).amountPerMember).toBe(3000);
    expect(calculateMealChargeGroup('GROUP_TOTAL', 7000, 1).roundingAdjustment).toBe(0);
  });

  it('builds one batch with one common account and every responding option exactly once', () => {
    const request = buildMealChargeRequest(
      10,
      [
        {optionId: 1001, responseCount: 3},
        {optionId: 1002, responseCount: 2},
        {optionId: 1003, responseCount: 0},
      ],
      [
        {optionId: 1001, calculationType: 'GROUP_TOTAL', enteredAmount: 10000},
        {optionId: 1002, calculationType: 'PER_MEMBER', enteredAmount: 8000},
      ],
    );

    expect(request).toEqual({
      paymentAccountId: 10,
      groups: [
        {optionId: 1001, calculationType: 'GROUP_TOTAL', enteredAmount: 10000},
        {optionId: 1002, calculationType: 'PER_MEMBER', enteredAmount: 8000},
      ],
    });
    expect(request.groups).not.toContainEqual(expect.objectContaining({optionId: 1003}));
  });

  it('builds every final-confirmation amount and safe total from the request', () => {
    const detail: MealPollDetail = {
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
      settlementStatus: 'NOT_CHARGED',
      totalResponseCount: 3,
      options: [{
        optionId: 1001,
        content: '제육볶음',
        responseCount: 3,
        userAdded: false,
        charge: {chargeStatus: 'NOT_CHARGED'},
      }],
    };
    expect(buildMealChargeConfirmation(detail, {
      paymentAccountId: 10,
      groups: [{optionId: 1001, calculationType: 'GROUP_TOTAL', enteredAmount: 10000}],
    })).toEqual({
      groups: [{
        optionId: 1001,
        content: '제육볶음',
        responseCount: 3,
        calculationType: 'GROUP_TOTAL',
        enteredAmount: 10000,
        amountPerMember: 3334,
        requestedTotalAmount: 10000,
        actualTotalAmount: 10002,
        roundingAdjustment: 2,
      }],
      totals: {
        chargedMemberCount: 3,
        requestedTotalAmount: 10000,
        actualTotalAmount: 10002,
        roundingAdjustment: 2,
      },
    });
  });

  it('builds a batch from the eligible NOT_CHARGED option set only', () => {
    expect(
      buildMealChargeRequest(
        10,
        [
          {optionId: 1001, responseCount: 3},
          {optionId: 1003, responseCount: 0},
        ],
        [{optionId: 1001, calculationType: 'PER_MEMBER', enteredAmount: 8000}],
      ),
    ).toEqual({
      paymentAccountId: 10,
      groups: [{optionId: 1001, calculationType: 'PER_MEMBER', enteredAmount: 8000}],
    });
  });

  it('rejects omitted, duplicate, zero-responder, non-positive, and unsafe batch groups', () => {
    const options = [
      {optionId: 1, responseCount: 2},
      {optionId: 2, responseCount: 1},
      {optionId: 3, responseCount: 0},
    ];

    expect(() =>
      buildMealChargeRequest(10, options, [
        {optionId: 1, calculationType: 'PER_MEMBER', enteredAmount: 1000},
      ]),
    ).toThrow('모든');
    expect(() =>
      buildMealChargeRequest(10, options, [
        {optionId: 1, calculationType: 'PER_MEMBER', enteredAmount: 1000},
        {optionId: 1, calculationType: 'GROUP_TOTAL', enteredAmount: 2000},
        {optionId: 2, calculationType: 'PER_MEMBER', enteredAmount: 1000},
      ]),
    ).toThrow('중복');
    expect(() =>
      buildMealChargeRequest(10, options, [
        {optionId: 1, calculationType: 'PER_MEMBER', enteredAmount: 1000},
        {optionId: 2, calculationType: 'PER_MEMBER', enteredAmount: 1000},
        {optionId: 3, calculationType: 'PER_MEMBER', enteredAmount: 1000},
      ]),
    ).toThrow('응답자가 없는');
    expect(() => calculateMealChargeGroup('PER_MEMBER', 0, 2)).toThrow('양수');
    expect(() => calculateMealChargeGroup('PER_MEMBER', Number.MAX_SAFE_INTEGER, 2)).toThrow(
      '범위',
    );
  });

  it('blocks duplicate submits synchronously until the active operation finishes', () => {
    const gate = createMealChargeSubmitGate();
    const first = beginMealChargeSubmit(gate);

    expect(first).not.toBeNull();
    expect(beginMealChargeSubmit(gate)).toBeNull();
    expect(finishMealChargeSubmit(gate, first ?? -1)).toBe(true);
    expect(beginMealChargeSubmit(gate)).not.toBeNull();
  });

  it('lets a new poll/session charge identity supersede an old in-flight gate', () => {
    const gate = createMealChargeSubmitGate();
    const oldOperation = beginMealChargeSubmit(gate, 'campus:1/poll:101/session:3');
    expect(beginMealChargeSubmit(gate, 'campus:1/poll:101/session:3')).toBeNull();

    const currentOperation = beginMealChargeSubmit(gate, 'campus:2/poll:202/session:4');
    expect(currentOperation).not.toBeNull();
    expect(finishMealChargeSubmit(gate, oldOperation ?? -1)).toBe(false);
    expect(finishMealChargeSubmit(gate, currentOperation ?? -1)).toBe(true);
  });

  it.each([
    [{kind: 'error', status: 400, message: 'bad'} satisfies ApiError, '입력값'],
    [{kind: 'sessionExpired', status: 401, message: 'expired'} satisfies ApiError, '세션'],
    [{kind: 'permissionDenied', status: 403, message: 'forbidden'} satisfies ApiError, '밥 담당'],
    [{kind: 'error', status: 404, message: 'missing'} satisfies ApiError, '찾을 수'],
    [{kind: 'conflict', status: 409, message: 'conflict'} satisfies ApiError, '최신 상태'],
  ])('maps status-specific errors without treating non-401 as auth expiry', (error, phrase) => {
    expect(getMealErrorPresentation(error).message).toContain(phrase);
  });

  it('shows only typed local validation detail and keeps raw failures sanitized', () => {
    expect(getMealErrorPresentation({
      kind: 'error',
      status: 400,
      code: 'MEAL_LOCAL_VALIDATION',
      message: '마감 날짜를 입력해 주세요.',
    }).message).toBe('마감 날짜를 입력해 주세요.');
    expect(getMealErrorPresentation({
      kind: 'error',
      status: 400,
      message: 'raw parser stack',
    }).message).not.toContain('raw parser stack');
  });

  it('propagates only 401/sessionExpired errors to the auth gate', () => {
    const expiredMessages: string[] = [];
    const onSessionExpired = (message: string) => expiredMessages.push(message);

    notifyMealSessionExpired(
      {kind: 'sessionExpired', status: 401, message: 'expired'},
      onSessionExpired,
    );
    notifyMealSessionExpired(
      {kind: 'permissionDenied', status: 403, message: 'forbidden'},
      onSessionExpired,
    );
    notifyMealSessionExpired(
      {kind: 'conflict', status: 409, message: 'conflict'},
      onSessionExpired,
    );

    expect(expiredMessages).toEqual(['expired']);
  });
});
