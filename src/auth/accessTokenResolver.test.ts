import {describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({allowed: true, generation: 1, getStoredAuthSession: vi.fn()}));
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: () => mocks.generation,
  getStoredAuthSession: mocks.getStoredAuthSession,
  isAuthSessionRequestAllowed: (generation: number) =>
    mocks.allowed && generation === mocks.generation,
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));

import {isAccessTokenResolutionCurrent, resolveCurrentAccessToken} from './accessTokenResolver';

describe('access token resolver lineage', () => {
  it('does not invoke missing-token side effects for a fulfilled old null token', async () => {
    let finish!: (value: unknown) => void;
    mocks.getStoredAuthSession.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const onMissing = vi.fn();
    const pending = resolveCurrentAccessToken(onMissing);
    mocks.generation = 2;
    finish({generation: 1, accessToken: null, refreshToken: null});
    await expect(pending).rejects.toThrow();
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('requires a synchronous caller check before missing-token side effects', () => {
    const resolution = {generation: 1 as never, accessToken: null};
    mocks.generation = 2;
    expect(isAccessTokenResolutionCurrent(resolution)).toBe(false);
  });

  it('runs the missing callback only for the still-current lineage', async () => {
    mocks.allowed = true;
    mocks.generation = 3;
    mocks.getStoredAuthSession.mockResolvedValueOnce({
      generation: 3, accessToken: null, refreshToken: null,
    });
    const onMissing = vi.fn();
    await expect(resolveCurrentAccessToken(onMissing)).resolves.toBeNull();
    expect(onMissing).toHaveBeenCalledWith(3);
  });
});
