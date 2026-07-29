import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./tokenStorage', () => ({
  getAuthSessionGeneration: vi.fn(() => 1),
  getStoredAuthSession: vi.fn(async () => ({generation: 1, accessToken: null, refreshToken: null})),
  isAccessTokenOwnedByAuthSession: vi.fn(() => true),
  isAuthSessionRequestAllowed: vi.fn(() => true),
  isAuthSessionGenerationCurrent: vi.fn(() => true),
  saveTokens: vi.fn(async () => true),
}));

vi.mock('../auth/sessionExpiration', () => ({expireAuthSession: vi.fn()}));

import {
  completePasswordReset,
  confirmPasswordResetCode,
  confirmSignupEmailCode,
  requestPasswordResetCode,
  requestSignupEmailCode,
  signupUser,
} from './client';
import {resetMockAdapterStateForTests} from './mockAdapter';

describe('provisional auth API boundary', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://faithlog-549871256004.asia-northeast3.run.app';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'false';
    resetMockAdapterStateForTests();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.EXPO_PUBLIC_MOCK_SCENARIO;
  });

  it.each([
    () => requestSignupEmailCode({email: 'user@example.test'}),
    () => confirmSignupEmailCode({email: 'user@example.test', code: '123456'}),
    () => requestPasswordResetCode({email: 'user@example.test'}),
    () => confirmPasswordResetCode({email: 'user@example.test', code: '123456'}),
    () => completePasswordReset({resetToken: 'memory-token', newPassword: 'password123'}),
    () => signupUser({
      email: 'user@example.test',
      name: '사용자',
      password: 'password123',
      emailVerificationToken: 'memory-token',
    }),
  ])('fails closed before network in production while REST Docs are pending', async (operation) => {
    await expect(operation()).rejects.toMatchObject({
      detail: expect.objectContaining({code: 'API_CONTRACT_PENDING'}),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('supports the complete mock reset path without production fallback', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(requestPasswordResetCode({email: 'user@example.test'})).resolves.toMatchObject({
      expiresInSeconds: 300,
      resendAvailableInSeconds: 60,
    });
    const confirmed = await confirmPasswordResetCode({email: 'user@example.test', code: '123456'});
    await expect(completePasswordReset({
      resetToken: confirmed.passwordResetToken,
      newPassword: 'new-password123',
    })).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses separate 300-second code and 600-second token contracts', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(requestSignupEmailCode({email: 'signup@example.test'})).resolves.toEqual({
      expiresInSeconds: 300,
      resendAvailableInSeconds: 60,
    });
    await expect(confirmSignupEmailCode({email: 'signup@example.test', code: '123456'}))
      .resolves.toMatchObject({expiresInSeconds: 600});

    await expect(requestPasswordResetCode({email: 'reset@example.test'})).resolves.toMatchObject({
      expiresInSeconds: 300,
      resendAvailableInSeconds: 60,
    });
    await expect(confirmPasswordResetCode({email: 'reset@example.test', code: '123456'}))
      .resolves.toMatchObject({expiresInSeconds: 600});
  });

  it('issues unique signup tokens and accepts only the latest token once', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    const email = 'lineage@example.test';
    const details = {email, name: '테스트 사용자', password: 'password123'};

    await requestSignupEmailCode({email});
    const first = await confirmSignupEmailCode({email, code: '123456'});
    await expect(signupUser({...details, emailVerificationToken: first.emailVerificationToken}))
      .resolves.toBeTruthy();

    await requestSignupEmailCode({email});
    const second = await confirmSignupEmailCode({email, code: '123456'});
    expect(second.emailVerificationToken).not.toBe(first.emailVerificationToken);
    await expect(signupUser({...details, emailVerificationToken: first.emailVerificationToken}))
      .rejects.toMatchObject({detail: {code: 'EMAIL_VERIFICATION_TOKEN_INVALID'}});
    await expect(signupUser({...details, emailVerificationToken: second.emailVerificationToken}))
      .resolves.toBeTruthy();
    await expect(signupUser({...details, emailVerificationToken: second.emailVerificationToken}))
      .rejects.toMatchObject({detail: {code: 'EMAIL_VERIFICATION_TOKEN_INVALID'}});
  });

  it('allows five hourly requests, blocks the sixth, then resets after one hour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    const email = 'hourly-limit@example.test';

    for (let count = 0; count < 5; count += 1) {
      await expect(requestSignupEmailCode({email})).resolves.toBeTruthy();
    }
    await expect(requestSignupEmailCode({email}))
      .rejects.toMatchObject({detail: {code: 'AUTH_RESEND_LIMIT_EXCEEDED'}});

    vi.advanceTimersByTime(3_600_000);
    await expect(requestSignupEmailCode({email})).resolves.toBeTruthy();
  });

  it('isolates the hourly request limit by signup and reset purpose', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    const email = 'purpose-limit@example.test';

    for (let count = 0; count < 5; count += 1) {
      await requestSignupEmailCode({email});
      await requestPasswordResetCode({email});
    }
    await expect(requestSignupEmailCode({email}))
      .rejects.toMatchObject({detail: {code: 'AUTH_RESEND_LIMIT_EXCEEDED'}});
    await expect(requestPasswordResetCode({email}))
      .rejects.toMatchObject({detail: {code: 'AUTH_RESEND_LIMIT_EXCEEDED'}});
  });

  it('supports two complete reset cycles for the same email with distinct tokens', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await requestPasswordResetCode({email: 'user@example.test'});
    const first = await confirmPasswordResetCode({email: 'user@example.test', code: '123456'});
    await expect(completePasswordReset({
      resetToken: first.passwordResetToken,
      newPassword: 'first-password123',
    })).resolves.toBeNull();

    await requestPasswordResetCode({email: 'user@example.test'});
    const second = await confirmPasswordResetCode({email: 'user@example.test', code: '123456'});
    expect(second.passwordResetToken).not.toBe(first.passwordResetToken);
    await expect(completePasswordReset({
      resetToken: second.passwordResetToken,
      newPassword: 'second-password123',
    })).resolves.toBeNull();
  });

  it('invalidates an issued code after the mock expired-code scenario', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await requestPasswordResetCode({email: 'user@example.test'});
    await expect(confirmPasswordResetCode({email: 'user@example.test', code: '111111'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_CODE_EXPIRED'}});
    await expect(confirmPasswordResetCode({email: 'user@example.test', code: '123456'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_CODE_REQUEST_REQUIRED'}});
  });

  it.each([
    ['000000', 'AUTH_CODE_INVALID'],
    ['111111', 'AUTH_CODE_EXPIRED'],
    ['222222', 'AUTH_CODE_MAX_ATTEMPTS'],
  ])('implements the mock verification code scenario %s', async (code, expectedCode) => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await requestSignupEmailCode({email: 'user@example.test'});
    await expect(confirmSignupEmailCode({email: 'user@example.test', code}))
      .rejects.toMatchObject({detail: {code: expectedCode}});
  });

  it('implements resend limit and duplicate-email mock scenarios', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(requestSignupEmailCode({email: 'resend-limit@example.test'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_RESEND_LIMIT_EXCEEDED'}});
    await requestSignupEmailCode({email: 'duplicate@example.test'});
    const confirmed = await confirmSignupEmailCode({
      email: 'duplicate@example.test', code: '123456',
    });
    await expect(signupUser({
      email: 'duplicate@example.test',
      name: '중복 사용자',
      password: 'password123',
      emailVerificationToken: confirmed.emailVerificationToken,
    })).rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_DUPLICATE'}});
  });

  it('implements expired and reused reset-token mock scenarios', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(completePasswordReset({
      resetToken: 'mock-expired-reset-token', newPassword: 'password123',
    })).rejects.toMatchObject({detail: {code: 'PASSWORD_RESET_TOKEN_EXPIRED'}});
    await expect(completePasswordReset({
      resetToken: 'mock-reused-reset-token', newPassword: 'password123',
    })).rejects.toMatchObject({detail: {code: 'PASSWORD_RESET_TOKEN_REUSED'}});
  });

  it('returns the same password-reset request copy for every email', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    const known = await requestPasswordResetCode({email: 'user@example.test'});
    const unknown = await requestPasswordResetCode({email: 'unknown@example.test'});
    expect(known.message).toBe('가입된 이메일이라면 인증번호가 발송됩니다.');
    expect(unknown.message).toBe(known.message);
  });

  it('requires a preceding mock code request and accepts the issued code only once', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '123456'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_CODE_REQUEST_REQUIRED'}});
    await requestSignupEmailCode({email: 'user@example.test'});
    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '654321'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_CODE_INVALID'}});
    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '123456'}))
      .resolves.toHaveProperty('emailVerificationToken');
    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '123456'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_CODE_REQUEST_REQUIRED'}});
  });
});
