import React from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) => ReactModule.createElement(name, props, children);
  return {
    FlatList: ({data, renderItem, ListEmptyComponent, ...props}) => ReactModule.createElement(
      'FlatList', props, data.length === 0 ? ListEmptyComponent : data.map((item, index) =>
        ReactModule.createElement(ReactModule.Fragment, {key: item.assetId ?? item.localId}, renderItem({item, index}))),
    ),
    Image: host('Image'),
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

import {
  PollNoticeBadge,
  PollNoticeBlock,
  PollNoticeEditorSection,
  PollNoticeGallery,
} from './PollNoticeComponents';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('poll notice components', () => {
  it('renders an accessible list badge only when hasNotice is explicitly true', async () => {
    let visible;
    let hidden;
    await act(async () => {
      visible = create(React.createElement(PollNoticeBadge, {hasNotice: true}));
      hidden = create(React.createElement(PollNoticeBadge, {hasNotice: false}));
    });
    expect(rendered(visible)).toContain('공지 있음');
    expect(hidden.toJSON()).toBeNull();
  });

  it('renders notice below the title region and renders no empty container for blank notice', async () => {
    let visible;
    let blank;
    await act(async () => {
      visible = create(React.createElement(PollNoticeBlock, {notice: '장소 변경 안내'}));
      blank = create(React.createElement(PollNoticeBlock, {notice: '  '}));
    });
    expect(rendered(visible)).toContain('투표 공지');
    expect(rendered(visible)).toContain('장소 변경 안내');
    expect(blank.toJSON()).toBeNull();
  });

  it('keeps notice draft and successful assets while retrying only the failed image', async () => {
    const onChangeNotice = vi.fn();
    const onRetry = vi.fn();
    const items = [
      {localId: 'ready', previewUri: 'memory://ready', status: 'ready', progress: 1, assetId: 10, sha256: 'a'.repeat(64)},
      {localId: 'failed', previewUri: 'memory://failed', status: 'failed', progress: 0, errorMessage: '업로드 실패'},
    ];
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollNoticeEditorSection, {
        disabled: false,
        notice: '보존할 공지',
        onAddImages: vi.fn(),
        onChangeNotice,
        onMove: vi.fn(),
        onRemove: vi.fn(),
        onRetry,
        uploadItems: items,
      }));
    });

    expect(rendered(renderer)).toContain('보존할 공지');
    expect(rendered(renderer)).toContain('업로드 완료');
    expect(rendered(renderer)).toContain('업로드 실패');
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '선택한 이미지 업로드 재시도'}).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledWith('failed');
    expect(onChangeNotice).not.toHaveBeenCalled();
    expect(renderer.root.findByType('FlatList').props.horizontal).toBe(true);
  });

  it('uses a horizontal lazy list for detail images and no original URL', async () => {
    const onRetry = vi.fn();
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollNoticeGallery, {
        assets: [{
          assetId: 10,
          thumbnailUrl: 'https://signed.invalid/10/thumb',
          detailUrl: 'https://signed.invalid/10/detail',
          expiresAt: '2026-08-03T03:10:00Z',
        }],
        onRetry,
      }));
    });
    expect(renderer.root.findByType('FlatList').props.horizontal).toBe(true);
    expect(renderer.root.findByType('Image').props.source).toEqual({uri: 'https://signed.invalid/10/detail'});
    expect(JSON.stringify(renderer.toJSON())).not.toContain('original');
    await act(async () => {
      renderer.root.findByType('Image').props.onError();
    });
    expect(onRetry).not.toHaveBeenCalled();
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '투표 공지 이미지 1 다시 불러오기'}).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledWith(10);
    expect(renderer.root.findByType('Image').props.source).toEqual({uri: 'https://signed.invalid/10/detail'});
  });
});

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}
