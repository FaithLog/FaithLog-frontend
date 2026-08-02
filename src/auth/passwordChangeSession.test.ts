import {beforeEach, describe, expect, it, vi} from 'vitest';

const storage = vi.hoisted(() => ({
  generation: 3,
  startPasswordChangeCredentialClear: vi.fn(),
}));
const cache = vi.hoisted(() => ({clearCurrentUserCache: vi.fn()}));
const handoff = vi.hoisted(() => ({discardRefreshTokensForGeneration: vi.fn()}));
const localCleanup = vi.hoisted(() => ({
  trackLocalSessionCleanup: vi.fn(<T,>(operation: Promise<T>) => operation),
}));
const fcm = vi.hoisted(() => ({beginFcmTransitionCleanup: vi.fn()}));
const api = vi.hoisted(() => ({
  deactivateMyFcmToken: vi.fn(),
  deactivateMyFcmTokenForCleanup: vi.fn(),
  logoutUser: vi.fn(),
}));

vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: () => storage.generation,
  startPasswordChangeCredentialClear: storage.startPasswordChangeCredentialClear,
}));
vi.mock('../api/currentUserCache', () => cache);
vi.mock('./refreshLogoutHandoff', () => handoff);
vi.mock('./localCleanupBarrier', () => localCleanup);
vi.mock('./fcmTransitionCleanup', () => fcm);
vi.mock('../api/client', () => api);

import {clearPasswordChangedSession} from './passwordChangeSession';

describe('password-change local credential teardown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.generation = 3;
    storage.startPasswordChangeCredentialClear.mockReturnValue({
      cleared: true,
      previousGeneration: 3,
      currentGeneration: 4,
      completion: Promise.resolve(),
    });
  });

  it('clears only current local credentials without FCM or logout side effects', async () => {
    storage.generation = 4;

    await expect(clearPasswordChangedSession(3 as never)).resolves.toEqual({
      status: 'cleared',
    });

    expect(storage.startPasswordChangeCredentialClear).toHaveBeenCalledExactlyOnceWith(3);
    expect(cache.clearCurrentUserCache).toHaveBeenCalledOnce();
    expect(handoff.discardRefreshTokensForGeneration).toHaveBeenCalledExactlyOnceWith(3);
    expect(localCleanup.trackLocalSessionCleanup).toHaveBeenCalledOnce();
    expect(fcm.beginFcmTransitionCleanup).not.toHaveBeenCalled();
    expect(api.deactivateMyFcmToken).not.toHaveBeenCalled();
    expect(api.deactivateMyFcmTokenForCleanup).not.toHaveBeenCalled();
    expect(api.logoutUser).not.toHaveBeenCalled();
  });

  it('declines stale generations without touching local user or refresh state', async () => {
    storage.startPasswordChangeCredentialClear.mockReturnValue({
      cleared: false,
      previousGeneration: 4,
      currentGeneration: 4,
      completion: Promise.resolve(),
    });
    storage.generation = 4;

    await expect(clearPasswordChangedSession(3 as never)).resolves.toEqual({
      status: 'declined',
    });
    expect(cache.clearCurrentUserCache).not.toHaveBeenCalled();
    expect(handoff.discardRefreshTokensForGeneration).not.toHaveBeenCalled();
  });

  it('returns a safe restart warning when current durable credential deletion fails', async () => {
    storage.startPasswordChangeCredentialClear.mockReturnValue({
      cleared: true,
      previousGeneration: 3,
      currentGeneration: 4,
      completion: Promise.reject(new Error('raw secure storage detail')),
    });
    storage.generation = 4;

    await expect(clearPasswordChangedSession(3 as never)).resolves.toEqual({
      status: 'cleanupFailed',
      warning: '비밀번호는 변경됐지만 이 기기의 로그인 정보를 완전히 정리하지 못했습니다. 앱을 다시 실행한 뒤 로그인해 주세요.',
    });
  });

  it('does not let an old A clear transition affect a newer A after A to B to A', async () => {
    let finish!: () => void;
    storage.startPasswordChangeCredentialClear.mockReturnValue({
      cleared: true,
      previousGeneration: 3,
      currentGeneration: 4,
      completion: new Promise<void>((resolve) => { finish = resolve; }),
    });
    storage.generation = 4;
    const clearing = clearPasswordChangedSession(3 as never);
    expect(cache.clearCurrentUserCache).toHaveBeenCalledOnce();

    storage.generation = 5;
    finish();
    await expect(clearing).resolves.toEqual({status: 'superseded'});
    expect(cache.clearCurrentUserCache).toHaveBeenCalledOnce();
  });
});
