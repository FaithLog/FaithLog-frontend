import {beforeEach, describe, expect, it, vi} from 'vitest';

const session = vi.hoisted(() => ({generation: 3}));

vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => session.generation),
  isAuthSessionRequestAllowed: vi.fn((generation) => generation === session.generation),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {},
}));

vi.mock('../auth/accessTokenResolver', () => ({
  expireMissingAuthSession: vi.fn(),
  readCurrentAccessToken: vi.fn(),
}));

import type {ApiError} from '../api/types';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import {readCurrentAccessToken} from '../auth/accessTokenResolver';
import {
  attachMealRequestGeneration,
  createMealRequestTracker,
  resolveMealRequestAccess,
} from './mealRequestLifecycle';

describe('MEAL request lifecycle', () => {
  beforeEach(() => {
    session.generation = 3;
    vi.mocked(readCurrentAccessToken).mockReset();
  });

  it('drops stale campus, route, operation, generation, and unmounted results', () => {
    const tracker = createMealRequestTracker('campus:1/route:polls');
    const generation = getAuthSessionGeneration();
    const first = attachMealRequestGeneration(tracker.begin('load'), generation);

    expect(tracker.isSuccessCurrent(first, generation)).toBe(true);

    const newer = attachMealRequestGeneration(tracker.begin('load'), generation);
    expect(tracker.isSuccessCurrent(first, generation)).toBe(false);
    expect(tracker.isSuccessCurrent(newer, generation)).toBe(true);

    tracker.syncScope('campus:2/route:polls');
    expect(tracker.isSuccessCurrent(newer, generation)).toBe(false);

    const otherCampus = attachMealRequestGeneration(tracker.begin('load'), generation);
    session.generation = 4;
    expect(tracker.isSuccessCurrent(otherCampus, getAuthSessionGeneration())).toBe(false);

    tracker.unmount();
    expect(tracker.isSuccessCurrent(otherCampus, generation)).toBe(false);
  });

  it('ignores AUTH_SESSION_CHANGED and stale expiry but handles current 401 lineage', () => {
    session.generation = 7;
    const tracker = createMealRequestTracker('campus:1/route:detail:9');
    const generation = getAuthSessionGeneration();
    const operation = attachMealRequestGeneration(tracker.begin('load'), generation);
    const authChanged: ApiError = {
      kind: 'error',
      code: 'AUTH_SESSION_CHANGED',
      message: 'changed',
      authSessionGeneration: generation,
    };
    const currentExpiry: ApiError = {
      kind: 'sessionExpired',
      status: 401,
      message: 'expired',
      authSessionGeneration: generation,
    };

    expect(tracker.shouldApplyError(operation, authChanged, generation)).toBe(false);
    session.generation = 8;
    expect(tracker.shouldApplyError(operation, currentExpiry, getAuthSessionGeneration())).toBe(true);

    tracker.syncScope('campus:2/route:detail:9');
    expect(tracker.shouldApplyError(operation, currentExpiry, getAuthSessionGeneration())).toBe(false);
  });

  it('cancels logout-to-new-login and unmounted token reads without auth callbacks', async () => {
    const tracker = createMealRequestTracker('campus:1/route:polls');
    const missing = vi.fn();
    const tokenRead = deferred<{accessToken: string; generation: ReturnType<typeof getAuthSessionGeneration>}>();
    vi.mocked(readCurrentAccessToken).mockReturnValueOnce(tokenRead.promise);
    const request = resolveMealRequestAccess(tracker, 'load', missing);

    session.generation = 4;
    tokenRead.resolve({accessToken: 'other-user-token', generation: getAuthSessionGeneration()});
    await expect(request).resolves.toMatchObject({status: 'cancelled'});
    expect(missing).not.toHaveBeenCalled();

    vi.mocked(readCurrentAccessToken).mockResolvedValueOnce({
      accessToken: 'current-token',
      generation: getAuthSessionGeneration(),
    });
    const unmountedRequest = resolveMealRequestAccess(tracker, 'load', missing);
    tracker.unmount();
    await expect(unmountedRequest).resolves.toMatchObject({status: 'cancelled'});
    expect(missing).not.toHaveBeenCalled();
  });

  it('resolves the rotated token for each next operation in the same session', async () => {
    const tracker = createMealRequestTracker('campus:1/route:polls');
    const generation = getAuthSessionGeneration();
    vi.mocked(readCurrentAccessToken)
      .mockResolvedValueOnce({accessToken: 'A1', generation})
      .mockResolvedValueOnce({accessToken: 'A2', generation});

    await expect(resolveMealRequestAccess(tracker, 'load', vi.fn())).resolves.toMatchObject({
      status: 'ready',
      request: {accessToken: 'A1'},
    });
    await expect(resolveMealRequestAccess(tracker, 'mutation', vi.fn())).resolves.toMatchObject({
      status: 'ready',
      request: {accessToken: 'A2'},
    });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return {promise, reject, resolve};
}
