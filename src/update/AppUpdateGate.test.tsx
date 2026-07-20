import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const native = vi.hoisted(() => ({
  appStateListener: null as null | ((state: string) => void),
  backHandler: null as null | (() => boolean),
  removeAppState: vi.fn(),
  removeBack: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    ActivityIndicator: host('ActivityIndicator'),
    AppState: {
      currentState: 'active',
      addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
        native.appStateListener = listener;
        return {remove: native.removeAppState};
      }),
    },
    BackHandler: {
      addEventListener: vi.fn((_event: string, listener: () => boolean) => {
        native.backHandler = listener;
        return {remove: native.removeBack};
      }),
    },
    Linking: {canOpenURL: vi.fn(), openURL: vi.fn()},
    Platform: {OS: 'android'},
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: <T,>(value: T) => value},
    Text: host('Text'),
    View: host('View'),
  };
});

vi.mock('./nativeRemoteUpdateConfig', () => ({
  loadNativeUpdateRequirement: vi.fn().mockResolvedValue({required: false}),
}));

import {AppUpdateGate} from './AppUpdateGate';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: ReactTestRenderer[] = [];

describe('AppUpdateGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.appStateListener = null;
    native.backHandler = null;
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach((renderer) => renderer.unmount());
    });
  });

  it('does not mount app bootstrap until the initial check allows access', async () => {
    let resolve!: (value: {required: false}) => void;
    const checkForUpdate = vi.fn(() => new Promise<{required: false}>((next) => {
      resolve = next;
    }));
    const childMounted = vi.fn();
    function Child() {
      childMounted();
      return <></>;
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AppUpdateGate checkForUpdate={checkForUpdate}><Child /></AppUpdateGate>);
    });
    mounted.push(renderer);
    expect(childMounted).not.toHaveBeenCalled();

    await act(async () => resolve({required: false}));
    expect(childMounted).toHaveBeenCalledTimes(1);
  });

  it('renders a non-dismissible blocking screen and intercepts Android back', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AppUpdateGate checkForUpdate={async () => ({
          required: true,
          title: '업데이트가 필요합니다',
          message: '최신 버전으로 업데이트해 주세요.',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.faithlog.app',
        })}>
          <TextMarker />
        </AppUpdateGate>,
      );
    });
    mounted.push(renderer);

    expect(renderer.root.findAllByProps({accessibilityLabel: 'FaithLog 업데이트'}).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({accessibilityLabel: '업데이트'}).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({accessibilityRole: 'header'}).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(TextMarker)).toHaveLength(0);
    expect(native.backHandler?.()).toBe(true);
  });

  it('rechecks once after background to foreground and cleans up listeners', async () => {
    const checkForUpdate = vi.fn().mockResolvedValue({required: false});
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AppUpdateGate checkForUpdate={checkForUpdate}><TextMarker /></AppUpdateGate>);
    });
    mounted.push(renderer);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      native.appStateListener?.('background');
      native.appStateListener?.('active');
      native.appStateListener?.('active');
    });
    expect(checkForUpdate).toHaveBeenCalledTimes(2);

    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    expect(native.removeAppState).toHaveBeenCalledTimes(1);
  });
});

function TextMarker() {
  return <></>;
}
