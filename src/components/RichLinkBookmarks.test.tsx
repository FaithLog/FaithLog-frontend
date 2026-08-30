import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Alert: {alert: vi.fn()},
    Image: host('Image'),
    Linking: {canOpenURL: vi.fn(async () => true), openURL: vi.fn(async () => undefined)},
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});
vi.mock('../theme', () => ({
  colors: {borderSoft: '#eee', surface: '#fff', textMuted: '#888', textPrimary: '#111', textSecondary: '#555'},
  radius: {control: 12},
  spacing: {gap: 8},
  typography: {body: {fontSize: 15}},
}));

import {RichLinkBookmarks} from './RichLinkBookmarks';

describe('RichLinkBookmarks', () => {
  it('keeps plain content unchanged when it has no URL', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RichLinkBookmarks text="주일 예배 안내입니다." />);
    });
    expect(renderer.root.findByProps({children: '주일 예배 안내입니다.'})).toBeTruthy();
    expect(renderer.root.findAllByProps({accessibilityRole: 'link'})).toHaveLength(0);
  });

  it('renders a Notion-style bookmark for each safe URL', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <RichLinkBookmarks
          loadPreview={vi.fn(async () => ({description: '새 소식', imageUrl: null, title: 'FaithLog 안내'}))}
          text={'확인해 주세요.\nhttps://faithlog.kr/news'}
        />,
      );
    });
    expect(renderer.root.findByProps({accessibilityLabel: '링크 열기 FaithLog 안내'})).toBeTruthy();
    expect(renderer.root.findByProps({children: 'faithlog.kr'})).toBeTruthy();
    expect(renderer.root.findByProps({children: '새 소식'})).toBeTruthy();
  });
});
