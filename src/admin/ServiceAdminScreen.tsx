import {useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {
  FaithLogApiError,
  getServiceAdminUser,
  getServiceAdminUsers,
  updateServiceAdminUserRole,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  ApiError,
  ServiceAdminUserDetail,
  ServiceAdminUserList,
  ServiceAdminUserListItem,
  UserRole,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {
  Body,
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
  ScreenHeader,
  TextField,
  Title,
} from '../components/ui';
import {colors, radius, spacing} from '../theme';
import {ServiceAdminCampusSection} from './ServiceAdminCampusSection';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type ServiceAdminScreenProps = {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type RoleFilter = UserRole | 'ALL';
type RoleOption = UserRole;
type ServiceAdminSection = 'campuses' | 'users';

type UserListState =
  | {status: 'loading'}
  | {status: 'success'; data: ServiceAdminUserList}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

type UserDetailState =
  | {status: 'idle'}
  | {status: 'loading'; userId: number}
  | {status: 'success'; data: ServiceAdminUserDetail}
  | {status: 'error'; error: ApiError; userId: number};

type RoleChangeState =
  | {status: 'idle'}
  | {status: 'confirming'; role: RoleOption; user: ServiceAdminUserDetail}
  | {status: 'submitting'; role: RoleOption; user: ServiceAdminUserDetail}
  | {status: 'failure'; error: ApiError; role: RoleOption; user: ServiceAdminUserDetail};

const ROLE_OPTIONS: RoleOption[] = ['USER', 'MANAGER', 'ADMIN'];
const ROLE_FILTERS: RoleFilter[] = ['ALL', ...ROLE_OPTIONS];
const SERVICE_ADMIN_SECTIONS: Array<{id: ServiceAdminSection; label: string}> = [
  {id: 'campuses', label: '캠퍼스'},
  {id: 'users', label: '사용자'},
];

export function ServiceAdminScreen({setAuthState, setNotice, state}: ServiceAdminScreenProps) {
  const [activeSection, setActiveSection] = useState<ServiceAdminSection>('campuses');
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [listState, setListState] = useState<UserListState>({status: 'loading'});
  const [detailState, setDetailState] = useState<UserDetailState>({status: 'idle'});
  const [roleChangeState, setRoleChangeState] = useState<RoleChangeState>({status: 'idle'});
  const [formError, setFormError] = useState<string | null>(null);

  const selectedUser = detailState.status === 'success' ? detailState.data : null;
  const selectedRole = useMemo(() => selectedUser?.role ?? 'USER', [selectedUser?.role]);

  const loadUsers = async () => {
    if (state.user.role !== 'ADMIN') {
      setListState({
        status: 'error',
        error: {
          kind: 'permissionDenied',
          message: 'Service ADMIN 사용자 관리에는 전역 ADMIN 권한이 필요합니다.',
        },
      });
      return;
    }

    const userId = toOptionalPositiveInteger(userIdFilter);

    if (userIdFilter.trim() && userId === null) {
      setFormError('userId는 1 이상의 정수여야 합니다.');
      return;
    }

    setFormError(null);
    setListState({status: 'loading'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const query = {
        email: emailFilter,
        name: nameFilter,
        role: roleFilter,
        ...(userId == null ? {} : {userId}),
      };

      const data = await getServiceAdminUsers(accessToken, query);

      setListState(data.content.length > 0 ? {status: 'success', data} : {status: 'empty'});
    } catch (error) {
      const apiError = toApiError(error, '서비스 관리자 사용자 목록을 불러오지 못했습니다.');
      setListState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const loadUserDetail = async (userId: number) => {
    setDetailState({status: 'loading', userId});
    setRoleChangeState({status: 'idle'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const data = await getServiceAdminUser(accessToken, userId);
      setDetailState({status: 'success', data});
    } catch (error) {
      const apiError = toApiError(error, '서비스 관리자 사용자 상세를 불러오지 못했습니다.');
      setDetailState({status: 'error', error: apiError, userId});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const openRoleConfirm = (role: RoleOption) => {
    if (!selectedUser || selectedUser.role === role) {
      return;
    }

    setRoleChangeState({status: 'confirming', role, user: selectedUser});
  };

  const submitRoleChange = async () => {
    if (roleChangeState.status !== 'confirming' && roleChangeState.status !== 'failure') {
      return;
    }

    const {role, user} = roleChangeState;
    setRoleChangeState({status: 'submitting', role, user});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const updated = await updateServiceAdminUserRole(accessToken, user.userId, {role});
      setDetailState({status: 'success', data: updated});
      setRoleChangeState({status: 'idle'});
      setNotice({
        tone: 'success',
        title: '역할 변경 완료',
        message: `${updated.name}님의 전역 역할을 ${updated.role}로 변경했습니다.`,
      });
      void loadUsers();
    } catch (error) {
      const apiError = toApiError(error, '전역 역할을 변경하지 못했습니다.');
      setRoleChangeState({status: 'failure', error: apiError, role, user});
      void handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    void loadUsers();
    // 초기 진입 로드만 수행하고, 필터는 조회 버튼으로 명시 적용합니다.
  }, []);

  if (state.user.role !== 'ADMIN') {
    return (
      <Screen>
        <PermissionDenied
          title="Service ADMIN 권한이 필요합니다"
          message="전역 ADMIN만 전체 사용자 조회와 역할 변경을 사용할 수 있습니다."
          actionLabel="다시 확인"
          actionAccessibilityLabel="Service ADMIN 권한 다시 확인"
          onActionPress={loadUsers}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Service ADMIN"
        subtitle="전역 사용자와 캠퍼스 관리를 분리해 운영합니다."
        title="Service ADMIN 관리"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.segmentRow}>
          {SERVICE_ADMIN_SECTIONS.map((section) => (
            <FilterButton
              active={activeSection === section.id}
              key={section.id}
              label={section.label}
              onPress={() => setActiveSection(section.id)}
            />
          ))}
        </View>

        {activeSection === 'campuses' ? (
          <ServiceAdminCampusSection
            setAuthState={setAuthState}
            setNotice={setNotice}
            state={state}
          />
        ) : (
          <>
            <Card>
              <Eyebrow>사용자 필터</Eyebrow>
              <TextField
                label="이름"
                onChangeText={setNameFilter}
                placeholder="이름 검색"
                returnKeyType="search"
                value={nameFilter}
              />
              <TextField
                label="이메일"
                onChangeText={setEmailFilter}
                placeholder="email@example.com"
                returnKeyType="search"
                textContentType="emailAddress"
                value={emailFilter}
              />
              <TextField
                error={formError ?? undefined}
                keyboardType="number-pad"
                label="userId"
                onChangeText={setUserIdFilter}
                placeholder="정확한 사용자 ID"
                returnKeyType="search"
                value={userIdFilter}
              />
              <View style={styles.segmentRow}>
                {ROLE_FILTERS.map((role) => (
                  <FilterButton
                    active={roleFilter === role}
                    key={role}
                    label={role === 'ALL' ? '전체' : role}
                    onPress={() => setRoleFilter(role)}
                  />
                ))}
              </View>
              <Button accessibilityLabel="Service ADMIN 사용자 목록 조회" onPress={loadUsers}>
                조회
              </Button>
            </Card>

            <UserListSection
              listState={listState}
              onRetry={loadUsers}
              onSelectUser={(user) => void loadUserDetail(user.userId)}
            />

            <UserDetailSection
              currentUserId={state.user.id}
              detailState={detailState}
              onRetry={(userId) => void loadUserDetail(userId)}
              onRoleSelect={openRoleConfirm}
              selectedRole={selectedRole}
            />

          </>
        )}
      </ScrollView>

      <RoleChangeConfirmSheet
        onCancel={() => setRoleChangeState({status: 'idle'})}
        onConfirm={() => void submitRoleChange()}
        state={roleChangeState}
      />
    </Screen>
  );
}

function RoleChangeConfirmSheet({
  onCancel,
  onConfirm,
  state,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  state: RoleChangeState;
}) {
  const visible =
    state.status === 'confirming' ||
    state.status === 'submitting' ||
    state.status === 'failure';
  const target = visible ? state : null;
  const loading = state.status === 'submitting';

  return (
    <DangerConfirmSheet
      accessibilityLabel="전역 역할 변경 위험 확인"
      confirmAccessibilityLabel="전역 역할 변경 확정"
      confirmLabel={state.status === 'failure' ? '다시 시도' : '변경'}
      dangerSummary="권한 변경은 즉시 적용됩니다. 마지막 활성 ADMIN 강등은 서버에서 거부될 수 있습니다."
      failureMessage={state.status === 'failure' ? getActionErrorMessage(state.error) : null}
      loading={loading}
      loadingLabel="변경 중..."
      message={
        target
          ? `${target.user.name}님의 역할을 ${target.user.role}에서 ${target.role}로 변경합니다. 본인 ADMIN 권한 강등은 클라이언트에서 차단합니다.`
          : ''
      }
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="전역 역할을 변경할까요?"
      visible={visible}
    />
  );
}

function UserListSection({
  listState,
  onRetry,
  onSelectUser,
}: {
  listState: UserListState;
  onRetry: () => void;
  onSelectUser: (user: ServiceAdminUserListItem) => void;
}) {
  switch (listState.status) {
    case 'loading':
      return <Loading message="Service ADMIN 사용자 목록을 불러오고 있어요." />;
    case 'empty':
      return (
        <Empty
          title="조건에 맞는 사용자가 없습니다"
          message="이름, 이메일, userId, 역할 필터를 조정해 다시 조회하세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="Service ADMIN 사용자 목록 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return <ServiceAdminErrorState error={listState.error} onRetry={onRetry} />;
    case 'success':
      return (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Eyebrow>사용자 목록</Eyebrow>
              <Body>
                총 {listState.data.totalElements}명, {listState.data.page + 1}/
                {Math.max(listState.data.totalPages, 1)} 페이지
              </Body>
            </View>
            <Chip label={`${listState.data.size}개씩`} tone="info" />
          </View>
          {listState.data.content.map((user) => (
            <ListRow
              accessibilityLabel={`${user.name} 상세 보기`}
              key={user.userId}
              label={`${user.name} #${user.userId}`}
              onPress={() => onSelectUser(user)}
              supportingText={`${user.email} · 캠퍼스 ${user.campusCount}개`}
              value={user.role}
            />
          ))}
        </Card>
      );
    default:
      return assertNever(listState);
  }
}

function UserDetailSection({
  currentUserId,
  detailState,
  onRetry,
  onRoleSelect,
  selectedRole,
}: {
  currentUserId: number;
  detailState: UserDetailState;
  onRetry: (userId: number) => void;
  onRoleSelect: (role: RoleOption) => void;
  selectedRole: UserRole;
}) {
  switch (detailState.status) {
    case 'idle':
      return (
        <Empty
          title="사용자를 선택하세요"
          message="목록에서 사용자를 선택하면 상세 정보와 역할 변경 컨트롤이 표시됩니다."
        />
      );
    case 'loading':
      return <Loading message={`#${detailState.userId} 사용자를 불러오고 있어요.`} />;
    case 'error':
      return (
        <ServiceAdminErrorState
          error={detailState.error}
          onRetry={() => onRetry(detailState.userId)}
        />
      );
    case 'success': {
      const isCurrentUser = detailState.data.userId === currentUserId;

      return (
        <Card>
          <Eyebrow>사용자 상세</Eyebrow>
          <Title>{detailState.data.name}</Title>
          <ListRow label="userId" value={String(detailState.data.userId)} />
          <ListRow label="이메일" value={detailState.data.email} />
          <ListRow
            label="활성 상태"
            value={detailState.data.isActive ? 'ACTIVE' : 'INACTIVE'}
          />
          <View style={styles.segmentRow}>
            {ROLE_OPTIONS.map((role) => (
              <FilterButton
                active={selectedRole === role}
                disabled={isCurrentUser && role !== 'ADMIN'}
                key={role}
                label={role}
                onPress={() => onRoleSelect(role)}
              />
            ))}
          </View>
          <Body>
            본인 ADMIN 권한은 이 화면에서 USER 또는 MANAGER로 강등할 수 없습니다. 마지막 활성
            Service ADMIN 1명을 강등하면 서버가 409로 거부합니다.
          </Body>
          <View style={styles.campusList}>
            <Eyebrow>소속 캠퍼스</Eyebrow>
            {detailState.data.campuses.length > 0 ? (
              detailState.data.campuses.map((campus) => (
                <ListRow
                  key={campus.membershipId}
                  label={campus.campusName}
                  supportingText={`${campus.region} · membership #${campus.membershipId}`}
                  value={`${campus.campusRole}/${campus.status}`}
                />
              ))
            ) : (
              <Body>소속 캠퍼스가 없습니다.</Body>
            )}
          </View>
        </Card>
      );
    }
    default:
      return assertNever(detailState);
  }
}

function ServiceAdminErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '역할 변경 정책과 충돌했습니다',
    conflictMessage: '마지막 활성 ADMIN 정책과 충돌했습니다. 목록을 다시 불러온 뒤 진행해 주세요.',
    permissionTitle: 'Service ADMIN 권한이 필요합니다',
    permissionMessage: 'USER 또는 MANAGER는 Service ADMIN 사용자 관리를 사용할 수 없습니다.',
    defaultTitle: 'Service ADMIN 정보를 처리하지 못했습니다',
  });

  switch (error.kind) {
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 권한 오류 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 충돌 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 네트워크 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 세션 만료 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function FilterButton({
  active,
  disabled = false,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} 필터`}
      accessibilityRole="button"
      accessibilityState={{disabled, selected: active}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.filterButton,
        active ? styles.filterButtonActive : null,
        disabled ? styles.filterButtonDisabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        style={[
          styles.filterButtonText,
          active ? styles.filterButtonTextActive : null,
          disabled ? styles.filterButtonTextDisabled : null,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

async function resolveAccessToken(setAuthState: (state: AuthGateState) => void) {
  const {accessToken} = await getStoredTokens();

  if (!accessToken) {
    setAuthState({status: 'sessionExpired', message: '저장된 access token이 없습니다.'});
    return null;
  }

  return accessToken;
}

async function handleAuthError(
  error: ApiError,
  setAuthState: (state: AuthGateState) => void,
) {
  if (error.kind === 'sessionExpired') {
    await clearTokens();
    setAuthState({status: 'sessionExpired', message: error.message});
  }
}

function toApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  return {kind: 'error', message: fallback};
}

function getActionErrorMessage(error: ApiError) {
  return getApiErrorPresentation(error, {
    conflictMessage: '마지막 활성 ADMIN 강등 정책과 충돌했습니다. 목록을 다시 불러오세요.',
    permissionMessage: '전역 ADMIN 권한이 없습니다. USER 또는 MANAGER는 Service ADMIN 사용자 관리를 사용할 수 없습니다.',
  }).message;
}

function toOptionalPositiveInteger(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const numericValue = Number(trimmed);

  if (
    !Number.isInteger(numericValue) ||
    numericValue <= 0 ||
    !Number.isSafeInteger(numericValue)
  ) {
    return null;
  }

  return numericValue;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled ServiceAdminScreen state: ${String(value)}`);
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.gap,
    paddingBottom: spacing.bottomSafe,
    paddingTop: spacing.gap,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterButtonDisabled: {
    opacity: 0.45,
  },
  filterButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  filterButtonTextActive: {
    color: colors.surface,
  },
  filterButtonTextDisabled: {
    color: colors.mutedText,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  campusList: {
    gap: spacing.gap,
  },
  pressed: {
    opacity: 0.8,
  },
});
