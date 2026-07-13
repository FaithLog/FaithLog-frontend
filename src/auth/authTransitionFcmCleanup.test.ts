import {beforeEach, describe, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({
  allowed: true, durableObligations: null as unknown[] | null, generation: 1,
}));
const capturePendingFcmOperations = vi.hoisted(() => vi.fn());
const compensateCapturedFcmOperations = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../api/tokenStorage', () => ({
  clearFcmRemoteCleanupObligations: vi.fn(async () => { state.durableObligations = null; }),
  clearFcmRemoteCleanupPending: vi.fn(async () => { state.durableObligations = null; }),
  discardRefreshTokensForGeneration: vi.fn(),
  getAuthSessionGeneration: vi.fn(() => state.generation),
  getStoredAuthSession: vi.fn(async () => ({
    generation: state.generation, accessToken: null, refreshToken: null,
  })),
  getFcmRemoteCleanupObligations: vi.fn(async () => state.durableObligations),
  getFcmAccountDeletionClaim: vi.fn(async () => null),
  completeFcmAccountDeletionClaim: vi.fn(async () => undefined),
  completeFcmAccountDeletionClaimAfterCleanup: vi.fn(async () => undefined),
  isAuthSessionRequestAllowed: vi.fn((generation: number) =>
    state.allowed && generation === state.generation),
  markFcmRemoteCleanupPending: vi.fn(async (obligations: unknown[] = []) => {
    state.durableObligations = obligations.length > 0
      ? obligations
      : state.durableObligations ?? [];
  }),
  startAuthSessionClear: vi.fn((generation: number) => {
    if (!state.allowed || generation !== state.generation) {
      return {
        cleared: false, previousGeneration: state.generation,
        currentGeneration: state.generation, completion: Promise.resolve(),
      };
    }
    state.allowed = false;
    state.generation += 1;
    return {
      cleared: true, previousGeneration: generation,
      currentGeneration: state.generation, completion: Promise.resolve(),
    };
  }),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));

vi.mock('../notifications/fcmRegistration', () => ({
  capturePendingFcmOperations,
  compensateCapturedFcmOperations,
}));

vi.mock('./refreshLogoutHandoff', () => ({
  discardRefreshTokensForGeneration: vi.fn(),
  hasIssuedRefreshTokens: vi.fn(() => false),
}));

import {resolveCurrentAccessToken} from './accessTokenResolver';
import {
  configureFcmTransitionCleanup,
  resetFcmTransitionCleanupForTests,
  waitForFcmTransitionCleanup,
} from './fcmTransitionCleanup';
import {expireAuthSession} from './sessionExpiration';

describe('FCM cleanup across non-logout auth transitions', () => {
  let finishBarrier!: () => void;

  beforeEach(() => {
    state.allowed = true;
    state.durableObligations = null;
    state.generation = 1;
    vi.clearAllMocks();
    resetFcmTransitionCleanupForTests();
    const barrier = new Promise<void>((resolve) => { finishBarrier = resolve; });
    capturePendingFcmOperations.mockReturnValue({
      barrier,
      settlement: barrier.then(() => [{
        accessToken: 'old-access', clientInstanceId: 'old-client',
        kind: 'registration', token: 'old-token', tokenId: null,
        state: 'mayHaveSent',
      }]),
      hasPendingOperations: true,
    });
    configureFcmTransitionCleanup({
      capture: capturePendingFcmOperations,
      compensate: compensateCapturedFcmOperations,
    });
  });

  it('central expiration blocks the next auth entry until compensation', async () => {
    await expireAuthSession(1 as never);
    const waiting = waitForFcmTransitionCleanup(5_000);
    let completed = false;
    void waiting.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    finishBarrier();
    await expect(waiting).resolves.toBe(true);
    expect(compensateCapturedFcmOperations).toHaveBeenCalledOnce();
  });

  it('missing-token teardown uses the same compensation barrier', async () => {
    const onMissing = vi.fn();
    await expect(resolveCurrentAccessToken(onMissing)).resolves.toBeNull();
    const waiting = waitForFcmTransitionCleanup(5_000);
    let completed = false;
    void waiting.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    finishBarrier();
    await expect(waiting).resolves.toBe(true);
    expect(compensateCapturedFcmOperations).toHaveBeenCalledOnce();
    expect(onMissing).toHaveBeenCalledOnce();
  });
});
