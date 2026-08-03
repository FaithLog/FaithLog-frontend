import {describe, expect, it} from 'vitest';

import {
  POLL_NOTICE_MAX_LENGTH,
  buildPollNoticeMutationFields,
  getPollNoticeValidationMessage,
  normalizePollNotice,
  shouldShowPollNoticeBadge,
} from './pollNoticeContract';

describe('poll notice provisional contract', () => {
  it('normalizes blank notice to null and trims meaningful text', () => {
    expect(normalizePollNotice('  ')).toBeNull();
    expect(normalizePollNotice('  모임 장소가 변경되었습니다.  ')).toBe(
      '모임 장소가 변경되었습니다.',
    );
  });

  it('keeps length validation behind one replaceable constant', () => {
    expect(getPollNoticeValidationMessage('가'.repeat(POLL_NOTICE_MAX_LENGTH))).toBeNull();
    expect(getPollNoticeValidationMessage('가'.repeat(POLL_NOTICE_MAX_LENGTH + 1))).toBe(
      `공지글은 ${POLL_NOTICE_MAX_LENGTH}자 이하로 입력해 주세요.`,
    );
  });

  it('preserves image order and removes duplicate asset ids from save payload', () => {
    expect(
      buildPollNoticeMutationFields({
        notice: '  확인해 주세요  ',
        imageAssetIds: [4, 2, 4, 3, 2],
      }),
    ).toEqual({notice: '확인해 주세요', imageAssetIds: [4, 2, 3]});
  });

  it('rejects invalid asset ids instead of silently changing the payload', () => {
    expect(() =>
      buildPollNoticeMutationFields({notice: '', imageAssetIds: [1, 0]}),
    ).toThrow('Invalid image asset id');
  });

  it('uses only the summary capability to show the list badge', () => {
    expect(shouldShowPollNoticeBadge({hasNotice: true})).toBe(true);
    expect(shouldShowPollNoticeBadge({hasNotice: false})).toBe(false);
    expect(shouldShowPollNoticeBadge({})).toBe(false);
  });
});
