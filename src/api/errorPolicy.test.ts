import {describe, expect, it} from 'vitest';

import {getApiErrorPresentation, getKnownApiErrorMessage, getSafeApiErrorMessage} from './errorPolicy';
import {FaithLogApiError} from './apiError';
import type {ApiError} from './types';

describe('API error presentation policy', () => {
  it('offers safe known-code guidance for custom screen catches while preserving unknown fallbacks', () => {
    expect(getKnownApiErrorMessage(new FaithLogApiError({kind: 'permissionDenied', status: 403, code: 'SHEPHERD_GROUP_MANAGE_FORBIDDEN', message: 'private SQL'})))
      .toContain('캠퍼스 관리자');
    expect(getKnownApiErrorMessage(new FaithLogApiError({kind: 'error', message: 'private SQL'}))).toBeUndefined();
    expect(getKnownApiErrorMessage(new Error('private SQL'))).toBeUndefined();
  });
  it('explains missing payment accounts and who must fix them before retrying', () => {
    const error: ApiError = {kind: 'error', status: 400, code: 'BILLING_REQUIRED_PAYMENT_ACCOUNT_MISSING', message: '관리자에게 문의하세요'};
    const presentation = getApiErrorPresentation(error, {exposeValidationMessage: true});
    expect(presentation.title).toBe('납부 계좌가 등록되지 않았습니다');
    expect(presentation.message).toContain('캠퍼스 관리자');
    expect(presentation.message).toContain('활성 납부 계좌');
    expect(presentation.message).toContain('다시');
    expect(presentation.retryable).toBe(false);
    expect(getSafeApiErrorMessage(error)).toBe(presentation.message);
  });

  it.each([
    ['POLL_CLOSED', 409, 'conflict', '마감'],
    ['PRAYER_GROUP_ASSIGNMENT_REQUIRED', 403, 'permissionDenied', '기도조'],
    ['DEVOTION_INVALID_SATURDAY_LATE_MINUTES', 400, 'error', '1,440'],
    ['DEVOTION_PENALTY_RULE_NOT_FOUND', 404, 'error', '관리자'],
    ['MEAL_PAYMENT_ACCOUNT_NOT_FOUND', 404, 'error', '밥 담당자'],
    ['POLL_COFFEE_DUTY_MISSING', 400, 'error', '커피 담당자'],
  ] as const)('keeps %s guidance even when a screen provides generic copy', (code, status, kind, expected) => {
    expect(getApiErrorPresentation({kind, code, status, message: 'internal SQL secret'}, {
      conflictMessage: 'generic conflict', permissionMessage: 'generic permission',
      defaultMessage: 'generic error', exposeValidationMessage: true,
    }).message).toContain(expected);
    expect(getApiErrorPresentation({kind, code, status, message: 'internal SQL secret'}).message).not.toContain('secret');
  });

  it.each(['sessionExpired', 'offline'] as const)('preserves %s over a domain code', (kind) => {
    const error: ApiError = {kind, code: 'BILLING_REQUIRED_PAYMENT_ACCOUNT_MISSING', message: ''};
    expect(getApiErrorPresentation(error)).toEqual(getApiErrorPresentation({kind, message: ''}));
  });

  it.each(['UNKNOWN_ERROR', '__proto__', 'constructor'])('keeps unknown code %s safe', (code) => {
    expect(getApiErrorPresentation({kind: 'error', status: 400, code, message: 'private SQL'}).message)
      .toBe('입력한 값 중 처리할 수 없는 항목이 있습니다. 내용을 확인한 뒤 다시 시도해 주세요.');
  });

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
