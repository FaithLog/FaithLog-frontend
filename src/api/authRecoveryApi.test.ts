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

  it.each([
    ['000000', 'AUTH_CODE_INVALID'],
    ['111111', 'AUTH_CODE_EXPIRED'],
    ['222222', 'AUTH_CODE_MAX_ATTEMPTS'],
  ])('implements the mock verification code scenario %s', async (code, expectedCode) => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

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
});
