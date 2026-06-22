import {useEffect, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';

import {
  assignCoffeeDuty,
  changeAdminCampusMemberRole,
  changeAdminChargeStatus,
  closeAdminPrayerSeason,
  createAdminPrayerGroup,
  createAdminPrayerSeason,
  createAdminPaymentAccount,
  createAdminPenaltyRule,
  deactivateAdminPaymentAccount,
  deleteCampusMember,
  FaithLogApiError,
  fetchAdminCampusCharges,
  fetchAdminCampusMembers,
  fetchAdminDashboardSummary,
  fetchAdminMemberCharges,
  fetchAdminMissingDevotionMembers,
  fetchDutyAssignments,
  fetchPaymentAccounts,
  fetchPenaltyRules,
  fetchPrayerWeek,
  replaceAdminPrayerGroupMembers,
  revokeCoffeeDuty,
  sendAdminNotification,
  updateAdminPrayerGroup,
  updateAdminPenaltyRule,
} from '../api/client';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  AdminCampusChargeSummary,
  AdminCampusMember,
  AdminDashboardSummary,
  AdminMemberChargeList,
  AdminMissingDevotionMember,
  AdminNotificationResponse,
  AdminPrayerGroup,
  AdminWritableChargeStatus,
  ApiError,
  CampusRole,
  ChargeItem,
  ChargeStatus,
  DutyAssignment,
  PaymentAccount,
  PaymentCategory,
  PenaltyCalculationType,
  PenaltyRule,
  PenaltyRuleType,
  PrayerWeekSummary,
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

type AdminScreenProps = {
  setAuthState: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
  state: AuthenticatedState;
};

type AdminTab = 'home' | 'devotion' | 'prayer' | 'members' | 'roles' | 'settlement';
type MemberFilter = 'ALL' | 'ADMINS' | 'MEMBERS';
type RoleFilter = MemberFilter;
type ChargeStatusFilter = ChargeStatus | 'ALL';
type PaymentCategoryFilter = PaymentCategory | 'ALL';
type AdminSettlementSection = 'charges' | 'accounts' | 'penaltyRules';

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
  | {status: 'deletingMember'; membershipId: number}
  | {status: 'changingChargeStatus'; chargeItemId: number}
  | {status: 'savingPaymentAccount'}
  | {status: 'deactivatingPaymentAccount'; accountId: number}
  | {status: 'savingPenaltyRule'; ruleId: number | null}
  | {status: 'creatingPrayerSeason'}
  | {status: 'closingPrayerSeason'; seasonId: number}
  | {status: 'savingPrayerGroup'; groupId: number | null}
  | {status: 'savingPrayerMembers'; groupId: number};

type MissingDevotionState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; members: AdminMissingDevotionMember[]}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

type NotificationSendState =
  | {status: 'idle'}
  | {status: 'confirming'; targets: AdminMissingDevotionMember[]}
  | {status: 'sending'; targets: AdminMissingDevotionMember[]}
  | {status: 'sent'; result: AdminNotificationResponse; targetCount: number}
  | {status: 'failed'; error: ApiError; targetCount: number};

type AdminChargeMemberRef = {
  userId: number;
  name: string;
  email: string;
};

type AdminSettlementState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; charges: AdminCampusChargeSummary}
  | {status: 'empty'; charges: AdminCampusChargeSummary}
  | {status: 'error'; error: ApiError};

type AdminChargeDetailState =
  | {status: 'idle'}
  | {status: 'loading'; member: AdminChargeMemberRef}
  | {status: 'success'; charges: AdminMemberChargeList}
  | {status: 'empty'; charges: AdminMemberChargeList}
  | {status: 'error'; error: ApiError; member: AdminChargeMemberRef};

type AdminChargeFilters = {
  keyword: string;
  paymentCategory: PaymentCategoryFilter;
  status: ChargeStatusFilter;
  userId: string;
};

type ChargeStatusConfirm = {
  charge: ChargeItem;
  status: AdminWritableChargeStatus;
} | null;

type PaymentAccountState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; accounts: PaymentAccount[]}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

type PaymentAccountForm = {
  accountHolder: string;
  accountNumber: string;
  accountType: PaymentCategory;
  bankName: string;
  nickname: string;
  ownerUserId: string;
};

type PenaltyRuleState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; rules: PenaltyRule[]}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

type PenaltyRuleForm = {
  amountPerUnit: string;
  baseAmount: string;
  calculationType: PenaltyCalculationType;
  isActive: boolean;
  requiredCount: string;
  ruleId: number | null;
  ruleType: PenaltyRuleType;
};

type AdminPrayerState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; board: PrayerWeekSummary}
  | {status: 'empty'; board: PrayerWeekSummary}
  | {status: 'error'; error: ApiError};

type PrayerSeasonForm = {
  endDate: string;
  name: string;
  seasonId: string;
  startDate: string;
};

type PrayerGroupForm = {
  groupId: string;
  isActive: boolean;
  name: string;
  seasonId: string;
  sortOrder: string;
};

type PrayerGroupMembersForm = {
  groupId: string;
  userIds: string;
};

type PrayerSeasonCloseTarget = {
  endDate: string;
  seasonId: number;
} | null;

const adminTabs: Array<{id: AdminTab; label: string}> = [
  {id: 'home', label: '홈'},
  {id: 'devotion', label: '경건'},
  {id: 'prayer', label: '기도'},
  {id: 'settlement', label: '정산'},
  {id: 'members', label: '멤버'},
  {id: 'roles', label: '역할'},
];

const memberFilters: Array<{id: MemberFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'ADMINS', label: '리더'},
  {id: 'MEMBERS', label: '멤버'},
];

const chargeStatusFilters: Array<{id: ChargeStatusFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'UNPAID', label: '미납'},
  {id: 'PAID', label: '납부'},
  {id: 'WAIVED', label: '면제'},
  {id: 'CANCELED', label: '취소'},
];

const paymentCategoryFilters: Array<{id: PaymentCategoryFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'PENALTY', label: '벌금'},
  {id: 'COFFEE', label: '커피'},
];

const settlementSections: Array<{id: AdminSettlementSection; label: string}> = [
  {id: 'charges', label: '청구'},
  {id: 'accounts', label: '계좌'},
  {id: 'penaltyRules', label: '벌금'},
];

const paymentAccountTypeOptions: Array<{id: PaymentCategory; label: string}> = [
  {id: 'PENALTY', label: '벌금'},
  {id: 'COFFEE', label: '커피'},
];

const penaltyRuleTypeOptions: Array<{id: PenaltyRuleType; label: string}> = [
  {id: 'QUIET_TIME', label: 'QT'},
  {id: 'PRAYER', label: '기도'},
  {id: 'BIBLE_READING', label: '성경'},
  {id: 'SATURDAY_LATE', label: '토요지각'},
];

const penaltyCalculationTypeOptions: Array<{id: PenaltyCalculationType; label: string}> = [
  {id: 'MISSING_COUNT', label: '미달 횟수'},
  {id: 'LATE_MINUTE', label: '지각 분'},
];

const penaltyRuleActiveOptions: Array<{id: 'active' | 'inactive'; label: string}> = [
  {id: 'active', label: '활성'},
  {id: 'inactive', label: '비활성'},
];

const campusRoleOptions: CampusRole[] = ['MEMBER', 'CAMPUS_LEADER', 'ELDER', 'MINISTER'];
const adminCampusRoles = new Set<CampusRole>(['MINISTER', 'ELDER', 'CAMPUS_LEADER']);
const adminWritableChargeStatuses: AdminWritableChargeStatus[] = [
  'UNPAID',
  'WAIVED',
  'CANCELED',
];

const emptyPaymentAccountForm: PaymentAccountForm = {
  accountHolder: '',
  accountNumber: '',
  accountType: 'PENALTY',
  bankName: '',
  nickname: '',
  ownerUserId: '',
};

const emptyPenaltyRuleForm: PenaltyRuleForm = {
  amountPerUnit: '',
  baseAmount: '',
  calculationType: 'MISSING_COUNT',
  isActive: true,
  requiredCount: '',
  ruleId: null,
  ruleType: 'QUIET_TIME',
};

const emptyPrayerSeasonForm: PrayerSeasonForm = {
  endDate: '',
  name: '',
  seasonId: '',
  startDate: getWeekStartDate(new Date()),
};

const emptyPrayerGroupForm: PrayerGroupForm = {
  groupId: '',
  isActive: true,
  name: '',
  seasonId: '',
  sortOrder: '1',
};

const emptyPrayerGroupMembersForm: PrayerGroupMembersForm = {
  groupId: '',
  userIds: '',
};

export function AdminScreen({setAuthState, setNotice, state}: AdminScreenProps) {
  const campusId = state.selectedCampus.campusId;
  const [weekStartDate, setWeekStartDate] = useState(() => getWeekStartDate(new Date()));
  const [tab, setTab] = useState<AdminTab>('home');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('ALL');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<AdminLoadState>({status: 'loading'});
  const [missingDevotionState, setMissingDevotionState] = useState<MissingDevotionState>({
    status: 'idle',
  });
  const [notificationState, setNotificationState] = useState<NotificationSendState>({
    status: 'idle',
  });
  const [chargeFilters, setChargeFilters] = useState<AdminChargeFilters>({
    keyword: '',
    paymentCategory: 'ALL',
    status: 'ALL',
    userId: '',
  });
  const [settlementSection, setSettlementSection] =
    useState<AdminSettlementSection>('charges');
  const [settlementState, setSettlementState] = useState<AdminSettlementState>({
    status: 'idle',
  });
  const [chargeDetailState, setChargeDetailState] = useState<AdminChargeDetailState>({
    status: 'idle',
  });
  const [paymentAccountState, setPaymentAccountState] = useState<PaymentAccountState>({
    status: 'idle',
  });
  const [paymentAccountForm, setPaymentAccountForm] =
    useState<PaymentAccountForm>(emptyPaymentAccountForm);
  const [paymentAccountDeactivateTarget, setPaymentAccountDeactivateTarget] =
    useState<PaymentAccount | null>(null);
  const [penaltyRuleState, setPenaltyRuleState] = useState<PenaltyRuleState>({
    status: 'idle',
  });
  const [penaltyRuleForm, setPenaltyRuleForm] =
    useState<PenaltyRuleForm>(emptyPenaltyRuleForm);
  const [prayerState, setPrayerState] = useState<AdminPrayerState>({status: 'idle'});
  const [prayerSeasonForm, setPrayerSeasonForm] =
    useState<PrayerSeasonForm>(emptyPrayerSeasonForm);
  const [prayerGroupForm, setPrayerGroupForm] =
    useState<PrayerGroupForm>(emptyPrayerGroupForm);
  const [prayerGroupMembersForm, setPrayerGroupMembersForm] =
    useState<PrayerGroupMembersForm>(emptyPrayerGroupMembersForm);
  const [prayerSeasonCloseTarget, setPrayerSeasonCloseTarget] =
    useState<PrayerSeasonCloseTarget>(null);
  const [chargeStatusConfirm, setChargeStatusConfirm] = useState<ChargeStatusConfirm>(null);
  const [paidBlockedTarget, setPaidBlockedTarget] = useState<ChargeItem | null>(null);
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
    setWeekStartDate(getWeekStartDate(new Date()));
    setMissingDevotionState({status: 'idle'});
    setNotificationState({status: 'idle'});
    setSettlementSection('charges');
    setSettlementState({status: 'idle'});
    setChargeDetailState({status: 'idle'});
    setPaymentAccountState({status: 'idle'});
    setPaymentAccountForm(emptyPaymentAccountForm);
    setPaymentAccountDeactivateTarget(null);
    setPenaltyRuleState({status: 'idle'});
    setPenaltyRuleForm(emptyPenaltyRuleForm);
    setPrayerState({status: 'idle'});
    setPrayerSeasonForm({...emptyPrayerSeasonForm, startDate: getWeekStartDate(new Date())});
    setPrayerGroupForm(emptyPrayerGroupForm);
    setPrayerGroupMembersForm(emptyPrayerGroupMembersForm);
    setPrayerSeasonCloseTarget(null);
    setChargeStatusConfirm(null);
    setPaidBlockedTarget(null);
    void loadAdmin();
  }, [campusId]);

  useEffect(() => {
    if (tab === 'devotion' && missingDevotionState.status === 'idle') {
      void loadMissingDevotions();
    }
  }, [tab, missingDevotionState.status]);

  useEffect(() => {
    if (tab === 'prayer' && prayerState.status === 'idle') {
      void loadPrayerBoard();
    }
  }, [tab, prayerState.status]);

  useEffect(() => {
    if (
      tab === 'settlement' &&
      settlementSection === 'charges' &&
      settlementState.status === 'idle'
    ) {
      void loadSettlement();
    }
  }, [tab, settlementSection, settlementState.status]);

  useEffect(() => {
    if (
      tab === 'settlement' &&
      settlementSection === 'accounts' &&
      paymentAccountState.status === 'idle'
    ) {
      void loadPaymentAccounts();
    }
  }, [tab, settlementSection, paymentAccountState.status]);

  useEffect(() => {
    if (
      tab === 'settlement' &&
      settlementSection === 'penaltyRules' &&
      penaltyRuleState.status === 'idle'
    ) {
      void loadPenaltyRules();
    }
  }, [tab, settlementSection, penaltyRuleState.status]);

  const loadMissingDevotions = async () => {
    setMissingDevotionState({status: 'loading'});
    setNotificationState({status: 'idle'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const missingMembers = await fetchAdminMissingDevotionMembers(
        accessToken,
        campusId,
        weekStartDate,
      );

      setMissingDevotionState(
        missingMembers.length === 0
          ? {status: 'empty'}
          : {status: 'success', members: missingMembers},
      );
    } catch (error) {
      const apiError = toApiError(error, '경건생활 미제출자를 불러오지 못했습니다.');
      setMissingDevotionState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const loadSettlement = async (filters: AdminChargeFilters = chargeFilters) => {
    setSettlementState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const userId = parseOptionalPositiveInt(filters.userId, 'userId');
      const charges = await fetchAdminCampusCharges(accessToken, campusId, {
        keyword: filters.keyword,
        paymentCategory: filters.paymentCategory,
        status: filters.status,
        ...(userId === undefined ? {} : {userId}),
      });

      setSettlementState(
        charges.members.length === 0
          ? {status: 'empty', charges}
          : {status: 'success', charges},
      );
    } catch (error) {
      const apiError = toApiError(error, '관리자 정산 정보를 불러오지 못했습니다.');
      setSettlementState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const loadPaymentAccounts = async () => {
    setPaymentAccountState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const accounts = await fetchPaymentAccounts(accessToken, campusId);
      setPaymentAccountState(
        accounts.length === 0 ? {status: 'empty'} : {status: 'success', accounts},
      );
    } catch (error) {
      const apiError = toApiError(error, '납부 계좌를 불러오지 못했습니다.');
      setPaymentAccountState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const savePaymentAccount = async () => {
    if (actionState.status !== 'idle') {
      return;
    }

    setActionState({status: 'savingPaymentAccount'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const account = await createAdminPaymentAccount(accessToken, campusId, {
        accountType: paymentAccountForm.accountType,
        nickname: paymentAccountForm.nickname,
        bankName: paymentAccountForm.bankName,
        accountNumber: paymentAccountForm.accountNumber,
        accountHolder: paymentAccountForm.accountHolder,
        ownerUserId: paymentAccountForm.ownerUserId.trim()
          ? Number(paymentAccountForm.ownerUserId)
          : null,
      });

      setPaymentAccountForm(emptyPaymentAccountForm);
      setPaymentAccountState({status: 'idle'});
      setNotice({
        tone: 'success',
        title: '납부 계좌 등록',
        message: `${account.nickname} 계좌가 활성화되었습니다. 같은 유형의 기존 활성 계좌는 서버 정책에 따라 비활성화됩니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '납부 계좌를 등록하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const confirmDeactivatePaymentAccount = async () => {
    if (!paymentAccountDeactivateTarget || actionState.status !== 'idle') {
      return;
    }

    const target = paymentAccountDeactivateTarget;
    setActionState({status: 'deactivatingPaymentAccount', accountId: target.id});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await deactivateAdminPaymentAccount(accessToken, target.id);
      setPaymentAccountDeactivateTarget(null);
      setPaymentAccountState({status: 'idle'});
      setNotice({
        tone: 'warning',
        title: '납부 계좌 비활성화',
        message: `${target.nickname} 계좌를 비활성화했습니다. 새 활성 계좌 등록 전까지 다음 정산 연결을 확인해 주세요.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '납부 계좌를 비활성화하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const loadPenaltyRules = async () => {
    setPenaltyRuleState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const rules = await fetchPenaltyRules(accessToken, campusId);
      setPenaltyRuleState(
        rules.length === 0 ? {status: 'empty'} : {status: 'success', rules},
      );
    } catch (error) {
      const apiError = toApiError(error, '벌금 규칙을 불러오지 못했습니다.');
      setPenaltyRuleState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const savePenaltyRule = async () => {
    if (actionState.status !== 'idle') {
      return;
    }

    const editingRuleId = penaltyRuleForm.ruleId;
    setActionState({status: 'savingPenaltyRule', ruleId: editingRuleId});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const requestAmounts = {
        requiredCount: parseRequiredNonNegativeInt(penaltyRuleForm.requiredCount, 'requiredCount'),
        baseAmount: parseRequiredNonNegativeInt(penaltyRuleForm.baseAmount, 'baseAmount'),
        amountPerUnit: parseRequiredNonNegativeInt(penaltyRuleForm.amountPerUnit, 'amountPerUnit'),
      };

      const rule =
        editingRuleId === null
          ? await createAdminPenaltyRule(accessToken, campusId, {
              ruleType: penaltyRuleForm.ruleType,
              calculationType: penaltyRuleForm.calculationType,
              ...requestAmounts,
            })
          : await updateAdminPenaltyRule(accessToken, editingRuleId, {
              ...requestAmounts,
              isActive: penaltyRuleForm.isActive,
            });

      setPenaltyRuleForm(emptyPenaltyRuleForm);
      setPenaltyRuleState({status: 'idle'});
      setNotice({
        tone: rule.isActive ? 'success' : 'warning',
        title: editingRuleId === null ? '벌금 규칙 등록' : '벌금 규칙 수정',
        message: `${getPenaltyRuleTypeLabel(rule.ruleType)} 규칙을 저장했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '벌금 규칙을 저장하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const editPenaltyRule = (rule: PenaltyRule) => {
    setPenaltyRuleForm({
      amountPerUnit: String(rule.amountPerUnit),
      baseAmount: String(rule.baseAmount),
      calculationType: rule.calculationType,
      isActive: rule.isActive,
      requiredCount: String(rule.requiredCount),
      ruleId: rule.id,
      ruleType: rule.ruleType,
    });
    setActionError(null);
  };

  const loadPrayerBoard = async () => {
    setPrayerState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const board = await fetchPrayerWeek(accessToken, campusId, weekStartDate);
      setPrayerState(
        board.groups.length === 0 || board.targetMemberCount === 0
          ? {status: 'empty', board}
          : {status: 'success', board},
      );
    } catch (error) {
      const apiError = toApiError(error, '기도제목 주간 현황을 불러오지 못했습니다.');
      setPrayerState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const changePrayerWeek = (direction: -1 | 1) => {
    if (actionState.status !== 'idle') {
      return;
    }

    setWeekStartDate((current) => addDaysToDateString(current, direction * 7));
    setPrayerState({status: 'idle'});
    setActionError(null);
  };

  const savePrayerSeason = async () => {
    if (actionState.status !== 'idle') {
      return;
    }

    setActionState({status: 'creatingPrayerSeason'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const season = await createAdminPrayerSeason(accessToken, campusId, {
        name: prayerSeasonForm.name,
        startDate: prayerSeasonForm.startDate,
      });

      setPrayerSeasonForm((current) => ({
        ...current,
        name: '',
        seasonId: String(season.seasonId),
        startDate: season.startDate,
      }));
      setPrayerGroupForm((current) => ({
        ...current,
        seasonId: String(season.seasonId),
      }));
      setNotice({
        tone: 'success',
        title: '기도 시즌 생성',
        message: `${season.name} ACTIVE 시즌을 생성했습니다.`,
      });
      setPrayerState({status: 'idle'});
    } catch (error) {
      const apiError = toApiError(error, '기도 시즌을 생성하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const openPrayerSeasonCloseConfirm = () => {
    try {
      const seasonId = parseRequiredPositiveInt(prayerSeasonForm.seasonId, 'seasonId');

      if (!prayerSeasonForm.endDate.trim()) {
        throw new FaithLogApiError({
          kind: 'error',
          message: 'endDate 값을 입력해 주세요.',
        });
      }

      setPrayerSeasonCloseTarget({
        seasonId,
        endDate: prayerSeasonForm.endDate.trim(),
      });
      setActionError(null);
    } catch (error) {
      setActionError(toApiError(error, '기도 시즌 종료 입력값이 올바르지 않습니다.'));
    }
  };

  const confirmClosePrayerSeason = async () => {
    if (!prayerSeasonCloseTarget || actionState.status !== 'idle') {
      return;
    }

    const target = prayerSeasonCloseTarget;
    setActionState({status: 'closingPrayerSeason', seasonId: target.seasonId});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const season = await closeAdminPrayerSeason(accessToken, target.seasonId, {
        endDate: target.endDate,
      });

      setPrayerSeasonCloseTarget(null);
      setPrayerSeasonForm((current) => ({
        ...current,
        endDate: season.endDate ?? current.endDate,
        seasonId: String(season.seasonId),
      }));
      setNotice({
        tone: 'warning',
        title: '기도 시즌 종료',
        message: `${season.name} 시즌을 ${season.endDate ?? target.endDate}에 종료했습니다.`,
      });
      setPrayerState({status: 'idle'});
    } catch (error) {
      const apiError = toApiError(error, '기도 시즌을 종료하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const savePrayerGroup = async () => {
    if (actionState.status !== 'idle') {
      return;
    }

    setActionState({status: 'savingPrayerGroup', groupId: null});
    setActionError(null);

    try {
      const editingGroupId = prayerGroupForm.groupId.trim()
        ? parseRequiredPositiveInt(prayerGroupForm.groupId, 'groupId')
        : null;
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      setActionState({status: 'savingPrayerGroup', groupId: editingGroupId});

      const request = {
        name: prayerGroupForm.name,
        sortOrder: parseRequiredPositiveInt(prayerGroupForm.sortOrder, 'sortOrder'),
      };
      const group =
        editingGroupId === null
          ? await createAdminPrayerGroup(
              accessToken,
              parseRequiredPositiveInt(prayerGroupForm.seasonId, 'seasonId'),
              request,
            )
          : await updateAdminPrayerGroup(accessToken, editingGroupId, {
              ...request,
              isActive: prayerGroupForm.isActive,
            });

      setPrayerGroupForm({
        ...emptyPrayerGroupForm,
        groupId: String(group.groupId),
        name: group.name,
        seasonId: String(group.seasonId),
        sortOrder: String(group.sortOrder),
        isActive: group.active,
      });
      setPrayerGroupMembersForm((current) => ({
        ...current,
        groupId: String(group.groupId),
      }));
      setNotice({
        tone: group.active ? 'success' : 'warning',
        title: editingGroupId === null ? '기도조 생성' : '기도조 수정',
        message: `${group.name} 조 정보를 저장했습니다.`,
      });
      setPrayerState({status: 'idle'});
    } catch (error) {
      const apiError = toApiError(error, '기도조를 저장하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const editPrayerGroup = (group: AdminPrayerGroup | PrayerWeekSummary['groups'][number]) => {
    const groupName = 'name' in group ? group.name : group.groupName;

    setPrayerGroupForm({
      groupId: String(group.groupId),
      isActive: 'active' in group ? group.active : true,
      name: groupName,
      seasonId: 'seasonId' in group ? String(group.seasonId) : prayerGroupForm.seasonId,
      sortOrder: String(group.sortOrder),
    });
    setPrayerGroupMembersForm({
      groupId: String(group.groupId),
      userIds: group.members.map((member) => String(member.userId)).join(', '),
    });
    setActionError(null);
  };

  const savePrayerGroupMembers = async () => {
    if (actionState.status !== 'idle') {
      return;
    }

    setActionState({status: 'savingPrayerMembers', groupId: 0});
    setActionError(null);

    try {
      const groupId = parseRequiredPositiveInt(prayerGroupMembersForm.groupId, 'groupId');
      const userIds = parseUserIdList(prayerGroupMembersForm.userIds);
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      setActionState({status: 'savingPrayerMembers', groupId});

      const group = await replaceAdminPrayerGroupMembers(accessToken, groupId, {userIds});
      setPrayerGroupMembersForm({
        groupId: String(group.groupId),
        userIds: group.members.map((member) => String(member.userId)).join(', '),
      });
      setNotice({
        tone: group.members.length === 0 ? 'warning' : 'success',
        title: '기도조 멤버 저장',
        message:
          group.members.length === 0
            ? `${group.name} 조를 빈 조로 저장했습니다.`
            : `${group.name} 조에 ${group.members.length}명을 배정했습니다.`,
      });
      setPrayerState({status: 'idle'});
    } catch (error) {
      const apiError = toApiError(error, '기도조 멤버를 저장하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const updateChargeFilter = <Key extends keyof AdminChargeFilters>(
    key: Key,
    value: AdminChargeFilters[Key],
  ) => {
    setChargeFilters((current) => ({...current, [key]: value}));
  };

  const resetChargeFilters = () => {
    const nextFilters: AdminChargeFilters = {
      keyword: '',
      paymentCategory: 'ALL',
      status: 'ALL',
      userId: '',
    };

    setChargeFilters(nextFilters);
    setChargeDetailState({status: 'idle'});
    void loadSettlement(nextFilters);
  };

  const openMemberCharges = async (member: AdminChargeMemberRef) => {
    setChargeDetailState({status: 'loading', member});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const charges = await fetchAdminMemberCharges(accessToken, campusId, member.userId, {
        paymentCategory: chargeFilters.paymentCategory,
        status: chargeFilters.status,
      });

      setChargeDetailState(
        charges.items.length === 0
          ? {status: 'empty', charges}
          : {status: 'success', charges},
      );
    } catch (error) {
      const apiError = toApiError(error, '회원별 청구 상세를 불러오지 못했습니다.');
      setChargeDetailState({status: 'error', error: apiError, member});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const requestChargeStatusChange = (
    charge: ChargeItem,
    status: AdminWritableChargeStatus,
  ) => {
    if (actionState.status !== 'idle' || charge.status === status) {
      return;
    }

    setActionError(null);
    setChargeStatusConfirm({charge, status});
  };

  const confirmChargeStatusChange = async () => {
    if (!chargeStatusConfirm || actionState.status !== 'idle') {
      return;
    }

    const target = chargeStatusConfirm;
    setActionState({status: 'changingChargeStatus', chargeItemId: target.charge.id});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const updated = await changeAdminChargeStatus(
        accessToken,
        target.charge.id,
        target.status,
      );

      replaceChargeItem(updated);
      setChargeStatusConfirm(null);
      setNotice({
        tone: 'success',
        title: '청구 상태 변경',
        message: `${target.charge.title} 상태를 ${updated.status}로 변경했습니다.`,
      });
      void loadSettlement();
    } catch (error) {
      const apiError = toApiError(error, '청구 상태를 변경하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const replaceChargeItem = (updated: ChargeItem) => {
    setChargeDetailState((current) => {
      if (current.status !== 'success' && current.status !== 'empty') {
        return current;
      }

      return {
        status: 'success',
        charges: {
          ...current.charges,
          items: current.charges.items.map((item) =>
            item.id === updated.id ? {...item, ...updated} : item,
          ),
        },
      };
    });
  };

  const changeMissingWeek = (direction: -1 | 1) => {
    setWeekStartDate((current) => addDaysToDateString(current, direction * 7));
    setMissingDevotionState({status: 'idle'});
    setNotificationState({status: 'idle'});
  };

  const openNotificationConfirm = (targets: AdminMissingDevotionMember[]) => {
    if (targets.length === 0 || notificationState.status === 'sending') {
      return;
    }

    setNotificationState({status: 'confirming', targets});
    setActionError(null);
  };

  const cancelNotificationConfirm = () => {
    if (notificationState.status === 'sending') {
      return;
    }

    setNotificationState({status: 'idle'});
  };

  const confirmNotificationSend = async () => {
    if (notificationState.status !== 'confirming') {
      return;
    }

    const targets = notificationState.targets;
    setNotificationState({status: 'sending', targets});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const result = await sendAdminNotification(accessToken, campusId, {
        notificationType: 'CUSTOM',
        targetUserIds: targets.map((target) => target.userId),
        targetWeekStartDate: weekStartDate,
        targetId: null,
        title: '경건생활 제출 알림',
        body: '이번 주 경건생활을 제출해 주세요.',
      });

      setNotificationState({status: 'sent', result, targetCount: targets.length});
      setNotice({
        tone: result.skippedCount > 0 ? 'warning' : 'success',
        title: '경건 미제출 알림 발송',
        message: `${result.queuedCount}명 큐잉, ${result.skippedCount}명 스킵 처리되었습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '경건 미제출 알림을 발송하지 못했습니다.');
      setNotificationState({status: 'failed', error: apiError, targetCount: targets.length});
      void handleAuthError(apiError, setAuthState);
    }
  };

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
      ) : tab === 'devotion' ? (
        <AdminDevotionMissing
          missingState={missingDevotionState}
          notificationState={notificationState}
          onChangeWeek={changeMissingWeek}
          onOpenNotificationConfirm={openNotificationConfirm}
          onRetry={loadMissingDevotions}
          summary={loadState.summary}
          weekStartDate={weekStartDate}
        />
      ) : tab === 'prayer' ? (
        <AdminPrayerManagement
          actionState={actionState}
          boardState={prayerState}
          groupForm={prayerGroupForm}
          members={loadState.members}
          membersForm={prayerGroupMembersForm}
          onChangeGroupForm={(patch) =>
            setPrayerGroupForm((current) => ({...current, ...patch}))
          }
          onChangeMembersForm={(patch) =>
            setPrayerGroupMembersForm((current) => ({...current, ...patch}))
          }
          onChangeSeasonForm={(patch) =>
            setPrayerSeasonForm((current) => ({...current, ...patch}))
          }
          onChangeWeek={changePrayerWeek}
          onEditGroup={editPrayerGroup}
          onOpenCloseSeason={openPrayerSeasonCloseConfirm}
          onRetry={loadPrayerBoard}
          onSaveGroup={savePrayerGroup}
          onSaveMembers={savePrayerGroupMembers}
          onSaveSeason={savePrayerSeason}
          seasonForm={prayerSeasonForm}
          weekStartDate={weekStartDate}
        />
      ) : tab === 'settlement' ? (
        <AdminSettlement
          actionState={actionState}
          detailState={chargeDetailState}
          filters={chargeFilters}
          onCancelPenaltyRuleEdit={() => setPenaltyRuleForm(emptyPenaltyRuleForm)}
          onChangePaymentAccountForm={(patch) =>
            setPaymentAccountForm((current) => ({...current, ...patch}))
          }
          onChangePenaltyRuleForm={(patch) =>
            setPenaltyRuleForm((current) => ({...current, ...patch}))
          }
          onChangeSection={(section) => {
            setSettlementSection(section);
            setActionError(null);
          }}
          onBackToSummary={() => setChargeDetailState({status: 'idle'})}
          onBlockedPaid={setPaidBlockedTarget}
          onEditPenaltyRule={editPenaltyRule}
          onOpenMemberCharges={openMemberCharges}
          onRequestDeactivatePaymentAccount={setPaymentAccountDeactivateTarget}
          onRequestStatusChange={requestChargeStatusChange}
          onRetryPaymentAccounts={() => void loadPaymentAccounts()}
          onRetryPenaltyRules={() => void loadPenaltyRules()}
          onResetFilters={resetChargeFilters}
          onRetryDetail={(member) => void openMemberCharges(member)}
          onRetrySummary={() => void loadSettlement()}
          onSavePaymentAccount={() => void savePaymentAccount()}
          onSavePenaltyRule={() => void savePenaltyRule()}
          onSearch={() => {
            setChargeDetailState({status: 'idle'});
            void loadSettlement();
          }}
          onUpdateFilter={updateChargeFilter}
          paymentAccountForm={paymentAccountForm}
          paymentAccountState={paymentAccountState}
          penaltyRuleForm={penaltyRuleForm}
          penaltyRuleState={penaltyRuleState}
          section={settlementSection}
          settlementState={settlementState}
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
      <NotificationConfirmSheet
        onCancel={cancelNotificationConfirm}
        onConfirm={confirmNotificationSend}
        state={notificationState}
        weekStartDate={weekStartDate}
      />
      <ChargeStatusConfirmSheet
        error={actionError}
        loading={actionState.status === 'changingChargeStatus'}
        onCancel={() => setChargeStatusConfirm(null)}
        onConfirm={confirmChargeStatusChange}
        target={chargeStatusConfirm}
      />
      <PaidNotAllowedSheet
        charge={paidBlockedTarget}
        onClose={() => setPaidBlockedTarget(null)}
      />
      <DeactivatePaymentAccountSheet
        account={paymentAccountDeactivateTarget}
        error={actionError}
        loading={actionState.status === 'deactivatingPaymentAccount'}
        onCancel={() => setPaymentAccountDeactivateTarget(null)}
        onConfirm={confirmDeactivatePaymentAccount}
      />
      <PrayerSeasonCloseSheet
        error={actionError}
        loading={actionState.status === 'closingPrayerSeason'}
        onCancel={() => setPrayerSeasonCloseTarget(null)}
        onConfirm={confirmClosePrayerSeason}
        target={prayerSeasonCloseTarget}
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

function AdminDevotionMissing({
  missingState,
  notificationState,
  onChangeWeek,
  onOpenNotificationConfirm,
  onRetry,
  summary,
  weekStartDate,
}: {
  missingState: MissingDevotionState;
  notificationState: NotificationSendState;
  onChangeWeek: (direction: -1 | 1) => void;
  onOpenNotificationConfirm: (targets: AdminMissingDevotionMember[]) => void;
  onRetry: () => void;
  summary: AdminDashboardSummary;
  weekStartDate: string;
}) {
  const selectedWeekMatchesSummary = summary.devotion.weekStartDate === weekStartDate;
  const missingCount =
    missingState.status === 'success'
      ? missingState.members.length
      : selectedWeekMatchesSummary
        ? summary.devotion.missingCount
        : 0;

  return (
    <>
      <Card>
        <Eyebrow>Admin 04 Devotion Status</Eyebrow>
        <Title>경건 제출 현황</Title>
        <Body>
          {weekStartDate} 주차 기준으로 weekly devotion submitted_at이 없거나 null인 ACTIVE 멤버를 조회합니다.
        </Body>
        <View style={styles.metricGrid}>
          <Metric label="선택 주차" value={formatShortWeekLabel(weekStartDate)} />
          <Metric label="미제출" value={`${missingCount}명`} />
          <Metric
            label="제출률"
            value={selectedWeekMatchesSummary ? `${summary.devotion.submitRate}%` : '조회 후 확인'}
          />
          <Metric label="API" value="GET missing" />
        </View>
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="이전 주 경건 미제출자 조회"
            disabled={missingState.status === 'loading' || notificationState.status === 'sending'}
            onPress={() => onChangeWeek(-1)}
            variant="secondary">
            이전 주
          </Button>
          <Button
            accessibilityLabel="다음 주 경건 미제출자 조회"
            disabled={missingState.status === 'loading' || notificationState.status === 'sending'}
            onPress={() => onChangeWeek(1)}
            variant="secondary">
            다음 주
          </Button>
          <Button
            accessibilityLabel="경건 미제출자 다시 불러오기"
            disabled={missingState.status === 'loading' || notificationState.status === 'sending'}
            onPress={onRetry}
            variant="ghost">
            다시 조회
          </Button>
        </View>
      </Card>
      {renderMissingDevotionBody({
        missingState,
        notificationState,
        onOpenNotificationConfirm,
        onRetry,
        weekStartDate,
      })}
      {renderNotificationResult(notificationState)}
    </>
  );
}

function renderMissingDevotionBody({
  missingState,
  notificationState,
  onOpenNotificationConfirm,
  onRetry,
  weekStartDate,
}: {
  missingState: MissingDevotionState;
  notificationState: NotificationSendState;
  onOpenNotificationConfirm: (targets: AdminMissingDevotionMember[]) => void;
  onRetry: () => void;
  weekStartDate: string;
}) {
  switch (missingState.status) {
    case 'idle':
    case 'loading':
      return <Loading message="경건 미제출자를 조회하고 있어요." />;
    case 'empty':
      return (
        <Empty
          title="미제출자가 없습니다"
          message={`${weekStartDate} 주차에는 알림을 보낼 대상이 없습니다.`}
          actionLabel="다시 조회"
          actionAccessibilityLabel="미제출자 empty state에서 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return <AdminErrorState error={missingState.error} onRetry={onRetry} />;
    case 'success':
      return (
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Eyebrow>Admin 05 Devotion Missing</Eyebrow>
              <Title>미제출자 {missingState.members.length}명</Title>
              <Body>발송 전 대상자를 확인한 뒤 알림을 큐잉합니다.</Body>
            </View>
            <Button
              accessibilityLabel="경건 미제출자 알림 발송 확인 열기"
              disabled={notificationState.status === 'sending'}
              onPress={() => onOpenNotificationConfirm(missingState.members)}>
              알림 발송
            </Button>
          </View>
          {missingState.members.map((member) => (
            <MissingDevotionMemberRow key={member.campusMemberId} member={member} />
          ))}
        </Card>
      );
    default:
      return assertNever(missingState);
  }
}

function MissingDevotionMemberRow({member}: {member: AdminMissingDevotionMember}) {
  return (
    <View style={styles.memberRow}>
      <Avatar name={member.name} role="MEMBER" />
      <View style={styles.headerText}>
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.memberMeta}>
          {member.region} {member.campusName} · member #{member.campusMemberId}
        </Text>
        <Text style={styles.memberMeta}>{member.email}</Text>
      </View>
      <Chip label={`user ${member.userId}`} tone="info" />
    </View>
  );
}

function renderNotificationResult(notificationState: NotificationSendState) {
  switch (notificationState.status) {
    case 'idle':
    case 'confirming':
      return null;
    case 'sending':
      return <Loading message="Status 08 Notification Sending: 알림을 발송 큐에 넣고 있어요." />;
    case 'sent':
      return (
        <Card>
          <Eyebrow>Status 09 Notification Sent</Eyebrow>
          <Title>알림 발송 요청이 접수되었습니다</Title>
          <View style={styles.metricGrid}>
            <Metric label="확인 대상" value={`${notificationState.targetCount}명`} />
            <Metric label="큐잉" value={`${notificationState.result.queuedCount}명`} />
            <Metric label="스킵" value={`${notificationState.result.skippedCount}명`} />
          </View>
          <ListRow
            label="요청 ID"
            supportingText="notification_logs.request_id"
            value={notificationState.result.notificationRequestId}
          />
        </Card>
      );
    case 'failed':
      return (
        <Card>
          <Eyebrow>Status 09 Notification Sent</Eyebrow>
          <Title>알림 발송에 실패했습니다</Title>
          <Body>확인 대상 {notificationState.targetCount}명에 대한 발송 요청이 완료되지 않았습니다.</Body>
          <AdminInlineError error={notificationState.error} />
        </Card>
      );
    default:
      return assertNever(notificationState);
  }
}

function AdminPrayerManagement({
  actionState,
  boardState,
  groupForm,
  members,
  membersForm,
  onChangeGroupForm,
  onChangeMembersForm,
  onChangeSeasonForm,
  onChangeWeek,
  onEditGroup,
  onOpenCloseSeason,
  onRetry,
  onSaveGroup,
  onSaveMembers,
  onSaveSeason,
  seasonForm,
  weekStartDate,
}: {
  actionState: AdminActionState;
  boardState: AdminPrayerState;
  groupForm: PrayerGroupForm;
  members: AdminCampusMember[];
  membersForm: PrayerGroupMembersForm;
  onChangeGroupForm: (patch: Partial<PrayerGroupForm>) => void;
  onChangeMembersForm: (patch: Partial<PrayerGroupMembersForm>) => void;
  onChangeSeasonForm: (patch: Partial<PrayerSeasonForm>) => void;
  onChangeWeek: (direction: -1 | 1) => void;
  onEditGroup: (group: AdminPrayerGroup | PrayerWeekSummary['groups'][number]) => void;
  onOpenCloseSeason: () => void;
  onRetry: () => void;
  onSaveGroup: () => void;
  onSaveMembers: () => void;
  onSaveSeason: () => void;
  seasonForm: PrayerSeasonForm;
  weekStartDate: string;
}) {
  const busy = actionState.status !== 'idle';

  return (
    <>
      <Card>
        <Eyebrow>Admin 15-21 Prayer</Eyebrow>
        <Title>기도제목 시즌/조 관리</Title>
        <Body>
          시즌 생성, 조 생성/수정, 조원 전체 교체, 주간 제출 현황을 REST Docs prayer 계약으로 관리합니다.
        </Body>
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="이전 주 기도제목 관리자 현황 조회"
            disabled={busy || boardState.status === 'loading'}
            onPress={() => onChangeWeek(-1)}
            variant="secondary">
            이전 주
          </Button>
          <Button
            accessibilityLabel="다음 주 기도제목 관리자 현황 조회"
            disabled={busy || boardState.status === 'loading'}
            onPress={() => onChangeWeek(1)}
            variant="secondary">
            다음 주
          </Button>
          <Button
            accessibilityLabel="기도제목 관리자 현황 다시 조회"
            disabled={busy || boardState.status === 'loading'}
            onPress={onRetry}
            variant="ghost">
            다시 조회
          </Button>
        </View>
      </Card>
      {renderAdminPrayerBoard({boardState, onEditGroup, onRetry, weekStartDate})}
      <AdminPrayerSeasonForm
        busy={busy}
        form={seasonForm}
        onChangeForm={onChangeSeasonForm}
        onOpenCloseSeason={onOpenCloseSeason}
        onSave={onSaveSeason}
      />
      <AdminPrayerGroupForm
        busy={busy}
        form={groupForm}
        onChangeForm={onChangeGroupForm}
        onSave={onSaveGroup}
      />
      <AdminPrayerMembersForm
        busy={busy}
        form={membersForm}
        members={members}
        onChangeForm={onChangeMembersForm}
        onSave={onSaveMembers}
      />
    </>
  );
}

function renderAdminPrayerBoard({
  boardState,
  onEditGroup,
  onRetry,
  weekStartDate,
}: {
  boardState: AdminPrayerState;
  onEditGroup: (group: PrayerWeekSummary['groups'][number]) => void;
  onRetry: () => void;
  weekStartDate: string;
}) {
  switch (boardState.status) {
    case 'idle':
    case 'loading':
      return <Loading message="Admin 20 Prayer Weekly Status를 불러오고 있어요." />;
    case 'error':
      return <AdminErrorState error={boardState.error} onRetry={onRetry} />;
    case 'empty':
      return (
        <>
          <PrayerBoardSummaryCard board={boardState.board} />
          <Empty
            title="활성 기도조 또는 조원이 없습니다"
            message={`${weekStartDate} 주차 board는 조회됐지만 관리할 활성 조원이 없습니다. 시즌과 조를 만든 뒤 멤버를 배정해 주세요.`}
            actionLabel="다시 조회"
            actionAccessibilityLabel="기도제목 빈 board 다시 조회"
            onActionPress={onRetry}
          />
        </>
      );
    case 'success':
      return (
        <>
          <PrayerBoardSummaryCard board={boardState.board} />
          <Card>
            <Eyebrow>Admin 15 Prayer Season - 조 관리</Eyebrow>
            <Title>활성 기도조</Title>
            {boardState.board.groups
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((group) => (
                <View key={group.groupId} style={styles.roleRow}>
                  <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                      <Text style={styles.memberName}>{group.groupName}</Text>
                      <Text style={styles.memberMeta}>
                        group #{group.groupId} · sort {group.sortOrder}
                      </Text>
                    </View>
                    <Chip
                      label={`${countSubmittedMembers(group)}/${group.members.length}`}
                      tone={countSubmittedMembers(group) === group.members.length ? 'success' : 'warning'}
                    />
                  </View>
                  {group.members.length === 0 ? (
                    <Body>아직 배정된 조원이 없는 빈 조입니다.</Body>
                  ) : (
                    group.members.map((member) => (
                      <ListRow
                        key={member.userId}
                        label={member.name}
                        supportingText={
                          member.submittedAt
                            ? `version ${member.version} · ${formatDateTime(member.submittedAt)}`
                            : `version ${member.version} · 미작성`
                        }
                        value={hasPrayerMemberSubmitted(member) ? '작성' : '미작성'}
                      />
                    ))
                  )}
                  <Button
                    accessibilityLabel={`${group.groupName} 기도조 수정 폼으로 불러오기`}
                    onPress={() => onEditGroup(group)}
                    variant="secondary">
                    조/멤버 편집
                  </Button>
                </View>
              ))}
          </Card>
        </>
      );
    default:
      return assertNever(boardState);
  }
}

function PrayerBoardSummaryCard({board}: {board: PrayerWeekSummary}) {
  return (
    <Card>
      <Eyebrow>Admin 17 Prayer Dashboard</Eyebrow>
      <Title>기도제목 주간 현황</Title>
      <Body>
        별도 관리자 집계 endpoint가 없어 REST Docs 기준 week board 조회값으로 제출 현황을 계산합니다.
      </Body>
      <View style={styles.metricGrid}>
        <Metric label="주차" value={formatShortWeekLabel(board.weekStartDate)} />
        <Metric label="상태" value={board.status} />
        <Metric label="작성" value={`${board.submittedCount}/${board.targetMemberCount}`} />
        <Metric label="기도조" value={`${board.groups.length}개`} />
      </View>
    </Card>
  );
}

function AdminPrayerSeasonForm({
  busy,
  form,
  onChangeForm,
  onOpenCloseSeason,
  onSave,
}: {
  busy: boolean;
  form: PrayerSeasonForm;
  onChangeForm: (patch: Partial<PrayerSeasonForm>) => void;
  onOpenCloseSeason: () => void;
  onSave: () => void;
}) {
  return (
    <Card>
      <Eyebrow>Admin 18 Prayer Season Create</Eyebrow>
      <Title>기도 시즌 생성/종료</Title>
      <Body>중복 ACTIVE 시즌은 서버가 409 `PRAYER_ACTIVE_SEASON_ALREADY_EXISTS`로 거부합니다.</Body>
      <TextField
        accessibilityLabel="기도 시즌 이름"
        label="시즌 이름"
        onChangeText={(name) => onChangeForm({name})}
        placeholder="2026 여름 나눔조"
        value={form.name}
      />
      <View style={styles.filterGrid}>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="기도 시즌 시작일"
            label="startDate"
            onChangeText={(startDate) => onChangeForm({startDate})}
            placeholder="YYYY-MM-DD"
            value={form.startDate}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="종료할 기도 시즌 ID"
            keyboardType="number-pad"
            label="seasonId"
            onChangeText={(seasonId) => onChangeForm({seasonId: seasonId.replace(/\D/g, '')})}
            placeholder="종료/조 생성에 사용"
            value={form.seasonId}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="기도 시즌 종료일"
            label="endDate"
            onChangeText={(endDate) => onChangeForm({endDate})}
            placeholder="YYYY-MM-DD"
            value={form.endDate}
          />
        </View>
      </View>
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="기도 시즌 생성"
          disabled={busy}
          onPress={onSave}>
          {busy ? '처리 중...' : '시즌 생성'}
        </Button>
        <Button
          accessibilityLabel="기도 시즌 종료 확인 열기"
          disabled={busy}
          onPress={onOpenCloseSeason}
          variant="danger">
          시즌 종료
        </Button>
      </View>
    </Card>
  );
}

function AdminPrayerGroupForm({
  busy,
  form,
  onChangeForm,
  onSave,
}: {
  busy: boolean;
  form: PrayerGroupForm;
  onChangeForm: (patch: Partial<PrayerGroupForm>) => void;
  onSave: () => void;
}) {
  return (
    <Card>
      <Eyebrow>Admin 19 Prayer Group Create</Eyebrow>
      <Title>{form.groupId ? '기도조 수정' : '기도조 생성'}</Title>
      <View style={styles.filterGrid}>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="기도조 시즌 ID"
            keyboardType="number-pad"
            label="seasonId"
            onChangeText={(seasonId) => onChangeForm({seasonId: seasonId.replace(/\D/g, '')})}
            placeholder="필수"
            value={form.seasonId}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="수정할 기도조 ID"
            keyboardType="number-pad"
            label="groupId"
            onChangeText={(groupId) => onChangeForm({groupId: groupId.replace(/\D/g, '')})}
            placeholder="비우면 생성"
            value={form.groupId}
          />
        </View>
      </View>
      <View style={styles.filterGrid}>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="기도조 이름"
            label="조 이름"
            onChangeText={(name) => onChangeForm({name})}
            placeholder="2조"
            value={form.name}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="기도조 정렬 순서"
            keyboardType="number-pad"
            label="sortOrder"
            onChangeText={(sortOrder) => onChangeForm({sortOrder: sortOrder.replace(/\D/g, '')})}
            placeholder="1"
            value={form.sortOrder}
          />
        </View>
      </View>
      {form.groupId ? (
        <SegmentedControl
          items={[
            {id: 'active', label: '활성'},
            {id: 'inactive', label: '비활성'},
          ]}
          selectedId={form.isActive ? 'active' : 'inactive'}
          onSelect={(value) => onChangeForm({isActive: value === 'active'})}
        />
      ) : null}
      <Button
        accessibilityLabel="기도조 저장"
        disabled={busy}
        onPress={onSave}>
        {busy ? '저장 중...' : '조 저장'}
      </Button>
    </Card>
  );
}

function AdminPrayerMembersForm({
  busy,
  form,
  members,
  onChangeForm,
  onSave,
}: {
  busy: boolean;
  form: PrayerGroupMembersForm;
  members: AdminCampusMember[];
  onChangeForm: (patch: Partial<PrayerGroupMembersForm>) => void;
  onSave: () => void;
}) {
  return (
    <Card>
      <Eyebrow>Admin 16, 21 Prayer Members - 배정</Eyebrow>
      <Title>조 멤버 전체 교체</Title>
      <Body>
        `PUT /admin/prayer-groups/{'{groupId}'}/members`는 입력한 userId만 active로 남기고 빠진 멤버를 inactive 처리합니다. 빈 값 저장은 빈 조 상태로 저장됩니다.
      </Body>
      <TextField
        accessibilityLabel="기도조 멤버 배정 groupId"
        keyboardType="number-pad"
        label="groupId"
        onChangeText={(groupId) => onChangeForm({groupId: groupId.replace(/\D/g, '')})}
        placeholder="필수"
        value={form.groupId}
      />
      <TextField
        accessibilityLabel="기도조 멤버 userId 목록"
        helper="쉼표, 공백, 줄바꿈으로 구분합니다. 예: 98, 99, 100"
        label="userIds"
        onChangeText={(userIds) => onChangeForm({userIds})}
        placeholder="98, 99, 100"
        value={form.userIds}
      />
      <Button
        accessibilityLabel="기도조 멤버 전체 교체 저장"
        disabled={busy}
        onPress={onSave}>
        {busy ? '저장 중...' : '멤버 저장'}
      </Button>
      <View style={styles.confirmTargetList}>
        <Text style={styles.confirmTargetText}>ACTIVE 멤버 userId 참고</Text>
        {members.slice(0, 8).map((member) => (
          <Text key={member.userId} style={styles.confirmTargetText}>
            {member.name} · user {member.userId}
          </Text>
        ))}
        {members.length > 8 ? (
          <Text style={styles.confirmTargetText}>외 {members.length - 8}명</Text>
        ) : null}
      </View>
    </Card>
  );
}

function AdminSettlement({
  actionState,
  detailState,
  filters,
  onCancelPenaltyRuleEdit,
  onChangePaymentAccountForm,
  onChangePenaltyRuleForm,
  onChangeSection,
  onBackToSummary,
  onBlockedPaid,
  onEditPenaltyRule,
  onOpenMemberCharges,
  onRequestDeactivatePaymentAccount,
  onRequestStatusChange,
  onRetryPaymentAccounts,
  onRetryPenaltyRules,
  onResetFilters,
  onRetryDetail,
  onRetrySummary,
  onSavePaymentAccount,
  onSavePenaltyRule,
  onSearch,
  onUpdateFilter,
  paymentAccountForm,
  paymentAccountState,
  penaltyRuleForm,
  penaltyRuleState,
  section,
  settlementState,
}: {
  actionState: AdminActionState;
  detailState: AdminChargeDetailState;
  filters: AdminChargeFilters;
  onCancelPenaltyRuleEdit: () => void;
  onChangePaymentAccountForm: (patch: Partial<PaymentAccountForm>) => void;
  onChangePenaltyRuleForm: (patch: Partial<PenaltyRuleForm>) => void;
  onChangeSection: (section: AdminSettlementSection) => void;
  onBackToSummary: () => void;
  onBlockedPaid: (charge: ChargeItem) => void;
  onEditPenaltyRule: (rule: PenaltyRule) => void;
  onOpenMemberCharges: (member: AdminChargeMemberRef) => void;
  onRequestDeactivatePaymentAccount: (account: PaymentAccount) => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminWritableChargeStatus) => void;
  onRetryPaymentAccounts: () => void;
  onRetryPenaltyRules: () => void;
  onResetFilters: () => void;
  onRetryDetail: (member: AdminChargeMemberRef) => void;
  onRetrySummary: () => void;
  onSavePaymentAccount: () => void;
  onSavePenaltyRule: () => void;
  onSearch: () => void;
  onUpdateFilter: <Key extends keyof AdminChargeFilters>(
    key: Key,
    value: AdminChargeFilters[Key],
  ) => void;
  paymentAccountForm: PaymentAccountForm;
  paymentAccountState: PaymentAccountState;
  penaltyRuleForm: PenaltyRuleForm;
  penaltyRuleState: PenaltyRuleState;
  section: AdminSettlementSection;
  settlementState: AdminSettlementState;
}) {
  const busy = actionState.status !== 'idle';

  return (
    <>
      <Card>
        <Eyebrow>Admin 10, 22-25 Settlement</Eyebrow>
        <Title>정산/계좌/벌금 관리</Title>
        <Body>
          청구 상태, 활성 납부 계좌, 벌금 규칙을 관리자 화면에서 분리해 관리합니다.
        </Body>
        <SegmentedControl
          items={settlementSections}
          selectedId={section}
          onSelect={onChangeSection}
        />
      </Card>
      {section === 'charges' ? (
        <AdminChargeSettlement
          actionState={actionState}
          detailState={detailState}
          filters={filters}
          onBackToSummary={onBackToSummary}
          onBlockedPaid={onBlockedPaid}
          onOpenMemberCharges={onOpenMemberCharges}
          onRequestStatusChange={onRequestStatusChange}
          onResetFilters={onResetFilters}
          onRetryDetail={onRetryDetail}
          onRetrySummary={onRetrySummary}
          onSearch={onSearch}
          onUpdateFilter={onUpdateFilter}
          settlementState={settlementState}
        />
      ) : section === 'accounts' ? (
        <AdminPaymentAccounts
          busy={busy}
          form={paymentAccountForm}
          onChangeForm={onChangePaymentAccountForm}
          onRequestDeactivate={onRequestDeactivatePaymentAccount}
          onRetry={onRetryPaymentAccounts}
          onSave={onSavePaymentAccount}
          state={paymentAccountState}
        />
      ) : (
        <AdminPenaltyRules
          busy={busy}
          form={penaltyRuleForm}
          onCancelEdit={onCancelPenaltyRuleEdit}
          onChangeForm={onChangePenaltyRuleForm}
          onEdit={onEditPenaltyRule}
          onRetry={onRetryPenaltyRules}
          onSave={onSavePenaltyRule}
          state={penaltyRuleState}
        />
      )}
    </>
  );
}

function AdminChargeSettlement({
  actionState,
  detailState,
  filters,
  onBackToSummary,
  onBlockedPaid,
  onOpenMemberCharges,
  onRequestStatusChange,
  onResetFilters,
  onRetryDetail,
  onRetrySummary,
  onSearch,
  onUpdateFilter,
  settlementState,
}: {
  actionState: AdminActionState;
  detailState: AdminChargeDetailState;
  filters: AdminChargeFilters;
  onBackToSummary: () => void;
  onBlockedPaid: (charge: ChargeItem) => void;
  onOpenMemberCharges: (member: AdminChargeMemberRef) => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminWritableChargeStatus) => void;
  onResetFilters: () => void;
  onRetryDetail: (member: AdminChargeMemberRef) => void;
  onRetrySummary: () => void;
  onSearch: () => void;
  onUpdateFilter: <Key extends keyof AdminChargeFilters>(
    key: Key,
    value: AdminChargeFilters[Key],
  ) => void;
  settlementState: AdminSettlementState;
}) {
  return (
    <>
      <Card>
        <Eyebrow>Admin 10 Settlement</Eyebrow>
        <Title>청구 상태 관리</Title>
        <Body>
          REST Docs 기준 전체 청구 집계는 summary와 members만 포함하고, 개별 청구는 회원 상세에서 조회합니다.
        </Body>
        <SegmentedControl
          items={chargeStatusFilters}
          selectedId={filters.status}
          onSelect={(status) => onUpdateFilter('status', status)}
        />
        <SegmentedControl
          items={paymentCategoryFilters}
          selectedId={filters.paymentCategory}
          onSelect={(paymentCategory) => onUpdateFilter('paymentCategory', paymentCategory)}
        />
        <View style={styles.filterGrid}>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="정산 이름 또는 이메일 검색어"
              label="검색어"
              onChangeText={(keyword) => onUpdateFilter('keyword', keyword)}
              onSubmitEditing={onSearch}
              placeholder="이름 또는 이메일"
              returnKeyType="search"
              value={filters.keyword}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="정산 사용자 ID 필터"
              keyboardType="number-pad"
              label="userId"
              onChangeText={(userId) => onUpdateFilter('userId', userId.replace(/\D/g, ''))}
              onSubmitEditing={onSearch}
              placeholder="숫자만"
              returnKeyType="search"
              value={filters.userId}
            />
          </View>
        </View>
        <View style={styles.actionRow}>
          <Button accessibilityLabel="관리자 정산 필터 적용" onPress={onSearch}>
            조회
          </Button>
          <Button
            accessibilityLabel="관리자 정산 필터 초기화"
            onPress={onResetFilters}
            variant="secondary">
            초기화
          </Button>
        </View>
      </Card>
      {renderSettlementSummary({
        onOpenMemberCharges,
        onRetrySummary,
        settlementState,
      })}
      {renderChargeDetail({
        actionState,
        detailState,
        onBackToSummary,
        onBlockedPaid,
        onRequestStatusChange,
        onRetryDetail,
      })}
    </>
  );
}

function AdminPaymentAccounts({
  busy,
  form,
  onChangeForm,
  onRequestDeactivate,
  onRetry,
  onSave,
  state,
}: {
  busy: boolean;
  form: PaymentAccountForm;
  onChangeForm: (patch: Partial<PaymentAccountForm>) => void;
  onRequestDeactivate: (account: PaymentAccount) => void;
  onRetry: () => void;
  onSave: () => void;
  state: PaymentAccountState;
}) {
  return (
    <>
      <Card>
        <Eyebrow>Admin 22 Payment Accounts</Eyebrow>
        <Title>활성 납부 계좌</Title>
        <Body>
          같은 계좌 유형으로 새 계좌를 등록하면 REST Docs 정책에 따라 기존 활성 계좌는 자동 비활성화됩니다.
        </Body>
        {renderPaymentAccountList({busy, onRequestDeactivate, onRetry, state})}
      </Card>
      <Card>
        <Eyebrow>Admin 23 Payment Account Create Edit</Eyebrow>
        <Title>계좌 등록</Title>
        <SegmentedControl
          items={paymentAccountTypeOptions}
          selectedId={form.accountType}
          onSelect={(accountType) => onChangeForm({accountType})}
        />
        <View style={styles.filterGrid}>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="납부 계좌 별칭"
              label="별칭"
              onChangeText={(nickname) => onChangeForm({nickname})}
              placeholder="48캠 벌금 계좌"
              value={form.nickname}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="납부 계좌 은행명"
              label="은행"
              onChangeText={(bankName) => onChangeForm({bankName})}
              placeholder="카카오뱅크"
              value={form.bankName}
            />
          </View>
        </View>
        <TextField
          accessibilityLabel="납부 계좌번호"
          label="계좌번호"
          onChangeText={(accountNumber) => onChangeForm({accountNumber})}
          placeholder="3333-00-7777777"
          value={form.accountNumber}
        />
        <View style={styles.filterGrid}>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="납부 계좌 예금주"
              label="예금주"
              onChangeText={(accountHolder) => onChangeForm({accountHolder})}
              placeholder="회계"
              value={form.accountHolder}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="납부 계좌 ownerUserId"
              keyboardType="number-pad"
              label="ownerUserId"
              onChangeText={(ownerUserId) => onChangeForm({ownerUserId: ownerUserId.replace(/\D/g, '')})}
              placeholder="없으면 비워두기"
              value={form.ownerUserId}
            />
          </View>
        </View>
        <Button
          accessibilityLabel="관리자 납부 계좌 등록"
          disabled={busy}
          onPress={onSave}>
          {busy ? '저장 중...' : '계좌 저장'}
        </Button>
      </Card>
    </>
  );
}

function renderPaymentAccountList({
  busy,
  onRequestDeactivate,
  onRetry,
  state,
}: {
  busy: boolean;
  onRequestDeactivate: (account: PaymentAccount) => void;
  onRetry: () => void;
  state: PaymentAccountState;
}) {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return <Loading message="활성 납부 계좌를 불러오고 있어요." />;
    case 'error':
      return <AdminErrorState error={state.error} onRetry={onRetry} />;
    case 'empty':
      return (
        <Empty
          title="활성 납부 계좌가 없습니다"
          message="정산 전에 벌금 또는 커피 계좌를 등록해 주세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="납부 계좌 empty state에서 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'success':
      return (
        <>
          {state.accounts.map((account) => (
            <View key={account.id} style={styles.roleRow}>
              <View style={styles.headerRow}>
                <View style={styles.headerText}>
                  <Text style={styles.memberName}>{account.nickname}</Text>
                  <Text style={styles.memberMeta}>
                    {account.bankName} · {account.accountHolder}
                  </Text>
                  <Text style={styles.memberMeta}>{account.accountNumber}</Text>
                </View>
                <Chip label={account.accountType} tone="info" />
              </View>
              <Button
                accessibilityLabel={`${account.nickname} 계좌 비활성화 확인 열기`}
                disabled={busy}
                onPress={() => onRequestDeactivate(account)}
                variant="danger">
                비활성화
              </Button>
            </View>
          ))}
        </>
      );
    default:
      return assertNever(state);
  }
}

function AdminPenaltyRules({
  busy,
  form,
  onCancelEdit,
  onChangeForm,
  onEdit,
  onRetry,
  onSave,
  state,
}: {
  busy: boolean;
  form: PenaltyRuleForm;
  onCancelEdit: () => void;
  onChangeForm: (patch: Partial<PenaltyRuleForm>) => void;
  onEdit: (rule: PenaltyRule) => void;
  onRetry: () => void;
  onSave: () => void;
  state: PenaltyRuleState;
}) {
  return (
    <>
      <Card>
        <Eyebrow>Admin 24 Penalty Rules</Eyebrow>
        <Title>벌금 규칙</Title>
        <Body>같은 규칙 타입의 새 ACTIVE 규칙이 생성되면 기존 ACTIVE 규칙은 비활성화됩니다.</Body>
        {renderPenaltyRuleList({busy, onEdit, onRetry, state})}
      </Card>
      <Card>
        <Eyebrow>Admin 25 Penalty Rule Edit</Eyebrow>
        <Title>{form.ruleId === null ? '규칙 등록' : '규칙 수정'}</Title>
        {form.ruleId === null ? (
          <>
            <SegmentedControl
              items={penaltyRuleTypeOptions}
              selectedId={form.ruleType}
              onSelect={(ruleType) => onChangeForm({ruleType})}
            />
            <SegmentedControl
              items={penaltyCalculationTypeOptions}
              selectedId={form.calculationType}
              onSelect={(calculationType) => onChangeForm({calculationType})}
            />
          </>
        ) : (
          <>
            <ListRow label="규칙 타입" value={getPenaltyRuleTypeLabel(form.ruleType)} />
            <ListRow label="계산 타입" value={getPenaltyCalculationTypeLabel(form.calculationType)} />
          </>
        )}
        <View style={styles.filterGrid}>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="벌금 규칙 필수 기준 횟수"
              keyboardType="number-pad"
              label="requiredCount"
              onChangeText={(requiredCount) => onChangeForm({requiredCount: requiredCount.replace(/\D/g, '')})}
              placeholder="0 이상"
              value={form.requiredCount}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="벌금 규칙 기본 금액"
              keyboardType="number-pad"
              label="baseAmount"
              onChangeText={(baseAmount) => onChangeForm({baseAmount: baseAmount.replace(/\D/g, '')})}
              placeholder="0 이상"
              value={form.baseAmount}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="벌금 규칙 단위당 금액"
              keyboardType="number-pad"
              label="amountPerUnit"
              onChangeText={(amountPerUnit) => onChangeForm({amountPerUnit: amountPerUnit.replace(/\D/g, '')})}
              placeholder="0 이상"
              value={form.amountPerUnit}
            />
          </View>
        </View>
        {form.ruleId !== null ? (
          <SegmentedControl
            items={penaltyRuleActiveOptions}
            selectedId={form.isActive ? 'active' : 'inactive'}
            onSelect={(value) => onChangeForm({isActive: value === 'active'})}
          />
        ) : null}
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="벌금 규칙 저장"
            disabled={busy}
            onPress={onSave}>
            {busy ? '저장 중...' : '규칙 저장'}
          </Button>
          {form.ruleId !== null ? (
            <Button
              accessibilityLabel="벌금 규칙 수정 취소"
              disabled={busy}
              onPress={onCancelEdit}
              variant="secondary">
              취소
            </Button>
          ) : null}
        </View>
      </Card>
    </>
  );
}

function renderPenaltyRuleList({
  busy,
  onEdit,
  onRetry,
  state,
}: {
  busy: boolean;
  onEdit: (rule: PenaltyRule) => void;
  onRetry: () => void;
  state: PenaltyRuleState;
}) {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return <Loading message="벌금 규칙을 불러오고 있어요." />;
    case 'error':
      return <AdminErrorState error={state.error} onRetry={onRetry} />;
    case 'empty':
      return (
        <Empty
          title="벌금 규칙이 없습니다"
          message="QT, 기도, 성경, 토요지각 규칙을 필요한 순서대로 등록해 주세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="벌금 규칙 empty state에서 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'success':
      return (
        <>
          {state.rules.map((rule) => (
            <View key={rule.id} style={styles.roleRow}>
              <View style={styles.headerRow}>
                <View style={styles.headerText}>
                  <Text style={styles.memberName}>{getPenaltyRuleTypeLabel(rule.ruleType)}</Text>
                  <Text style={styles.memberMeta}>
                    {getPenaltyCalculationTypeLabel(rule.calculationType)} · 기준 {rule.requiredCount}
                  </Text>
                  <Text style={styles.memberMeta}>
                    기본 {formatWon(rule.baseAmount)} · 단위 {formatWon(rule.amountPerUnit)}
                  </Text>
                </View>
                <Chip label={rule.isActive ? 'ACTIVE' : 'INACTIVE'} tone={rule.isActive ? 'success' : 'warning'} />
              </View>
              <Button
                accessibilityLabel={`${getPenaltyRuleTypeLabel(rule.ruleType)} 벌금 규칙 수정`}
                disabled={busy}
                onPress={() => onEdit(rule)}
                variant="secondary">
                수정
              </Button>
            </View>
          ))}
        </>
      );
    default:
      return assertNever(state);
  }
}

function renderSettlementSummary({
  onOpenMemberCharges,
  onRetrySummary,
  settlementState,
}: {
  onOpenMemberCharges: (member: AdminChargeMemberRef) => void;
  onRetrySummary: () => void;
  settlementState: AdminSettlementState;
}) {
  switch (settlementState.status) {
    case 'idle':
    case 'loading':
      return <Loading message="관리자 정산 집계를 불러오고 있어요." />;
    case 'error':
      return <AdminErrorState error={settlementState.error} onRetry={onRetrySummary} />;
    case 'empty':
      return (
        <>
          <SettlementSummaryCard charges={settlementState.charges} />
          <Empty
            title="조건에 맞는 청구 회원이 없습니다"
            message="status, paymentCategory, userId, keyword 필터를 조정해 주세요."
            actionLabel="다시 조회"
            actionAccessibilityLabel="관리자 정산 empty state에서 다시 조회"
            onActionPress={onRetrySummary}
          />
        </>
      );
    case 'success':
      return (
        <>
          <SettlementSummaryCard charges={settlementState.charges} />
          <Card>
            <Eyebrow>회원별 청구 집계</Eyebrow>
            {settlementState.charges.members.map((member) => (
              <SettlementMemberRow
                key={member.userId}
                member={member}
                onPress={() => onOpenMemberCharges(member)}
              />
            ))}
          </Card>
        </>
      );
    default:
      return assertNever(settlementState);
  }
}

function SettlementSummaryCard({charges}: {charges: AdminCampusChargeSummary}) {
  return (
    <Card>
      <Eyebrow>{charges.region} {charges.campusName}</Eyebrow>
      <Title>청구 집계</Title>
      <View style={styles.metricGrid}>
        <Metric label="전체" value={formatWon(charges.summary.totalAmount)} />
        <Metric label="미납" value={formatWon(charges.summary.unpaidAmount)} />
        <Metric label="납부" value={formatWon(charges.summary.paidAmount)} />
        <Metric label="면제" value={formatWon(charges.summary.waivedAmount)} />
        <Metric label="취소" value={formatWon(charges.summary.canceledAmount)} />
        <Metric label="회원" value={`${charges.members.length}명`} />
      </View>
    </Card>
  );
}

function SettlementMemberRow({
  member,
  onPress,
}: {
  member: AdminChargeMemberRef & {
    canceledAmount: number;
    paidAmount: number;
    totalAmount: number;
    unpaidAmount: number;
    waivedAmount: number;
  };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${member.name} 청구 상세 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.roleRow, pressed ? styles.pressed : null]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberMeta}>{member.email}</Text>
        </View>
        <Chip label={`user ${member.userId}`} tone="info" />
      </View>
      <View style={styles.metricGrid}>
        <Metric label="미납" value={formatWon(member.unpaidAmount)} />
        <Metric label="납부" value={formatWon(member.paidAmount)} />
        <Metric label="면제" value={formatWon(member.waivedAmount)} />
        <Metric label="취소" value={formatWon(member.canceledAmount)} />
      </View>
    </Pressable>
  );
}

function renderChargeDetail({
  actionState,
  detailState,
  onBackToSummary,
  onBlockedPaid,
  onRequestStatusChange,
  onRetryDetail,
}: {
  actionState: AdminActionState;
  detailState: AdminChargeDetailState;
  onBackToSummary: () => void;
  onBlockedPaid: (charge: ChargeItem) => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminWritableChargeStatus) => void;
  onRetryDetail: (member: AdminChargeMemberRef) => void;
}) {
  switch (detailState.status) {
    case 'idle':
      return (
        <Empty
          title="회원을 선택해 주세요"
          message="전체 정산 목록에서 회원을 선택하면 Admin 11 청구 상세와 상태 변경 액션을 보여줍니다."
        />
      );
    case 'loading':
      return <Loading message={`${detailState.member.name}님의 청구 상세를 불러오고 있어요.`} />;
    case 'error':
      return (
        <AdminErrorState
          error={detailState.error}
          onRetry={() => onRetryDetail(detailState.member)}
        />
      );
    case 'empty':
    case 'success':
      return (
        <AdminChargeDetail
          actionState={actionState}
          charges={detailState.charges}
          onBackToSummary={onBackToSummary}
          onBlockedPaid={onBlockedPaid}
          onRequestStatusChange={onRequestStatusChange}
        />
      );
    default:
      return assertNever(detailState);
  }
}

function AdminChargeDetail({
  actionState,
  charges,
  onBackToSummary,
  onBlockedPaid,
  onRequestStatusChange,
}: {
  actionState: AdminActionState;
  charges: AdminMemberChargeList;
  onBackToSummary: () => void;
  onBlockedPaid: (charge: ChargeItem) => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminWritableChargeStatus) => void;
}) {
  const busy = actionState.status !== 'idle';

  return (
    <>
      <Card>
        <Eyebrow>Admin 11 Charge Detail - Direct Paid</Eyebrow>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Title>{charges.name}</Title>
            <Body>{charges.email}</Body>
          </View>
          <Button accessibilityLabel="정산 집계로 돌아가기" onPress={onBackToSummary} variant="ghost">
            목록
          </Button>
        </View>
        <View style={styles.metricGrid}>
          <Metric label="전체" value={formatWon(charges.summary.totalAmount)} />
          <Metric label="미납" value={formatWon(charges.summary.unpaidAmount)} />
          <Metric label="납부" value={formatWon(charges.summary.paidAmount)} />
          <Metric label="면제" value={formatWon(charges.summary.waivedAmount)} />
        </View>
        <Body>관리자는 PAID로 직접 변경할 수 없습니다. PAID 버튼은 API 호출 없이 차단 안내만 표시합니다.</Body>
      </Card>
      {charges.items.length === 0 ? (
        <Empty title="청구 항목이 없습니다" message="선택한 필터에 맞는 회원별 청구 상세가 없습니다." />
      ) : (
        <Card>
          <Eyebrow>Admin 11-1 Charge Status Edit</Eyebrow>
          {charges.items.map((charge) => (
            <ChargeItemRow
              busy={busy}
              charge={charge}
              key={charge.id}
              onBlockedPaid={() => onBlockedPaid(charge)}
              onRequestStatusChange={(status) => onRequestStatusChange(charge, status)}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function ChargeItemRow({
  busy,
  charge,
  onBlockedPaid,
  onRequestStatusChange,
}: {
  busy: boolean;
  charge: ChargeItem;
  onBlockedPaid: () => void;
  onRequestStatusChange: (status: AdminWritableChargeStatus) => void;
}) {
  return (
    <View style={styles.roleRow}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.memberName}>{charge.title}</Text>
          <Text style={styles.memberMeta}>{charge.reason}</Text>
          <Text style={styles.memberMeta}>
            due {charge.dueDate ?? '미정'} · item #{charge.id}
          </Text>
        </View>
        <View style={styles.chipRow}>
          <Chip label={charge.paymentCategory} tone="info" />
          <Chip label={charge.status} tone={getChargeStatusTone(charge.status)} />
        </View>
      </View>
      <ListRow
        label="금액"
        supportingText={charge.account ? `${charge.account.bankName} · ${charge.account.accountHolder}` : '계좌 snapshot 없음'}
        value={formatWon(charge.amount)}
      />
      <View style={styles.roleGrid}>
        {adminWritableChargeStatuses.map((status) => (
          <Button
            accessibilityLabel={`청구 항목 ${charge.id} 상태를 ${status}로 변경 확인`}
            disabled={busy || charge.status === status}
            key={status}
            onPress={() => onRequestStatusChange(status)}
            variant={status === 'CANCELED' ? 'danger' : 'secondary'}>
            {getChargeStatusLabel(status)}
          </Button>
        ))}
        <Button
          accessibilityLabel={`청구 항목 ${charge.id} PAID 직접 변경 불가 안내`}
          disabled={busy}
          onPress={onBlockedPaid}
          variant="ghost">
          PAID 불가
        </Button>
      </View>
    </View>
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

function NotificationConfirmSheet({
  onCancel,
  onConfirm,
  state,
  weekStartDate,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  state: NotificationSendState;
  weekStartDate: string;
}) {
  const visible = state.status === 'confirming' || state.status === 'sending';
  const targets = state.status === 'confirming' || state.status === 'sending' ? state.targets : [];
  const loading = state.status === 'sending';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Eyebrow>Admin 12 Notification Confirm</Eyebrow>
          <Title>{targets.length}명에게 경건 알림을 보낼까요?</Title>
          <Body>
            {weekStartDate} 주차 미제출자에게 REST Docs의 CUSTOM 알림 payload로 발송합니다.
          </Body>
          <ListRow label="제목" value="경건생활 제출 알림" />
          <ListRow label="본문" supportingText="이번 주 경건생활을 제출해 주세요." />
          <View style={styles.confirmTargetList}>
            {targets.slice(0, 4).map((target) => (
              <Text key={target.userId} style={styles.confirmTargetText}>
                {target.name} · user {target.userId}
              </Text>
            ))}
            {targets.length > 4 ? (
              <Text style={styles.confirmTargetText}>외 {targets.length - 4}명</Text>
            ) : null}
          </View>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="경건 미제출 알림 발송 실행"
              disabled={loading}
              onPress={onConfirm}>
              {loading ? '발송 중...' : '발송'}
            </Button>
            <Button
              accessibilityLabel="경건 미제출 알림 발송 취소"
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

function ChargeStatusConfirmSheet({
  error,
  loading,
  onCancel,
  onConfirm,
  target,
}: {
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  target: ChargeStatusConfirm;
}) {
  const visible = target !== null;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Eyebrow>Admin 11-1 Charge Status Edit</Eyebrow>
          <Title>
            {target
              ? `${target.charge.title}을 ${getChargeStatusLabel(target.status)} 처리할까요?`
              : '청구 상태 변경'}
          </Title>
          <Body>
            WAIVED, CANCELED, UNPAID 변경만 관리자 API로 전송합니다. PAID 변경은 납부자 직접 처리 흐름에서만 가능합니다.
          </Body>
          {target ? (
            <>
              <ListRow label="현재 상태" value={target.charge.status} />
              <ListRow label="변경 상태" value={target.status} />
              <ListRow label="금액" value={formatWon(target.charge.amount)} />
            </>
          ) : null}
          {error ? <AdminInlineError error={error} /> : null}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="청구 상태 변경 실행"
              disabled={loading}
              onPress={onConfirm}
              variant={target?.status === 'CANCELED' ? 'danger' : 'primary'}>
              {loading ? '변경 중...' : '변경'}
            </Button>
            <Button
              accessibilityLabel="청구 상태 변경 취소"
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

function PaidNotAllowedSheet({
  charge,
  onClose,
}: {
  charge: ChargeItem | null;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={charge !== null} onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Eyebrow>Admin 11-2 Charge Paid Not Allowed</Eyebrow>
          <Title>관리자는 PAID로 직접 변경할 수 없습니다</Title>
          <Body>
            REST Docs 기준 관리자 상태 변경 요청은 UNPAID, WAIVED, CANCELED만 허용합니다. 이 버튼은 API 요청을 보내지 않습니다.
          </Body>
          {charge ? (
            <ListRow
              label={charge.title}
              supportingText={`현재 상태 ${charge.status} · item #${charge.id}`}
              value={formatWon(charge.amount)}
            />
          ) : null}
          <Button accessibilityLabel="PAID 직접 변경 불가 안내 닫기" onPress={onClose}>
            확인
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function DeactivatePaymentAccountSheet({
  account,
  error,
  loading,
  onCancel,
  onConfirm,
}: {
  account: PaymentAccount | null;
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={account !== null} onRequestClose={onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Eyebrow>Admin 22-1 Payment Account Deactivate Confirm</Eyebrow>
          <Title>{account ? `${account.nickname} 계좌를 비활성화할까요?` : '계좌 비활성화'}</Title>
          <Body>
            기존 UNPAID 청구가 있어도 비활성화할 수 있습니다. 새 활성 계좌를 등록하면 미납 청구는 새 계좌로 재연결되고, 다음 정산 전에 계좌 연결 상태를 확인해야 합니다.
          </Body>
          {account ? (
            <>
              <ListRow label="계좌 유형" value={account.accountType} />
              <ListRow
                label={account.bankName}
                supportingText={account.accountHolder}
                value={account.accountNumber}
              />
            </>
          ) : null}
          {error ? <AdminInlineError error={error} /> : null}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="납부 계좌 비활성화 실행"
              disabled={loading}
              onPress={onConfirm}
              variant="danger">
              {loading ? '처리 중...' : '비활성화'}
            </Button>
            <Button
              accessibilityLabel="납부 계좌 비활성화 취소"
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

function PrayerSeasonCloseSheet({
  error,
  loading,
  onCancel,
  onConfirm,
  target,
}: {
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  target: PrayerSeasonCloseTarget;
}) {
  return (
    <Modal animationType="slide" transparent visible={target !== null} onRequestClose={onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Eyebrow>Admin 15 Prayer Season Close Confirm</Eyebrow>
          <Title>{target ? `시즌 #${target.seasonId}을 종료할까요?` : '기도 시즌 종료'}</Title>
          <Body>
            종료 후 해당 시즌은 CLOSED 상태가 됩니다. active season 중복 생성 409를 풀기 위한 위험 액션이라 확인 후 실행합니다.
          </Body>
          {target ? (
            <>
              <ListRow label="seasonId" value={String(target.seasonId)} />
              <ListRow label="endDate" value={target.endDate} />
            </>
          ) : null}
          {error ? <AdminInlineError error={error} /> : null}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="기도 시즌 종료 실행"
              disabled={loading}
              onPress={onConfirm}
              variant="danger">
              {loading ? '종료 중...' : '종료'}
            </Button>
            <Button
              accessibilityLabel="기도 시즌 종료 취소"
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

function addDaysToDateString(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);

  return getWeekStartDate(date);
}

function formatShortWeekLabel(value: string) {
  const parts = value.split('-');
  const month = parts[1] ?? '--';
  const day = parts[2] ?? '--';

  return `${month}/${day}`;
}

function formatCompactWon(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }

  return `${value}원`;
}

function formatWon(value: number) {
  return `${value.toLocaleString('ko-KR')}원`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ko-KR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function countSubmittedMembers(group: PrayerWeekSummary['groups'][number]) {
  return group.members.filter(hasPrayerMemberSubmitted).length;
}

function hasPrayerMemberSubmitted(
  member: PrayerWeekSummary['groups'][number]['members'][number],
) {
  return member.submittedAt !== null || member.content !== null;
}

function parseOptionalPositiveInt(value: string, label: string) {
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
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값이 올바르지 않습니다.`,
    });
  }

  return numericValue;
}

function parseRequiredPositiveInt(value: string, label: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값을 입력해 주세요.`,
    });
  }

  const numericValue = Number(trimmed);

  if (
    !Number.isInteger(numericValue) ||
    numericValue <= 0 ||
    !Number.isSafeInteger(numericValue)
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값은 양의 정수여야 합니다.`,
    });
  }

  return numericValue;
}

function parseRequiredNonNegativeInt(value: string, label: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값을 입력해 주세요.`,
    });
  }

  const numericValue = Number(trimmed);

  if (
    !Number.isInteger(numericValue) ||
    numericValue < 0 ||
    !Number.isSafeInteger(numericValue)
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값은 0 이상의 정수여야 합니다.`,
    });
  }

  return numericValue;
}

function parseUserIdList(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  const ids = trimmed
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => parseRequiredPositiveInt(part, 'userIds'));
  const seen = new Set<number>();

  ids.forEach((id) => {
    if (seen.has(id)) {
      throw new FaithLogApiError({
        kind: 'error',
        message: '기도조 멤버 userId가 중복되었습니다.',
      });
    }

    seen.add(id);
  });

  return ids;
}

function getPenaltyRuleTypeLabel(ruleType: PenaltyRuleType) {
  switch (ruleType) {
    case 'QUIET_TIME':
      return 'QT';
    case 'PRAYER':
      return '기도';
    case 'BIBLE_READING':
      return '성경';
    case 'SATURDAY_LATE':
      return '토요지각';
    default:
      return assertNever(ruleType);
  }
}

function getPenaltyCalculationTypeLabel(calculationType: PenaltyCalculationType) {
  switch (calculationType) {
    case 'MISSING_COUNT':
      return '미달 횟수';
    case 'LATE_MINUTE':
      return '지각 분';
    default:
      return assertNever(calculationType);
  }
}

function getChargeStatusLabel(status: AdminWritableChargeStatus) {
  switch (status) {
    case 'UNPAID':
      return '미납';
    case 'WAIVED':
      return '면제';
    case 'CANCELED':
      return '취소';
    default:
      return assertNever(status);
  }
}

function getChargeStatusTone(status: ChargeStatus) {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'UNPAID':
      return 'warning';
    case 'WAIVED':
      return 'info';
    case 'CANCELED':
      return 'danger';
    default:
      return assertNever(status);
  }
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
  confirmTargetList: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.item,
    gap: 6,
    padding: 12,
  },
  confirmTargetText: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  filterField: {
    flex: 1,
    minWidth: 140,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
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
