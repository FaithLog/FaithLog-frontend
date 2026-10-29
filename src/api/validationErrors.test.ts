import {describe, expect, it} from 'vitest';
import {parseValidationFieldErrors} from './validationErrors';

describe('validation error boundary', () => {
  it('translates multiple fields and constraints without displaying server text or rejected values', () => {
    expect(parseValidationFieldErrors(400, 'GLOBAL_VALIDATION_FAILED', {fieldErrors: [
      {field: 'accountNumber', code: 'NotBlank', rejectedValue: 'secret'},
      {field: 'email', code: 'Email', message: 'private'},
      {field: 'amount', code: 'Positive'},
    ]}, '')).toEqual({accountNumber: '계좌번호를 입력해 주세요.', email: '이메일 형식을 확인해 주세요.', amount: '금액은 0보다 큰 값으로 입력해 주세요.'});
  });
  it('supports legacy field messages without displaying arbitrary text', () => {
    expect(parseValidationFieldErrors(400, 'GLOBAL_VALIDATION_FAILED', null, 'accountNumber: 공백일 수 없습니다'))
      .toEqual({accountNumber: '계좌번호를 입력해 주세요.'});
    expect(parseValidationFieldErrors(500, 'GLOBAL_VALIDATION_FAILED', null, 'email: secret')).toEqual({});
    expect(parseValidationFieldErrors(400, 'UNKNOWN', {fieldErrors: [{field: 'email', code: 'Email'}]}, '')).toEqual({});
  });
  it('ignores unknown fields, malformed entries and prototype keys', () => {
    expect(parseValidationFieldErrors(400, 'GLOBAL_VALIDATION_FAILED', {fieldErrors: [
      null, {field: '__proto__', code: 'NotBlank'}, {field: 'constructor', code: 'Email'},
      {field: 'databasePassword', code: 'NotBlank'}, {field: 'email', code: 5},
    ]}, 'internal stack trace')).toEqual({});
  });
});
