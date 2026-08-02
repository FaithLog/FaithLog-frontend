import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {
  FaithLogApiError,
  getProfileContractCapabilities,
  updateMyProfileName,
} from '../api/client';
import {
  getAuthSessionGeneration,
  isAuthSessionRequestAllowed,
} from '../api/tokenStorage';
import type {CurrentUser} from '../api/types';
import {
  expireMissingAuthSession,
  readCurrentAccessToken,
} from '../auth/accessTokenResolver';
import {colors} from '../theme';
import {
  createProfileNameMutationTracker,
  getProfileNameErrorMessage,
  validateProfileName,
} from './profileNameEdit';

export function ProfileNameEditor({
  onSessionExpired,
  user,
}: {
  onSessionExpired: (message: string) => void;
  user: CurrentUser;
}) {
  const trackerRef = useRef<ReturnType<typeof createProfileNameMutationTracker> | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = createProfileNameMutationTracker(user.id);
  }
  const tracker = trackerRef.current;

  useLayoutEffect(() => {
    tracker.syncUser(user.id);
  }, [tracker, user.id]);

  const [displayName, setDisplayName] = useState(user.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameEditEnabled = getProfileContractCapabilities().nameEditEnabled;

  useEffect(() => {
    tracker.mount();
    return () => tracker.unmount();
  }, [tracker]);

  useEffect(() => {
    setDisplayName(user.name);
    setDraft(user.name);
    setEditing(false);
    setError(null);
    setSaving(false);
  }, [user.id, user.name]);

  const startEditing = () => {
    setDraft(displayName);
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(displayName);
    setError(null);
    setEditing(false);
  };

  const save = () => {
    const validation = validateProfileName(draft);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    const operation = tracker.runSingleFlight(async () => {
      const requestGeneration = getAuthSessionGeneration();
      const identity = tracker.begin(requestGeneration);
      setSaving(true);
      setError(null);

      try {
        const resolution = await readCurrentAccessToken();
        if (
          resolution.generation !== requestGeneration ||
          !tracker.isSuccessCurrent(
            identity,
            getAuthSessionGeneration(),
            user.id,
          ) ||
          !isAuthSessionRequestAllowed(requestGeneration)
        ) {
          return;
        }
        if (!resolution.accessToken) {
          expireMissingAuthSession(requestGeneration);
          onSessionExpired('로그인이 만료되었습니다. 다시 로그인해 주세요.');
          return;
        }

        const updatedUser = await updateMyProfileName(
          resolution.accessToken,
          validation.payload,
          requestGeneration,
        );
        if (
          !tracker.isSuccessCurrent(
            identity,
            getAuthSessionGeneration(),
            user.id,
          ) ||
          !isAuthSessionRequestAllowed(requestGeneration)
        ) {
          return;
        }

        setDisplayName(updatedUser.name);
        setDraft(updatedUser.name);
        setEditing(false);
      } catch (caught) {
        const currentGeneration = getAuthSessionGeneration();
        if (caught instanceof FaithLogApiError) {
          if (!tracker.shouldApplyError(
            identity,
            caught.detail,
            currentGeneration,
            user.id,
          )) {
            return;
          }
          if (caught.detail.kind === 'sessionExpired') {
            onSessionExpired('로그인이 만료되었습니다. 다시 로그인해 주세요.');
            return;
          }
          setError(getProfileNameErrorMessage(caught.detail));
          return;
        }

        if (tracker.isSuccessCurrent(identity, currentGeneration, user.id)) {
          setError('잠시 후 다시 시도해 주세요.');
        }
      } finally {
        if (tracker.isSuccessCurrent(
          identity,
          getAuthSessionGeneration(),
          user.id,
        )) {
          setSaving(false);
        }
      }
    });

    void operation?.catch(() => undefined);
  };

  return (
    <View style={styles.frame}>
      <View style={styles.nameRow}>
        {editing ? (
          <View style={styles.editor}>
            <TextInput
              accessibilityLabel="이름 입력"
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
              onChangeText={(name) => {
                setDraft(name);
                setError(null);
              }}
              onSubmitEditing={save}
              placeholder="이름"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              style={[styles.input, error ? styles.inputError : null]}
              textContentType="name"
              value={draft}
            />
            <View style={styles.actions}>
              <ProfileEditButton
                disabled={saving}
                label={saving ? '저장 중...' : '저장'}
                onPress={save}
                accessibilityLabel="이름 저장"
              />
              <ProfileEditButton
                accessibilityLabel="이름 수정 취소"
                disabled={saving}
                label="취소"
                onPress={cancelEditing}
                secondary
              />
            </View>
          </View>
        ) : (
          <>
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.name}>
              {displayName}
            </Text>
            {nameEditEnabled ? (
              <Pressable
                accessibilityLabel="이름 수정"
                accessibilityRole="button"
                onPress={startEditing}
                style={({pressed}) => [styles.editButton, pressed ? styles.pressed : null]}>
                <Text style={styles.editButtonText}>수정</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Text
        accessibilityLabel="이메일 (읽기 전용)"
        accessibilityState={{disabled: true}}
        ellipsizeMode="tail"
        numberOfLines={1}
        style={styles.email}>
        {user.email}
      </Text>
    </View>
  );
}

function ProfileEditButton({
  accessibilityLabel,
  disabled,
  label,
  onPress,
  secondary = false,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{busy: label === '저장 중...', disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.actionButton,
        secondary ? styles.secondaryButton : styles.primaryButton,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={secondary ? styles.secondaryButtonText : styles.primaryButtonText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 58,
    paddingHorizontal: 12,
  },
  actions: {flexDirection: 'row', gap: 8},
  disabled: {opacity: 0.54},
  editButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 52,
    paddingHorizontal: 12,
  },
  editButtonText: {color: colors.primary, fontSize: 13, fontWeight: '600'},
  editor: {flex: 1, gap: 8},
  email: {color: colors.textSecondary, fontSize: 13, lineHeight: 18},
  error: {color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19},
  frame: {flex: 1, gap: 8, minWidth: 0},
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  inputError: {borderColor: colors.danger},
  name: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  nameRow: {alignItems: 'center', flexDirection: 'row', gap: 8, minWidth: 0},
  pressed: {opacity: 0.78},
  primaryButton: {backgroundColor: colors.primary},
  primaryButtonText: {color: colors.surface, fontSize: 13, fontWeight: '600'},
  secondaryButton: {backgroundColor: colors.borderSoft},
  secondaryButtonText: {color: colors.textSecondary, fontSize: 13, fontWeight: '600'},
});
