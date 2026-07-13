import {describe, expect, it, vi} from 'vitest';

import type {ApiError, ChargeItem} from '../api/types';
import {
  beginAdminChargeMutation,
  createAdminChargeMutationGate,
  getAdminChargeStatusActions,
  getAdminChargeStatusConfirmation,
  getAdminChargeStatusErrorMessage,
  finishAdminChargeMutation,
  invalidateAdminChargeMutation,
  isAdminChargeMutationCurrent,
  refreshAdminChargeViews,
  shouldExpireAdminChargeSession,
} from './adminChargeStatus';

const unpaidPenalty: ChargeItem = {
  id: 501,
  paymentCategory: 'PENALTY',
  title: '경건생활 벌금',
  reason: '주간 경건생활 미제출',
  amount: 3_000,
  status: 'UNPAID',
  paidAt: null,
  source: {sourceType: 'DEVOTION_RECORD', sourceId: 41},
};

describe('admin charge status flow', () => {
  it('adds PAID and CANCELED only for UNPAID while preserving existing status actions', () => {
    expect(getAdminChargeStatusActions(unpaidPenalty)).toEqual(['PAID', 'WAIVED', 'CANCELED']);

    for (const status of ['PAID', 'WAIVED', 'CANCELED'] as const) {
      const actions = getAdminChargeStatusActions({...unpaidPenalty, status});

      expect(actions).toEqual(['UNPAID']);
      expect(actions).not.toContain('PAID');
    }
  });

  it('uses the exact devotion reopen copy only for PENALTY cancellation', () => {
    expect(
      getAdminChargeStatusConfirmation(unpaidPenalty, 'CANCELED', {
        devotionReopenEnabled: true,
      }),
    ).toEqual({
      title: '경건생활 벌금을 취소할까요?',
      messages: [
        '벌금이 취소됩니다.',
        '해당 사용자는 그 주의 경건생활을 다시 수정하고 제출할 수 있습니다.',
      ],
    });

    expect(
      getAdminChargeStatusConfirmation(unpaidPenalty, 'CANCELED', {
        devotionReopenEnabled: false,
      }).messages,
    ).toEqual(['벌금이 취소됩니다.']);

    expect(
      getAdminChargeStatusConfirmation(
        {...unpaidPenalty, paymentCategory: 'COFFEE', title: '커피 청구'},
        'CANCELED',
      ).messages,
    ).toEqual(['청구가 취소됩니다.']);
    expect(
      getAdminChargeStatusConfirmation(
        {...unpaidPenalty, source: {sourceType: 'OTHER', sourceId: 41}},
        'CANCELED',
      ).messages,
    ).toEqual(['청구가 취소됩니다.']);
    expect(getAdminChargeStatusConfirmation(unpaidPenalty, 'WAIVED').messages).not.toContain(
      '해당 사용자는 그 주의 경건생활을 다시 수정하고 제출할 수 있습니다.',
    );
  });

  it('keeps bad request, permission, not found, conflict, and pending-contract errors distinct', () => {
    const cases: Array<[ApiError, string]> = [
      [
        {kind: 'error', status: 400, code: 'BILLING_INVALID_STATUS', message: '상태 값이 올바르지 않습니다.'},
        '상태 값이 올바르지 않습니다.',
      ],
      [
        {kind: 'permissionDenied', status: 403, code: 'BILLING_FORBIDDEN', message: '청구 상태 변경 권한이 없습니다.'},
        '청구 상태 변경 권한이 없습니다.',
      ],
      [
        {kind: 'error', status: 404, code: 'BILLING_CHARGE_NOT_FOUND', message: '청구를 찾을 수 없습니다.'},
        '청구를 찾을 수 없습니다. 캠퍼스 범위와 최신 목록을 확인해 주세요.',
      ],
      [
        {kind: 'conflict', status: 409, code: 'BILLING_INVALID_STATUS_TRANSITION', message: '이미 처리된 청구입니다.'},
        '청구 상태가 이미 변경되었습니다. 목록과 상세를 다시 불러와 주세요.',
      ],
      [
        {kind: 'error', code: 'API_CONTRACT_PENDING', message: '계약 확인 전입니다.'},
        '관리자 납부 완료 API 계약이 아직 확정되지 않아 production 요청을 보내지 않았습니다.',
      ],
    ];

    for (const [error, message] of cases) {
      expect(getAdminChargeStatusErrorMessage(error)).toBe(message);
    }
  });

  it('expires auth only for a 401 session-expired error', () => {
    expect(
      shouldExpireAdminChargeSession({
        kind: 'sessionExpired',
        status: 401,
        message: '세션이 만료되었습니다.',
      }),
    ).toBe(true);
    expect(
      shouldExpireAdminChargeSession({
        kind: 'permissionDenied',
        status: 403,
        message: '권한이 없습니다.',
      }),
    ).toBe(false);
    expect(
      shouldExpireAdminChargeSession({
        kind: 'conflict',
        status: 409,
        message: '충돌했습니다.',
      }),
    ).toBe(false);
  });

  it('blocks duplicate confirmation taps and invalidates stale campus operations', () => {
    const gate = createAdminChargeMutationGate();
    const operationId = beginAdminChargeMutation(gate);

    expect(operationId).toBe(1);
    if (operationId === null) {
      throw new Error('Expected the first admin charge mutation to start.');
    }
    expect(beginAdminChargeMutation(gate)).toBeNull();
    expect(isAdminChargeMutationCurrent(gate, operationId)).toBe(true);

    invalidateAdminChargeMutation(gate);

    expect(isAdminChargeMutationCurrent(gate, operationId)).toBe(false);
    expect(finishAdminChargeMutation(gate, operationId)).toBe(false);
    expect(beginAdminChargeMutation(gate)).toBe(3);
  });

  it('refreshes both admin charge summary and open member detail after success', async () => {
    const refreshSummary = vi.fn(async () => undefined);
    const refreshDetail = vi.fn(async () => undefined);

    await refreshAdminChargeViews(refreshSummary, refreshDetail);

    expect(refreshSummary).toHaveBeenCalledOnce();
    expect(refreshDetail).toHaveBeenCalledOnce();
  });
});
