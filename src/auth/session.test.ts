import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/client', () => ({
  FaithLogApiError: class FaithLogApiError extends Error {
    readonly detail: {kind: string; message: string};

    constructor(detail: {kind: string; message: string}) {
      super(detail.message);
      this.detail = detail;
    }
  },
  fetchCurrentUser: vi.fn(),
  fetchMyCampuses: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  refreshAuthToken: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  beginAuthSession: vi.fn(),
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(),
  getStoredAuthSession: vi.fn(),
  getStoredSelectedCampusId: vi.fn(),
  isAuthSessionGenerationCurrent: vi.fn(),
  rotateClientInstanceId: vi.fn(),
  saveSelectedCampusId: vi.fn(),
  saveTokens: vi.fn(),
  StaleAuthSessionReadError: class StaleAuthSessionReadError extends Error {
    constructor(readonly expectedGeneration: number) { super('stale'); }
  },
}));

vi.mock('./fcmLogout', () => ({
  getLogoutFcmDeactivationPayload: vi.fn(),
}));

vi.mock('../notifications/fcmRegistration', () => ({
  capturePendingFcmRegistrationBarrier: vi.fn(() => Promise.resolve()),
}));

import {
  fetchCurrentUser,
  fetchMyCampuses,
  loginUser,
  logoutUser,
} from '../api/client';
import {
  beginAuthSession,
  clearTokens,
  getAuthSessionGeneration,
  getStoredAuthSession,
  getStoredSelectedCampusId,
  isAuthSessionGenerationCurrent,
  rotateClientInstanceId,
  saveSelectedCampusId,
  saveTokens,
  StaleAuthSessionReadError,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import type {CurrentUser, LoginResponse} from '../api/types';
import {capturePendingFcmRegistrationBarrier} from '../notifications/fcmRegistration';
import {getLogoutFcmDeactivationPayload} from './fcmLogout';
import {
  loginAndEstablishSession,
  logoutCurrentSession,
  prepareCurrentSessionLogout,
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
    vi.clearAllMocks();
    vi.mocked(beginAuthSession).mockResolvedValue(AUTH_GENERATION);
    vi.mocked(getAuthSessionGeneration).mockReturnValue(AUTH_GENERATION);
    vi.mocked(isAuthSessionGenerationCurrent).mockReturnValue(true);
    vi.mocked(getStoredSelectedCampusId).mockResolvedValue(null);
    vi.mocked(saveSelectedCampusId).mockResolvedValue(undefined);
    vi.mocked(saveTokens).mockResolvedValue(true);
    vi.mocked(clearTokens).mockResolvedValue(true);
    vi.mocked(rotateClientInstanceId).mockResolvedValue(true);
    vi.mocked(loginUser).mockResolvedValue(LOGIN_RESPONSE);
    vi.mocked(fetchCurrentUser).mockResolvedValue(CURRENT_USER);
    vi.mocked(fetchMyCampuses).mockResolvedValue([]);
    vi.mocked(getStoredAuthSession).mockResolvedValue({
      generation: AUTH_GENERATION,
      accessToken: LOGIN_RESPONSE.accessToken,
      refreshToken: LOGIN_RESPONSE.refreshToken,
    });
    vi.mocked(getLogoutFcmDeactivationPayload).mockResolvedValue({});
    vi.mocked(capturePendingFcmRegistrationBarrier).mockReturnValue(
      Promise.resolve(),
    );
    vi.mocked(logoutUser).mockResolvedValue(null);
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

  it('returns typed cancellation when logout loses lineage during FCM preparation', async () => {
    let finishFcm!: (value: {}) => void;
    vi.mocked(getLogoutFcmDeactivationPayload).mockReturnValueOnce(
      new Promise((resolve) => { finishFcm = resolve; }),
    );
    vi.mocked(clearTokens).mockResolvedValueOnce(false);
    const pending = prepareCurrentSessionLogout(42);
    finishFcm({});
    await expect(pending).rejects.toBeInstanceOf(StaleAuthSessionReadError);
    expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION);
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
    expect(logoutUser).toHaveBeenCalledWith('login-access-token', {
      refreshToken: 'login-refresh-token',
      clientInstanceId: 'faithlog-client-1',
    });
    expect(vi.mocked(clearTokens).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(rotateClientInstanceId).mock.invocationCallOrder[0]!,
    );
    expect(
      vi.mocked(rotateClientInstanceId).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(logoutUser).mock.invocationCallOrder[0]!);
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
    vi.mocked(capturePendingFcmRegistrationBarrier).mockReturnValue(
      new Promise<void>((resolve) => {
        finishRegistration = resolve;
      }),
    );

    const pending = logoutCurrentSession(CURRENT_USER.id);
    await vi.waitFor(() =>
      expect(capturePendingFcmRegistrationBarrier).toHaveBeenCalledOnce(),
    );
    expect(logoutUser).not.toHaveBeenCalled();
    finishRegistration();

    await expect(pending).resolves.toEqual({status: 'signedOut'});
    expect(logoutUser).toHaveBeenCalledOnce();
  });

  it('does not allow a new login to overtake the previous remote logout', async () => {
    let finishRegistration!: () => void;
    vi.mocked(capturePendingFcmRegistrationBarrier).mockReturnValue(
      new Promise<void>((resolve) => {
        finishRegistration = resolve;
      }),
    );

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

  it('omits stale FCM identity but still revokes auth when client rotation fails', async () => {
    vi.mocked(getLogoutFcmDeactivationPayload).mockResolvedValue({
      clientInstanceId: 'faithlog-client-1',
    });
    vi.mocked(rotateClientInstanceId).mockRejectedValue(
      new Error('secure storage unavailable'),
    );

    await expect(logoutCurrentSession(CURRENT_USER.id)).resolves.toEqual({
      status: 'signedOutWithRemoteWarning',
      message:
        '서버 로그아웃은 요청했지만 기기 알림 식별자를 안전하게 교체하지 못해 알림 연결 해제는 생략했습니다.',
    });
    expect(logoutUser).toHaveBeenCalledWith('login-access-token', {
      refreshToken: 'login-refresh-token',
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
