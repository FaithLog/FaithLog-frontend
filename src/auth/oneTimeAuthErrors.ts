import {FaithLogApiError} from '../api/apiError';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AUTH_EMAIL_ALREADY_EXISTS: '이미 가입된 이메일입니다.',
  AUTH_EMAIL_VERIFICATION_REQUIRED: '이메일 인증을 먼저 완료해 주세요.',
  AUTH_EMAIL_VERIFICATION_TOKEN_INVALID:
    '이메일 인증이 만료되었거나 유효하지 않습니다. 다시 인증해 주세요.',
  AUTH_EMAIL_VERIFICATION_CODE_INVALID: '인증번호가 올바르지 않습니다.',
  AUTH_EMAIL_VERIFICATION_CODE_EXPIRED:
    '인증번호가 만료되었습니다. 새 인증번호를 요청해 주세요.',
  AUTH_EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED:
    '인증번호 확인 횟수를 초과했습니다. 새 인증번호를 요청해 주세요.',
  AUTH_EMAIL_VERIFICATION_RESEND_THROTTLED: '잠시 후 인증번호를 다시 요청해 주세요.',
  AUTH_EMAIL_VERIFICATION_RATE_LIMITED:
    '인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.',
  AUTH_EMAIL_DELIVERY_UNAVAILABLE:
    '인증 이메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  AUTH_EMAIL_VERIFICATION_UNAVAILABLE:
    '이메일 인증을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  AUTH_PASSWORD_RESET_TOKEN_INVALID:
    '비밀번호 재설정 인증이 만료되었거나 유효하지 않습니다. 다시 시작해 주세요.',
  AUTH_PASSWORD_RESET_SAME_PASSWORD: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
};

export function getOneTimeAuthErrorMessage(error: unknown): string {
  if (!(error instanceof FaithLogApiError)) {
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (error.detail.code && AUTH_ERROR_MESSAGES[error.detail.code]) {
    return AUTH_ERROR_MESSAGES[error.detail.code]!;
  }
  if (error.detail.kind === 'offline') {
    return '네트워크 상태를 확인하고 다시 시도해 주세요.';
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function getLoginAuthErrorMessage(error: unknown): string {
  if (!(error instanceof FaithLogApiError)) {
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (error.detail.code === 'LOGOUT_CLEANUP_PENDING') {
    return '이전 로그아웃 정리가 지연되고 있습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.';
  }
  if (error.detail.kind === 'sessionExpired') {
    return '이메일 또는 비밀번호를 다시 확인해 주세요.';
  }
  if (error.detail.kind === 'offline') {
    return '네트워크 상태를 확인하고 다시 시도해 주세요.';
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function isTerminalSignupVerificationError(error: unknown) {
  return error instanceof FaithLogApiError && (
    error.detail.code === 'AUTH_EMAIL_VERIFICATION_REQUIRED' ||
    error.detail.code === 'AUTH_EMAIL_VERIFICATION_TOKEN_INVALID'
  );
}

export function isTerminalPasswordResetError(error: unknown) {
  return error instanceof FaithLogApiError &&
    error.detail.code === 'AUTH_PASSWORD_RESET_TOKEN_INVALID';
}
