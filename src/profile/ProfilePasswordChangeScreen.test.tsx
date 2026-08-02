import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const auth = vi.hoisted(() => ({generation: 3, allowed: true}));
const access = vi.hoisted(() => ({readCurrentAccessToken: vi.fn()}));
const api = vi.hoisted(() => ({
  changeMyPassword: vi.fn(),
  deactivateMyFcmToken: vi.fn(),
  deactivateMyFcmTokenForCleanup: vi.fn(),
  logoutUser: vi.fn(),
}));
const passwordSession = vi.hoisted(() => ({clearPasswordChangedSession: vi.fn()}));
const expiration = vi.hoisted(() => ({expireAuthSession: vi.fn()}));
const fcm = vi.hoisted(() => ({beginFcmTransitionCleanup: vi.fn()}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
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
    constructor(readonly detail: Record<string, unknown>) {
      super(String(detail.message));
    }
  },
}));
vi.mock('../api/tokenStorage', () => ({
  getAuthSessionGeneration: () => auth.generation,
  isAuthSessionRequestAllowed: (generation: number) => auth.allowed && generation === auth.generation,
}));
vi.mock('../auth/accessTokenResolver', () => access);
vi.mock('../auth/passwordChangeSession', () => passwordSession);
vi.mock('../auth/sessionExpiration', () => expiration);
vi.mock('../auth/fcmTransitionCleanup', () => fcm);
vi.mock('../theme', () => ({colors: new Proxy({}, {get: () => '#000000'}), spacing: {sm: 8, md: 12, lg: 16}}));

import {FaithLogApiError} from '../api/client';
import {ProfilePasswordChangeScreen} from './ProfilePasswordChangeScreen';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('ProfilePasswordChangeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.generation = 3;
    auth.allowed = true;
    access.readCurrentAccessToken.mockResolvedValue({generation: 3, accessToken: 'access-token'});
    api.changeMyPassword.mockResolvedValue(null);
    passwordSession.clearPasswordChangedSession.mockResolvedValue({status: 'cleared'});
  });

  it('submits once and signs out through credential-only cleanup without FCM or logout calls', async () => {
    let resolve!: () => void;
    api.changeMyPassword.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const onChanged = vi.fn();
    const renderer = await renderScreen(onChanged);
    await changeText(renderer, '현재 비밀번호', 'current-password');
    await changeText(renderer, '새 비밀번호', 'new-password');
    await changeText(renderer, '새 비밀번호 확인', 'new-password');

    await act(async () => {
      byLabel(renderer, '비밀번호 변경 완료').props.onPress();
      byLabel(renderer, '비밀번호 변경 완료').props.onPress();
    });

    expect(api.changeMyPassword).toHaveBeenCalledOnce();
    expect(api.changeMyPassword).toHaveBeenCalledWith(
      'access-token',
      {currentPassword: 'current-password', newPassword: 'new-password'},
      3,
    );

    resolve();
    await act(async () => {});
    expect(passwordSession.clearPasswordChangedSession).toHaveBeenCalledOnce();
    expect(passwordSession.clearPasswordChangedSession).toHaveBeenCalledWith(3);
    expect(expiration.expireAuthSession).not.toHaveBeenCalled();
    expect(fcm.beginFcmTransitionCleanup).not.toHaveBeenCalled();
    expect(api.deactivateMyFcmToken).not.toHaveBeenCalled();
    expect(api.deactivateMyFcmTokenForCleanup).not.toHaveBeenCalled();
    expect(api.logoutUser).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledExactlyOnceWith();
    renderer.unmount();
  });

  it('blocks mismatch and same-password forms before token or network access', async () => {
    const renderer = await renderScreen();
    await changeText(renderer, '현재 비밀번호', 'same-password');
    await changeText(renderer, '새 비밀번호', 'same-password');
    await changeText(renderer, '새 비밀번호 확인', 'different');
    await press(renderer, '비밀번호 변경 완료');
    expect(textOccurrences(renderer, '새 비밀번호 확인이 일치하지 않습니다.')).toBeGreaterThan(0);

    await changeText(renderer, '새 비밀번호 확인', 'same-password');
    await press(renderer, '비밀번호 변경 완료');
    expect(textOccurrences(renderer, '현재 비밀번호와 다른 비밀번호를 입력해 주세요.')).toBeGreaterThan(0);
    expect(access.readCurrentAccessToken).not.toHaveBeenCalled();
    expect(api.changeMyPassword).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('keeps the form and shows the dedicated current-password error', async () => {
    api.changeMyPassword.mockRejectedValue(new FaithLogApiError({
      kind: 'error', status: 400, code: 'AUTH_CURRENT_PASSWORD_MISMATCH', message: 'raw',
    }));
    const onChanged = vi.fn();
    const renderer = await renderScreen(onChanged);
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');

    expect(inputByLabel(renderer, '현재 비밀번호').props.accessibilityHint)
      .toBe('현재 비밀번호가 일치하지 않습니다.');
    expect(inputByLabel(renderer, '새 비밀번호').props.accessibilityHint).toBeUndefined();
    expect(inputByLabel(renderer, '새 비밀번호 확인').props.accessibilityHint)
      .toBeUndefined();
    expect(fieldAlertTextOccurrences(
      renderer,
      'currentPassword',
      '현재 비밀번호가 일치하지 않습니다.',
    )).toBeGreaterThan(0);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('raw');
    expect(byLabel(renderer, '현재 비밀번호').props.value).toBe('current-password');
    expect(passwordSession.clearPasswordChangedSession).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();

    await changeText(renderer, '현재 비밀번호', 'corrected-current-password');
    expect(inputByLabel(renderer, '현재 비밀번호').props.accessibilityHint).toBeUndefined();
    expect(fieldAlerts(renderer, 'currentPassword')).toHaveLength(0);
    renderer.unmount();
  });

  it('shows same-password backend error only on the new-password field', async () => {
    api.changeMyPassword.mockRejectedValue(new FaithLogApiError({
      kind: 'error',
      status: 400,
      code: 'AUTH_PASSWORD_CHANGE_SAME_PASSWORD',
      message: 'raw new password detail',
    }));
    const renderer = await renderScreen();
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');

    expect(inputByLabel(renderer, '현재 비밀번호').props.accessibilityHint).toBeUndefined();
    expect(inputByLabel(renderer, '새 비밀번호').props.accessibilityHint)
      .toBe('현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
    expect(inputByLabel(renderer, '새 비밀번호 확인').props.accessibilityHint)
      .toBeUndefined();
    expect(fieldAlertTextOccurrences(
      renderer,
      'newPassword',
      '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
    )).toBeGreaterThan(0);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('raw new password detail');

    await changeText(renderer, '새 비밀번호', 'corrected-new-password');
    expect(inputByLabel(renderer, '새 비밀번호').props.accessibilityHint).toBeUndefined();
    expect(fieldAlerts(renderer, 'newPassword')).toHaveLength(0);
    renderer.unmount();
  });

  it('keeps validation errors field-scoped and clears only the edited field error', async () => {
    const renderer = await renderScreen();
    await press(renderer, '비밀번호 변경 완료');

    expect(inputByLabel(renderer, '현재 비밀번호').props.accessibilityHint)
      .toBe('현재 비밀번호를 입력해 주세요.');
    expect(inputByLabel(renderer, '새 비밀번호').props.accessibilityHint)
      .toBe('새 비밀번호를 입력해 주세요.');
    expect(inputByLabel(renderer, '새 비밀번호 확인').props.accessibilityHint)
      .toBe('새 비밀번호 확인을 입력해 주세요.');

    await changeText(renderer, '현재 비밀번호', 'current-password');

    expect(inputByLabel(renderer, '현재 비밀번호').props.accessibilityHint).toBeUndefined();
    expect(inputByLabel(renderer, '새 비밀번호').props.accessibilityHint)
      .toBe('새 비밀번호를 입력해 주세요.');
    expect(inputByLabel(renderer, '새 비밀번호 확인').props.accessibilityHint)
      .toBe('새 비밀번호 확인을 입력해 주세요.');
    renderer.unmount();
  });

  it('keeps auth and local credentials on an offline PATCH failure', async () => {
    api.changeMyPassword.mockRejectedValue(new FaithLogApiError({
      kind: 'offline', message: 'raw offline detail',
    }));
    const onChanged = vi.fn();
    const renderer = await renderScreen(onChanged);
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');

    expect(passwordSession.clearPasswordChangedSession).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(textOccurrences(renderer, '네트워크 상태를 확인하고 다시 시도해 주세요.'))
      .toBeGreaterThan(0);
    renderer.unmount();
  });

  it('lets each secure field be revealed and hidden without changing its value', async () => {
    const renderer = await renderScreen();
    await changeText(renderer, '현재 비밀번호', 'current-password');

    expect(inputByLabel(renderer, '현재 비밀번호').props.secureTextEntry).toBe(true);
    await press(renderer, '현재 비밀번호 표시');
    expect(inputByLabel(renderer, '현재 비밀번호').props.secureTextEntry).toBe(false);
    expect(inputByLabel(renderer, '현재 비밀번호').props.value).toBe('current-password');
    await press(renderer, '현재 비밀번호 숨기기');
    expect(inputByLabel(renderer, '현재 비밀번호').props.secureTextEntry).toBe(true);
    renderer.unmount();
  });

  it('drops a success from a changed auth generation', async () => {
    let resolve!: () => void;
    api.changeMyPassword.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const onChanged = vi.fn();
    const renderer = await renderScreen(onChanged);
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');
    auth.generation = 4;
    resolve();
    await act(async () => {});

    expect(passwordSession.clearPasswordChangedSession).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('does not sign out a newer session when credential cleanup declines the old generation', async () => {
    passwordSession.clearPasswordChangedSession.mockResolvedValue({status: 'declined'});
    const onChanged = vi.fn();
    const renderer = await renderScreen(onChanged);
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');

    expect(passwordSession.clearPasswordChangedSession).toHaveBeenCalledWith(3);
    expect(onChanged).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('returns to login with a safe warning when durable credential deletion fails', async () => {
    passwordSession.clearPasswordChangedSession.mockResolvedValue({
      status: 'cleanupFailed',
      warning: '로컬 로그인 정리 재시작 필요',
    });
    const onChanged = vi.fn();
    const renderer = await renderScreen(onChanged);
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');

    expect(onChanged).toHaveBeenCalledExactlyOnceWith(
      '로컬 로그인 정리 재시작 필요',
    );
    expect(expiration.expireAuthSession).not.toHaveBeenCalled();
    expect(fcm.beginFcmTransitionCleanup).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('finishes current credential cleanup after unmount without setting local UI state', async () => {
    let resolveServer!: () => void;
    api.changeMyPassword.mockReturnValue(new Promise<void>((resolve) => {
      resolveServer = resolve;
    }));
    const onChanged = vi.fn();
    const renderer = await renderScreen(onChanged);
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');
    await act(async () => renderer.unmount());
    resolveServer();
    await act(async () => Promise.resolve());

    expect(passwordSession.clearPasswordChangedSession).toHaveBeenCalledWith(3);
    expect(onChanged).toHaveBeenCalledExactlyOnceWith();
  });
});

async function renderScreen(onChanged = vi.fn()) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ProfilePasswordChangeScreen onBack={vi.fn()} onPasswordChanged={onChanged} />);
  });
  return renderer;
}

async function fillValid(renderer: ReactTestRenderer) {
  await changeText(renderer, '현재 비밀번호', 'current-password');
  await changeText(renderer, '새 비밀번호', 'new-password');
  await changeText(renderer, '새 비밀번호 확인', 'new-password');
}

function byLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function inputByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) =>
    node.props.accessibilityLabel === label &&
    typeof node.props.secureTextEntry === 'boolean');
}

function fieldAlert(
  renderer: ReactTestRenderer,
  field: 'confirmPassword' | 'currentPassword' | 'newPassword',
) {
  return renderer.root.find((node) =>
    node.props.nativeID === `profile-password-${field}-error` &&
    node.props.accessibilityRole === 'alert');
}

function fieldAlerts(
  renderer: ReactTestRenderer,
  field: 'confirmPassword' | 'currentPassword' | 'newPassword',
) {
  return renderer.root.findAll((node) =>
    node.props.nativeID === `profile-password-${field}-error` &&
    node.props.accessibilityRole === 'alert');
}

function fieldAlertTextOccurrences(
  renderer: ReactTestRenderer,
  field: 'confirmPassword' | 'currentPassword' | 'newPassword',
  text: string,
) {
  return fieldAlert(renderer, field)
    .findAll((node) => node.children.includes(text))
    .length;
}

async function changeText(renderer: ReactTestRenderer, label: string, value: string) {
  await act(async () => { byLabel(renderer, label).props.onChangeText(value); });
}

async function press(renderer: ReactTestRenderer, label: string) {
  await act(async () => { byLabel(renderer, label).props.onPress(); });
}

function textOccurrences(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) => node.children.includes(text)).length;
}
