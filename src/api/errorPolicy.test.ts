import {describe, expect, it} from 'vitest';

import {getApiErrorPresentation} from './errorPolicy';
import type {ApiError} from './types';

describe('API error presentation policy', () => {
  const validationError: ApiError = {
    kind: 'error',
    status: 422,
    code: 'INVALID_POLL_OPTION',
    message: '선택지 형식이 올바르지 않습니다. (INVALID_POLL_OPTION)',
  };

  it('keeps validation messages hidden by default', () => {
    expect(getApiErrorPresentation(validationError).message).toBe(
      '입력한 값 중 처리할 수 없는 항목이 있습니다. 내용을 확인한 뒤 다시 시도해 주세요.',
    );
  });

  it('shows opted-in validation messages for focused admin actions', () => {
    expect(
      getApiErrorPresentation(validationError, {exposeValidationMessage: true}).message,
    ).toBe('선택지 형식이 올바르지 않습니다. (INVALID_POLL_OPTION)');
  });

  it('explains that active duties must be released before membership lifecycle changes', () => {
    expect(getApiErrorPresentation({
      kind: 'conflict',
      status: 409,
      code: 'CAMPUS_MEMBER_ACTIVE_DUTY_CONFLICT',
      message: 'raw backend message',
    })).toMatchObject({
      title: '담당 해제가 필요합니다',
      message: '커피 또는 밥 담당 해제를 먼저 완료한 뒤 다시 시도해 주세요.',
    });
  });
});
