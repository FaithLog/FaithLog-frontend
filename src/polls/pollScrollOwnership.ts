export type PollDetailTab = 'response' | 'comments' | 'results';
export type PollDetailScrollOwner = 'scrollView' | 'flatList' | 'sectionList';
export type PollEarlyState = 'detailError' | 'detailLoading' | 'listError' | 'listLoading';

export function getPollDetailScrollOwner(tab: PollDetailTab): PollDetailScrollOwner {
  switch (tab) {
    case 'response':
      return 'scrollView';
    case 'comments':
      return 'flatList';
    case 'results':
      return 'sectionList';
  }
}

export function getPollEarlyStateScrollContract(
  state: PollEarlyState,
  platform: 'android' | 'ios' | 'other',
  androidContentBottomPadding: number,
) {
  assertEarlyState(state);
  return {
    contentBottomPadding: platform === 'android' ? androidContentBottomPadding : 96,
    contentGap: 20,
    contentTopPadding: 2,
    keyboardDismissMode: platform === 'ios' ? 'interactive' as const : 'on-drag' as const,
    keyboardShouldPersistTaps: 'handled' as const,
    owner: 'scrollView' as const,
  };
}

function assertEarlyState(state: PollEarlyState) {
  switch (state) {
    case 'detailError':
    case 'detailLoading':
    case 'listError':
    case 'listLoading':
      return;
  }
}
