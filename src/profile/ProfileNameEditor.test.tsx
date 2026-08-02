import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const auth = vi.hoisted(() => ({generation: 3, allowed: true}));
const access = vi.hoisted(() => ({readCurrentAccessToken: vi.fn()}));
const api = vi.hoisted(() => ({
  getProfileContractCapabilities: vi.fn(() => ({nameEditEnabled: true})),
  updateMyProfileName: vi.fn(),
}));

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
vi.mock('../theme', () => ({colors: new Proxy({}, {get: () => '#000000'})}));

import {FaithLogApiError} from '../api/client';
import type {CurrentUser} from '../api/types';
import {ProfileNameEditor} from './ProfileNameEditor';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const initialUser: CurrentUser = {
  id: 7,
  name: '기존 이름',
  email: 'user@example.test',
  role: 'USER',
  isActive: true,
  lastLoginAt: null,
  campusMemberships: [],
};

describe('ProfileNameEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.generation = 3;
    auth.allowed = true;
    api.getProfileContractCapabilities.mockReturnValue({nameEditEnabled: true});
    access.readCurrentAccessToken.mockResolvedValue({generation: 3, accessToken: 'access-token'});
    api.updateMyProfileName.mockResolvedValue({...initialUser, name: '새 이름'});
  });

  it('renders the current name and read-only email without an email edit control', async () => {
    const renderer = await renderEditor();

    expect(textOccurrences(renderer, initialUser.name)).toBe(1);
    expect(textOccurrences(renderer, initialUser.email)).toBe(1);
    expect(byLabel(renderer, '이메일 (읽기 전용)').props.accessibilityState).toEqual({disabled: true});
    expect(renderer.root.findAll((node) =>
      node.props.accessibilityLabel?.toString().includes('이메일 수정'))).toHaveLength(0);
    renderer.unmount();
  });

  it('submits the exact trimmed body once under rapid duplicate presses', async () => {
    let resolve!: (user: CurrentUser) => void;
    api.updateMyProfileName.mockReturnValue(new Promise((done) => { resolve = done; }));
    const renderer = await renderEditor();
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '  새 이름  ');

    await act(async () => {
      byLabel(renderer, '이름 저장').props.onPress();
      byLabel(renderer, '이름 저장').props.onPress();
    });

    expect(api.updateMyProfileName).toHaveBeenCalledOnce();
    expect(api.updateMyProfileName).toHaveBeenCalledWith(
      'access-token',
      {name: '새 이름'},
      3,
    );
    resolve({...initialUser, name: '새 이름'});
    await act(async () => Promise.resolve());
    expect(textOccurrences(renderer, '새 이름')).toBe(1);
    renderer.unmount();
  });

  it.each(['   ', '가'.repeat(101)])('blocks %j with an inline error and no request', async (name) => {
    const renderer = await renderEditor();
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', name);
    await press(renderer, '이름 저장');

    expect(api.updateMyProfileName).not.toHaveBeenCalled();
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === 'alert').length)
      .toBeGreaterThan(0);
    renderer.unmount();
  });

  it('cancels without changing the current user', async () => {
    const renderer = await renderEditor();
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '취소할 이름');
    await press(renderer, '이름 수정 취소');

    expect(textOccurrences(renderer, initialUser.name)).toBe(1);
    expect(api.updateMyProfileName).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('keeps the previous name and shows safe retry copy on failure', async () => {
    api.updateMyProfileName.mockRejectedValue(new FaithLogApiError({
      kind: 'error', status: 500, message: 'raw user@example.test bearer secret',
    }));
    const renderer = await renderEditor();
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '실패 이름');
    await pressAndFlush(renderer, '이름 저장');

    expect(textOccurrences(renderer, '잠시 후 다시 시도해 주세요.')).toBe(1);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('user@example.test bearer secret');
    renderer.unmount();
  });

  it('routes only the current terminal 401 and drops stale A→B→A success', async () => {
    let resolve!: (user: CurrentUser) => void;
    api.updateMyProfileName.mockReturnValue(new Promise((done) => { resolve = done; }));
    const onSessionExpired = vi.fn();
    const renderer = await renderEditor({onSessionExpired});
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '지연 이름');
    await press(renderer, '이름 저장');

    await act(async () => {
      auth.generation = 4;
      renderer.update(<ProfileNameEditor
        onSessionExpired={onSessionExpired}
        user={{...initialUser, id: 8, name: '사용자 B'}}
      />);
    });
    await act(async () => {
      auth.generation = 5;
      renderer.update(<ProfileNameEditor
        onSessionExpired={onSessionExpired}
        user={initialUser}
      />);
    });
    resolve({...initialUser, name: '지연 이름'});
    await act(async () => Promise.resolve());

    expect(textOccurrences(renderer, initialUser.name)).toBe(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('allows the new identity to save while the stale identity request is still pending', async () => {
    let resolveOld!: (user: CurrentUser) => void;
    api.updateMyProfileName
      .mockReturnValueOnce(new Promise((done) => { resolveOld = done; }))
      .mockResolvedValueOnce({...initialUser, id: 8, name: '사용자 B 새 이름'});
    const renderer = await renderEditor();
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '사용자 A 지연 이름');
    await press(renderer, '이름 저장');

    auth.generation = 4;
    access.readCurrentAccessToken.mockResolvedValue({
      generation: 4,
      accessToken: 'user-b-access-token',
    });
    await act(async () => {
      renderer.update(<ProfileNameEditor
        onSessionExpired={vi.fn()}
        user={{...initialUser, id: 8, name: '사용자 B'}}
      />);
    });
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '사용자 B 새 이름');
    await pressAndFlush(renderer, '이름 저장');

    expect(api.updateMyProfileName).toHaveBeenCalledTimes(2);
    expect(textOccurrences(renderer, '사용자 B 새 이름')).toBe(1);

    resolveOld({...initialUser, name: '사용자 A 지연 이름'});
    await act(async () => Promise.resolve());
    expect(textOccurrences(renderer, '사용자 A 지연 이름')).toBe(0);
    renderer.unmount();
  });

  it('routes a terminal 401 only through the current common session-expiry callback', async () => {
    let reject!: (error: unknown) => void;
    api.updateMyProfileName.mockReturnValue(new Promise((_resolve, rejectPromise) => {
      reject = rejectPromise;
    }));
    const onSessionExpired = vi.fn();
    const renderer = await renderEditor({onSessionExpired});
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '새 이름');
    await press(renderer, '이름 저장');

    auth.generation = 4;
    reject(new FaithLogApiError({
      kind: 'sessionExpired',
      status: 401,
      code: 'AUTH_UNAUTHORIZED',
      message: 'raw token expired',
      authSessionGeneration: 3,
    }));
    await act(async () => Promise.resolve());

    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(onSessionExpired).toHaveBeenCalledWith('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    renderer.unmount();
  });

  it('does not apply a response after unmount', async () => {
    let resolve!: (user: CurrentUser) => void;
    api.updateMyProfileName.mockReturnValue(new Promise((done) => { resolve = done; }));
    const renderer = await renderEditor();
    await press(renderer, '이름 수정');
    await changeText(renderer, '이름 입력', '지연 이름');
    await press(renderer, '이름 저장');
    await act(async () => renderer.unmount());
    resolve({...initialUser, name: '지연 이름'});
    await act(async () => Promise.resolve());
  });

  it('hides the edit capability while the canonical contract is pending', async () => {
    api.getProfileContractCapabilities.mockReturnValue({nameEditEnabled: false});
    const renderer = await renderEditor();
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === '이름 수정')).toHaveLength(0);
    renderer.unmount();
  });
});

async function renderEditor(overrides: Partial<React.ComponentProps<typeof ProfileNameEditor>> = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ProfileNameEditor
      onSessionExpired={vi.fn()}
      user={initialUser}
      {...overrides}
    />);
  });
  return renderer;
}

function byLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function textOccurrences(renderer: ReactTestRenderer, value: string) {
  return renderer.root.findAll((node) => String(node.type) === 'Text' && node.props.children === value).length;
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
