import {type ReactNode, useEffect, useMemo, useState} from 'react';
import {Modal, SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';

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
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
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
  Empty,
  ErrorState,
  Eyebrow,
  ListRow,
  Loading,
  Offline,
  PermissionDenied,
  Screen,
  ScreenHeader,
  TextField,
  Title,
} from '../components/ui';
import {getAvailableRoutes, getRouteLabel, type ShellRoute} from '../navigation/shellRoutes';
import {DevotionScreen} from '../devotion/DevotionScreen';
import {
  deactivateCurrentFcmToken,
  inspectFcmRegistrationStatus,
  registerCurrentFcmToken,
  type FcmRegistrationStatus,
} from '../notifications/fcmRegistration';
import {openNotificationSettings} from '../notifications/notificationAdapter';
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
      setRoute('userHome');
      return;
    }

    const routes = getAvailableRoutes(authState.user, authState.selectedCampus);

    if (!routes.includes(route)) {
      setRoute(routes[0]!);
    }
  }, [authState, route]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <AppHeader />
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
    </SafeAreaView>
  );
}

function AppHeader() {
  return (
    <ScreenHeader
      action={<Chip label="M1 Foundation" tone="info" />}
      subtitle="공동체 생활을 한 흐름으로"
      title="FaithLog"
    />
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
        onSessionExpired('저장된 access token이 없습니다.');
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
      <Eyebrow>User 03 Invite Code</Eyebrow>
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
        onSessionExpired('저장된 access token이 없습니다.');
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
      <Eyebrow>User 03-1 Campus Create</Eyebrow>
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
    <Card>
      <Eyebrow>User 01 Login</Eyebrow>
      <Title>로그인</Title>
      <Body>이메일과 비밀번호로 FaithLog에 들어갑니다.</Body>
      <TextField
        accessibilityLabel="로그인 이메일 입력"
        error={fieldErrors.email}
        keyboardType="email-address"
        label="이메일"
        onChangeText={(email) => setValues((current) => ({...current, email}))}
        placeholder="name@example.com"
        returnKeyType="next"
        textContentType="emailAddress"
        value={values.email}
      />
      <TextField
        accessibilityLabel="로그인 비밀번호 입력"
        error={fieldErrors.password}
        label="비밀번호"
        onChangeText={(password) => setValues((current) => ({...current, password}))}
        onSubmitEditing={submit}
        returnKeyType="done"
        secureTextEntry
        textContentType="password"
        value={values.password}
      />
      {formError ? <InlineError message={formError} /> : null}
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="로그인 제출"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '로그인 중...' : '로그인'}
        </Button>
        <Button
          accessibilityLabel="회원가입 화면으로 이동"
          disabled={submitting}
          onPress={switchToSignup}
          variant="secondary">
          회원가입
        </Button>
      </View>
    </Card>
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
          email: error.detail.message || '이미 가입된 이메일입니다.',
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
    <Card>
      <Eyebrow>User 02 Signup</Eyebrow>
      <Title>회원가입</Title>
      <Body>가입 후 로그인하면 캠퍼스 초대 또는 생성 흐름으로 이어집니다.</Body>
      <TextField
        accessibilityLabel="회원가입 이름 입력"
        autoCapitalize="words"
        error={fieldErrors.name}
        label="이름"
        onChangeText={(name) => setValues((current) => ({...current, name}))}
        placeholder="홍길동"
        returnKeyType="next"
        textContentType="name"
        value={values.name}
      />
      <TextField
        accessibilityLabel="회원가입 이메일 입력"
        error={fieldErrors.email}
        keyboardType="email-address"
        label="이메일"
        onChangeText={(email) => setValues((current) => ({...current, email}))}
        placeholder="name@example.com"
        returnKeyType="next"
        textContentType="emailAddress"
        value={values.email}
      />
      <TextField
        accessibilityLabel="회원가입 비밀번호 입력"
        error={fieldErrors.password}
        helper="4자 이상 입력해 주세요."
        label="비밀번호"
        onChangeText={(password) => setValues((current) => ({...current, password}))}
        returnKeyType="next"
        secureTextEntry
        textContentType="newPassword"
        value={values.password}
      />
      <TextField
        accessibilityLabel="회원가입 비밀번호 확인 입력"
        error={fieldErrors.passwordConfirm}
        label="비밀번호 확인"
        onChangeText={(passwordConfirm) =>
          setValues((current) => ({...current, passwordConfirm}))
        }
        onSubmitEditing={submit}
        returnKeyType="done"
        secureTextEntry
        textContentType="newPassword"
        value={values.passwordConfirm}
      />
      {formError ? <InlineError message={formError} /> : null}
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="회원가입 제출"
          disabled={submitting}
          onPress={submit}>
          {submitting ? '가입 중...' : '회원가입'}
        </Button>
        <Button
          accessibilityLabel="로그인 화면으로 이동"
          disabled={submitting}
          onPress={switchToLogin}
          variant="secondary">
          로그인으로
        </Button>
      </View>
    </Card>
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
  switch (error.kind) {
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'permissionDenied':
      return '캠퍼스 생성 또는 참여 권한이 없습니다.';
    case 'conflict':
      if (error.code === 'CAMPUS_ALREADY_JOINED') {
        return '이미 참여 중인 캠퍼스입니다.';
      }

      return error.message || '이미 처리된 요청입니다. 캠퍼스 목록을 다시 확인해 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'error':
      return error.message || fallback;
    default:
      return assertNever(error.kind);
  }
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
      return error.message;
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'error':
      return error.message;
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
        setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
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
        setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
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
        message: '이 기기에 저장된 토큰을 삭제했습니다.',
      });
    }
  };

  return (
    <View style={styles.shell}>
      <NotificationPermissionFlow
        setAuthState={setAuthState}
        setNotice={setNotice}
        userId={state.user.id}
      />
      {route === 'userHome' ? (
        <UserHomeDashboard
          onOpenDevotion={() => setRoute('devotion')}
          onOpenPayments={() => setRoute('payments')}
          onOpenPolls={() => setRoute('polls')}
          onOpenPrayers={() => setRoute('prayers')}
          onCampusSwitchPress={openCampusSwitch}
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
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

      <BottomNav activeId={route} items={navItems} onSelect={setRoute} />

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
  onOpenPayments,
  onOpenPolls,
  onOpenPrayers,
  setAuthState,
  setNotice,
  state,
}: {
  onCampusSwitchPress: () => void;
  onOpenDevotion: () => void;
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
          message: '저장된 access token이 없습니다.',
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
    <>
      <Card>
        <View style={styles.homeHeaderRow}>
          <View style={styles.homeHeaderText}>
            <Chip label={`${state.selectedCampus.region} ${state.selectedCampus.campusName}`} tone="info" />
            <Title>{state.user.name}님, 오늘 할 일을 확인해요</Title>
            <Body>경건, 투표, 납부, 기도제목을 카드별로 따로 불러옵니다.</Body>
          </View>
          {state.activeCampuses.length > 1 ? (
            <Button
              accessibilityLabel="홈에서 캠퍼스 변경 시트 열기"
              onPress={onCampusSwitchPress}
              variant="secondary">
              캠퍼스 변경
            </Button>
          ) : null}
        </View>
      </Card>

      <TodayActionCard
        chargeState={chargeState}
        devotionState={devotionState}
        onActionPress={openHomeTarget}
        pollState={pollState}
        prayerState={prayerState}
        today={today}
      />

      <HomeDataCard
        actionLabel="내 정보 다시 불러오기"
        loadingMessage="내 정보와 캠퍼스 목록을 불러오고 있어요."
        onRetry={loadOverview}
        state={overviewState}
        title="내 캠퍼스">
        {(overview) => (
          <View style={styles.metaGrid}>
            <ListRow label="이름" supportingText="GET /api/v1/users/me" value={overview.user.name} />
            <ListRow label="전역 역할" supportingText="사용자 화면 기준" value={overview.user.role} />
            <ListRow
              label="ACTIVE 캠퍼스"
              supportingText="GET /api/v1/campuses/me"
              value={`${overview.campuses.filter((campus) => campus.status === 'ACTIVE').length}개`}
            />
          </View>
        )}
      </HomeDataCard>

      <HomeDataCard
        actionLabel="경건 카드 다시 불러오기"
        loadingMessage="이번 주 경건생활을 확인하고 있어요."
        onRetry={loadDevotion}
        state={devotionState}
        title="이번 주 경건생활">
        {(devotion) => {
          const todayCheck = getTodayDevotionCheck(devotion, today);
          const completedToday = todayCheck ? isDevotionDayComplete(todayCheck) : false;

          return (
            <View style={styles.metaGrid}>
              <ListRow label="큐티" supportingText="주간 체크 수" value={`${devotion.quietTimeCount}/7`} />
              <ListRow label="기도" supportingText="주간 체크 수" value={`${devotion.prayerCount}/7`} />
              <ListRow
                label="성경읽기"
                supportingText={devotion.submittedAt ? '제출 완료 주차' : '아직 제출 전'}
                value={`${devotion.bibleReadingCount}/7`}
              />
              <ListRow
                label="오늘 상태"
                supportingText={todayCheck ? todayCheck.recordDate : '오늘 날짜가 주차 범위 밖입니다'}
                value={completedToday ? '완료' : '입력 필요'}
              />
              <Button
                accessibilityLabel="경건생활 주간 입력 화면으로 이동"
                onPress={onOpenDevotion}
                variant="secondary">
                경건생활 관리
              </Button>
            </View>
          );
        }}
      </HomeDataCard>

      <HomeDataCard
        actionLabel="납부 카드 다시 불러오기"
        loadingMessage="이번 달 납부 요약을 확인하고 있어요."
        onRetry={loadCharges}
        state={chargeState}
        title="이번 달 납부">
        {(charges) => (
          <View style={styles.metaGrid}>
            <ListRow
              label="미납"
              supportingText={`${year}년 ${month}월 청구 기준`}
              value={formatWon(charges.monthlyUnpaidAmount)}
            />
            <ListRow label="납부 완료" supportingText="paidAt 기준" value={formatWon(charges.monthlyPaidAmount)} />
            <ListRow
              label="총 청구"
              supportingText="createdAt 기준"
              value={formatWon(charges.monthlyTotalChargeAmount)}
            />
            <Button
              accessibilityLabel="내 납부 목록 화면으로 이동"
              onPress={onOpenPayments}
              variant="secondary">
              납부 관리
            </Button>
          </View>
        )}
      </HomeDataCard>

      <HomeDataCard
        actionLabel="투표 카드 다시 불러오기"
        loadingMessage="열려 있는 투표를 불러오고 있어요."
        onRetry={loadPolls}
        state={pollState}
        title="참여할 투표">
        {(polls) => {
          const openPolls = polls.filter((poll) => poll.status === 'OPEN');
          const unansweredPolls = openPolls.filter((poll) => !poll.responded);

          if (polls.length === 0) {
            return <Body>현재 조회 가능한 투표가 없습니다.</Body>;
          }

          return (
            <View style={styles.metaGrid}>
              <ListRow label="열린 투표" supportingText="GET /api/v1/campuses/{campusId}/polls" value={`${openPolls.length}개`} />
              <ListRow label="응답 필요" supportingText="responded=false" value={`${unansweredPolls.length}개`} />
              {openPolls.slice(0, 2).map((poll) => (
                <ListRow
                  key={poll.id}
                  label={poll.title}
                  supportingText={`${poll.pollType} · ${poll.selectionType}`}
                  value={poll.responded ? '응답됨' : '응답하기'}
                />
              ))}
            </View>
          );
        }}
      </HomeDataCard>

      <HomeDataCard
        actionLabel="기도제목 카드 다시 불러오기"
        loadingMessage="이번 주 기도제목 게시판을 확인하고 있어요."
        onRetry={loadPrayers}
        state={prayerState}
        title="기도제목">
        {(prayers) => {
          const entryPolicy = getPrayerEntryPolicy(prayers);

          return (
            <View style={styles.metaGrid}>
              <ListRow label="진입 정책" supportingText="User 04-1 Home" value={entryPolicy} />
              <ListRow
                label="작성 현황"
                supportingText={prayers.status}
                value={`${prayers.submittedCount}/${prayers.targetMemberCount}`}
              />
              <ListRow label="기도조" supportingText="활성 조 목록" value={`${prayers.groups.length}개`} />
              {prayers.groups.length === 0 ? <Body>이번 주 활성 기도조가 없습니다.</Body> : null}
              <Button
                accessibilityLabel="기도제목 화면으로 이동"
                onPress={onOpenPrayers}
                variant="secondary">
                기도제목 작성/확인
              </Button>
            </View>
          );
        }}
      </HomeDataCard>
    </>
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
            supportingText="GET /api/v1/campuses/{campusId}"
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
  switch (error.kind) {
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'permissionDenied':
      return '이 카드의 데이터를 조회할 권한이 없습니다.';
    case 'conflict':
      return '최신 데이터와 충돌했습니다. 다시 불러와 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'error':
      return error.message;
    default:
      return assertNever(error.kind);
  }
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
        setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
        return;
      }

      const result = await registerCurrentFcmToken(accessToken);
      setState(result);

      if (result.status === 'registered') {
        setNotice({
          tone: 'success',
          title: '알림 설정 완료',
          message: '이 기기의 알림 토큰을 서버에 등록했습니다.',
        });
      }
    } catch (error) {
      const apiError = toApiError(error, '알림 토큰을 등록하지 못했습니다.');
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
        <Eyebrow>App 01 Notification Permission Request</Eyebrow>
        <Title>알림을 켜둘까요?</Title>
        <Body>중요한 공동체 알림을 받을 수 있어요.</Body>
        <View style={styles.metaGrid}>
          <ListRow label="기도제목" supportingText="새 기도제목과 조별 업데이트" value="알림" />
          <ListRow label="투표" supportingText="수요예배, 토요모임, 커피 투표" value="알림" />
          <ListRow label="납부" supportingText="미납 또는 납부 확인 안내" value="알림" />
        </View>
        <View style={styles.actionRow}>
          <Button accessibilityLabel="알림 권한 요청 후 토큰 등록" onPress={register}>
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
        <Eyebrow>App 01-1 Notification Disabled</Eyebrow>
        <Title>{blocked ? '알림이 꺼져 있어요' : '알림 권한이 거절됐어요'}</Title>
        <Body>
          {blocked
            ? '설정에서 다시 켤 수 있어요.'
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

  return (
    <FcmTokenFailedCard
      busy={state.status === 'registering'}
      message={
        state.status === 'error'
          ? getNotificationApiErrorMessage(state.error)
          : '권한은 켜져 있지만 토큰 등록에 실패했어요.'
      }
      onDismiss={() => setState({status: 'dismissed'})}
      onRetry={state.status === 'error' ? () => void inspect() : register}
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
        setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
        return;
      }

      const result = await registerCurrentFcmToken(accessToken);
      setState(result);

      if (result.status === 'registered') {
        setNotice({
          tone: 'success',
          title: '알림 등록 완료',
          message: '이 기기의 알림 토큰을 서버에 등록했습니다.',
        });
      }
    } catch (error) {
      const apiError = toApiError(error, '알림 토큰을 등록하지 못했습니다.');
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
        setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
        return;
      }

      await deactivateCurrentFcmToken(accessToken);
      setNotice({
        tone: 'success',
        title: '알림 비활성화',
        message: '이 기기의 알림 토큰을 비활성화했습니다.',
      });
      await inspect();
    } catch (error) {
      const apiError = toApiError(error, '알림 토큰을 비활성화하지 못했습니다.');
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
    <Card>
      <Eyebrow>알림 설정 상세</Eyebrow>
      <Title>알림 상세</Title>
      <Body>권한 상태와 이 기기의 FCM token 등록 상태를 분리해서 확인합니다.</Body>
      <View style={styles.metaGrid}>
        {renderNotificationSettingRows(state)}
      </View>
      {state.status === 'error' ? (
        <InlineError message={getNotificationApiErrorMessage(state.error)} />
      ) : null}
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="알림 설정 다시 확인"
          disabled={state.status === 'checking' || state.status === 'registering' || state.status === 'deactivating'}
          onPress={inspect}
          variant="secondary">
          {state.status === 'checking' ? '확인 중...' : '다시 확인'}
        </Button>
        <Button
          accessibilityLabel="알림 토큰 등록 재시도"
          disabled={state.status === 'checking' || state.status === 'registering' || state.status === 'deactivating'}
          onPress={register}>
          {state.status === 'registering' ? '등록 중...' : '알림 켜기'}
        </Button>
        <Button
          accessibilityLabel="이 기기 알림 토큰 비활성화"
          disabled={state.status === 'checking' || state.status === 'registering' || state.status === 'deactivating'}
          onPress={deactivate}
          variant="danger">
          {state.status === 'deactivating' ? '비활성화 중...' : '비활성화'}
        </Button>
      </View>
    </Card>
  );
}

function FcmTokenFailedCard({
  busy,
  message,
  onDismiss,
  onRetry,
}: {
  busy: boolean;
  message: string;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  return (
    <Card>
      <Eyebrow>App 01-2 FCM Token Register Failed</Eyebrow>
      <Title>알림 등록 실패</Title>
      <Body>기기 알림을 다시 연결해요.</Body>
      <InlineError message={message} />
      <View style={styles.metaGrid}>
        <ListRow label="재시도" supportingText="네트워크가 안정적일 때 다시 등록" value="권장" />
        <ListRow label="나중에 하기" supportingText="앱 사용은 계속할 수 있어요" value="선택" />
      </View>
      <View style={styles.actionRow}>
        <Button accessibilityLabel="FCM 토큰 등록 다시 시도" disabled={busy} onPress={onRetry}>
          {busy ? '다시 시도 중...' : '다시 시도'}
        </Button>
        <Button
          accessibilityLabel="FCM 토큰 등록 실패 안내 닫기"
          disabled={busy}
          onPress={onDismiss}
          variant="secondary">
          나중에
        </Button>
      </View>
    </Card>
  );
}

function renderNotificationSettingRows(state: NotificationUiState) {
  switch (state.status) {
    case 'checking':
      return <ListRow label="상태" supportingText="앱 시작 시 권한과 등록 상태 확인" value="확인 중" />;
    case 'registering':
      return <ListRow label="토큰 등록" supportingText="POST /api/v1/users/me/fcm-tokens" value="진행 중" />;
    case 'deactivating':
      return <ListRow label="토큰 비활성화" supportingText="DELETE /api/v1/users/me/fcm-tokens/{tokenId}" value="진행 중" />;
    case 'registered':
      return (
        <>
          <ListRow label="권한" supportingText="OS notification permission" value="허용됨" />
          <ListRow label="등록 ID" supportingText="서버 FCM tokenId" value={String(state.registration.tokenId)} />
          <ListRow label="기기 유형" supportingText="REST Docs deviceType" value={state.registration.deviceType} />
          <ListRow label="앱 버전" supportingText="REST Docs appVersion" value={state.registration.appVersion} />
        </>
      );
    case 'registeredLocal':
      return (
        <>
          <ListRow label="권한" supportingText="OS notification permission" value="허용됨" />
          <ListRow label="등록 ID" supportingText="secure storage tokenId" value={String(state.tokenId)} />
        </>
      );
    case 'permissionPrompt':
      return (
        <>
          <ListRow label="권한" supportingText="알림 권한 요청 전 안내 필요" value="미승인" />
          <ListRow label="등록" supportingText="권한 승인 후 토큰 등록 가능" value="대기" />
        </>
      );
    case 'permissionDenied':
      return (
        <>
          <ListRow label="권한" supportingText="OS notification permission" value={getPermissionValue(state.permission)} />
          <ListRow label="복구" supportingText={getNotificationPermissionMessage(state.permission)} value="필요" />
        </>
      );
    case 'tokenUnavailable':
      return (
        <>
          <ListRow label="권한" supportingText="OS notification permission" value="허용됨" />
          <ListRow label="토큰" supportingText="Firebase/FCM native SDK adapter 필요" value="없음" />
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
      return '현재 앱에는 iOS/Firebase 알림 권한 SDK가 없어 OS 권한을 직접 확인하지 못합니다.';
    default:
      return assertNever(permission);
  }
}

function getNotificationApiErrorMessage(error: ApiError) {
  switch (error.kind) {
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'permissionDenied':
      return '알림 토큰을 등록하거나 비활성화할 권한이 없습니다.';
    case 'conflict':
      return '서버의 토큰 상태와 충돌했습니다. 알림 설정을 다시 확인해 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'error':
      return error.message;
    default:
      return assertNever(error.kind);
  }
}

function ProfileScreen({
  onCampusSwitchPress,
  onLogoutPress,
  setAuthState,
  setNotice,
  state,
}: {
  onCampusSwitchPress: () => void;
  onLogoutPress: () => void;
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
        setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
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
    <>
      <Card>
        <Eyebrow>User 10 Profile</Eyebrow>
        <Title>내정보</Title>
        <Body>{state.selectedCampus.campusName}에서 사용 중인 계정 정보입니다.</Body>
        <View style={styles.metaGrid}>
          <ListRow label="이름" supportingText="GET /api/v1/users/me" value={state.user.name} />
          <ListRow label="이메일" supportingText="로그인 계정" value={state.user.email} />
          <ListRow label="전역 역할" supportingText="Service ADMIN 분리 기준" value={state.user.role} />
          <ListRow
            label="캠퍼스 역할"
            supportingText="일반/관리자 화면 분리 기준"
            value={state.selectedCampus.campusRole}
          />
        </View>
        {refreshError ? (
          <InlineError message={getProfileRefreshMessage(refreshError)} />
        ) : null}
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="내 정보 다시 불러오기"
            disabled={refreshing}
            onPress={refreshProfile}
            variant="secondary">
            {refreshing ? '불러오는 중...' : '다시 불러오기'}
          </Button>
          {state.activeCampuses.length > 1 ? (
            <Button
              accessibilityLabel="프로필에서 캠퍼스 변경 시트 열기"
              disabled={refreshing}
              onPress={onCampusSwitchPress}
              variant="secondary">
              캠퍼스 변경
            </Button>
          ) : null}
          <Button
            accessibilityLabel="로그아웃 확인 열기"
            onPress={onLogoutPress}
            variant="danger">
            로그아웃
          </Button>
        </View>
      </Card>
      <NotificationSettingsDetail setAuthState={setAuthState} setNotice={setNotice} />
    </>
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
          <Eyebrow>Campus Switch</Eyebrow>
          <Title>캠퍼스 변경</Title>
          <Body>소속된 ACTIVE 캠퍼스 중 이동할 캠퍼스를 선택할 수 있어요.</Body>
          {error ? <InlineError message={getCampusSwitchErrorMessage(error)} /> : null}
          <View style={styles.metaGrid}>
            {campuses.length > 0 ? (
              campuses.map((campus) => {
                const selected = campus.campusId === currentCampusId;

                return (
                  <ListRow
                    accessibilityLabel={`${campus.campusName} 캠퍼스로 변경`}
                    key={campus.membershipId}
                    label={campus.campusName}
                    onPress={() => onSelect(campus)}
                    supportingText={`${campus.region} · ${campus.campusRole}`}
                    value={selected ? '현재' : '선택'}
                  />
                );
              })
            ) : (
              <Body>ACTIVE 캠퍼스가 없습니다.</Body>
            )}
          </View>
          <Body>선택 후 해당 캠퍼스의 홈 화면으로 이동합니다.</Body>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="캠퍼스 목록 다시 불러오기"
              disabled={loading}
              onPress={onRefresh}
              variant="secondary">
              {loading ? '불러오는 중...' : '목록 갱신'}
            </Button>
            <Button
              accessibilityLabel="캠퍼스 변경 시트 닫기"
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
    <Modal animationType="slide" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Eyebrow>Logout Confirm</Eyebrow>
          <Title>로그아웃할까요?</Title>
          <Body>
            서버 로그아웃을 best effort로 시도하고, 이 기기의 access/refresh token은 삭제합니다.
          </Body>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="로그아웃 취소"
              disabled={loading}
              onPress={onCancel}
              variant="secondary">
              취소
            </Button>
            <Button
              accessibilityLabel="로그아웃 확정"
              disabled={loading}
              onPress={onConfirm}
              variant="danger">
              {loading ? '로그아웃 중...' : '로그아웃'}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getProfileRefreshMessage(error: ApiError) {
  switch (error.kind) {
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'permissionDenied':
      return '내 정보를 조회할 권한이 없습니다.';
    case 'conflict':
      return '내 정보가 최신 상태와 충돌했습니다. 다시 시도해 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'error':
      return error.message;
    default:
      return assertNever(error.kind);
  }
}

function getCampusSwitchErrorMessage(error: ApiError) {
  switch (error.kind) {
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'permissionDenied':
      return '선택한 캠퍼스 상세를 조회할 권한이 없습니다.';
    case 'conflict':
      return '캠퍼스 상태가 최신 목록과 충돌했습니다. 목록을 다시 불러와 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'error':
      return error.message;
    default:
      return assertNever(error.kind);
  }
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
      return '내 정보 조회, GET /users/me 새로고침, 로그아웃 확인 흐름입니다.';
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
      return '이메일과 비밀번호로 로그인하고 token을 secure storage에 저장합니다.';
    case 'signup':
      return '이름, 이메일, 비밀번호를 검증하고 서버 validation 오류를 표시합니다.';
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    gap: 18,
    paddingBottom: 28,
  },
  actionRow: {
    gap: 10,
    marginTop: 6,
  },
  shell: {
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
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
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
