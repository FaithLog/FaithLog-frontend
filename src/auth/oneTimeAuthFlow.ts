import type {
  AuthCodeConfirmationResponse,
  AuthCodeRequestResponse,
  PasswordResetConfirmationResponse,
  SignupRequest,
} from '../api/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type CodeTimingState = {
  expiresAt: number | null;
  resendAvailableAt: number | null;
};

type SharedCodeState = CodeTimingState & {
  email: string;
  code: string;
  requested: boolean;
  emailError: string | null;
  requestError: string | null;
  codeError: string | null;
  canRequestCode: boolean;
};

export type SignupVerificationState = SharedCodeState & {
  verified: boolean;
  emailVerificationToken: string | null;
  tokenExpiresAt: number | null;
};

export type PasswordResetState = SharedCodeState & {
  step: 'email' | 'code' | 'newPassword';
  passwordResetToken: string | null;
  tokenExpiresAt: number | null;
  newPassword: string;
  passwordConfirm: string;
};

export type SingleFlightGate = {current: boolean};

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getEmailError(email: string): string | null {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) return '이메일을 입력해 주세요.';
  if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalized)) {
    return '올바른 이메일 형식으로 입력해 주세요.';
  }
  return null;
}

export function sanitizeVerificationCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function createSignupVerificationState(): SignupVerificationState {
  return {
    email: '',
    code: '',
    requested: false,
    verified: false,
    emailVerificationToken: null,
    tokenExpiresAt: null,
    expiresAt: null,
    resendAvailableAt: null,
    emailError: null,
    requestError: null,
    codeError: null,
    canRequestCode: false,
  };
}

export function changeSignupEmail(
  _state: SignupVerificationState,
  email: string,
): SignupVerificationState {
  const emailError = getEmailError(email);
  return {
    ...createSignupVerificationState(),
    email,
    emailError,
    canRequestCode: emailError === null,
  };
}

export function applySignupCodeRequested(
  state: SignupVerificationState,
  response: AuthCodeRequestResponse,
  now = Date.now(),
): SignupVerificationState {
  return {
    ...state,
    code: '',
    requested: true,
    verified: false,
    emailVerificationToken: null,
    tokenExpiresAt: null,
    expiresAt: toDeadline(now, response.expiresInSeconds),
    resendAvailableAt: toDeadline(now, response.resendAvailableInSeconds),
    requestError: null,
    codeError: null,
  };
}

export function applySignupCodeConfirmed(
  state: SignupVerificationState,
  response: AuthCodeConfirmationResponse,
  now = Date.now(),
): SignupVerificationState {
  return {
    ...state,
    verified: true,
    emailVerificationToken: response.emailVerificationToken,
    tokenExpiresAt: toDeadline(now, response.expiresInSeconds),
    codeError: null,
    requestError: null,
  };
}

export function buildVerifiedSignupPayload(
  state: SignupVerificationState,
  values: {name: string; password: string; passwordConfirm: string},
): SignupRequest {
  if (!state.verified || !state.emailVerificationToken) {
    throw new Error('EMAIL_VERIFICATION_REQUIRED');
  }
  return {
    email: normalizeAuthEmail(state.email),
    name: values.name.trim(),
    password: values.password,
    emailVerificationToken: state.emailVerificationToken,
  };
}

export function createPasswordResetState(): PasswordResetState {
  return {
    email: '',
    code: '',
    requested: false,
    step: 'email',
    passwordResetToken: null,
    tokenExpiresAt: null,
    expiresAt: null,
    resendAvailableAt: null,
    emailError: null,
    requestError: null,
    codeError: null,
    canRequestCode: false,
    newPassword: '',
    passwordConfirm: '',
  };
}

export function changePasswordResetEmail(
  _state: PasswordResetState,
  email: string,
): PasswordResetState {
  const emailError = getEmailError(email);
  return {
    ...createPasswordResetState(),
    email,
    emailError,
    canRequestCode: emailError === null,
  };
}

export function applyPasswordResetCodeRequested(
  state: PasswordResetState,
  response: AuthCodeRequestResponse,
  now = Date.now(),
): PasswordResetState {
  return {
    ...state,
    code: '',
    requested: true,
    step: 'code',
    passwordResetToken: null,
    tokenExpiresAt: null,
    expiresAt: toDeadline(now, response.expiresInSeconds),
    resendAvailableAt: toDeadline(now, response.resendAvailableInSeconds),
    requestError: null,
    codeError: null,
    newPassword: '',
    passwordConfirm: '',
  };
}

export function applyPasswordResetCodeConfirmed(
  state: PasswordResetState,
  response: PasswordResetConfirmationResponse,
  now = Date.now(),
): PasswordResetState {
  return {
    ...state,
    step: 'newPassword',
    passwordResetToken: response.passwordResetToken,
    tokenExpiresAt: toDeadline(now, response.expiresInSeconds),
    codeError: null,
    requestError: null,
  };
}

export function getPasswordResetStep(
  state: PasswordResetState,
  now = Date.now(),
): PasswordResetState['step'] {
  if (
    state.step === 'newPassword' &&
    state.passwordResetToken &&
    state.tokenExpiresAt !== null &&
    state.tokenExpiresAt > now
  ) {
    return 'newPassword';
  }
  return state.step === 'code' ? 'code' : 'email';
}

export function clearPasswordResetFlow(_state?: PasswordResetState) {
  return createPasswordResetState();
}

export function validateNewPassword(password: string, passwordConfirm: string) {
  if (!password) {
    return {valid: false as const, passwordError: '새 비밀번호를 입력해 주세요.'};
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {valid: false as const, passwordError: '비밀번호는 8자 이상 입력해 주세요.'};
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {valid: false as const, passwordError: '비밀번호가 너무 깁니다.'};
  }
  if (!passwordConfirm) {
    return {valid: false as const, passwordConfirmError: '비밀번호 확인을 입력해 주세요.'};
  }
  if (password !== passwordConfirm) {
    return {valid: false as const, passwordConfirmError: '비밀번호가 서로 일치하지 않습니다.'};
  }
  return {valid: true as const};
}

export function getAuthCodeTiming(
  state: CodeTimingState,
  now = Date.now(),
) {
  const expiresInSeconds = remainingSeconds(state.expiresAt, now);
  return {
    expired: state.expiresAt !== null && expiresInSeconds === 0,
    expiresInSeconds,
    resendInSeconds: remainingSeconds(state.resendAvailableAt, now),
  };
}

export function maskAuthEmail(email: string) {
  const normalized = normalizeAuthEmail(email);
  const separator = normalized.indexOf('@');
  if (separator <= 0) return '***';
  const local = normalized.slice(0, separator);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}${normalized.slice(separator)}`;
}

export function runSingleFlight<T>(
  gate: SingleFlightGate,
  operation: () => Promise<T>,
): Promise<T> | null {
  if (gate.current) return null;
  gate.current = true;
  return operation().finally(() => {
    gate.current = false;
  });
}

function toDeadline(now: number, seconds: number) {
  return now + Math.max(0, seconds) * 1_000;
}

function remainingSeconds(deadline: number | null, now: number) {
  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}
