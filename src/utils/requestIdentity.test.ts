import {describe, expect, it, vi} from 'vitest';
import {isCurrentDetailEpoch, isCurrentRequest, isMountedGenerationCurrent, settleIndependently} from './requestIdentity';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return {promise, resolve};
}

describe('request identity', () => {
  it('rejects both stale sequence and stale view keys', () => {
    expect(isCurrentRequest(1, 2, 'A', 'A')).toBe(false);
    expect(isCurrentRequest(2, 2, 'A', 'B')).toBe(false);
    expect(isCurrentRequest(2, 2, 'B', 'B')).toBe(true);
  });

  it('settles a fast home card without waiting for a slow card', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const applied = vi.fn();
    const slowTask = settleIndependently(slow.promise, applied);
    const fastTask = settleIndependently(fast.promise, applied);
    fast.resolve('fast');
    await fastTask;
    expect(applied).toHaveBeenCalledWith({status: 'fulfilled', value: 'fast'});
    expect(applied).toHaveBeenCalledTimes(1);
    slow.resolve('slow');
    await slowTask;
  });

  it('rejects a same-poll response from before close and reopen', () => {
    expect(isCurrentDetailEpoch(9, 9, 3, 4, 1, 1)).toBe(false);
    expect(isCurrentDetailEpoch(9, 9, 4, 4, 1, 1)).toBe(true);
  });

  it.each(['response', 'optionAdd'])('blocks stale %s completion after A to B navigation', async () => {
    const operation = deferred<string>();
    const applied: string[] = [];
    const started = {pollId: 1, epoch: 2, generation: 7};
    const current = {pollId: 2, epoch: 3, generation: 7};
    const task = operation.promise.then((value) => {
      if (isCurrentDetailEpoch(
        started.pollId, current.pollId, started.epoch, current.epoch,
        started.generation, current.generation,
      )) applied.push(value);
    });
    operation.resolve('must-not-touch-B');
    await task;
    expect(applied).toEqual([]);
  });

  it('blocks a home result after generation changes without a rerender', () => {
    expect(isMountedGenerationCurrent(true, 4, 5)).toBe(false);
    expect(isMountedGenerationCurrent(false, 5, 5)).toBe(false);
  });
});
