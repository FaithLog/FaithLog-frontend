import type {ApiError, ChangeMyPasswordRequest} from '../api/types';

export type ProfilePasswordChangeInput = ChangeMyPasswordRequest & {
  confirmPassword: string;
};

export type ProfilePasswordChangeValidation =
  | {valid: true; payload: ChangeMyPasswordRequest}
  | {valid: false; error: string};

export function validateProfilePasswordChange(
  input: ProfilePasswordChangeInput,
): ProfilePasswordChangeValidation {
  if (!input.currentPassword) {
    return {valid: false, error: '현재 비밀번호를 입력해 주세요.'};
  }
  if (!input.newPassword) {
    return {valid: false, error: '새 비밀번호를 입력해 주세요.'};
  }
  if (input.newPassword !== input.confirmPassword) {
    return {valid: false, error: '새 비밀번호 확인이 일치하지 않습니다.'};
  }
  if (input.currentPassword === input.newPassword) {
    return {valid: false, error: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.'};
  }
  if (input.newPassword.length < 8) {
    return {valid: false, error: '새 비밀번호는 8자 이상 입력해 주세요.'};
  }

  return {
    valid: true,
    payload: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
  };
}

export function getProfilePasswordErrorMessage(error: ApiError) {
  if (error.status === 400 && error.code === 'AUTH_CURRENT_PASSWORD_MISMATCH') {
    return '현재 비밀번호가 일치하지 않습니다.';
  }
  if (error.status === 400 && error.code === 'AUTH_PASSWORD_CHANGE_SAME_PASSWORD') {
    return '현재 비밀번호와 다른 비밀번호를 입력해 주세요.';
  }
  if (error.status === 400 && error.code === 'GLOBAL_VALIDATION_FAILED') {
    return '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.';
  }
  if (error.kind === 'offline') {
    return '네트워크 상태를 확인하고 다시 시도해 주세요.';
  }
  return '비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
