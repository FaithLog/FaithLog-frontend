import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {AuthSessionGeneration} from '../api/tokenStorage';
import type {TokenPair} from '../api/types';
import {
  collectRefreshTokensForLogout,
  hasRefreshLogoutHandoff,
  resetRefreshLogoutHandoffForTests,
  settleRefreshHandoffsForAuthEntry,
  trackRefreshForLogout,
} from './refreshLogoutHandoff';

const GENERATION = 3 as AuthSessionGeneration;

describe('refresh logout handoff auth-entry settlement', () => {
  beforeEach(() => resetRefreshLogoutHandoffForTests());

  it('allows auth entry after a pending refresh settles without issuing tokens', async () => {
    let rejectRefresh!: (error: Error) => void;
    const refresh = trackRefreshForLogout(
      GENERATION,
      () => new Promise<never>((_, reject) => { rejectRefresh = reject; }),
    );
    void refresh.catch(() => undefined);
    const settlement = settleRefreshHandoffsForAuthEntry(5_000);
    rejectRefresh(new Error('offline before response'));

    await expect(settlement).resolves.toBe('clear');
    expect(hasRefreshLogoutHandoff()).toBe(false);
  });

  it('blocks auth entry after issued tokens and removes their Map references', async () => {
    const refresh = trackRefreshForLogout(GENERATION, async (onIssued) => {
      onIssued({
        accessToken: 'issued-access', refreshToken: 'issued-refresh',
        accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 7200, tokenType: 'Bearer',
      });
      throw new Error('durable save failed');
    });
    await expect(refresh).rejects.toThrow('durable save failed');

    await expect(settleRefreshHandoffsForAuthEntry(5_000)).resolves.toBe('issued');
    expect(hasRefreshLogoutHandoff()).toBe(false);
  });

  it('fails closed and clears Map ownership when pending settlement times out', async () => {
    vi.useFakeTimers();
    try {
      void trackRefreshForLogout(GENERATION, () => new Promise<never>(() => {}));
      const settlement = settleRefreshHandoffsForAuthEntry(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(settlement).resolves.toBe('timeout');
      expect(hasRefreshLogoutHandoff()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let one committed refresh discard a concurrent issued operation', async () => {
    let finishFirst!: () => void;
    let issueSecond!: (tokens: TokenPair) => void;
    let rejectSecond!: (error: Error) => void;
    const first = trackRefreshForLogout(GENERATION, async (onIssued) => {
      onIssued({
        accessToken: 'first-access', refreshToken: 'first-refresh',
        accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 7200, tokenType: 'Bearer',
      });
      await new Promise<void>((resolve) => { finishFirst = resolve; });
      return 'first';
    });
    const second = trackRefreshForLogout(GENERATION, (onIssued) =>
      new Promise<never>((_, reject) => {
        issueSecond = onIssued;
        rejectSecond = reject;
      }));
    void second.catch(() => undefined);
    finishFirst();
    await first;
    first.discardAfterCommit();
    issueSecond({
      accessToken: 'second-access', refreshToken: 'second-refresh',
      accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 7200, tokenType: 'Bearer',
    });
    rejectSecond(new Error('second durable save failed'));

    await expect(collectRefreshTokensForLogout(GENERATION)).resolves.toMatchObject({
      accessToken: 'second-access', refreshToken: 'second-refresh',
    });
  });
});
