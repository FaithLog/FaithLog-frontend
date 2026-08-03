import type {ApiError, ChangeMyPasswordRequest} from '../api/types';

export type ProfilePasswordChangeInput = ChangeMyPasswordRequest & {
  confirmPassword: string;
};

export type ProfilePasswordField = keyof ProfilePasswordChangeInput;
export type ProfilePasswordFieldErrors = Partial<
  Record<ProfilePasswordField, string>
>;

export type ProfilePasswordChangeValidation =
  | {valid: true; payload: ChangeMyPasswordRequest}
  | {valid: false; fieldErrors: ProfilePasswordFieldErrors};

export function validateProfilePasswordChange(
  input: ProfilePasswordChangeInput,
): ProfilePasswordChangeValidation {
  const fieldErrors: ProfilePasswordFieldErrors = {};

  if (!input.currentPassword) {
    fieldErrors.currentPassword = '현재 비밀번호를 입력해 주세요.';
  }
  if (!input.newPassword) {
    fieldErrors.newPassword = '새 비밀번호를 입력해 주세요.';
  } else if (input.newPassword.length < 8) {
    fieldErrors.newPassword = '새 비밀번호는 8자 이상 입력해 주세요.';
  } else if (input.currentPassword && input.currentPassword === input.newPassword) {
    fieldErrors.newPassword = '현재 비밀번호와 다른 비밀번호를 입력해 주세요.';
  }
  if (!input.confirmPassword) {
    fieldErrors.confirmPassword = '새 비밀번호 확인을 입력해 주세요.';
  } else if (input.newPassword !== input.confirmPassword) {
    fieldErrors.confirmPassword = '새 비밀번호 확인이 일치하지 않습니다.';
  }

  if (Object.keys(fieldErrors).length > 0) return {valid: false, fieldErrors};

  return {
    valid: true,
    payload: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
  };
}

export type ProfilePasswordErrorPresentation =
  | {fieldErrors: ProfilePasswordFieldErrors}
  | {formError: string};

export function getProfilePasswordErrorPresentation(
  error: ApiError,
): ProfilePasswordErrorPresentation {
  if (error.status === 400 && error.code === 'AUTH_CURRENT_PASSWORD_MISMATCH') {
    return {
      fieldErrors: {
        currentPassword: '현재 비밀번호가 일치하지 않습니다.',
      },
    };
  }
  if (error.status === 400 && error.code === 'AUTH_PASSWORD_CHANGE_SAME_PASSWORD') {
    return {
      fieldErrors: {
        newPassword: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
      },
    };
  }
  return {formError: getProfilePasswordErrorMessage(error)};
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
