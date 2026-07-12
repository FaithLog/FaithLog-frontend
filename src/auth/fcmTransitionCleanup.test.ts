import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({obligations: null as unknown[] | null}));
const capturePendingFcmOperations = vi.hoisted(() => vi.fn());
const compensateCapturedFcmOperations = vi.hoisted(() => vi.fn());

vi.mock('../api/tokenStorage', () => ({
  clearFcmRemoteCleanupPending: vi.fn(async () => { state.obligations = null; }),
  clearFcmRemoteCleanupObligations: vi.fn(async (cleared: unknown[]) => {
    if (!state.obligations) return;
    const identity = (value: unknown) => {
      const entry = value as Record<string, unknown>;
      return [entry.userId, entry.clientInstanceId, entry.kind, entry.token].join('|');
    };
    const clearedIdentities = new Set(cleared.map(identity));
    state.obligations = state.obligations.filter(
      (entry) => !clearedIdentities.has(identity(entry)),
    );
    if (state.obligations.length === 0) state.obligations = null;
  }),
  getFcmRemoteCleanupObligations: vi.fn(async () => state.obligations),
  getFcmAccountDeletionClaimCleanupReceipts: vi.fn(async () => null),
  completeFcmAccountDeletionClaim: vi.fn(async () => undefined),
  completeFcmAccountDeletionClaimAfterCleanup: vi.fn(async () => undefined),
  markFcmRemoteCleanupPending: vi.fn(async (obligations: unknown[] = []) => {
    state.obligations = obligations.length > 0 ? obligations : state.obligations ?? [];
  }),
}));

vi.mock('../notifications/fcmRegistration', () => ({
  capturePendingFcmOperations,
  compensateCapturedFcmOperations,
}));

import {
  beginFcmTransitionCleanup,
  configureFcmTransitionCleanup,
  resetFcmTransitionCleanupForTests,
  waitForFcmTransitionCleanup,
} from './fcmTransitionCleanup';

describe('shared FCM auth-transition cleanup', () => {
  beforeEach(() => {
    state.obligations = null;
    vi.clearAllMocks();
    resetFcmTransitionCleanupForTests();
    compensateCapturedFcmOperations.mockResolvedValue([]);
    capturePendingFcmOperations.mockReturnValue({
      barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
    });
    configureFcmTransitionCleanup({
      capture: capturePendingFcmOperations,
      compensate: compensateCapturedFcmOperations,
    });
  });

  it('blocks auth entry until central cleanup compensation settles', async () => {
    let finishBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => { finishBarrier = resolve; });
    capturePendingFcmOperations.mockReturnValueOnce({
      barrier,
      obligations: [{
        accessToken: 'old-access', clientInstanceId: 'old-client',
        kind: 'registration', token: 'old-token', tokenId: null,
        state: 'mayHaveSent',
      }],
      settlement: barrier.then(() => [{
        accessToken: 'old-access', clientInstanceId: 'old-client',
        kind: 'registration', token: 'old-token', tokenId: null,
        state: 'mayHaveSent',
      }]),
      hasPendingOperations: true,
    });
    const cleanup = beginFcmTransitionCleanup();
    const waiting = waitForFcmTransitionCleanup(5_000);
    let completed = false;
    void waiting.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(state.obligations).not.toBeNull();
    finishBarrier();
    await cleanup;
    await expect(waiting).resolves.toBe(true);
    expect(compensateCapturedFcmOperations).toHaveBeenCalledOnce();
    expect(state.obligations).toBeNull();
  });

  it('clears a cleaned obligation created dynamically after an empty capture', async () => {
    let finish!: () => void;
    const barrier = new Promise<void>((resolve) => { finish = resolve; });
    const dynamic = {
      accessToken: 'old-access', clientInstanceId: 'old-client', userId: 42,
      kind: 'deactivation' as const, token: null, tokenId: 77,
      state: 'cleaned' as const,
    };
    capturePendingFcmOperations.mockReturnValueOnce({
      barrier,
      obligations: [],
      settlement: barrier.then(() => [dynamic]),
      hasPendingOperations: true,
    });
    // The captured context persists its dynamic pre-send receipt.
    state.obligations = [dynamic];
    const cleanup = beginFcmTransitionCleanup(7);
    finish();
    await cleanup;

    expect(compensateCapturedFcmOperations).toHaveBeenCalledWith([dynamic]);
    expect(state.obligations).toBeNull();
  });

  it('joins an obligation-free context without creating an empty durable gate', async () => {
    capturePendingFcmOperations.mockReturnValueOnce({
      barrier: Promise.resolve(),
      obligations: [],
      settlement: Promise.resolve([]),
      hasPendingOperations: false,
      hasPendingContexts: true,
    });
    await beginFcmTransitionCleanup(7);
    expect(compensateCapturedFcmOperations).not.toHaveBeenCalled();
    expect(state.obligations).toBeNull();
    await expect(waitForFcmTransitionCleanup(5_000)).resolves.toBe(true);
  });

  it.each(['timeout', 'server-500'] as const)(
    'keeps a durable restart gate across module-memory reset after %s',
    async (failure) => {
      vi.useFakeTimers();
      try {
        const barrier = failure === 'timeout'
          ? new Promise<void>(() => {})
          : Promise.resolve();
        const obligation = {
          accessToken: 'old-access', clientInstanceId: 'old-client',
          kind: 'registration' as const, token: 'old-token', tokenId: null,
          state: 'mayHaveSent' as const,
        };
        capturePendingFcmOperations.mockReturnValueOnce({
          barrier,
          obligations: [obligation],
          settlement: Promise.resolve([obligation]),
          hasPendingOperations: true,
        });
        if (failure === 'server-500') {
          compensateCapturedFcmOperations.mockRejectedValueOnce(new Error('server 500'));
        }
        const cleanup = beginFcmTransitionCleanup();
        if (failure === 'timeout') {
          const waiting = waitForFcmTransitionCleanup(5_000);
          await vi.advanceTimersByTimeAsync(5_000);
          await expect(waiting).resolves.toBe(false);
        } else {
          await expect(cleanup).rejects.toThrow('server 500');
        }
        expect(state.obligations).not.toBeNull();
        resetFcmTransitionCleanupForTests();
        let finishReconcile!: () => void;
        compensateCapturedFcmOperations.mockReturnValueOnce(
          new Promise((resolve) => { finishReconcile = () => resolve([]); }),
        );
        const restartedWait = waitForFcmTransitionCleanup(5_000);
        let restartedCompleted = false;
        void restartedWait.then(() => { restartedCompleted = true; });
        await Promise.resolve();
        expect(restartedCompleted).toBe(false);
        finishReconcile();
        await expect(restartedWait).resolves.toBe(true);
        expect(state.obligations).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('bounds durable reconciliation itself and shares it across concurrent auth entries', async () => {
    vi.useFakeTimers();
    try {
      state.obligations = [{
        accessToken: 'old-access', refreshToken: 'old-refresh', userId: null,
        clientInstanceId: null, kind: 'clientLogout', token: null, tokenId: null,
      }];
      compensateCapturedFcmOperations.mockReturnValue(new Promise(() => {}));
      const first = waitForFcmTransitionCleanup(5_000);
      const second = waitForFcmTransitionCleanup(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(false);
      expect(compensateCapturedFcmOperations).toHaveBeenCalledOnce();
      expect(state.obligations).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('single-flights duplicate transition cleanup for the same generation', async () => {
    let finish!: () => void;
    const barrier = new Promise<void>((resolve) => { finish = resolve; });
    capturePendingFcmOperations.mockReturnValue({
      barrier,
      obligations: [{
        accessToken: 'old-access', refreshToken: 'old-refresh', userId: 42,
        clientInstanceId: 'old-client', kind: 'registration', token: 'old-token',
        tokenId: null, state: 'mayHaveSent',
      }],
      settlement: barrier.then(() => []),
      hasPendingOperations: true,
    });
    const first = beginFcmTransitionCleanup(7);
    const second = beginFcmTransitionCleanup(7);
    expect(second).toBe(first);
    expect(capturePendingFcmOperations).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(state.obligations).toBeNull();
  });

  it('clears obligations introduced by compensation in the same reconciliation', async () => {
    const original = {
      accessToken: 'expired-access', refreshToken: 'old-refresh', userId: 42,
      clientInstanceId: 'old-client', kind: 'registration' as const,
      token: 'old-token', tokenId: null,
    };
    const introduced = {
      accessToken: 'rotated-access', refreshToken: 'rotated-refresh', userId: null,
      clientInstanceId: 'old-client', kind: 'clientLogout' as const,
      token: null, tokenId: null, state: 'cleaned' as const,
    };
    state.obligations = [original];
    compensateCapturedFcmOperations.mockImplementationOnce(async (working) => {
      state.obligations = [original, introduced];
      return [...working, introduced];
    });
    await expect(waitForFcmTransitionCleanup(5_000)).resolves.toBe(true);
    expect(state.obligations).toBeNull();
  });
});
