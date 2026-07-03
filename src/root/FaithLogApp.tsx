import {type PropsWithChildren, useEffect, useMemo, useRef, useState} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  type KeyboardTypeOptions,
  Modal,
  Platform,
  Pressable,
  type ReturnKeyTypeOptions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  StatusBar,
  View,
} from 'react-native';

import {
  createCampus,
  FaithLogApiError,
  fetchCampusDetail,
  fetchChargeSummary,
  fetchCurrentUser,
  fetchDevotionMonthlySummary,
  fetchMyDutyAssignment,
  fetchMyCampuses,
  fetchPrayerWeek,
  joinCampus,
  signupUser,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens, saveSelectedCampusId} from '../api/tokenStorage';
import type {
  ApiError,
  CampusDetail,
  CampusMembershipSummary,
  ChargeSummary,
  CurrentUser,
  DevotionMonthlySummary,
  PrayerWeekSummary,
  UserRole,
} from '../api/types';
import {AdminScreen} from '../admin/AdminScreen';
import {ServiceAdminScreen} from '../admin/ServiceAdminScreen';
import {
  type AuthFieldErrors,
  type LoginFormValues,
  type SignupFormValues,
  validateLoginForm,
  validateSignupForm,
} from '../auth/authForms';
import type {AuthGateState} from '../auth/authGate';
import {bootstrapAuthGate} from '../auth/authGate';
import {loginAndEstablishSession, logoutCurrentSession} from '../auth/session';
import {
  type CampusCreateFormValues,
  type InviteCodeFormValues,
  validateCampusCreateForm,
  validateInviteCodeForm,
} from '../campus/campusForms';
import {
  Body,
  BottomNav,
  Button,
  Card,
  Conflict,
  DangerConfirmSheet,
  Empty,
  ErrorState,
  Eyebrow,
  FaithLogHeaderIconButton,
  FaithLogHeaderPillButton,
  FaithLogHeaderTopRow,
  ListRow,
  Loading,
  Offline,
  PermissionDenied,
  Screen,
  TextField,
  Title,
} from '../components/ui';
import {IconexIcon, type IconexIconName} from '../components/IconexIcon';
import {
  type AdminModeRoute,
  getAdminModeRoutes,
  getAvailableRoutes,
  getRouteLabel,
  type ShellRoute,
  USER_BOTTOM_NAV_ROUTES,
} from '../navigation/shellRoutes';
import {DevotionScreen} from '../devotion/DevotionScreen';
import {MonthlyCalendarScreen} from '../devotion/MonthlyCalendarScreen';
import {CoffeeDutyScreen} from '../coffee/CoffeeDutyScreen';
import {
  deactivateCurrentFcmToken,
  inspectFcmRegistrationStatus,
  registerCurrentFcmToken,
  registerFcmTokenValue,
  type FcmRegistrationStatus,
} from '../notifications/fcmRegistration';
import {isFcmRuntimeEnabled} from '../notifications/fcmEnvironment';
import {initializeNativeFirebaseMessaging} from '../notifications/nativeFirebaseMessaging';
import {
  getInitialNotificationOpenPayload,
  openNotificationSettings,
  subscribeDeviceFcmTokenRefresh,
  subscribeNotificationOpenPayload,
} from '../notifications/notificationAdapter';
import {
  parsePushNotificationOpenPayload,
} from '../notifications/pushNavigation';
import {PaymentScreen} from '../payments/PaymentScreen';
import {PollScreen} from '../polls/PollScreen';
import {PrayerScreen, type PrayerEntryMode} from '../prayers/PrayerScreen';
import {colors, spacing} from '../theme';
import {formatCompactWon} from '../utils/money';

const initialState: AuthGateState = {
  status: 'loading',
  message: '저장된 세션을 확인하고 있어요.',
};

type EntryTarget =
  | 'login'
  | 'signup'
  | 'inviteCode'
  | 'campusCreate'
  | 'campusSelect'
  | 'campusDetail';

type AppMessage = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type CardState<T> =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; data: T}
  | {status: 'error'; error: ApiError};

type HomeCardKey = 'overview' | 'devotion' | 'charges' | 'polls' | 'prayers';

type HomePrayerEntryVariant = 'default' | 'suggestion' | 'always';

type NotificationUiState =
  | {status: 'checking'}
  | {status: 'registering'}
  | {status: 'deactivating'}
  | {status: 'error'; error: ApiError}
  | {status: 'dismissed'}
  | FcmRegistrationStatus;

const HOME_TODAY_REFRESH_INTERVAL_MS = 60 * 1000;

export function FaithLogApp() {
  const [authState, setAuthState] = useState<AuthGateState>(initialState);
  const [entryTarget, setEntryTarget] = useState<EntryTarget | null>(null);
  const [route, setRoute] = useState<ShellRoute>('userHome');
  const initialAuthenticatedRouteAppliedRef = useRef(false);
  const initialNotificationOpenHandledRef = useRef(false);
  const clearAppMessage = () => {};
  const ignoreAppMessage = (_notice: AppMessage) => {};
  const publicAuthMode =
    authState.status === 'signedOut' ||
    authState.status === 'sessionExpired' ||
    authState.status === 'configurationError';
  const RootContainer = Platform.OS === 'android' ? View : SafeAreaView;

  const retryBootstrap = () => {
    setEntryTarget(null);
    clearAppMessage();
    setAuthState({status: 'loading', message: '세션을 다시 확인하고 있어요.'});
    void bootstrapAuthGate().then(setAuthState);
  };

  useEffect(() => {
    void initializeNativeFirebaseMessaging();
    void bootstrapAuthGate().then(setAuthState);
  }, []);

  useEffect(() => {
    if (authState.status !== 'authenticated' || !isFcmRuntimeEnabled()) {
      return undefined;
    }

    let active = true;
    let unsubscribe = () => {};

    void initializeNativeFirebaseMessaging().then(() => {
      if (!active) {
        return;
      }

      unsubscribe = subscribeDeviceFcmTokenRefresh((token) => {
        void getStoredTokens()
          .then(({accessToken}) => {
            if (!active || !accessToken) {
              return null;
            }

            return registerFcmTokenValue(accessToken, token);
          })
          .catch(() => null);
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authState]);

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      initialAuthenticatedRouteAppliedRef.current = false;
      setRoute('userHome');
      return;
    }

    const routes = getAvailableRoutes(authState.user, authState.selectedCampus);

    if (!initialAuthenticatedRouteAppliedRef.current) {
      initialAuthenticatedRouteAppliedRef.current = true;
      setRoute(routes[0]!);
      return;
    }

    if (!routes.includes(route)) {
      setRoute(routes[0]!);
    }
  }, [authState, route]);

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      initialNotificationOpenHandledRef.current = false;
      return undefined;
    }

    let active = true;
    const handlePayload = (payload: unknown) => {
      const target = parsePushNotificationOpenPayload(payload);

      if (target.status === 'invalid') {
        return;
      }

      const routes = getAvailableRoutes(authState.user, authState.selectedCampus);

      if (!routes.includes(target.route)) {
        return;
      }

      setRoute(target.route);
    };

    if (!initialNotificationOpenHandledRef.current) {
      initialNotificationOpenHandledRef.current = true;
      void getInitialNotificationOpenPayload().then((payload) => {
        if (active && payload !== null && payload !== undefined) {
          handlePayload(payload);
        }
      });
    }

    const unsubscribe = subscribeNotificationOpenPayload(handlePayload);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authState]);

  return (
    <>
      <StatusBar
        backgroundColor={colors.background}
        barStyle="dark-content"
        translucent={false}
      />
      <RootContainer style={[styles.safeArea, publicAuthMode ? styles.authSafeArea : null]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.keyboardRoot}>
          {publicAuthMode ? (
            <ScrollView
              contentContainerStyle={styles.authScrollContent}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {renderAuthState({
                clearNotice: clearAppMessage,
                entryTarget,
                openEntryTarget: setEntryTarget,
                retry: retryBootstrap,
                route,
                setAuthState,
                setNotice: ignoreAppMessage,
                setRoute,
                state: authState,
              })}
            </ScrollView>
          ) : authState.status === 'authenticated' ? (
            <Screen variant="appShell">
              <AuthenticatedShell
                entryTarget={entryTarget}
                openEntryTarget={setEntryTarget}
                route={route}
                setAuthState={setAuthState}
                setNotice={ignoreAppMessage}
                setRoute={setRoute}
                state={authState}
              />
            </Screen>
          ) : (
            <Screen>
              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled">
                {renderAuthState({
                  clearNotice: clearAppMessage,
                  entryTarget,
                  openEntryTarget: setEntryTarget,
                  retry: retryBootstrap,
                  route,
                  setAuthState,
                  setNotice: ignoreAppMessage,
                  setRoute,
                  state: authState,
                })}
              </ScrollView>
            </Screen>
          )}
        </KeyboardAvoidingView>
      </RootContainer>
    </>
  );
}

function renderAuthState({
  clearNotice,
  entryTarget,
  openEntryTarget,
  retry,
  route,
  setAuthState,
  setNotice,
  setRoute,
  state,
}: {
  clearNotice: () => void;
  entryTarget: EntryTarget | null;
  openEntryTarget: (target: EntryTarget | null) => void;
  retry: () => void;
  route: ShellRoute;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: AppMessage) => void;
  setRoute: (route: ShellRoute) => void;
  state: AuthGateState;
}) {
  switch (state.status) {
    case 'loading':
      return <LaunchAuthCheckScreen message={state.message} />;
    case 'signedOut':
      return renderPublicAuthEntry({
        clearNotice,
        entryTarget: entryTarget === 'signup' ? 'signup' : 'login',
        openEntryTarget,
        setAuthState,
      });
    case 'sessionExpired':
      if (entryTarget === 'login' || entryTarget === 'signup') {
        return renderPublicAuthEntry({
          clearNotice,
          entryTarget,
          openEntryTarget,
          setAuthState,
        });
      }

      return (
        <SessionExpiredScreen
          message={state.message}
          onLoginPress={() => openEntryTarget('login')}
          onSignupPress={() => openEntryTarget('signup')}
        />
      );
    case 'noCampus':
      return (
        <NoCampusOnboarding
          clearNotice={clearNotice}
          entryTarget={entryTarget}
          openEntryTarget={openEntryTarget}
          setAuthState={setAuthState}
          user={state.user}
        />
      );
    case 'permissionDenied':
      return (
        <PermissionDenied
          title="접근 권한이 필요합니다"
          message={state.message}
          actionLabel="이전 화면으로"
          actionAccessibilityLabel="권한 부족 안내 후 이전 화면으로 이동"
          onActionPress={retry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title="최신 상태 확인이 필요합니다"
          message={state.message}
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="충돌 상태에서 최신 데이터 다시 불러오기"
          onActionPress={retry}
        />
      );
    case 'offline':
      return (
        <Offline
          title="네트워크 연결이 불안정합니다"
          message={state.message}
          actionLabel="다시 시도"
          actionAccessibilityLabel="오프라인 상태에서 다시 시도"
          onActionPress={retry}
        />
      );
    case 'configurationError':
      return (
        <StatusCard
          eyebrow="환경 설정"
          title="API 서버 주소를 확인해 주세요"
          message={state.message}
          primaryLabel="다시 확인"
          primaryAccessibilityLabel="API 서버 환경 설정을 다시 확인"
          onPrimaryPress={retry}
          tone="danger"
        />
      );
    case 'error':
      return (
        <ErrorState
          title="앱 시작 중 문제가 발생했습니다"
          message={state.message}
          actionLabel="다시 시도"
          actionAccessibilityLabel="앱 시작 오류 후 다시 시도"
          onActionPress={retry}
        />
      );
    case 'authenticated':
      return (
        <AuthenticatedShell
          entryTarget={entryTarget}
          openEntryTarget={openEntryTarget}
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
          route={route}
          setRoute={setRoute}
        />
      );
    default:
      return assertNever(state);
  }
}

function renderPublicAuthEntry({
  clearNotice,
  entryTarget,
  openEntryTarget,
  setAuthState,
}: {
  clearNotice: () => void;
  entryTarget: 'login' | 'signup';
  openEntryTarget: (target: EntryTarget | null) => void;
  setAuthState: (state: AuthGateState) => void;
}) {
  if (entryTarget === 'signup') {
    return (
      <SignupForm
        clearNotice={clearNotice}
        onSignupComplete={() => {
          openEntryTarget('login');
        }}
        switchToLogin={() => openEntryTarget('login')}
      />
    );
  }

  return (
    <LoginForm
      clearNotice={clearNotice}
      onLoginComplete={(nextState) => {
        setAuthState(nextState);
        if (nextState.status === 'authenticated') {
          openEntryTarget(null);
        }
        if (nextState.status === 'noCampus') {
          openEntryTarget(null);
        }
      }}
      switchToSignup={() => openEntryTarget('signup')}
    />
  );
}

function NoCampusOnboarding({
  clearNotice,
  entryTarget,
  openEntryTarget,
  setAuthState,
  user,
}: {
  clearNotice: () => void;
  entryTarget: EntryTarget | null;
  openEntryTarget: (target: EntryTarget | null) => void;
  setAuthState: (state: AuthGateState) => void;
  user: Extract<AuthGateState, {status: 'noCampus'}>['user'];
}) {
  const canCreateCampus = canCreateCampusWithRole(user.role);

  if (entryTarget === 'inviteCode') {
    return (
      <InviteCodeForm
        clearNotice={clearNotice}
        onCancel={() => openEntryTarget(null)}
        onComplete={(nextState, _campusName) => {
          openEntryTarget(null);
          setAuthState(nextState);
        }}
        onSessionExpired={(message) => setAuthState({status: 'sessionExpired', message})}
        user={user}
      />
    );
  }

  if (entryTarget === 'campusCreate' && canCreateCampus) {
    return (
      <CampusCreateGate
        canCreateCampus={canCreateCampus}
        clearNotice={clearNotice}
        onCancel={() => openEntryTarget(null)}
        onComplete={(nextState, _campusName) => {
          openEntryTarget(null);
          setAuthState(nextState);
        }}
        onInvitePress={() => openEntryTarget('inviteCode')}
        onSessionExpired={(message) => setAuthState({status: 'sessionExpired', message})}
        user={user}
      />
    );
  }

  return (
    <NoCampusEntryScreen
      canCreateCampus={canCreateCampus}
      userName={user.name}
      onCampusCreatePress={() => openEntryTarget('campusCreate')}
      onInviteCodePress={() => openEntryTarget('inviteCode')}
    />
  );
}

function LaunchAuthCheckScreen({message}: {message: string}) {
  return (
    <View style={styles.launchFrame}>
      <View style={styles.launchIcon}>
        <Text style={styles.launchIconText}>F</Text>
      </View>
      <Text style={styles.launchTitle}>FaithLog</Text>
      <Text style={styles.launchSubtitle}>경건생활과 공동체 운영을 확인하고 있어요</Text>
      <View style={styles.launchLoadingCard}>
        <View style={styles.loadingDot} />
        <View style={styles.launchLoadingText}>
          <Text style={styles.launchLoadingTitle}>세션 확인 중</Text>
          <Text style={styles.launchLoadingHelper}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

function SessionExpiredScreen({
  message,
  onLoginPress,
  onSignupPress,
}: {
  message: string;
  onLoginPress: () => void;
  onSignupPress: () => void;
}) {
  return (
    <View style={styles.onboardingFrame}>
      <OnboardingHeader title="세션 만료" />
      <View style={styles.centerStateCard}>
        <View style={styles.centerStateIcon}>
          <Text style={styles.centerStateIconText}>!</Text>
        </View>
        <Text style={styles.centerStateTitle}>다시 로그인해 주세요</Text>
        <Text style={styles.centerStateMessage}>{message}</Text>
        <View style={styles.sessionExpiredActions}>
          <AuthButton
            accessibilityLabel="세션 만료 후 회원가입 화면으로 이동"
            onPress={onSignupPress}
            variant="secondary">
            회원가입
          </AuthButton>
          <AuthButton
            accessibilityLabel="세션 만료 후 로그인 화면으로 이동"
            onPress={onLoginPress}>
            로그인
          </AuthButton>
        </View>
      </View>
    </View>
  );
}

function NoCampusEntryScreen({
  canCreateCampus,
  onCampusCreatePress,
  onInviteCodePress,
  userName,
}: {
  canCreateCampus: boolean;
  onCampusCreatePress: () => void;
  onInviteCodePress: () => void;
  userName: string;
}) {
  return (
    <View style={styles.onboardingFrame}>
      <OnboardingHeader title="캠퍼스 참여" />
      <View style={styles.centerStateCard}>
        <View style={styles.centerStateIcon}>
          <Text style={styles.centerStateIconText}>F</Text>
        </View>
        <Text style={styles.centerStateTitle}>{userName}님, 캠퍼스에 참여해 주세요</Text>
        <Text style={styles.centerStateMessage}>
          {canCreateCampus
            ? '초대코드가 있으면 참여하고, 새 공동체를 운영하려면 캠퍼스를 만들 수 있어요.'
            : '캠퍼스 관리자에게 받은 초대코드로 참여할 수 있어요.'}
        </Text>
        <View style={styles.centerStateActions}>
          <AuthButton
            accessibilityLabel="캠퍼스 초대코드 입력 화면으로 이동"
            onPress={onInviteCodePress}
            variant={canCreateCampus ? 'secondary' : 'primary'}>
            초대코드로 참여
          </AuthButton>
          {canCreateCampus ? (
            <AuthButton
              accessibilityLabel="캠퍼스 생성 화면으로 이동"
              onPress={onCampusCreatePress}>
              새 캠퍼스 만들기
            </AuthButton>
          ) : null}
        </View>
        <Text style={styles.centerStateHelper}>
          참여 후 경건 체크, 투표, 납부 기능을 사용할 수 있어요.
        </Text>
      </View>
    </View>
  );
}

function CampusCreateGate({
  canCreateCampus,
  clearNotice,
  onCancel,
  onComplete,
  onInvitePress,
  onSessionExpired,
  user,
}: {
  canCreateCampus: boolean;
  clearNotice: () => void;
  onCancel: () => void;
  onComplete: (
    state: Extract<AuthGateState, {status: 'authenticated'}>,
    campusName: string,
  ) => void;
  onInvitePress: () => void;
  onSessionExpired: (message: string) => void;
  user: CurrentUser;
}) {
  if (!canCreateCampus) {
    return (
      <View style={styles.onboardingFrame}>
        <OnboardingHeader title="캠퍼스 만들기" />
        <View style={styles.roleGateCard}>
          <Text style={styles.roleGateTitle}>새 캠퍼스를 만들 수 없어요</Text>
          <View style={styles.roleGateChip}>
            <Text style={styles.roleGateChipText}>초대코드로 참여 가능</Text>
          </View>
          <Text style={styles.roleGateMessage}>
            캠퍼스 관리자에게 받은 초대코드를 입력해 참여해 주세요.
          </Text>
          <View style={styles.centerStateActions}>
            <AuthButton
              accessibilityLabel="캠퍼스 생성 권한 안내 닫기"
              onPress={onCancel}
              variant="secondary">
              취소
            </AuthButton>
            <AuthButton
              accessibilityLabel="권한 안내 후 초대코드 입력으로 이동"
              onPress={onInvitePress}>
              초대코드로 참여
            </AuthButton>
          </View>
        </View>
      </View>
    );
  }

  return (
    <CampusCreateForm
      clearNotice={clearNotice}
      onCancel={onCancel}
      onComplete={onComplete}
      onSessionExpired={onSessionExpired}
      user={user}
    />
  );
}

function OnboardingHeader({context, title}: {context?: string; title: string}) {
  return (
    <View style={styles.onboardingHeader}>
      <View style={styles.authBrandChip}>
        <Text style={styles.authBrandChipText}>{context ?? 'FaithLog'}</Text>
      </View>
      <Text style={styles.onboardingTitle}>{title}</Text>
    </View>
  );
}

function InviteCodeForm({
  clearNotice,
  onCancel,
  onComplete,
  onSessionExpired,
  user,
}: {
  clearNotice: () => void;
  onCancel: () => void;
  onComplete: (
    state: Extract<AuthGateState, {status: 'authenticated'}>,
    campusName: string,
  ) => void;
  onSessionExpired: (message: string) => void;
  user: CurrentUser;
}) {
  const [values, setValues] = useState<InviteCodeFormValues>({inviteCode: ''});
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<keyof InviteCodeFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) {
      return;
    }

    clearNotice();
    setFormError(null);
    const result = validateInviteCodeForm(values);
    setFieldErrors(result.fieldErrors);

    if (!result.valid) {
      return;
    }

    setSubmitting(true);
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        onSessionExpired('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        return;
      }

      const joined = await joinCampus(accessToken, result.payload);
      const nextState = await resolveAuthenticatedCampusState(
        accessToken,
        user,
        joined.campusId,
      );
      onComplete(nextState, joined.campusName);
    } catch (error) {
      await applyCampusFormError(error, {
        fallback: '초대코드로 캠퍼스에 참여하지 못했습니다.',
        onSessionExpired,
        setFieldErrors: (message) =>
          setFieldErrors((current) => ({...current, inviteCode: message})),
        setFormError,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.onboardingFrame}>
      <OnboardingHeader title="캠퍼스 참여" />
      <View style={styles.inviteIntroCard}>
        <Text style={styles.inviteIntroTitle}>초대코드를 입력해주세요</Text>
        <Text style={styles.inviteIntroBody}>
          관리자에게 받은 초대코드로 캠퍼스에 참여할 수 있어요
        </Text>
      </View>
      <TextField
        accessibilityLabel="캠퍼스 초대코드 입력"
        autoCapitalize="characters"
        error={fieldErrors.inviteCode}
        helper="영문 대문자, 숫자, 하이픈 형식으로 입력해 주세요."
        label="초대코드"
        onChangeText={(inviteCode) => setValues({inviteCode})}
        onSubmitEditing={submit}
        placeholder="BD-1CAMP-A8F2"
        returnKeyType="done"
        textContentType="none"
        value={values.inviteCode}
      />
      {formError ? <InlineError message={formError} /> : null}
      <View style={styles.onboardingActionSpacer} />
      <View style={[styles.authActionRow, styles.onboardingSubmitActions]}>
        <AuthButton
          accessibilityLabel="초대코드 입력 취소"
          disabled={submitting}
          onPress={onCancel}
          variant="secondary">
          나중에
        </AuthButton>
        <AuthButton
          accessibilityLabel="초대코드로 캠퍼스 참여"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '참여 중...' : '참여하기'}
        </AuthButton>
      </View>
    </View>
  );
}

function CampusCreateForm({
  clearNotice,
  onCancel,
  onComplete,
  onSessionExpired,
  user,
}: {
  clearNotice: () => void;
  onCancel: () => void;
  onComplete: (
    state: Extract<AuthGateState, {status: 'authenticated'}>,
    campusName: string,
  ) => void;
  onSessionExpired: (message: string) => void;
  user: CurrentUser;
}) {
  const [values, setValues] = useState<CampusCreateFormValues>({
    description: '',
    name: '',
    region: '',
  });
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<keyof CampusCreateFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) {
      return;
    }

    clearNotice();
    setFormError(null);
    const result = validateCampusCreateForm(values);
    setFieldErrors(result.fieldErrors);

    if (!result.valid) {
      return;
    }

    setSubmitting(true);
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        onSessionExpired('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        return;
      }

      const created = await createCampus(accessToken, result.payload);
      const nextState = await resolveAuthenticatedCampusState(
        accessToken,
        user,
        created.campusId,
      );
      onComplete(nextState, created.name);
    } catch (error) {
      await applyCampusFormError(error, {
        fallback: '캠퍼스를 생성하지 못했습니다.',
        onSessionExpired,
        setFormError,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.onboardingFrame}>
      <OnboardingHeader title="캠퍼스 만들기" />
      <View style={styles.roleGateCard}>
        <Text style={styles.roleGateTitle}>새 캠퍼스 시작</Text>
        <View style={styles.roleGateChip}>
          <Text style={styles.roleGateChipText}>운영 정보 입력</Text>
        </View>
      </View>
      <View style={styles.campusFormCard}>
        <Text style={styles.campusFormTitle}>새 캠퍼스 정보</Text>
        <Text style={styles.campusFormBody}>
          캠퍼스 이름과 지역을 입력하면 바로 운영을 시작할 수 있어요.
        </Text>
        <TextField
          accessibilityLabel="캠퍼스 이름 입력"
          autoCapitalize="words"
          error={fieldErrors.name}
          label="캠퍼스 이름"
          onChangeText={(name) => setValues((current) => ({...current, name}))}
          placeholder="분당 1캠"
          returnKeyType="next"
          textContentType="none"
          value={values.name}
        />
        <TextField
          accessibilityLabel="캠퍼스 지역 입력"
          autoCapitalize="words"
          error={fieldErrors.region}
          label="지역"
          onChangeText={(region) => setValues((current) => ({...current, region}))}
          placeholder="분당"
          returnKeyType="next"
          textContentType="none"
          value={values.region}
        />
        <TextField
          accessibilityLabel="캠퍼스 설명 입력"
          autoCapitalize="sentences"
          error={fieldErrors.description}
          label="설명"
          onChangeText={(description) =>
            setValues((current) => ({...current, description}))
          }
          onSubmitEditing={submit}
          placeholder="분당 대학부 1캠퍼스"
          returnKeyType="done"
          textContentType="none"
          value={values.description}
        />
        {formError ? <InlineError message={formError} /> : null}
      </View>
      <View style={styles.onboardingActionSpacer} />
      <View style={[styles.authActionRow, styles.onboardingSubmitActions]}>
        <AuthButton
          accessibilityLabel="캠퍼스 생성 취소"
          disabled={submitting}
          onPress={onCancel}
          variant="secondary">
          취소
        </AuthButton>
        <AuthButton
          accessibilityLabel="캠퍼스 생성 제출"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '생성 중...' : '생성하기'}
        </AuthButton>
      </View>
    </View>
  );
}

function LoginForm({
  clearNotice,
  onLoginComplete,
  switchToSignup,
}: {
  clearNotice: () => void;
  onLoginComplete: (state: Extract<AuthGateState, {status: 'authenticated' | 'noCampus'}>) => void;
  switchToSignup: () => void;
}) {
  const [values, setValues] = useState<LoginFormValues>({email: '', password: ''});
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<keyof LoginFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) {
      return;
    }

    clearNotice();
    setFormError(null);
    const result = validateLoginForm(values);
    setFieldErrors(result.fieldErrors);

    if (!result.valid) {
      return;
    }

    setSubmitting(true);
    try {
      const nextState = await loginAndEstablishSession(result.payload);
      onLoginComplete(nextState);
    } catch (error) {
      setFormError(getAuthFormErrorMessage(error, 'login'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.authFrame, styles.loginAuthFrame]}>
      <View style={styles.loginHero}>
        <View style={styles.authBrandChip}>
          <Text style={styles.authBrandChipText}>FaithLog</Text>
        </View>
        <Text style={styles.loginBrandTitle}>로그인</Text>
      </View>
      <Text style={styles.loginSubtitle}>경건생활과 공동체 운영을 가볍게 관리해요</Text>
      <AuthTextField
        accessibilityLabel="로그인 이메일 입력"
        error={fieldErrors.email}
        keyboardType="email-address"
        label="이메일"
        onChangeText={(email) => setValues((current) => ({...current, email}))}
        placeholder="faithlog.user@example.test"
        returnKeyType="next"
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
        returnKeyType="done"
        secureTextEntry
        textContentType="password"
        value={values.password}
      />
      {formError ? <InlineError message={formError} /> : null}
      <View style={styles.authActionSpacer} />
      <View style={styles.authActionRow}>
        <AuthButton
          accessibilityLabel="로그인 제출"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '로그인 중...' : '로그인'}
        </AuthButton>
        <AuthButton
          accessibilityLabel="회원가입 화면으로 이동"
          disabled={submitting}
          onPress={switchToSignup}
          variant="secondary">
          회원가입
        </AuthButton>
      </View>
      <Text style={styles.authFootnote}>초대코드는 회원가입 후 입력할 수 있어요</Text>
    </View>
  );
}

function SignupForm({
  clearNotice,
  onSignupComplete,
  switchToLogin,
}: {
  clearNotice: () => void;
  onSignupComplete: (name: string) => void;
  switchToLogin: () => void;
}) {
  const [values, setValues] = useState<SignupFormValues>({
    email: '',
    name: '',
    password: '',
    passwordConfirm: '',
  });
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors<keyof SignupFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) {
      return;
    }

    clearNotice();
    setFormError(null);
    const result = validateSignupForm(values);
    setFieldErrors(result.fieldErrors);

    if (!result.valid) {
      return;
    }

    setSubmitting(true);
    try {
      const user = await signupUser(result.payload);
      onSignupComplete(user.name);
    } catch (error) {
      if (error instanceof FaithLogApiError && error.detail.kind === 'conflict') {
        setFieldErrors((current) => ({
          ...current,
          email: '이미 가입된 이메일입니다.',
        }));
        setFormError(null);
      } else {
        setFormError(getAuthFormErrorMessage(error, 'signup'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.authFrame, styles.signupAuthFrame]}>
      <View style={styles.signupHeader}>
        <View style={styles.authBrandChip}>
          <Text style={styles.authBrandChipText}>FaithLog</Text>
        </View>
        <Text style={styles.signupTitle}>회원가입</Text>
      </View>
      <AuthTextField
        accessibilityLabel="회원가입 이름 입력"
        autoCapitalize="words"
        error={fieldErrors.name}
        label="이름"
        onChangeText={(name) => setValues((current) => ({...current, name}))}
        placeholder="샘플 사용자"
        returnKeyType="next"
        textContentType="name"
        value={values.name}
      />
      <AuthTextField
        accessibilityLabel="회원가입 이메일 입력"
        error={fieldErrors.email}
        keyboardType="email-address"
        label="이메일"
        onChangeText={(email) => setValues((current) => ({...current, email}))}
        placeholder="new.user@example.test"
        returnKeyType="next"
        textContentType="emailAddress"
        value={values.email}
      />
      <AuthTextField
        accessibilityLabel="회원가입 비밀번호 입력"
        error={fieldErrors.password}
        label="비밀번호"
        onChangeText={(password) => setValues((current) => ({...current, password}))}
        placeholder="8자 이상 입력"
        returnKeyType="next"
        secureTextEntry
        textContentType="newPassword"
        value={values.password}
      />
      <AuthTextField
        accessibilityLabel="회원가입 비밀번호 확인 입력"
        error={fieldErrors.passwordConfirm}
        label="비밀번호 확인"
        onChangeText={(passwordConfirm) =>
          setValues((current) => ({...current, passwordConfirm}))
        }
        onSubmitEditing={submit}
        placeholder="8자 이상 다시 입력"
        returnKeyType="done"
        secureTextEntry
        textContentType="newPassword"
        value={values.passwordConfirm}
      />
      {formError ? <InlineError message={formError} /> : null}
      <View style={styles.authActionSpacer} />
      <View style={[styles.authActionRow, styles.signupAuthActionRow]}>
        <AuthButton
          accessibilityLabel="회원가입 제출"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '가입 중...' : '가입 완료'}
        </AuthButton>
        <AuthButton
          accessibilityLabel="로그인 화면으로 이동"
          disabled={submitting}
          onPress={switchToLogin}>
          로그인
        </AuthButton>
      </View>
    </View>
  );
}

function AuthTextField({
  accessibilityLabel,
  autoCapitalize = 'none',
  error,
  keyboardType = 'default',
  label,
  onChangeText,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  secureTextEntry = false,
  textContentType,
  value,
}: {
  accessibilityLabel: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string | undefined;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  placeholder: string;
  returnKeyType?: ReturnKeyTypeOptions;
  secureTextEntry?: boolean;
  textContentType?: 'emailAddress' | 'name' | 'newPassword' | 'password' | 'none' | undefined;
  value: string;
}) {
  return (
    <View style={styles.authField}>
      <Text style={styles.authFieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={authColors.text}
        returnKeyType={returnKeyType}
        secureTextEntry={secureTextEntry}
        style={[styles.authInput, error ? styles.authInputError : null]}
        textContentType={textContentType}
        value={value}
      />
      {error ? <Text style={styles.authFieldError}>{error}</Text> : null}
    </View>
  );
}

function AuthButton({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  variant = 'primary',
}: PropsWithChildren<{
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}>) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.authButton,
        variant === 'primary' ? styles.authButtonPrimary : styles.authButtonSecondary,
        disabled ? styles.authButtonDisabled : null,
        pressed ? styles.authButtonPressed : null,
      ]}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[
          styles.authButtonText,
          variant === 'primary' ? styles.authButtonTextPrimary : styles.authButtonTextSecondary,
        ]}>
        {children}
      </Text>
    </Pressable>
  );
}

function InlineError({message}: {message: string}) {
  return (
    <View accessibilityRole="alert" style={styles.inlineError}>
      <Text style={styles.inlineErrorText}>{message}</Text>
    </View>
  );
}

async function resolveAuthenticatedCampusState(
  accessToken: string,
  fallbackUser: CurrentUser,
  preferredCampusId: number,
): Promise<Extract<AuthGateState, {status: 'authenticated'}>> {
  const [user, campuses] = await Promise.all([
    fetchCurrentUser(accessToken).catch(() => fallbackUser),
    fetchMyCampuses(accessToken),
  ]);
  const activeCampuses = campuses.filter((campus) => campus.status === 'ACTIVE');
  const selectedCampus =
    activeCampuses.find((campus) => campus.campusId === preferredCampusId) ??
    activeCampuses[0];

  if (!selectedCampus) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '캠퍼스 참여 후 ACTIVE 캠퍼스 목록을 확인하지 못했습니다.',
    });
  }

  await saveSelectedCampusId(selectedCampus.campusId);

  return {
    status: 'authenticated',
    user,
    activeCampuses,
    selectedCampus,
  };
}

async function refreshAuthenticatedCampusState(
  accessToken: string,
  current: Extract<AuthGateState, {status: 'authenticated'}>,
  preferredCampusId = current.selectedCampus.campusId,
): Promise<Extract<AuthGateState, {status: 'authenticated' | 'noCampus'}>> {
  const [user, campuses] = await Promise.all([
    fetchCurrentUser(accessToken).catch(() => current.user),
    fetchMyCampuses(accessToken),
  ]);
  const activeCampuses = campuses.filter((campus) => campus.status === 'ACTIVE');

  if (activeCampuses.length === 0) {
    return {status: 'noCampus', user};
  }

  const selectedCampus =
    activeCampuses.find((campus) => campus.campusId === preferredCampusId) ??
    activeCampuses.find((campus) => campus.campusId === current.selectedCampus.campusId) ??
    activeCampuses[0]!;

  await saveSelectedCampusId(selectedCampus.campusId);

  return {
    status: 'authenticated',
    user,
    activeCampuses,
    selectedCampus,
  };
}

async function applyCampusFormError(
  error: unknown,
  options: {
    fallback: string;
    onSessionExpired: (message: string) => void;
    setFieldErrors?: (message: string) => void;
    setFormError: (message: string | null) => void;
  },
) {
  if (error instanceof FaithLogApiError) {
    if (error.detail.kind === 'sessionExpired') {
      await clearTokens();
      options.setFormError(null);
      options.onSessionExpired(error.detail.message);
      return;
    }

    const message = getCampusActionErrorMessage(error.detail, options.fallback);

    if (
      options.setFieldErrors &&
      (error.detail.code === 'CAMPUS_INVALID_INVITE_CODE' || error.detail.status === 404)
    ) {
      options.setFieldErrors(message);
      options.setFormError(null);
      return;
    }

    options.setFormError(message);
    return;
  }

  options.setFormError(options.fallback);
}

function getCampusActionErrorMessage(error: ApiError, fallback: string) {
  if (error.kind === 'conflict' && error.code === 'CAMPUS_ALREADY_JOINED') {
    return '이미 참여 중인 캠퍼스입니다.';
  }

  return getApiErrorPresentation(error, {
    conflictMessage: '이미 처리된 요청입니다. 캠퍼스 목록을 다시 확인해 주세요.',
    defaultMessage: fallback,
    permissionMessage: '캠퍼스 생성 또는 참여 권한이 없습니다.',
  }).message;
}

function canCreateCampusWithRole(role: UserRole) {
  return role === 'MANAGER' || role === 'ADMIN';
}

function getAuthFormErrorMessage(error: unknown, context: 'login' | 'signup') {
  if (error instanceof FaithLogApiError) {
    return getApiErrorMessage(error.detail, context);
  }

  return '요청 중 알 수 없는 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

function getApiErrorMessage(error: ApiError, context: 'login' | 'signup') {
  switch (error.kind) {
    case 'sessionExpired':
      return context === 'login'
        ? '이메일 또는 비밀번호를 다시 확인해 주세요.'
        : '인증 세션이 만료되었습니다. 다시 시도해 주세요.';
    case 'permissionDenied':
      return '권한이 없어 요청을 완료하지 못했습니다.';
    case 'conflict':
      return context === 'signup'
        ? '이미 사용 중인 회원 정보가 있습니다.'
        : getApiErrorPresentation(error).message;
    case 'offline':
      return getApiErrorPresentation(error).message;
    case 'error':
      return getApiErrorPresentation(error).message;
    default:
      return assertNever(error.kind);
  }
}

type StatusCardProps = {
  eyebrow: string;
  title: string;
  message: string;
  primaryLabel: string;
  primaryAccessibilityLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel?: string;
  secondaryAccessibilityLabel?: string;
  onSecondaryPress?: () => void;
  tone?: 'default' | 'danger';
};

function StatusCard({
  eyebrow,
  message,
  onPrimaryPress,
  onSecondaryPress,
  primaryAccessibilityLabel,
  primaryLabel,
  secondaryAccessibilityLabel,
  secondaryLabel,
  title,
  tone = 'default',
}: StatusCardProps) {
  return (
    <Card>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Title>{title}</Title>
      <Body>{message}</Body>
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel={primaryAccessibilityLabel}
          onPress={onPrimaryPress}
          variant={tone === 'danger' ? 'danger' : 'primary'}>
          {primaryLabel}
        </Button>
        {secondaryLabel && secondaryAccessibilityLabel && onSecondaryPress ? (
          <Button
            accessibilityLabel={secondaryAccessibilityLabel}
            onPress={onSecondaryPress}
            variant="secondary">
            {secondaryLabel}
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

function AuthenticatedShell({
  entryTarget,
  openEntryTarget,
  route,
  setAuthState,
  setNotice,
  setRoute,
  state,
}: {
  entryTarget: EntryTarget | null;
  openEntryTarget: (target: EntryTarget | null) => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: AppMessage) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
  route: ShellRoute;
  setRoute: (route: ShellRoute) => void;
}) {
  const [userHomeView, setUserHomeView] = useState<'dashboard' | 'monthlyCalendar'>('dashboard');
  const [profileView, setProfileView] = useState<'coffee' | 'main' | 'notifications'>('main');
  const [prayerEntryMode, setPrayerEntryMode] = useState<PrayerEntryMode>('groups');
  const [devotionInitialDate, setDevotionInitialDate] = useState<string | null>(null);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [campusSwitchVisible, setCampusSwitchVisible] = useState(false);
  const [campusSwitchLoading, setCampusSwitchLoading] = useState(false);
  const [campusSwitchError, setCampusSwitchError] = useState<ApiError | null>(null);
  const [adminModeSelectorVisible, setAdminModeSelectorVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [selectedCampusDetail, setSelectedCampusDetail] = useState<CampusDetail | null>(null);
  const [campusDetailState, setCampusDetailState] = useState<CardState<CampusDetail>>({
    status: 'idle',
  });
  const canCreateCampus = canCreateCampusWithRole(state.user.role);
  const canManageCampuses = canCreateCampus;
  const adminModeRoutes = useMemo(
    () => getAdminModeRoutes(state.user, state.selectedCampus),
    [state.selectedCampus, state.user],
  );
  const navItems = useMemo(
    () =>
      USER_BOTTOM_NAV_ROUTES.map((availableRoute) => ({
        accessibilityLabel: `${getRouteLabel(availableRoute)} 탭으로 이동`,
        icon: getRouteIcon(availableRoute),
        id: availableRoute,
        label: getRouteLabel(availableRoute),
      })),
    [],
  );
  const shouldShowUserBottomNav =
    entryTarget === null &&
    (USER_BOTTOM_NAV_ROUTES.some((availableRoute) => availableRoute === route) ||
      route === 'prayers');
  const userBottomNavActiveId = route === 'prayers' ? 'userHome' : route;
  const isAdminRoute = route === 'campusAdmin' || route === 'serviceAdmin';

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const openPrayers = (entryMode: PrayerEntryMode) => {
    setPrayerEntryMode(entryMode);
    setRoute('prayers');
  };

  const refreshCampuses = async () => {
    if (campusSwitchLoading) {
      return;
    }

    setCampusSwitchLoading(true);
    setCampusSwitchError(null);
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        setAuthState({
          status: 'sessionExpired',
          message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        });
        return;
      }

      const nextState = await refreshAuthenticatedCampusState(accessToken, state);
      setAuthState(nextState);
    } catch (error) {
      if (error instanceof FaithLogApiError) {
        setCampusSwitchError(error.detail);
        if (error.detail.kind === 'sessionExpired') {
          setAuthState({status: 'sessionExpired', message: error.detail.message});
        }
      } else {
        setCampusSwitchError({kind: 'error', message: '캠퍼스 목록을 불러오지 못했습니다.'});
      }
    } finally {
      setCampusSwitchLoading(false);
    }
  };

  const openCampusSwitch = () => {
    if (!canManageCampuses) {
      return;
    }

    setCampusSwitchVisible(true);
    void refreshCampuses();
  };

  const selectCampus = async (campus: CampusMembershipSummary) => {
    if (campusSwitchLoading || campus.campusId === state.selectedCampus.campusId) {
      setCampusSwitchVisible(false);
      return;
    }

    setCampusSwitchLoading(true);
    setCampusSwitchError(null);
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        setAuthState({
          status: 'sessionExpired',
          message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        });
        return;
      }

      const detail = await fetchCampusDetail(accessToken, campus.campusId);
      const nextState = await refreshAuthenticatedCampusState(accessToken, state, campus.campusId);

      if (nextState.status === 'noCampus') {
        setAuthState(nextState);
        setCampusSwitchVisible(false);
        return;
      }

      setSelectedCampusDetail(detail);
      setCampusDetailState({status: 'success', data: detail});
      setAuthState(nextState);
      setCampusSwitchVisible(false);
      setUserHomeView('dashboard');
      setProfileView('main');
      setRoute('userHome');
    } catch (error) {
      if (error instanceof FaithLogApiError) {
        setCampusSwitchError(error.detail);
        if (error.detail.kind === 'sessionExpired') {
          setAuthState({status: 'sessionExpired', message: error.detail.message});
        }
      } else {
        setCampusSwitchError({kind: 'error', message: '캠퍼스를 변경하지 못했습니다.'});
      }
    } finally {
      setCampusSwitchLoading(false);
    }
  };

  const completeLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    await logoutCurrentSession();
    setLoggingOut(false);
    setLogoutConfirmVisible(false);
    setRoute('userHome');
    setAuthState({status: 'signedOut'});
  };

  const selectRoute = (nextRoute: ShellRoute) => {
    openEntryTarget(null);
    setAdminModeSelectorVisible(false);

    if (nextRoute === 'devotion') {
      setDevotionInitialDate(null);
    }

    if (nextRoute === 'userHome') {
      setUserHomeView('dashboard');
    }

    if (nextRoute === 'profile') {
      setProfileView('main');
    }

    setRoute(nextRoute);
  };

  const enterAdminMode = (nextRoute: AdminModeRoute) => {
    openEntryTarget(null);
    setAdminModeSelectorVisible(false);
    setUserHomeView('dashboard');
    setProfileView('main');
    setRoute(nextRoute);
  };

  const openAdminMode = () => {
    if (adminModeRoutes.length === 0) {
      return;
    }

    if (adminModeRoutes.length === 1) {
      enterAdminMode(adminModeRoutes[0]!);
      return;
    }

    setAdminModeSelectorVisible(true);
  };

  const returnToUserMode = () => {
    openEntryTarget(null);
    setAdminModeSelectorVisible(false);
    setUserHomeView('dashboard');
    setProfileView('main');
    setRoute('userHome');
  };

  const refreshCampusDetail = async () => {
    setCampusDetailState({status: 'loading'});
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        setAuthState({
          status: 'sessionExpired',
          message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        });
        return;
      }

      const detail = await fetchCampusDetail(accessToken, state.selectedCampus.campusId);
      setSelectedCampusDetail(detail);
      setCampusDetailState({status: 'success', data: detail});
    } catch (error) {
      const apiError = toApiError(error, '캠퍼스 상세를 불러오지 못했습니다.');
      setCampusDetailState({status: 'error', error: apiError});

      if (apiError.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: apiError.message});
      }
    }
  };

  const selectCampusForOnboarding = async (campus: CampusMembershipSummary) => {
    if (campusSwitchLoading) {
      return;
    }

    setCampusSwitchLoading(true);
    setCampusSwitchError(null);
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        setAuthState({
          status: 'sessionExpired',
          message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        });
        return;
      }

      const detail = await fetchCampusDetail(accessToken, campus.campusId);
      const nextState = await refreshAuthenticatedCampusState(accessToken, state, campus.campusId);

      if (nextState.status === 'noCampus') {
        setAuthState(nextState);
        openEntryTarget(null);
        return;
      }

      setSelectedCampusDetail(detail);
      setCampusDetailState({status: 'success', data: detail});
      setAuthState(nextState);
      openEntryTarget(null);
      setUserHomeView('dashboard');
      setProfileView('main');
      setRoute('userHome');
    } catch (error) {
      const apiError = toApiError(error, '캠퍼스를 선택하지 못했습니다.');
      setCampusSwitchError(apiError);

      if (apiError.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: apiError.message});
      }
    } finally {
      setCampusSwitchLoading(false);
    }
  };

  const completeAuthenticatedOnboarding = () => {
    openEntryTarget(null);
    setRoute('userHome');
  };

  const openNotificationSettings = () => {
    setProfileView('notifications');
    setRoute('profile');
  };

  useEffect(() => {
    let active = true;

    if (entryTarget !== 'campusDetail') {
      return undefined;
    }

    if (selectedCampusDetail?.campusId === state.selectedCampus.campusId) {
      setCampusDetailState({status: 'success', data: selectedCampusDetail});
      return undefined;
    }

    setCampusDetailState({status: 'loading'});
    void getStoredTokens()
      .then(({accessToken}) => {
        if (!accessToken) {
          setAuthState({
            status: 'sessionExpired',
            message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
          });
          return null;
        }

        return fetchCampusDetail(accessToken, state.selectedCampus.campusId);
      })
      .then((detail) => {
        if (!active || !detail) {
          return;
        }

        setSelectedCampusDetail(detail);
        setCampusDetailState({status: 'success', data: detail});
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        const apiError = toApiError(error, '캠퍼스 상세를 불러오지 못했습니다.');
        setCampusDetailState({status: 'error', error: apiError});

        if (apiError.kind === 'sessionExpired') {
          setAuthState({status: 'sessionExpired', message: apiError.message});
        }
      });

    return () => {
      active = false;
    };
  }, [entryTarget, selectedCampusDetail, setAuthState, state.selectedCampus.campusId]);

  return (
    <View style={styles.shell}>
      {isAdminRoute ? (
        route === 'campusAdmin' ? (
          <AdminScreen
            onBackToUserMode={returnToUserMode}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : (
          <ServiceAdminScreen
            onBackToUserMode={returnToUserMode}
            onLogoutPress={() => setLogoutConfirmVisible(true)}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        )
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.shellContent,
            keyboardVisible ? styles.shellContentKeyboardOpen : null,
          ]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.shellScroll}>
        {entryTarget === 'campusSelect' && canManageCampuses ? (
          <CampusSelectScreen
            canOpenAdminMode={adminModeRoutes.length > 0}
            campuses={state.activeCampuses}
            canCreateCampus={canCreateCampus}
            currentCampusId={state.selectedCampus.campusId}
            error={campusSwitchError}
            headerContextLabel={`${state.user.name}님`}
            loading={campusSwitchLoading}
            onOpenAdminMode={openAdminMode}
            onOpenNotifications={openNotificationSettings}
            onCampusCreatePress={() => openEntryTarget('campusCreate')}
            onInviteCodePress={() => openEntryTarget('inviteCode')}
            onRefresh={refreshCampuses}
            onSelect={selectCampusForOnboarding}
          />
        ) : entryTarget === 'campusDetail' && canManageCampuses ? (
          <CampusDetailScreen
            canOpenAdminMode={adminModeRoutes.length > 0}
            detailState={campusDetailState}
            headerContextLabel={`${state.user.name}님`}
            onContinue={completeAuthenticatedOnboarding}
            onInviteCodePress={() => openEntryTarget('inviteCode')}
            onOpenAdminMode={openAdminMode}
            onOpenNotifications={openNotificationSettings}
            onRefresh={refreshCampusDetail}
            selectedCampus={state.selectedCampus}
          />
        ) : entryTarget === 'inviteCode' ? (
          <InviteCodeForm
            clearNotice={() => {}}
            onCancel={() => openEntryTarget(null)}
            onComplete={(nextState, _campusName) => {
              setAuthState(nextState);
              openEntryTarget(null);
              setUserHomeView('dashboard');
              setProfileView('main');
              setRoute('userHome');
            }}
            onSessionExpired={(message) => setAuthState({status: 'sessionExpired', message})}
            user={state.user}
          />
        ) : entryTarget === 'campusCreate' && canCreateCampus ? (
          <CampusCreateGate
            canCreateCampus={canCreateCampus}
            clearNotice={() => {}}
            onCancel={() => openEntryTarget(null)}
            onComplete={(nextState, _campusName) => {
              setAuthState(nextState);
              openEntryTarget(null);
              setUserHomeView('dashboard');
              setProfileView('main');
              setRoute('userHome');
            }}
            onInvitePress={() => openEntryTarget('inviteCode')}
            onSessionExpired={(message) => setAuthState({status: 'sessionExpired', message})}
            user={state.user}
          />
        ) : route === 'userHome' ? (
          userHomeView === 'monthlyCalendar' ? (
            <MonthlyCalendarScreen
              canOpenAdminMode={adminModeRoutes.length > 0}
              onOpenWeeklyDevotion={(selectedDate) => {
                setDevotionInitialDate(selectedDate);
                setRoute('devotion');
              }}
              onOpenAdminMode={openAdminMode}
              onOpenNotifications={openNotificationSettings}
              setAuthState={setAuthState}
              state={state}
            />
          ) : (
            <UserHomeDashboard
              onOpenDevotion={() => {
                setDevotionInitialDate(null);
                setRoute('devotion');
              }}
              onOpenMonthlyCalendar={() => setUserHomeView('monthlyCalendar')}
              onOpenNotifications={openNotificationSettings}
              canOpenAdminMode={adminModeRoutes.length > 0}
              onOpenAdminMode={openAdminMode}
              onOpenPayments={() => setRoute('payments')}
              onOpenPrayers={openPrayers}
              setAuthState={setAuthState}
              state={state}
            />
          )
        ) : route === 'devotion' ? (
          <DevotionScreen
            canOpenAdminMode={adminModeRoutes.length > 0}
            initialSelectedDate={devotionInitialDate}
            onBackToHome={() => {
              setUserHomeView('dashboard');
              setRoute('userHome');
            }}
            onOpenAdminMode={openAdminMode}
            onOpenNotifications={openNotificationSettings}
            onOpenPayments={() => setRoute('payments')}
            setAuthState={setAuthState}
            state={state}
          />
        ) : route === 'payments' ? (
          <PaymentScreen
            canOpenAdminMode={adminModeRoutes.length > 0}
            onOpenAdminMode={openAdminMode}
            onOpenNotifications={openNotificationSettings}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : route === 'polls' ? (
          <PollScreen
            canOpenAdminMode={adminModeRoutes.length > 0}
            onOpenAdminMode={openAdminMode}
            onOpenNotifications={openNotificationSettings}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : route === 'prayers' ? (
          <PrayerScreen
            canOpenAdminMode={adminModeRoutes.length > 0}
            entryMode={prayerEntryMode}
            onOpenAdminMode={openAdminMode}
            onOpenNotifications={openNotificationSettings}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : route === 'profile' ? (
          <ProfileScreen
            canOpenAdminMode={adminModeRoutes.length > 0}
            onCampusSwitchPress={openCampusSwitch}
            canSwitchCampus={canManageCampuses}
            onBackToProfile={() => setProfileView('main')}
            onLogoutPress={() => setLogoutConfirmVisible(true)}
            onInviteCodePress={() => openEntryTarget('inviteCode')}
            onOpenAdminMode={openAdminMode}
            onOpenCoffeeDuty={() => setProfileView('coffee')}
            onOpenNotifications={() => setProfileView('notifications')}
            profileView={profileView}
            setAuthState={setAuthState}
            state={state}
          />
        ) : route === 'campusAdmin' ? (
          <AdminScreen
            onBackToUserMode={returnToUserMode}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : route === 'serviceAdmin' ? (
          <ServiceAdminScreen
            onBackToUserMode={returnToUserMode}
            onLogoutPress={() => setLogoutConfirmVisible(true)}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : (
          <RoutePlaceholder
            activeCampusCount={state.activeCampuses.length}
            route={route}
            selectedCampusDetail={selectedCampusDetail}
            state={state}
            onCampusSwitchPress={openCampusSwitch}
          />
        )}

        {route === 'profile' ||
        route === 'userHome' ||
        route === 'devotion' ||
        route === 'payments' ||
        route === 'polls' ||
        route === 'prayers' ||
        route === 'campusAdmin' ||
        route === 'serviceAdmin' ? null : (
          <Card>
            <Eyebrow>{getRouteLabel(route)}</Eyebrow>
            <Title>{getRouteTitle(route)}</Title>
            <Body>{getRouteDescription(route, state.activeCampuses.length)}</Body>
          </Card>
        )}
        </ScrollView>
      )}

      {shouldShowUserBottomNav ? (
        <View style={styles.bottomNavFrame}>
          <BottomNav activeId={userBottomNavActiveId} items={navItems} onSelect={selectRoute} />
        </View>
      ) : null}

      <LogoutConfirmSheet
        loading={loggingOut}
        onCancel={() => setLogoutConfirmVisible(false)}
        onConfirm={completeLogout}
        visible={logoutConfirmVisible}
      />
      <CampusSwitchSheet
        campuses={state.activeCampuses}
        canCreateCampus={canCreateCampus}
        currentCampusId={state.selectedCampus.campusId}
        error={campusSwitchError}
        loading={campusSwitchLoading}
        onCancel={() => setCampusSwitchVisible(false)}
        onCampusCreatePress={() => {
          setCampusSwitchVisible(false);
          openEntryTarget('campusCreate');
        }}
        onRefresh={refreshCampuses}
        onSelect={selectCampus}
        visible={canManageCampuses && campusSwitchVisible}
      />
      <AdminModeSelectorSheet
        onCancel={() => setAdminModeSelectorVisible(false)}
        onSelect={enterAdminMode}
        routes={adminModeRoutes}
        visible={adminModeSelectorVisible}
      />
    </View>
  );
}

function CampusSelectScreen({
  canOpenAdminMode,
  campuses,
  canCreateCampus,
  currentCampusId,
  error,
  headerContextLabel,
  loading,
  onOpenAdminMode,
  onOpenNotifications,
  onCampusCreatePress,
  onInviteCodePress,
  onRefresh,
  onSelect,
}: {
  canOpenAdminMode: boolean;
  campuses: CampusMembershipSummary[];
  canCreateCampus: boolean;
  currentCampusId: number;
  error: ApiError | null;
  headerContextLabel: string;
  loading: boolean;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
  onCampusCreatePress: () => void;
  onInviteCodePress: () => void;
  onRefresh: () => void;
  onSelect: (campus: CampusMembershipSummary) => void;
}) {
  return (
    <View style={styles.userFrame}>
      <View style={styles.figmaHeader}>
        <FaithLogHeaderTopRow
          campusLabel={getCampusSelectContext(campuses, currentCampusId)}
          contextLabel={headerContextLabel}>
          <FaithLogHeaderIconButton
            accessibilityLabel="알림 설정 화면으로 이동"
            badge
            iconName="bell"
            onPress={onOpenNotifications}
          />
          {canOpenAdminMode ? (
            <FaithLogHeaderPillButton
              accessibilityLabel="관리자 영역 선택"
              label="관리자"
              onPress={onOpenAdminMode}
              showChevron
            />
          ) : null}
        </FaithLogHeaderTopRow>
        <Text style={styles.figmaTitle}>캠퍼스 선택</Text>
      </View>

      <View style={styles.campusSummaryCard}>
        <Text style={styles.campusSummaryTitle}>내 캠퍼스</Text>
        <Text style={styles.campusSummaryBody}>참여 중인 캠퍼스를 선택해 이동하세요.</Text>
      </View>

      {error ? <InlineError message={getCampusSwitchErrorMessage(error)} /> : null}
      <View style={styles.campusList}>
        {campuses.length > 0 ? (
          campuses.map((campus) => {
            const selected = campus.campusId === currentCampusId;

            return (
              <ListRow
                accessibilityLabel={`${campus.campusName} 캠퍼스 선택`}
                key={campus.membershipId}
                label={campus.campusName}
                onPress={() => onSelect(campus)}
                supportingText={`${campus.campusRole} · ${campus.status}`}
                value={selected ? '현재' : '선택'}
              />
            );
          })
        ) : (
          <Empty
            title="아직 참여한 캠퍼스가 없어요"
            message={
              canCreateCampus
                ? '초대코드로 참여하거나 새 캠퍼스를 만들 수 있어요.'
                : '초대코드로 캠퍼스에 참여할 수 있어요.'
            }
            actionLabel="목록 갱신"
            actionAccessibilityLabel="내 캠퍼스 목록 다시 불러오기"
            onActionPress={onRefresh}
          />
        )}
      </View>

      <View style={styles.userActionSpacer} />
      <View style={styles.authActionRow}>
        <AuthButton
          accessibilityLabel="초대코드 입력 화면으로 이동"
          disabled={loading}
          onPress={onInviteCodePress}
          variant={canCreateCampus ? 'secondary' : 'primary'}>
          초대코드로 참여
        </AuthButton>
        {canCreateCampus ? (
          <AuthButton
            accessibilityLabel="캠퍼스 만들기 화면으로 이동"
            disabled={loading}
            onPress={onCampusCreatePress}>
            새 캠퍼스 만들기
          </AuthButton>
        ) : null}
      </View>
      {loading ? <Body>캠퍼스 목록을 불러오고 있어요.</Body> : null}
    </View>
  );
}

function CampusDetailScreen({
  canOpenAdminMode,
  detailState,
  headerContextLabel,
  onContinue,
  onInviteCodePress,
  onOpenAdminMode,
  onOpenNotifications,
  onRefresh,
  selectedCampus,
}: {
  canOpenAdminMode: boolean;
  detailState: CardState<CampusDetail>;
  headerContextLabel: string;
  onContinue: () => void;
  onInviteCodePress: () => void;
  onOpenAdminMode: () => void;
  onOpenNotifications: () => void;
  onRefresh: () => void;
  selectedCampus: CampusMembershipSummary;
}) {
  const detail = detailState.status === 'success' ? detailState.data : null;
  const title = detail?.name ?? selectedCampus.campusName;
  const role = detail?.myCampusRole ?? selectedCampus.campusRole;
  const status = detail?.membershipStatus ?? selectedCampus.status;
  const inviteCodeMessage = detail?.inviteCode
    ? '관리 권한으로 초대코드를 확인할 수 있어요.'
    : '일반 멤버는 초대코드를 볼 수 없어요.';

  return (
    <View style={styles.userFrame}>
      <View style={styles.figmaHeader}>
        <FaithLogHeaderTopRow
          campusLabel={selectedCampus.campusName}
          contextLabel={headerContextLabel}>
          <FaithLogHeaderIconButton
            accessibilityLabel="알림 설정 화면으로 이동"
            badge
            iconName="bell"
            onPress={onOpenNotifications}
          />
          {canOpenAdminMode ? (
            <FaithLogHeaderPillButton
              accessibilityLabel="관리자 영역 선택"
              label="관리자"
              onPress={onOpenAdminMode}
              showChevron
            />
          ) : null}
        </FaithLogHeaderTopRow>
        <Text style={styles.figmaTitle}>캠퍼스 상세</Text>
      </View>

      <View style={styles.campusDetailCard}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.campusDetailTitle}>
          {title}
        </Text>
        <Text style={styles.campusDetailMeta}>
          {role} · {status}
        </Text>
        <Text style={styles.campusDetailHelper}>{inviteCodeMessage}</Text>
      </View>

      {detailState.status === 'loading' || detailState.status === 'idle' ? (
        <Loading message="캠퍼스 상세를 불러오고 있어요." />
      ) : null}
      {detailState.status === 'error' ? (
        <ErrorState
          title="캠퍼스 상세를 불러오지 못했어요"
          message={getCampusSwitchErrorMessage(detailState.error)}
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="캠퍼스 상세 다시 불러오기"
          onActionPress={onRefresh}
        />
      ) : null}

      <View style={styles.profileRowList}>
        <ListRow
          accessibilityLabel="멤버십 상태 보기"
          label="멤버십 상태"
          supportingText="내 역할과 소속 상태 확인"
          value="보기"
        />
        <ListRow
          accessibilityLabel="다른 캠퍼스 초대코드 입력"
          label="다른 캠퍼스 참여"
          onPress={onInviteCodePress}
          supportingText="초대코드로 추가 가입"
          value="입력"
        />
      </View>

      <View style={styles.userActionSpacer} />
      <Button
        accessibilityLabel="캠퍼스 상세 확인 후 앱 홈으로 이동"
        onPress={onContinue}>
        앱 시작하기
      </Button>
    </View>
  );
}

function UserHomeDashboard({
  canOpenAdminMode,
  onOpenAdminMode,
  onOpenDevotion,
  onOpenMonthlyCalendar,
  onOpenNotifications,
  onOpenPayments,
  onOpenPrayers,
  setAuthState,
  state,
}: {
  canOpenAdminMode: boolean;
  onOpenAdminMode: () => void;
  onOpenDevotion: () => void;
  onOpenMonthlyCalendar: () => void;
  onOpenNotifications: () => void;
  onOpenPayments: () => void;
  onOpenPrayers: (entryMode: PrayerEntryMode) => void;
  setAuthState: (state: AuthGateState) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
}) {
  const [today, setToday] = useState(() => new Date());
  const weekStartDate = useMemo(() => getWeekStartDate(today), [today]);
  const {month, year} = useMemo(() => getYearMonth(today), [today]);
  const campusId = state.selectedCampus.campusId;
  const [monthlyDevotionState, setMonthlyDevotionState] = useState<
    CardState<DevotionMonthlySummary>
  >({status: 'idle'});
  const [chargeState, setChargeState] = useState<CardState<ChargeSummary>>({status: 'idle'});
  const [prayerState, setPrayerState] = useState<CardState<PrayerWeekSummary>>({status: 'idle'});
  const displayUserName = getCompactDisplayName(state.user.name, '사용자');
  const campusLabel = getHeaderCampusName(state.selectedCampus.campusName);

  const runCardRequest = async <T,>(
    key: HomeCardKey,
    setCardState: (cardState: CardState<T>) => void,
    request: (accessToken: string) => Promise<T>,
  ) => {
    setCardState({status: 'loading'});
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        const error: ApiError = {
          kind: 'sessionExpired',
          message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        };
        setCardState({status: 'error', error});
        setAuthState({status: 'sessionExpired', message: error.message});
        return;
      }

      const data = await request(accessToken);
      setCardState({status: 'success', data});
    } catch (error) {
      const apiError = toApiError(error, getHomeCardFallbackMessage(key));
      setCardState({status: 'error', error: apiError});

      if (apiError.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: apiError.message});
      }
    }
  };

  const loadMonthlyDevotion = () =>
    runCardRequest('devotion', setMonthlyDevotionState, (accessToken) =>
      fetchDevotionMonthlySummary(accessToken, campusId, {month, year}),
    );
  const loadCharges = () =>
    runCardRequest('charges', setChargeState, (accessToken) =>
      fetchChargeSummary(accessToken, campusId, {month, year}),
    );
  const loadPrayers = () =>
    runCardRequest('prayers', setPrayerState, (accessToken) =>
      fetchPrayerWeek(accessToken, campusId, weekStartDate),
    );

  useEffect(() => {
    const refreshToday = () => {
      const nextToday = new Date();

      setToday((currentToday) =>
        formatLocalDate(currentToday) === formatLocalDate(nextToday) ? currentToday : nextToday,
      );
    };
    const intervalId = setInterval(refreshToday, HOME_TODAY_REFRESH_INTERVAL_MS);

    refreshToday();

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    void loadMonthlyDevotion();
    void loadCharges();
    void loadPrayers();
  }, [campusId, month, weekStartDate, year]);

  return (
    <View style={styles.userFrame}>
      <View style={styles.figmaHeader}>
        <FaithLogHeaderTopRow campusLabel={campusLabel} contextLabel={`${displayUserName}님`}>
          <FaithLogHeaderIconButton
            accessibilityLabel="알림 설정 화면으로 이동"
            badge
            iconName="bell"
            onPress={onOpenNotifications}
          />
          {canOpenAdminMode ? (
            <FaithLogHeaderPillButton
              accessibilityLabel="관리자 영역 선택"
              label="관리자"
              onPress={onOpenAdminMode}
              showChevron
            />
          ) : null}
        </FaithLogHeaderTopRow>
        <Text
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          minimumFontScale={0.82}
          numberOfLines={1}
          style={styles.figmaTitle}>
          {displayUserName}님, 오늘의 FaithLog
        </Text>
      </View>

      <Text style={styles.figmaSectionTitle}>이번 달 요약</Text>
      <View style={styles.homeMetricRow}>
        <HomeMetricTile
          label="낸 금액"
          value={
            chargeState.status === 'success'
              ? formatCompactWon(getMonthlyPenaltyPaidAmount(chargeState.data))
              : '확인 중'
          }
        />
        <HomeMetricTile
          label="미납"
          tone="danger"
          value={
            chargeState.status === 'success'
              ? formatCompactWon(chargeState.data.monthlyUnpaidAmount)
              : '확인 중'
          }
        />
        <HomeMetricTile
          label="지각"
          tone="warning"
          value={
            monthlyDevotionState.status === 'success'
              ? `${monthlyDevotionState.data.devotion.saturdayLateMinutes}분`
              : '확인 중'
          }
        />
      </View>

      <Text style={styles.figmaSectionTitle}>경건생활</Text>
      <View style={styles.homeMetricRow}>
        <HomeMetricTile
          label="큐티"
          value={
            monthlyDevotionState.status === 'success'
              ? `${monthlyDevotionState.data.devotion.quietTimeCount}회`
              : '확인 중'
          }
          onPress={onOpenDevotion}
        />
        <HomeMetricTile
          label="기도"
          value={
            monthlyDevotionState.status === 'success'
              ? `${monthlyDevotionState.data.devotion.prayerCount}회`
              : '확인 중'
          }
          onPress={onOpenDevotion}
        />
        <HomeMetricTile
          label="말씀"
          value={
            monthlyDevotionState.status === 'success'
              ? `${monthlyDevotionState.data.devotion.bibleReadingCount}회`
              : '확인 중'
          }
          onPress={onOpenDevotion}
        />
      </View>
      <HomeCalendarEntryCard onPress={onOpenMonthlyCalendar} />
      <HomePrayerEntryCard
        entryMode="groups"
        onPress={() => onOpenPrayers('groups')}
        prayerState={prayerState}
      />
      <HomePrayerEntryCard
        entryMode="input"
        onPress={() => onOpenPrayers('input')}
        prayerState={prayerState}
      />
      <HomeChargeEntryCard chargeState={chargeState} onPress={onOpenPayments} />

    </View>
  );
}

function getMonthlyPenaltyPaidAmount(summary: ChargeSummary) {
  return (
    summary.monthlyByCategory.find((category) => category.paymentCategory === 'PENALTY')
      ?.paidAmount ?? 0
  );
}

function AdminModeSelectorSheet({
  onCancel,
  onSelect,
  routes,
  visible,
}: {
  onCancel: () => void;
  onSelect: (route: AdminModeRoute) => void;
  routes: AdminModeRoute[];
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible && routes.length > 0}>
      <View style={styles.modeSheetRoot}>
        <Pressable
          accessibilityLabel="관리자 이동 선택 닫기"
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.modeSheetBackdrop}
        />
        <View style={styles.modeSheetContainer}>
          <View style={styles.modeSheet}>
            <Eyebrow>관리자 선택</Eyebrow>
            <Title>관리할 영역을 선택하세요</Title>
            <Body>캠퍼스 운영 또는 전역 관리를 선택해 주세요.</Body>
            <View style={styles.modeSheetOptionList}>
              {routes.map((route) => (
                <Pressable
                  accessibilityLabel={`${getRouteLabel(route)}로 이동`}
                  accessibilityRole="button"
                  key={route}
                  onPress={() => onSelect(route)}
                  style={({pressed}) => [
                    styles.modeSheetOption,
                    pressed ? styles.authButtonPressed : null,
                  ]}>
                  <View style={styles.modeSheetOptionIcon}>
                    <IconexIcon
                      color={colors.primary}
                      name="settings"
                      size={20}
                      strokeWidth={1.7}
                    />
                  </View>
                  <View style={styles.modeSheetOptionText}>
                    <Text style={styles.modeSheetOptionTitle}>{getRouteLabel(route)}</Text>
                    <Text style={styles.modeSheetOptionBody}>
                      {route === 'serviceAdmin'
                        ? '전역 사용자와 캠퍼스를 관리합니다.'
                        : '선택한 캠퍼스 운영을 관리합니다.'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Button
              accessibilityLabel="관리자 이동 선택 취소"
              onPress={onCancel}
              variant="secondary">
              취소
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function HomeMetricTile({
  label,
  onPress,
  tone = 'default',
  value,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'danger' | 'default' | 'warning';
  value: string;
}) {
  const content = (
    <>
      <Text style={styles.homeMetricLabel}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        style={[
          styles.homeMetricValue,
          tone === 'danger' ? styles.homeMetricValueDanger : null,
          tone === 'warning' ? styles.homeMetricValueWarning : null,
        ]}>
        {value}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={`${label} 상세 보기`}
        accessibilityRole="button"
        onPress={onPress}
        style={({pressed}) => [styles.homeMetricTile, pressed ? styles.authButtonPressed : null]}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.homeMetricTile}>{content}</View>;
}

function HomeCalendarEntryCard({onPress}: {onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel="월간 경건생활 캘린더 보기"
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.homeCalendarCard, pressed ? styles.authButtonPressed : null]}>
      <View style={styles.homeCalendarIcon}>
        <IconexIcon color={colors.primary} name="calendar" size={22} strokeWidth={1.7} />
      </View>
      <View style={styles.homeCalendarText}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.homeCalendarTitle}>
          캘린더
        </Text>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.homeCalendarBody}>
          이번 달 체크 보기
        </Text>
      </View>
      <View style={styles.homeCalendarButton}>
        <Text style={styles.homeCalendarButtonText}>보기</Text>
      </View>
    </Pressable>
  );
}

function HomePrayerEntryCard({
  entryMode,
  onPress,
  prayerState,
}: {
  entryMode: PrayerEntryMode;
  onPress: () => void;
  prayerState: CardState<PrayerWeekSummary>;
}) {
  const variant = getHomePrayerEntryVariant(prayerState);
  const copy = getHomePrayerEntryCopy(entryMode, variant, prayerState);
  const iconName = entryMode === 'groups' ? 'document' : 'plus';

  return (
    <Pressable
      accessibilityLabel={`${copy.title} ${copy.actionLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.homePrayerCard,
        variant === 'suggestion' ? styles.homePrayerCardSuggested : null,
        pressed ? styles.authButtonPressed : null,
      ]}>
      <View style={styles.homePrayerIcon}>
        <IconexIcon color={colors.primary} name={iconName} size={22} strokeWidth={1.7} />
      </View>
      <View style={styles.homePrayerText}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.homePrayerTitle}>
          {copy.title}
        </Text>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.homePrayerBody}>
          {copy.body}
        </Text>
      </View>
      <View style={styles.homePrayerButton}>
        <Text style={styles.homePrayerButtonText}>{copy.actionLabel}</Text>
      </View>
    </Pressable>
  );
}

function HomeChargeEntryCard({
  chargeState,
  onPress,
}: {
  chargeState: CardState<ChargeSummary>;
  onPress: () => void;
}) {
  const body =
    chargeState.status === 'success' && chargeState.data.monthlyUnpaidAmount > 0
      ? `${formatCompactWon(chargeState.data.monthlyUnpaidAmount)} 미납`
      : '납부 내역 확인';

  return (
    <Pressable
      accessibilityLabel="최근 청구 항목 입금"
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.homeChargeCard, pressed ? styles.authButtonPressed : null]}>
      <View style={styles.homeChargeIcon}>
        <IconexIcon color={colors.primary} name="coins" size={22} strokeWidth={1.7} />
      </View>
      <View style={styles.homeChargeText}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.homeChargeTitle}>
          최근 청구 항목
        </Text>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.homeChargeBody}>
          {body}
        </Text>
      </View>
      <View style={styles.homeChargeButton}>
        <Text style={styles.homeChargeButtonText}>입금</Text>
      </View>
    </Pressable>
  );
}

function RoutePlaceholder({
  activeCampusCount,
  onCampusSwitchPress,
  route,
  selectedCampusDetail,
  state,
}: {
  activeCampusCount: number;
  onCampusSwitchPress: () => void;
  route: Exclude<ShellRoute, 'devotion' | 'payments' | 'polls' | 'prayers' | 'profile' | 'userHome'>;
  selectedCampusDetail: CampusDetail | null;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
}) {
  return (
    <Card>
      <Eyebrow>앱 시작 완료</Eyebrow>
      <Title>{state.selectedCampus.campusName}</Title>
      <Body>{state.user.name}님 세션을 복구했고, ACTIVE 캠퍼스로 진입했습니다.</Body>
      <View style={styles.metaGrid}>
        <ListRow label="사용자" supportingText="전역 역할" value={state.user.role} />
        <ListRow
          label="캠퍼스 역할"
          supportingText={`${getRouteLabel(route)} 접근 기준`}
          value={state.selectedCampus.campusRole}
        />
        {selectedCampusDetail ? (
          <ListRow
            label="상세 조회"
            supportingText="현재 캠퍼스 운영 상태"
            value={selectedCampusDetail.isActive ? 'ACTIVE' : 'PAUSED'}
          />
        ) : null}
      </View>
      {activeCampusCount > 1 ? (
        <Button
          accessibilityLabel="캠퍼스 변경 시트 열기"
          onPress={onCampusSwitchPress}
          variant="secondary">
          캠퍼스 변경
        </Button>
      ) : null}
    </Card>
  );
}

function getPrayerEntryPolicy(prayers: PrayerWeekSummary) {
  if (prayers.status === 'OPEN' && getAssignedPrayerMemberCount(prayers) > 0) {
    return '이번 주 루틴';
  }

  return '공동체 루틴';
}

function getHomePrayerEntryVariant(
  prayerState: CardState<PrayerWeekSummary>,
): HomePrayerEntryVariant {
  if (
    prayerState.status === 'success' &&
    prayerState.data.status === 'OPEN' &&
    getAssignedPrayerMemberCount(prayerState.data) > 0
  ) {
    return 'suggestion';
  }

  if (prayerState.status === 'success' && getAssignedPrayerMemberCount(prayerState.data) > 0) {
    return 'always';
  }

  return 'default';
}

function getHomePrayerEntryCopy(
  entryMode: PrayerEntryMode,
  variant: HomePrayerEntryVariant,
  prayerState: CardState<PrayerWeekSummary>,
) {
  if (entryMode === 'groups') {
    if (prayerState.status === 'loading' || prayerState.status === 'idle') {
      return {
        actionLabel: '보기',
        body: '조별 기도 확인',
        eyebrow: '공동체 기도',
        title: '조별 기도제목',
      };
    }

    if (prayerState.status === 'error') {
      return {
        actionLabel: '확인',
        body: '기도 화면에서 확인',
        eyebrow: '공동체 기도',
        title: '조별 기도제목',
      };
    }

    return {
      actionLabel: '보기',
      body: getPrayerProgressSummary(prayerState.data),
      eyebrow: getPrayerEntryPolicy(prayerState.data),
      title: '조별 기도제목',
    };
  }

  if (prayerState.status === 'loading' || prayerState.status === 'idle') {
    return {
      actionLabel: '작성',
      body: '내 조 확인 중',
      eyebrow: '내 기도제목',
      title: '기도제목 입력',
    };
  }

  if (prayerState.status === 'error') {
    return {
      actionLabel: '확인',
      body: '내 조 확인 필요',
      eyebrow: '내 기도제목',
      title: '기도제목 입력',
    };
  }

  if (!prayerState.data.myGroupId) {
    return {
      actionLabel: '확인',
      body: '배정 후 작성 가능',
      eyebrow: getPrayerEntryPolicy(prayerState.data),
      title: '기도제목 입력',
    };
  }

  if (variant === 'suggestion') {
    return {
      actionLabel: '작성',
      body: '내 기도 작성',
      eyebrow: getPrayerEntryPolicy(prayerState.data),
      title: '기도제목 입력',
    };
  }

  return {
    actionLabel: '보기',
    body: '내 조 상태 확인',
    eyebrow: '내 기도제목',
    title: '기도제목 입력',
  };
}

function getPrayerProgressSummary(prayers: PrayerWeekSummary) {
  const totalTargetCount = getAssignedPrayerMemberCount(prayers);
  const totalSubmittedCount = getAssignedPrayerSubmittedCount(prayers);

  if (totalTargetCount === 0) {
    return '기도조 배정 대기';
  }

  const myGroup = prayers.myGroupId
    ? prayers.groups.find((group) => group.groupId === prayers.myGroupId)
    : undefined;

  if (!myGroup) {
    return `전체 ${totalSubmittedCount}/${totalTargetCount} 작성`;
  }

  const myGroupSubmittedCount = myGroup.members.filter(
    (member) => member.submittedAt || member.content?.trim(),
  ).length;

  return `전체 ${totalSubmittedCount}/${totalTargetCount} · 우리 조 ${myGroupSubmittedCount}/${myGroup.members.length}`;
}

function getAssignedPrayerMemberCount(prayers: PrayerWeekSummary) {
  const memberIds = new Set<number>();

  prayers.groups.forEach((group) => {
    group.members.forEach((member) => {
      memberIds.add(member.userId);
    });
  });

  return memberIds.size || prayers.targetMemberCount;
}

function getAssignedPrayerSubmittedCount(prayers: PrayerWeekSummary) {
  const memberIds = new Set<number>();

  prayers.groups.forEach((group) => {
    group.members.forEach((member) => {
      if (member.submittedAt || member.content?.trim()) {
        memberIds.add(member.userId);
      }
    });
  });

  return memberIds.size || prayers.submittedCount;
}

function getHeaderCampusName(campusName: string) {
  return getCompactDisplayName(campusName, '내 캠퍼스', 18);
}

function getCompactDisplayName(value: string | null | undefined, fallback: string, maxLength = 12) {
  const normalized = normalizeDisplayLabel(value);

  if (!normalized) {
    return fallback;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 3))}...`;
}

function normalizeDisplayLabel(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/PERF_\d{8}_[A-Z0-9_]+/gi, 'PERF');
}

function getWeekStartDate(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return formatLocalDate(start);
}

function getYearMonth(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  return {kind: 'error', message: fallback};
}

function getHomeCardFallbackMessage(key: HomeCardKey) {
  switch (key) {
    case 'overview':
      return '내 정보와 캠퍼스 목록을 불러오지 못했습니다.';
    case 'devotion':
      return '이번 주 경건생활을 불러오지 못했습니다.';
    case 'charges':
      return '납부 요약을 불러오지 못했습니다.';
    case 'polls':
      return '투표 목록을 불러오지 못했습니다.';
    case 'prayers':
      return '기도제목을 불러오지 못했습니다.';
    default:
      return assertNever(key);
  }
}

function NotificationSettingsDetail({setAuthState}: {setAuthState: (state: AuthGateState) => void}) {
  const [state, setState] = useState<NotificationUiState>({status: 'checking'});

  const inspect = async () => {
    setState({status: 'checking'});
    try {
      setState(await inspectFcmRegistrationStatus());
    } catch {
      setState({
        status: 'error',
        error: {kind: 'error', message: '알림 설정을 확인하지 못했습니다.'},
      });
    }
  };

  const register = async () => {
    if (state.status === 'registering') {
      return;
    }

    setState({status: 'registering'});
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        setAuthState({
          status: 'sessionExpired',
          message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        });
        return;
      }

      const result = await registerCurrentFcmToken(accessToken);
      setState(result);
    } catch (error) {
      const apiError = toApiError(error, '기기 알림을 연결하지 못했습니다.');
      setState({status: 'error', error: apiError});

      if (apiError.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: apiError.message});
      }
    }
  };

  const deactivate = async () => {
    if (state.status === 'deactivating') {
      return;
    }

    setState({status: 'deactivating'});
    try {
      const {accessToken} = await getStoredTokens();

      if (!accessToken) {
        setAuthState({
          status: 'sessionExpired',
          message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        });
        return;
      }

      await deactivateCurrentFcmToken(accessToken);
      await inspect();
    } catch (error) {
      const apiError = toApiError(error, '기기 알림 연결을 해제하지 못했습니다.');
      setState({status: 'error', error: apiError});

      if (apiError.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: apiError.message});
      }
    }
  };

  useEffect(() => {
    void inspect();
  }, []);

  const openSystemSettings =
    state.status === 'permissionDenied' &&
    (state.permission === 'blocked' || state.permission === 'unavailable');
  const busy =
    state.status === 'checking' ||
    state.status === 'registering' ||
    state.status === 'deactivating';
  const fcmDisabled = state.status === 'disabled';

  return (
    <View style={styles.notificationDetailCard}>
      <View style={styles.notificationDetailHeader}>
        <Text style={styles.notificationDetailTitle}>알림 권한</Text>
        <Text style={styles.notificationDetailBody}>
          알림 권한과 이 기기의 알림 연결 상태를 확인합니다.
        </Text>
      </View>
      <View style={styles.notificationRowList}>
        {renderNotificationSettingRows(state)}
      </View>
      {state.status === 'error' ? (
        <InlineError message={getNotificationApiErrorMessage(state.error)} />
      ) : null}
      <View style={styles.notificationActionRow}>
        <Button
          accessibilityLabel="알림 설정 다시 확인"
          disabled={busy}
          onPress={inspect}
          variant="secondary">
          {state.status === 'checking' ? '확인 중...' : '다시 확인'}
        </Button>
        <Button
          accessibilityLabel={openSystemSettings ? 'OS 알림 설정 열기' : '기기 알림 등록 다시 시도'}
          disabled={busy || fcmDisabled}
          onPress={openSystemSettings ? () => void openNotificationSettings() : register}>
          {openSystemSettings ? '설정 열기' : state.status === 'registering' ? '등록 중...' : '알림 켜기'}
        </Button>
        <Button
          accessibilityLabel="이 기기 알림 연결 해제"
          disabled={busy || fcmDisabled}
          onPress={deactivate}
          variant="danger">
          {state.status === 'deactivating' ? '비활성화 중...' : '비활성화'}
        </Button>
      </View>
    </View>
  );
}

function renderNotificationSettingRows(state: NotificationUiState) {
  switch (state.status) {
    case 'checking':
      return <ListRow label="상태" supportingText="앱 시작 시 권한과 등록 상태 확인" value="확인 중" />;
    case 'registering':
      return <ListRow label="알림 등록" supportingText="이 기기로 알림을 받을 수 있게 연결 중" value="진행 중" />;
    case 'deactivating':
      return <ListRow label="알림 해제" supportingText="이 기기의 알림 연결을 정리 중" value="진행 중" />;
    case 'registered':
      return (
        <>
          <ListRow label="권한" supportingText="알림을 받을 수 있어요" value="허용됨" />
          <ListRow label="등록 상태" supportingText="서버와 연결됨" value="완료" />
          <ListRow label="기기 유형" supportingText="현재 기기 기준" value={state.registration.deviceType} />
          <ListRow label="앱 버전" supportingText="등록된 앱 버전" value={state.registration.appVersion} />
        </>
      );
    case 'registeredLocal':
      return (
        <>
          <ListRow label="권한" supportingText="알림을 받을 수 있어요" value="허용됨" />
          <ListRow label="등록 상태" supportingText="이 기기에 저장됨" value="완료" />
        </>
      );
    case 'permissionPrompt':
      return (
        <>
          <ListRow label="권한" supportingText="알림 권한 요청 전 안내 필요" value="미승인" />
          <ListRow label="연결" supportingText="권한 승인 후 기기 알림 연결 가능" value="대기" />
        </>
      );
    case 'permissionDenied':
      return (
        <>
          <ListRow label="권한" supportingText="기기 알림 설정 확인 필요" value={getPermissionValue(state.permission)} />
          <ListRow label="복구" supportingText={getNotificationPermissionMessage(state.permission)} value="필요" />
        </>
      );
    case 'tokenUnavailable':
      return (
        <>
          <ListRow label="권한" supportingText="기기 알림은 허용됨" value="허용됨" />
          <ListRow label="연결" supportingText="앱 알림 어댑터 연결 필요" value="대기" />
        </>
      );
    case 'disabled':
      return (
        <>
          <ListRow label="상태" supportingText={state.message} value="꺼짐" />
          <ListRow label="연결" supportingText="preview/prod 앱 빌드에서만 사용" value="대기" />
        </>
      );
    case 'error':
      return <ListRow label="상태" supportingText="알림 설정 확인 또는 등록 실패" value="오류" />;
    case 'dismissed':
      return <ListRow label="상태" supportingText="이번 세션에서 안내를 닫았습니다" value="나중에" />;
    default:
      return assertNever(state);
  }
}

function getPermissionValue(permission: 'denied' | 'blocked' | 'unavailable') {
  switch (permission) {
    case 'denied':
      return '거부됨';
    case 'blocked':
      return '차단됨';
    case 'unavailable':
      return '확인 제한';
    default:
      return assertNever(permission);
  }
}

function getNotificationPermissionMessage(permission: 'denied' | 'blocked' | 'unavailable') {
  switch (permission) {
    case 'denied':
      return '알림 권한이 거부되었습니다. 다시 요청할 수 있어요.';
    case 'blocked':
      return 'OS 설정에서 알림을 허용해주세요.';
    case 'unavailable':
      return '현재 앱에서는 OS 알림 권한을 직접 확인하지 못합니다.';
    default:
      return assertNever(permission);
  }
}

function getNotificationApiErrorMessage(error: ApiError) {
  return getApiErrorPresentation(error, {
    conflictMessage: '서버의 알림 연결 상태와 충돌했습니다. 알림 설정을 다시 확인해 주세요.',
    permissionMessage: '기기 알림을 연결하거나 해제할 권한이 없습니다.',
  }).message;
}

function getCampusSelectContext(
  campuses: CampusMembershipSummary[],
  currentCampusId: number,
) {
  const currentCampus =
    campuses.find((campus) => campus.campusId === currentCampusId) ?? campuses[0];

  if (!currentCampus) {
    return 'FaithLog';
  }

  return currentCampus.campusName;
}

function getCampusRoleDisplayLabel(role: string) {
  switch (role) {
    case 'CAMPUS_LEADER':
      return '리더';
    case 'ELDER':
      return '장로';
    case 'MINISTER':
      return '교역자';
    case 'MEMBER':
      return '일반 멤버';
    default:
      return '멤버';
  }
}

function ProfileScreen({
  canOpenAdminMode,
  canSwitchCampus,
  onBackToProfile,
  onInviteCodePress,
  onCampusSwitchPress,
  onLogoutPress,
  onOpenAdminMode,
  onOpenCoffeeDuty,
  onOpenNotifications,
  profileView,
  setAuthState,
  state,
}: {
  canOpenAdminMode: boolean;
  canSwitchCampus: boolean;
  onBackToProfile: () => void;
  onInviteCodePress: () => void;
  onCampusSwitchPress: () => void;
  onLogoutPress: () => void;
  onOpenAdminMode: () => void;
  onOpenCoffeeDuty: () => void;
  onOpenNotifications: () => void;
  profileView: 'coffee' | 'main' | 'notifications';
  setAuthState: (state: AuthGateState) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
}) {
  if (profileView === 'notifications') {
    return (
      <View style={styles.userFrame}>
        <View style={styles.figmaHeader}>
          <FaithLogHeaderTopRow
            campusLabel={state.selectedCampus.campusName}
            contextLabel={`${state.user.name}님`}>
            <FaithLogHeaderPillButton
              accessibilityLabel="내정보 화면으로 돌아가기"
              label="뒤로"
              onPress={onBackToProfile}
            />
          </FaithLogHeaderTopRow>
          <Text style={styles.figmaTitle}>알림 설정</Text>
        </View>
        <NotificationSettingsDetail setAuthState={setAuthState} />
      </View>
    );
  }

  if (profileView === 'coffee') {
    return (
      <CoffeeDutyScreen
        canOpenAdminMode={canOpenAdminMode}
        onBack={onBackToProfile}
        onOpenAdminMode={onOpenAdminMode}
        onOpenNotifications={onOpenNotifications}
        setAuthState={setAuthState}
        state={state}
      />
    );
  }

  return (
    <View style={styles.userFrame}>
      <View style={styles.figmaHeader}>
        <FaithLogHeaderTopRow
          campusLabel={state.selectedCampus.campusName}
          contextLabel={`${state.user.name}님`}>
          <FaithLogHeaderIconButton
            accessibilityLabel="알림 설정 화면으로 이동"
            badge
            iconName="bell"
            onPress={onOpenNotifications}
          />
          {canOpenAdminMode ? (
            <FaithLogHeaderPillButton
              accessibilityLabel="관리자 영역 선택"
              label="관리자"
              onPress={onOpenAdminMode}
              showChevron
            />
          ) : null}
        </FaithLogHeaderTopRow>
        <Text style={styles.figmaTitle}>내정보</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <IconexIcon color={colors.textPrimary} name="user" size={24} strokeWidth={1.7} />
        </View>
        <View style={styles.profileInfo}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.profileName}>
            {state.user.name}
          </Text>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.profileEmail}>
            {state.user.email}
          </Text>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.profileCampusText}>
            {state.selectedCampus.campusName} · {getCampusRoleDisplayLabel(state.selectedCampus.campusRole)}
          </Text>
        </View>
        <View style={styles.profileRoleChip}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.profileRoleText}>
            {getCampusRoleDisplayLabel(state.selectedCampus.campusRole)}
          </Text>
        </View>
      </View>

      <Text style={styles.figmaSectionTitle}>공동체 메뉴</Text>
      <View style={styles.profileRowList}>
        <ProfileActionRow
          actionLabel={canSwitchCampus ? '관리' : '입력'}
          icon="add-user"
          onPress={onInviteCodePress}
          subtitle="다른 캠퍼스 초대코드 입력"
          title="캠퍼스 참여 코드"
        />
      </View>

      <Text style={styles.figmaSectionTitle}>계정</Text>
      <View style={styles.profileRowList}>
        <CoffeeDutyProfileRow
          onOpen={onOpenCoffeeDuty}
          setAuthState={setAuthState}
          state={state}
        />
        <ProfileActionRow
          actionLabel="설정"
          icon="bell"
          onPress={onOpenNotifications}
          subtitle="권한과 이 기기의 알림 연결 상태"
          title="알림 설정"
        />
        <ProfileActionRow
          actionLabel={canSwitchCampus ? '변경' : '보기'}
          icon="category"
          onPress={() => {
            if (canSwitchCampus) {
              onCampusSwitchPress();
              return;
            }

            return;
          }}
          subtitle={state.selectedCampus.campusName}
          title="내 캠퍼스"
        />
        {canSwitchCampus ? (
          <ProfileActionRow
            actionLabel="전환"
            icon="settings"
            onPress={onCampusSwitchPress}
            subtitle="관리 중인 캠퍼스를 변경하거나 새 캠퍼스를 생성"
            title="캠퍼스 전환"
          />
        ) : null}
        <ProfileActionRow
          actionLabel="로그아웃"
          actionTone="danger"
          icon="lock-open"
          onPress={onLogoutPress}
          subtitle="현재 기기에서 세션 종료"
          title="로그아웃"
        />
      </View>
    </View>
  );
}

function CoffeeDutyProfileRow({
  onOpen,
  setAuthState,
  state,
}: {
  onOpen: () => void;
  setAuthState: (state: AuthGateState) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
}) {
  const [canManageCoffee, setCanManageCoffee] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadCoffeeDuty = async () => {
      try {
        const {accessToken} = await getStoredTokens();

        if (!accessToken) {
          setAuthState({
            status: 'sessionExpired',
            message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
          });
          return;
        }

        const duty = await fetchMyDutyAssignment(accessToken, state.selectedCampus.campusId);
        const canManage =
          duty.dutyType === 'COFFEE' && duty.isActive && duty.userId === state.user.id;

        if (mounted) {
          setCanManageCoffee(canManage);
        }
      } catch (error) {
        if (error instanceof FaithLogApiError && error.detail.kind === 'sessionExpired') {
          setAuthState({status: 'sessionExpired', message: error.detail.message});
        }

        if (mounted) {
          setCanManageCoffee(false);
        }
      }
    };

    void loadCoffeeDuty();

    return () => {
      mounted = false;
    };
  }, [setAuthState, state.selectedCampus.campusId, state.user.id]);

  if (!canManageCoffee) {
    return null;
  }

  return (
    <ProfileActionRow
      actionLabel="관리"
      icon="coins"
      onPress={onOpen}
      subtitle="커피 주문 투표 생성과 커피 정산 확인"
      title="커피 정산 관리"
    />
  );
}

function ProfileActionRow({
  actionLabel,
  actionTone = 'default',
  icon,
  onPress,
  subtitle,
  title,
}: {
  actionLabel: string;
  actionTone?: 'danger' | 'default';
  icon?: IconexIconName;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${title} ${actionLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.profileActionRow, pressed ? styles.authButtonPressed : null]}>
      {icon ? (
        <View style={styles.profileActionIcon}>
          <IconexIcon color={colors.textPrimary} name={icon} size={22} strokeWidth={1.7} />
        </View>
      ) : null}
      <View style={styles.profileActionText}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.profileActionTitle}>
          {title}
        </Text>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.profileActionSubtitle}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.profileActionButton}>
        <Text
          style={[
            styles.profileActionButtonText,
            actionTone === 'danger' ? styles.profileActionButtonTextDanger : null,
          ]}>
          {actionLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function CampusSwitchSheet({
  campuses,
  canCreateCampus,
  currentCampusId,
  error,
  loading,
  onCancel,
  onCampusCreatePress,
  onRefresh,
  onSelect,
  visible,
}: {
  campuses: CampusMembershipSummary[];
  canCreateCampus: boolean;
  currentCampusId: number;
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onCampusCreatePress: () => void;
  onRefresh: () => void;
  onSelect: (campus: CampusMembershipSummary) => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />
          <Title>캠퍼스 변경</Title>
          <Body>소속된 캠퍼스 중 이동할 캠퍼스를 선택할 수 있어요.</Body>
          {error ? <InlineError message={getCampusSwitchErrorMessage(error)} /> : null}
          <View style={styles.campusSwitchList}>
            {campuses.length > 0 ? (
              campuses.map((campus) => {
                const selected = campus.campusId === currentCampusId;

                return (
                  <ListRow
                    accessibilityLabel={`${campus.campusName} 캠퍼스로 변경`}
                    key={campus.membershipId}
                    label={campus.campusName}
                    onPress={() => onSelect(campus)}
                    supportingText={getCampusRoleDisplayLabel(campus.campusRole)}
                    value={selected ? '현재' : '선택'}
                  />
                );
              })
            ) : (
              <Body>관리 중인 캠퍼스가 없습니다.</Body>
            )}
          </View>
          <Body>선택 후 해당 캠퍼스의 홈 화면으로 이동합니다.</Body>
          {canCreateCampus ? (
            <Button
              accessibilityLabel="캠퍼스 생성 화면으로 이동"
              disabled={loading}
              onPress={onCampusCreatePress}>
              캠퍼스 생성
            </Button>
          ) : null}
          <View style={styles.sheetActionRow}>
            <Button
              accessibilityLabel="캠퍼스 목록 다시 불러오기"
              disabled={loading}
              onPress={onRefresh}
              variant="secondary">
              {loading ? '불러오는 중...' : '목록 갱신'}
            </Button>
            <Button
              accessibilityLabel="캠퍼스 전환 닫기"
              disabled={loading}
              onPress={onCancel}
              variant="ghost">
              닫기
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LogoutConfirmSheet({
  loading,
  onCancel,
  onConfirm,
  visible,
}: {
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}) {
  return (
    <DangerConfirmSheet
      accessibilityLabel="로그아웃 위험 확인"
      cancelAccessibilityLabel="로그아웃 취소"
      confirmAccessibilityLabel="로그아웃 확정"
      confirmLabel="로그아웃"
      dangerSummary="서버 로그아웃 확인과 기기 로그인 정보 정리를 함께 진행합니다."
      loading={loading}
      loadingLabel="로그아웃 중..."
      message="로그아웃을 시도한 뒤 이 기기의 로그인 정보를 안전하게 정리합니다."
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="로그아웃할까요?"
      visible={visible}
    />
  );
}

function getCampusSwitchErrorMessage(error: ApiError) {
  return getApiErrorPresentation(error, {
    conflictMessage: '캠퍼스 상태가 최신 목록과 충돌했습니다. 목록을 다시 불러와 주세요.',
    permissionMessage: '선택한 캠퍼스 상세를 조회할 권한이 없습니다.',
  }).message;
}

function getRouteTitle(route: ShellRoute) {
  switch (route) {
    case 'userHome':
      return '일반 사용자 홈';
    case 'devotion':
      return '경건생활';
    case 'payments':
      return '사용자 납부';
    case 'polls':
      return '투표';
    case 'prayers':
      return '기도제목';
    case 'profile':
      return '내정보와 로그아웃';
    case 'campusAdmin':
      return '캠퍼스 관리자 탭';
    case 'serviceAdmin':
      return 'Service ADMIN 진입';
    default:
      return assertNever(route);
  }
}

function getRouteIcon(route: ShellRoute) {
  switch (route) {
    case 'userHome':
      return '⌂';
    case 'devotion':
      return '✓';
    case 'payments':
      return '₩';
    case 'polls':
      return '▤';
    case 'prayers':
      return 'R';
    case 'profile':
      return '○';
    case 'campusAdmin':
      return 'A';
    case 'serviceAdmin':
      return 'S';
    default:
      return assertNever(route);
  }
}

function getRouteDescription(route: ShellRoute, campusCount: number) {
  switch (route) {
    case 'userHome':
      return `경건, 투표, 납부, 기도제목으로 이어지는 사용자 탭 shell입니다. ACTIVE 캠퍼스 ${campusCount}개를 확인했습니다.`;
    case 'devotion':
      return '경건생활 주간 체크, 제출, 월간 통계를 다루는 일반 사용자 화면입니다.';
    case 'payments':
      return '사용자 청구 목록, 납부 요약, 계좌 없음 상태, 납부했어요 처리를 다루는 일반 사용자 화면입니다.';
    case 'polls':
      return '사용자 투표 목록, 상세, 응답, 댓글, 결과 조회를 다루는 일반 사용자 화면입니다.';
    case 'prayers':
      return '사용자 조별 기도제목 조회, 사람별 입력, version 충돌 복구를 다루는 일반 사용자 화면입니다.';
    case 'profile':
      return '내 정보 새로고침, 공동체 메뉴, 로그아웃 확인 흐름입니다.';
    case 'campusAdmin':
      return '캠퍼스 역할이 관리자 권한일 때만 노출되는 관리자 shell입니다.';
    case 'serviceAdmin':
      return '전역 ADMIN 사용자에게만 노출되는 Service ADMIN shell입니다.';
    default:
      return assertNever(route);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled state: ${String(value)}`);
}

const authColors = {
  background: colors.background,
  border: colors.border,
  buttonSecondary: colors.borderSoft,
  input: colors.surface,
  text: colors.textPrimary,
  textMuted: colors.textSecondary,
};

const androidTopSafeInset =
  Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, 52) + 8 : 0;
const androidBottomNavInset = Platform.OS === 'android' ? spacing.bottomSafe + 44 : 0;

const styles = StyleSheet.create({
  safeArea: {
    alignSelf: 'stretch',
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: androidTopSafeInset,
    width: '100%',
  },
  authSafeArea: {
    backgroundColor: authColors.background,
  },
  keyboardRoot: {
    flex: 1,
    width: '100%',
  },
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: 18,
    paddingBottom: 28,
  },
  authScrollContent: {
    alignItems: 'center',
    backgroundColor: authColors.background,
    flexGrow: 1,
    paddingBottom: Platform.OS === 'android' ? 220 : 40,
    paddingHorizontal: 24,
  },
  authFrame: {
    alignSelf: 'center',
    gap: 12,
    maxWidth: 390,
    minHeight: Platform.OS === 'android' ? 0 : 640,
    width: '100%',
  },
  loginAuthFrame: {
    paddingTop: Platform.OS === 'android' ? 16 : 30,
  },
  signupAuthFrame: {
    paddingTop: Platform.OS === 'android' ? 16 : 30,
  },
  loginHero: {
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: Platform.OS === 'android' ? 12 : 28,
  },
  loginBrandTitle: {
    color: authColors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 54,
  },
  loginSubtitle: {
    alignSelf: 'center',
    color: authColors.textMuted,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: Platform.OS === 'android' ? 20 : 44,
    maxWidth: 300,
    textAlign: 'center',
  },
  signupHeader: {
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: Platform.OS === 'android' ? 18 : 34,
  },
  signupTitle: {
    color: authColors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 34,
  },
  authBrandChip: {
    alignItems: 'center',
    backgroundColor: authColors.buttonSecondary,
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 86,
  },
  authBrandChipText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  authField: {
    alignSelf: 'center',
    gap: 8,
    maxWidth: 318,
    width: '100%',
  },
  authFieldLabel: {
    color: authColors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  authInput: {
    backgroundColor: authColors.input,
    borderColor: authColors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: authColors.text,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  authInputError: {
    borderColor: colors.danger,
  },
  authFieldError: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  authActionRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
    maxWidth: 318,
    minWidth: 0,
    width: '100%',
  },
  authActionSpacer: {
    flexGrow: 1,
    minHeight: 34,
  },
  signupAuthActionRow: {
    marginTop: 28,
  },
  authButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexBasis: 0,
    flexGrow: 1,
    height: 44,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 12,
  },
  authButtonPrimary: {
    backgroundColor: colors.primary,
  },
  authButtonSecondary: {
    backgroundColor: authColors.buttonSecondary,
    borderColor: authColors.border,
    borderWidth: 1,
  },
  authButtonDisabled: {
    opacity: 0.54,
  },
  authButtonPressed: {
    opacity: 0.78,
  },
  authButtonText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    maxWidth: '100%',
    textAlign: 'center',
  },
  authButtonTextPrimary: {
    color: colors.surface,
  },
  authButtonTextSecondary: {
    color: authColors.textMuted,
  },
  authFootnote: {
    alignSelf: 'center',
    color: authColors.textMuted,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 22,
    maxWidth: 318,
    width: '100%',
  },
  launchFrame: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    maxWidth: 390,
    minHeight: 650,
    width: '100%',
  },
  launchIcon: {
    alignItems: 'center',
    backgroundColor: colors.faith,
    borderRadius: 24,
    height: 112,
    justifyContent: 'center',
    marginBottom: 8,
    width: 112,
  },
  launchIconText: {
    color: colors.surface,
    fontSize: 42,
    fontWeight: '700',
    lineHeight: 48,
  },
  launchTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    textAlign: 'center',
  },
  launchSubtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 34,
    textAlign: 'center',
  },
  launchLoadingCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    maxWidth: 342,
    minHeight: 96,
    paddingHorizontal: 32,
    width: '100%',
  },
  loadingDot: {
    backgroundColor: colors.primary,
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  launchLoadingText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  launchLoadingTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  launchLoadingHelper: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  onboardingFrame: {
    alignSelf: 'center',
    gap: Platform.OS === 'android' ? 10 : 14,
    maxWidth: 390,
    minHeight: Platform.OS === 'android' ? 0 : 640,
    paddingTop: Platform.OS === 'android' ? 12 : 30,
    width: '100%',
  },
  onboardingHeader: {
    alignItems: 'flex-start',
    gap: Platform.OS === 'android' ? 6 : 10,
    marginBottom: Platform.OS === 'android' ? 2 : 8,
  },
  onboardingTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 34,
  },
  centerStateCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 22,
    gap: 14,
    marginTop: 54,
    maxWidth: 342,
    minHeight: 300,
    paddingHorizontal: 24,
    paddingVertical: 36,
    width: '100%',
  },
  centerStateIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginBottom: 8,
    width: 64,
  },
  centerStateIconText: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  centerStateTitle: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  centerStateMessage: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 2,
    textAlign: 'center',
  },
  centerStateActions: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    maxWidth: 300,
    width: '100%',
  },
  onboardingSubmitActions: {
    marginTop: 0,
  },
  sessionExpiredActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    width: '100%',
  },
  centerStateHelper: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  inviteIntroCard: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    gap: 6,
    maxWidth: 342,
    minHeight: Platform.OS === 'android' ? 104 : 150,
    paddingHorizontal: Platform.OS === 'android' ? 18 : 24,
    paddingVertical: Platform.OS === 'android' ? 16 : 30,
    width: '100%',
  },
  inviteIntroTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  inviteIntroBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  roleGateCard: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    gap: 10,
    maxWidth: 342,
    minHeight: 82,
    paddingHorizontal: 18,
    paddingVertical: 16,
    width: '100%',
  },
  roleGateTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  roleGateChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    minHeight: 28,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  roleGateChipText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  roleGateMessage: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  campusFormCard: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: 12,
    maxWidth: 342,
    paddingHorizontal: 18,
    paddingVertical: 18,
    width: '100%',
  },
  campusFormTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  campusFormBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  actionRow: {
    gap: 10,
    marginTop: 6,
  },
  onboardingActionSpacer: {
    flexGrow: 1,
    minHeight: 26,
  },
  shell: {
    backgroundColor: colors.background,
    flex: 1,
    gap: 0,
    minHeight: 0,
  },
  shellScroll: {
    flex: 1,
    minHeight: 0,
  },
  shellContent: {
    flexGrow: 1,
    gap: 12,
    paddingBottom: Platform.OS === 'android' ? spacing.bottomSafe + 120 : 0,
  },
  shellContentKeyboardOpen: {
    paddingBottom: spacing.bottomSafe + 360,
  },
  bottomNavFrame: {
    flexShrink: 0,
    paddingBottom: androidBottomNavInset,
  },
  userFrame: {
    backgroundColor: colors.background,
    gap: 14,
    minHeight: 620,
    paddingTop: 0,
  },
  userActionSpacer: {
    flexGrow: 1,
    minHeight: 20,
  },
  campusSummaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: 8,
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  campusSummaryTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  campusSummaryBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  campusList: {
    gap: 14,
  },
  campusDetailCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: 8,
    minHeight: 112,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  campusDetailTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
  },
  campusDetailMeta: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 20,
  },
  campusDetailHelper: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 20,
  },
  figmaHeader: {
    alignItems: 'flex-start',
    gap: 6,
  },
  figmaContextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 36,
    width: '100%',
  },
  figmaContextLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  figmaContextName: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    maxWidth: 138,
    minWidth: 0,
  },
  homeHeaderTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    width: '100%',
  },
  homeHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  figmaTitle: {
    color: authColors.text,
    flexShrink: 1,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    minWidth: 0,
    width: '100%',
  },
  homeNotificationButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
    shadowColor: colors.textPrimary,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.04,
    shadowRadius: 12,
    width: 36,
  },
  homeNotificationDot: {
    backgroundColor: colors.danger,
    borderColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1.5,
    height: 8,
    position: 'absolute',
    right: 8,
    top: 8,
    width: 8,
  },
  modeSwitchPillButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 17,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  modeSwitchPillChevron: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 1,
  },
  modeSwitchPillText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  modeSheetBackdrop: {
    backgroundColor: colors.textPrimary,
    bottom: 0,
    left: 0,
    opacity: 0.34,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modeSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
    width: '100%',
  },
  modeSheetContainer: {
    bottom: 0,
    left: 0,
    padding: 16,
    paddingBottom: spacing.bottomSafe,
    position: 'absolute',
    right: 0,
  },
  modeSheetOption: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modeSheetOptionBody: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  modeSheetOptionIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  modeSheetOptionList: {
    gap: 8,
  },
  modeSheetOptionText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  modeSheetOptionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  modeSheetRoot: {
    flex: 1,
  },
  figmaCampusChip: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    flexShrink: 1,
    height: 28,
    justifyContent: 'center',
    maxWidth: 158,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  figmaCampusText: {
    color: colors.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: 138,
  },
  figmaSectionTitle: {
    color: authColors.text,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'left',
  },
  homeCalendarBody: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  homeCalendarButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  homeCalendarButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  homeCalendarCard: {
    alignItems: 'center',
    backgroundColor: authColors.input,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 14,
    height: 92,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  homeCalendarIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  homeCalendarText: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  homeCalendarTitle: {
    color: authColors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  homePrayerBody: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  homePrayerButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  homePrayerButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  homePrayerCard: {
    alignItems: 'center',
    backgroundColor: authColors.input,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 14,
    height: 92,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  homePrayerCardSuggested: {
    borderColor: colors.borderSoft,
  },
  homePrayerIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  homePrayerText: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  homePrayerTitle: {
    color: authColors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  homeRoutineBody: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  homeRoutineCard: {
    alignItems: 'center',
    backgroundColor: authColors.input,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minHeight: 96,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  homeRoutineText: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  homeRoutineTitle: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  homeMetricRow: {
    flexDirection: 'row',
    gap: 18,
  },
  homeMetricTile: {
    backgroundColor: authColors.input,
    borderRadius: 20,
    flex: 1,
    gap: 12,
    height: 86,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 14,
  },
  homeMetricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
  },
  homeMetricValue: {
    color: authColors.text,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 32,
  },
  homeMetricValueDanger: {
    color: colors.danger,
  },
  homeMetricValueWarning: {
    color: colors.warning,
  },
  homeChargeCard: {
    alignItems: 'center',
    backgroundColor: authColors.input,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 14,
    height: 92,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  homeChargeIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  homeChargeText: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  homeChargeTitle: {
    color: authColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  homeChargeBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  homeChargeButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  homeChargeButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  profileBackButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  profileBackButtonText: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 32,
    textAlign: 'center',
  },
  profileActionButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 58,
  },
  profileActionButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  profileActionButtonTextDanger: {
    color: colors.danger,
  },
  profileActionIcon: {
    alignItems: 'center',
    backgroundColor: authColors.buttonSecondary,
    borderRadius: 14,
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  profileActionIconText: {
    color: authColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  profileActionRow: {
    alignItems: 'center',
    backgroundColor: authColors.input,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 12,
    minHeight: 86,
    paddingHorizontal: 24,
  },
  profileActionSubtitle: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 18,
  },
  profileActionText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  profileActionTitle: {
    color: authColors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: authColors.buttonSecondary,
    borderRadius: 14,
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  profileAvatarText: {
    color: authColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: authColors.input,
    borderRadius: 24,
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'space-between',
    minHeight: 112,
    paddingHorizontal: 24,
  },
  profileCampusText: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 20,
  },
  profileEmail: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  profileInfo: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  profileName: {
    color: authColors.text,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  profileRoleChip: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 12,
  },
  profileRoleText: {
    color: colors.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: '100%',
  },
  profileRowList: {
    gap: 16,
  },
  homeHeaderRow: {
    alignItems: 'flex-start',
    gap: spacing.gap,
  },
  homeHeaderText: {
    gap: spacing.gap,
  },
  metaGrid: {
    gap: 8,
  },
  campusSwitchList: {
    gap: 10,
    marginTop: 2,
  },
  sheetActionRow: {
    gap: 8,
    marginTop: 2,
  },
  inlineError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inlineErrorText: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  notificationActionRow: {
    gap: 10,
  },
  notificationDetailBody: {
    color: authColors.textMuted,
    fontSize: 15,
    lineHeight: 20,
  },
  notificationDetailCard: {
    backgroundColor: authColors.input,
    borderRadius: 22,
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  notificationDetailHeader: {
    gap: 8,
  },
  notificationDetailTitle: {
    color: authColors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 28,
  },
  notificationRowList: {
    gap: 8,
  },
  modalBackdrop: {
    backgroundColor: colors.textMuted,
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.screenX,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.gap,
    marginHorizontal: -spacing.screenX,
    marginBottom: -spacing.screenX,
    padding: spacing.card,
    paddingBottom: spacing.card + 4,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 4,
    width: 42,
  },
});
