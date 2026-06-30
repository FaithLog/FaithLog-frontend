import {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {
  FaithLogApiError,
  getServiceAdminCampuses,
  getServiceAdminUser,
  getServiceAdminUsers,
  updateServiceAdminUserRole,
} from '../api/client';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  ApiError,
  ServiceAdminUserDetail,
  ServiceAdminCampusList,
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
  Empty,
  ErrorState,
  Eyebrow,
  FaithLogHeaderPillButton,
  FaithLogHeaderTopRow,
  ListRow,
  Loading,
  Offline,
  PermissionDenied,
  TextField,
  Title,
} from '../components/ui';
import {IconexIcon, type IconexIconName} from '../components/IconexIcon';
import {colors, radius, spacing} from '../theme';
import {ServiceAdminCampusSection} from './ServiceAdminCampusSection';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type ServiceAdminScreenProps = {
  onBackToUserMode: () => void;
  onOpenCampusAdminFeature: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type RoleFilter = UserRole | 'ALL';
type RoleOption = UserRole;
type ServiceAdminSection = 'home' | 'campuses' | 'users';
type UserScreenView = 'list' | 'detail' | 'roleEdit';
type UserLoadOptions = {
  page?: number;
  role?: RoleFilter;
};

type ServiceAdminHomeData = {
  activeCampusCount: number;
  campuses: ServiceAdminCampusList;
  users: ServiceAdminUserList;
};

type ServiceAdminHomeState =
  | {status: 'loading'}
  | {status: 'success'; data: ServiceAdminHomeData}
  | {status: 'empty'; data: ServiceAdminHomeData}
  | {status: 'error'; error: ApiError};

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
  | {status: 'submitting'; role: RoleOption; user: ServiceAdminUserDetail}
  | {status: 'failure'; error: ApiError; role: RoleOption; user: ServiceAdminUserDetail};

const ROLE_OPTIONS: RoleOption[] = ['USER', 'MANAGER', 'ADMIN'];
const ROLE_FILTERS: RoleFilter[] = ['ALL', ...ROLE_OPTIONS];
const SERVICE_ADMIN_USER_PAGE_SIZE = 10;
const SERVICE_ADMIN_SECTIONS: Array<{id: ServiceAdminSection; label: string}> = [
  {id: 'home', label: '홈'},
  {id: 'campuses', label: '캠퍼스'},
  {id: 'users', label: '사용자'},
];

export function ServiceAdminScreen({
  onBackToUserMode,
  onOpenCampusAdminFeature,
  setAuthState,
  setNotice,
  state,
}: ServiceAdminScreenProps) {
  const [activeSection, setActiveSection] = useState<ServiceAdminSection>('home');
  const [homeState, setHomeState] = useState<ServiceAdminHomeState>({status: 'loading'});
  const [userView, setUserView] = useState<UserScreenView>('list');
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [userPage, setUserPage] = useState(0);
  const [listState, setListState] = useState<UserListState>({status: 'loading'});
  const [detailState, setDetailState] = useState<UserDetailState>({status: 'idle'});
  const [roleChangeState, setRoleChangeState] = useState<RoleChangeState>({status: 'idle'});
  const [roleDraft, setRoleDraft] = useState<RoleOption>('USER');
  const [formError, setFormError] = useState<string | null>(null);

  const selectedUser = detailState.status === 'success' ? detailState.data : null;

  const loadHome = async () => {
    if (state.user.role !== 'ADMIN') {
      setHomeState({
        status: 'error',
        error: {
          kind: 'permissionDenied',
          message: 'Service ADMIN 홈에는 전역 ADMIN 권한이 필요합니다.',
        },
      });
      return;
    }

    setHomeState({status: 'loading'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const [users, campuses, activeCampuses] = await Promise.all([
        getServiceAdminUsers(accessToken, {size: 5, sort: {direction: 'desc', key: 'createdAt'}}),
        getServiceAdminCampuses(accessToken, {
          size: 5,
          sort: {direction: 'desc', key: 'createdAt'},
        }),
        getServiceAdminCampuses(accessToken, {size: 1, status: 'ACTIVE'}),
      ]);
      const data = {activeCampusCount: activeCampuses.totalElements, campuses, users};

      setHomeState(
        users.totalElements > 0 || campuses.totalElements > 0
          ? {status: 'success', data}
          : {status: 'empty', data},
      );
    } catch (error) {
      const apiError = toApiError(error, 'Service ADMIN 홈 요약을 불러오지 못했습니다.');
      setHomeState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const loadUsers = async (options: UserLoadOptions = {}) => {
    if (state.user.role !== 'ADMIN') {
      setListState({
        status: 'error',
        error: {
          kind: 'permissionDenied',
          message: '서비스 관리자 사용자 관리에는 전역 관리자 권한이 필요합니다.',
        },
      });
      return;
    }

    const userId = toOptionalPositiveInteger(userIdFilter);

    if (userIdFilter.trim() && userId === null) {
      setFormError('사용자 번호는 1 이상의 정수여야 합니다.');
      return;
    }

    setFormError(null);
    setListState({status: 'loading'});
    const requestedPage = options.page ?? userPage;
    const requestedRole = options.role ?? roleFilter;
    setUserPage(requestedPage);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const query = {
        email: emailFilter,
        name: nameFilter,
        page: requestedPage,
        role: requestedRole,
        size: SERVICE_ADMIN_USER_PAGE_SIZE,
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

  const submitUserSearch = () => {
    setUserPage(0);
    void loadUsers({page: 0});
  };

  const selectRoleFilter = (role: RoleFilter) => {
    setRoleFilter(role);
    setUserPage(0);
    void loadUsers({page: 0, role});
  };

  const changeUserPage = (page: number) => {
    const safePage = Math.max(0, page);
    setUserPage(safePage);
    void loadUsers({page: safePage});
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
      setRoleDraft(data.role);
    } catch (error) {
      const apiError = toApiError(error, '서비스 관리자 사용자 상세를 불러오지 못했습니다.');
      setDetailState({status: 'error', error: apiError, userId});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const openUserDetail = (user: ServiceAdminUserListItem) => {
    setUserView('detail');
    void loadUserDetail(user.userId);
  };

  const openRoleEdit = () => {
    if (!selectedUser) {
      return;
    }

    setRoleDraft(selectedUser.role);
    setRoleChangeState({status: 'idle'});
    setUserView('roleEdit');
  };

  const selectRoleDraft = (role: RoleOption) => {
    setRoleDraft(role);
    setRoleChangeState({status: 'idle'});
  };

  const submitRoleChange = async () => {
    if (
      !selectedUser ||
      selectedUser.role === roleDraft ||
      roleChangeState.status === 'submitting'
    ) {
      return;
    }

    if (selectedUser.userId === state.user.id && roleDraft !== 'ADMIN') {
      setRoleChangeState({
        status: 'failure',
        error: {
          kind: 'permissionDenied',
          message:
            '본인 전역 관리자 권한은 이 화면에서 일반 사용자 또는 캠퍼스 관리자로 낮출 수 없습니다.',
        },
        role: roleDraft,
        user: selectedUser,
      });
      return;
    }

    const role = roleDraft;
    const user = selectedUser;
    setRoleChangeState({status: 'submitting', role, user});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const updated = await updateServiceAdminUserRole(accessToken, user.userId, {role});
      setDetailState({status: 'success', data: updated});
      setRoleDraft(updated.role);
      setRoleChangeState({status: 'idle'});
      setUserView('detail');
      setNotice({
        tone: 'success',
        title: '역할 변경 완료',
        message: `${updated.name}님의 전역 역할을 ${getRoleLabel(updated.role)}로 변경했습니다.`,
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
    void loadHome();
    // 초기 진입 로드만 수행하고, 필터는 조회 버튼으로 명시 적용합니다.
  }, []);

  if (state.user.role !== 'ADMIN') {
    return (
      <View style={styles.serviceAdminRoot}>
        <PermissionDenied
          title="서비스 관리자 권한이 필요합니다"
          message="전역 관리자만 전체 사용자 조회와 역할 변경을 사용할 수 있습니다."
          actionLabel="다시 확인"
          actionAccessibilityLabel="서비스 관리자 권한 다시 확인"
          onActionPress={() => loadUsers()}
        />
      </View>
    );
  }

  return (
    <View style={styles.serviceAdminRoot}>
      <View style={styles.serviceAdminFrame}>
        <ServiceAdminHeader
          activeSection={activeSection}
          onBackToUserMode={onBackToUserMode}
        />
        <ScrollView contentContainerStyle={styles.content} style={styles.serviceAdminScroll}>
          {activeSection === 'home' ? (
            <ServiceAdminHome
              homeState={homeState}
              onOpenCampusAdmin={() => setActiveSection('campuses')}
              onOpenCampusAdminFeature={() => {
                setNotice({
                  tone: 'info',
                  title: '캠퍼스 관리자에서 계속',
                  message:
                    '알림과 정산은 선택한 캠퍼스의 관리자 화면에서 운영합니다. Service ADMIN 홈에서는 별도 요약을 제공하지 않습니다.',
                });
                onOpenCampusAdminFeature();
              }}
              onOpenUsers={() => setActiveSection('users')}
              onRetry={loadHome}
            />
          ) : activeSection === 'campuses' ? (
            <ServiceAdminCampusSection
              setAuthState={setAuthState}
              setNotice={setNotice}
              state={state}
            />
          ) : (
            <>
              {userView === 'list' ? (
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
                    label="사용자 번호"
                    onChangeText={setUserIdFilter}
                    placeholder="정확한 사용자 번호"
                    returnKeyType="search"
                    value={userIdFilter}
                  />
                  <View style={styles.segmentRow}>
                    {ROLE_FILTERS.map((role) => (
                      <FilterButton
                        accessibilityLabel={`${getRoleFilterAccessibilityLabel(role)} 필터`}
                        active={roleFilter === role}
                        key={role}
                        label={getRoleFilterLabel(role)}
                        onPress={() => selectRoleFilter(role)}
                      />
                    ))}
                  </View>
                  <Button accessibilityLabel="서비스 관리자 사용자 목록 조회" onPress={submitUserSearch}>
                    조회
                  </Button>
                </Card>
              ) : null}

              <UserListSection
                listState={listState}
                onChangePage={changeUserPage}
                onRetry={() => loadUsers()}
                onSelectUser={openUserDetail}
                userView={userView}
              />

              <UserDetailSection
                currentUserId={state.user.id}
                detailState={detailState}
                onBack={() => setUserView('list')}
                onEditRole={openRoleEdit}
                onRetry={(userId) => void loadUserDetail(userId)}
                userView={userView}
              />

              <UserRoleEditSection
                currentUserId={state.user.id}
                detailState={detailState}
                onBack={() => setUserView('detail')}
                onRetry={(userId) => void loadUserDetail(userId)}
                onRoleSelect={selectRoleDraft}
                onSubmit={() => void submitRoleChange()}
                roleChangeState={roleChangeState}
                selectedRole={roleDraft}
                userView={userView}
              />
            </>
          )}
        </ScrollView>
        <ServiceAdminBottomNav activeSection={activeSection} onSelectSection={setActiveSection} />
      </View>
    </View>
  );
}

function UserListSection({
  listState,
  onChangePage,
  onRetry,
  onSelectUser,
  userView,
}: {
  listState: UserListState;
  onChangePage: (page: number) => void;
  onRetry: () => void;
  onSelectUser: (user: ServiceAdminUserListItem) => void;
  userView: UserScreenView;
}) {
  if (userView !== 'list') {
    return null;
  }

  switch (listState.status) {
    case 'loading':
      return <Loading message="서비스 관리자 사용자 목록을 불러오고 있어요." />;
    case 'empty':
      return (
        <Empty
          title="조건에 맞는 사용자가 없습니다"
          message="이름, 이메일, 사용자 번호, 역할 필터를 조정해 다시 조회하세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="서비스 관리자 사용자 목록 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return <ServiceAdminErrorState error={listState.error} onRetry={onRetry} />;
    case 'success': {
      const currentPage = listState.data.page;
      const totalPages = Math.max(listState.data.totalPages, 1);
      const canGoPrevious = currentPage > 0;
      const canGoNext = currentPage + 1 < totalPages;

      return (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Eyebrow>사용자 목록</Eyebrow>
              <Body>
                총 {listState.data.totalElements}명 · {currentPage + 1}/{totalPages} 페이지
              </Body>
            </View>
            <Chip label={`${listState.data.size}개씩`} tone="info" />
          </View>
          <ServiceAdminPagination
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            currentPage={currentPage}
            onNext={() => onChangePage(currentPage + 1)}
            onPrevious={() => onChangePage(currentPage - 1)}
            totalPages={totalPages}
          />
          {listState.data.content.map((user) => (
            <ListRow
              accessibilityLabel={`${user.name} 상세 보기`}
              key={user.userId}
              label={user.name}
              onPress={() => onSelectUser(user)}
              supportingText={
                `${user.email} · 사용자 번호 ${user.userId} · 캠퍼스 ${user.campusCount}개`
              }
              value={getRoleLabel(user.role)}
            />
          ))}
        </Card>
      );
    }
    default:
      return assertNever(listState);
  }
}

function ServiceAdminPagination({
  canGoNext,
  canGoPrevious,
  currentPage,
  onNext,
  onPrevious,
  totalPages,
}: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  currentPage: number;
  onNext: () => void;
  onPrevious: () => void;
  totalPages: number;
}) {
  return (
    <View style={styles.paginationRow}>
      <PaginationButton disabled={!canGoPrevious} label="이전" onPress={onPrevious} />
      <View style={styles.paginationPageBadge}>
        <Text numberOfLines={1} style={styles.paginationPageText}>
          {currentPage + 1} / {totalPages}
        </Text>
      </View>
      <PaginationButton disabled={!canGoNext} label="다음" onPress={onNext} />
    </View>
  );
}

function PaginationButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`사용자 목록 ${label} 페이지`}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.paginationButton,
        disabled ? styles.paginationButtonDisabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.paginationButtonText,
          disabled ? styles.paginationButtonTextDisabled : null,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ServiceAdminHome({
  homeState,
  onOpenCampusAdmin,
  onOpenCampusAdminFeature,
  onOpenUsers,
  onRetry,
}: {
  homeState: ServiceAdminHomeState;
  onOpenCampusAdmin: () => void;
  onOpenCampusAdminFeature: () => void;
  onOpenUsers: () => void;
  onRetry: () => void;
}) {
  switch (homeState.status) {
    case 'loading':
      return <Loading message="Service ADMIN 홈 요약을 불러오고 있어요." />;
    case 'error':
      return <ServiceAdminErrorState error={homeState.error} onRetry={onRetry} />;
    case 'empty':
      return (
        <>
          <Empty
            title="운영 데이터가 아직 없습니다"
            message="사용자와 캠퍼스가 생성되면 Service ADMIN 홈에 요약이 표시됩니다."
            actionLabel="다시 조회"
            actionAccessibilityLabel="Service ADMIN 홈 요약 다시 조회"
            onActionPress={onRetry}
          />
          <ServiceAdminHomeActions
            onOpenCampusAdmin={onOpenCampusAdmin}
            onOpenCampusAdminFeature={onOpenCampusAdminFeature}
            onOpenUsers={onOpenUsers}
          />
        </>
      );
    case 'success':
      return (
        <>
          <ServiceAdminHero
            activeCampusCount={homeState.data.activeCampusCount}
            campusCount={homeState.data.campuses.totalElements}
            userCount={homeState.data.users.totalElements}
          />
          <ServiceAdminHomeActions
            onOpenCampusAdmin={onOpenCampusAdmin}
            onOpenCampusAdminFeature={onOpenCampusAdminFeature}
            onOpenUsers={onOpenUsers}
          />
          <ServiceAdminRecentOverview data={homeState.data} />
        </>
      );
    default:
      return assertNever(homeState);
  }
}

function ServiceAdminHero({
  activeCampusCount,
  campusCount,
  userCount,
}: {
  activeCampusCount: number;
  campusCount: number;
  userCount: number;
}) {
  return (
    <Card>
      <View style={styles.homeHeroHeader}>
        <View style={styles.sectionHeaderText}>
          <Eyebrow>서비스 전체</Eyebrow>
          <Title>서비스 전체 운영 현황</Title>
          <Body>사용자와 캠퍼스 목록에서 계산한 요약입니다.</Body>
        </View>
        <Chip label="전역" tone="info" />
      </View>
      <View style={styles.homeStatsRow}>
        <HomeStatCard label="사용자" value={`${userCount}명`} />
        <HomeStatCard label="캠퍼스" value={`${campusCount}개`} />
        <HomeStatCard label="운영" value={`${activeCampusCount}개`} />
      </View>
    </Card>
  );
}

function HomeStatCard({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.homeStatCard}>
      <Text style={styles.homeStatLabel}>{label}</Text>
      <Text style={styles.homeStatValue}>{value}</Text>
    </View>
  );
}

function ServiceAdminHomeActions({
  onOpenCampusAdmin,
  onOpenCampusAdminFeature,
  onOpenUsers,
}: {
  onOpenCampusAdmin: () => void;
  onOpenCampusAdminFeature: () => void;
  onOpenUsers: () => void;
}) {
  return (
    <Card>
      <View style={styles.sectionHeaderText}>
        <Eyebrow>관리 진입점</Eyebrow>
        <Title>필요한 운영 화면으로 이동</Title>
      </View>
      <ServiceAdminHomeAction
        label="사용자 관리"
        meta="전역 사용자 조회와 역할 변경"
        onPress={onOpenUsers}
        value="열기"
      />
      <ServiceAdminHomeAction
        label="캠퍼스 관리"
        meta="캠퍼스 조회, 수정, 멤버 추가"
        onPress={onOpenCampusAdmin}
        value="열기"
      />
      <ServiceAdminHomeAction
        label="알림 발송"
        meta="캠퍼스 관리자 알림 화면에서 처리"
        onPress={onOpenCampusAdminFeature}
        value="이동"
      />
      <ServiceAdminHomeAction
        label="정산 계좌"
        meta="캠퍼스 관리자 정산 화면에서 처리"
        onPress={onOpenCampusAdminFeature}
        value="이동"
      />
      <View style={styles.summaryUnavailable}>
        <Text style={styles.summaryUnavailableTitle}>알림·정산 요약 미제공</Text>
        <Text style={styles.summaryUnavailableText}>
          Service ADMIN 홈에서는 알림·정산 집계를 제공하지 않습니다.
        </Text>
      </View>
    </Card>
  );
}

function ServiceAdminHomeAction({
  label,
  meta,
  onPress,
  value,
}: {
  label: string;
  meta: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <ListRow
      accessibilityLabel={`${label} 화면으로 이동`}
      label={label}
      onPress={onPress}
      supportingText={meta}
      value={value}
    />
  );
}

function ServiceAdminRecentOverview({data}: {data: ServiceAdminHomeData}) {
  return (
    <Card>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Eyebrow>최근 항목</Eyebrow>
          <Body>첫 페이지 목록 응답 기준입니다.</Body>
        </View>
        <Chip label="요약" tone="default" />
      </View>
      <View style={styles.recentBlock}>
        <Text style={styles.recentBlockTitle}>사용자</Text>
        {data.users.content.length > 0 ? (
          data.users.content.slice(0, 3).map((user) => (
            <ListRow
              key={user.userId}
              label={user.name}
              supportingText={`${user.email} · 캠퍼스 ${user.campusCount}개`}
              value={getRoleLabel(user.role)}
            />
          ))
        ) : (
          <Body>표시할 사용자가 없습니다.</Body>
        )}
      </View>
      <View style={styles.recentBlock}>
        <Text style={styles.recentBlockTitle}>캠퍼스</Text>
        {data.campuses.content.length > 0 ? (
          data.campuses.content.slice(0, 3).map((campus) => (
            <ListRow
              key={campus.campusId}
              label={campus.name}
              supportingText={`멤버 ${campus.memberCount}명`}
              value={getServiceAdminCampusStatusLabel(campus.status)}
            />
          ))
        ) : (
          <Body>표시할 캠퍼스가 없습니다.</Body>
        )}
      </View>
    </Card>
  );
}

function UserDetailSection({
  currentUserId,
  detailState,
  onBack,
  onEditRole,
  onRetry,
  userView,
}: {
  currentUserId: number;
  detailState: UserDetailState;
  onBack: () => void;
  onEditRole: () => void;
  onRetry: (userId: number) => void;
  userView: UserScreenView;
}) {
  if (userView !== 'detail') {
    return null;
  }

  switch (detailState.status) {
    case 'idle':
      return (
        <Empty
          title="사용자를 선택하세요"
          message="목록에서 사용자를 선택하면 상세 정보와 역할 변경 컨트롤이 표시됩니다."
        />
      );
    case 'loading':
      return <Loading message={`사용자 번호 ${detailState.userId} 정보를 불러오고 있어요.`} />;
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
          <View style={styles.stepHeader}>
            <View style={styles.sectionHeaderText}>
              <Eyebrow>사용자 상세</Eyebrow>
              <Title>{detailState.data.name}</Title>
            </View>
            <Chip label={getRoleLabel(detailState.data.role)} tone="info" />
          </View>
          <ListRow label="사용자 번호" value={String(detailState.data.userId)} />
          <ListRow label="이메일" value={detailState.data.email} />
          <ListRow
            label="활성 상태"
            value={detailState.data.isActive ? '활성' : '비활성'}
          />
          <Body>
            {isCurrentUser
              ? '본인 전역 관리자 권한은 일반 사용자 또는 캠퍼스 관리자로 낮출 수 없습니다.'
              : '역할 관리는 별도 화면에서 현재 역할과 변경 요약을 확인한 뒤 저장합니다.'}
          </Body>
          <View style={styles.actionRow}>
            <ActionButton label="목록" onPress={onBack} variant="secondary" />
            <ActionButton label="역할 수정" onPress={onEditRole} variant="primary" />
          </View>
          <View style={styles.campusList}>
            <Eyebrow>소속 캠퍼스</Eyebrow>
            {detailState.data.campuses.length > 0 ? (
              detailState.data.campuses.map((campus) => (
                <ListRow
                  key={campus.membershipId}
                  label={campus.campusName}
                  supportingText={`소속 정보 ${campus.membershipId}`}
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

function UserRoleEditSection({
  currentUserId,
  detailState,
  onBack,
  onRetry,
  onRoleSelect,
  onSubmit,
  roleChangeState,
  selectedRole,
  userView,
}: {
  currentUserId: number;
  detailState: UserDetailState;
  onBack: () => void;
  onRetry: (userId: number) => void;
  onRoleSelect: (role: RoleOption) => void;
  onSubmit: () => void;
  roleChangeState: RoleChangeState;
  selectedRole: RoleOption;
  userView: UserScreenView;
}) {
  if (userView !== 'roleEdit') {
    return null;
  }

  switch (detailState.status) {
    case 'idle':
      return (
        <Empty
          title="역할을 수정할 사용자를 선택하세요"
          message="목록에서 사용자를 선택한 뒤 역할 관리 화면으로 이동할 수 있습니다."
          actionLabel="목록으로"
          actionAccessibilityLabel="사용자 목록으로 돌아가기"
          onActionPress={onBack}
        />
      );
    case 'loading':
      return <Loading message={`사용자 번호 ${detailState.userId} 역할 정보를 불러오고 있어요.`} />;
    case 'error':
      return (
        <ServiceAdminErrorState
          error={detailState.error}
          onRetry={() => onRetry(detailState.userId)}
        />
      );
    case 'success': {
      const user = detailState.data;
      const isCurrentUser = user.userId === currentUserId;
      const isSubmitting = roleChangeState.status === 'submitting';
      const hasChanged = selectedRole !== user.role;
      const blocksSelfDemotion = isCurrentUser && selectedRole !== 'ADMIN';
      const canSubmit = hasChanged && !blocksSelfDemotion && !isSubmitting;

      return (
        <Card>
          <View style={styles.stepHeader}>
            <View style={styles.sectionHeaderText}>
              <Eyebrow>서비스 관리자</Eyebrow>
              <Title>역할 관리</Title>
            </View>
            <Chip label="관리자" tone="info" />
          </View>

          <View style={styles.roleProfileCard}>
            <View style={styles.roleProfileText}>
              <Title>{user.name}</Title>
              <Body>{user.email}</Body>
            </View>
            <Chip label={getRoleLabel(user.role)} tone="default" />
          </View>

          <View style={styles.campusList}>
            <View>
              <Title>변경할 역할</Title>
              <Body>전역 역할만 수정합니다</Body>
            </View>
            {ROLE_OPTIONS.map((role) => (
              <RoleOptionRow
                currentRole={user.role}
                disabled={isSubmitting || (isCurrentUser && role !== 'ADMIN')}
                key={role}
                onPress={() => onRoleSelect(role)}
                role={role}
                selected={selectedRole === role}
              />
            ))}
          </View>

          <View style={styles.adminWarning}>
            <Text style={styles.adminWarningTitle}>전역 관리자 변경 주의</Text>
            <Text style={styles.adminWarningText}>
              마지막 전역 관리자이거나 권한이 부족하면 저장할 수 없어요.
            </Text>
          </View>

          {blocksSelfDemotion ? (
            <View style={styles.inlinePolicy}>
              <Text style={styles.inlinePolicyText}>
                본인 전역 관리자 권한은 이 화면에서 일반 사용자 또는 캠퍼스 관리자로 낮출 수 없습니다.
              </Text>
            </View>
          ) : null}

          <View style={styles.roleSummary}>
            <Text style={styles.summaryRole}>{getRoleLabel(user.role)}</Text>
            <Text style={styles.summaryArrow}>→</Text>
            <Text style={[styles.summaryRole, styles.summaryRoleTarget]}>
              {getRoleLabel(selectedRole)}
            </Text>
          </View>

          {roleChangeState.status === 'failure' ? (
            <RoleChangeInlineError error={roleChangeState.error} />
          ) : null}

          <View style={styles.actionRow}>
            <ActionButton
              disabled={isSubmitting}
              label="취소"
              onPress={onBack}
              variant="secondary"
            />
            <ActionButton
              disabled={!canSubmit}
              label={isSubmitting ? '저장 중...' : '저장'}
              onPress={onSubmit}
              variant="primary"
            />
          </View>
        </Card>
      );
    }
    default:
      return assertNever(detailState);
  }
}

function RoleOptionRow({
  currentRole,
  disabled,
  onPress,
  role,
  selected,
}: {
  currentRole: UserRole;
  disabled: boolean;
  onPress: () => void;
  role: RoleOption;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${getRoleLabel(role)} 역할 선택`}
      accessibilityRole="button"
      accessibilityState={{disabled, selected}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.roleOption,
        selected ? styles.roleOptionSelected : null,
        disabled ? styles.roleOptionDisabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={[styles.roleOptionIcon, selected ? styles.roleOptionIconSelected : null]}>
        {selected ? <View style={styles.roleOptionIconDot} /> : null}
      </View>
      <View style={styles.roleOptionText}>
        <Text style={[styles.roleOptionTitle, role === 'ADMIN' ? styles.roleOptionAdmin : null]}>
          {getRoleLabel(role)}
        </Text>
        <Text style={styles.roleOptionDescription}>{getRoleDescription(role)}</Text>
      </View>
      {selected && role !== currentRole ? (
        <Text style={styles.roleOptionBadge}>변경 후</Text>
      ) : null}
    </Pressable>
  );
}

function RoleChangeInlineError({error}: {error: ApiError}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '전역 관리자 정책과 충돌했습니다',
    conflictMessage:
      '마지막 활성 전역 관리자는 일반 사용자 또는 캠퍼스 관리자로 변경할 수 없습니다. 목록을 다시 불러온 뒤 최신 상태로 확인해 주세요.',
    permissionTitle: '역할 변경 권한이 없습니다',
    permissionMessage: '전역 관리자 권한이 없거나 본인 전역 관리자 강등이 차단되었습니다.',
    defaultTitle: '역할을 저장하지 못했습니다',
  });

  return (
    <View accessibilityRole="alert" style={styles.inlineError}>
      <Text style={styles.inlineErrorTitle}>{presentation.title}</Text>
      <Text style={styles.inlineErrorText}>{presentation.message}</Text>
    </View>
  );
}

function ActionButton({
  disabled = false,
  label,
  onPress,
  variant,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.actionButton,
        variant === 'primary' ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        disabled ? styles.filterButtonDisabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        style={[
          styles.actionButtonText,
          variant === 'primary'
            ? styles.actionButtonTextPrimary
            : styles.actionButtonTextSecondary,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ServiceAdminErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '역할 변경 정책과 충돌했습니다',
    conflictMessage:
      '마지막 활성 전역 관리자 정책과 충돌했습니다. 목록을 다시 불러온 뒤 진행해 주세요.',
    permissionTitle: '서비스 관리자 권한이 필요합니다',
    permissionMessage:
      '일반 사용자 또는 캠퍼스 관리자는 서비스 관리자 사용자 관리를 사용할 수 없습니다.',
    defaultTitle: '서비스 관리자 정보를 처리하지 못했습니다',
  });

  switch (error.kind) {
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="서비스 관리자 권한 오류 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="서비스 관리자 충돌 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="서비스 관리자 네트워크 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="서비스 관리자 세션 만료 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="서비스 관리자 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function ServiceAdminHeader({
  activeSection,
  onBackToUserMode,
}: {
  activeSection: ServiceAdminSection;
  onBackToUserMode: () => void;
}) {
  return (
    <View style={styles.serviceAdminHeader}>
      <FaithLogHeaderTopRow campusLabel="Service ADMIN" contextLabel="전역 관리자">
        <FaithLogHeaderPillButton
          accessibilityLabel="일반 사용자로 이동"
          label="사용자"
          onPress={onBackToUserMode}
        />
      </FaithLogHeaderTopRow>
      <Text style={styles.serviceAdminScreenTitle}>{getServiceAdminShellTitle(activeSection)}</Text>
    </View>
  );
}

function ServiceAdminBottomNav({
  activeSection,
  onSelectSection,
}: {
  activeSection: ServiceAdminSection;
  onSelectSection: (section: ServiceAdminSection) => void;
}) {
  return (
    <View style={styles.serviceAdminBottomNavFrame}>
      <View style={styles.serviceAdminBottomNavContent}>
        {SERVICE_ADMIN_SECTIONS.map((item) => {
          const selected = item.id === activeSection;

          return (
            <Pressable
              accessibilityLabel={`${item.label} 서비스 관리자 섹션으로 이동`}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              key={item.id}
              onPress={() => onSelectSection(item.id)}
              style={({pressed}) => [
                styles.serviceAdminBottomNavItem,
                selected ? styles.serviceAdminBottomNavItemActive : null,
                pressed ? styles.serviceAdminBottomNavItemPressed : null,
              ]}>
              <IconexIcon
                color={selected ? colors.primary : colors.mutedText}
                name={getServiceAdminTabIcon(item.id)}
                size={18}
                strokeWidth={1.7}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.serviceAdminBottomNavLabel,
                  selected ? styles.serviceAdminBottomNavLabelActive : null,
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FilterButton({
  accessibilityLabel,
  active,
  disabled = false,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? `${label} 필터`}
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
        ellipsizeMode="tail"
        numberOfLines={1}
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
    setAuthState({status: 'sessionExpired', message: '저장된 로그인 정보가 없습니다.'});
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

function getRoleDescription(role: RoleOption) {
  switch (role) {
    case 'USER':
      return '일반 사용자';
    case 'MANAGER':
      return '캠퍼스 생성 가능';
    case 'ADMIN':
      return '서비스 전체 관리';
    default:
      return assertNever(role);
  }
}

function getRoleLabel(role: RoleOption) {
  switch (role) {
    case 'USER':
      return '일반 사용자';
    case 'MANAGER':
      return '캠퍼스 관리자';
    case 'ADMIN':
      return '전역 관리자';
    default:
      return assertNever(role);
  }
}

function getRoleFilterLabel(role: RoleFilter) {
  switch (role) {
    case 'ALL':
      return '전체';
    case 'USER':
      return '일반';
    case 'MANAGER':
      return '관리자';
    case 'ADMIN':
      return '전역';
    default:
      return assertNever(role);
  }
}

function getRoleFilterAccessibilityLabel(role: RoleFilter) {
  return role === 'ALL' ? '전체 역할' : getRoleLabel(role);
}

function getServiceAdminCampusStatusLabel(
  status: ServiceAdminCampusList['content'][number]['status'],
) {
  switch (status) {
    case 'ACTIVE':
      return '운영';
    case 'PAUSED':
      return '중지';
    default:
      return assertNever(status);
  }
}

function getServiceAdminShellTitle(section: ServiceAdminSection) {
  switch (section) {
    case 'home':
      return '서비스 홈';
    case 'campuses':
      return '캠퍼스';
    case 'users':
      return '사용자';
    default:
      return assertNever(section);
  }
}

function getServiceAdminTabIcon(section: ServiceAdminSection): IconexIconName {
  switch (section) {
    case 'home':
      return 'home';
    case 'campuses':
      return 'category';
    case 'users':
      return 'users';
    default:
      return assertNever(section);
  }
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
  serviceAdminRoot: {
    backgroundColor: colors.background,
    flex: 1,
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  content: {
    gap: spacing.gap,
    paddingBottom: 12,
    paddingTop: 4,
  },
  serviceAdminFrame: {
    flex: 1,
    marginTop: 0,
    minHeight: 0,
  },
  serviceAdminScroll: {
    flex: 1,
    marginHorizontal: 0,
  },
  serviceAdminHeader: {
    backgroundColor: colors.background,
    gap: 6,
    marginHorizontal: 0,
    paddingBottom: 8,
    paddingTop: 0,
  },
  serviceAdminHeaderContext: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 40,
    width: '100%',
  },
  serviceAdminHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  serviceAdminCampusChip: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    flexShrink: 1,
    height: 28,
    justifyContent: 'center',
    maxWidth: 150,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  serviceAdminCampusText: {
    color: colors.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: 130,
  },
  serviceAdminContextName: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    maxWidth: 90,
    minWidth: 0,
  },
  serviceAdminScreenTitle: {
    color: colors.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
  },
  serviceAdminModeButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 18,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    height: 36,
    justifyContent: 'center',
    maxWidth: 76,
    minWidth: 68,
    paddingHorizontal: 12,
  },
  serviceAdminModeButtonPressed: {
    opacity: 0.72,
  },
  serviceAdminModeButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 18,
  },
  serviceAdminModeButtonChevron: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginLeft: 1,
  },
  serviceAdminBottomNavFrame: {
    flexShrink: 0,
  },
  serviceAdminBottomNavContent: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    height: 66,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: 1,
    paddingVertical: 7,
    width: '100%',
  },
  serviceAdminBottomNavItem: {
    alignItems: 'center',
    borderRadius: 16,
    flexBasis: 68,
    flexGrow: 1,
    flexShrink: 1,
    gap: 3,
    height: 52,
    justifyContent: 'center',
    minWidth: 0,
    maxWidth: 96,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  serviceAdminBottomNavItemActive: {
    backgroundColor: '#F2F7FF',
  },
  serviceAdminBottomNavItemPressed: {
    opacity: 0.72,
  },
  serviceAdminBottomNavLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  serviceAdminBottomNavLabelActive: {
    color: colors.primary,
  },
  homeHeroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  homeStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  homeStatCard: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.item,
    flex: 1,
    gap: 8,
    minHeight: 82,
    padding: 14,
  },
  homeStatLabel: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '600',
  },
  homeStatValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryUnavailable: {
    backgroundColor: colors.tealSoft,
    borderRadius: radius.item,
    gap: 4,
    padding: 14,
  },
  summaryUnavailableTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryUnavailableText: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  recentBlock: {
    gap: 8,
  },
  recentBlockTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 8,
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
    fontWeight: '600',
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
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
  paginationRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.control,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    padding: 6,
  },
  paginationButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  paginationButtonDisabled: {
    backgroundColor: colors.borderSoft,
    opacity: 0.65,
  },
  paginationButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 18,
  },
  paginationButtonTextDisabled: {
    color: colors.textMuted,
  },
  paginationPageBadge: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    minWidth: 72,
  },
  paginationPageText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    includeFontPadding: false,
    lineHeight: 20,
  },
  campusList: {
    gap: spacing.gap,
  },
  stepHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: radius.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 124,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  actionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  actionButtonText: {
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButtonTextPrimary: {
    color: colors.surface,
  },
  actionButtonTextSecondary: {
    color: colors.text,
  },
  roleProfileCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  roleProfileText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  roleOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  roleOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  roleOptionDisabled: {
    opacity: 0.5,
  },
  roleOptionIcon: {
    alignItems: 'center',
    borderColor: colors.textMuted,
    borderRadius: 9,
    borderWidth: 1,
    flexShrink: 0,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  roleOptionIconDot: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  roleOptionIconSelected: {
    borderColor: colors.primary,
  },
  roleOptionText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  roleOptionTitle: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  roleOptionAdmin: {
    color: colors.danger,
  },
  roleOptionDescription: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    lineHeight: 20,
  },
  roleOptionBadge: {
    color: colors.primary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  adminWarning: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radius.item,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  adminWarningTitle: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  adminWarningText: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    lineHeight: 20,
  },
  inlinePolicy: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlinePolicyText: {
    color: colors.warning,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  modeSheet: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  modeSheetBackdrop: {
    backgroundColor: colors.text,
    bottom: 0,
    left: 0,
    opacity: 0.34,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  modeSheetContainer: {
    bottom: 0,
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
  },
  modeSheetOption: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modeSheetOptionBody: {
    color: colors.mutedText,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  modeSheetOptionList: {
    gap: 10,
  },
  modeSheetOptionIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  modeSheetOptionText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  modeSheetOptionTitle: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  modeSheetRoot: {
    flex: 1,
  },
  roleSummary: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryRole: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryArrow: {
    color: colors.mutedText,
    fontSize: 15,
  },
  summaryRoleTarget: {
    color: colors.primary,
  },
  inlineError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.control,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlineErrorTitle: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  inlineErrorText: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.8,
  },
});
