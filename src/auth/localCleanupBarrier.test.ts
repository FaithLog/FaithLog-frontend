import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  resetLocalCleanupBarrierForTests,
  trackLocalSessionCleanup,
  waitForLocalSessionCleanup,
} from './localCleanupBarrier';

beforeEach(() => resetLocalCleanupBarrierForTests());

describe('local cleanup restart latch', () => {
  it('rejects every login after a cleanup timeout until app restart', async () => {
    vi.useFakeTimers();
    try {
      trackLocalSessionCleanup(new Promise<never>(() => {}));
      const first = waitForLocalSessionCleanup(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(first).resolves.toBe(false);
      await expect(waitForLocalSessionCleanup(5_000)).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
