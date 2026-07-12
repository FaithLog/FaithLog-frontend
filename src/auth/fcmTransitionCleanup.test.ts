import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({obligations: null as unknown[] | null}));
const capturePendingFcmOperations = vi.hoisted(() => vi.fn());
const compensateCapturedFcmOperations = vi.hoisted(() => vi.fn());

vi.mock('../api/tokenStorage', () => ({
  clearFcmRemoteCleanupPending: vi.fn(async () => { state.obligations = null; }),
  getFcmRemoteCleanupObligations: vi.fn(async () => state.obligations),
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
});
