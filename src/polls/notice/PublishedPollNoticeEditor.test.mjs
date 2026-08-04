import React from 'react';
import {act, create} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) => ReactModule.createElement(name, props, children);
  return {
    FlatList: ({data, renderItem, ...props}) => ReactModule.createElement(
      'FlatList', props, data.map((item, index) => ReactModule.createElement(
        ReactModule.Fragment,
        {key: item.localId},
        renderItem({item, index}),
      )),
    ),
    Image: host('Image'),
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
  };
});

vi.mock('expo-secure-store', () => ({
  deleteItemAsync: vi.fn(async () => undefined),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock('../../announcements/announcementNativeMedia', () => ({
  createNativeAnnouncementBinaryUploader: vi.fn(() => vi.fn()),
  discardPreparedAnnouncementImages: vi.fn(async () => undefined),
}));

vi.mock('../../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn(async () => 'test-access-token'),
}));

vi.mock('../../api/client', () => ({
  isMockModeEnabled: vi.fn(() => true),
}));

vi.mock('../../media/mediaApi', () => ({
  mediaApi: {},
}));

import {PublishedPollNoticeEditor} from './PublishedPollNoticeEditor';
import {resetMockAdapterStateForTests} from '../../api/mockAdapter';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('published poll notice editor', () => {
  beforeEach(() => resetMockAdapterStateForTests());

  it('keeps the edited title, notice, and ordered images after a failed save', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('failed'));
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishedPollNoticeEditor, {
        onCancel: vi.fn(),
        onSave,
        onSaved: vi.fn(),
        poll: pollDetail(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 제목'}).props.onChangeText('수정 제목');
      renderer.root.findByProps({accessibilityLabel: '투표 공지글'}).props.onChangeText('수정 공지');
      renderer.root.findByProps({accessibilityLabel: '투표 공지 이미지 추가'}).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({
      title: '수정 제목',
      notice: '수정 공지',
      imageAssetIds: [90_001, 95_001],
    });
    expect(renderer.root.findByProps({accessibilityLabel: '게시된 투표 제목'}).props.value).toBe('수정 제목');
    expect(renderer.root.findByProps({accessibilityLabel: '투표 공지글'}).props.value).toBe('수정 공지');
    expect(JSON.stringify(renderer.toJSON())).toContain('입력한 내용은 유지');
  });

  it('allocates a new mock asset identity without colliding with saved images', async () => {
    const onSave = vi.fn().mockResolvedValue(pollDetail());
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishedPollNoticeEditor, {
        onCancel: vi.fn(),
        onSave,
        onSaved: vi.fn(),
        poll: pollDetail({imageAssetIds: [95_001]}),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '투표 공지 이미지 추가'}).props.onPress();
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      imageAssetIds: [95_001, 95_002],
    }));
  });

  it('does not commit a completed save after navigation unmounts the editor', async () => {
    let resolveSave;
    const saveFinished = new Promise((resolve) => {
      resolveSave = resolve;
    });
    const onSaved = vi.fn();
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishedPollNoticeEditor, {
        onCancel: vi.fn(),
        onSave: vi.fn(() => saveFinished),
        onSaved,
        poll: pollDetail(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
    });
    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      resolveSave(pollDetail({title: '저장 완료'}));
      await saveFinished;
    });

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('single-flights two synchronous save presses from the same render and releases after success', async () => {
    let resolveFirstSave;
    const firstSave = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });
    const onSave = vi.fn()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce(pollDetail({title: '두 번째 저장'}));
    const onSaved = vi.fn();
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishedPollNoticeEditor, {
        onCancel: vi.fn(),
        onSave,
        onSaved,
        poll: pollDetail(),
      }));
    });

    const sameRenderSaveButton = renderer.root.findByProps({
      accessibilityLabel: '게시된 투표 공지 저장',
    });
    await act(async () => {
      sameRenderSaveButton.props.onPress();
      sameRenderSaveButton.props.onPress();
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSave(pollDetail({title: '첫 번째 저장'}));
      await firstSave;
    });
    expect(onSaved).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it('releases the save flight after an error while preserving the edited draft', async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce(pollDetail({title: '재시도 저장'}));
    const onSaved = vi.fn();
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishedPollNoticeEditor, {
        onCancel: vi.fn(),
        onSave,
        onSaved,
        poll: pollDetail(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 제목'}).props.onChangeText('보존할 제목');
      renderer.root.findByProps({accessibilityLabel: '투표 공지글'}).props.onChangeText('보존할 공지');
    });

    const sameRenderSaveButton = renderer.root.findByProps({
      accessibilityLabel: '게시된 투표 공지 저장',
    });
    await act(async () => {
      sameRenderSaveButton.props.onPress();
      sameRenderSaveButton.props.onPress();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({accessibilityLabel: '게시된 투표 제목'}).props.value)
      .toBe('보존할 제목');
    expect(renderer.root.findByProps({accessibilityLabel: '투표 공지글'}).props.value)
      .toBe('보존할 공지');

    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('catches synchronous draft validation once, preserves it, and releases for retry', async () => {
    const invalidNotice = '가'.repeat(2_001);
    const onSave = vi.fn().mockResolvedValue(pollDetail({title: '재시도 저장'}));
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishedPollNoticeEditor, {
        onCancel: vi.fn(),
        onSave,
        onSaved: vi.fn(),
        poll: pollDetail(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '투표 공지글'}).props.onChangeText(invalidNotice);
    });

    const sameRenderSaveButton = renderer.root.findByProps({
      accessibilityLabel: '게시된 투표 공지 저장',
    });
    await act(async () => {
      sameRenderSaveButton.props.onPress();
      sameRenderSaveButton.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({accessibilityLabel: '투표 공지글'}).props.value)
      .toBe(invalidNotice);
    expect(JSON.stringify(renderer.toJSON())).toContain('입력한 내용은 유지');

    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '투표 공지글'}).props.onChangeText('유효한 공지');
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({notice: '유효한 공지'}));
  });

  it('keeps a replacement editor scope locked when the stale scope finishes', async () => {
    let resolveStaleSave;
    let resolveCurrentSave;
    const staleSave = new Promise((resolve) => {
      resolveStaleSave = resolve;
    });
    const currentSave = new Promise((resolve) => {
      resolveCurrentSave = resolve;
    });
    const staleOnSaved = vi.fn();
    const currentOnSave = vi.fn(() => currentSave);
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishedPollNoticeEditor, {
        key: '1:701',
        onCancel: vi.fn(),
        onSave: vi.fn(() => staleSave),
        onSaved: staleOnSaved,
        poll: pollDetail(),
      }));
    });
    await act(async () => {
      renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
    });
    await act(async () => {
      renderer.update(React.createElement(PublishedPollNoticeEditor, {
        key: '1:702',
        onCancel: vi.fn(),
        onSave: currentOnSave,
        onSaved: vi.fn(),
        poll: pollDetail({id: 702}),
      }));
    });

    const currentSaveButton = renderer.root.findByProps({
      accessibilityLabel: '게시된 투표 공지 저장',
    });
    await act(async () => {
      currentSaveButton.props.onPress();
      resolveStaleSave(pollDetail({title: '늦은 이전 저장'}));
      await staleSave;
      currentSaveButton.props.onPress();
    });

    expect(staleOnSaved).not.toHaveBeenCalled();
    expect(currentOnSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCurrentSave(pollDetail({id: 702, title: '현재 저장'}));
      await currentSave;
    });
  });

  it('allocates distinct mock assets when two polls are edited in sequence', async () => {
    const firstSave = vi.fn().mockResolvedValue(pollDetail());
    const secondSave = vi.fn().mockResolvedValue(pollDetail({id: 702}));

    for (const [poll, onSave] of [
      [pollDetail(), firstSave],
      [pollDetail({id: 702}), secondSave],
    ]) {
      let renderer;
      await act(async () => {
        renderer = create(React.createElement(PublishedPollNoticeEditor, {
          onCancel: vi.fn(),
          onSave,
          onSaved: vi.fn(),
          poll,
        }));
      });
      await act(async () => {
        renderer.root.findByProps({accessibilityLabel: '투표 공지 이미지 추가'}).props.onPress();
      });
      await act(async () => {
        renderer.root.findByProps({accessibilityLabel: '게시된 투표 공지 저장'}).props.onPress();
        await Promise.resolve();
      });
      await act(async () => renderer.unmount());
    }

    expect(firstSave).toHaveBeenCalledWith(expect.objectContaining({
      imageAssetIds: [90_001, 95_001],
    }));
    expect(secondSave).toHaveBeenCalledWith(expect.objectContaining({
      imageAssetIds: [90_001, 95_002],
    }));
  });
});

function pollDetail(patch = {}) {
  return {
    id: 701,
    campusId: 1,
    title: '기존 제목',
    pollType: 'CUSTOM',
    selectionType: 'SINGLE',
    isAnonymous: false,
    allowUserOptionAdd: true,
    startsAt: '2026-08-03T00:00:00Z',
    endsAt: '2026-08-04T00:00:00Z',
    status: 'OPEN',
    responded: false,
    manageableByMe: true,
    templateId: null,
    chargeGenerationType: 'NONE',
    paymentCategory: null,
    paymentAccountId: null,
    options: [{id: 1, content: 'A', composeMenuCode: null, priceAmount: 0, sortOrder: 1}],
    myResponse: null,
    notice: '기존 공지',
    imageAssetIds: [90_001],
    ...patch,
  };
}
