import {afterEach, expect, it, vi} from 'vitest';
import {isApiProgressVisible, subscribeToApiProgress, withApiProgress} from './apiProgressState';

afterEach(() => vi.useRealTimers());

it('does not display progress for a quick response', async () => {
  vi.useFakeTimers();
  const listener = vi.fn();
  const unsubscribe = subscribeToApiProgress(listener);
  try {
    await expect(withApiProgress(async () => 'ok')).resolves.toBe('ok');
    vi.advanceTimersByTime(500);
    expect(listener).not.toHaveBeenCalled();
    expect(isApiProgressVisible()).toBe(false);
  } finally {
    unsubscribe();
  }
});

it('continues showing progress until overlapping slow requests settle', async () => {
  vi.useFakeTimers();
  let resolveFirst!: () => void;
  let rejectSecond!: (error: Error) => void;
  const first = withApiProgress(() => new Promise<void>(resolve => { resolveFirst = resolve; }));
  const second = withApiProgress(() => new Promise<void>((_, reject) => { rejectSecond = reject; }));
  const failure = expect(second).rejects.toThrow('network');
  vi.advanceTimersByTime(399);
  expect(isApiProgressVisible()).toBe(false);
  vi.advanceTimersByTime(1);
  expect(isApiProgressVisible()).toBe(true);
  resolveFirst();
  await first;
  expect(isApiProgressVisible()).toBe(true);
  rejectSecond(new Error('network'));
  await failure;
  expect(isApiProgressVisible()).toBe(false);
});
