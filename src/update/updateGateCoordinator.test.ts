import {describe, expect, it, vi} from 'vitest';

import {createForegroundUpdateCoordinator, createStoreUrlOpener} from './updateGateCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {promise, reject, resolve};
}

describe('createForegroundUpdateCoordinator', () => {
  it('deduplicates checks in the same foreground cycle', async () => {
    const pending = deferred<{required: false}>();
    const check = vi.fn(() => pending.promise);
    const coordinator = createForegroundUpdateCoordinator(check);

    const first = coordinator.checkCurrentCycle();
    const second = coordinator.checkCurrentCycle();

    expect(first).toBe(second);
    expect(check).toHaveBeenCalledTimes(1);
    pending.resolve({required: false});
    await first;
  });

  it('checks again after a new foreground cycle begins', async () => {
    const check = vi.fn().mockResolvedValue({required: false});
    const coordinator = createForegroundUpdateCoordinator(check);

    await coordinator.checkCurrentCycle();
    await coordinator.checkCurrentCycle();
    coordinator.beginForegroundCycle();
    await coordinator.checkCurrentCycle();

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('marks an older cycle promise stale after foreground changes', () => {
    const first = deferred<{required: false}>();
    const second = deferred<{required: false}>();
    const check = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const coordinator = createForegroundUpdateCoordinator(check);

    const oldPromise = coordinator.checkCurrentCycle();
    coordinator.beginForegroundCycle();
    const currentPromise = coordinator.checkCurrentCycle();

    expect(coordinator.isCurrent(oldPromise)).toBe(false);
    expect(coordinator.isCurrent(currentPromise)).toBe(true);
  });
});

describe('createStoreUrlOpener', () => {
  it('does not execute an invalid store URL', async () => {
    const canOpenURL = vi.fn();
    const openURL = vi.fn();
    const opener = createStoreUrlOpener({canOpenURL, openURL});

    await expect(opener.open('android', 'javascript:alert(1)')).resolves.toEqual({ok: false});
    expect(canOpenURL).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('deduplicates rapid taps through canOpenURL and openURL', async () => {
    const pending = deferred<boolean>();
    const canOpenURL = vi.fn(() => pending.promise);
    const openURL = vi.fn().mockResolvedValue(undefined);
    const opener = createStoreUrlOpener({canOpenURL, openURL});
    const url = 'https://apps.apple.com/app/id6784053598';

    const first = opener.open('ios', url);
    const second = opener.open('ios', url);
    expect(first).toBe(second);
    expect(canOpenURL).toHaveBeenCalledTimes(1);

    pending.resolve(true);
    await expect(first).resolves.toEqual({ok: true});
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it('returns a retryable failure when the URL cannot be opened', async () => {
    const canOpenURL = vi.fn().mockResolvedValue(false);
    const openURL = vi.fn();
    const opener = createStoreUrlOpener({canOpenURL, openURL});

    await expect(opener.open('android', 'https://play.google.com/store/apps/details?id=com.faithlog.app'))
      .resolves.toEqual({ok: false});
    await opener.open('android', 'https://play.google.com/store/apps/details?id=com.faithlog.app');

    expect(canOpenURL).toHaveBeenCalledTimes(2);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('releases the gate after openURL rejects', async () => {
    const canOpenURL = vi.fn().mockResolvedValue(true);
    const openURL = vi.fn().mockRejectedValue(new Error('store unavailable'));
    const opener = createStoreUrlOpener({canOpenURL, openURL});
    const url = 'https://apps.apple.com/app/id6784053598';

    await expect(opener.open('ios', url)).resolves.toEqual({ok: false});
    await expect(opener.open('ios', url)).resolves.toEqual({ok: false});

    expect(openURL).toHaveBeenCalledTimes(2);
  });
});
