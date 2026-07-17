import {describe, expect, it, vi} from 'vitest';

import type {
  AdminCampusChargeSummary,
  AdminChargeStatusChangeResponse,
  ApiError,
  ChargeItem,
} from '../api/types';
import {
  applyAdminChargeFilterChange,
  buildAdminChargeDetailRequestKey,
  buildAdminChargeSummaryRequestKey,
  commitAdminChargeCampusIdentity,
  coordinateAdminChargeStatusMutation,
  createAdminChargeViewIdentity,
  createAdminChargeReadCoordinator,
  getAdminChargeRefreshIdentity,
  invalidateAdminChargeRead,
  isAdminChargeDetailRequestKeyCurrent,
  isAdminChargeSummaryRequestKeyCurrent,
  refreshAdminChargeSurfaces,
  runLatestAdminChargeRead,
  selectAdminChargeStatusRequest,
  selectAdminCampusChargeRowsForDisplay,
  setAdminChargeViewDetail,
  setAdminChargeViewFilters,
} from './adminChargeCoordinator';
import {
  beginAdminChargeMutation,
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
  reason: '주간 경건생활 미제출',
  amount: targetCharge.amount,
  status: 'CANCELED',
  paidAt: null,
};

const normalizeError = (error: unknown): ApiError =>
  typeof error === 'object' && error !== null && 'kind' in error && 'message' in error
    ? error as ApiError
    : {kind: 'error', message: '청구 상태를 변경하지 못했습니다.'};

describe('admin charge production coordinator', () => {
  it('keeps the server aggregate authoritative when the current page contains only 20 members', () => {
    const members = Array.from({length: 20}, (_, index) => ({
      userId: index + 1,
      name: `member-${index + 1}`,
      email: `member-${index + 1}@example.test`,
      totalAmount: 1_000,
      unpaidAmount: index === 0 ? 0 : 1_000,
      paidAmount: index === 0 ? 1_000 : 0,
      waivedAmount: 0,
      canceledAmount: 0,
    }));
    const serverSummary = {
      totalAmount: 21_000,
      unpaidAmount: 20_000,
      paidAmount: 1_000,
      waivedAmount: 0,
      canceledAmount: 0,
    };
    const page: AdminCampusChargeSummary = {
      campusId: 1,
      campusName: '샘플 캠퍼스',
      region: '서울',
      summary: serverSummary,
      members,
      page: 0,
      size: 20,
      totalElements: members.length,
      totalPages: 1,
    };

    const display = selectAdminCampusChargeRowsForDisplay(page, 'UNPAID');

    expect(display.members).toHaveLength(19);
    expect(display.members).not.toContainEqual(expect.objectContaining({userId: 1}));
    expect(display.summary).toBe(serverSummary);
    expect(display.summary).toEqual({
      totalAmount: 21_000,
      unpaidAmount: 20_000,
      paidAmount: 1_000,
      waivedAmount: 0,
      canceledAmount: 0,
    });
  });

  it('keeps committed campus identity unchanged for an abandoned render and invalidates only on commit', async () => {
    const reads = createAdminChargeReadCoordinator();
    const gate = createAdminChargeMutationGate();
    const committedCampusId = {current: 1};
    const abandonedRenderCampusId = 2;
    const first = deferred<string>();
    const applied: string[] = [];
    const load = runLatestAdminChargeRead({
      coordinator: reads,
      channel: 'summary',
      key: buildAdminChargeSummaryRequestKey({campusId: 1, generation: 3, filters}),
      request: () => first.promise,
      normalizeError,
      canApplySuccess: () => committedCampusId.current === 1,
      canApplyError: () => committedCampusId.current === 1,
      onSuccess: (value) => applied.push(value),
      onError: vi.fn(),
    });

    expect(abandonedRenderCampusId).toBe(2);
    expect(committedCampusId.current).toBe(1);
    first.resolve('campus A');
    await expect(load).resolves.toEqual({kind: 'applied'});
    expect(applied).toEqual(['campus A']);

    const second = deferred<string>();
    const staleLoad = runLatestAdminChargeRead({
      coordinator: reads,
      channel: 'summary',
      key: buildAdminChargeSummaryRequestKey({campusId: 1, generation: 3, filters}),
      request: () => second.promise,
      normalizeError,
      canApplySuccess: () => committedCampusId.current === 1,
      canApplyError: () => committedCampusId.current === 1,
      onSuccess: (value) => applied.push(value),
      onError: vi.fn(),
    });
    const onCommit = vi.fn();
    const operationId = beginAdminChargeMutation(gate);
    expect(operationId).toBe(1);
    expect(commitAdminChargeCampusIdentity({
      committedCampusId,
      coordinator: reads,
      gate,
      nextCampusId: 2,
      onCommit,
    })).toBe(true);
    expect(committedCampusId.current).toBe(2);
    expect(gate.activeOperationId).toBeNull();
    second.resolve('late campus A');
    await expect(staleLoad).resolves.toEqual({kind: 'stale'});
    expect(applied).toEqual(['campus A']);
    expect(commitAdminChargeCampusIdentity({
      committedCampusId,
      coordinator: reads,
      gate,
      nextCampusId: 2,
      onCommit,
    })).toBe(false);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('hides old rows synchronously and dispatches only the latest keyword after 350ms', async () => {
    vi.useFakeTimers();
    try {
      const reads = createAdminChargeReadCoordinator();
      let visibleRows = ['old member'];
      const onLoad = vi.fn();
      const firstFilters = {...filters, keyword: 'jo'};
      const secondFilters = {...filters, keyword: 'joseph'};

      let timer = applyAdminChargeFilterChange({
        coordinator: reads,
        currentTimer: null,
        key: 'keyword',
        nextFilters: firstFilters,
        onLoad,
        onVisibleStateChange: () => {
          visibleRows = [];
        },
      });

      expect(visibleRows).toEqual([]);
      expect(onLoad).not.toHaveBeenCalled();

      timer = applyAdminChargeFilterChange({
        coordinator: reads,
        currentTimer: timer,
        key: 'keyword',
        nextFilters: secondFilters,
        onLoad,
        onVisibleStateChange: () => {
          visibleRows = [];
        },
      });
      expect(timer).not.toBeNull();

      await vi.advanceTimersByTimeAsync(349);
      expect(onLoad).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(onLoad).toHaveBeenCalledOnce();
      expect(onLoad).toHaveBeenCalledWith(secondFilters);
    } finally {
      vi.useRealTimers();
    }
  });

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

  it('refreshes the current B filters when a mutation that started under A resolves', async () => {
    const reads = createAdminChargeReadCoordinator();
    const gate = createAdminChargeMutationGate();
    const mutationResponse = deferred<AdminChargeStatusChangeResponse>();
    const lateA = deferred<string>();
    const filtersA = {...filters, status: 'UNPAID'};
    const filtersB = {...filters, status: 'CANCELED'};
    const viewIdentity = createAdminChargeViewIdentity(filtersA);
    setAdminChargeViewDetail(viewIdentity, {userId: 7});
    const applied: string[] = [];
    const refreshedStatuses: string[] = [];
    const keyFor = (currentFilters: typeof filtersA) =>
      buildAdminChargeSummaryRequestKey({
        campusId: 1,
        generation: 3,
        filters: currentFilters,
      });
    const loadA = runLatestAdminChargeRead({
      coordinator: reads,
      channel: 'summary',
      key: keyFor(filtersA),
      request: () => lateA.promise,
      normalizeError,
      canApplySuccess: () => true,
      canApplyError: () => true,
      onSuccess: (value) => applied.push(value),
      onError: vi.fn(),
    });
    const mutation = coordinateAdminChargeStatusMutation({
      gate,
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: 501,
        paymentCategory: 'PENALTY',
        status: 'CANCELED',
      },
      mutate: () => mutationResponse.promise,
      normalizeError,
      canApplySuccess: () => true,
      canHandleError: () => true,
      onStart: vi.fn(),
      onFinish: vi.fn(),
      onAccepted: () => invalidateAdminChargeRead(reads),
      onConflict: vi.fn(),
      onSessionExpired: vi.fn(),
      refresh: () => {
        const current = getAdminChargeRefreshIdentity(viewIdentity);
        refreshedStatuses.push(current.filters.status);
        return refreshAdminChargeSurfaces(() => runLatestAdminChargeRead({
          coordinator: reads,
          channel: 'summary',
          key: keyFor(current.filters),
          request: async () => `refresh:${current.filters.status}`,
          normalizeError,
          canApplySuccess: () =>
            isAdminChargeSummaryRequestKeyCurrent({
              campusId: 1,
              generation: 3,
              identity: viewIdentity,
              key: keyFor(current.filters),
            }),
          canApplyError: () => true,
          onSuccess: (value) => applied.push(value),
          onError: vi.fn(),
        }));
      },
    });

    setAdminChargeViewFilters(viewIdentity, filtersB);
    expect(getAdminChargeRefreshIdentity(viewIdentity)).toEqual({
      detail: null,
      filters: filtersB,
    });
    const loadB = runLatestAdminChargeRead({
      coordinator: reads,
      channel: 'summary',
      key: keyFor(filtersB),
      request: async () => 'B:CANCELED',
      normalizeError,
      canApplySuccess: () => true,
      canApplyError: () => true,
      onSuccess: (value) => applied.push(value),
      onError: vi.fn(),
    });
    await expect(loadB).resolves.toEqual({kind: 'applied'});

    mutationResponse.resolve(canceledResponse);
    await expect(mutation).resolves.toMatchObject({
      kind: 'success',
      refresh: {kind: 'complete'},
    });
    lateA.resolve('late A:UNPAID');
    await expect(loadA).resolves.toEqual({kind: 'stale'});

    expect(refreshedStatuses).toEqual(['CANCELED']);
    expect(applied).toEqual(['B:CANCELED', 'refresh:CANCELED']);
  });

  it('uses member/filter identity and invalidation to discard stale detail reads', async () => {
    const reads = createAdminChargeReadCoordinator();
    const request = deferred<string>();
    const onSuccess = vi.fn();
    const viewIdentity = createAdminChargeViewIdentity(filters);
    setAdminChargeViewDetail(viewIdentity, {userId: 7});
    const key = buildAdminChargeDetailRequestKey({
      campusId: 1,
      generation: 3,
      filters,
      memberUserId: 7,
    });
    expect(isAdminChargeDetailRequestKeyCurrent({
      campusId: 1,
      generation: 3,
      identity: viewIdentity,
      key,
    })).toBe(true);
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
    setAdminChargeViewFilters(viewIdentity, {...filters, status: 'CANCELED'});
    expect(isAdminChargeDetailRequestKeyCurrent({
      campusId: 1,
      generation: 3,
      identity: viewIdentity,
      key,
    })).toBe(false);
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
    const events: string[] = [];
    const sheetTarget = selectAdminChargeStatusRequest({
      actionIdle: true,
      capabilities: {paidStatusEnabled: true},
      charge: targetCharge,
      mutationActive: false,
      status: 'CANCELED',
    });
    const mutate = vi.fn(() => mutation.promise);
    const refreshSummary = vi.fn(async () => ({kind: 'applied'} as const));
    const refreshDetail = vi.fn(async () => ({kind: 'applied'} as const));
    const refresh = () => refreshAdminChargeSurfaces(refreshSummary, refreshDetail);
    expect(sheetTarget).toEqual({charge: targetCharge, status: 'CANCELED'});
    if (!sheetTarget) {
      throw new Error('Expected the production request boundary to open the sheet.');
    }
    events.push('sheet-open');

    const input = {
      gate,
      expected: {
        campusId: 1,
        userId: 7,
        chargeItemId: sheetTarget.charge.id,
        paymentCategory: sheetTarget.charge.paymentCategory,
        status: sheetTarget.status,
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

  it('suppresses the 409 completion outcome when navigation supersedes its refresh', async () => {
    const onConflict = vi.fn();
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
      onSessionExpired: vi.fn(),
      refresh: () => refreshAdminChargeSurfaces(
        async () => ({kind: 'stale'}),
        async () => ({kind: 'stale'}),
      ),
    });

    expect(outcome).toEqual({kind: 'stale'});
    expect(onConflict).toHaveBeenCalledOnce();
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
