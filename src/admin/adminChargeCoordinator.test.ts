import {describe, expect, it, vi} from 'vitest';

import type {
  AdminChargeStatusChangeResponse,
  ApiError,
  ChargeItem,
} from '../api/types';
import {
  buildAdminChargeDetailRequestKey,
  buildAdminChargeSummaryRequestKey,
  coordinateAdminChargeStatusMutation,
  createAdminChargeReadCoordinator,
  invalidateAdminChargeRead,
  refreshAdminChargeSurfaces,
  runLatestAdminChargeRead,
} from './adminChargeCoordinator';
import {
  createAdminChargeMutationGate,
  getAdminChargeStatusActions,
  invalidateAdminChargeMutation,
} from './adminChargeStatus';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return {promise, reject, resolve};
}

const filters = {
  keyword: '',
  paymentCategory: 'PENALTY' as const,
  status: 'UNPAID' as const,
  userId: '',
};

const targetCharge: ChargeItem = {
  id: 501,
  paymentCategory: 'PENALTY',
  title: '경건생활 벌금',
  reason: '주간 경건생활 미제출',
  amount: 3_000,
  status: 'UNPAID',
  paidAt: null,
};

const canceledResponse: AdminChargeStatusChangeResponse = {
  id: 501,
  campusId: 1,
  userId: 7,
  paymentCategory: 'PENALTY',
  title: targetCharge.title,
  reason: targetCharge.reason,
  amount: targetCharge.amount,
  status: 'CANCELED',
  paidAt: null,
};

const normalizeError = (error: unknown): ApiError =>
  typeof error === 'object' && error !== null && 'kind' in error && 'message' in error
    ? error as ApiError
    : {kind: 'error', message: '청구 상태를 변경하지 못했습니다.'};

describe('admin charge production coordinator', () => {
  it('keeps fresh summary B after mutation refresh when deferred A settles last', async () => {
    const reads = createAdminChargeReadCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const applied: string[] = [];
    const key = buildAdminChargeSummaryRequestKey({campusId: 1, generation: 3, filters});
    const requestB = vi.fn(() => second.promise);

    const loadA = runLatestAdminChargeRead({
      coordinator: reads,
      channel: 'summary',
      key,
      request: () => first.promise,
      normalizeError,
      canApplySuccess: () => true,
      canApplyError: () => true,
      onSuccess: (value) => applied.push(value),
      onError: vi.fn(),
    });
    const mutation = coordinateAdminChargeStatusMutation({
      gate: createAdminChargeMutationGate(),
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: async () => canceledResponse,
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted: () => invalidateAdminChargeRead(reads),
      onConflict: vi.fn(),
      onSessionExpired: vi.fn(),
      refresh: () => refreshAdminChargeSurfaces(
        () => runLatestAdminChargeRead({
          coordinator: reads,
          channel: 'summary',
          key,
          request: requestB,
          normalizeError,
          canApplySuccess: () => true,
          canApplyError: () => true,
          onSuccess: (value) => applied.push(value),
          onError: vi.fn(),
        }),
      ),
    });

    await vi.waitFor(() => expect(requestB).toHaveBeenCalledOnce());
    second.resolve('B:PAID');
    await expect(mutation).resolves.toMatchObject({
      kind: 'success',
      refresh: {kind: 'complete'},
    });
    first.resolve('A:UNPAID');
    await expect(loadA).resolves.toEqual({kind: 'stale'});
    expect(applied).toEqual(['B:PAID']);
  });

  it('uses member/filter identity and invalidation to discard stale detail reads', async () => {
    const reads = createAdminChargeReadCoordinator();
    const request = deferred<string>();
    const onSuccess = vi.fn();
    const key = buildAdminChargeDetailRequestKey({
      campusId: 1,
      generation: 3,
      filters,
      memberUserId: 7,
    });
    const load = runLatestAdminChargeRead({
      coordinator: reads,
      channel: 'detail',
      key,
      request: () => request.promise,
      normalizeError,
      canApplySuccess: () => true,
      canApplyError: () => true,
      onSuccess,
      onError: vi.fn(),
    });

    invalidateAdminChargeRead(reads, 'detail');
    request.resolve('late member 7');

    await expect(load).resolves.toEqual({kind: 'stale'});
    expect(onSuccess).not.toHaveBeenCalled();
    expect(key).not.toBe(
      buildAdminChargeDetailRequestKey({
        campusId: 1,
        generation: 3,
        filters,
        memberUserId: 8,
      }),
    );
  });

  it('runs request → sheet confirm → optimistic update → refresh once and blocks a rapid second confirm', async () => {
    const gate = createAdminChargeMutationGate();
    const mutation = deferred<AdminChargeStatusChangeResponse>();
    const events: string[] = ['button', 'sheet-open'];
    const mutate = vi.fn(() => mutation.promise);
    const refreshSummary = vi.fn(async () => ({kind: 'applied'} as const));
    const refreshDetail = vi.fn(async () => ({kind: 'applied'} as const));
    const refresh = () => refreshAdminChargeSurfaces(refreshSummary, refreshDetail);
    const input = {
      gate,
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY' as const,
        status: 'CANCELED' as const,
      },
      mutate,
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: () => events.push('busy'),
      onFinish: () => events.push('idle'),
      onAccepted: () => events.push('optimistic', 'sheet-close'),
      onConflict: vi.fn(),
      onSessionExpired: vi.fn(),
      refresh,
    };

    const first = coordinateAdminChargeStatusMutation(input);
    const second = coordinateAdminChargeStatusMutation(input);

    await expect(second).resolves.toEqual({kind: 'duplicate'});
    mutation.resolve(canceledResponse);
    await expect(first).resolves.toMatchObject({
      kind: 'success',
      response: {id: 501, status: 'CANCELED'},
      refresh: {kind: 'complete'},
    });
    expect(mutate).toHaveBeenCalledOnce();
    expect(refreshSummary).toHaveBeenCalledOnce();
    expect(refreshDetail).toHaveBeenCalledOnce();
    expect(events).toEqual([
      'button',
      'sheet-open',
      'busy',
      'optimistic',
      'sheet-close',
      'idle',
    ]);
  });

  it.each([
    ['id', {...canceledResponse, id: 999}],
    ['campus', {...canceledResponse, campusId: 2}],
    ['user', {...canceledResponse, userId: 8}],
    ['status', {...canceledResponse, status: 'UNPAID' as const}],
    ['category', {...canceledResponse, paymentCategory: 'COFFEE' as const}],
  ] as const)('fails closed on mismatched %s identity without success side effects', async (_field, response) => {
    const onAccepted = vi.fn();
    const refresh = vi.fn();

    const outcome = await coordinateAdminChargeStatusMutation({
      gate: createAdminChargeMutationGate(),
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: async () => response,
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted,
      onConflict: vi.fn(),
      onSessionExpired: vi.fn(),
      refresh,
    });

    expect(outcome).toMatchObject({
      kind: 'error',
      error: {code: 'INVALID_SERVER_RESPONSE'},
    });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('expires auth only for a current 401 and keeps 403 inline without refresh', async () => {
    const onSessionExpired = vi.fn();
    const refresh = vi.fn();
    const baseInput = {
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY' as const,
        status: 'CANCELED' as const,
      },
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted: vi.fn(),
      onConflict: vi.fn(),
      onSessionExpired,
      refresh,
    };

    const expired = await coordinateAdminChargeStatusMutation({
      ...baseInput,
      gate: createAdminChargeMutationGate(),
      mutate: async () => {
        throw {kind: 'sessionExpired', status: 401, message: 'expired'} satisfies ApiError;
      },
    });
    const forbidden = await coordinateAdminChargeStatusMutation({
      ...baseInput,
      gate: createAdminChargeMutationGate(),
      mutate: async () => {
        throw {kind: 'permissionDenied', status: 403, message: 'internal role'} satisfies ApiError;
      },
    });

    expect(expired).toMatchObject({kind: 'error', error: {status: 401}});
    expect(forbidden).toMatchObject({kind: 'error', error: {status: 403}});
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ignores a 401 from an obsolete auth lineage without expiring the current session', async () => {
    const onSessionExpired = vi.fn();

    const outcome = await coordinateAdminChargeStatusMutation({
      gate: createAdminChargeMutationGate(),
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: async () => {
        throw {kind: 'sessionExpired', status: 401, message: 'old session'} satisfies ApiError;
      },
      normalizeError,
      canApplySuccess: () => false,
      canHandleError: () => false,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted: vi.fn(),
      onConflict: vi.fn(),
      onSessionExpired,
      refresh: vi.fn(),
    });

    expect(outcome).toEqual({kind: 'stale'});
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('closes a stale 409 sheet, refreshes both surfaces, and hides terminal actions', async () => {
    const terminal = {...targetCharge, status: 'CANCELED' as const};
    const onConflict = vi.fn();
    const onSessionExpired = vi.fn();
    const refreshSummary = vi.fn(async () => ({kind: 'applied'} as const));
    const refreshDetail = vi.fn(async () => ({kind: 'applied'} as const));

    const outcome = await coordinateAdminChargeStatusMutation({
      gate: createAdminChargeMutationGate(),
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: async () => {
        throw {kind: 'conflict', status: 409, message: 'stale'} satisfies ApiError;
      },
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted: vi.fn(),
      onConflict,
      onSessionExpired,
      refresh: () => refreshAdminChargeSurfaces(refreshSummary, refreshDetail),
    });

    expect(outcome).toMatchObject({kind: 'conflict', refresh: {kind: 'complete'}});
    expect(onConflict).toHaveBeenCalledOnce();
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(refreshSummary).toHaveBeenCalledOnce();
    expect(refreshDetail).toHaveBeenCalledOnce();
    expect(getAdminChargeStatusActions(terminal, {paidStatusEnabled: true})).not.toContain('PAID');
  });

  it('keeps mutation success distinct when only one post-success refresh fails', async () => {
    const outcome = await coordinateAdminChargeStatusMutation({
      gate: createAdminChargeMutationGate(),
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: async () => canceledResponse,
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted: vi.fn(),
      onConflict: vi.fn(),
      onSessionExpired: vi.fn(),
      refresh: () => refreshAdminChargeSurfaces(
        async () => ({kind: 'applied'}),
        async () => ({
          kind: 'failed',
          error: {kind: 'offline', message: 'offline'},
        }),
      ),
    });

    expect(outcome).toMatchObject({kind: 'success', refresh: {kind: 'partial'}});
  });

  it('reports a 409 refresh failure separately from the original state conflict', async () => {
    const outcome = await coordinateAdminChargeStatusMutation({
      gate: createAdminChargeMutationGate(),
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: async () => {
        throw {kind: 'conflict', status: 409, message: 'stale'} satisfies ApiError;
      },
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted: vi.fn(),
      onConflict: vi.fn(),
      onSessionExpired: vi.fn(),
      refresh: () => refreshAdminChargeSurfaces(
        async () => ({kind: 'applied'}),
        async () => ({
          kind: 'failed',
          error: {kind: 'offline', message: 'offline'},
        }),
      ),
    });

    expect(outcome).toMatchObject({
      kind: 'conflict',
      error: {status: 409},
      refresh: {kind: 'partial'},
    });
  });

  it('discards a late mutation success after campus invalidation', async () => {
    const gate = createAdminChargeMutationGate();
    const mutation = deferred<AdminChargeStatusChangeResponse>();
    const onAccepted = vi.fn();
    const refresh = vi.fn();
    const operation = coordinateAdminChargeStatusMutation({
      gate,
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: () => mutation.promise,
      normalizeError,
      canApplySuccess: () => false,
      canHandleError: () => false,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted,
      onConflict: vi.fn(),
      onSessionExpired: vi.fn(),
      refresh,
    });

    invalidateAdminChargeMutation(gate);
    mutation.resolve(canceledResponse);

    await expect(operation).resolves.toEqual({kind: 'stale'});
    expect(onAccepted).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
