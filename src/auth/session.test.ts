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
  getStoredAuthSession: vi.fn(),
  getStoredSelectedCampusId: vi.fn(),
  isAuthSessionGenerationCurrent: vi.fn(),
  saveSelectedCampusId: vi.fn(),
  saveTokens: vi.fn(),
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
  getStoredAuthSession,
  getStoredSelectedCampusId,
  isAuthSessionGenerationCurrent,
  saveSelectedCampusId,
  saveTokens,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import type {CurrentUser, LoginResponse} from '../api/types';
import {capturePendingFcmRegistrationBarrier} from '../notifications/fcmRegistration';
import {getLogoutFcmDeactivationPayload} from './fcmLogout';
import {
  loginAndEstablishSession,
  logoutCurrentSession,
  prepareCurrentSessionLogout,
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
    vi.mocked(isAuthSessionGenerationCurrent).mockReturnValue(true);
    vi.mocked(getStoredSelectedCampusId).mockResolvedValue(null);
    vi.mocked(saveSelectedCampusId).mockResolvedValue(undefined);
    vi.mocked(saveTokens).mockResolvedValue(true);
    vi.mocked(clearTokens).mockResolvedValue(true);
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
      fcmToken: 'device-token',
    });

    const pending = logoutCurrentSession();
    await vi.waitFor(() =>
      expect(clearTokens).toHaveBeenCalledWith(AUTH_GENERATION),
    );
    expect(logoutUser).not.toHaveBeenCalled();
    finishLocalLogout(true);
    await vi.waitFor(() => expect(logoutUser).toHaveBeenCalledOnce());

    await expect(pending).resolves.toEqual({status: 'signedOut'});
    expect(logoutUser).toHaveBeenCalledWith('login-access-token', {
      refreshToken: 'login-refresh-token',
      clientInstanceId: 'faithlog-client-1',
      fcmToken: 'device-token',
    });
  });

  it('does not claim logout when local invalidation was superseded', async () => {
    vi.mocked(clearTokens).mockResolvedValue(false);

    await expect(prepareCurrentSessionLogout(CURRENT_USER.id)).rejects.toThrow(
      'authentication session changed',
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
