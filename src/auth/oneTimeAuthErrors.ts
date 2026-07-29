import {FaithLogApiError} from '../api/apiError';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  API_CONTRACT_PENDING: '인증 기능의 서버 연결을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.',
  AUTH_EMAIL_INVALID: '올바른 이메일 형식으로 입력해 주세요.',
  AUTH_CODE_INVALID: '인증번호가 올바르지 않습니다.',
  AUTH_CODE_EXPIRED: '인증번호가 만료되었습니다. 새 인증번호를 요청해 주세요.',
  AUTH_CODE_MAX_ATTEMPTS: '인증번호 확인 횟수를 초과했습니다. 새 인증번호를 요청해 주세요.',
  AUTH_RESEND_LIMIT_EXCEEDED: '인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.',
  AUTH_EMAIL_DUPLICATE: '이미 가입된 이메일입니다.',
  EMAIL_VERIFICATION_TOKEN_INVALID: '이메일 인증이 필요합니다. 다시 인증해 주세요.',
  EMAIL_VERIFICATION_TOKEN_EXPIRED: '이메일 인증이 만료되었습니다. 다시 인증해 주세요.',
  EMAIL_VERIFICATION_TOKEN_REUSED: '이미 사용된 이메일 인증입니다. 다시 인증해 주세요.',
  PASSWORD_RESET_TOKEN_INVALID: '비밀번호 재설정 인증이 필요합니다. 다시 시작해 주세요.',
  PASSWORD_RESET_TOKEN_EXPIRED: '비밀번호 재설정 인증이 만료되었습니다. 다시 시작해 주세요.',
  PASSWORD_RESET_TOKEN_REUSED: '이미 사용된 비밀번호 재설정 인증입니다. 다시 시작해 주세요.',
  AUTH_PASSWORD_POLICY_VIOLATION: '비밀번호는 8자 이상 128자 이하로 입력해 주세요.',
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
