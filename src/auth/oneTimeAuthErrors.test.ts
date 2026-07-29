import {describe, expect, it} from 'vitest';

import {FaithLogApiError} from '../api/apiError';
import {
  getLoginAuthErrorMessage,
  getOneTimeAuthErrorMessage,
  isTerminalPasswordResetError,
  isTerminalSignupVerificationError,
} from './oneTimeAuthErrors';

describe('safe one-time auth error mapping', () => {
  it.each([
    ['AUTH_EMAIL_ALREADY_EXISTS', '이미 가입된 이메일입니다.'],
    ['AUTH_EMAIL_VERIFICATION_REQUIRED', '이메일 인증을 먼저 완료해 주세요.'],
    ['AUTH_EMAIL_VERIFICATION_TOKEN_INVALID', '이메일 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.'],
    ['AUTH_EMAIL_VERIFICATION_CODE_INVALID', '인증번호가 올바르지 않습니다.'],
    ['AUTH_EMAIL_VERIFICATION_CODE_EXPIRED', '인증번호가 만료되었습니다. 새 인증번호를 요청해 주세요.'],
    ['AUTH_EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED', '인증번호 확인 횟수를 초과했습니다. 새 인증번호를 요청해 주세요.'],
    ['AUTH_EMAIL_VERIFICATION_RESEND_THROTTLED', '잠시 후 인증번호를 다시 요청해 주세요.'],
    ['AUTH_EMAIL_VERIFICATION_RATE_LIMITED', '인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.'],
    ['AUTH_EMAIL_DELIVERY_UNAVAILABLE', '인증 이메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.'],
    ['AUTH_EMAIL_VERIFICATION_UNAVAILABLE', '이메일 인증을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'],
    ['AUTH_PASSWORD_RESET_TOKEN_INVALID', '비밀번호 재설정 인증이 만료되었거나 유효하지 않습니다. 다시 시작해 주세요.'],
    ['AUTH_PASSWORD_RESET_SAME_PASSWORD', '현재 비밀번호와 다른 비밀번호를 입력해 주세요.'],
  ])('maps %s to fixed product copy', (code, message) => {
    expect(getOneTimeAuthErrorMessage(new FaithLogApiError({
      kind: 'error', code, message: 'RAW_BACKEND_SECRET_MESSAGE',
    }))).toBe(message);
  });

  it('never exposes unknown backend messages', () => {
    expect(getOneTimeAuthErrorMessage(new FaithLogApiError({
      kind: 'error', code: 'UNKNOWN', message: 'RAW_BACKEND_SECRET_MESSAGE',
    }))).not.toContain('RAW_BACKEND');
  });

  it('distinguishes offline from a generic server failure', () => {
    expect(getOneTimeAuthErrorMessage(new FaithLogApiError({
      kind: 'offline', message: 'raw offline',
    }))).toContain('네트워크');
    expect(getOneTimeAuthErrorMessage(new FaithLogApiError({
      kind: 'error', status: 500, message: 'raw server',
    }))).toContain('잠시 후');
  });

  it('preserves the existing safe invalid-credentials login copy', () => {
    expect(getLoginAuthErrorMessage(new FaithLogApiError({
      kind: 'sessionExpired', status: 401, message: 'raw credentials response',
    }))).toBe('이메일 또는 비밀번호를 다시 확인해 주세요.');
  });

  it('clears only the terminal token errors defined by the backend', () => {
    expect(isTerminalSignupVerificationError(new FaithLogApiError({
      kind: 'error', code: 'AUTH_EMAIL_VERIFICATION_TOKEN_INVALID', message: 'raw',
    }))).toBe(true);
    expect(isTerminalSignupVerificationError(new FaithLogApiError({
      kind: 'error', code: 'AUTH_EMAIL_ALREADY_EXISTS', message: 'raw',
    }))).toBe(false);
    expect(isTerminalPasswordResetError(new FaithLogApiError({
      kind: 'error', code: 'AUTH_PASSWORD_RESET_TOKEN_INVALID', message: 'raw',
    }))).toBe(true);
    expect(isTerminalPasswordResetError(new FaithLogApiError({
      kind: 'error', code: 'AUTH_PASSWORD_RESET_SAME_PASSWORD', message: 'raw',
    }))).toBe(false);
  });
});
