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

  it('waits for cleanup registered while an earlier cleanup is settling', async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    trackLocalSessionCleanup(new Promise<void>((resolve) => { finishFirst = resolve; }));
    const waiting = waitForLocalSessionCleanup(5_000);

    finishFirst();
    trackLocalSessionCleanup(new Promise<void>((resolve) => { finishSecond = resolve; }));
    await Promise.resolve();
    let settled = false;
    void waiting.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishSecond();
    await expect(waiting).resolves.toBe(true);
  });

  it('restart-gates a concurrent waiter after durable cleanup rejects', async () => {
    let rejectCleanup!: (error: Error) => void;
    const cleanup = new Promise<void>((_, reject) => { rejectCleanup = reject; });
    trackLocalSessionCleanup(cleanup);
    const waiting = waitForLocalSessionCleanup(5_000);

    rejectCleanup(new Error('durable tombstone and deletion failed'));
    await expect(cleanup).rejects.toThrow('durable tombstone');
    await expect(waiting).resolves.toBe(false);
    await expect(waitForLocalSessionCleanup(5_000)).resolves.toBe(false);
  });
});
