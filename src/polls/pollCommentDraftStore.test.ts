import {describe, expect, it} from 'vitest';

import {PollCommentDraftStore} from './pollCommentDraftStore';

describe('Poll comment draft lifecycle', () => {
  it('restores a new-comment draft after a tab subtree remount', () => {
    const store = new PollCommentDraftStore();
    store.update(7, '탭을 왕복해도 유지');
    expect(store.get(7)).toEqual({content: '탭을 왕복해도 유지', editingCommentId: null});
  });

  it('restores an edited draft instead of the original comment', () => {
    const store = new PollCommentDraftStore();
    store.beginEdit(7, 31, '원문');
    store.update(7, '수정 중인 내용');
    expect(store.get(7)).toEqual({content: '수정 중인 내용', editingCommentId: 31});
  });

  it('retains a failed submission for retry', () => {
    const store = new PollCommentDraftStore();
    store.update(7, '재시도할 내용');
    store.settle(7, 'failure');
    expect(store.get(7).content).toBe('재시도할 내용');
  });

  it.each([
    ['success', (store: PollCommentDraftStore) => store.settle(7, 'success')],
    ['cancel', (store: PollCommentDraftStore) => store.cancel(7)],
    ['open', (store: PollCommentDraftStore) => store.open(7)],
    ['close', (store: PollCommentDraftStore) => store.close(7)],
  ] as const)('clears explicitly on %s', (_label, clear) => {
    const store = new PollCommentDraftStore();
    store.update(7, '지워질 내용');
    clear(store);
    expect(store.get(7)).toEqual({content: '', editingCommentId: null});
  });

  it('keeps drafts isolated by poll', () => {
    const store = new PollCommentDraftStore();
    store.update(7, 'A');
    store.update(8, 'B');
    store.clear(7);
    expect(store.get(7).content).toBe('');
    expect(store.get(8).content).toBe('B');
  });
});
