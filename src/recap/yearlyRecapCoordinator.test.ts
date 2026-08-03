import {describe, expect, it, vi} from 'vitest';

import {createYearlyRecapCoordinator} from './yearlyRecapCoordinator';

describe('yearly recap coordinator', () => {
  it('deduplicates load and automatic presentation within one auth context', async () => {
    type Candidate = {recapYear: number; hasRecapData: boolean; presentation: {shouldAutoPresent: boolean}};
    let resolve: ((value: Candidate) => void) | undefined;
    const loadSpy = vi.fn();
    const load = () => {
      loadSpy();
      return new Promise<Candidate>((next) => { resolve = next; });
    };
    const coordinator = createYearlyRecapCoordinator();

    const first = coordinator.load({contextKey: '7:42', load});
    const second = coordinator.load({contextKey: '7:42', load});
    expect(loadSpy).toHaveBeenCalledOnce();
    resolve?.({recapYear: 2026, hasRecapData: true, presentation: {shouldAutoPresent: true}});
    await expect(first).resolves.toMatchObject({shouldAutoPresent: true});
    await expect(second).resolves.toMatchObject({shouldAutoPresent: false});
  });

  it('discards a response after account/auth context changes', async () => {
    type Candidate = {recapYear: number; hasRecapData: boolean; presentation: {shouldAutoPresent: boolean}};
    let resolve: ((value: Candidate) => void) | undefined;
    const coordinator = createYearlyRecapCoordinator();
    const pending = coordinator.load({
      contextKey: '7:42',
      load: () => new Promise<Candidate>((next) => { resolve = next; }),
    });
    coordinator.reset('8:99');
    resolve?.({recapYear: 2026, hasRecapData: true, presentation: {shouldAutoPresent: true}});
    await expect(pending).resolves.toEqual({status: 'stale'});
  });

  it('attempts presented only once per rendered recap in the current boot context', async () => {
    const coordinator = createYearlyRecapCoordinator();
    const request = vi.fn(async () => null);
    await coordinator.markPresentedOnce('7:42:2026', request);
    await coordinator.markPresentedOnce('7:42:2026', request);
    expect(request).toHaveBeenCalledOnce();
  });

  it('evicts a rejected GET so an explicit retry can run', async () => {
    const coordinator = createYearlyRecapCoordinator();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        recapYear: 2026,
        hasRecapData: true,
        presentation: {shouldAutoPresent: false},
      });
    await expect(coordinator.load({contextKey: '7:42', load})).rejects.toThrow('offline');
    await expect(coordinator.load({contextKey: '7:42', load})).resolves.toMatchObject({
      status: 'success',
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
