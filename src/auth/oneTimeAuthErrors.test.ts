import {describe, expect, it} from 'vitest';

import {FaithLogApiError} from '../api/apiError';
import {getLoginAuthErrorMessage, getOneTimeAuthErrorMessage} from './oneTimeAuthErrors';

describe('safe one-time auth error mapping', () => {
  it.each([
    ['AUTH_EMAIL_INVALID', '올바른 이메일 형식으로 입력해 주세요.'],
    ['AUTH_CODE_INVALID', '인증번호가 올바르지 않습니다.'],
    ['AUTH_CODE_EXPIRED', '인증번호가 만료되었습니다. 새 인증번호를 요청해 주세요.'],
    ['AUTH_CODE_MAX_ATTEMPTS', '인증번호 확인 횟수를 초과했습니다. 새 인증번호를 요청해 주세요.'],
    ['AUTH_RESEND_LIMIT_EXCEEDED', '인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.'],
    ['AUTH_EMAIL_DUPLICATE', '이미 가입된 이메일입니다.'],
    ['EMAIL_VERIFICATION_TOKEN_EXPIRED', '이메일 인증이 만료되었습니다. 다시 인증해 주세요.'],
    ['EMAIL_VERIFICATION_TOKEN_REUSED', '이미 사용된 이메일 인증입니다. 다시 인증해 주세요.'],
    ['PASSWORD_RESET_TOKEN_EXPIRED', '비밀번호 재설정 인증이 만료되었습니다. 다시 시작해 주세요.'],
    ['PASSWORD_RESET_TOKEN_REUSED', '이미 사용된 비밀번호 재설정 인증입니다. 다시 시작해 주세요.'],
    ['AUTH_PASSWORD_POLICY_VIOLATION', '비밀번호는 8자 이상 128자 이하로 입력해 주세요.'],
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
});
