import {type PropsWithChildren, type ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {
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
  View,
} from 'react-native';

import {
  createCampus,
  FaithLogApiError,
  fetchCampusDetail,
  fetchChargeSummary,
  fetchCurrentUser,
  fetchMyCampuses,
  fetchPolls,
  fetchPrayerWeek,
  fetchWeeklyDevotionSummary,
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
  PollSummary,
  PrayerWeekSummary,
  UserRole,
  WeeklyDevotionSummary,
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
  Chip,
  Conflict,
  DangerConfirmSheet,
  Empty,
  ErrorState,
  Eyebrow,
  ListRow,
  Loading,
  Offline,
  PermissionDenied,
  Screen,
  TextField,
  Title,
} from '../components/ui';
import {getAvailableRoutes, getRouteLabel, type ShellRoute} from '../navigation/shellRoutes';
import {DevotionScreen} from '../devotion/DevotionScreen';
import {MonthlyCalendarScreen} from '../devotion/MonthlyCalendarScreen';
import {
  deactivateCurrentFcmToken,
  inspectFcmRegistrationStatus,
  registerCurrentFcmToken,
  type FcmRegistrationStatus,
} from '../notifications/fcmRegistration';
import {
  getInitialNotificationOpenPayload,
  openNotificationSettings,
  subscribeNotificationOpenPayload,
} from '../notifications/notificationAdapter';
import {
  getPushNavigationInvalidMessage,
  parsePushNotificationOpenPayload,
} from '../notifications/pushNavigation';
import {PaymentScreen} from '../payments/PaymentScreen';
import {PollScreen} from '../polls/PollScreen';
import {PrayerScreen} from '../prayers/PrayerScreen';
import {colors, spacing} from '../theme';

const initialState: AuthGateState = {
  status: 'loading',
  message: '저장된 세션을 확인하고 있어요.',
};

type EntryTarget = 'login' | 'signup' | 'inviteCode' | 'campusCreate';

type SessionNotice = {
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

type HomePrayerEntryVariant = 'suggestion' | 'always';

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
  const [sessionNotice, setSessionNotice] = useState<SessionNotice>(null);
  const [route, setRoute] = useState<ShellRoute>('userHome');
  const initialAuthenticatedRouteAppliedRef = useRef(false);
  const initialNotificationOpenHandledRef = useRef(false);
  const publicAuthMode =
    authState.status === 'signedOut' ||
    authState.status === 'sessionExpired' ||
    authState.status === 'configurationError';

  const retryBootstrap = () => {
    setEntryTarget(null);
    setSessionNotice(null);
    setAuthState({status: 'loading', message: '세션을 다시 확인하고 있어요.'});
    void bootstrapAuthGate().then(setAuthState);
  };

  useEffect(() => {
    void bootstrapAuthGate().then(setAuthState);
  }, []);

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      initialAuthenticatedRouteAppliedRef.current = false;
      setRoute('userHome');
      return;
    }

    const routes = getAvailableRoutes(authState.user, authState.selectedCampus);

    if (!initialAuthenticatedRouteAppliedRef.current) {
      initialAuthenticatedRouteAppliedRef.current = true;
      setRoute(authState.user.role === 'ADMIN' ? 'serviceAdmin' : routes[0]!);
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
        setSessionNotice({
          tone: 'warning',
          title: '알림 이동 제한',
          message: getPushNavigationInvalidMessage(target.reason),
        });
        return;
      }

      const routes = getAvailableRoutes(authState.user, authState.selectedCampus);

      if (!routes.includes(target.route)) {
        setSessionNotice({
          tone: 'warning',
          title: '알림 이동 권한 없음',
          message: '현재 계정에서 열 수 없는 화면입니다.',
        });
        return;
      }

      setRoute(target.route);
      setSessionNotice({
        tone: 'info',
        title: '알림에서 이동',
        message: `${getRouteLabel(target.route)} 화면으로 이동했습니다.`,
      });
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
    <SafeAreaView style={[styles.safeArea, publicAuthMode ? styles.authSafeArea : null]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardRoot}>
        {publicAuthMode ? (
          <ScrollView
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {sessionNotice ? <AuthNotice notice={sessionNotice} /> : null}
            {renderAuthState({
              clearNotice: () => setSessionNotice(null),
              entryTarget,
              openEntryTarget: setEntryTarget,
              retry: retryBootstrap,
              route,
              setAuthState,
              setNotice: setSessionNotice,
              setRoute,
              state: authState,
            })}
          </ScrollView>
        ) : (
          <Screen>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled">
              {sessionNotice ? <NoticeCard notice={sessionNotice} /> : null}
              {renderAuthState({
                clearNotice: () => setSessionNotice(null),
                entryTarget,
                openEntryTarget: setEntryTarget,
                retry: retryBootstrap,
                route,
                setAuthState,
                setNotice: setSessionNotice,
                setRoute,
                state: authState,
              })}
            </ScrollView>
          </Screen>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  setNotice: (notice: SessionNotice) => void;
  setRoute: (route: ShellRoute) => void;
  state: AuthGateState;
}) {
  switch (state.status) {
    case 'loading':
      return <Loading message={state.message} />;
    case 'signedOut':
      return renderPublicAuthEntry({
        clearNotice,
        entryTarget: entryTarget === 'signup' ? 'signup' : 'login',
        openEntryTarget,
        setAuthState,
        setNotice,
      });
    case 'sessionExpired':
      return (
        <>
          <StatusCard
            eyebrow="세션 만료"
            title="다시 로그인해 주세요"
            message={state.message}
            primaryLabel="로그인 계속하기"
            primaryAccessibilityLabel="세션 만료 후 로그인 폼으로 이동"
            onPrimaryPress={() => openEntryTarget('login')}
            secondaryLabel="회원가입"
            secondaryAccessibilityLabel="회원가입 폼으로 이동"
            onSecondaryPress={() => openEntryTarget('signup')}
            tone="danger"
          />
          {renderPublicAuthEntry({
            clearNotice,
            entryTarget: entryTarget === 'signup' ? 'signup' : 'login',
            openEntryTarget,
            setAuthState,
            setNotice,
          })}
        </>
      );
    case 'noCampus':
      return (
        <NoCampusOnboarding
          clearNotice={clearNotice}
          entryTarget={entryTarget}
          openEntryTarget={openEntryTarget}
          setAuthState={setAuthState}
          setNotice={setNotice}
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
  setNotice,
}: {
  clearNotice: () => void;
  entryTarget: 'login' | 'signup';
  openEntryTarget: (target: EntryTarget | null) => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: SessionNotice) => void;
}) {
  if (entryTarget === 'signup') {
    return (
      <SignupForm
        clearNotice={clearNotice}
        onSignupComplete={(name) => {
          setNotice({
            tone: 'success',
            title: '회원가입 완료',
            message: `${name}님, 가입이 완료되었습니다. 이제 로그인해 주세요.`,
          });
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
          setNotice({
            tone: 'success',
            title: '로그인되었습니다',
            message: `${nextState.selectedCampus.campusName} 캠퍼스로 진입했습니다.`,
          });
        }
        if (nextState.status === 'noCampus') {
          setNotice({
            tone: 'info',
            title: '캠퍼스 연결 필요',
            message: '로그인은 완료됐고 ACTIVE 캠퍼스가 없어 온보딩으로 안내합니다.',
          });
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
  setNotice,
  user,
}: {
  clearNotice: () => void;
  entryTarget: EntryTarget | null;
  openEntryTarget: (target: EntryTarget | null) => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: SessionNotice) => void;
  user: Extract<AuthGateState, {status: 'noCampus'}>['user'];
}) {
  const canCreateCampus = canCreateCampusWithRole(user.role);

  return (
    <>
      <Empty
        title={`${user.name}님, 참여 중인 캠퍼스가 없어요`}
        message="ACTIVE 캠퍼스가 없어 초대코드 입력 또는 캠퍼스 생성 흐름으로 안내합니다."
        actionLabel="초대코드 입력"
        actionAccessibilityLabel="캠퍼스 초대코드 입력 화면으로 이동"
        onActionPress={() => openEntryTarget('inviteCode')}
        {...(canCreateCampus
          ? {
              secondaryActionLabel: '캠퍼스 생성',
              secondaryActionAccessibilityLabel: '캠퍼스 생성 화면으로 이동',
              onSecondaryActionPress: () => openEntryTarget('campusCreate'),
            }
          : {})}
      />
      {canCreateCampus ? null : (
        <PermissionDenied
          title="캠퍼스 생성 권한이 없습니다"
          message="일반 USER는 초대코드로 참여할 수 있고, 캠퍼스 생성은 MANAGER 또는 ADMIN에게만 열립니다."
        />
      )}
      {entryTarget === 'inviteCode' ? (
        <InviteCodeForm
          clearNotice={clearNotice}
          onCancel={() => openEntryTarget(null)}
          onComplete={(nextState, campusName) => {
            setAuthState(nextState);
            setNotice({
              tone: 'success',
              title: '캠퍼스 참여 완료',
              message: `${campusName} 캠퍼스로 진입했습니다.`,
            });
          }}
          onSessionExpired={(message) => setAuthState({status: 'sessionExpired', message})}
          user={user}
        />
      ) : null}
      {entryTarget === 'campusCreate' && canCreateCampus ? (
        <CampusCreateForm
          clearNotice={clearNotice}
          onCancel={() => openEntryTarget(null)}
          onComplete={(nextState, campusName) => {
            setAuthState(nextState);
            setNotice({
              tone: 'success',
              title: '캠퍼스 생성 완료',
              message: `${campusName} 캠퍼스로 진입했습니다.`,
            });
          }}
          onSessionExpired={(message) => setAuthState({status: 'sessionExpired', message})}
          user={user}
        />
      ) : null}
    </>
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
  user: Extract<AuthGateState, {status: 'noCampus'}>['user'];
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
    <Card>
      <Eyebrow>초대코드</Eyebrow>
      <Title>초대코드를 입력해주세요</Title>
      <Body>관리자에게 받은 초대코드로 캠퍼스에 참여할 수 있어요.</Body>
      <TextField
        accessibilityLabel="캠퍼스 초대코드 입력"
        autoCapitalize="characters"
        error={fieldErrors.inviteCode}
        helper="영문 대문자, 숫자, 하이픈 형식으로 입력해 주세요."
        label="초대코드"
        onChangeText={(inviteCode) => setValues({inviteCode})}
        onSubmitEditing={submit}
        placeholder="FL-5BLKUSSH"
        returnKeyType="done"
        textContentType="none"
        value={values.inviteCode}
      />
      {formError ? <InlineError message={formError} /> : null}
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="초대코드로 캠퍼스 참여"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '참여 중...' : '참여하기'}
        </Button>
        <Button
          accessibilityLabel="초대코드 입력 취소"
          disabled={submitting}
          onPress={onCancel}
          variant="secondary">
          나중에
        </Button>
      </View>
    </Card>
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
  user: Extract<AuthGateState, {status: 'noCampus'}>['user'];
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
    <Card>
      <Eyebrow>캠퍼스 만들기</Eyebrow>
      <Title>새 캠퍼스 정보</Title>
      <Body>MANAGER 또는 ADMIN 권한만 캠퍼스를 만들 수 있어요.</Body>
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
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="캠퍼스 생성 제출"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '생성 중...' : '생성하기'}
        </Button>
        <Button
          accessibilityLabel="캠퍼스 생성 취소"
          disabled={submitting}
          onPress={onCancel}
          variant="secondary">
          취소
        </Button>
      </View>
    </Card>
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

function AuthNotice({notice}: {notice: NonNullable<SessionNotice>}) {
  return (
    <View style={styles.authNotice}>
      <Text style={styles.authNoticeTitle}>{notice.title}</Text>
      <Text style={styles.authNoticeMessage}>{notice.message}</Text>
    </View>
  );
}

function NoticeCard({notice}: {notice: NonNullable<SessionNotice>}) {
  return (
    <Card>
      <Chip label={notice.title} tone={notice.tone} />
      <Body>{notice.message}</Body>
    </Card>
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
  fallbackUser: Extract<AuthGateState, {status: 'noCampus'}>['user'],
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

function EntryTargetCard({target}: {target: EntryTarget}) {
  return (
    <Card>
      <Eyebrow>다음 화면 진입</Eyebrow>
      <Title>{getEntryTargetTitle(target)}</Title>
      <Body>{getEntryTargetDescription(target)}</Body>
    </Card>
  );
}

function AuthenticatedShell({
  route,
  setAuthState,
  setNotice,
  setRoute,
  state,
}: {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: SessionNotice) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
  route: ShellRoute;
  setRoute: (route: ShellRoute) => void;
}) {
  const [userHomeView, setUserHomeView] = useState<'dashboard' | 'monthlyCalendar'>('dashboard');
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [campusSwitchVisible, setCampusSwitchVisible] = useState(false);
  const [campusSwitchLoading, setCampusSwitchLoading] = useState(false);
  const [campusSwitchError, setCampusSwitchError] = useState<ApiError | null>(null);
  const [selectedCampusDetail, setSelectedCampusDetail] = useState<CampusDetail | null>(null);
  const routes = useMemo(
    () => getAvailableRoutes(state.user, state.selectedCampus),
    [state.selectedCampus, state.user],
  );
  const navItems = useMemo(
    () =>
      routes.map((availableRoute) => ({
        accessibilityLabel: `${getRouteLabel(availableRoute)} 탭으로 이동`,
        icon: getRouteIcon(availableRoute),
        id: availableRoute,
        label: getRouteLabel(availableRoute),
      })),
    [routes],
  );

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
      setAuthState(nextState);
      setCampusSwitchVisible(false);
      setNotice({
        tone: 'success',
        title: '캠퍼스 변경',
        message: `${detail.name} 캠퍼스로 전환했습니다.`,
      });
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
    const result = await logoutCurrentSession();
    setLoggingOut(false);
    setLogoutConfirmVisible(false);
    setRoute('userHome');
    setAuthState({status: 'signedOut'});

    if (result.status === 'signedOutWithRemoteWarning') {
      setNotice({
        tone: 'warning',
        title: '로그아웃 완료',
        message: result.message,
      });
    } else {
      setNotice({
        tone: 'success',
        title: '로그아웃 완료',
        message: '이 기기의 로그인 정보를 정리했습니다.',
      });
    }
  };

  const selectRoute = (nextRoute: ShellRoute) => {
    if (nextRoute === 'userHome') {
      setUserHomeView('dashboard');
    }

    setRoute(nextRoute);
  };

  return (
    <View style={styles.shell}>
      <NotificationPermissionFlow
        setAuthState={setAuthState}
        setNotice={setNotice}
        userId={state.user.id}
      />
      {route === 'userHome' ? (
        userHomeView === 'monthlyCalendar' ? (
          <MonthlyCalendarScreen
            onBackToHome={() => setUserHomeView('dashboard')}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : (
          <UserHomeDashboard
            onOpenDevotion={() => setRoute('devotion')}
            onOpenMonthlyCalendar={() => setUserHomeView('monthlyCalendar')}
            onOpenPayments={() => setRoute('payments')}
            onOpenPolls={() => setRoute('polls')}
            onOpenPrayers={() => setRoute('prayers')}
            onCampusSwitchPress={openCampusSwitch}
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        )
      ) : route === 'devotion' ? (
        <DevotionScreen
          onBackToHome={() => setRoute('userHome')}
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
      ) : route === 'payments' ? (
        <PaymentScreen
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
      ) : route === 'polls' ? (
        <PollScreen
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
      ) : route === 'prayers' ? (
        <PrayerScreen
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
      ) : route === 'profile' ? (
        <ProfileScreen
          onCampusSwitchPress={openCampusSwitch}
          onLogoutPress={() => setLogoutConfirmVisible(true)}
          onOpenPrayers={() => setRoute('prayers')}
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
      ) : route === 'campusAdmin' ? (
        <AdminScreen
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
      ) : route === 'serviceAdmin' ? (
        <ServiceAdminScreen
          onOpenCampusAdminFeature={() => setRoute('campusAdmin')}
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

      <BottomNav activeId={route} items={navItems} onSelect={selectRoute} />

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

      <LogoutConfirmSheet
        loading={loggingOut}
        onCancel={() => setLogoutConfirmVisible(false)}
        onConfirm={completeLogout}
        visible={logoutConfirmVisible}
      />
      <CampusSwitchSheet
        campuses={state.activeCampuses}
        currentCampusId={state.selectedCampus.campusId}
        error={campusSwitchError}
        loading={campusSwitchLoading}
        onCancel={() => setCampusSwitchVisible(false)}
        onRefresh={refreshCampuses}
        onSelect={selectCampus}
        visible={campusSwitchVisible}
      />
    </View>
  );
}

function UserHomeDashboard({
  onCampusSwitchPress,
  onOpenDevotion,
  onOpenMonthlyCalendar,
  onOpenPayments,
  onOpenPolls,
  onOpenPrayers,
  setAuthState,
  setNotice,
  state,
}: {
  onCampusSwitchPress: () => void;
  onOpenDevotion: () => void;
  onOpenMonthlyCalendar: () => void;
  onOpenPayments: () => void;
  onOpenPolls: () => void;
  onOpenPrayers: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: SessionNotice) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
}) {
  const [today, setToday] = useState(() => new Date());
  const weekStartDate = useMemo(() => getWeekStartDate(today), [today]);
  const {month, year} = useMemo(() => getYearMonth(today), [today]);
  const campusId = state.selectedCampus.campusId;
  const [overviewState, setOverviewState] = useState<
    CardState<{user: CurrentUser; campuses: CampusMembershipSummary[]}>
  >({status: 'idle'});
  const [devotionState, setDevotionState] = useState<CardState<WeeklyDevotionSummary>>({
    status: 'idle',
  });
  const [chargeState, setChargeState] = useState<CardState<ChargeSummary>>({status: 'idle'});
  const [pollState, setPollState] = useState<CardState<PollSummary[]>>({status: 'idle'});
  const [prayerState, setPrayerState] = useState<CardState<PrayerWeekSummary>>({status: 'idle'});
  const prayerEntryVariant = getHomePrayerEntryVariant(prayerState);

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

  const loadOverview = () =>
    runCardRequest('overview', setOverviewState, async (accessToken) => {
      const [user, campuses] = await Promise.all([
        fetchCurrentUser(accessToken),
        fetchMyCampuses(accessToken),
      ]);

      return {user, campuses};
    });
  const loadDevotion = () =>
    runCardRequest('devotion', setDevotionState, (accessToken) =>
      fetchWeeklyDevotionSummary(accessToken, campusId, weekStartDate),
    );
  const loadCharges = () =>
    runCardRequest('charges', setChargeState, (accessToken) =>
      fetchChargeSummary(accessToken, campusId, {month, year}),
    );
  const loadPolls = () =>
    runCardRequest('polls', setPollState, (accessToken) => fetchPolls(accessToken, campusId));
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
    void loadOverview();
    void loadDevotion();
    void loadCharges();
    void loadPolls();
    void loadPrayers();
  }, [campusId, month, weekStartDate, year]);

  const openHomeTarget = (target: string) => {
    if (target === '경건생활') {
      onOpenDevotion();
      return;
    }

    if (target === '투표') {
      onOpenPolls();
      return;
    }

    if (target === '기도제목') {
      onOpenPrayers();
      return;
    }

    if (target === '납부') {
      onOpenPayments();
      return;
    }

    setNotice({
      tone: 'info',
      title: '화면 준비 중',
      message: `${target} 상세 화면은 후속 이슈에서 연결됩니다. 홈 CTA 상태는 API 응답 기준으로 먼저 표시합니다.`,
    });
  };

  return (
    <View style={styles.userFrame}>
      <View style={styles.figmaHeader}>
        <Text style={styles.figmaTitle}>오늘의 FaithLog</Text>
        <Pressable
          accessibilityLabel="홈에서 캠퍼스 변경 시트 열기"
          accessibilityRole="button"
          disabled={state.activeCampuses.length <= 1}
          onPress={onCampusSwitchPress}
          style={styles.figmaCampusChip}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.figmaCampusText}>
            {state.selectedCampus.region} {state.selectedCampus.campusName}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityLabel="오늘 해야 할 일 전체 보기"
        accessibilityRole="button"
        onPress={() => {
          const actions = getTodayActions({chargeState, devotionState, pollState, prayerState, today});
          if (actions[0]) {
            openHomeTarget(actions[0].target);
          } else {
            onOpenDevotion();
          }
        }}
        style={({pressed}) => [styles.homeTodoCard, pressed ? styles.authButtonPressed : null]}>
        <Text style={styles.homeTodoLabel}>오늘 해야 할 일</Text>
        <View style={styles.homeTodoRow}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={1}
            style={styles.homeTodoTitle}>
            {getTodayActions({chargeState, devotionState, pollState, prayerState, today}).length}개 남았어요
          </Text>
          <View style={styles.homeTodoButton}>
            <Text style={styles.homeTodoButtonText}>전체보기</Text>
          </View>
        </View>
        <Text style={styles.homeTodoSummary}>
          {getHomeActionSummary({chargeState, devotionState, pollState, prayerState, today})}
        </Text>
      </Pressable>

      {prayerEntryVariant === 'suggestion' ? (
        <>
          <Text style={styles.figmaSectionTitle}>이번 주 루틴</Text>
          <HomePrayerEntryCard onPress={onOpenPrayers} prayerState={prayerState} />
          <HomeRoutineEntryCard
            actionLabel="체크"
            body={
              devotionState.status === 'success'
                ? `큐티 ${devotionState.data.quietTimeCount}/7 · 기도 ${devotionState.data.prayerCount}/7 · 말씀 ${devotionState.data.bibleReadingCount}/7`
                : '경건생활 체크를 확인해요'
            }
            onPress={onOpenDevotion}
            title="경건생활"
          />
          <HomeRoutineEntryCard
            actionLabel="입금"
            body={
              chargeState.status === 'success' && chargeState.data.monthlyUnpaidAmount > 0
                ? `이번 달 미납 ${formatWon(chargeState.data.monthlyUnpaidAmount)}`
                : '이번 달 납부 흐름을 확인해요'
            }
            onPress={onOpenPayments}
            title="최근 청구 항목"
          />
        </>
      ) : (
        <>
          <Text style={styles.figmaSectionTitle}>이번 달 요약</Text>
          <View style={styles.homeMetricRow}>
            <HomeMetricTile
              label="낸 금액"
              value={chargeState.status === 'success' ? formatCompactWon(chargeState.data.monthlyPaidAmount) : '확인 중'}
            />
            <HomeMetricTile
              label="미납"
              tone="danger"
              value={chargeState.status === 'success' ? formatCompactWon(chargeState.data.monthlyUnpaidAmount) : '확인 중'}
            />
            <HomeMetricTile
              label="지각"
              tone="warning"
              value={devotionState.status === 'success' ? `${devotionState.data.saturdayLateMinutes}분` : '확인 중'}
            />
          </View>

          <View style={styles.figmaSectionRow}>
            <Text style={styles.figmaSectionTitle}>경건생활</Text>
            <Pressable
              accessibilityLabel="월간 경건생활 캘린더 화면으로 이동"
              accessibilityRole="button"
              onPress={onOpenMonthlyCalendar}>
              <Text style={styles.figmaTextButton}>캘린더</Text>
            </Pressable>
          </View>
          <View style={styles.homeMetricRow}>
            <HomeMetricTile
              label="큐티"
              value={devotionState.status === 'success' ? `${devotionState.data.quietTimeCount}회` : '확인 중'}
              onPress={onOpenDevotion}
            />
            <HomeMetricTile
              label="기도"
              value={devotionState.status === 'success' ? `${devotionState.data.prayerCount}회` : '확인 중'}
              onPress={onOpenDevotion}
            />
            <HomeMetricTile
              label="말씀"
              value={devotionState.status === 'success' ? `${devotionState.data.bibleReadingCount}회` : '확인 중'}
              onPress={onOpenDevotion}
            />
          </View>
          <HomePrayerEntryCard onPress={onOpenPrayers} prayerState={prayerState} />
        </>
      )}

      {overviewState.status === 'error' ||
      devotionState.status === 'error' ||
      chargeState.status === 'error' ||
      pollState.status === 'error' ||
      prayerState.status === 'error' ? (
        <InlineError message="일부 정보를 불러오지 못했습니다. 각 탭에서 다시 확인할 수 있어요." />
      ) : null}
    </View>
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

function HomePrayerEntryCard({
  onPress,
  prayerState,
}: {
  onPress: () => void;
  prayerState: CardState<PrayerWeekSummary>;
}) {
  const variant = getHomePrayerEntryVariant(prayerState);
  const copy = getHomePrayerEntryCopy(variant, prayerState);

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
      <View style={styles.homePrayerText}>
        <Text style={styles.homePrayerEyebrow}>{copy.eyebrow}</Text>
        <Text numberOfLines={2} style={styles.homePrayerTitle}>
          {copy.title}
        </Text>
        <Text numberOfLines={2} style={styles.homePrayerBody}>
          {copy.body}
        </Text>
      </View>
      <View style={styles.homePrayerButton}>
        <Text style={styles.homePrayerButtonText}>{copy.actionLabel}</Text>
      </View>
    </Pressable>
  );
}

function HomeRoutineEntryCard({
  actionLabel,
  body,
  onPress,
  title,
}: {
  actionLabel: string;
  body: string;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${title} ${actionLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.homeRoutineCard, pressed ? styles.authButtonPressed : null]}>
      <View style={styles.homeRoutineText}>
        <Text numberOfLines={1} style={styles.homeRoutineTitle}>
          {title}
        </Text>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.homeRoutineBody}>
          {body}
        </Text>
      </View>
      <View style={styles.homePrayerButton}>
        <Text style={styles.homePrayerButtonText}>{actionLabel}</Text>
      </View>
    </Pressable>
  );
}

function TodayActionCard({
  chargeState,
  devotionState,
  onActionPress,
  pollState,
  prayerState,
  today,
}: {
  chargeState: CardState<ChargeSummary>;
  devotionState: CardState<WeeklyDevotionSummary>;
  onActionPress: (target: string) => void;
  pollState: CardState<PollSummary[]>;
  prayerState: CardState<PrayerWeekSummary>;
  today: Date;
}) {
  const actions = getTodayActions({chargeState, devotionState, pollState, prayerState, today});

  return (
    <Card>
      <Eyebrow>오늘 해야 할 액션 CTA</Eyebrow>
      <Title>{actions.length > 0 ? '바로 이어서 할 일' : '오늘은 큰 흐름이 정리됐어요'}</Title>
      <Body>
        {actions.length > 0
          ? 'API 응답 기준으로 아직 남은 작업을 먼저 보여줍니다.'
          : '카드가 모두 로드되면 추가 액션이 생길 수 있어요.'}
      </Body>
      <View style={styles.metaGrid}>
        {actions.length > 0 ? (
          actions.map((action) => (
            <ListRow
              accessibilityLabel={`${action.title} 상세 화면 안내`}
              key={action.title}
              label={action.title}
              onPress={() => onActionPress(action.target)}
              supportingText={action.description}
              value="열기"
            />
          ))
        ) : (
          <Body>응답 필요 투표, 오늘 경건 입력, 미납, 열린 기도제목을 찾으면 여기에 표시합니다.</Body>
        )}
      </View>
    </Card>
  );
}

function HomeDataCard<T>({
  actionLabel,
  children,
  loadingMessage,
  onRetry,
  state,
  title,
}: {
  actionLabel: string;
  children: (data: T) => ReactNode;
  loadingMessage: string;
  onRetry: () => void;
  state: CardState<T>;
  title: string;
}) {
  return (
    <Card>
      <Eyebrow>{title}</Eyebrow>
      {state.status === 'loading' || state.status === 'idle' ? (
        <Body>{loadingMessage}</Body>
      ) : null}
      {state.status === 'error' ? (
        <>
          <InlineError message={getHomeCardErrorMessage(state.error)} />
          <Button accessibilityLabel={actionLabel} onPress={onRetry} variant="secondary">
            다시 시도
          </Button>
        </>
      ) : null}
      {state.status === 'success' ? children(state.data) : null}
    </Card>
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
        <ListRow label="지역" supportingText="캠퍼스 프로필" value={state.selectedCampus.region} />
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

function getTodayActions({
  chargeState,
  devotionState,
  pollState,
  prayerState,
  today,
}: {
  chargeState: CardState<ChargeSummary>;
  devotionState: CardState<WeeklyDevotionSummary>;
  pollState: CardState<PollSummary[]>;
  prayerState: CardState<PrayerWeekSummary>;
  today: Date;
}) {
  const actions: Array<{title: string; description: string; target: string}> = [];

  if (devotionState.status === 'success') {
    const todayCheck = getTodayDevotionCheck(devotionState.data, today);

    if (!devotionState.data.submittedAt && (!todayCheck || !isDevotionDayComplete(todayCheck))) {
      actions.push({
        title: '오늘 경건생활 입력',
        description: '큐티, 기도, 성경읽기 체크가 아직 남아 있어요.',
        target: '경건생활',
      });
    }
  }

  if (pollState.status === 'success') {
    const unansweredOpenPolls = pollState.data.filter(
      (poll) => poll.status === 'OPEN' && !poll.responded,
    );

    if (unansweredOpenPolls.length > 0) {
      actions.push({
        title: '응답하지 않은 투표',
        description: `${unansweredOpenPolls.length}개 투표가 응답을 기다리고 있어요.`,
        target: '투표',
      });
    }
  }

  if (chargeState.status === 'success' && chargeState.data.monthlyUnpaidAmount > 0) {
    actions.push({
      title: '이번 달 미납 확인',
      description: `${formatWon(chargeState.data.monthlyUnpaidAmount)} 미납이 있어요.`,
      target: '납부',
    });
  }

  if (
    prayerState.status === 'success' &&
    prayerState.data.status === 'OPEN' &&
    prayerState.data.targetMemberCount > 0
  ) {
    actions.push({
      title: '기도제목 작성/확인',
      description: getPrayerEntryPolicy(prayerState.data),
      target: '기도제목',
    });
  }

  return actions;
}

function getHomeActionSummary({
  chargeState,
  devotionState,
  pollState,
  prayerState,
  today,
}: {
  chargeState: CardState<ChargeSummary>;
  devotionState: CardState<WeeklyDevotionSummary>;
  pollState: CardState<PollSummary[]>;
  prayerState: CardState<PrayerWeekSummary>;
  today: Date;
}) {
  const labels = getTodayActions({chargeState, devotionState, pollState, prayerState, today}).map(
    (action) => action.target,
  );

  if (labels.length === 0) {
    return '경건 · 투표 · 납부 흐름이 정리됐어요';
  }

  return labels.slice(0, 3).join(' · ');
}

function getTodayDevotionCheck(devotion: WeeklyDevotionSummary, today: Date) {
  const todayKey = formatLocalDate(today);

  return devotion.dailyChecks.find((check) => check.recordDate === todayKey);
}

function isDevotionDayComplete(check: WeeklyDevotionSummary['dailyChecks'][number]) {
  return check.quietTimeChecked && check.prayerChecked && check.bibleReadingChecked;
}

function getPrayerEntryPolicy(prayers: PrayerWeekSummary) {
  if (prayers.status === 'OPEN' && prayers.targetMemberCount > 0) {
    return '기도제목 진입 제안';
  }

  return '기도제목 상시 진입';
}

function getHomePrayerEntryVariant(
  prayerState: CardState<PrayerWeekSummary>,
): HomePrayerEntryVariant {
  if (
    prayerState.status === 'success' &&
    prayerState.data.status === 'OPEN' &&
    prayerState.data.targetMemberCount > 0
  ) {
    return 'suggestion';
  }

  return 'always';
}

function getHomePrayerEntryCopy(
  variant: HomePrayerEntryVariant,
  prayerState: CardState<PrayerWeekSummary>,
) {
  if (prayerState.status === 'loading' || prayerState.status === 'idle') {
    return {
      actionLabel: '보기',
      body: '이번 주 기도제목 상태를 확인하고 있어요.',
      eyebrow: '기도제목',
      title: '이번 주 기도제목',
    };
  }

  if (prayerState.status === 'error') {
    return {
      actionLabel: '확인',
      body: '기도 탭에서 다시 불러오거나 조별 입력 상태를 확인할 수 있어요.',
      eyebrow: '기도제목',
      title: '이번 주 기도제목',
    };
  }

  if (variant === 'suggestion') {
    return {
      actionLabel: '보기',
      body: getPrayerProgressSummary(prayerState.data),
      eyebrow: getPrayerEntryPolicy(prayerState.data),
      title: '조별 기도제목',
    };
  }

  return {
    actionLabel: '보기',
    body: getPrayerProgressSummary(prayerState.data),
    eyebrow: getPrayerEntryPolicy(prayerState.data),
    title: '이번 주 기도제목',
  };
}

function getPrayerProgressSummary(prayers: PrayerWeekSummary) {
  const primaryGroup = prayers.groups[0];

  if (!primaryGroup) {
    return `전체 ${prayers.submittedCount}/${prayers.targetMemberCount} 작성`;
  }

  const groupSubmittedCount = primaryGroup.members.filter((member) => member.submittedAt).length;

  return `${primaryGroup.groupName} ${groupSubmittedCount}/${primaryGroup.members.length} 작성 · 전체 ${prayers.submittedCount}/${prayers.targetMemberCount} 작성`;
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

function formatWon(amount: number) {
  return `${Math.max(0, amount).toLocaleString('ko-KR')}원`;
}

function formatCompactWon(amount: number) {
  const safeAmount = Math.max(0, amount);

  if (safeAmount >= 1000) {
    return `${Number((safeAmount / 1000).toFixed(1)).toLocaleString('ko-KR')}K`;
  }

  return `${safeAmount.toLocaleString('ko-KR')}원`;
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

function getHomeCardErrorMessage(error: ApiError) {
  return getApiErrorPresentation(error, {
    conflictMessage: '최신 데이터와 충돌했습니다. 다시 불러와 주세요.',
    permissionMessage: '이 카드의 데이터를 조회할 권한이 없습니다.',
  }).message;
}

function NotificationPermissionFlow({
  setAuthState,
  setNotice,
  userId,
}: {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: SessionNotice) => void;
  userId: number;
}) {
  const [state, setState] = useState<NotificationUiState>({status: 'checking'});

  const inspect = async (silent = false) => {
    if (!silent) {
      setState({status: 'checking'});
    }

    try {
      setState(await inspectFcmRegistrationStatus());
    } catch {
      setState({
        status: 'error',
        error: {kind: 'error', message: '알림 권한 상태를 확인하지 못했습니다.'},
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

      if (result.status === 'registered') {
        setNotice({
          tone: 'success',
          title: '알림 설정 완료',
          message: '이 기기의 알림 연결을 완료했습니다.',
        });
      }
    } catch (error) {
      const apiError = toApiError(error, '기기 알림을 연결하지 못했습니다.');
      setState({status: 'error', error: apiError});

      if (apiError.kind === 'sessionExpired') {
        setAuthState({status: 'sessionExpired', message: apiError.message});
      }
    }
  };

  useEffect(() => {
    void inspect(true);
  }, [userId]);

  if (
    state.status === 'checking' ||
    state.status === 'dismissed' ||
    state.status === 'registered' ||
    state.status === 'registeredLocal'
  ) {
    return null;
  }

  if (state.status === 'permissionPrompt') {
    return (
      <Card>
        <Eyebrow>알림 권한</Eyebrow>
        <Title>알림을 켜둘까요?</Title>
        <Body>기도, 투표, 납부처럼 놓치면 아쉬운 공동체 소식을 받을 수 있어요.</Body>
        <View style={styles.metaGrid}>
          <ListRow label="기도제목" supportingText="새 기도제목과 조별 업데이트" value="알림" />
          <ListRow label="투표" supportingText="수요예배, 토요모임, 커피 투표" value="알림" />
          <ListRow label="납부" supportingText="미납 또는 납부 확인 안내" value="알림" />
        </View>
        <View style={styles.actionRow}>
          <Button accessibilityLabel="알림 권한 요청 후 기기 알림 연결" onPress={register}>
            알림 켜기
          </Button>
          <Button
            accessibilityLabel="알림 권한 요청 나중에 하기"
            onPress={() => setState({status: 'dismissed'})}
            variant="secondary">
            나중에
          </Button>
        </View>
      </Card>
    );
  }

  if (state.status === 'permissionDenied') {
    const blocked = state.permission === 'blocked' || state.permission === 'unavailable';

    return (
      <Card>
        <Eyebrow>알림 설정</Eyebrow>
        <Title>{blocked ? '알림이 꺼져 있어요' : '알림 권한이 거절됐어요'}</Title>
        <Body>
          {blocked
            ? '기기 설정에서 FaithLog 알림을 다시 켤 수 있어요.'
            : '권한 요청을 다시 시도하거나 설정에서 알림을 허용해 주세요.'}
        </Body>
        <InlineError message={getNotificationPermissionMessage(state.permission)} />
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel={blocked ? 'OS 알림 설정 열기' : '알림 권한 다시 요청'}
            onPress={blocked ? () => void openNotificationSettings() : register}
            variant="secondary">
            {blocked ? '설정 열기' : '다시 요청'}
          </Button>
          <Button
            accessibilityLabel="알림 비활성 안내 닫기"
            onPress={() => setState({status: 'dismissed'})}
            variant="ghost">
            닫기
          </Button>
        </View>
      </Card>
    );
  }

  const failure = state.status === 'error' ? getNotificationFailurePresentation(state.error) : null;

  return (
    <FcmTokenFailedCard
      busy={state.status === 'registering'}
      body={failure?.body ?? '권한은 켜져 있지만 이 기기를 알림 서버에 연결하지 못했어요.'}
      message={failure?.message ?? '기기 알림 연결 상태를 확인한 뒤 다시 시도해 주세요.'}
      onDismiss={() => setState({status: 'dismissed'})}
      onRetry={state.status === 'error' ? () => void inspect() : register}
      title={failure?.title ?? '기기 알림 연결 실패'}
    />
  );
}

function NotificationSettingsDetail({
  setAuthState,
  setNotice,
}: {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: SessionNotice) => void;
}) {
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

      if (result.status === 'registered') {
        setNotice({
          tone: 'success',
          title: '알림 등록 완료',
          message: '이 기기의 알림 연결을 완료했습니다.',
        });
      }
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
      setNotice({
        tone: 'success',
        title: '알림 비활성화',
        message: '이 기기의 알림 연결을 해제했습니다.',
      });
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
          disabled={state.status === 'checking' || state.status === 'registering' || state.status === 'deactivating'}
          onPress={inspect}
          variant="secondary">
          {state.status === 'checking' ? '확인 중...' : '다시 확인'}
        </Button>
        <Button
          accessibilityLabel="기기 알림 등록 다시 시도"
          disabled={state.status === 'checking' || state.status === 'registering' || state.status === 'deactivating'}
          onPress={register}>
          {state.status === 'registering' ? '등록 중...' : '알림 켜기'}
        </Button>
        <Button
          accessibilityLabel="이 기기 알림 연결 해제"
          disabled={state.status === 'checking' || state.status === 'registering' || state.status === 'deactivating'}
          onPress={deactivate}
          variant="danger">
          {state.status === 'deactivating' ? '비활성화 중...' : '비활성화'}
        </Button>
      </View>
    </View>
  );
}

function FcmTokenFailedCard({
  body,
  busy,
  message,
  onDismiss,
  onRetry,
  title,
}: {
  body: string;
  busy: boolean;
  message: string;
  onDismiss: () => void;
  onRetry: () => void;
  title: string;
}) {
  return (
    <View style={styles.notificationDetailCard}>
      <Eyebrow>기기 알림</Eyebrow>
      <Title>{title}</Title>
      <Body>{body}</Body>
      <InlineError message={message} />
      <View style={styles.notificationRowList}>
        <ListRow label="재시도" supportingText="네트워크가 안정적일 때 다시 등록" value="권장" />
        <ListRow label="나중에 하기" supportingText="앱 사용은 계속할 수 있어요" value="선택" />
      </View>
      <View style={styles.notificationActionRow}>
        <Button accessibilityLabel="기기 알림 등록 다시 시도" disabled={busy} onPress={onRetry}>
          {busy ? '다시 시도 중...' : '다시 시도'}
        </Button>
        <Button
          accessibilityLabel="알림 등록 실패 안내 닫기"
          disabled={busy}
          onPress={onDismiss}
          variant="secondary">
          나중에
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

function getNotificationFailurePresentation(error: ApiError) {
  switch (error.kind) {
    case 'sessionExpired':
      return {
        title: '다시 로그인해 주세요',
        body: '세션이 만료되어 이 기기의 알림을 연결하지 못했어요.',
        message: getNotificationApiErrorMessage(error),
      };
    case 'permissionDenied':
      return {
        title: '알림 연결 권한이 없어요',
        body: '현재 계정으로는 이 기기의 알림을 연결할 수 없어요.',
        message: getNotificationApiErrorMessage(error),
      };
    case 'offline':
      return {
        title: '네트워크 연결이 필요해요',
        body: '오프라인 상태에서는 기기 알림 연결을 완료할 수 없어요.',
        message: getNotificationApiErrorMessage(error),
      };
    case 'conflict':
      return {
        title: '알림 상태를 다시 확인해 주세요',
        body: '서버의 최신 알림 연결 상태와 맞지 않아 다시 확인이 필요해요.',
        message: getNotificationApiErrorMessage(error),
      };
    case 'error':
      return {
        title: '기기 알림 연결 실패',
        body: '권한은 켜져 있지만 이 기기를 알림 서버에 연결하지 못했어요.',
        message: getNotificationApiErrorMessage(error),
      };
    default:
      return assertNever(error.kind);
  }
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
  onCampusSwitchPress,
  onLogoutPress,
  onOpenPrayers,
  setAuthState,
  setNotice,
  state,
}: {
  onCampusSwitchPress: () => void;
  onLogoutPress: () => void;
  onOpenPrayers: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: SessionNotice) => void;
  state: Extract<AuthGateState, {status: 'authenticated'}>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<ApiError | null>(null);

  const refreshProfile = async () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    setRefreshError(null);
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
      setNotice({
        tone: 'success',
        title: '프로필 갱신',
        message: '내 정보와 캠퍼스 목록을 다시 불러왔습니다.',
      });
    } catch (error) {
      if (error instanceof FaithLogApiError) {
        setRefreshError(error.detail);
        if (error.detail.kind === 'sessionExpired') {
          setAuthState({status: 'sessionExpired', message: error.detail.message});
        }
      } else {
        setRefreshError({kind: 'error', message: '내 정보를 불러오지 못했습니다.'});
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.userFrame}>
      <View style={styles.figmaHeader}>
        <Text style={styles.figmaTitle}>내정보</Text>
        <View style={styles.figmaCampusChip}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.figmaCampusText}>
            {state.selectedCampus.region} {state.selectedCampus.campusName}
          </Text>
        </View>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileInfo}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.profileName}>
            {state.user.name}
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
          actionLabel="보기"
          onPress={onOpenPrayers}
          subtitle="전체 조별 기도제목 한 페이지 조회"
          title="조별 기도제목"
        />
        <ProfileActionRow
          actionLabel="작성"
          onPress={onOpenPrayers}
          subtitle="내 조 조원별 기도제목 작성"
          title="기도제목 입력"
        />
        <ProfileActionRow
          actionLabel="관리"
          onPress={onCampusSwitchPress}
          subtitle="다른 캠퍼스 초대코드 입력"
          title="캠퍼스 참여 코드"
        />
      </View>

      <Text style={styles.figmaSectionTitle}>계정</Text>
      <View style={styles.profileRowList}>
        <ProfileActionRow
          actionLabel="로그아웃"
          actionTone="danger"
          onPress={onLogoutPress}
          subtitle="현재 기기에서 세션 종료"
          title="로그아웃"
        />
      </View>
        {refreshError ? (
          <InlineError message={getProfileRefreshMessage(refreshError)} />
        ) : null}
      <NotificationSettingsDetail setAuthState={setAuthState} setNotice={setNotice} />
      {refreshing ? <Body>내 정보를 다시 불러오고 있어요.</Body> : null}
    </View>
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
  icon?: string;
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
          <Text style={styles.profileActionIconText}>{icon}</Text>
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
  currentCampusId,
  error,
  loading,
  onCancel,
  onRefresh,
  onSelect,
  visible,
}: {
  campuses: CampusMembershipSummary[];
  currentCampusId: number;
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onRefresh: () => void;
  onSelect: (campus: CampusMembershipSummary) => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Eyebrow>공동체</Eyebrow>
          <Title>공동체 메뉴</Title>
          <Body>현재 참여 중인 공동체를 확인하고 이동할 공동체를 선택할 수 있어요.</Body>
          {error ? <InlineError message={getCampusSwitchErrorMessage(error)} /> : null}
          <View style={styles.metaGrid}>
            {campuses.length > 0 ? (
              campuses.map((campus) => {
                const selected = campus.campusId === currentCampusId;

                return (
                  <ListRow
                    accessibilityLabel={`${campus.campusName} 공동체로 변경`}
                    key={campus.membershipId}
                    label={campus.campusName}
                    onPress={() => onSelect(campus)}
                    supportingText={`${campus.region} · ${getCampusRoleDisplayLabel(campus.campusRole)}`}
                    value={selected ? '현재' : '선택'}
                  />
                );
              })
            ) : (
              <Body>참여 중인 공동체가 없습니다.</Body>
            )}
          </View>
          <Body>선택 후 해당 공동체의 홈 화면으로 이동합니다.</Body>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="공동체 목록 다시 불러오기"
              disabled={loading}
              onPress={onRefresh}
              variant="secondary">
              {loading ? '불러오는 중...' : '목록 갱신'}
            </Button>
            <Button
              accessibilityLabel="공동체 메뉴 닫기"
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

function getProfileRefreshMessage(error: ApiError) {
  return getApiErrorPresentation(error, {
    conflictMessage: '내 정보가 최신 상태와 충돌했습니다. 다시 시도해 주세요.',
    permissionMessage: '내 정보를 조회할 권한이 없습니다.',
  }).message;
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
      return 'H';
    case 'devotion':
      return 'D';
    case 'payments':
      return 'W';
    case 'polls':
      return 'V';
    case 'prayers':
      return 'R';
    case 'profile':
      return 'P';
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

function getEntryTargetTitle(target: EntryTarget) {
  switch (target) {
    case 'login':
      return '로그인 화면 shell';
    case 'signup':
      return '회원가입 화면 shell';
    case 'inviteCode':
      return '초대코드 입력 shell';
    case 'campusCreate':
      return '캠퍼스 생성 shell';
    default:
      return assertNever(target);
  }
}

function getEntryTargetDescription(target: EntryTarget) {
  switch (target) {
    case 'login':
      return '이메일과 비밀번호로 로그인하고 세션을 안전하게 저장합니다.';
    case 'signup':
      return '이름, 이메일, 비밀번호를 확인하고 오류를 안내합니다.';
    case 'inviteCode':
      return 'ACTIVE 캠퍼스가 없을 때 초대코드 입력 흐름으로 이동할 수 있는 진입점입니다.';
    case 'campusCreate':
      return 'ACTIVE 캠퍼스가 없을 때 캠퍼스 생성 흐름으로 이동할 수 있는 진입점입니다.';
    default:
      return assertNever(target);
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  authSafeArea: {
    backgroundColor: authColors.background,
  },
  keyboardRoot: {
    flex: 1,
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
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  authFrame: {
    alignSelf: 'center',
    gap: 12,
    maxWidth: 390,
    minHeight: 640,
    width: '100%',
  },
  loginAuthFrame: {
    paddingTop: 30,
  },
  signupAuthFrame: {
    paddingTop: 30,
  },
  loginHero: {
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 28,
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
    marginBottom: 44,
    maxWidth: 300,
    textAlign: 'center',
  },
  signupHeader: {
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 34,
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
  signupAuthActionRow: {
    marginTop: 34,
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
  authNotice: {
    backgroundColor: authColors.input,
    borderColor: authColors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    marginTop: 18,
    maxWidth: 342,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  authNoticeTitle: {
    color: authColors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  authNoticeMessage: {
    color: authColors.textMuted,
    fontSize: 15,
    lineHeight: 20,
  },
  actionRow: {
    gap: 10,
    marginTop: 6,
  },
  shell: {
    backgroundColor: colors.background,
    gap: 16,
  },
  userFrame: {
    backgroundColor: colors.background,
    gap: 20,
    paddingTop: 2,
  },
  figmaHeader: {
    alignItems: 'flex-start',
    gap: 10,
  },
  figmaTitle: {
    color: authColors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  figmaCampusChip: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    height: 28,
    justifyContent: 'center',
    maxWidth: '100%',
    minWidth: 72,
    paddingHorizontal: 10,
  },
  figmaCampusText: {
    color: colors.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: '100%',
  },
  figmaSectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  figmaSectionTitle: {
    color: authColors.text,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 28,
  },
  figmaTextButton: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  homeTodoCard: {
    backgroundColor: authColors.input,
    borderRadius: 24,
    gap: 10,
    minHeight: 146,
    paddingHorizontal: 24,
    paddingVertical: 26,
    shadowColor: colors.textPrimary,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  homeTodoLabel: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  homeTodoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  homeTodoTitle: {
    color: authColors.text,
    flexShrink: 1,
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 36,
    minWidth: 0,
  },
  homeTodoButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 82,
  },
  homeTodoButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  homeTodoSummary: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 19,
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
    width: 62,
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
    justifyContent: 'space-between',
    minHeight: 96,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  homePrayerCardSuggested: {
    borderColor: colors.borderSoft,
  },
  homePrayerEyebrow: {
    color: authColors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
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
    justifyContent: 'space-between',
    minHeight: 104,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  homeChargeText: {
    flex: 1,
    gap: 8,
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
    width: 62,
  },
  homeChargeButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
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
    borderRadius: 16,
    gap: spacing.gap,
    padding: spacing.card,
  },
});
