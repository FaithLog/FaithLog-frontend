import {describe, expect, it} from 'vitest';

import {
  applySignupCodeConfirmed,
  applySignupCodeRequested,
  buildVerifiedSignupPayload,
  changeSignupEmail,
  createSignupVerificationState,
  getAuthCodeTiming,
  sanitizeVerificationCode,
} from './oneTimeAuthFlow';

describe('signup email verification flow', () => {
  it('blocks an invalid email before a request can start', () => {
    const state = changeSignupEmail(createSignupVerificationState(), 'not-an-email');

    expect(state.canRequestCode).toBe(false);
    expect(state.emailError).toBe('올바른 이메일 형식으로 입력해 주세요.');
  });

  it('does not build a signup request before verification', () => {
    const state = changeSignupEmail(createSignupVerificationState(), 'user@example.test');

    expect(() => buildVerifiedSignupPayload(state, {
      name: '테스트 사용자',
      password: 'password123',
      passwordConfirm: 'password123',
    })).toThrow('EMAIL_VERIFICATION_REQUIRED');
  });

  it('includes the in-memory email verification token in the signup payload', () => {
    const requested = applySignupCodeRequested(
      changeSignupEmail(createSignupVerificationState(), 'USER@example.test'),
      {expiresInSeconds: 300, resendAvailableInSeconds: 60},
      1_000,
    );
    const verified = applySignupCodeConfirmed(
      {...requested, code: '123456'},
      {emailVerificationToken: 'memory-only-verification-token', expiresInSeconds: 600},
      2_000,
    );

    expect(buildVerifiedSignupPayload(verified, {
      name: ' 테스트 사용자 ',
      password: 'password123',
      passwordConfirm: 'password123',
    })).toEqual({
      email: 'user@example.test',
      name: '테스트 사용자',
      password: 'password123',
      emailVerificationToken: 'memory-only-verification-token',
    });
  });

  it('clears code, verification, token, deadlines, resend and errors on email change', () => {
    const verified = applySignupCodeConfirmed({
      ...applySignupCodeRequested(
        changeSignupEmail(createSignupVerificationState(), 'first@example.test'),
        {expiresInSeconds: 300, resendAvailableInSeconds: 60},
        1_000,
      ),
      code: '123456',
      codeError: '이전 오류',
      requestError: '이전 요청 오류',
    }, {
      emailVerificationToken: 'sensitive-token',
      expiresInSeconds: 600,
    }, 2_000);

    expect(changeSignupEmail(verified, 'second@example.test')).toEqual({
      ...createSignupVerificationState(),
      email: 'second@example.test',
      canRequestCode: true,
    });
  });

  it('keeps only the first six numeric code characters', () => {
    expect(sanitizeVerificationCode('1a 2-3.4567')).toBe('123456');
  });

  it('recalculates expiry and resend countdown from absolute deadlines on foreground', () => {
    expect(getAuthCodeTiming({expiresAt: 301_000, resendAvailableAt: 61_000}, 1_000)).toEqual({
      expired: false,
      expiresInSeconds: 300,
      resendInSeconds: 60,
    });
    expect(getAuthCodeTiming({expiresAt: 301_000, resendAvailableAt: 61_000}, 301_001)).toEqual({
      expired: true,
      expiresInSeconds: 0,
      resendInSeconds: 0,
    });
  });
});
