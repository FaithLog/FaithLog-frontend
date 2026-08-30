import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Alert: {alert: vi.fn()},
    Image: host('Image'),
    Modal: host('Modal'),
    Pressable: host('Pressable'),
    SafeAreaView: host('SafeAreaView'),
    Share: {dismissedAction: 'dismissedAction', share: vi.fn()},
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});
vi.mock('../theme', () => ({
  colors: {background: '#f7f8fa', border: '#ddd', primary: '#38f', primarySoft: '#eef', surface: '#fff', text: '#111', textSecondary: '#555'},
  radius: {control: 12},
  spacing: {gap: 8},
}));
vi.mock('./contentSharing', async (importOriginal) => {
  const original = await importOriginal<typeof import('./contentSharing')>();
  return {
    ...original,
    contentShareCoordinator: {share: vi.fn()},
  };
});

import {ContentShareActions} from './ContentShareActions';

describe('ContentShareActions', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    delete process.env.EXPO_PUBLIC_CONTENT_LINK_BASE_URL;
  });

  it.each([
    [
      'announcement',
      <ContentShareActions
        announcementId={41}
        campusId={7}
        categoryName="예배"
        kind="announcement"
        title="주일 안내"
      />,
    ],
    [
      'poll',
      <ContentShareActions campusId={7} kind="poll" pollId={31} title="점심 메뉴" />,
    ],
  ])('opens both share choices from one compact command for %s', async (_kind, element) => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(element);
    });

    expect(renderer.root.findAllByProps({accessibilityLabel: '링크 공유'})).toHaveLength(0);
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '공유 방법 열기'}).props.onPress({stopPropagation: vi.fn()});
    });
    expect(renderer.root.findByProps({accessibilityLabel: '링크 공유'})).toBeTruthy();
    expect(renderer.root.findByProps({accessibilityLabel: '카카오톡으로 공유'})).toBeTruthy();
  });
});
