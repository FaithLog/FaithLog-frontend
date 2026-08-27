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
    PanResponder: {create: (handlers) => ({panHandlers: handlers})},
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

import {
  PollNoticeBlock,
  PollNoticeEditorSection,
  PollNoticeGallery,
  PollNoticeMediaPanel,
} from './PollNoticeComponents';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('poll notice components', () => {
  it('renders notice below the title region and renders no empty container for blank notice', async () => {
    let visible;
    let blank;
    await act(async () => {
      visible = create(React.createElement(PollNoticeBlock, {enabled: true, notice: '장소 변경 안내'}));
      blank = create(React.createElement(PollNoticeBlock, {enabled: true, notice: '  '}));
    });
    expect(rendered(visible)).toContain('투표 공지');
    expect(rendered(visible)).toContain('장소 변경 안내');
    expect(blank.toJSON()).toBeNull();
  });

  it('renders safe web addresses in a poll notice as accessible links', async () => {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollNoticeBlock, {
        enabled: true,
        notice: '메뉴 확인 https://faithlog.app/menu',
      }));
    });

    expect(renderer.root.findAll((node) =>
      node.props.accessibilityRole === 'link'
      && String(node.props.accessibilityLabel).startsWith('링크 열기 '))).not.toHaveLength(0);
  });

  it('renders no detail or media subtree when the capability is pending', async () => {
    let detail;
    let media;
    await act(async () => {
      detail = create(React.createElement(PollNoticeBlock, {
        enabled: false,
        notice: 'production에서 숨길 공지',
      }));
      media = create(React.createElement(PollNoticeMediaPanel, {
        campusId: 1,
        enabled: false,
        onRetry: vi.fn(),
        state: {
          status: 'success',
          assets: [{
            assetId: 10,
            sha256: 'a'.repeat(64),
            thumbnailUrl: 'https://signed.invalid/10/thumb',
            detailUrl: 'https://signed.invalid/10/detail',
            expiresAt: '2026-08-03T03:10:00Z',
          }],
        },
        userId: 7,
      }));
    });
    expect(detail.toJSON()).toBeNull();
    expect(media.toJSON()).toBeNull();
  });

  it('keeps notice draft and successful assets while retrying only the failed image', async () => {
    const onChangeNotice = vi.fn();
    const onMove = vi.fn();
    const onRemove = vi.fn();
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
        onMove,
        onRemove,
        onRetry,
        uploadItems: items,
      }));
    });

    expect(rendered(renderer)).toContain('보존할 공지');
    expect(rendered(renderer)).toContain('업로드 실패');
    expect(rendered(renderer)).toContain('×');
    let firstImage = renderer.root.findByProps({
      accessibilityLabel: '투표 공지 이미지 1 순서 이동',
    });
    expect(firstImage.props.accessibilityRole).toBe('adjustable');
    await act(async () => {
      firstImage.props.onTouchMove({nativeEvent: {pageX: 192}});
    });
    expect(onMove).not.toHaveBeenCalled();
    await act(async () => {
      firstImage.props.onLongPress({nativeEvent: {pageX: 100}});
    });
    firstImage = renderer.root.findByProps({
      accessibilityLabel: '투표 공지 이미지 1 순서 이동',
    });
    expect(renderer.root.findByType('FlatList').props.scrollEnabled).toBe(false);
    await act(async () => {
      firstImage.props.onTouchMove({nativeEvent: {pageX: 192}});
      firstImage.props.onTouchEnd();
    });
    expect(onMove).toHaveBeenCalledWith('ready', 'down');
    expect(renderer.root.findByType('FlatList').props.scrollEnabled).toBe(true);
    await act(async () => {
      renderer.root.findByProps({
        accessibilityLabel: '투표 공지 이미지 1 삭제',
      }).props.onPress();
    });
    expect(onRemove).toHaveBeenCalledWith('ready');
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '선택한 이미지 업로드 재시도'}).props.onPress();
    });
    expect(onRetry).toHaveBeenCalledWith('failed');
    expect(onChangeNotice).not.toHaveBeenCalled();
    expect(renderer.root.findByType('FlatList').props).toMatchObject({
      horizontal: true,
      removeClippedSubviews: false,
    });
  });

  it('uses a horizontal lazy list for detail images and no original URL', async () => {
    let resolveRetry;
    const retryFinished = new Promise((resolve) => {
      resolveRetry = resolve;
    });
    const onRetry = vi.fn(() => retryFinished);
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollNoticeGallery, {
        assets: [{
          assetId: 10,
          sha256: 'a'.repeat(64),
          thumbnailUrl: 'https://signed.invalid/10/thumb',
          detailUrl: 'https://signed.invalid/10/detail',
          expiresAt: '2026-08-03T03:10:00Z',
        }],
        campusId: 1,
        onRetry,
        userId: undefined,
      }));
    });
    expect(renderer.root.findByType('FlatList').props.horizontal).toBe(true);
    expect(renderer.root.findByType('Image').props.source).toEqual({uri: 'https://signed.invalid/10/detail'});
    expect(JSON.stringify(renderer.toJSON())).not.toContain('original');
    await act(async () => {
      renderer.root.findByType('Image').props.onError();
    });
    expect(onRetry).not.toHaveBeenCalled();
    const retryButton = renderer.root.findByProps({
      accessibilityLabel: '투표 공지 이미지 1 다시 불러오기',
    });
    await act(async () => {
      retryButton.props.onPress();
      retryButton.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledWith(10);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(rendered(renderer)).toContain('이미지를 불러오지 못했습니다.');
    expect(renderer.root.findAllByType('Image')).toHaveLength(0);
    await act(async () => {
      resolveRetry(true);
      await retryFinished;
    });
    expect(rendered(renderer)).not.toContain('이미지를 불러오지 못했습니다.');
    expect(renderer.root.findByType('Image').props.source).toEqual({
      uri: 'https://signed.invalid/10/detail',
    });
  });

  it('keeps a stable failed image identity when its signed URL rotates', async () => {
    const asset = {
      assetId: 10,
      sha256: 'a'.repeat(64),
      thumbnailUrl: 'https://signed.invalid/10/thumb-a',
      detailUrl: 'https://signed.invalid/10/detail-a',
      expiresAt: '2026-08-03T03:10:00Z',
    };
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollNoticeGallery, {
        assets: [asset],
        campusId: 1,
        onRetry: vi.fn(),
        userId: undefined,
      }));
    });
    await act(async () => {
      renderer.root.findByType('Image').props.onError();
    });
    expect(rendered(renderer)).toContain('이미지를 불러오지 못했습니다.');

    await act(async () => {
      renderer.update(React.createElement(PollNoticeGallery, {
        assets: [{
          ...asset,
          thumbnailUrl: 'https://signed.invalid/10/thumb-b',
          detailUrl: 'https://signed.invalid/10/detail-b',
        }],
        campusId: 1,
        onRetry: vi.fn(),
        userId: undefined,
      }));
    });
    expect(rendered(renderer)).toContain('이미지를 불러오지 못했습니다.');
    expect(renderer.root.findAllByType('Image')).toHaveLength(0);
  });

  it('single-flights retries across two failed gallery assets', async () => {
    let resolveRetry;
    const retryFinished = new Promise((resolve) => {
      resolveRetry = resolve;
    });
    const onRetry = vi.fn(() => retryFinished);
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PollNoticeGallery, {
        assets: [10, 11].map((assetId) => ({
          assetId,
          sha256: String(assetId).padStart(64, '0'),
          thumbnailUrl: `https://signed.invalid/${assetId}/thumb`,
          detailUrl: `https://signed.invalid/${assetId}/detail`,
          expiresAt: '2026-08-03T03:10:00Z',
        })),
        campusId: 1,
        onRetry,
        userId: undefined,
      }));
    });
    await act(async () => {
      for (const image of renderer.root.findAllByType('Image')) image.props.onError();
    });
    const retryButtons = renderer.root.findAllByType('Pressable').filter((node) =>
      node.props.accessibilityLabel?.endsWith('다시 불러오기'));
    expect(retryButtons.map((button) => button.props.accessibilityLabel)).toEqual([
      '투표 공지 이미지 1 다시 불러오기',
      '투표 공지 이미지 2 다시 불러오기',
    ]);
    const retryFirst = retryButtons[0].props.onPress;
    const retrySecond = retryButtons[1].props.onPress;
    await act(async () => {
      retryFirst();
      retrySecond();
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(10);
    expect(renderer.root.findAllByType('Image')).toHaveLength(0);
    await act(async () => {
      resolveRetry(true);
      await retryFinished;
    });
    expect(renderer.root.findAllByType('Image')).toHaveLength(1);
  });
});

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}
