import type {LoginRequest, SignupRequest} from '../api/types';

export type LoginFormValues = LoginRequest;

export type SignupFormValues = SignupRequest & {
  passwordConfirm: string;
};

export type AuthFieldErrors<T extends string> = Partial<Record<T, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 128;

export function validateLoginForm(values: LoginFormValues) {
  const fieldErrors: AuthFieldErrors<keyof LoginFormValues> = {};
  const email = values.email.trim().toLowerCase();
  const password = values.password;

  if (!email) {
    fieldErrors.email = '이메일을 입력해 주세요.';
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = '올바른 이메일 형식으로 입력해 주세요.';
  }

  if (!password) {
    fieldErrors.password = '비밀번호를 입력해 주세요.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password = '비밀번호가 너무 깁니다.';
  }

  return {
    fieldErrors,
    payload: {email, password},
    valid: Object.keys(fieldErrors).length === 0,
  };
}

export function validateSignupForm(values: SignupFormValues) {
  const fieldErrors: AuthFieldErrors<keyof SignupFormValues> = {};
  const name = values.name.trim();
  const email = values.email.trim().toLowerCase();
  const password = values.password;

  if (!name) {
    fieldErrors.name = '이름을 입력해 주세요.';
  } else if (name.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `이름은 ${MAX_NAME_LENGTH}자 이하로 입력해 주세요.`;
  }

  if (!email) {
    fieldErrors.email = '이메일을 입력해 주세요.';
  } else if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = '올바른 이메일 형식으로 입력해 주세요.';
  }

  if (!password) {
    fieldErrors.password = '비밀번호를 입력해 주세요.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password = '비밀번호가 너무 깁니다.';
  }

  if (!values.passwordConfirm) {
    fieldErrors.passwordConfirm = '비밀번호 확인을 입력해 주세요.';
  } else if (password !== values.passwordConfirm) {
    fieldErrors.passwordConfirm = '비밀번호가 서로 일치하지 않습니다.';
  }

  return {
    fieldErrors,
    payload: {name, email, password},
    valid: Object.keys(fieldErrors).length === 0,
  };
}
