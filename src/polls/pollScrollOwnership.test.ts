import {describe, expect, it} from 'vitest';

import {
  getPollDetailScrollOwner,
  getPollEarlyStateScrollContract,
  type PollEarlyState,
} from './pollScrollOwnership';

describe('Poll detail scroll ownership', () => {
  it.each([
    ['response', 'scrollView'],
    ['comments', 'flatList'],
    ['results', 'sectionList'],
  ] as const)('mounts one %s tab vertical owner: %s', (tab, owner) => {
    expect(getPollDetailScrollOwner(tab)).toBe(owner);
  });
});

describe('Poll early-state scroll ownership', () => {
  it.each([
    'detailError',
    'detailLoading',
    'listError',
    'listLoading',
  ] as const)('uses one Poll-owned ScrollView for %s', (state) => {
    expect(getPollEarlyStateScrollContract(state, 'ios', 144)).toMatchObject({
      contentBottomPadding: 96,
      contentGap: 20,
      contentTopPadding: 2,
      keyboardDismissMode: 'interactive',
      keyboardShouldPersistTaps: 'handled',
      owner: 'scrollView',
    });
  });

  it.each([
    'detailError',
    'detailLoading',
    'listError',
    'listLoading',
  ] satisfies PollEarlyState[])('applies the Android shell bottom padding for %s', (state) => {
    expect(getPollEarlyStateScrollContract(state, 'android', 144)).toMatchObject({
      contentBottomPadding: 144,
      keyboardDismissMode: 'on-drag',
      owner: 'scrollView',
    });
  });
});
