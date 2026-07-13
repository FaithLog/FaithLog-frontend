export type PollDetailTab = 'response' | 'comments' | 'results';
export type PollDetailScrollOwner = 'scrollView' | 'flatList' | 'sectionList';

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
