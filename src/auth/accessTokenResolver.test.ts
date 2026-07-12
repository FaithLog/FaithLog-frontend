import {describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({generation: 1, getStoredAuthSession: vi.fn()}));
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: () => mocks.generation,
  getStoredAuthSession: mocks.getStoredAuthSession,
  isAuthSessionRequestAllowed: (generation: number) => generation === mocks.generation,
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));

import {isAccessTokenResolutionCurrent, readCurrentAccessToken} from './accessTokenResolver';

describe('access token resolver lineage', () => {
  it('does not treat a fulfilled old null token as current missing credentials', async () => {
    let finish!: (value: unknown) => void;
    mocks.getStoredAuthSession.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = readCurrentAccessToken();
    mocks.generation = 2;
    finish({generation: 1, accessToken: null, refreshToken: null});
    await expect(pending).rejects.toThrow();
  });

  it('requires a synchronous caller check before missing-token side effects', () => {
    const resolution = {generation: 1 as never, accessToken: null};
    mocks.generation = 2;
    expect(isAccessTokenResolutionCurrent(resolution)).toBe(false);
  });
});
