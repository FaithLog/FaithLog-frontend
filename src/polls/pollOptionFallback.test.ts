import {describe, expect, it, vi} from 'vitest';
import {runPollOptionFallback} from './pollOptionFallback';

describe('poll option contract fallback', () => {
  it('sends no fallback POST after navigating from A to B', async () => {
    let rejectFirst!: (error: Error) => void;
    const first = new Promise<never>((_, reject) => { rejectFirst = reject; });
    const send = vi.fn().mockReturnValueOnce(first);
    let current = true;
    const pending = runPollOptionFallback(
      [1, 2, 3], () => current, send, () => true, () => new Error('stale'),
    );
    current = false;
    rejectFirst(new Error('422 contract mismatch'));
    await expect(pending).rejects.toThrow('stale');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
