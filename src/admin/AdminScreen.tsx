import {useEffect, useMemo, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';

import {
  assignCoffeeDuty,
  changeAdminCampusMemberRole,
  deleteCampusMember,
  FaithLogApiError,
  fetchAdminCampusMembers,
  fetchAdminDashboardSummary,
  fetchDutyAssignments,
  revokeCoffeeDuty,
} from '../api/client';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  AdminCampusMember,
  AdminDashboardSummary,
  ApiError,
  CampusRole,
  DutyAssignment,
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
  ListRow,
  Loading,
  Offline,
  PermissionDenied,
  Title,
} from '../components/ui';
import {colors, radius, spacing} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type AdminScreenProps = {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type AdminTab = 'home' | 'members' | 'roles';
type MemberFilter = 'ALL' | 'ADMINS' | 'MEMBERS';
type RoleFilter = MemberFilter;

type AdminLoadState =
  | {status: 'loading'}
  | {
      status: 'success';
      duties: DutyAssignment[];
      members: AdminCampusMember[];
      summary: AdminDashboardSummary;
    }
  | {status: 'empty'; summary: AdminDashboardSummary}
  | {status: 'error'; error: ApiError};

type AdminActionState =
  | {status: 'idle'}
  | {status: 'changingRole'; membershipId: number}
  | {status: 'assigningCoffee'; userId: number}
  | {status: 'revokingCoffee'; assignmentId: number}
  | {status: 'deletingMember'; membershipId: number};

const adminTabs: Array<{id: AdminTab; label: string}> = [
  {id: 'home', label: '홈'},
  {id: 'members', label: '멤버'},
  {id: 'roles', label: '역할'},
];

const memberFilters: Array<{id: MemberFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'ADMINS', label: '리더'},
  {id: 'MEMBERS', label: '멤버'},
];

const campusRoleOptions: CampusRole[] = ['MEMBER', 'CAMPUS_LEADER', 'ELDER', 'MINISTER'];
const adminCampusRoles = new Set<CampusRole>(['MINISTER', 'ELDER', 'CAMPUS_LEADER']);

export function AdminScreen({setAuthState, setNotice, state}: AdminScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const weekStartDate = useMemo(() => getWeekStartDate(new Date()), [campusId]);
  const [tab, setTab] = useState<AdminTab>('home');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('ALL');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<AdminLoadState>({status: 'loading'});
  const [actionState, setActionState] = useState<AdminActionState>({status: 'idle'});
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCampusMember | null>(null);

  const loadAdmin = async () => {
    setLoadState({status: 'loading'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const [summary, members, duties] = await Promise.all([
        fetchAdminDashboardSummary(accessToken, campusId, {weekStartDate}),
        fetchAdminCampusMembers(accessToken, campusId),
        fetchDutyAssignments(accessToken, campusId),
      ]);

      if (members.length === 0) {
        setLoadState({status: 'empty', summary});
        setSelectedMemberId(null);
        return;
      }

      setLoadState({status: 'success', summary, members, duties});
    } catch (error) {
      const apiError = toApiError(error, '관리자 정보를 불러오지 못했습니다.');
      setLoadState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    setSelectedMemberId(null);
    void loadAdmin();
  }, [campusId]);

  const updateRole = async (member: AdminCampusMember, campusRole: CampusRole) => {
    if (actionState.status !== 'idle' || member.campusRole === campusRole) {
      return;
    }

    setActionState({status: 'changingRole', membershipId: member.membershipId});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const updated = await changeAdminCampusMemberRole(
        accessToken,
        campusId,
        member.membershipId,
        {campusRole},
      );
      replaceMember(updated);
      setNotice({
        tone: 'success',
        title: '캠퍼스 역할 변경',
        message: `${updated.name}님의 campus role을 ${updated.campusRole}로 변경했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '캠퍼스 역할을 변경하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const assignCoffee = async (member: AdminCampusMember) => {
    if (actionState.status !== 'idle') {
      return;
    }

    setActionState({status: 'assigningCoffee', userId: member.userId});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await assignCoffeeDuty(accessToken, campusId, {userId: member.userId});
      setNotice({
        tone: 'success',
        title: '커피 담당자 지정',
        message: `${member.name}님을 커피 담당자로 지정했습니다.`,
      });
      await loadAdmin();
    } catch (error) {
      const apiError = toApiError(error, '커피 담당자를 지정하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const revokeCoffee = async (assignment: DutyAssignment) => {
    if (actionState.status !== 'idle') {
      return;
    }

    setActionState({status: 'revokingCoffee', assignmentId: assignment.assignmentId});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await revokeCoffeeDuty(accessToken, campusId, assignment.assignmentId);
      setNotice({
        tone: 'success',
        title: '커피 담당자 해제',
        message: `${assignment.name}님의 커피 담당자 배정을 해제했습니다.`,
      });
      await loadAdmin();
    } catch (error) {
      const apiError = toApiError(error, '커피 담당자 배정을 해제하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const confirmDeleteMember = async () => {
    if (!deleteTarget || actionState.status !== 'idle') {
      return;
    }

    setActionState({status: 'deletingMember', membershipId: deleteTarget.membershipId});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await deleteCampusMember(accessToken, campusId, deleteTarget.membershipId);
      removeMember(deleteTarget.membershipId);
      setSelectedMemberId(null);
      setDeleteTarget(null);
      setNotice({
        tone: 'warning',
        title: '멤버 비활성화',
        message: `${deleteTarget.name}님의 캠퍼스 멤버십을 INACTIVE 처리했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '멤버를 비활성화하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const replaceMember = (updated: AdminCampusMember) => {
    setLoadState((current) => {
      if (current.status !== 'success') {
        return current;
      }

      return {
        ...current,
        members: current.members.map((member) =>
          member.membershipId === updated.membershipId ? updated : member,
        ),
      };
    });
  };

  const removeMember = (membershipId: number) => {
    setLoadState((current) => {
      if (current.status !== 'success') {
        return current;
      }

      const members = current.members.filter((member) => member.membershipId !== membershipId);

      if (members.length === 0) {
        return {status: 'empty', summary: current.summary};
      }

      return {...current, members};
    });
  };

  if (loadState.status === 'loading') {
    return <Loading message="관리자 홈, 멤버, 커피 담당자 정보를 불러오고 있어요." />;
  }

  if (loadState.status === 'error') {
    return <AdminErrorState error={loadState.error} onRetry={loadAdmin} />;
  }

  if (loadState.status === 'empty') {
    return (
      <>
        <AdminShellHeader
          activeTab={tab}
          campusLabel={getCampusLabel(state)}
          globalRole={state.user.role}
          onSelectTab={setTab}
          selectedCampusRole={state.selectedCampus.campusRole}
        />
        <AdminHome summary={loadState.summary} onOpenMembers={() => setTab('members')} />
        <Empty
          title="ACTIVE 멤버가 없습니다"
          message="REST Docs 기준 관리자 멤버 목록은 ACTIVE 멤버만 반환합니다."
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="관리자 멤버 목록 다시 불러오기"
          onActionPress={loadAdmin}
        />
      </>
    );
  }

  const coffeeDuty = getActiveCoffeeDuty(loadState.duties);
  const selectedMember = selectedMemberId
    ? loadState.members.find((member) => member.membershipId === selectedMemberId) ?? null
    : null;

  return (
    <>
      <AdminShellHeader
        activeTab={tab}
        campusLabel={getCampusLabel(state)}
        globalRole={state.user.role}
        onSelectTab={(nextTab) => {
          setSelectedMemberId(null);
          setTab(nextTab);
        }}
        selectedCampusRole={state.selectedCampus.campusRole}
      />
      {actionError ? <AdminInlineError error={actionError} /> : null}
      {selectedMember ? (
        <AdminMemberDetail
          actionState={actionState}
          coffeeDuty={coffeeDuty}
          globalRole={state.user.role}
          member={selectedMember}
          onAssignCoffee={() => assignCoffee(selectedMember)}
          onBack={() => setSelectedMemberId(null)}
          onRequestDelete={() => setDeleteTarget(selectedMember)}
          onRevokeCoffee={revokeCoffee}
          onUpdateRole={(role) => updateRole(selectedMember, role)}
          selectedCampusRole={state.selectedCampus.campusRole}
        />
      ) : tab === 'home' ? (
        <AdminHome
          coffeeDuty={coffeeDuty}
          summary={loadState.summary}
          onOpenMembers={() => setTab('members')}
          onOpenRoles={() => setTab('roles')}
        />
      ) : tab === 'members' ? (
        <AdminMembers
          filter={memberFilter}
          members={loadState.members}
          onOpenRoles={() => setTab('roles')}
          onSelectFilter={setMemberFilter}
          onSelectMember={(member) => setSelectedMemberId(member.membershipId)}
        />
      ) : (
        <AdminRoleManagement
          actionState={actionState}
          filter={roleFilter}
          globalRole={state.user.role}
          members={loadState.members}
          onSelectFilter={setRoleFilter}
          onSelectMember={(member) => setSelectedMemberId(member.membershipId)}
          onUpdateRole={updateRole}
          selectedCampusRole={state.selectedCampus.campusRole}
        />
      )}
      <DeleteMemberSheet
        error={actionError}
        loading={
          actionState.status === 'deletingMember' &&
          deleteTarget?.membershipId === actionState.membershipId
        }
        member={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteMember}
      />
    </>
  );
}

function AdminShellHeader({
  activeTab,
  campusLabel,
  globalRole,
  onSelectTab,
  selectedCampusRole,
}: {
  activeTab: AdminTab;
  campusLabel: string;
  globalRole: string;
  onSelectTab: (tab: AdminTab) => void;
  selectedCampusRole: CampusRole;
}) {
  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <View style={styles.chipRow}>
            <Chip label={campusLabel} tone="info" />
            <Chip label="관리자" tone="success" />
          </View>
          <Eyebrow>Admin 01-03, 26</Eyebrow>
          <Title>관리자 홈</Title>
          <Body>
            global role {globalRole}와 campus role {selectedCampusRole}를 분리해서 표시합니다.
          </Body>
        </View>
      </View>
      <SegmentedControl items={adminTabs} selectedId={activeTab} onSelect={onSelectTab} />
    </Card>
  );
}

function AdminHome({
  coffeeDuty,
  onOpenMembers,
  onOpenRoles,
  summary,
}: {
  coffeeDuty?: DutyAssignment | null;
  onOpenMembers: () => void;
  onOpenRoles?: () => void;
  summary: AdminDashboardSummary;
}) {
  return (
    <>
      <Card>
        <Eyebrow>Admin 01 Home</Eyebrow>
        <Title>{summary.campus.campusName} 운영 체크</Title>
        <Body>경건 미제출, 투표 미응답, 미납을 한 화면에서 확인합니다.</Body>
        <View style={styles.metricGrid}>
          <Metric label="ACTIVE 멤버" value={`${summary.members.activeCount}명`} />
          <Metric label="캠퍼스 관리자" value={`${summary.members.adminCount}명`} />
          <Metric label="미제출" value={`${summary.devotion.missingCount}명`} />
          <Metric label="제출률" value={`${summary.devotion.submitRate}%`} />
          <Metric label="미응답" value={`${summary.polls.missingResponseCount}명`} />
          <Metric label="미납" value={formatCompactWon(summary.charges.unpaidAmount)} />
        </View>
        <Body>
          기준 주차 {summary.devotion.weekStartDate}, 최근 종료 투표 기준 {summary.polls.recentlyClosedDays}일
        </Body>
      </Card>
      <Card>
        <Eyebrow>빠른 관리</Eyebrow>
        <ListRow
          label="멤버 관리"
          supportingText="ACTIVE 멤버 목록과 상세 관리"
          value="보기"
          onPress={onOpenMembers}
          accessibilityLabel="관리자 멤버 관리 화면으로 이동"
        />
        <ListRow
          label="커피 담당자"
          supportingText={coffeeDuty ? `${coffeeDuty.name} · ${coffeeDuty.email}` : '현재 지정된 담당자가 없습니다'}
          value={coffeeDuty ? '지정됨' : '미지정'}
        />
        {onOpenRoles ? (
          <ListRow
            label="역할 관리"
            supportingText="campus role 변경 전용. global role은 변경하지 않습니다."
            value="보기"
            onPress={onOpenRoles}
            accessibilityLabel="관리자 역할 관리 화면으로 이동"
          />
        ) : null}
      </Card>
    </>
  );
}

function AdminMembers({
  filter,
  members,
  onOpenRoles,
  onSelectFilter,
  onSelectMember,
}: {
  filter: MemberFilter;
  members: AdminCampusMember[];
  onOpenRoles: () => void;
  onSelectFilter: (filter: MemberFilter) => void;
  onSelectMember: (member: AdminCampusMember) => void;
}) {
  const filteredMembers = filterMembers(members, filter);

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Eyebrow>Admin 02 Members</Eyebrow>
          <Title>멤버 관리</Title>
          <Body>멤버 상세에서 역할 변경, 커피 담당자 지정, 위험 액션을 처리합니다.</Body>
        </View>
        <Button accessibilityLabel="역할 관리 화면으로 이동" onPress={onOpenRoles} variant="secondary">
          역할 관리
        </Button>
      </View>
      <SegmentedControl items={memberFilters} selectedId={filter} onSelect={onSelectFilter} />
      {filteredMembers.length === 0 ? (
        <Empty title="조건에 맞는 멤버가 없습니다" message="다른 역할 필터를 선택해 주세요." />
      ) : (
        filteredMembers.map((member) => (
          <MemberRow
            key={member.membershipId}
            member={member}
            onPress={() => onSelectMember(member)}
          />
        ))
      )}
    </Card>
  );
}

function AdminMemberDetail({
  actionState,
  coffeeDuty,
  globalRole,
  member,
  onAssignCoffee,
  onBack,
  onRequestDelete,
  onRevokeCoffee,
  onUpdateRole,
  selectedCampusRole,
}: {
  actionState: AdminActionState;
  coffeeDuty: DutyAssignment | null;
  globalRole: string;
  member: AdminCampusMember;
  onAssignCoffee: () => void;
  onBack: () => void;
  onRequestDelete: () => void;
  onRevokeCoffee: (assignment: DutyAssignment) => void;
  onUpdateRole: (role: CampusRole) => void;
  selectedCampusRole: CampusRole;
}) {
  const memberCoffeeDuty = coffeeDuty?.userId === member.userId ? coffeeDuty : null;
  const busy = actionState.status !== 'idle';

  return (
    <>
      <Card>
        <Eyebrow>Admin 03 Member Detail + Coffee Duty</Eyebrow>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Title>{member.name}</Title>
            <Body>{member.email}</Body>
          </View>
          <Button accessibilityLabel="멤버 목록으로 돌아가기" onPress={onBack} variant="ghost">
            목록
          </Button>
        </View>
        <View style={styles.chipRow}>
          <Chip label={`campus ${member.campusRole}`} tone="info" />
          <Chip label={member.status} tone={member.status === 'ACTIVE' ? 'success' : 'warning'} />
        </View>
        <ListRow label="현재 로그인 global role" value={globalRole} />
        <ListRow label="현재 로그인 campus role" value={selectedCampusRole} />
        <Body>이 화면의 역할 변경은 campus role만 변경하며, global role은 Service ADMIN 영역과 분리합니다.</Body>
      </Card>
      <Card>
        <Eyebrow>역할 변경</Eyebrow>
        <View style={styles.roleGrid}>
          {campusRoleOptions.map((role) => (
            <Button
              accessibilityLabel={`${member.name} 캠퍼스 역할을 ${role}로 변경`}
              disabled={busy || member.campusRole === role}
              key={role}
              onPress={() => onUpdateRole(role)}
              variant={member.campusRole === role ? 'ghost' : 'secondary'}>
              {role}
            </Button>
          ))}
        </View>
      </Card>
      <Card>
        <Eyebrow>운영 담당</Eyebrow>
        <Title>{memberCoffeeDuty ? '현재 커피 담당자입니다' : '현재 커피 담당자가 아니에요'}</Title>
        {coffeeDuty && !memberCoffeeDuty ? (
          <Body>현재 커피 담당자는 {coffeeDuty.name}님입니다. 새 담당자를 지정하면 기존 배정은 inactive 처리됩니다.</Body>
        ) : null}
        <View style={styles.actionRow}>
          {memberCoffeeDuty ? (
            <Button
              accessibilityLabel={`${member.name} 커피 담당자 해제`}
              disabled={busy}
              onPress={() => onRevokeCoffee(memberCoffeeDuty)}
              variant="danger">
              {actionState.status === 'revokingCoffee' ? '해제 중...' : '커피 담당 해제'}
            </Button>
          ) : (
            <Button
              accessibilityLabel={`${member.name} 커피 담당자로 지정`}
              disabled={busy}
              onPress={onAssignCoffee}>
              {actionState.status === 'assigningCoffee' ? '지정 중...' : '커피 담당자로 지정'}
            </Button>
          )}
        </View>
      </Card>
      <Card>
        <Eyebrow>위험 액션</Eyebrow>
        <Title>멤버 비활성화</Title>
        <Body>REST Docs 기준 멤버 삭제는 물리 삭제가 아니라 membership status를 INACTIVE로 바꾸는 soft delete입니다.</Body>
        <Button
          accessibilityLabel={`${member.name} 멤버 비활성화 확인 sheet 열기`}
          disabled={busy}
          onPress={onRequestDelete}
          variant="danger">
          비활성화
        </Button>
      </Card>
    </>
  );
}

function AdminRoleManagement({
  actionState,
  filter,
  globalRole,
  members,
  onSelectFilter,
  onSelectMember,
  onUpdateRole,
  selectedCampusRole,
}: {
  actionState: AdminActionState;
  filter: RoleFilter;
  globalRole: string;
  members: AdminCampusMember[];
  onSelectFilter: (filter: RoleFilter) => void;
  onSelectMember: (member: AdminCampusMember) => void;
  onUpdateRole: (member: AdminCampusMember, role: CampusRole) => void;
  selectedCampusRole: CampusRole;
}) {
  const filteredMembers = filterMembers(members, filter);
  const adminCount = members.filter((member) => adminCampusRoles.has(member.campusRole)).length;

  return (
    <>
      <Card>
        <Eyebrow>Admin 26 Role Management</Eyebrow>
        <Title>역할 관리</Title>
        <Body>
          campus role 관리자 {adminCount}명. 현재 계정은 global {globalRole}, campus {selectedCampusRole}입니다.
        </Body>
        <Body>global role 변경은 이 화면에서 하지 않습니다. 권한 위계 위반은 서버 403 UX로 분리합니다.</Body>
      </Card>
      <Card>
        <Eyebrow>역할별 보기</Eyebrow>
        <SegmentedControl items={memberFilters} selectedId={filter} onSelect={onSelectFilter} />
        {filteredMembers.map((member) => (
          <View key={member.membershipId} style={styles.roleRow}>
            <Pressable
              accessibilityLabel={`${member.name} 상세 보기`}
              accessibilityRole="button"
              onPress={() => onSelectMember(member)}
              style={({pressed}) => [styles.roleRowHeader, pressed ? styles.pressed : null]}>
              <Avatar name={member.name} role={member.campusRole} />
              <View style={styles.headerText}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberMeta}>{member.email}</Text>
              </View>
              <Chip label={member.campusRole} tone={adminCampusRoles.has(member.campusRole) ? 'info' : 'default'} />
            </Pressable>
            <View style={styles.roleGrid}>
              {campusRoleOptions.map((role) => (
                <Button
                  accessibilityLabel={`${member.name} 캠퍼스 역할을 ${role}로 변경`}
                  disabled={
                    actionState.status !== 'idle' ||
                    member.campusRole === role ||
                    (adminCount <= 1 && adminCampusRoles.has(member.campusRole) && role === 'MEMBER')
                  }
                  key={role}
                  onPress={() => onUpdateRole(member, role)}
                  variant={member.campusRole === role ? 'ghost' : 'secondary'}>
                  {role}
                </Button>
              ))}
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

function MemberRow({member, onPress}: {member: AdminCampusMember; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={`${member.name} 멤버 상세 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.memberRow, pressed ? styles.pressed : null]}>
      <Avatar name={member.name} role={member.campusRole} />
      <View style={styles.headerText}>
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.memberMeta}>
          {member.campusRole} · {member.status}
        </Text>
      </View>
      <Text style={styles.memberAction}>상세</Text>
    </Pressable>
  );
}

function DeleteMemberSheet({
  error,
  loading,
  member,
  onCancel,
  onConfirm,
}: {
  error: ApiError | null;
  loading: boolean;
  member: AdminCampusMember | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={member !== null} onRequestClose={onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Eyebrow>멤버 삭제 확인</Eyebrow>
          <Title>{member ? `${member.name}님을 비활성화할까요?` : '멤버 비활성화'}</Title>
          <Body>
            이 액션은 캠퍼스 멤버십을 INACTIVE로 바꾸며, 권한 부족 시 403 안내를 보여줍니다.
          </Body>
          {error ? <AdminInlineError error={error} /> : null}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="멤버 비활성화 실행"
              disabled={loading}
              onPress={onConfirm}
              variant="danger">
              {loading ? '처리 중...' : '비활성화'}
            </Button>
            <Button
              accessibilityLabel="멤버 비활성화 취소"
              disabled={loading}
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

function SegmentedControl<T extends string>({
  items,
  onSelect,
  selectedId,
}: {
  items: Array<{id: T; label: string}>;
  onSelect: (id: T) => void;
  selectedId: T;
}) {
  return (
    <View style={styles.segmented}>
      {items.map((item) => {
        const active = item.id === selectedId;

        return (
          <Pressable
            accessibilityLabel={`${item.label} 필터 선택`}
            accessibilityRole="button"
            accessibilityState={{selected: active}}
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={({pressed}) => [
              styles.segment,
              active ? styles.segmentActive : null,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Avatar({name, role}: {name: string; role: CampusRole}) {
  return (
    <View style={[styles.avatar, adminCampusRoles.has(role) ? styles.adminAvatar : null]}>
      <Text style={[styles.avatarText, adminCampusRoles.has(role) ? styles.adminAvatarText : null]}>
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}

function AdminErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  switch (error.kind) {
    case 'permissionDenied':
      return (
        <PermissionDenied
          title="관리자 권한이 필요합니다"
          message={error.message}
          actionLabel="다시 확인"
          actionAccessibilityLabel="관리자 권한 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title="최신 상태 확인이 필요합니다"
          message={error.message}
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="관리자 충돌 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title="네트워크 연결이 불안정합니다"
          message={error.message}
          actionLabel="다시 시도"
          actionAccessibilityLabel="관리자 네트워크 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'sessionExpired':
      return (
        <ErrorState
          title="세션이 만료되었습니다"
          message={error.message}
          actionLabel="다시 확인"
          actionAccessibilityLabel="세션 만료 후 앱 상태 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title="관리자 정보를 불러오지 못했습니다"
          message={error.message}
          actionLabel="다시 시도"
          actionAccessibilityLabel="관리자 정보 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function AdminInlineError({error}: {error: ApiError}) {
  return (
    <View accessibilityRole="alert" style={styles.inlineError}>
      <Text style={styles.inlineErrorText}>{getAdminActionErrorMessage(error)}</Text>
    </View>
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

function getAdminActionErrorMessage(error: ApiError) {
  switch (error.kind) {
    case 'permissionDenied':
      return '권한이 부족합니다. 같은 단계 이상의 campus role 변경이나 멤버 비활성화는 서버가 403으로 거부할 수 있습니다.';
    case 'conflict':
      return error.message || '최신 상태와 충돌했습니다. 다시 불러온 뒤 시도해 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'error':
      return error.message;
    default:
      return assertNever(error.kind);
  }
}

function filterMembers(members: AdminCampusMember[], filter: MemberFilter) {
  switch (filter) {
    case 'ALL':
      return members;
    case 'ADMINS':
      return members.filter((member) => adminCampusRoles.has(member.campusRole));
    case 'MEMBERS':
      return members.filter((member) => member.campusRole === 'MEMBER');
    default:
      return assertNever(filter);
  }
}

function getActiveCoffeeDuty(duties: DutyAssignment[]) {
  return duties.find((duty) => duty.dutyType === 'COFFEE' && duty.isActive) ?? null;
}

function getCampusLabel(state: AuthenticatedState) {
  return `${state.selectedCampus.region} ${state.selectedCampus.campusName}`;
}

function getWeekStartDate(date: Date) {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const distanceFromMonday = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + distanceFromMonday);

  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(weekStart.getDate()).padStart(2, '0');

  return `${year}-${month}-${dayOfMonth}`;
}

function formatCompactWon(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }

  return `${value}원`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled admin value: ${String(value)}`);
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  adminAvatar: {
    backgroundColor: colors.tealSoft,
  },
  adminAvatarText: {
    color: colors.teal,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  inlineError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.item,
    padding: spacing.card,
  },
  inlineErrorText: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  memberAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  memberMeta: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 19,
  },
  memberName: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  memberRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.gap,
    padding: 14,
  },
  metric: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.item,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 6,
    minWidth: 128,
    padding: 14,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  metricLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '800',
  },
  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.72,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleRow: {
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    gap: spacing.gap,
    padding: 14,
  },
  roleRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radius.control,
    flexGrow: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentActive: {
    backgroundColor: colors.primarySoft,
  },
  segmented: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.control,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: 4,
  },
  segmentText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: colors.primary,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: spacing.gap,
    padding: spacing.card,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(17, 24, 39, 0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
});
