import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const auth = vi.hoisted(() => ({generation: 3, allowed: true}));
const access = vi.hoisted(() => ({readCurrentAccessToken: vi.fn()}));
const api = vi.hoisted(() => ({changeMyPassword: vi.fn()}));
const session = vi.hoisted(() => ({expireAuthSession: vi.fn()}));

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
vi.mock('../auth/sessionExpiration', () => session);
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
    session.expireAuthSession.mockResolvedValue(true);
  });

  it('submits only current/new password once and signs out after durable local cleanup', async () => {
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
    expect(session.expireAuthSession).toHaveBeenCalledWith(3);
    expect(onChanged).toHaveBeenCalledOnce();
    renderer.unmount();
  });

  it('blocks mismatch and same-password forms before token or network access', async () => {
    const renderer = await renderScreen();
    await changeText(renderer, '현재 비밀번호', 'same');
    await changeText(renderer, '새 비밀번호', 'same');
    await changeText(renderer, '새 비밀번호 확인', 'different');
    await press(renderer, '비밀번호 변경 완료');
    expect(textOccurrences(renderer, '새 비밀번호 확인이 일치하지 않습니다.')).toBeGreaterThan(0);

    await changeText(renderer, '새 비밀번호 확인', 'same');
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
    const renderer = await renderScreen();
    await fillValid(renderer);
    await press(renderer, '비밀번호 변경 완료');

    expect(textOccurrences(renderer, '현재 비밀번호가 일치하지 않습니다.')).toBeGreaterThan(0);
    expect(byLabel(renderer, '현재 비밀번호').props.value).toBe('current-password');
    expect(session.expireAuthSession).not.toHaveBeenCalled();
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

    expect(session.expireAuthSession).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    renderer.unmount();
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

async function changeText(renderer: ReactTestRenderer, label: string, value: string) {
  await act(async () => { byLabel(renderer, label).props.onChangeText(value); });
}

async function press(renderer: ReactTestRenderer, label: string) {
  await act(async () => { byLabel(renderer, label).props.onPress(); });
}

function textOccurrences(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) => node.children.includes(text)).length;
}
