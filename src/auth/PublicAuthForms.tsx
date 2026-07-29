import {useEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  completePasswordReset,
  confirmPasswordResetCode,
  confirmSignupEmailCode,
  FaithLogApiError,
  requestPasswordResetCode,
  requestSignupEmailCode,
} from '../api/client';
import {trackLoginComplete, trackSignUpComplete} from '../analytics/appAnalytics';
import {runWithCompletionEvent} from '../analytics/trackedApiSuccess';
import {colors} from '../theme';
import type {AuthGateState} from './authGate';
import {validateLoginForm, validateSignupForm, type AuthFieldErrors} from './authForms';
import {getLoginAuthErrorMessage, getOneTimeAuthErrorMessage} from './oneTimeAuthErrors';
import {
  applyPasswordResetCodeConfirmed,
  applyPasswordResetCodeRequested,
  applySignupCodeConfirmed,
  applySignupCodeRequested,
  buildVerifiedSignupPayload,
  changePasswordResetEmail,
  changeSignupEmail,
  clearPasswordResetFlow,
  createPasswordResetState,
  createSignupVerificationState,
  getAuthCodeTiming,
  getPasswordResetStep,
  maskAuthEmail,
  normalizeAuthEmail,
  runSingleFlight,
  sanitizeVerificationCode,
  validateNewPassword,
  type PasswordResetState,
} from './oneTimeAuthFlow';
import {loginAndEstablishSession, signupAfterSessionCleanup} from './session';

type LoginValues = {email: string; password: string};
type SignupDetails = {name: string; password: string; passwordConfirm: string};
type BusyOperation = 'request' | 'confirm' | 'complete' | 'submit' | null;

export function LoginForm({
  clearNotice,
  onLoginComplete,
  switchToSignup,
}: {
  clearNotice: () => void;
  onLoginComplete: (state: Extract<AuthGateState, {status: 'authenticated' | 'noCampus'}>) => void;
  switchToSignup: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [values, setValues] = useState<LoginValues>({email: '', password: ''});
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<keyof LoginValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyOperation>(null);
  const loginGate = useRef(false);
  const [reset, setReset] = useState(createPasswordResetState);
  const resetRef = useRef(reset);

  resetRef.current = reset;
  useEffect(() => () => {
    resetRef.current = clearPasswordResetFlow(resetRef.current);
  }, []);

  const exitReset = () => {
    setReset(clearPasswordResetFlow(reset));
    setBusy(null);
    setFormError(null);
    setFieldErrors({});
    setMode('login');
  };

  if (mode === 'reset') {
    return (
      <PasswordResetForm
        busy={busy}
        onBusyChange={setBusy}
        onCancel={exitReset}
        onComplete={exitReset}
        setState={setReset}
        state={reset}
      />
    );
  }

  const submit = () => {
    if (loginGate.current) return;
    clearNotice();
    setFormError(null);
    const result = validateLoginForm(values);
    setFieldErrors(result.fieldErrors);
    if (!result.valid) return;

    setBusy('submit');
    const operation = runSingleFlight(loginGate, () => runWithCompletionEvent(
      () => loginAndEstablishSession(result.payload),
      trackLoginComplete,
    ));
    void operation?.then(onLoginComplete).catch((error) => {
      setFormError(getLoginAuthErrorMessage(error));
    }).finally(() => setBusy(null));
  };

  const openReset = () => {
    setValues((current) => ({...current, password: ''}));
    setFieldErrors({});
    setFormError(null);
    setReset(changePasswordResetEmail(createPasswordResetState(), values.email));
    setMode('reset');
  };

  const exitToSignup = () => {
    setValues({email: '', password: ''});
    setReset(clearPasswordResetFlow(reset));
    switchToSignup();
  };

  return (
    <AuthFrame title="로그인" subtitle="경건생활과 공동체 운영을 가볍게 관리해요">
      <AuthTextField
        accessibilityLabel="로그인 이메일 입력"
        error={fieldErrors.email}
        keyboardType="email-address"
        label="이메일"
        onChangeText={(email) => setValues((current) => ({...current, email}))}
        placeholder="faithlog.user@example.test"
        textContentType="emailAddress"
        value={values.email}
      />
      <AuthTextField
        accessibilityLabel="로그인 비밀번호 입력"
        error={fieldErrors.password}
        label="비밀번호"
        onChangeText={(password) => setValues((current) => ({...current, password}))}
        onSubmitEditing={submit}
        placeholder="••••••••"
        secureTextEntry
        textContentType="password"
        value={values.password}
      />
      <Pressable
        accessibilityLabel="비밀번호 찾기"
        accessibilityRole="button"
        disabled={busy !== null}
        onPress={openReset}
        style={styles.linkButton}>
        <Text style={styles.linkText}>비밀번호를 잊으셨나요?</Text>
      </Pressable>
      {formError ? <InlineMessage message={formError} tone="error" /> : null}
      <AuthActions>
        <AuthButton disabled={busy !== null} label={busy === 'submit' ? '로그인 중...' : '로그인'} onPress={submit} />
        <AuthButton disabled={busy !== null} label="회원가입" onPress={exitToSignup} secondary />
      </AuthActions>
      <Text style={styles.footnote}>초대코드는 회원가입 후 입력할 수 있어요</Text>
    </AuthFrame>
  );
}

export function SignupForm({
  clearNotice,
  onSignupComplete,
  switchToLogin,
}: {
  clearNotice: () => void;
  onSignupComplete: (name: string) => void;
  switchToLogin: () => void;
}) {
  const [verification, setVerification] = useState(createSignupVerificationState);
  const verificationRef = useRef(verification);
  const [details, setDetails] = useState<SignupDetails>({
    name: '', password: '', passwordConfirm: '',
  });
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<keyof SignupDetails>>({});
  const [busy, setBusy] = useState<BusyOperation>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const requestGate = useRef(false);
  const confirmGate = useRef(false);
  const submitGate = useRef(false);
  const now = useAuthClock(verification.requested);
  const timing = getAuthCodeTiming(verification, now);

  verificationRef.current = verification;
  useEffect(() => () => {
    verificationRef.current = createSignupVerificationState();
  }, []);

  const updateEmail = (email: string) => {
    setVerification((current) => changeSignupEmail(current, email));
    setDetails((current) => ({...current, password: '', passwordConfirm: ''}));
    setFormError(null);
  };

  const requestCode = () => {
    const checked = changeSignupEmail(verification, verification.email);
    setVerification(checked);
    if (!checked.canRequestCode) return;
    setBusy('request');
    const operation = runSingleFlight(requestGate, () =>
      requestSignupEmailCode({email: normalizeAuthEmail(checked.email)}));
    void operation?.then((response) => {
      setVerification((current) => applySignupCodeRequested(current, response));
    }).catch((error) => {
      setVerification((current) => ({
        ...current, requestError: getOneTimeAuthErrorMessage(error), code: '', codeError: null,
      }));
    }).finally(() => setBusy(null));
  };

  const confirmCode = () => {
    if (verification.code.length !== 6 || timing.expired) return;
    setBusy('confirm');
    const operation = runSingleFlight(confirmGate, () => confirmSignupEmailCode({
      email: normalizeAuthEmail(verification.email),
      code: sanitizeVerificationCode(verification.code),
    }));
    void operation?.then((response) => {
      setVerification((current) => applySignupCodeConfirmed(current, response));
    }).catch((error) => {
      setVerification((current) => ({...current, codeError: getOneTimeAuthErrorMessage(error)}));
    }).finally(() => setBusy(null));
  };

  const submit = () => {
    if (!verification.verified || !verification.emailVerificationToken) {
      setFormError('이메일 인증을 먼저 완료해 주세요.');
      return;
    }
    if (verification.tokenExpiresAt !== null && verification.tokenExpiresAt <= Date.now()) {
      setVerification(changeSignupEmail(verification, verification.email));
      setFormError('이메일 인증이 만료되었습니다. 다시 인증해 주세요.');
      return;
    }
    const validated = validateSignupForm({...details, email: verification.email});
    const {email: _emailError, ...detailErrors} = validated.fieldErrors;
    setFieldErrors(detailErrors);
    if (!validated.valid) return;

    clearNotice();
    setFormError(null);
    setBusy('submit');
    const payload = buildVerifiedSignupPayload(verification, details);
    const operation = runSingleFlight(submitGate, () => runWithCompletionEvent(
      () => signupAfterSessionCleanup(payload),
      trackSignUpComplete,
    ));
    void operation?.then((user) => {
      setVerification(createSignupVerificationState());
      setDetails({name: '', password: '', passwordConfirm: ''});
      onSignupComplete(user.name);
    }).catch((error) => {
      const message = getOneTimeAuthErrorMessage(error);
      if (isTerminalSignupVerificationError(error)) {
        setVerification(changeSignupEmail(verification, verification.email));
      }
      setFormError(message);
    }).finally(() => setBusy(null));
  };

  const exitToLogin = () => {
    setVerification(createSignupVerificationState());
    setDetails({name: '', password: '', passwordConfirm: ''});
    switchToLogin();
  };

  return (
    <AuthFrame title="회원가입">
      <AuthTextField
        accessibilityLabel="회원가입 이메일 입력"
        editable={busy === null}
        error={verification.emailError ?? undefined}
        keyboardType="email-address"
        label="이메일"
        onChangeText={updateEmail}
        placeholder="new.user@example.test"
        textContentType="emailAddress"
        value={verification.email}
      />
      {!verification.verified ? (
        <>
          <AuthButton
            disabled={!verification.canRequestCode || busy !== null || (verification.requested && timing.resendInSeconds > 0)}
            label={verification.requested && timing.resendInSeconds > 0
              ? `재전송 ${formatSeconds(timing.resendInSeconds)}`
              : verification.requested ? '인증번호 재전송' : '인증번호 요청'}
            onPress={requestCode}
          />
          {verification.requested ? (
            <>
              <Text style={styles.guideText}>
                {maskAuthEmail(verification.email)}로 보낸 숫자 6자리를 입력해 주세요.
              </Text>
              <AuthTextField
                accessibilityLabel="회원가입 인증번호 입력"
                editable={busy === null && !timing.expired}
                error={verification.codeError ?? undefined}
                keyboardType="number-pad"
                label={`인증번호 · ${timing.expired ? '만료됨' : formatSeconds(timing.expiresInSeconds)}`}
                maxLength={6}
                onChangeText={(code) => setVerification((current) => ({
                  ...current, code: sanitizeVerificationCode(code), codeError: null,
                }))}
                placeholder="000000"
                textContentType="oneTimeCode"
                value={verification.code}
              />
              <AuthButton
                disabled={verification.code.length !== 6 || timing.expired || busy !== null}
                label={busy === 'confirm' ? '확인 중...' : '인증번호 확인'}
                onPress={confirmCode}
                secondary
              />
            </>
          ) : null}
        </>
      ) : (
        <InlineMessage message="이메일 인증이 완료되었습니다." tone="success" />
      )}
      {verification.requestError ? <InlineMessage message={verification.requestError} tone="error" /> : null}
      {verification.verified ? (
        <>
          <AuthTextField
            accessibilityLabel="회원가입 이름 입력"
            error={fieldErrors.name}
            label="이름"
            onChangeText={(name) => setDetails((current) => ({...current, name}))}
            placeholder="샘플 사용자"
            textContentType="name"
            value={details.name}
          />
          <AuthTextField
            accessibilityLabel="회원가입 비밀번호 입력"
            error={fieldErrors.password}
            label="비밀번호"
            onChangeText={(password) => setDetails((current) => ({...current, password}))}
            placeholder="8자 이상 입력"
            secureTextEntry
            textContentType="newPassword"
            value={details.password}
          />
          <AuthTextField
            accessibilityLabel="회원가입 비밀번호 확인 입력"
            error={fieldErrors.passwordConfirm}
            label="비밀번호 확인"
            onChangeText={(passwordConfirm) => setDetails((current) => ({...current, passwordConfirm}))}
            onSubmitEditing={submit}
            placeholder="8자 이상 다시 입력"
            secureTextEntry
            textContentType="newPassword"
            value={details.passwordConfirm}
          />
        </>
      ) : null}
      {formError ? <InlineMessage message={formError} tone="error" /> : null}
      <AuthActions>
        <AuthButton
          disabled={!verification.verified || busy !== null}
          label={busy === 'submit' ? '가입 중...' : '가입 완료'}
          onPress={submit}
        />
        <AuthButton disabled={busy !== null} label="로그인" onPress={exitToLogin} secondary />
      </AuthActions>
    </AuthFrame>
  );
}

function PasswordResetForm({
  busy,
  onBusyChange,
  onCancel,
  onComplete,
  setState,
  state,
}: {
  busy: BusyOperation;
  onBusyChange: (busy: BusyOperation) => void;
  onCancel: () => void;
  onComplete: () => void;
  setState: Dispatch<SetStateAction<PasswordResetState>>;
  state: PasswordResetState;
}) {
  const requestGate = useRef(false);
  const confirmGate = useRef(false);
  const completeGate = useRef(false);
  const now = useAuthClock(state.requested);
  const timing = getAuthCodeTiming(state, now);
  const step = getPasswordResetStep(state, now);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<{
    passwordError?: string; passwordConfirmError?: string;
  }>({});

  useEffect(() => {
    if (state.step === 'newPassword' && step !== 'newPassword') {
      setState(changePasswordResetEmail(state, state.email));
    }
  }, [setState, state, step]);

  const requestCode = () => {
    const checked = changePasswordResetEmail(state, state.email);
    setState(checked);
    if (!checked.canRequestCode) return;
    onBusyChange('request');
    const operation = runSingleFlight(requestGate, () =>
      requestPasswordResetCode({email: normalizeAuthEmail(checked.email)}));
    void operation?.then((response) => {
      setState((current) => applyPasswordResetCodeRequested(current, response));
      setSuccessMessage('가입된 이메일이라면 인증번호가 발송됩니다.');
    }).catch((error) => {
      setState((current) => ({...current, requestError: getOneTimeAuthErrorMessage(error)}));
    }).finally(() => onBusyChange(null));
  };

  const confirmCode = () => {
    if (state.code.length !== 6 || timing.expired) return;
    onBusyChange('confirm');
    const operation = runSingleFlight(confirmGate, () => confirmPasswordResetCode({
      email: normalizeAuthEmail(state.email),
      code: sanitizeVerificationCode(state.code),
    }));
    void operation?.then((response) => {
      setState((current) => applyPasswordResetCodeConfirmed(current, response));
      setSuccessMessage(null);
    }).catch((error) => {
      setState((current) => ({...current, codeError: getOneTimeAuthErrorMessage(error)}));
    }).finally(() => onBusyChange(null));
  };

  const complete = () => {
    if (step !== 'newPassword' || !state.passwordResetToken) {
      setState(changePasswordResetEmail(state, state.email));
      return;
    }
    const validated = validateNewPassword(state.newPassword, state.passwordConfirm);
    setPasswordErrors(validated);
    if (!validated.valid) return;

    onBusyChange('complete');
    const operation = runSingleFlight(completeGate, () => completePasswordReset({
      resetToken: state.passwordResetToken as string,
      newPassword: state.newPassword,
    }));
    void operation?.then(() => {
      setState(clearPasswordResetFlow(state));
      onComplete();
    }).catch((error) => {
      const message = getOneTimeAuthErrorMessage(error);
      if (isTerminalPasswordResetError(error)) {
        setState({...changePasswordResetEmail(state, state.email), requestError: message});
      } else {
        setState((current) => ({...current, requestError: message}));
      }
    }).finally(() => onBusyChange(null));
  };

  return (
    <AuthFrame title="비밀번호 재설정" subtitle="이메일 인증 후 새 비밀번호를 설정해 주세요.">
      {step === 'email' ? (
        <>
          <AuthTextField
            accessibilityLabel="비밀번호 재설정 이메일 입력"
            error={state.emailError ?? undefined}
            keyboardType="email-address"
            label="이메일"
            onChangeText={(email) => {
              setState((current) => changePasswordResetEmail(current, email));
              setSuccessMessage(null);
            }}
            placeholder="faithlog.user@example.test"
            textContentType="emailAddress"
            value={state.email}
          />
          <AuthButton disabled={!state.canRequestCode || busy !== null} label="인증번호 요청" onPress={requestCode} />
        </>
      ) : null}
      {step === 'code' ? (
        <>
          {successMessage ? <InlineMessage message={successMessage} tone="success" /> : null}
          <Text style={styles.guideText}>
            {maskAuthEmail(state.email)}로 보낸 숫자 6자리를 입력해 주세요.
          </Text>
          <AuthTextField
            accessibilityLabel="비밀번호 재설정 인증번호 입력"
            editable={busy === null && !timing.expired}
            error={state.codeError ?? undefined}
            keyboardType="number-pad"
            label={`인증번호 · ${timing.expired ? '만료됨' : formatSeconds(timing.expiresInSeconds)}`}
            maxLength={6}
            onChangeText={(code) => setState((current) => ({
              ...current, code: sanitizeVerificationCode(code), codeError: null,
            }))}
            placeholder="000000"
            textContentType="oneTimeCode"
            value={state.code}
          />
          <AuthButton
            disabled={state.code.length !== 6 || timing.expired || busy !== null}
            label={busy === 'confirm' ? '확인 중...' : '인증번호 확인'}
            onPress={confirmCode}
          />
          <AuthButton
            disabled={timing.resendInSeconds > 0 || busy !== null}
            label={timing.resendInSeconds > 0
              ? `재전송 ${formatSeconds(timing.resendInSeconds)}`
              : '인증번호 재전송'}
            onPress={requestCode}
            secondary
          />
        </>
      ) : null}
      {step === 'newPassword' ? (
        <>
          <AuthTextField
            accessibilityLabel="새 비밀번호 입력"
            error={passwordErrors.passwordError}
            label="새 비밀번호"
            onChangeText={(newPassword) => setState((current) => ({...current, newPassword}))}
            placeholder="8자 이상 입력"
            secureTextEntry
            textContentType="newPassword"
            value={state.newPassword}
          />
          <AuthTextField
            accessibilityLabel="새 비밀번호 확인 입력"
            error={passwordErrors.passwordConfirmError}
            label="새 비밀번호 확인"
            onChangeText={(passwordConfirm) => setState((current) => ({...current, passwordConfirm}))}
            onSubmitEditing={complete}
            placeholder="8자 이상 다시 입력"
            secureTextEntry
            textContentType="newPassword"
            value={state.passwordConfirm}
          />
          <AuthButton disabled={busy !== null} label={busy === 'complete' ? '변경 중...' : '비밀번호 변경'} onPress={complete} />
        </>
      ) : null}
      {state.requestError ? <InlineMessage message={state.requestError} tone="error" /> : null}
      <AuthButton disabled={busy !== null} label="로그인으로 돌아가기" onPress={onCancel} secondary />
    </AuthFrame>
  );
}

function useAuthClock(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [active]);
  return now;
}

function AuthFrame({children, subtitle, title}: {
  children: React.ReactNode; subtitle?: string; title: string;
}) {
  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <View style={styles.brandChip}><Text style={styles.brandText}>FaithLog</Text></View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function AuthTextField({
  accessibilityLabel,
  editable = true,
  error,
  keyboardType = 'default',
  label,
  maxLength,
  onChangeText,
  onSubmitEditing,
  placeholder,
  secureTextEntry = false,
  textContentType,
  value,
}: {
  accessibilityLabel: string;
  editable?: boolean;
  error?: string | undefined;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  label: string;
  maxLength?: number;
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  secureTextEntry?: boolean;
  textContentType?: 'emailAddress' | 'name' | 'newPassword' | 'password' | 'oneTimeCode';
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        style={[styles.input, error ? styles.inputError : null]}
        textContentType={textContentType}
        value={value}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function AuthActions({children}: {children: React.ReactNode}) {
  return <View style={styles.actions}>{children}</View>;
}

function AuthButton({disabled, label, onPress, secondary = false}: {
  disabled: boolean; label: string; onPress: () => void; secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        secondary ? styles.secondaryButton : styles.primaryButton,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={[styles.buttonText, secondary ? styles.secondaryButtonText : styles.primaryButtonText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function InlineMessage({message, tone}: {message: string; tone: 'error' | 'success'}) {
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : 'text'} style={styles.message}>
      <Text style={tone === 'error' ? styles.errorText : styles.successText}>{message}</Text>
    </View>
  );
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function isTerminalSignupVerificationError(error: unknown) {
  return error instanceof FaithLogApiError && (
    error.detail.code === 'EMAIL_VERIFICATION_TOKEN_INVALID' ||
    error.detail.code === 'EMAIL_VERIFICATION_TOKEN_EXPIRED' ||
    error.detail.code === 'EMAIL_VERIFICATION_TOKEN_REUSED'
  );
}

function isTerminalPasswordResetError(error: unknown) {
  return error instanceof FaithLogApiError && (
    error.detail.code === 'PASSWORD_RESET_TOKEN_INVALID' ||
    error.detail.code === 'PASSWORD_RESET_TOKEN_EXPIRED' ||
    error.detail.code === 'PASSWORD_RESET_TOKEN_REUSED'
  );
}

const styles = StyleSheet.create({
  frame: {alignSelf: 'center', gap: 12, maxWidth: 390, paddingTop: 20, width: '100%'},
  header: {alignItems: 'flex-start', gap: 10, marginBottom: 22},
  brandChip: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: 15,
    height: 30, justifyContent: 'center', width: 86,
  },
  brandText: {color: colors.primary, fontSize: 15, fontWeight: '600'},
  title: {color: colors.textPrimary, fontSize: 24, fontWeight: '700', lineHeight: 34},
  subtitle: {color: colors.textSecondary, fontSize: 15, lineHeight: 20},
  field: {alignSelf: 'center', gap: 8, maxWidth: 318, width: '100%'},
  fieldLabel: {color: colors.textSecondary, fontSize: 15, fontWeight: '600'},
  input: {
    backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16,
    borderWidth: 1, color: colors.textPrimary, fontSize: 15, minHeight: 50,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  inputError: {borderColor: colors.danger},
  fieldError: {color: colors.danger, fontSize: 14, fontWeight: '600', lineHeight: 20},
  actions: {
    alignSelf: 'center', flexDirection: 'row', gap: 12, marginTop: 28,
    maxWidth: 318, width: '100%',
  },
  button: {
    alignItems: 'center', alignSelf: 'center', borderRadius: 12, justifyContent: 'center',
    minHeight: 44, paddingHorizontal: 14, width: '100%', maxWidth: 318,
  },
  primaryButton: {backgroundColor: colors.primary},
  secondaryButton: {backgroundColor: colors.borderSoft, borderColor: colors.border, borderWidth: 1},
  buttonText: {fontSize: 15, fontWeight: '600', textAlign: 'center'},
  primaryButtonText: {color: colors.surface},
  secondaryButtonText: {color: colors.textSecondary},
  disabled: {opacity: 0.54},
  pressed: {opacity: 0.78},
  linkButton: {alignSelf: 'center', maxWidth: 318, paddingVertical: 8, width: '100%'},
  linkText: {color: colors.primary, fontSize: 14, fontWeight: '600', textAlign: 'right'},
  guideText: {alignSelf: 'center', color: colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 318, width: '100%'},
  message: {alignSelf: 'center', maxWidth: 318, width: '100%'},
  errorText: {color: colors.danger, fontSize: 14, lineHeight: 20},
  successText: {color: colors.success, fontSize: 14, fontWeight: '600', lineHeight: 20},
  footnote: {alignSelf: 'center', color: colors.textMuted, fontSize: 14, marginTop: 22, maxWidth: 318, width: '100%'},
});
