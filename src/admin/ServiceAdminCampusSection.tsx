import {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {
  addServiceAdminCampusMember,
  changeServiceAdminStaleDutyChargeStatus,
  FaithLogApiError,
  fetchCampusDetail,
  fetchDutyAssignments,
  fetchServiceAdminStaleDutyCharges,
  getServiceAdminCampuses,
  revokeCoffeeDuty,
  updateCampus,
} from '../api/client';
import {mealApi} from '../meal/mealApi';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens} from '../api/tokenStorage';
import type {
  ApiError,
  AdminMemberChargeList,
  CampusDetail,
  DutyAssignment,
  ServiceAdminCampusList,
  ServiceAdminCampusListItem,
  ServiceAdminCampusOperationStatus,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
import {resolveCurrentAccessToken} from '../auth/accessTokenResolver';
import {validateCampusCreateForm} from '../campus/campusForms';
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
  TextField,
  Title,
} from '../components/ui';
import {colors, radius, spacing} from '../theme';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type ServiceAdminCampusSectionProps = {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type CampusStatusFilter = ServiceAdminCampusOperationStatus | 'ALL';
type CampusScreenStep = 'list' | 'detail' | 'edit' | 'confirm';

type CampusListState =
  | {status: 'loading'}
  | {status: 'success'; data: ServiceAdminCampusList}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

type CampusDetailState =
  | {status: 'idle'}
  | {status: 'loading'; campusId: number; summary: ServiceAdminCampusListItem | undefined}
  | {status: 'success'; data: CampusDetail; summary: ServiceAdminCampusListItem | undefined}
  | {
      status: 'error';
      campusId: number;
      error: ApiError;
      summary: ServiceAdminCampusListItem | undefined;
    };

type CampusActionState =
  | {status: 'idle'}
  | {status: 'savingCampus'}
  | {status: 'addingMember'}
  | {status: 'error'; error: ApiError};

type CampusEditForm = {
  description: string;
  isActive: boolean;
  name: string;
  region: string;
};

type CampusFieldErrors = Partial<Record<keyof CampusEditForm | 'memberUserId', string>>;

const CAMPUS_STATUS_FILTERS: Array<{id: CampusStatusFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'ACTIVE', label: '운영'},
  {id: 'PAUSED', label: '중지'},
];

const CAMPUS_STATUS_OPTIONS: Array<{id: ServiceAdminCampusOperationStatus; label: string}> = [
  {id: 'ACTIVE', label: '운영'},
  {id: 'PAUSED', label: '중지'},
];

const EMPTY_EDIT_FORM: CampusEditForm = {
  description: '',
  isActive: true,
  name: '',
  region: '',
};

export function ServiceAdminCampusSection({
  setAuthState,
  setNotice,
  state,
}: ServiceAdminCampusSectionProps) {
  const [campusScreen, setCampusScreen] = useState<CampusScreenStep>('list');
  const [nameFilter, setNameFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampusStatusFilter>('ALL');
  const [listState, setListState] = useState<CampusListState>({status: 'loading'});
  const [detailState, setDetailState] = useState<CampusDetailState>({status: 'idle'});
  const [actionState, setActionState] = useState<CampusActionState>({status: 'idle'});
  const [editForm, setEditForm] = useState<CampusEditForm>(EMPTY_EDIT_FORM);
  const [memberUserId, setMemberUserId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CampusFieldErrors>({});

  const selectedCampus = detailState.status === 'success' ? detailState.data : null;
  const selectedSummary = detailState.status === 'success' ? detailState.summary : undefined;

  const loadCampuses = async (showList = true) => {
    if (showList) {
      setCampusScreen('list');
    }

    if (state.user.role !== 'ADMIN') {
      setListState({
        status: 'error',
        error: {
          kind: 'permissionDenied',
          message: 'Service ADMIN 캠퍼스 관리에는 전역 ADMIN 권한이 필요합니다.',
        },
      });
      return;
    }

    setListState({status: 'loading'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const data = await getServiceAdminCampuses(accessToken, {
        name: nameFilter,
        region: regionFilter,
        status: statusFilter,
      });

      setListState(data.content.length > 0 ? {status: 'success', data} : {status: 'empty'});
    } catch (error) {
      const apiError = toApiError(error, 'Service ADMIN 캠퍼스 목록을 불러오지 못했습니다.');
      setListState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const loadCampusDetail = async (
    campusId: number,
    summary?: ServiceAdminCampusListItem,
  ) => {
    setCampusScreen('detail');
    setDetailState({status: 'loading', campusId, summary});
    setActionState({status: 'idle'});
    setFieldErrors({});
    setMemberUserId('');

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const data = await fetchCampusDetail(accessToken, campusId);
      setDetailState({status: 'success', data, summary});
      setEditForm(toEditForm(data));
    } catch (error) {
      const apiError = toApiError(error, '캠퍼스 상세를 불러오지 못했습니다.');
      setDetailState({status: 'error', campusId, error: apiError, summary});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const openCampusUpdateConfirm = () => {
    if (!selectedCampus) {
      return;
    }

    const validation = validateCampusCreateForm(editForm);

    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setCampusScreen('edit');
      return;
    }

    setFieldErrors({});
    setActionState({status: 'idle'});
    setCampusScreen('confirm');
  };

  const submitCampusUpdate = async () => {
    if (!selectedCampus) {
      return;
    }

    const validation = validateCampusCreateForm(editForm);

    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setCampusScreen('edit');
      return;
    }

    setActionState({status: 'savingCampus'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const updated = await updateCampus(accessToken, selectedCampus.campusId, {
        ...validation.payload,
        isActive: editForm.isActive,
      });

      setDetailState({status: 'success', data: updated, summary: selectedSummary});
      setEditForm(toEditForm(updated));
      setActionState({status: 'idle'});
      setCampusScreen('detail');
      setNotice({
        tone: 'success',
        title: '캠퍼스 수정 완료',
        message: `${updated.name} 캠퍼스 정보를 저장했습니다.`,
      });
      void loadCampuses(false);
    } catch (error) {
      const apiError = toApiError(error, '캠퍼스 정보를 저장하지 못했습니다.');
      setActionState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const submitMemberAdd = async () => {
    if (!selectedCampus) {
      return;
    }

    const userId = toOptionalPositiveInteger(memberUserId);

    if (userId === undefined || userId === null) {
      setFieldErrors((current) => ({
        ...current,
        memberUserId: '사용자 번호는 1 이상의 정수로 입력해 주세요.',
      }));
      return;
    }

    setFieldErrors((current) => {
      const next = {...current};
      delete next.memberUserId;
      return next;
    });
    setActionState({status: 'addingMember'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const member = await addServiceAdminCampusMember(accessToken, selectedCampus.campusId, {
        userId,
      });

      setMemberUserId('');
      setActionState({status: 'idle'});
      setNotice({
        tone: 'success',
        title: '멤버 추가 완료',
        message: `${member.name}님을 ${selectedCampus.name} 캠퍼스에 일반 멤버로 추가했습니다.`,
      });
      void loadCampuses(false);
    } catch (error) {
      const apiError = toApiError(error, '캠퍼스 멤버를 추가하지 못했습니다.');
      setActionState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    void loadCampuses();
    // 초기 진입 로드만 수행하고, 필터는 조회 버튼으로 명시 적용합니다.
  }, []);

  return (
    <>
      {campusScreen === 'list' ? (
        <>
          <Card>
            <View style={styles.screenStepHeader}>
              <Chip label="목록" tone="info" />
              <Title>캠퍼스 관리</Title>
              <Body>이름, 지역, 운영 상태로 캠퍼스를 찾고 상세 화면으로 이동합니다.</Body>
            </View>
            <TextField
              label="캠퍼스 이름"
              onChangeText={setNameFilter}
              placeholder="이름 검색"
              returnKeyType="search"
              value={nameFilter}
            />
            <TextField
              label="지역"
              onChangeText={setRegionFilter}
              placeholder="지역 검색"
              returnKeyType="search"
              value={regionFilter}
            />
            <View style={styles.segmentRow}>
              {CAMPUS_STATUS_FILTERS.map((status) => (
                <SegmentButton
                  active={statusFilter === status.id}
                  key={status.id}
                  label={status.label}
                  onPress={() => setStatusFilter(status.id)}
                />
              ))}
            </View>
            <Button
              accessibilityLabel="Service ADMIN 캠퍼스 목록 조회"
              onPress={() => void loadCampuses()}>
              조회
            </Button>
          </Card>

          <CampusListSection
            listState={listState}
            onRetry={() => void loadCampuses()}
            onSelectCampus={(campus) => void loadCampusDetail(campus.campusId, campus)}
          />
        </>
      ) : null}

      {campusScreen === 'detail' ? (
        <CampusDetailSection
          actionState={actionState}
          detailState={detailState}
          fieldErrors={fieldErrors}
          memberUserId={memberUserId}
          onBackToList={() => {
            setActionState({status: 'idle'});
            setCampusScreen('list');
          }}
          onEditCampus={() => {
            if (selectedCampus) {
              setEditForm(toEditForm(selectedCampus));
              setFieldErrors({});
              setActionState({status: 'idle'});
              setCampusScreen('edit');
            }
          }}
          onMemberUserIdChange={(value) => {
            setMemberUserId(value);
            setFieldErrors((current) => {
              const next = {...current};
              delete next.memberUserId;
              return next;
            });
          }}
          onRetry={(campusId, summary) => void loadCampusDetail(campusId, summary)}
          onSubmitMemberAdd={() => void submitMemberAdd()}
          setAuthState={setAuthState}
          setNotice={setNotice}
        />
      ) : null}

      {campusScreen === 'edit' ? (
        <CampusEditSection
          actionState={actionState}
          detailState={detailState}
          editForm={editForm}
          fieldErrors={fieldErrors}
          onBackToDetail={() => {
            if (selectedCampus) {
              setEditForm(toEditForm(selectedCampus));
            }
            setFieldErrors({});
            setActionState({status: 'idle'});
            setCampusScreen('detail');
          }}
          onEditFormChange={(patch) => setEditForm((current) => ({...current, ...patch}))}
          onRetry={(campusId, summary) => void loadCampusDetail(campusId, summary)}
          onReviewUpdate={openCampusUpdateConfirm}
        />
      ) : null}

      {campusScreen === 'confirm' ? (
        <CampusUpdateConfirmSection
          actionState={actionState}
          detailState={detailState}
          editForm={editForm}
          onBackToEdit={() => {
            setActionState({status: 'idle'});
            setCampusScreen('edit');
          }}
          onConfirmUpdate={() => void submitCampusUpdate()}
          onRetry={(campusId, summary) => void loadCampusDetail(campusId, summary)}
        />
      ) : null}

      {actionState.status === 'error' ? <InlineError error={actionState.error} /> : null}
    </>
  );
}

function CampusListSection({
  listState,
  onRetry,
  onSelectCampus,
}: {
  listState: CampusListState;
  onRetry: () => void;
  onSelectCampus: (campus: ServiceAdminCampusListItem) => void;
}) {
  switch (listState.status) {
    case 'loading':
      return <Loading message="Service ADMIN 캠퍼스 목록을 불러오고 있어요." />;
    case 'empty':
      return (
        <Empty
          title="조건에 맞는 캠퍼스가 없습니다"
          message="이름, 지역, 운영 상태 필터를 조정해 다시 조회하세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="Service ADMIN 캠퍼스 목록 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return <ServiceAdminCampusErrorState error={listState.error} onRetry={onRetry} />;
    case 'success':
      return (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Eyebrow>캠퍼스 목록</Eyebrow>
              <Body>
                총 {listState.data.totalElements}개, {listState.data.page + 1}/
                {Math.max(listState.data.totalPages, 1)} 페이지
              </Body>
            </View>
            <Chip label={`${listState.data.size}개씩`} tone="info" />
          </View>
          {listState.data.content.map((campus) => (
            <ListRow
              accessibilityLabel={`${campus.name} 캠퍼스 상세 보기`}
              key={campus.campusId}
              label={campus.name}
              onPress={() => onSelectCampus(campus)}
              supportingText={`멤버 ${campus.memberCount}명 · 관리자 ${campus.adminCount}명`}
              value={getCampusStatusLabel(campus.status)}
            />
          ))}
        </Card>
      );
    default:
      return assertNever(listState);
  }
}

function CampusDetailSection({
  actionState,
  detailState,
  fieldErrors,
  memberUserId,
  onBackToList,
  onEditCampus,
  onMemberUserIdChange,
  onRetry,
  onSubmitMemberAdd,
  setAuthState,
  setNotice,
}: {
  actionState: CampusActionState;
  detailState: CampusDetailState;
  fieldErrors: CampusFieldErrors;
  memberUserId: string;
  onBackToList: () => void;
  onEditCampus: () => void;
  onMemberUserIdChange: (value: string) => void;
  onRetry: (campusId: number, summary?: ServiceAdminCampusListItem) => void;
  onSubmitMemberAdd: () => void;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
}) {
  switch (detailState.status) {
    case 'idle':
      return (
        <Empty
          title="캠퍼스를 선택하세요"
          message="목록에서 캠퍼스를 선택하면 상세, 수정, 멤버 추가 작업이 표시됩니다."
        />
      );
    case 'loading':
      return <Loading message="선택한 캠퍼스 정보를 불러오고 있어요." />;
    case 'error':
      return (
        <ServiceAdminCampusErrorState
          error={detailState.error}
          onRetry={() => onRetry(detailState.campusId, detailState.summary)}
        />
      );
    case 'success':
      return (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Chip label="상세" tone="info" />
              <Title>{detailState.data.name}</Title>
            </View>
            <Chip label={getCampusActiveLabel(detailState.data.isActive)} tone="info" />
          </View>
          <ListRow label="지역" value={detailState.data.region} />
          <ListRow label="초대코드" value={detailState.data.inviteCode ?? '권한 없음'} />
          {detailState.summary ? (
            <>
              <ListRow label="운영 멤버" value={`${detailState.summary.memberCount}명`} />
              <ListRow label="운영 관리자" value={`${detailState.summary.adminCount}명`} />
            </>
          ) : null}

          <View style={styles.actions}>
            <Button
              accessibilityLabel="Service ADMIN 캠퍼스 목록으로 돌아가기"
              onPress={onBackToList}
              variant="ghost">
              목록
            </Button>
            <Button
              accessibilityLabel={`${detailState.data.name} 캠퍼스 정보 수정`}
              onPress={onEditCampus}
              variant="secondary">
              정보 수정
            </Button>
          </View>

          <View style={styles.formBlock}>
            <Chip label="멤버 추가" tone="info" />
            <TextField
              error={fieldErrors.memberUserId}
              helper="초대코드 없이 운영 멤버로 추가합니다. 이미 운영 중인 소속은 충돌로 안내됩니다."
              keyboardType="number-pad"
              label="사용자 번호"
              onChangeText={onMemberUserIdChange}
              placeholder="추가할 사용자 번호"
              value={memberUserId}
            />
            <Button
              accessibilityLabel="Service ADMIN 캠퍼스 멤버 추가"
              disabled={actionState.status === 'addingMember'}
              onPress={onSubmitMemberAdd}
              variant="secondary">
              {actionState.status === 'addingMember' ? '추가 중' : '멤버 추가'}
            </Button>
          </View>
          <ServiceAdminStaleDutyRecovery
            campusId={detailState.data.campusId}
            setAuthState={setAuthState}
            setNotice={setNotice}
          />
        </Card>
      );
    default:
      return assertNever(detailState);
  }
}

type StaleRecoveryState =
  | {status: 'loading'}
  | {status: 'success'; assignments: DutyAssignment[]}
  | {status: 'error'; error: ApiError};

function ServiceAdminStaleDutyRecovery({
  campusId,
  setAuthState,
  setNotice,
}: {
  campusId: number;
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
}) {
  const [state, setState] = useState<StaleRecoveryState>({status: 'loading'});
  const [charges, setCharges] = useState<AdminMemberChargeList | null>(null);
  const [selected, setSelected] = useState<DutyAssignment | null>(null);
  const [busy, setBusy] = useState(false);

  const loadAssignments = async () => {
    setState({status: 'loading'});
    try {
      const accessToken = await resolveAccessToken(setAuthState);
      if (!accessToken) return;
      const assignments = await fetchDutyAssignments(accessToken, campusId, {staleOnly: true});
      setState({status: 'success', assignments});
    } catch (error) {
      const apiError = toApiError(error, '과거 담당 배정을 불러오지 못했습니다.');
      setState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    setCharges(null);
    setSelected(null);
    void loadAssignments();
  }, [campusId]);

  const loadCharges = async (assignment: DutyAssignment) => {
    setBusy(true);
    setSelected(assignment);
    setCharges(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);
      if (!accessToken) return;
      const next = await fetchServiceAdminStaleDutyCharges(
        accessToken,
        campusId,
        assignment.userId,
        assignment.dutyType,
      );
      setCharges(next);
    } catch (error) {
      const apiError = toApiError(error, '과거 담당자의 미납 청구를 불러오지 못했습니다.');
      setNotice({tone: 'warning', title: '미납 청구를 확인하지 못했습니다', message: apiError.message});
      void handleAuthError(apiError, setAuthState);
    } finally {
      setBusy(false);
    }
  };

  const changeCharge = async (
    assignment: DutyAssignment,
    chargeId: number,
    status: 'PAID' | 'WAIVED' | 'CANCELED',
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const accessToken = await resolveAccessToken(setAuthState);
      if (!accessToken) return;
      await changeServiceAdminStaleDutyChargeStatus(accessToken, chargeId, status, {
        campusId,
        paymentCategory: assignment.dutyType,
        userId: assignment.userId,
      });
      const next = await fetchServiceAdminStaleDutyCharges(
        accessToken,
        campusId,
        assignment.userId,
        assignment.dutyType,
      );
      setCharges(next);
      setNotice({tone: 'success', title: '미납 청구를 정리했습니다', message: '담당 해제 전 남은 미납 청구를 확인해 주세요.'});
    } catch (error) {
      const apiError = toApiError(error, '청구 상태를 변경하지 못했습니다.');
      setNotice({tone: 'warning', title: '청구 상태를 변경하지 못했습니다', message: apiError.message});
      void handleAuthError(apiError, setAuthState);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (assignment: DutyAssignment) => {
    if (busy) return;
    setBusy(true);
    try {
      const accessToken = await resolveAccessToken(setAuthState);
      if (!accessToken) return;
      if (assignment.dutyType === 'COFFEE') {
        await revokeCoffeeDuty(accessToken, campusId, assignment.assignmentId);
      } else {
        await mealApi.revokeDuty(accessToken, campusId, assignment.assignmentId);
      }
      setCharges(null);
      setSelected(null);
      await loadAssignments();
      setNotice({tone: 'success', title: '과거 담당을 해제했습니다', message: '이제 해당 사용자는 캠퍼스에 다시 가입할 수 있습니다.'});
    } catch (error) {
      const apiError = toApiError(error, '과거 담당을 해제하지 못했습니다.');
      const conflict = apiError.code === 'CAMPUS_COFFEE_DUTY_UNPAID_CHARGE_CONFLICT' || apiError.code === 'CAMPUS_MEAL_DUTY_UNPAID_CHARGE_CONFLICT';
      setNotice({
        tone: 'warning',
        title: conflict ? '미납 청구 정리가 필요합니다' : '담당을 해제하지 못했습니다',
        message: conflict ? '이 담당자의 계좌에 미납 청구가 남아 있어 담당자를 해제할 수 없습니다.' : apiError.message,
      });
      void handleAuthError(apiError, setAuthState);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.formBlock}>
      <Chip label="과거 담당 복구" tone="warning" />
      <Body>탈퇴한 멤버에게 남은 담당 배정과 미납 청구를 명시적으로 정리합니다.</Body>
      {state.status === 'loading' ? <Loading message="과거 담당 배정을 확인하고 있어요." /> : null}
      {state.status === 'error' ? <InlineError error={state.error} /> : null}
      {state.status === 'success' && state.assignments.length === 0 ? (
        <Body>복구가 필요한 과거 담당 배정이 없습니다.</Body>
      ) : null}
      {state.status === 'success' ? state.assignments.map((assignment) => (
        <View key={assignment.assignmentId} style={styles.recoveryBlock}>
          <ListRow
            label={`${assignment.dutyType === 'COFFEE' ? '커피' : '밥'} 담당`}
            supportingText={assignment.email}
            value={assignment.name}
          />
          <View style={styles.actions}>
            <Button accessibilityLabel={`${assignment.name} 미납 청구 조회`} disabled={busy} onPress={() => void loadCharges(assignment)} variant="secondary">
              미납 조회
            </Button>
            <Button accessibilityLabel={`${assignment.name} 과거 담당 해제`} disabled={busy} onPress={() => void revoke(assignment)} variant="ghost">
              담당 해제
            </Button>
          </View>
        </View>
      )) : null}
      {selected && charges ? (
        <View style={styles.recoveryBlock}>
          <Title>{selected.name} 미납 청구</Title>
          {charges.items.length === 0 ? <Body>남은 미납 청구가 없습니다. 담당을 해제할 수 있습니다.</Body> : null}
          {charges.items.map((charge) => (
            <View key={charge.id} style={styles.recoveryBlock}>
              <ListRow label={charge.title} value={`${charge.amount.toLocaleString('ko-KR')}원`} />
              <View style={styles.actions}>
                {(['PAID', 'WAIVED', 'CANCELED'] as const).map((status) => (
                  <Button accessibilityLabel={`${charge.title} ${status === 'PAID' ? '납부' : status === 'WAIVED' ? '면제' : '취소'} 처리`} key={status} disabled={busy} onPress={() => void changeCharge(selected, charge.id, status)} variant="secondary">
                    {status === 'PAID' ? '납부' : status === 'WAIVED' ? '면제' : '취소'}
                  </Button>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CampusEditSection({
  actionState,
  detailState,
  editForm,
  fieldErrors,
  onBackToDetail,
  onEditFormChange,
  onRetry,
  onReviewUpdate,
}: {
  actionState: CampusActionState;
  detailState: CampusDetailState;
  editForm: CampusEditForm;
  fieldErrors: CampusFieldErrors;
  onBackToDetail: () => void;
  onEditFormChange: (patch: Partial<CampusEditForm>) => void;
  onRetry: (campusId: number, summary?: ServiceAdminCampusListItem) => void;
  onReviewUpdate: () => void;
}) {
  switch (detailState.status) {
    case 'idle':
      return (
        <Empty
          title="수정할 캠퍼스를 선택하세요"
          message="목록에서 캠퍼스를 선택한 뒤 정보 수정으로 이동할 수 있습니다."
        />
      );
    case 'loading':
      return <Loading message="수정할 캠퍼스 정보를 불러오고 있어요." />;
    case 'error':
      return (
        <ServiceAdminCampusErrorState
          error={detailState.error}
          onRetry={() => onRetry(detailState.campusId, detailState.summary)}
        />
      );
    case 'success':
      return (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Chip label="수정" tone="info" />
              <Title>캠퍼스 정보 수정</Title>
              <Body>{detailState.data.name} 캠퍼스의 이름, 지역, 설명, 운영 상태를 수정합니다.</Body>
            </View>
          </View>

          <TextField
            error={fieldErrors.name}
            label="캠퍼스 이름"
            onChangeText={(name) => onEditFormChange({name})}
            placeholder="캠퍼스 이름"
            value={editForm.name}
          />
          <TextField
            error={fieldErrors.region}
            label="지역"
            onChangeText={(region) => onEditFormChange({region})}
            placeholder="지역"
            value={editForm.region}
          />
          <TextField
            error={fieldErrors.description}
            label="설명"
            onChangeText={(description) => onEditFormChange({description})}
            placeholder="캠퍼스 설명"
            value={editForm.description}
          />
          <View style={styles.segmentRow}>
            {CAMPUS_STATUS_OPTIONS.map((status) => {
              const active = editForm.isActive === (status.id === 'ACTIVE');

              return (
                <SegmentButton
                  active={active}
                  key={status.id}
                  label={status.label}
                  onPress={() => onEditFormChange({isActive: status.id === 'ACTIVE'})}
                />
              );
            })}
          </View>
          {!editForm.isActive ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>운영 중지 영향 안내</Text>
              <Text style={styles.warningText}>
                저장하면 목록의 운영 상태가 중지로 표시됩니다. 멤버 사용 가능 범위는 서버
                권한 정책을 따르므로 사전 안내가 필요합니다.
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button
              accessibilityLabel="캠퍼스 상세로 돌아가기"
              disabled={actionState.status === 'savingCampus'}
              onPress={onBackToDetail}
              variant="ghost">
              취소
            </Button>
            <Button
              accessibilityLabel="캠퍼스 수정 내용 확인"
              disabled={actionState.status === 'savingCampus'}
              onPress={onReviewUpdate}>
              저장 확인
            </Button>
          </View>
        </Card>
      );
    default:
      return assertNever(detailState);
  }
}

function CampusUpdateConfirmSection({
  actionState,
  detailState,
  editForm,
  onBackToEdit,
  onConfirmUpdate,
  onRetry,
}: {
  actionState: CampusActionState;
  detailState: CampusDetailState;
  editForm: CampusEditForm;
  onBackToEdit: () => void;
  onConfirmUpdate: () => void;
  onRetry: (campusId: number, summary?: ServiceAdminCampusListItem) => void;
}) {
  switch (detailState.status) {
    case 'idle':
      return (
        <Empty
          title="확인할 수정 내용이 없습니다"
          message="목록에서 캠퍼스를 선택한 뒤 수정 내용을 확인할 수 있습니다."
        />
      );
    case 'loading':
      return <Loading message="확인할 캠퍼스 정보를 불러오고 있어요." />;
    case 'error':
      return (
        <ServiceAdminCampusErrorState
          error={detailState.error}
          onRetry={() => onRetry(detailState.campusId, detailState.summary)}
        />
      );
    case 'success':
      return (
        <Card>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Chip label="저장 확인" tone="warning" />
              <Title>수정 내용을 저장할까요?</Title>
              <Body>아래 내용으로 캠퍼스 정보가 변경됩니다. 저장 전 마지막으로 확인하세요.</Body>
            </View>
          </View>

          <View style={styles.compareBlock}>
            <ChangePreviewRow
              label="캠퍼스 이름"
              before={detailState.data.name}
              after={editForm.name}
            />
            <ChangePreviewRow label="지역" before={detailState.data.region} after={editForm.region} />
            <ChangePreviewRow
              label="설명"
              before={detailState.data.description}
              after={editForm.description}
            />
            <ChangePreviewRow
              label="운영 상태"
              before={getCampusActiveLabel(detailState.data.isActive)}
              after={getCampusActiveLabel(editForm.isActive)}
            />
          </View>

          {detailState.data.isActive && !editForm.isActive ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>운영 중지 확인</Text>
              <Text style={styles.warningText}>
                저장 후 캠퍼스는 중지 상태로 표시됩니다. 기존 구성원에게 운영 변경 사항을
                안내했는지 확인해 주세요.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              accessibilityLabel="캠퍼스 수정 화면으로 돌아가기"
              disabled={actionState.status === 'savingCampus'}
              onPress={onBackToEdit}
              variant="ghost">
              다시 수정
            </Button>
            <Button
              accessibilityLabel="캠퍼스 수정 내용 저장"
              disabled={actionState.status === 'savingCampus'}
              onPress={onConfirmUpdate}>
              {actionState.status === 'savingCampus' ? '저장 중' : '저장하기'}
            </Button>
          </View>
        </Card>
      );
    default:
      return assertNever(detailState);
  }
}

function ChangePreviewRow({
  after,
  before,
  label,
}: {
  after: string;
  before: string;
  label: string;
}) {
  const changed = before.trim() !== after.trim();

  return (
    <View style={styles.compareRow}>
      <View style={styles.compareTextGroup}>
        <Text style={styles.compareLabel}>{label}</Text>
        <Text style={styles.compareBefore}>기존: {before || '입력 없음'}</Text>
        <Text style={styles.compareAfter}>변경: {after || '입력 없음'}</Text>
      </View>
      <Chip label={changed ? '변경' : '유지'} tone={changed ? 'warning' : 'default'} />
    </View>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} 선택`}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      onPress={onPress}
      style={({pressed}) => [
        styles.segmentButton,
        active ? styles.segmentButtonActive : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={[styles.segmentButtonText, active ? styles.segmentButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ServiceAdminCampusErrorState({error, onRetry}: {error: ApiError; onRetry: () => void}) {
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '캠퍼스 상태와 충돌했습니다',
    conflictMessage:
      '이미 운영 중인 소속이 있거나 캠퍼스 상태 정책과 충돌했습니다. 최신 정보를 다시 불러와 주세요.',
    permissionTitle: 'Service ADMIN 권한이 필요합니다',
    permissionMessage: '일반 사용자 또는 캠퍼스 관리자는 Service ADMIN 캠퍼스 관리를 사용할 수 없습니다.',
    defaultTitle: '캠퍼스 정보를 처리하지 못했습니다',
  });

  switch (error.kind) {
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 캠퍼스 권한 오류 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 캠퍼스 충돌 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 캠퍼스 네트워크 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 캠퍼스 세션 만료 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="Service ADMIN 캠퍼스 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    default:
      return assertNever(error.kind);
  }
}

function InlineError({error}: {error: ApiError}) {
  return (
    <View accessibilityRole="alert" style={styles.inlineError}>
      <Text style={styles.inlineErrorText}>{getActionErrorMessage(error)}</Text>
    </View>
  );
}

function toEditForm(campus: CampusDetail): CampusEditForm {
  return {
    description: campus.description,
    isActive: campus.isActive,
    name: campus.name,
    region: campus.region,
  };
}

async function resolveAccessToken(setAuthState: (state: AuthGateState) => void) {
  return resolveCurrentAccessToken(() => {
    setAuthState({status: 'sessionExpired', message: '저장된 로그인 정보가 없습니다.'});
  });
}

async function handleAuthError(
  error: ApiError,
  setAuthState: (state: AuthGateState) => void,
) {
  if (error.kind === 'sessionExpired') {
    await clearTokens(error.authSessionGeneration);
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
    conflictMessage: '이미 운영 중인 소속이 있거나 캠퍼스 상태 정책과 충돌했습니다.',
    permissionMessage:
      '전역 관리자 권한이 없습니다. 일반 사용자 또는 캠퍼스 관리자는 Service ADMIN 캠퍼스 관리를 사용할 수 없습니다.',
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

function getCampusStatusLabel(status: ServiceAdminCampusOperationStatus) {
  switch (status) {
    case 'ACTIVE':
      return '운영';
    case 'PAUSED':
      return '중지';
    default:
      return assertNever(status);
  }
}

function getCampusActiveLabel(isActive: boolean) {
  return isActive ? '운영' : '중지';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled ServiceAdminCampusSection state: ${String(value)}`);
}

const styles = StyleSheet.create({
  screenStepHeader: {
    gap: 6,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.control,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  segmentButtonTextActive: {
    color: colors.surface,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  formBlock: {
    gap: spacing.gap,
    paddingTop: spacing.gap,
  },
  recoveryBlock: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.item,
    gap: 8,
    padding: 12,
  },
  compareBlock: {
    gap: 8,
  },
  compareRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.item,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compareTextGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  compareLabel: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  compareBefore: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    lineHeight: 20,
  },
  compareAfter: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    gap: 4,
    padding: spacing.card,
  },
  warningTitle: {
    color: colors.warning,
    fontSize: 15,
    fontWeight: '700',
  },
  warningText: {
    color: colors.warning,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  inlineError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.card,
    padding: spacing.card,
  },
  inlineErrorText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'flex-end',
  },
  pressed: {
    opacity: 0.8,
  },
});
