import {describe, expect, it} from 'vitest';

import {FaithLogApiError} from '../api/apiError';
import {getWeeklyMaterialErrorMessage} from './weeklyMaterialErrors';

describe('weekly material error presentation', () => {
  it.each([
    ['WEEKLY_MATERIAL_MANAGE_FORBIDDEN', '이 캠퍼스의 주간 자료를 관리할 권한이 없습니다.'],
    ['WEEKLY_MATERIAL_ACCESS_FORBIDDEN', '이 캠퍼스의 주간 자료를 볼 권한이 없습니다.'],
    ['WEEKLY_MATERIAL_NOT_FOUND', '이미 삭제되었거나 등록되지 않은 자료입니다.'],
    ['WEEKLY_MATERIAL_INVALID_WEEK_START_DATE', '주차는 월요일 날짜로 선택해 주세요.'],
  ])('maps %s without exposing the server message', (code, expected) => {
    const error = new FaithLogApiError({
      code,
      kind: 'error',
      message: 'private backend detail',
    });

    expect(getWeeklyMaterialErrorMessage(error, 'delete')).toBe(expected);
  });

  it('uses a retryable operation message for an unknown failure', () => {
    expect(getWeeklyMaterialErrorMessage(new Error('signed URL'), 'upload')).toBe(
      '업로드하지 못했습니다. 다시 시도해 주세요.',
    );
  });
});
