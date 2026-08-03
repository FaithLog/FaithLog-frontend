import {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {changeMyPassword, FaithLogApiError} from '../api/client';
import {
  getAuthSessionGeneration,
  isAuthSessionRequestAllowed,
} from '../api/tokenStorage';
import {
  expireMissingAuthSession,
  readCurrentAccessToken,
} from '../auth/accessTokenResolver';
import {clearPasswordChangedSession} from '../auth/passwordChangeSession';
import {colors} from '../theme';
import {
  getProfilePasswordErrorPresentation,
  type ProfilePasswordField,
  type ProfilePasswordFieldErrors,
  validateProfilePasswordChange,
} from './profilePasswordChange';

export function ProfilePasswordChangeScreen({
  onBack,
  onPasswordChanged,
  onSessionExpired = () => undefined,
}: {
  onBack: () => void;
  onPasswordChanged: (warning?: string) => void;
  onSessionExpired?: (message: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ProfilePasswordFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const updateField = (
    field: ProfilePasswordField,
    setter: (value: string) => void,
  ) => (value: string) => {
    setter(value);
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = {...current};
      delete next[field];
      return next;
    });
    setFormError(null);
  };

  const submit = () => {
    if (inFlightRef.current) return;

    const validation = validateProfilePasswordChange({
      confirmPassword,
      currentPassword,
      newPassword,
    });
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setFormError(null);
      return;
    }

    const requestGeneration = getAuthSessionGeneration();
    inFlightRef.current = true;
    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    void (async () => {
      try {
        const resolution = await readCurrentAccessToken();
        if (
          resolution.generation !== requestGeneration ||
          !isAuthSessionRequestAllowed(requestGeneration)
        ) {
          return;
        }
        if (!resolution.accessToken) {
          expireMissingAuthSession(requestGeneration);
          onSessionExpired('로그인이 만료되었습니다. 다시 로그인해 주세요.');
          return;
        }

        await changeMyPassword(
          resolution.accessToken,
          validation.payload,
          requestGeneration,
        );
        if (!isAuthSessionRequestAllowed(requestGeneration)) return;

        if (mountedRef.current) {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setFieldErrors({});
          setFormError(null);
        }

        const result = await clearPasswordChangedSession(requestGeneration);
        if (result.status === 'cleared') {
          onPasswordChanged();
        } else if (result.status === 'cleanupFailed') {
          onPasswordChanged(result.warning);
        }
      } catch (caught) {
        if (!mountedRef.current) return;
        if (caught instanceof FaithLogApiError) {
          if (caught.detail.authSessionGeneration !== undefined &&
              caught.detail.authSessionGeneration !== requestGeneration) {
            return;
          }
          if (caught.detail.kind === 'sessionExpired') {
            onSessionExpired('로그인이 만료되었습니다. 다시 로그인해 주세요.');
            return;
          }
          const presentation = getProfilePasswordErrorPresentation(caught.detail);
          if ('fieldErrors' in presentation) {
            setFieldErrors(presentation.fieldErrors);
            setFormError(null);
          } else {
            setFieldErrors({});
            setFormError(presentation.formError);
          }
          return;
        }
        setFieldErrors({});
        setFormError('비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    })();
  };

  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="내정보 화면으로 돌아가기"
          accessibilityRole="button"
          disabled={saving}
          onPress={onBack}
          style={({pressed}) => [styles.backButton, pressed ? styles.pressed : null]}>
          <Text style={styles.backButtonText}>뒤로</Text>
        </Pressable>
        <Text style={styles.title}>비밀번호 변경</Text>
      </View>

      <Text style={styles.description}>
        현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.
      </Text>

      <PasswordField
        accessibilityLabel="현재 비밀번호"
        editable={!saving}
        error={fieldErrors.currentPassword}
        field="currentPassword"
        label="현재 비밀번호"
        onChangeText={updateField('currentPassword', setCurrentPassword)}
        textContentType="password"
        value={currentPassword}
      />
      <PasswordField
        accessibilityLabel="새 비밀번호"
        editable={!saving}
        error={fieldErrors.newPassword}
        field="newPassword"
        label="새 비밀번호"
        onChangeText={updateField('newPassword', setNewPassword)}
        textContentType="newPassword"
        value={newPassword}
      />
      <PasswordField
        accessibilityLabel="새 비밀번호 확인"
        editable={!saving}
        error={fieldErrors.confirmPassword}
        field="confirmPassword"
        label="새 비밀번호 확인"
        onChangeText={updateField('confirmPassword', setConfirmPassword)}
        textContentType="newPassword"
        value={confirmPassword}
      />

      {formError ? (
        <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>
      ) : null}

      <Pressable
        accessibilityLabel="비밀번호 변경 완료"
        accessibilityRole="button"
        accessibilityState={{busy: saving, disabled: saving}}
        disabled={saving}
        onPress={submit}
        style={({pressed}) => [
          styles.submitButton,
          saving ? styles.disabled : null,
          pressed ? styles.pressed : null,
        ]}>
        <Text style={styles.submitButtonText}>
          {saving ? '변경 중...' : '비밀번호 변경'}
        </Text>
      </Pressable>
    </View>
  );
}

function PasswordField({
  accessibilityLabel,
  editable,
  error,
  field,
  label,
  onChangeText,
  textContentType,
  value,
}: {
  accessibilityLabel: string;
  editable: boolean;
  error?: string | undefined;
  field: ProfilePasswordField;
  label: string;
  onChangeText: (value: string) => void;
  textContentType: 'newPassword' | 'password';
  value: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, error ? styles.inputShellError : null]}>
        <TextInput
          accessibilityHint={error}
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          style={styles.input}
          textContentType={textContentType}
          value={value}
        />
        <Pressable
          accessibilityLabel={`${label} ${visible ? '숨기기' : '표시'}`}
          accessibilityRole="button"
          disabled={!editable}
          hitSlop={8}
          onPress={() => setVisible((current) => !current)}
          style={({pressed}) => [styles.visibilityButton, pressed ? styles.pressed : null]}>
          <Text style={styles.visibilityButtonText}>{visible ? '숨기기' : '표시'}</Text>
        </Pressable>
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          nativeID={`profile-password-${field}-error`}
          style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderColor: colors.borderSoft,
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  backButtonText: {color: colors.textSecondary, fontSize: 15, fontWeight: '600'},
  description: {color: colors.textSecondary, fontSize: 15, lineHeight: 22},
  disabled: {opacity: 0.55},
  error: {color: colors.danger, fontSize: 14, lineHeight: 20},
  field: {gap: 8},
  fieldError: {color: colors.danger, fontSize: 14, lineHeight: 20},
  frame: {gap: 20, paddingBottom: 32},
  header: {alignItems: 'center', flexDirection: 'row', gap: 14},
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 16,
    height: 52,
    paddingHorizontal: 16,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
  },
  inputShellError: {borderColor: colors.danger},
  label: {color: colors.textPrimary, fontSize: 15, fontWeight: '600'},
  pressed: {opacity: 0.75},
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
  },
  submitButtonText: {color: colors.surface, fontSize: 16, fontWeight: '700'},
  title: {color: colors.textPrimary, fontSize: 24, fontWeight: '700'},
  visibilityButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  visibilityButtonText: {color: colors.primary, fontSize: 14, fontWeight: '600'},
});
