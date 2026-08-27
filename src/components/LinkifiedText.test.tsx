import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const linkingMocks = vi.hoisted(() => ({
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => undefined),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Linking: linkingMocks,
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
  };
});

import {LinkifiedText, parseLinkifiedText} from './LinkifiedText';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('LinkifiedText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('separates safe web links while preserving text and trailing punctuation', () => {
    expect(parseLinkifiedText('안내: https://faithlog.app/path?q=1, 다음 줄 www.example.com.')).toEqual([
      {kind: 'text', value: '안내: '},
      {kind: 'link', url: 'https://faithlog.app/path?q=1', value: 'https://faithlog.app/path?q=1'},
      {kind: 'text', value: ', 다음 줄 '},
      {kind: 'link', url: 'https://www.example.com', value: 'www.example.com'},
      {kind: 'text', value: '.'},
    ]);
  });

  it('does not create links for unsafe schemes or ordinary text', () => {
    expect(parseLinkifiedText('javascript:alert(1)과 faithlog.app')).toEqual([
      {kind: 'text', value: 'javascript:alert(1)과 faithlog.app'},
    ]);
  });

  it('opens a safe link once without exposing failures to the parent flow', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<LinkifiedText text="자세히 https://faithlog.app/notice" />);
    });

    const link = renderer!.root.find((item) => item.props.accessibilityRole === 'link');
    await act(async () => link.props.onPress());

    expect(linkingMocks.canOpenURL).toHaveBeenCalledWith('https://faithlog.app/notice');
    expect(linkingMocks.openURL).toHaveBeenCalledWith('https://faithlog.app/notice');
  });
});
