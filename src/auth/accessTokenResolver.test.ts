import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({allowed: true, generation: 1, getStoredAuthSession: vi.fn()}));
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: () => mocks.generation,
  getStoredAuthSession: mocks.getStoredAuthSession,
  isAuthSessionRequestAllowed: (generation: number) =>
    mocks.allowed && generation === mocks.generation,
  startAuthSessionClear: (generation: number) => {
    if (!mocks.allowed || generation !== mocks.generation) {
      return {
        cleared: false, previousGeneration: mocks.generation,
        currentGeneration: mocks.generation, completion: Promise.resolve(),
      };
    }
    const previousGeneration = mocks.generation;
    mocks.generation += 1;
    mocks.allowed = false;
    return {
      cleared: true, previousGeneration, currentGeneration: mocks.generation,
      completion: Promise.resolve(),
    };
  },
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));

const beginFcmTransitionCleanup = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./fcmTransitionCleanup', () => ({beginFcmTransitionCleanup}));

import {isAccessTokenResolutionCurrent, resolveCurrentAccessToken} from './accessTokenResolver';

describe('access token resolver lineage', () => {
  beforeEach(() => {
    mocks.allowed = true;
    mocks.generation = 1;
    vi.clearAllMocks();
    beginFcmTransitionCleanup.mockClear();
  });
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
    expect(mocks.generation).toBe(4);
    expect(mocks.allowed).toBe(false);
    expect(onMissing).toHaveBeenCalledWith(3);
    expect(beginFcmTransitionCleanup).toHaveBeenCalledOnce();
  });

  it('closes the common request gate before a missing-token callback can yield', async () => {
    mocks.generation = 4;
    mocks.getStoredAuthSession.mockResolvedValueOnce({
      generation: 4, accessToken: null, refreshToken: null,
    });
    const mutationFetch = vi.fn();
    const onMissing = vi.fn(async () => {
      expect(mocks.allowed).toBe(false);
    });

    await resolveCurrentAccessToken(onMissing);
    if (mocks.allowed) mutationFetch();

    expect(onMissing).toHaveBeenCalledOnce();
    expect(mocks.allowed).toBe(false);
    expect(mutationFetch).not.toHaveBeenCalled();
  });
});
