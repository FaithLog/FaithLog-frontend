import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const native = vi.hoisted(() => ({
  appStateListener: null as null | ((state: string) => void),
}));

const api = vi.hoisted(() => ({
  completePasswordReset: vi.fn(),
  confirmPasswordResetCode: vi.fn(),
  confirmSignupEmailCode: vi.fn(),
  requestPasswordResetCode: vi.fn(),
  requestSignupEmailCode: vi.fn(),
}));

const session = vi.hoisted(() => ({
  loginAndEstablishSession: vi.fn(),
  signupAfterSessionCleanup: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    AppState: {
      addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        native.appStateListener = listener;
        return {remove: vi.fn()};
      }),
    },
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

vi.mock('../api/client', () => ({
  ...api,
  FaithLogApiError: class FaithLogApiError extends Error {
    constructor(readonly detail: {kind: string; code?: string; message: string}) {
      super(detail.message);
    }
  },
}));

vi.mock('../analytics/appAnalytics', () => ({
  trackLoginComplete: vi.fn(),
  trackSignUpComplete: vi.fn(),
}));

vi.mock('../analytics/trackedApiSuccess', () => ({
  runWithCompletionEvent: async <T,>(operation: () => Promise<T>, complete: () => void) => {
    const result = await operation();
    complete();
    return result;
  },
}));

vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000000'}),
}));

vi.mock('./session', () => session);

import {LoginForm, SignupForm} from './PublicAuthForms';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('public auth form lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.appStateListener = null;
    api.requestPasswordResetCode.mockResolvedValue({
      message: '가입된 이메일이라면 인증번호가 발송됩니다.',
      expiresInSeconds: 300,
      resendAvailableInSeconds: 60,
    });
    api.confirmPasswordResetCode.mockResolvedValue({
      passwordResetToken: 'memory-reset-token',
      expiresInSeconds: 300,
    });
    api.completePasswordReset.mockResolvedValue(null);
    api.requestSignupEmailCode.mockResolvedValue({
      expiresInSeconds: 300,
      resendAvailableInSeconds: 60,
    });
    api.confirmSignupEmailCode.mockResolvedValue({
      emailVerificationToken: 'memory-signup-token',
      expiresInSeconds: 300,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks reset email and ignores a stale request response after a forced email change', async () => {
    let resolveRequest!: (value: {
      message: string; expiresInSeconds: number; resendAvailableInSeconds: number;
    }) => void;
    api.requestPasswordResetCode.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const renderer = await renderLogin();

    await press(renderer, '비밀번호 찾기');
    await changeText(renderer, '비밀번호 재설정 이메일 입력', 'first@example.test');
    await press(renderer, '인증번호 요청');
    expect(byLabel(renderer, '비밀번호 재설정 이메일 입력').props.editable).toBe(false);

    await changeText(renderer, '비밀번호 재설정 이메일 입력', 'second@example.test');
    await act(async () => resolveRequest({
      message: '가입된 이메일이라면 인증번호가 발송됩니다.',
      expiresInSeconds: 300,
      resendAvailableInSeconds: 60,
    }));

    expect(byLabel(renderer, '비밀번호 재설정 이메일 입력').props.value)
      .toBe('second@example.test');
    expect(renderer.root.findAll((node) =>
      node.props.accessibilityLabel === '비밀번호 재설정 인증번호 입력')).toHaveLength(0);
    renderer.unmount();
  });

  it('clears reset token and all reset inputs after completion without auto-login', async () => {
    const renderer = await renderLogin();
    await press(renderer, '비밀번호 찾기');
    await changeText(renderer, '비밀번호 재설정 이메일 입력', 'user@example.test');
    await pressAndFlush(renderer, '인증번호 요청');
    await changeText(renderer, '비밀번호 재설정 인증번호 입력', '123456');
    await pressAndFlush(renderer, '인증번호 확인');
    await changeText(renderer, '새 비밀번호 입력', 'password123');
    await changeText(renderer, '새 비밀번호 확인 입력', 'password123');
    await pressAndFlush(renderer, '비밀번호 변경');

    expect(api.completePasswordReset).toHaveBeenCalledWith({
      resetToken: 'memory-reset-token',
      newPassword: 'password123',
    });
    expect(session.loginAndEstablishSession).not.toHaveBeenCalled();
    expect(byLabel(renderer, '로그인 이메일 입력').props.value).toBe('');
    expect(byLabel(renderer, '로그인 비밀번호 입력').props.value).toBe('');
    expect(byLabel(renderer, '비밀번호 찾기')).toBeTruthy();
    renderer.unmount();
  });

  it('recalculates expiry on AppState foreground and disables confirmation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    api.requestSignupEmailCode.mockResolvedValue({
      expiresInSeconds: 2,
      resendAvailableInSeconds: 1,
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<SignupForm
        clearNotice={vi.fn()}
        onSignupComplete={vi.fn()}
        switchToLogin={vi.fn()}
      />);
    });
    await changeText(renderer, '회원가입 이메일 입력', 'user@example.test');
    await pressAndFlush(renderer, '인증번호 요청');
    await changeText(renderer, '회원가입 인증번호 입력', '123456');
    expect(byLabel(renderer, '인증번호 확인').props.disabled).toBe(false);

    vi.setSystemTime(new Date('2026-07-29T00:00:03.000Z'));
    await act(async () => native.appStateListener?.('active'));
    expect(byLabel(renderer, '인증번호 확인').props.disabled).toBe(true);
    renderer.unmount();
  });
});

async function renderLogin() {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<LoginForm
      clearNotice={vi.fn()}
      onLoginComplete={vi.fn()}
      switchToSignup={vi.fn()}
    />);
  });
  return renderer;
}

function byLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

async function press(renderer: ReactTestRenderer, label: string) {
  await act(async () => byLabel(renderer, label).props.onPress());
}

async function pressAndFlush(renderer: ReactTestRenderer, label: string) {
  await press(renderer, label);
  await act(async () => Promise.resolve());
}

async function changeText(renderer: ReactTestRenderer, label: string, value: string) {
  await act(async () => byLabel(renderer, label).props.onChangeText(value));
}
