import {useEffect, useMemo, useState} from 'react';
import {Modal, SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';

import {
  createCampus,
  FaithLogApiError,
  fetchCampusDetail,
  fetchCurrentUser,
  fetchMyCampuses,
  joinCampus,
  signupUser,
} from '../api/client';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {ApiError, CampusDetail, CampusMembershipSummary, UserRole} from '../api/types';
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
      {route === 'profile' ? (
        <ProfileScreen
          onCampusSwitchPress={openCampusSwitch}
          onLogoutPress={() => setLogoutConfirmVisible(true)}
          setAuthState={setAuthState}
          setNotice={setNotice}
          state={state}
        />
      ) : (
        <Card>
          <Eyebrow>앱 시작 완료</Eyebrow>
          <Title>{state.selectedCampus.campusName}</Title>
          <Body>
            {state.user.name}님 세션을 복구했고, ACTIVE 캠퍼스로 진입했습니다.
          </Body>
          <View style={styles.metaGrid}>
            <ListRow label="사용자" supportingText="전역 역할" value={state.user.role} />
            <ListRow
              label="캠퍼스 역할"
              supportingText="현재 선택된 ACTIVE 캠퍼스 권한"
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
          {state.activeCampuses.length > 1 ? (
            <Button
              accessibilityLabel="캠퍼스 변경 시트 열기"
              onPress={openCampusSwitch}
              variant="secondary">
              캠퍼스 변경
            </Button>
          ) : null}
        </Card>
      )}

      <BottomNav activeId={route} items={navItems} onSelect={setRoute} />

      {route === 'profile' ? null : (
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
