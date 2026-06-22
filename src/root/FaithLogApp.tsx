import {useEffect, useMemo, useState} from 'react';
import {Modal, SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';

import {FaithLogApiError, fetchCurrentUser, signupUser} from '../api/client';
import {getStoredTokens} from '../api/tokenStorage';
import type {ApiError} from '../api/types';
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
        <>
          <Empty
            title={`${state.user.name}님, 참여 중인 캠퍼스가 없어요`}
            message="ACTIVE 캠퍼스가 없어 초대코드 입력 또는 캠퍼스 생성 흐름으로 안내합니다."
            actionLabel="초대코드 입력"
            actionAccessibilityLabel="캠퍼스 초대코드 입력 화면으로 이동"
            onActionPress={() => openEntryTarget('inviteCode')}
            secondaryActionLabel="캠퍼스 생성"
            secondaryActionAccessibilityLabel="캠퍼스 생성 화면으로 이동"
            onSecondaryActionPress={() => openEntryTarget('campusCreate')}
          />
          {entryTarget === 'inviteCode' || entryTarget === 'campusCreate' ? (
            <EntryTargetCard target={entryTarget} />
          ) : null}
        </>
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
          </View>
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
    </View>
  );
}

function ProfileScreen({
  onLogoutPress,
  setAuthState,
  setNotice,
  state,
}: {
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

      const user = await fetchCurrentUser(accessToken);
      setAuthState({...state, user});
      setNotice({
        tone: 'success',
        title: '프로필 갱신',
        message: '내 정보를 다시 불러왔습니다.',
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
