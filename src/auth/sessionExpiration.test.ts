import {beforeEach, describe, expect, it, vi} from 'vitest';

const storage = vi.hoisted(() => ({
  generation: 5,
  startAuthSessionClear: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => storage.generation),
  startAuthSessionClear: storage.startAuthSessionClear,
}));
import {createSessionExpirationHandler, expireAuthSession, isExpirationEventCurrent, subscribeSessionExpiration} from './sessionExpiration';
import {resetLocalCleanupBarrierForTests, waitForLocalSessionCleanup} from './localCleanupBarrier';

describe('central session expiration lineage', () => {
  beforeEach(() => {
    resetLocalCleanupBarrierForTests();
    storage.startAuthSessionClear.mockReset();
  });
  const event = {expiredGeneration: 4 as never, clearedGeneration: 5 as never};
  it('accepts only the exact clear transition', () => {
    expect(isExpirationEventCurrent(event, 5)).toBe(true);
    expect(isExpirationEventCurrent(event, 6)).toBe(false);
    expect(isExpirationEventCurrent(event, 7)).toBe(false);
  });

  it('expires globally when AUTH_SESSION_CHANGED rejects first and expiry arrives later', async () => {
    let finishExpiry!: () => void;
    const laterExpiry = new Promise<void>((resolve) => { finishExpiry = resolve; });
    let expired = false;
    const handler = createSessionExpirationHandler(() => 5, () => { expired = true; });
    const aggregate = Promise.all([
      Promise.reject(new Error('AUTH_SESSION_CHANGED')),
      laterExpiry.then(() => handler(event)),
    ]).catch(() => undefined);
    await aggregate;
    expect(expired).toBe(false);
    finishExpiry();
    await laterExpiry;
    await Promise.resolve();
    expect(expired).toBe(true);
  });

  it.each(['Home unmounted', 'Poll navigated from A to B'])(
    'expires at root even when %s',
    () => {
      let rootState = 'authenticated';
      const handler = createSessionExpirationHandler(() => 5, () => {
        rootState = 'sessionExpired';
      });
      handler(event);
      expect(rootState).toBe('sessionExpired');
    },
  );

  it('does not emit when stale clear did not advance generation', async () => {
    storage.startAuthSessionClear.mockReturnValue({
      cleared: false,
      previousGeneration: 5,
      currentGeneration: 5,
      completion: Promise.resolve(),
    });
    const listener = vi.fn();
    const unsubscribe = subscribeSessionExpiration(listener);
    await expireAuthSession(4 as never);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps every later login restart-gated when central expiration cleanup hangs', async () => {
    vi.useFakeTimers();
    try {
      storage.startAuthSessionClear.mockReturnValue({
        cleared: true,
        previousGeneration: 4,
        currentGeneration: 5,
        completion: new Promise<never>(() => {}),
      });
      void expireAuthSession(4 as never);

      const first = waitForLocalSessionCleanup(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(first).resolves.toBe(false);
      await expect(waitForLocalSessionCleanup(5_000)).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
