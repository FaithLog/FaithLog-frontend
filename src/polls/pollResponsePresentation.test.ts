import {describe, expect, it} from 'vitest';

import {
  createPollOptionAddRequest,
  getPollOptionAddLabel,
} from './pollResponsePresentation';

type PollVisibility = {
  allowUserOptionAdd?: boolean | undefined;
  pollType: string;
  status: string;
};

function pollDetail(overrides: Partial<PollVisibility> = {}): PollVisibility {
  return {
    allowUserOptionAdd: true,
    pollType: 'MEAL',
    status: 'OPEN',
    ...overrides,
  };
}

describe('poll response presentation', () => {
  it('shows the shared add-option action for an enabled meal poll', () => {
    expect(getPollOptionAddLabel(pollDetail())).toBe('항목 추가');
  });

  it('uses the coffee label and respects explicit disabled settings', () => {
    expect(getPollOptionAddLabel(pollDetail({pollType: 'COFFEE'}))).toBe('커피 메뉴 추가');
    expect(getPollOptionAddLabel(pollDetail({allowUserOptionAdd: false}))).toBeNull();
    expect(
      getPollOptionAddLabel(pollDetail({pollType: 'COFFEE', allowUserOptionAdd: false})),
    ).toBeNull();
  });

  it('hides every poll type when the runtime payload omits the flag', () => {
    expect(getPollOptionAddLabel(pollDetail({allowUserOptionAdd: undefined}))).toBeNull();
    expect(
      getPollOptionAddLabel(
        pollDetail({pollType: 'COFFEE', allowUserOptionAdd: undefined}),
      ),
    ).toBeNull();
    expect(
      getPollOptionAddLabel(
        pollDetail({pollType: 'CUSTOM', allowUserOptionAdd: undefined}),
      ),
    ).toBeNull();
  });

  it('hides the action when the poll is closed even if option add is enabled', () => {
    expect(getPollOptionAddLabel(pollDetail({status: 'CLOSED'}))).toBeNull();
  });

  it('builds exact content-only requests for custom and meal polls', () => {
    expect(createPollOptionAddRequest('CUSTOM', {content: ' 새 항목 '})).toEqual({
      content: '새 항목',
    });
    expect(createPollOptionAddRequest('MEAL', {content: ' 제육볶음 '})).toEqual({
      content: '제육볶음',
    });
  });

  it('builds an exact menu-only request for coffee polls', () => {
    expect(createPollOptionAddRequest('COFFEE', {content: '라떼', menuId: 123})).toEqual({
      menuId: 123,
    });
  });
});
