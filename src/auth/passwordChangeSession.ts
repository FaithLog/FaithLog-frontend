import {
  getAuthSessionGeneration,
  startPasswordChangeCredentialClear,
  type AuthSessionGeneration,
} from '../api/tokenStorage';
import {clearCurrentUserCache} from '../api/currentUserCache';
import {trackLocalSessionCleanup} from './localCleanupBarrier';
import {discardRefreshTokensForGeneration} from './refreshLogoutHandoff';

const PASSWORD_CHANGE_CLEANUP_WARNING =
  '비밀번호는 변경됐지만 이 기기의 로그인 정보를 완전히 정리하지 못했습니다. 앱을 다시 실행한 뒤 로그인해 주세요.';

export type PasswordChangedSessionClearResult =
  | {status: 'cleared'}
  | {status: 'cleanupFailed'; warning: string}
  | {status: 'declined' | 'superseded'};

export async function clearPasswordChangedSession(
  requestGeneration: AuthSessionGeneration,
): Promise<PasswordChangedSessionClearResult> {
  const transition = startPasswordChangeCredentialClear(requestGeneration);
  if (!transition.cleared) return {status: 'declined'};

  clearCurrentUserCache();
  discardRefreshTokensForGeneration(requestGeneration);

  try {
    await trackLocalSessionCleanup(transition.completion);
  } catch {
    return getAuthSessionGeneration() === transition.currentGeneration
      ? {status: 'cleanupFailed', warning: PASSWORD_CHANGE_CLEANUP_WARNING}
      : {status: 'superseded'};
  }

  return getAuthSessionGeneration() === transition.currentGeneration
    ? {status: 'cleared'}
    : {status: 'superseded'};
}
