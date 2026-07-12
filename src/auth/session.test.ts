import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  FaithLogApiError: class FaithLogApiError extends Error {
    readonly detail: {kind: string; message: string; status?: number};

    constructor(detail: {kind: string; message: string; status?: number}) {
      super(detail.message);
      this.detail = detail;
    }
  },
  fetchCurrentUser: vi.fn(),
  fetchMyCampuses: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  refreshAuthToken: vi.fn(),
  signupUser: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  beginAuthSession: vi.fn(),
  clearTokens: vi.fn(),
  clearFcmRegistrationAttemptsForClientInstance: vi.fn(),
  getAuthSessionGeneration: vi.fn(),
  getStoredAuthSession: vi.fn(),
  getStoredSelectedCampusId: vi.fn(),
  isAuthSessionGenerationCurrent: vi.fn(),
  isAuthSessionRequestAllowed: vi.fn(),
  markAuthSessionClosing: vi.fn(),
  rotateClientInstanceId: vi.fn(),
  saveSelectedCampusId: vi.fn(),
  saveTokens: vi.fn(),
  startAuthSessionClear: vi.fn(),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {
    constructor(readonly expectedGeneration: number) { super('stale'); }
  },
}));

vi.mock('./fcmLogout', () => ({
  getLogoutFcmDeactivationPayload: vi.fn(),
}));

vi.mock('./fcmTransitionCleanup', () => ({
  beginFcmTransitionCleanup: vi.fn(async () => undefined),
  clearFcmRemoteCleanupGateIfIdle: vi.fn(async () => undefined),
  requireFcmRemoteCleanupRestart: vi.fn(async () => undefined),
  resetFcmTransitionCleanupForTests: vi.fn(),
  waitForFcmTransitionCleanup: vi.fn(async () => true),
}));

vi.mock('../notifications/fcmRegistration', () => ({
  capturePendingFcmOperations: vi.fn(() => ({
    barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
  })),
  compensateCapturedFcmOperations: vi.fn(async () => undefined),
}));

import {
  FaithLogApiError,
  fetchCurrentUser,
  fetchMyCampuses,
  loginUser,
  logoutUser,
  refreshAuthToken,
  signupUser,
} from '../api/client';
import {
  beginAuthSession,
  clearTokens,
  clearFcmRegistrationAttemptsForClientInstance,
  getAuthSessionGeneration,
  getStoredAuthSession,
  getStoredSelectedCampusId,
  isAuthSessionGenerationCurrent,
  isAuthSessionRequestAllowed,
  markAuthSessionClosing,
  rotateClientInstanceId,
  saveSelectedCampusId,
  saveTokens,
  startAuthSessionClear,
  StaleAuthSessionReadError,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import type {CurrentUser, LoginResponse} from '../api/types';
import {capturePendingFcmOperations, compensateCapturedFcmOperations} from '../notifications/fcmRegistration';
import {getLogoutFcmDeactivationPayload} from './fcmLogout';
import {
  clearFcmRemoteCleanupGateIfIdle,
  requireFcmRemoteCleanupRestart,
  waitForFcmTransitionCleanup,
} from './fcmTransitionCleanup';
import {resetLocalCleanupBarrierForTests, waitForLocalSessionCleanup} from './localCleanupBarrier';
import {
  hasRefreshLogoutHandoff,
  resetRefreshLogoutHandoffForTests,
  trackRefreshForLogout,
} from './refreshLogoutHandoff';
import {
  loginAndEstablishSession,
  logoutCurrentSession,
  prepareCurrentSessionLogout,
  refreshAndEstablishSession,
  resetAuthEntryBarrierForTests,
  signupAfterSessionCleanup,
  trackLocalSessionCleanup,
} from './session';

const AUTH_GENERATION = 11 as AuthSessionGeneration;
const CURRENT_USER: CurrentUser = {
  id: 42,
  name: '테스트 사용자',
  email: 'user@example.test',
  role: 'USER',
  isActive: true,
  lastLoginAt: '2026-07-10T00:00:00.000Z',
  campusMemberships: [],
};
const LOGIN_RESPONSE: LoginResponse = {
  accessToken: 'login-access-token',
  refreshToken: 'login-refresh-token',
  accessTokenExpiresIn: 3600,
  refreshTokenExpiresIn: 7200,
  tokenType: 'Bearer',
  user: CURRENT_USER,
};

describe('auth session lifecycle', () => {
  beforeEach(() => {
    resetLocalCleanupBarrierForTests();
    resetAuthEntryBarrierForTests();
    resetRefreshLogoutHandoffForTests();
    vi.clearAllMocks();
    vi.mocked(beginAuthSession).mockResolvedValue(AUTH_GENERATION);
    vi.mocked(getAuthSessionGeneration).mockReturnValue(AUTH_GENERATION);
    vi.mocked(isAuthSessionGenerationCurrent).mockReturnValue(true);
    vi.mocked(isAuthSessionRequestAllowed).mockReturnValue(true);
    vi.mocked(markAuthSessionClosing).mockReturnValue(true);
    vi.mocked(getStoredSelectedCampusId).mockResolvedValue(null);
    vi.mocked(saveSelectedCampusId).mockResolvedValue(undefined);
    vi.mocked(saveTokens).mockResolvedValue(true);
    vi.mocked(startAuthSessionClear).mockReturnValue({
      cleared: true,
      previousGeneration: AUTH_GENERATION,
      currentGeneration: (AUTH_GENERATION + 1) as AuthSessionGeneration,
      completion: Promise.resolve(),
    });
    vi.mocked(clearTokens).mockResolvedValue(true);
    vi.mocked(clearFcmRegistrationAttemptsForClientInstance).mockResolvedValue(undefined);
    vi.mocked(rotateClientInstanceId).mockResolvedValue(true);
    vi.mocked(loginUser).mockResolvedValue(LOGIN_RESPONSE);
    vi.mocked(signupUser).mockResolvedValue(CURRENT_USER);
    vi.mocked(fetchCurrentUser).mockResolvedValue(CURRENT_USER);
    vi.mocked(fetchMyCampuses).mockResolvedValue([]);
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: AUTH_GENERATION,
      accessToken: LOGIN_RESPONSE.accessToken,
      refreshToken: LOGIN_RESPONSE.refreshToken,
    });
    vi.mocked(getLogoutFcmDeactivationPayload).mockResolvedValue({});
    vi.mocked(capturePendingFcmOperations).mockReturnValue({
      barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
    });
    vi.mocked(compensateCapturedFcmOperations).mockResolvedValue([]);
    vi.mocked(logoutUser).mockResolvedValue(null);
    vi.mocked(waitForFcmTransitionCleanup).mockResolvedValue(true);
    vi.mocked(requireFcmRemoteCleanupRestart).mockResolvedValue(undefined);
    vi.mocked(clearFcmRemoteCleanupGateIfIdle).mockResolvedValue(undefined);
  });

  it('does not persist login tokens when session establishment fails', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValue(new Error('profile unavailable'));

    await expect(
      loginAndEstablishSession({
        email: 'user@example.test',
        password: 'test-password',
      }),
    ).rejects.toThrow('profile unavailable');

    expect(saveTokens).not.toHaveBeenCalled();
    expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION);
  });

  it('returns typed cancellation before FCM preparation when durable clear loses lineage', async () => {
    vi.mocked(clearTokens).mockResolvedValueOnce(false);
    const pending = prepareCurrentSessionLogout(42);
    await expect(pending).rejects.toBeInstanceOf(StaleAuthSessionReadError);
    expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION);
    expect(getLogoutFcmDeactivationPayload).not.toHaveBeenCalled();
    await expect(waitForLocalSessionCleanup(5_000)).resolves.toBe(true);
  });

  it('marks its exact generation closing before any stored-session read', async () => {
    await prepareCurrentSessionLogout(CURRENT_USER.id);
    expect(markAuthSessionClosing).toHaveBeenCalledWith(AUTH_GENERATION);
    expect(vi.mocked(markAuthSessionClosing).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getStoredAuthSession).mock.invocationCallOrder[0]!,
    );
  });

  it('shares one logout preparation per generation', async () => {
    let finishRead!: (value: Awaited<ReturnType<typeof getStoredAuthSession>>) => void;
    vi.mocked(getStoredAuthSession).mockReturnValueOnce(new Promise((resolve) => {
      finishRead = resolve;
    }));
    const first = prepareCurrentSessionLogout(CURRENT_USER.id);
    const second = prepareCurrentSessionLogout(CURRENT_USER.id);
    expect(first).toBe(second);
    expect(getStoredAuthSession).toHaveBeenCalledOnce();
    finishRead({
      generation: AUTH_GENERATION,
      accessToken: LOGIN_RESPONSE.accessToken,
      refreshToken: LOGIN_RESPONSE.refreshToken,
    });
    await expect(first).resolves.toBeDefined();
    expect(clearTokens).toHaveBeenCalledOnce();
  });

  it.each(['reject', 'false'] as const)(
    'tracks bootstrap-issued refresh tokens when durable save returns %s',
    async (failureMode) => {
      vi.mocked(refreshAuthToken).mockImplementation(async (_token, _generation, onIssued) => {
        onIssued?.(LOGIN_RESPONSE);
        return LOGIN_RESPONSE;
      });
      if (failureMode === 'reject') {
        vi.mocked(saveTokens).mockRejectedValueOnce(new Error('secure storage failed'));
      } else {
        vi.mocked(saveTokens).mockResolvedValueOnce(false);
        vi.mocked(isAuthSessionRequestAllowed).mockReturnValue(false);
      }

      await expect(refreshAndEstablishSession(
        LOGIN_RESPONSE.refreshToken,
        AUTH_GENERATION,
      )).rejects.toThrow();
      await expect(loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      })).rejects.toThrow('앱을 완전히 종료');
      expect(loginUser).not.toHaveBeenCalled();
      expect(hasRefreshLogoutHandoff()).toBe(false);
    },
  );

  it('discards bootstrap refresh handoff only after durable commit succeeds', async () => {
    vi.mocked(refreshAuthToken).mockImplementation(async (_token, _generation, onIssued) => {
      onIssued?.(LOGIN_RESPONSE);
      return LOGIN_RESPONSE;
    });
    await expect(refreshAndEstablishSession(
      LOGIN_RESPONSE.refreshToken,
      AUTH_GENERATION,
    )).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});
    expect(saveTokens).toHaveBeenCalledWith(LOGIN_RESPONSE, AUTH_GENERATION);
    expect(hasRefreshLogoutHandoff()).toBe(false);
  });

  it('keeps a concurrent bootstrap refresh isolated after the first durable commit', async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    vi.mocked(refreshAuthToken)
      .mockImplementationOnce((_token, _generation, onIssued) =>
        new Promise((resolve) => {
          resolveFirst = () => {
            onIssued?.({...LOGIN_RESPONSE, accessToken: 'first-bootstrap'});
            resolve({...LOGIN_RESPONSE, accessToken: 'first-bootstrap'});
          };
        }))
      .mockImplementationOnce((_token, _generation, onIssued) =>
        new Promise((resolve) => {
          resolveSecond = () => {
            onIssued?.({...LOGIN_RESPONSE, accessToken: 'second-bootstrap'});
            resolve({...LOGIN_RESPONSE, accessToken: 'second-bootstrap'});
          };
        }));
    vi.mocked(saveTokens)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('second durable save failed'));

    const first = refreshAndEstablishSession(LOGIN_RESPONSE.refreshToken, AUTH_GENERATION);
    const second = refreshAndEstablishSession(LOGIN_RESPONSE.refreshToken, AUTH_GENERATION);
    resolveFirst();
    await expect(first).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});
    resolveSecond();
    await expect(second).rejects.toThrow('second durable save failed');

    expect(startAuthSessionClear).toHaveBeenCalledWith(AUTH_GENERATION);
    expect(hasRefreshLogoutHandoff()).toBe(false);
  });

  it('durably clears auth before waiting for optional FCM logout metadata', async () => {
    vi.mocked(getLogoutFcmDeactivationPayload).mockReturnValue(new Promise(() => {}));
    void prepareCurrentSessionLogout(CURRENT_USER.id);
    await vi.waitFor(() => expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION));
    await vi.waitFor(() => expect(getLogoutFcmDeactivationPayload).toHaveBeenCalledOnce());
    expect(vi.mocked(clearTokens).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(getLogoutFcmDeactivationPayload).mock.invocationCallOrder[0]!,
    );
  });

  it('warns when stored auth is already null and no remote handoff exists', async () => {
    vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
      generation: AUTH_GENERATION, accessToken: null, refreshToken: null,
    });
    const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
    await expect(prepared.completeRemoteLogout()).resolves.toEqual({
      status: 'signedOutWithRemoteWarning',
      message: '로컬 세션은 종료했지만 서버 로그아웃 정보는 확인하지 못했습니다.',
    });
    expect(logoutUser).not.toHaveBeenCalled();
  });

  it('bounds account-deletion cleanup barrier before a new login', async () => {
    vi.useFakeTimers();
    try {
      trackLocalSessionCleanup(new Promise<never>(() => {}));
      const login = loginAndEstablishSession({
        email: 'user@example.test', password: 'password',
      });
      const rejected = expect(login).rejects.toThrow('앱을 완전히 종료');
      await vi.advanceTimersByTimeAsync(5_000);
      await rejected;
      expect(loginUser).not.toHaveBeenCalled();

      await expect(loginAndEstablishSession({
        email: 'user@example.test', password: 'password',
      })).rejects.toThrow('앱을 완전히 종료');
      expect(loginUser).not.toHaveBeenCalled();

      await expect(signupAfterSessionCleanup({
        email: 'new@example.test', name: 'new', password: 'password',
      })).rejects.toThrow('앱을 완전히 종료');
      expect(signupUser).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks login and signup after durable local cleanup rejects', async () => {
    const cleanup = Promise.reject(new Error('durable cleanup failed'));
    trackLocalSessionCleanup(cleanup);
    await expect(cleanup).rejects.toThrow('durable cleanup failed');

    await expect(loginAndEstablishSession({
      email: 'user@example.test', password: 'password',
    })).rejects.toThrow('앱을 완전히 종료');
    await expect(signupAfterSessionCleanup({
      email: 'new@example.test', name: 'new', password: 'password',
    })).rejects.toThrow('앱을 완전히 종료');
    expect(loginUser).not.toHaveBeenCalled();
    expect(signupUser).not.toHaveBeenCalled();
  });

  it('does not call login or signup while the durable FCM cleanup gate is set', async () => {
    vi.mocked(waitForFcmTransitionCleanup).mockResolvedValue(false);
    await expect(loginAndEstablishSession({
      email: 'user@example.test', password: 'test-password',
    })).rejects.toThrow('앱을 완전히 종료');
    await expect(signupAfterSessionCleanup({
      email: 'new@example.test', name: 'new', password: 'test-password',
    })).rejects.toThrow('앱을 완전히 종료');
    expect(loginUser).not.toHaveBeenCalled();
    expect(signupUser).not.toHaveBeenCalled();
  });

  it('waits past five seconds for sent FCM registration and remote logout before login', async () => {
    vi.useFakeTimers();
    try {
      let finishRegistration!: () => void;
      vi.mocked(capturePendingFcmOperations).mockReturnValue({
        barrier: new Promise<void>((resolve) => { finishRegistration = resolve; }),
        settlement: Promise.resolve([]),
        hasPendingOperations: true,
      });

      const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
      const remoteLogout = prepared.completeRemoteLogout();
      const nextLogin = loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      });

      await vi.advanceTimersByTimeAsync(5_000);
      expect(loginUser).not.toHaveBeenCalled();
      expect(logoutUser).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      finishRegistration();
      await expect(remoteLogout).resolves.toEqual({status: 'signedOut'});
      await expect(nextLogin).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});
      expect(logoutUser).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restart-gates auth entry when a remote logout was already sent at timeout', async () => {
    vi.useFakeTimers();
    try {
      let finishRemoteLogout!: () => void;
      vi.mocked(logoutUser).mockReturnValue(new Promise<null>((resolve) => {
        finishRemoteLogout = () => resolve(null);
      }));
      const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
      const remoteLogout = prepared.completeRemoteLogout();
      await vi.waitFor(() => expect(logoutUser).toHaveBeenCalledOnce());

      const nextLogin = loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      });
      const rejected = expect(nextLogin).rejects.toThrow('앱을 완전히 종료');
      await vi.advanceTimersByTimeAsync(21_000);
      await rejected;
      expect(loginUser).not.toHaveBeenCalled();

      finishRemoteLogout();
      await expect(remoteLogout).resolves.toEqual({status: 'signedOut'});
      await expect(loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      })).rejects.toThrow('앱을 완전히 종료');
      expect(loginUser).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retains issued refresh tokens while optional FCM metadata times out auth entry', async () => {
    vi.useFakeTimers();
    try {
      const refresh = trackRefreshForLogout(AUTH_GENERATION, async (onIssued) => {
        onIssued({
          ...LOGIN_RESPONSE,
          accessToken: 'metadata-wait-access',
          refreshToken: 'metadata-wait-refresh',
        });
        throw new Error('closing rejected local save');
      });
      await expect(refresh).rejects.toThrow();
      let finishMetadata!: (value: {}) => void;
      vi.mocked(getLogoutFcmDeactivationPayload).mockReturnValueOnce(
        new Promise((resolve) => { finishMetadata = resolve; }),
      );
      vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
        generation: AUTH_GENERATION, accessToken: null, refreshToken: null,
      });
      const preparation = prepareCurrentSessionLogout(CURRENT_USER.id);
      await vi.waitFor(() => expect(getLogoutFcmDeactivationPayload).toHaveBeenCalledOnce());
      const nextLogin = loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      });
      const rejected = expect(nextLogin).rejects.toThrow('앱을 완전히 종료');
      await vi.advanceTimersByTimeAsync(5_000);
      await rejected;
      finishMetadata({});

      const prepared = await preparation;
      await prepared.completeRemoteLogout();
      expect(logoutUser).toHaveBeenCalledWith('metadata-wait-access', {
        refreshToken: 'metadata-wait-refresh',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks every remote logout flight until all generations settle', async () => {
    vi.useFakeTimers();
    try {
      let finishFirstBarrier!: () => void;
      vi.mocked(capturePendingFcmOperations)
        .mockReturnValueOnce({
          barrier: new Promise<void>((resolve) => { finishFirstBarrier = resolve; }),
          settlement: Promise.resolve([]),
          hasPendingOperations: true,
        })
        .mockReturnValueOnce({
          barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
        });
      const firstPrepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
      const firstRemote = firstPrepared.completeRemoteLogout();

      const nextGeneration = (AUTH_GENERATION + 1) as AuthSessionGeneration;
      vi.mocked(getAuthSessionGeneration).mockReturnValue(nextGeneration);
      vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
        generation: nextGeneration,
        accessToken: 'second-access',
        refreshToken: 'second-refresh',
      });
      const secondPrepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
      await expect(secondPrepared.completeRemoteLogout()).resolves.toEqual({status: 'signedOut'});

      const nextLogin = loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(loginUser).not.toHaveBeenCalled();
      finishFirstBarrier();
      await expect(firstRemote).resolves.toEqual({status: 'signedOut'});
      await expect(nextLogin).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for a remote flight registered after auth entry snapshots an earlier flight', async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const firstBarrier = new Promise<void>((resolve) => { finishFirst = resolve; });
    const secondBarrier = new Promise<void>((resolve) => { finishSecond = resolve; });
    vi.mocked(capturePendingFcmOperations)
      .mockReturnValueOnce({
        barrier: firstBarrier, settlement: Promise.resolve([]), hasPendingOperations: true,
      })
      .mockReturnValueOnce({
        barrier: secondBarrier, settlement: Promise.resolve([]), hasPendingOperations: true,
      });
    const firstPrepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
    const firstRemote = firstPrepared.completeRemoteLogout();
    const nextLogin = loginAndEstablishSession({
      email: 'user@example.test', password: 'test-password',
    });

    const nextGeneration = (AUTH_GENERATION + 1) as AuthSessionGeneration;
    vi.mocked(getAuthSessionGeneration).mockReturnValue(nextGeneration);
    vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
      generation: nextGeneration, accessToken: 'second-access', refreshToken: 'second-refresh',
    });
    const secondPrepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
    const secondRemote = secondPrepared.completeRemoteLogout();
    finishFirst();
    await firstRemote;
    await Promise.resolve();
    expect(loginUser).not.toHaveBeenCalled();
    finishSecond();
    await secondRemote;
    await expect(nextLogin).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});
  });

  it('hands a refresh issued during logout to the remote revocation request', async () => {
    let issueTokens!: (tokens: LoginResponse) => void;
    let rejectRefresh!: (error: Error) => void;
    const refresh = trackRefreshForLogout(
      AUTH_GENERATION,
      (onIssued) => new Promise<never>((_, reject) => {
        issueTokens = (tokens) => onIssued(tokens);
        rejectRefresh = reject;
      }),
    );
    void refresh.catch(() => undefined);
    vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
      generation: AUTH_GENERATION,
      accessToken: null,
      refreshToken: null,
    });

    const preparation = prepareCurrentSessionLogout(CURRENT_USER.id);
    issueTokens({
      ...LOGIN_RESPONSE,
      accessToken: 'issued-during-logout-access',
      refreshToken: 'issued-during-logout-refresh',
    });
    rejectRefresh(new Error('closing gate rejected local persistence'));
    const prepared = await preparation;
    await expect(prepared.completeRemoteLogout()).resolves.toEqual({status: 'signedOut'});
    expect(logoutUser).toHaveBeenCalledWith('issued-during-logout-access', {
      refreshToken: 'issued-during-logout-refresh',
    });
  });

  it('claims refresh handoff before a delayed auth read and Map timeout cleanup', async () => {
    vi.useFakeTimers();
    try {
      let finishAuthRead!: () => void;
      vi.mocked(getStoredAuthSession).mockReturnValueOnce(new Promise((resolve) => {
        finishAuthRead = () => resolve({
          generation: AUTH_GENERATION, accessToken: null, refreshToken: null,
        });
      }));
      let issueTokens!: (tokens: LoginResponse) => void;
      let rejectRefresh!: (error: Error) => void;
      const refresh = trackRefreshForLogout(AUTH_GENERATION, (onIssued) =>
        new Promise<never>((_, reject) => {
          issueTokens = onIssued;
          rejectRefresh = reject;
        }));
      void refresh.catch(() => undefined);

      const preparation = prepareCurrentSessionLogout(CURRENT_USER.id);
      const blockedLogin = loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      });
      const rejected = expect(blockedLogin).rejects.toThrow('앱을 완전히 종료');
      await vi.advanceTimersByTimeAsync(5_000);
      await rejected;
      issueTokens({...LOGIN_RESPONSE, accessToken: 'late-access', refreshToken: 'late-refresh'});
      rejectRefresh(new Error('closing rejected durable save'));
      finishAuthRead();

      const prepared = await preparation;
      await prepared.completeRemoteLogout();
      expect(logoutUser).toHaveBeenCalledWith('late-access', {refreshToken: 'late-refresh'});
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['null', 'raw-error'] as const)(
    'uses captured FCM credentials to compensate after %s auth storage result',
    async (storedResult) => {
      if (storedResult === 'null') {
        vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
          generation: AUTH_GENERATION, accessToken: null, refreshToken: null,
        });
      } else {
        vi.mocked(getStoredAuthSession).mockRejectedValueOnce(new Error('keychain unavailable'));
      }
      let finishRegistration!: () => void;
      const registrationBarrier = new Promise<void>((resolve) => { finishRegistration = resolve; });
      vi.mocked(capturePendingFcmOperations).mockReturnValueOnce({
        barrier: registrationBarrier,
        settlement: registrationBarrier.then(() => [{
          accessToken: 'captured-old-access', clientInstanceId: 'captured-old-client',
          kind: 'registration' as const, token: 'captured-token', tokenId: null,
          state: 'mayHaveSent' as const,
        }]),
        hasPendingOperations: true,
      });
      vi.mocked(getLogoutFcmDeactivationPayload).mockRejectedValueOnce(
        new Error('metadata unavailable'),
      );

      const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
      const remote = prepared.completeRemoteLogout();
      const nextLogin = loginAndEstablishSession({
        email: 'next@example.test', password: 'test-password',
      });
      expect(logoutUser).not.toHaveBeenCalled();
      expect(loginUser).not.toHaveBeenCalled();
      finishRegistration();
      await remote;
      await expect(nextLogin).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});

      expect(compensateCapturedFcmOperations).toHaveBeenCalledOnce();
      expect(logoutUser).toHaveBeenCalledWith('captured-old-access', {});
      expect(vi.mocked(logoutUser).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(loginUser).mock.invocationCallOrder[0]!,
      );
      expect(rotateClientInstanceId).not.toHaveBeenCalled();
    },
  );

  it('cleans captured old clients A/B before current-client logout and auth entry', async () => {
    const obligations = [
      {
        accessToken: 'old-access', clientInstanceId: 'old-A', kind: 'registration' as const,
        token: 'token-A', tokenId: null, state: 'mayHaveSent' as const,
      },
      {
        accessToken: 'old-access', clientInstanceId: 'old-B', kind: 'deactivation' as const,
        token: null, tokenId: 202, state: 'mayHaveSent' as const,
      },
    ];
    vi.mocked(capturePendingFcmOperations).mockReturnValueOnce({
      barrier: Promise.resolve(), settlement: Promise.resolve(obligations),
      hasPendingOperations: true,
    });
    vi.mocked(getLogoutFcmDeactivationPayload).mockResolvedValueOnce({
      clientInstanceId: 'current-C',
    });
    let finishCompensation!: () => void;
    vi.mocked(compensateCapturedFcmOperations).mockReturnValueOnce(
      new Promise((resolve) => { finishCompensation = () => resolve(obligations); }),
    );

    const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
    const remote = prepared.completeRemoteLogout();
    const nextLogin = loginAndEstablishSession({
      email: 'next@example.test', password: 'test-password',
    });
    await Promise.resolve();
    expect(logoutUser).not.toHaveBeenCalled();
    expect(loginUser).not.toHaveBeenCalled();
    finishCompensation();
    await remote;
    await nextLogin;

    expect(compensateCapturedFcmOperations).toHaveBeenCalledWith(obligations);
    expect(logoutUser).toHaveBeenCalledWith('login-access-token', {
      refreshToken: 'login-refresh-token', clientInstanceId: 'current-C',
    });
    expect(rotateClientInstanceId).toHaveBeenCalledWith('current-C');
    expect(vi.mocked(compensateCapturedFcmOperations).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(logoutUser).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(logoutUser).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(loginUser).mock.invocationCallOrder[0]!,
    );
  });

  it.each(['known DELETE', 'attempt recovery POST'])(
    'keeps auth entry closed when a captured %s exceeds the remote deadline',
    async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
          generation: AUTH_GENERATION, accessToken: null, refreshToken: null,
        });
        let finishOperation!: () => void;
        const barrier = new Promise<void>((resolve) => { finishOperation = resolve; });
        const obligation = {
          accessToken: 'captured-old-access', clientInstanceId: 'captured-old-client',
          kind: 'registration' as const, token: 'captured-token', tokenId: null,
          state: 'mayHaveSent' as const,
        };
        vi.mocked(capturePendingFcmOperations).mockReturnValueOnce({
          barrier,
          obligations: [obligation],
          settlement: barrier.then(() => [obligation]),
          hasPendingOperations: true,
        });
        const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
        const remote = prepared.completeRemoteLogout();
        const nextLogin = loginAndEstablishSession({
          email: 'next@example.test', password: 'test-password',
        });
        const rejected = expect(nextLogin).rejects.toThrow('앱을 완전히 종료');
        await vi.advanceTimersByTimeAsync(21_000);
        await rejected;
        expect(loginUser).not.toHaveBeenCalled();
        finishOperation();
        await remote;
        expect(compensateCapturedFcmOperations).toHaveBeenCalledOnce();
        expect(logoutUser).toHaveBeenCalledWith('captured-old-access', {});
        expect(rotateClientInstanceId).not.toHaveBeenCalled();
        expect(loginUser).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([401, 500])(
    'restart-gates auth entry when captured FCM compensation logout returns %s',
    async (status) => {
      vi.mocked(getStoredAuthSession).mockResolvedValueOnce({
        generation: AUTH_GENERATION, accessToken: null, refreshToken: null,
      });
      const obligation = {
        accessToken: 'captured-old-access', clientInstanceId: 'captured-old-client',
        kind: 'registration' as const, token: 'captured-token', tokenId: null,
        state: 'mayHaveSent' as const,
      };
      vi.mocked(capturePendingFcmOperations).mockReturnValueOnce({
        barrier: Promise.resolve(),
        obligations: [obligation],
        settlement: Promise.resolve([obligation]),
        hasPendingOperations: true,
      });
      vi.mocked(logoutUser).mockRejectedValueOnce(new FaithLogApiError({
        kind: status === 401 ? 'sessionExpired' : 'error', status, message: 'logout failed',
      }));

      const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
      await expect(prepared.completeRemoteLogout()).resolves.toMatchObject({
        status: 'signedOutWithRemoteWarning',
      });
      await expect(loginAndEstablishSession({
        email: 'next@example.test', password: 'test-password',
      })).rejects.toThrow('앱을 완전히 종료');
      expect(loginUser).not.toHaveBeenCalled();
      expect(clearFcmRegistrationAttemptsForClientInstance).not.toHaveBeenCalled();
      expect(rotateClientInstanceId).not.toHaveBeenCalled();
    },
  );

  it('revokes a late refresh handoff even when the stored-session read fails', async () => {
    let issueTokens!: (tokens: LoginResponse) => void;
    let rejectRefresh!: (error: Error) => void;
    const refresh = trackRefreshForLogout(
      AUTH_GENERATION,
      (onIssued) => new Promise<never>((_, reject) => {
        issueTokens = (tokens) => onIssued(tokens);
        rejectRefresh = reject;
      }),
    );
    void refresh.catch(() => undefined);
    vi.mocked(getStoredAuthSession).mockRejectedValueOnce(new Error('keychain read failed'));
    let finishRegistration!: () => void;
    vi.mocked(capturePendingFcmOperations).mockReturnValueOnce({
      barrier: new Promise<void>((resolve) => { finishRegistration = resolve; }),
      settlement: Promise.resolve([]),
      hasPendingOperations: true,
    });
    vi.mocked(getLogoutFcmDeactivationPayload).mockResolvedValueOnce({
      clientInstanceId: 'faithlog-client-1',
    });

    const preparation = prepareCurrentSessionLogout(CURRENT_USER.id);
    issueTokens({
      ...LOGIN_RESPONSE,
      accessToken: 'late-read-error-access',
      refreshToken: 'late-read-error-refresh',
    });
    rejectRefresh(new Error('closing gate rejected refresh result'));
    const prepared = await preparation;
    const remote = prepared.completeRemoteLogout();
    await Promise.resolve();
    expect(logoutUser).not.toHaveBeenCalled();
    finishRegistration();
    await expect(remote).resolves.toEqual({
      status: 'signedOutWithRemoteWarning',
      message: '로컬 세션은 종료했지만 서버 로그아웃 정보는 확인하지 못했습니다.',
    });
    expect(getLogoutFcmDeactivationPayload).toHaveBeenCalledOnce();
    expect(logoutUser).toHaveBeenCalledWith('late-read-error-access', {
      refreshToken: 'late-read-error-refresh',
      clientInstanceId: 'faithlog-client-1',
    });
  });

  it('blocks every auth entry while an issued refresh handoff is unconsumed', async () => {
    const refresh = trackRefreshForLogout(AUTH_GENERATION, async (onIssued) => {
      onIssued({...LOGIN_RESPONSE});
      throw new Error('durable save failed');
    });
    await expect(refresh).rejects.toThrow('durable save failed');

    await expect(loginAndEstablishSession({
      email: 'user@example.test', password: 'test-password',
    })).rejects.toThrow('앱을 완전히 종료');
    await expect(signupAfterSessionCleanup({
      email: 'new@example.test', name: 'new', password: 'test-password',
    })).rejects.toThrow('앱을 완전히 종료');
    expect(loginUser).not.toHaveBeenCalled();
    expect(signupUser).not.toHaveBeenCalled();
  });

  it('restart-gates a concurrent auth entry when production-like logout timeout settles first', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(logoutUser).mockImplementation(() => new Promise<never>((_, reject) => {
        setTimeout(() => reject(new FaithLogApiError({
          kind: 'offline', message: 'request timeout',
        })), 5_000);
      }));
      const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
      const remoteLogout = prepared.completeRemoteLogout();
      await vi.waitFor(() => expect(logoutUser).toHaveBeenCalledOnce());
      const nextLogin = loginAndEstablishSession({
        email: 'user@example.test', password: 'test-password',
      });
      const rejected = expect(nextLogin).rejects.toThrow('앱을 완전히 종료');

      await vi.advanceTimersByTimeAsync(5_000);
      await expect(remoteLogout).resolves.toMatchObject({status: 'signedOutWithRemoteWarning'});
      await rejected;
      expect(loginUser).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists login tokens only after user and campus establishment succeeds', async () => {
    let resolveUser!: (user: CurrentUser) => void;
    vi.mocked(fetchCurrentUser).mockReturnValue(
      new Promise<CurrentUser>((resolve) => {
        resolveUser = resolve;
      }),
    );

    const pending = loginAndEstablishSession({
      email: 'user@example.test',
      password: 'test-password',
    });
    await vi.waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledOnce());
    expect(saveTokens).not.toHaveBeenCalled();
    resolveUser(CURRENT_USER);

    await expect(pending).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});
    expect(saveTokens).toHaveBeenCalledWith(LOGIN_RESPONSE, AUTH_GENERATION);
    expect(clearTokens).not.toHaveBeenCalled();
  });

  it('completes local token invalidation before starting remote logout', async () => {
    let finishLocalLogout!: (cleared: boolean) => void;
    vi.mocked(clearTokens).mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishLocalLogout = resolve;
      }),
    );
    vi.mocked(getLogoutFcmDeactivationPayload).mockResolvedValue({
      clientInstanceId: 'faithlog-client-1',
    });

    const pending = logoutCurrentSession();
    await vi.waitFor(() =>
      expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION),
    );
    expect(logoutUser).not.toHaveBeenCalled();
    expect(rotateClientInstanceId).not.toHaveBeenCalled();
    finishLocalLogout(true);
    await vi.waitFor(() => expect(logoutUser).toHaveBeenCalledOnce());

    await expect(pending).resolves.toEqual({status: 'signedOut'});
    expect(rotateClientInstanceId).toHaveBeenCalledWith('faithlog-client-1');
    expect(clearFcmRegistrationAttemptsForClientInstance).toHaveBeenCalledWith(
      'faithlog-client-1',
    );
    expect(logoutUser).toHaveBeenCalledWith('login-access-token', {
      refreshToken: 'login-refresh-token',
      clientInstanceId: 'faithlog-client-1',
    });
    expect(vi.mocked(clearTokens).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rotateClientInstanceId).mock.invocationCallOrder[0]!,
    );
    expect(
      vi.mocked(logoutUser).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(clearFcmRegistrationAttemptsForClientInstance).mock.invocationCallOrder[0]!,
    );
    expect(
      vi.mocked(clearFcmRegistrationAttemptsForClientInstance).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(rotateClientInstanceId).mock.invocationCallOrder[0]!);
  });

  it('does not claim logout when local invalidation was superseded', async () => {
    vi.mocked(clearTokens).mockResolvedValue(false);

    await expect(prepareCurrentSessionLogout(CURRENT_USER.id)).rejects.toBeInstanceOf(
      StaleAuthSessionReadError,
    );
    expect(logoutUser).not.toHaveBeenCalled();
  });

  it('waits for registrations captured before logout before calling the server', async () => {
    let finishRegistration!: () => void;
    vi.mocked(capturePendingFcmOperations).mockReturnValue({
      barrier: new Promise<void>((resolve) => {
        finishRegistration = resolve;
      }),
      settlement: Promise.resolve([]),
      hasPendingOperations: true,
    });

    const pending = logoutCurrentSession(CURRENT_USER.id);
    await vi.waitFor(() =>
      expect(capturePendingFcmOperations).toHaveBeenCalledOnce(),
    );
    expect(logoutUser).not.toHaveBeenCalled();
    finishRegistration();

    await expect(pending).resolves.toEqual({status: 'signedOut'});
    expect(logoutUser).toHaveBeenCalledOnce();
  });

  it('does not allow a new login to overtake the previous remote logout', async () => {
    let finishRegistration!: () => void;
    vi.mocked(capturePendingFcmOperations).mockReturnValue({
      barrier: new Promise<void>((resolve) => {
        finishRegistration = resolve;
      }),
      settlement: Promise.resolve([]),
      hasPendingOperations: true,
    });

    const prepared = await prepareCurrentSessionLogout(CURRENT_USER.id);
    const remoteLogout = prepared.completeRemoteLogout();
    const nextLogin = loginAndEstablishSession({
      email: 'user@example.test',
      password: 'test-password',
    });

    await Promise.resolve();
    expect(loginUser).not.toHaveBeenCalled();

    finishRegistration();
    await expect(remoteLogout).resolves.toEqual({status: 'signedOut'});
    await expect(nextLogin).resolves.toEqual({status: 'noCampus', user: CURRENT_USER});
    expect(vi.mocked(logoutUser).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(loginUser).mock.invocationCallOrder[0]!,
    );
  });

  it('still revokes the remote auth session when FCM logout metadata is unavailable', async () => {
    vi.mocked(getLogoutFcmDeactivationPayload).mockRejectedValue(
      new Error('secure storage unavailable'),
    );

    await expect(logoutCurrentSession(CURRENT_USER.id)).resolves.toEqual({
      status: 'signedOutWithRemoteWarning',
      message:
        '서버 로그아웃은 요청했지만 기기 알림 연결 해제 여부는 확인하지 못했습니다.',
    });
    expect(logoutUser).toHaveBeenCalledWith('login-access-token', {
      refreshToken: 'login-refresh-token',
    });
  });

  it('restart-gates auth entry after revocation when client rotation fails', async () => {
    vi.mocked(getLogoutFcmDeactivationPayload).mockResolvedValue({
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(rotateClientInstanceId).mockRejectedValue(
      new Error('secure storage unavailable'),
    );

    await expect(logoutCurrentSession(CURRENT_USER.id)).resolves.toEqual({
      status: 'signedOutWithRemoteWarning',
      message:
        '알림 연결 정리를 확인하지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.',
    });
    expect(logoutUser).toHaveBeenCalledWith('login-access-token', {
      refreshToken: 'login-refresh-token',
      clientInstanceId: 'faithlog-client-1',
    });
  });

  it('returns a visible warning result when remote logout cannot be confirmed', async () => {
    vi.mocked(logoutUser).mockRejectedValue(new TypeError('network unavailable'));

    await expect(logoutCurrentSession(CURRENT_USER.id)).resolves.toEqual({
      status: 'signedOutWithRemoteWarning',
      message:
        '이 기기의 토큰은 삭제했지만 서버 로그아웃 확인은 완료하지 못했습니다.',
    });
    expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION);
  });
});
