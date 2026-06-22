import {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';

import {
  addServiceAdminCampusMember,
  FaithLogApiError,
  fetchCampusDetail,
  getServiceAdminCampuses,
  updateCampus,
} from '../api/client';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  ApiError,
  CampusDetail,
  ServiceAdminCampusList,
  ServiceAdminCampusListItem,
  ServiceAdminCampusOperationStatus,
} from '../api/types';
import type {AuthGateState} from '../auth/authGate';
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
  | {status: 'confirmingDeactivate'}
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

  const loadCampuses = async () => {
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

  const submitCampusUpdate = async (skipDeactivateConfirm = false) => {
    if (!selectedCampus) {
      return;
    }

    const validation = validateCampusCreateForm(editForm);

    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    if (selectedCampus.isActive && !editForm.isActive && !skipDeactivateConfirm) {
      setActionState({status: 'confirmingDeactivate'});
      return;
    }

    setFieldErrors({});
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
      setNotice({
        tone: 'success',
        title: '캠퍼스 수정 완료',
        message: `${updated.name} 캠퍼스 정보를 저장했습니다.`,
      });
      void loadCampuses();
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
        memberUserId: 'userId는 1 이상의 정수로 입력해 주세요.',
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
        message: `${member.name}님을 ${selectedCampus.name} 캠퍼스에 MEMBER로 추가했습니다.`,
      });
      void loadCampuses();
    } catch (error) {
      const apiError = toApiError(error, '캠퍼스 멤버를 추가하지 못했습니다.');
      setActionState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  useEffect(() => {
    void loadCampuses();
    // 초기 진입 로드만 수행하고, 필터는 조회 버튼으로 명시 적용합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Card>
        <Eyebrow>캠퍼스 필터</Eyebrow>
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
        <Button accessibilityLabel="Service ADMIN 캠퍼스 목록 조회" onPress={loadCampuses}>
          조회
        </Button>
      </Card>

      <CampusListSection
        listState={listState}
        onRetry={loadCampuses}
        onSelectCampus={(campus) => void loadCampusDetail(campus.campusId, campus)}
      />

      <CampusDetailSection
        actionState={actionState}
        detailState={detailState}
        editForm={editForm}
        fieldErrors={fieldErrors}
        memberUserId={memberUserId}
        onEditFormChange={(patch) => setEditForm((current) => ({...current, ...patch}))}
        onMemberUserIdChange={(value) => {
          setMemberUserId(value);
          setFieldErrors((current) => {
            const next = {...current};
            delete next.memberUserId;
            return next;
          });
        }}
        onRetry={(campusId, summary) => void loadCampusDetail(campusId, summary)}
        onSubmitCampusUpdate={() => void submitCampusUpdate()}
        onSubmitMemberAdd={() => void submitMemberAdd()}
      />

      {actionState.status === 'error' ? <InlineError error={actionState.error} /> : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setActionState({status: 'idle'})}
        transparent
        visible={actionState.status === 'confirmingDeactivate'}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Chip label="영향 확인" tone="warning" />
            <Title>캠퍼스를 중지할까요?</Title>
            <Body>
              중지된 캠퍼스는 Service ADMIN 목록에서 PAUSED로 표시됩니다. 기존 멤버의 이용
              가능 범위와 관리자 작업은 서버 권한 정책의 영향을 받으므로, 운영 중지 전에
              구성원에게 안내해 주세요.
            </Body>
            <View style={styles.actions}>
              <Button
                accessibilityLabel="캠퍼스 중지 취소"
                onPress={() => setActionState({status: 'idle'})}
                variant="ghost">
                취소
              </Button>
              <Button
                accessibilityLabel="캠퍼스 중지 확정"
                onPress={() => void submitCampusUpdate(true)}
                variant="danger">
                중지 저장
              </Button>
            </View>
          </View>
        </View>
      </Modal>
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
              label={`${campus.name} #${campus.campusId}`}
              onPress={() => onSelectCampus(campus)}
              supportingText={`${campus.region} · 멤버 ${campus.memberCount}명 · 관리자 ${campus.adminCount}명`}
              value={campus.status}
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
  editForm,
  fieldErrors,
  memberUserId,
  onEditFormChange,
  onMemberUserIdChange,
  onRetry,
  onSubmitCampusUpdate,
  onSubmitMemberAdd,
}: {
  actionState: CampusActionState;
  detailState: CampusDetailState;
  editForm: CampusEditForm;
  fieldErrors: CampusFieldErrors;
  memberUserId: string;
  onEditFormChange: (patch: Partial<CampusEditForm>) => void;
  onMemberUserIdChange: (value: string) => void;
  onRetry: (campusId: number, summary?: ServiceAdminCampusListItem) => void;
  onSubmitCampusUpdate: () => void;
  onSubmitMemberAdd: () => void;
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
      return <Loading message={`#${detailState.campusId} 캠퍼스를 불러오고 있어요.`} />;
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
              <Eyebrow>캠퍼스 상세</Eyebrow>
              <Title>{detailState.data.name}</Title>
            </View>
            <Chip label={detailState.data.isActive ? 'ACTIVE' : 'PAUSED'} tone="info" />
          </View>
          <ListRow label="campusId" value={String(detailState.data.campusId)} />
          <ListRow label="지역" value={detailState.data.region} />
          <ListRow label="초대코드" value={detailState.data.inviteCode ?? '권한 없음'} />
          {detailState.summary ? (
            <>
              <ListRow label="ACTIVE 멤버" value={`${detailState.summary.memberCount}명`} />
              <ListRow label="ACTIVE 관리자" value={`${detailState.summary.adminCount}명`} />
            </>
          ) : null}

          <View style={styles.formBlock}>
            <Eyebrow>Admin 13-1 Campus Edit</Eyebrow>
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
                <Text style={styles.warningTitle}>비활성화 영향 안내</Text>
                <Text style={styles.warningText}>
                  저장하면 Service ADMIN 캠퍼스 목록의 운영 상태가 PAUSED로 표시됩니다.
                  멤버 사용 가능 범위는 서버 권한 정책을 따르므로 사전 안내가 필요합니다.
                </Text>
              </View>
            ) : null}
            <Button
              accessibilityLabel="캠퍼스 정보 저장"
              disabled={actionState.status === 'savingCampus'}
              onPress={onSubmitCampusUpdate}>
              {actionState.status === 'savingCampus' ? '저장 중' : '캠퍼스 저장'}
            </Button>
          </View>

          <View style={styles.formBlock}>
            <Eyebrow>멤버 직접 추가</Eyebrow>
            <TextField
              error={fieldErrors.memberUserId}
              helper="초대코드 없이 ACTIVE + MEMBER 소속으로 추가합니다."
              keyboardType="number-pad"
              label="userId"
              onChangeText={onMemberUserIdChange}
              placeholder="추가할 사용자 ID"
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
        </Card>
      );
    default:
      return assertNever(detailState);
  }
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
  switch (error.kind) {
    case 'permissionDenied':
      return (
        <PermissionDenied
          title="Service ADMIN 권한이 필요합니다"
          message={error.message}
          actionLabel="다시 확인"
          actionAccessibilityLabel="Service ADMIN 캠퍼스 권한 오류 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title="캠퍼스 상태와 충돌했습니다"
          message={error.message}
          actionLabel="다시 불러오기"
          actionAccessibilityLabel="Service ADMIN 캠퍼스 충돌 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title="네트워크 연결이 불안정합니다"
          message={error.message}
          actionLabel="다시 시도"
          actionAccessibilityLabel="Service ADMIN 캠퍼스 네트워크 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'sessionExpired':
      return (
        <ErrorState
          title="세션이 만료되었습니다"
          message={error.message}
          actionLabel="다시 확인"
          actionAccessibilityLabel="Service ADMIN 캠퍼스 세션 만료 후 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title="캠퍼스 정보를 처리하지 못했습니다"
          message={error.message}
          actionLabel="다시 시도"
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
  switch (error.kind) {
    case 'permissionDenied':
      return '전역 ADMIN 권한이 없습니다. USER 또는 MANAGER는 Service ADMIN 캠퍼스 관리를 사용할 수 없습니다.';
    case 'conflict':
      return error.message || '이미 ACTIVE 소속이 있거나 캠퍼스 상태 정책과 충돌했습니다.';
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
  throw new Error(`Unhandled ServiceAdminCampusSection state: ${String(value)}`);
}

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  segmentButtonTextActive: {
    color: colors.surface,
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
  formBlock: {
    gap: spacing.gap,
    paddingTop: spacing.gap,
  },
  warningBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    gap: 4,
    padding: spacing.card,
  },
  warningTitle: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '900',
  },
  warningText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  inlineError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.card,
    padding: spacing.card,
  },
  inlineErrorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.screenX,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    gap: spacing.gap,
    maxWidth: 420,
    padding: spacing.card,
    width: '100%',
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
