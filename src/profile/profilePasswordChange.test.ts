import {describe, expect, it} from 'vitest';

import type {ApiError} from '../api/types';
import {
  getProfilePasswordErrorPresentation,
  getProfilePasswordErrorMessage,
  validateProfilePasswordChange,
} from './profilePasswordChange';

describe('profile password change domain', () => {
  it('preserves password bytes and sends only the current and new password', () => {
    expect(validateProfilePasswordChange({
      confirmPassword: ' new password ',
      currentPassword: ' current password ',
      newPassword: ' new password ',
    })).toEqual({
      valid: true,
      payload: {
        currentPassword: ' current password ',
        newPassword: ' new password ',
      },
    });
  });

  it.each([
    [{currentPassword: '', newPassword: 'new-password', confirmPassword: 'new-password'}, {currentPassword: '현재 비밀번호를 입력해 주세요.'}],
    [{currentPassword: 'current', newPassword: '', confirmPassword: ''}, {
      newPassword: '새 비밀번호를 입력해 주세요.',
      confirmPassword: '새 비밀번호 확인을 입력해 주세요.',
    }],
    [{currentPassword: 'current', newPassword: '1234567', confirmPassword: '1234567'}, {newPassword: '새 비밀번호는 8자 이상 입력해 주세요.'}],
    [{currentPassword: 'current', newPassword: 'new-password', confirmPassword: 'different'}, {confirmPassword: '새 비밀번호 확인이 일치하지 않습니다.'}],
    [{currentPassword: 'same-password', newPassword: 'same-password', confirmPassword: 'same-password'}, {newPassword: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.'}],
  ])('rejects invalid form input before dispatch', (input, fieldErrors) => {
    expect(validateProfilePasswordChange(input)).toEqual({valid: false, fieldErrors});
  });

  it('maps the two backend business errors without exposing raw details', () => {
    const mismatch: ApiError = {
      kind: 'error',
      status: 400,
      code: 'AUTH_CURRENT_PASSWORD_MISMATCH',
      message: 'raw current password details',
    };
    const same: ApiError = {
      kind: 'error',
      status: 400,
      code: 'AUTH_PASSWORD_CHANGE_SAME_PASSWORD',
      message: 'raw new password details',
    };

    expect(getProfilePasswordErrorMessage(mismatch))
      .toBe('현재 비밀번호가 일치하지 않습니다.');
    expect(getProfilePasswordErrorMessage(same))
      .toBe('현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
    expect(getProfilePasswordErrorPresentation(mismatch)).toEqual({
      fieldErrors: {
        currentPassword: '현재 비밀번호가 일치하지 않습니다.',
      },
    });
    expect(getProfilePasswordErrorPresentation(same)).toEqual({
      fieldErrors: {
        newPassword: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
      },
    });
  });
});
