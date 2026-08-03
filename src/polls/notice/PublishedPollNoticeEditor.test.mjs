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
