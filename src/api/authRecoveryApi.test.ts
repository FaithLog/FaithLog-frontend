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

function successEnvelope(data: unknown, message = '요청이 성공했습니다.') {
  return {
    success: true,
    code: 'SUCCESS',
    message,
    data,
    timestamp: '2026-07-29T00:00:00.000Z',
  };
}

function jsonResponse(data: unknown, message?: string) {
  return new Response(JSON.stringify(successEnvelope(data, message)), {
    status: 200,
    headers: {'Content-Type': 'application/json'},
  });
}

describe('confirmed email verification and password reset API boundary', () => {
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

  it('dispatches the confirmed backend signup verification contract in production', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({expiresInSeconds: 300, resendAvailableInSeconds: 60}))
      .mockResolvedValueOnce(jsonResponse({
        emailVerificationToken: 'memory-token',
        expiresInSeconds: 600,
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 7,
        name: '사용자',
        email: 'user@example.test',
        role: 'USER',
        isActive: true,
      }));

    await requestSignupEmailCode({email: 'user@example.test'});
    await confirmSignupEmailCode({email: 'user@example.test', code: '123456'});
    await signupUser({
      email: 'user@example.test',
      name: '사용자',
      password: 'password123',
      emailVerificationToken: 'memory-token',
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/auth/email-verifications/signup/request',
      expect.objectContaining({method: 'POST', body: JSON.stringify({email: 'user@example.test'})}),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/auth/email-verifications/signup/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({email: 'user@example.test', code: '123456'}),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/auth/signup',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.test',
          name: '사용자',
          password: 'password123',
          emailVerificationToken: 'memory-token',
        }),
      }),
    );
  });

  it('parses the confirmed password-reset envelope without requiring data.message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(
        {expiresInSeconds: 300, resendAvailableInSeconds: 60},
        '가입된 이메일이라면 인증번호가 발송됩니다.',
      ))
      .mockResolvedValueOnce(jsonResponse({
        passwordResetToken: 'memory-reset-token',
        expiresInSeconds: 600,
      }))
      .mockResolvedValueOnce(jsonResponse(null, '비밀번호가 변경되었습니다. 다시 로그인해 주세요.'));

    await expect(requestPasswordResetCode({email: 'user@example.test'})).resolves.toEqual({
      expiresInSeconds: 300,
      resendAvailableInSeconds: 60,
    });
    await confirmPasswordResetCode({email: 'user@example.test', code: '123456'});
    await completePasswordReset({resetToken: 'memory-reset-token', newPassword: 'password123'});

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/auth/password-resets/request',
      expect.objectContaining({method: 'POST', body: JSON.stringify({email: 'user@example.test'})}),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/auth/password-resets/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({email: 'user@example.test', code: '123456'}),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'https://faithlog-549871256004.asia-northeast3.run.app/api/v1/auth/password-resets/complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({resetToken: 'memory-reset-token', newPassword: 'password123'}),
      }),
    );
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    const email = 'lineage@example.test';
    const details = {email, name: '테스트 사용자', password: 'password123'};

    await requestSignupEmailCode({email});
    const first = await confirmSignupEmailCode({email, code: '123456'});
    await expect(signupUser({...details, emailVerificationToken: first.emailVerificationToken}))
      .resolves.toBeTruthy();

    vi.advanceTimersByTime(60_000);
    await requestSignupEmailCode({email});
    const second = await confirmSignupEmailCode({email, code: '123456'});
    expect(second.emailVerificationToken).not.toBe(first.emailVerificationToken);
    await expect(signupUser({...details, emailVerificationToken: first.emailVerificationToken}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_TOKEN_INVALID'}});
    await expect(signupUser({...details, emailVerificationToken: second.emailVerificationToken}))
      .resolves.toBeTruthy();
    await expect(signupUser({...details, emailVerificationToken: second.emailVerificationToken}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_TOKEN_INVALID'}});
  });

  it('shares the backend cooldown and five-request hourly limit across purposes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    const email = 'hourly-limit@example.test';

    await expect(requestSignupEmailCode({email})).resolves.toBeTruthy();
    await expect(requestPasswordResetCode({email}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_RESEND_THROTTLED'}});

    for (let count = 1; count < 5; count += 1) {
      vi.advanceTimersByTime(60_000);
      const operation = count % 2 === 0 ? requestSignupEmailCode : requestPasswordResetCode;
      await expect(operation({email})).resolves.toBeTruthy();
    }
    vi.advanceTimersByTime(60_000);
    await expect(requestSignupEmailCode({email}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_RATE_LIMITED'}});

    vi.advanceTimersByTime(3_600_000);
    await expect(requestSignupEmailCode({email})).resolves.toBeTruthy();
  });

  it('rejects an existing signup email at the request boundary like the backend', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(requestSignupEmailCode({email: 'duplicate@example.test'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_ALREADY_EXISTS', status: 400}});
  });

  it('supports two complete reset cycles for the same email with distinct tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await requestPasswordResetCode({email: 'user@example.test'});
    const first = await confirmPasswordResetCode({email: 'user@example.test', code: '123456'});
    await expect(completePasswordReset({
      resetToken: first.passwordResetToken,
      newPassword: 'first-password123',
    })).resolves.toBeNull();

    vi.advanceTimersByTime(60_000);
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
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_CODE_EXPIRED'}});
    await expect(confirmPasswordResetCode({email: 'user@example.test', code: '123456'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_CODE_INVALID'}});
  });

  it.each([
    ['000000', 'AUTH_EMAIL_VERIFICATION_CODE_INVALID'],
    ['111111', 'AUTH_EMAIL_VERIFICATION_CODE_EXPIRED'],
    ['222222', 'AUTH_EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED'],
  ])('implements the mock verification code scenario %s', async (code, expectedCode) => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await requestSignupEmailCode({email: 'user@example.test'});
    await expect(confirmSignupEmailCode({email: 'user@example.test', code}))
      .rejects.toMatchObject({detail: {code: expectedCode}});
  });

  it('implements the explicit rate-limit mock scenario with the backend code', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(requestSignupEmailCode({email: 'resend-limit@example.test'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_RATE_LIMITED'}});
  });

  it('implements expired and reused reset-token mock scenarios', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(completePasswordReset({
      resetToken: 'mock-expired-reset-token', newPassword: 'password123',
    })).rejects.toMatchObject({detail: {code: 'AUTH_PASSWORD_RESET_TOKEN_INVALID'}});
    await expect(completePasswordReset({
      resetToken: 'mock-reused-reset-token', newPassword: 'password123',
    })).rejects.toMatchObject({detail: {code: 'AUTH_PASSWORD_RESET_TOKEN_INVALID'}});
  });

  it('returns the same password-reset request copy for every email', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    const known = await requestPasswordResetCode({email: 'user@example.test'});
    const unknown = await requestPasswordResetCode({email: 'unknown@example.test'});
    expect(known).toEqual({expiresInSeconds: 300, resendAvailableInSeconds: 60});
    expect(unknown).toEqual(known);
  });

  it('requires a preceding mock code request and accepts the issued code only once', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';

    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '123456'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_CODE_INVALID'}});
    await requestSignupEmailCode({email: 'user@example.test'});
    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '654321'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_CODE_INVALID'}});
    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '123456'}))
      .resolves.toHaveProperty('emailVerificationToken');
    await expect(confirmSignupEmailCode({email: 'user@example.test', code: '123456'}))
      .rejects.toMatchObject({detail: {code: 'AUTH_EMAIL_VERIFICATION_CODE_INVALID'}});
  });
});
