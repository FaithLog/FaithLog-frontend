import {useEffect, useMemo, useState} from 'react';
import {SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';

import type {AuthGateState} from '../auth/authGate';
import {bootstrapAuthGate} from '../auth/authGate';
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
  Title,
} from '../components/ui';
import {getAvailableRoutes, getRouteLabel, type ShellRoute} from '../navigation/shellRoutes';
import {colors, spacing} from '../theme';

const initialState: AuthGateState = {
  status: 'loading',
  message: '저장된 세션을 확인하고 있어요.',
};

type EntryTarget = 'login' | 'inviteCode' | 'campusCreate';

export function FaithLogApp() {
  const [authState, setAuthState] = useState<AuthGateState>(initialState);
  const [entryTarget, setEntryTarget] = useState<EntryTarget | null>(null);
  const [route, setRoute] = useState<ShellRoute>('userHome');

  const retryBootstrap = () => {
    setEntryTarget(null);
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
          {renderAuthState(authState, retryBootstrap, setEntryTarget, route, setRoute)}
          {entryTarget ? <EntryTargetCard target={entryTarget} /> : null}
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

function renderAuthState(
  state: AuthGateState,
  retry: () => void,
  openEntryTarget: (target: EntryTarget) => void,
  route: ShellRoute,
  setRoute: (route: ShellRoute) => void,
) {
  switch (state.status) {
    case 'loading':
      return <Loading message={state.message} />;
    case 'signedOut':
      return (
        <StatusCard
          eyebrow="로그인 필요"
          title="FaithLog에 로그인해 주세요"
          message="저장된 refresh token이 없어 로그인 화면으로 진입해야 합니다."
          primaryLabel="로그인으로 이동"
          primaryAccessibilityLabel="로그인 화면으로 이동"
          onPrimaryPress={() => openEntryTarget('login')}
        />
      );
    case 'sessionExpired':
      return (
        <StatusCard
          eyebrow="세션 만료"
          title="다시 로그인해 주세요"
          message={state.message}
          primaryLabel="로그인으로 이동"
          primaryAccessibilityLabel="세션 만료 후 로그인 화면으로 이동"
          onPrimaryPress={() => openEntryTarget('login')}
          tone="danger"
        />
      );
    case 'noCampus':
      return (
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
      return <AuthenticatedShell state={state} route={route} setRoute={setRoute} />;
    default:
      return assertNever(state);
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
  setRoute,
  state,
}: {
  state: Extract<AuthGateState, {status: 'authenticated'}>;
  route: ShellRoute;
  setRoute: (route: ShellRoute) => void;
}) {
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

  return (
    <View style={styles.shell}>
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

      <BottomNav activeId={route} items={navItems} onSelect={setRoute} />

      <Card>
        <Eyebrow>{getRouteLabel(route)}</Eyebrow>
        <Title>{getRouteTitle(route)}</Title>
        <Body>{getRouteDescription(route, state.activeCampuses.length)}</Body>
      </Card>
    </View>
  );
}

function getRouteTitle(route: ShellRoute) {
  switch (route) {
    case 'userHome':
      return '일반 사용자 홈';
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
      return 'FE-002에서는 인증 게이트가 로그인 전 화면으로 분기되는 진입점을 제공합니다.';
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
});
