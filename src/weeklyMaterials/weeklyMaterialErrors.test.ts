import {describe, expect, it} from 'vitest';

import {FaithLogApiError} from '../api/apiError';
import {getWeeklyMaterialErrorMessage} from './weeklyMaterialErrors';

describe('weekly material error presentation', () => {
  it.each([
    ['WEEKLY_MATERIAL_MANAGE_FORBIDDEN', '캠퍼스 관리자'],
    ['WEEKLY_MATERIAL_ACCESS_FORBIDDEN', '캠퍼스 관리자'],
    ['WEEKLY_MATERIAL_NOT_FOUND', '다시 불러와'],
    ['WEEKLY_MATERIAL_INVALID_WEEK_START_DATE', '월요일'],
  ])('maps %s without exposing the server message', (code, expected) => {
    const error = new FaithLogApiError({
      code,
      kind: 'error',
      message: 'private backend detail',
    });

    const message = getWeeklyMaterialErrorMessage(error, 'delete');
    expect(message).toContain(expected);
    expect(message).not.toContain('private backend detail');
  });

  it('uses a retryable operation message for an unknown failure', () => {
    expect(getWeeklyMaterialErrorMessage(new Error('signed URL'), 'upload')).toBe(
      '업로드하지 못했습니다. 다시 시도해 주세요.',
    );
  });
});
