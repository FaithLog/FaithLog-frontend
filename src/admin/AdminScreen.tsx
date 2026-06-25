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
  fetchAdminNotificationLogs,
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
import {
  createAdminPoll,
  createAdminPollTemplate,
  deleteAdminPollTemplate,
  fetchAdminPollComments,
  fetchAdminPollMissingMembers,
  fetchAdminPollResults,
  fetchAdminPolls,
  fetchAdminPollTemplates,
  sendAdminPollMissingNotification,
  updateAdminPollTemplate,
  type AdminPoll,
  type AdminPollChargeGenerationType,
  type AdminPollCreateRequest,
  type AdminPollMissingMember,
  type AdminPollSelectionType,
  type AdminPollTemplate,
  type AdminPollTemplateOptionRequest,
  type AdminPollTemplateRequest,
  type AdminPollType,
} from '../api/adminPollApi';
import {getApiErrorPresentation} from '../api/errorPolicy';
import {clearTokens, getStoredTokens} from '../api/tokenStorage';
import type {
  AdminCampusChargeSummary,
  AdminCampusMember,
  AdminDashboardSummary,
  AdminMemberChargeList,
  AdminMissingDevotionMember,
  AdminNotificationLog,
  AdminNotificationLogList,
  AdminNotificationSendStatus,
  AdminNotificationType,
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
  PollComment,
  PollOption,
  PollResults,
  PollSummary,
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

type AdminTab =
  | 'home'
  | 'devotion'
  | 'polls'
  | 'notificationLogs'
  | 'prayer'
  | 'members'
  | 'roles'
  | 'settlement';
type MemberFilter = 'ALL' | 'ADMINS' | 'MEMBERS';
type RoleFilter = MemberFilter;
type ChargeStatusFilter = ChargeStatus | 'ALL';
type PaymentCategoryFilter = PaymentCategory | 'ALL';
type AdminSettlementSection = 'charges' | 'accounts' | 'penaltyRules';
type NotificationSendStatusFilter = AdminNotificationSendStatus | 'ALL';
type NotificationTypeFilter = AdminNotificationType | 'ALL';

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

type NotificationLogState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; logs: AdminNotificationLogList}
  | {status: 'empty'; logs: AdminNotificationLogList}
  | {status: 'error'; error: ApiError};

type NotificationLogFilters = {
  endDate: string;
  notificationType: NotificationTypeFilter;
  page: number;
  requestId: string;
  sendStatus: NotificationSendStatusFilter;
  startDate: string;
  targetId: string;
  targetWeekStartDate: string;
};

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
  {id: 'polls', label: '투표'},
  {id: 'notificationLogs', label: '알림'},
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

const notificationStatusFilters: Array<{id: NotificationSendStatusFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'PENDING', label: '대기'},
  {id: 'SENT', label: '성공'},
  {id: 'FAILED', label: '실패'},
  {id: 'SKIPPED', label: '스킵'},
];

const notificationTypeFilters: Array<{id: NotificationTypeFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'CUSTOM', label: 'CUSTOM'},
];

const campusRoleOptions: CampusRole[] = ['MEMBER', 'CAMPUS_LEADER', 'ELDER', 'MINISTER'];
const adminCampusRoles = new Set<CampusRole>(['MINISTER', 'ELDER', 'CAMPUS_LEADER']);
const adminWritableChargeStatuses: AdminWritableChargeStatus[] = [
  'UNPAID',
  'WAIVED',
  'CANCELED',
];
const adminFigmaTokens = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  primary: '#3182F6',
  faith: '#5BA8B0',
  mint: '#92C7CF',
  danger: '#EF4444',
  success: '#22C55E',
  warning: '#F59E0B',
  textPrimary: '#191F28',
  textSecondary: '#4E5968',
  textMuted: '#8B95A1',
  borderSoft: '#EEF1F4',
};

const emptyPaymentAccountForm: PaymentAccountForm = {
  accountHolder: '',
  accountNumber: '',
  accountType: 'PENALTY',
  bankName: '',
  nickname: '',
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

const emptyNotificationLogFilters: NotificationLogFilters = {
  endDate: '',
  notificationType: 'ALL',
  page: 0,
  requestId: '',
  sendStatus: 'ALL',
  startDate: '',
  targetId: '',
  targetWeekStartDate: '',
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
  const [notificationLogFilters, setNotificationLogFilters] =
    useState<NotificationLogFilters>(emptyNotificationLogFilters);
  const [notificationLogState, setNotificationLogState] = useState<NotificationLogState>({
    status: 'idle',
  });
  const [selectedNotificationLogId, setSelectedNotificationLogId] = useState<number | null>(
    null,
  );
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
  const [selectedPaymentAccount, setSelectedPaymentAccount] =
    useState<PaymentAccount | null>(null);
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
    setNotificationLogFilters(emptyNotificationLogFilters);
    setNotificationLogState({status: 'idle'});
    setSelectedNotificationLogId(null);
    setSettlementSection('charges');
    setSettlementState({status: 'idle'});
    setChargeDetailState({status: 'idle'});
    setPaymentAccountState({status: 'idle'});
    setPaymentAccountForm(emptyPaymentAccountForm);
    setSelectedPaymentAccount(null);
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
    if (tab === 'notificationLogs' && notificationLogState.status === 'idle') {
      void loadNotificationLogs();
    }
  }, [tab, notificationLogState.status]);

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

  const loadNotificationLogs = async (
    filters: NotificationLogFilters = notificationLogFilters,
  ) => {
    setNotificationLogState({status: 'loading'});
    setSelectedNotificationLogId(null);
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const targetId = parseOptionalPositiveInt(filters.targetId, 'targetId');
      const endDate = filters.endDate.trim();
      const startDate = filters.startDate.trim();
      const targetWeekStartDate = filters.targetWeekStartDate.trim();
      const logs = await fetchAdminNotificationLogs(accessToken, campusId, {
        notificationType: filters.notificationType,
        page: filters.page,
        requestId: filters.requestId,
        sendStatus: filters.sendStatus,
        size: 20,
        sort: {key: 'createdAt', direction: 'desc'},
        ...(endDate ? {endDate} : {}),
        ...(startDate ? {startDate} : {}),
        ...(targetId === undefined ? {} : {targetId}),
        ...(targetWeekStartDate ? {targetWeekStartDate} : {}),
      });

      setNotificationLogState(
        logs.items.length === 0 ? {status: 'empty', logs} : {status: 'success', logs},
      );
      setNotificationLogFilters((current) => ({...current, page: logs.page}));
    } catch (error) {
      const apiError = toApiError(error, '알림 로그를 불러오지 못했습니다.');
      setNotificationLogState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const updateNotificationLogFilter = <K extends keyof NotificationLogFilters>(
    key: K,
    value: NotificationLogFilters[K],
  ) => {
    setNotificationLogFilters((current) => ({...current, [key]: value, page: 0}));
  };

  const openNotificationLogsForRequest = (requestId: string) => {
    const filters = {
      ...emptyNotificationLogFilters,
      requestId,
      page: 0,
    };

    setSelectedMemberId(null);
    setSelectedNotificationLogId(null);
    setNotificationLogFilters(filters);
    setTab('notificationLogs');
    void loadNotificationLogs(filters);
  };

  const changeNotificationLogPage = (direction: -1 | 1) => {
    const currentPage =
      notificationLogState.status === 'success' || notificationLogState.status === 'empty'
        ? notificationLogState.logs.page
        : notificationLogFilters.page;
    const totalPages =
      notificationLogState.status === 'success' || notificationLogState.status === 'empty'
        ? notificationLogState.logs.totalPages
        : 0;
    const nextPage = Math.max(0, Math.min(currentPage + direction, Math.max(totalPages - 1, 0)));
    const nextFilters = {...notificationLogFilters, page: nextPage};

    setNotificationLogFilters(nextFilters);
    void loadNotificationLogs(nextFilters);
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
        ownerUserId: null,
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
      setSelectedPaymentAccount(null);
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
        message: `${updated.name}님의 캠퍼스 권한을 ${updated.campusRole}로 변경했습니다.`,
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
          title="활성 멤버가 없습니다"
          message="현재 캠퍼스에서 운영 중인 멤버만 목록에 표시됩니다."
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
          onOpenNotificationLogs={openNotificationLogsForRequest}
          onRetry={loadMissingDevotions}
          summary={loadState.summary}
          weekStartDate={weekStartDate}
        />
      ) : tab === 'polls' ? (
        <AdminPollManagement
          campusId={campusId}
          coffeeDuty={coffeeDuty}
          onSessionStateChange={setAuthState}
          setNotice={setNotice}
        />
      ) : tab === 'notificationLogs' ? (
        <AdminNotificationLogs
          filters={notificationLogFilters}
          onChangeFilter={updateNotificationLogFilter}
          onChangePage={changeNotificationLogPage}
          onClearFilters={() => {
            setNotificationLogFilters(emptyNotificationLogFilters);
            setSelectedNotificationLogId(null);
            void loadNotificationLogs(emptyNotificationLogFilters);
          }}
          onRetry={() => void loadNotificationLogs()}
          onSearch={() => {
            const nextFilters = {...notificationLogFilters, page: 0};
            setNotificationLogFilters(nextFilters);
            void loadNotificationLogs(nextFilters);
          }}
          onSelectLog={setSelectedNotificationLogId}
          selectedLogId={selectedNotificationLogId}
          state={notificationLogState}
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
            setSelectedPaymentAccount(null);
            setActionError(null);
          }}
          onBackToSummary={() => setChargeDetailState({status: 'idle'})}
          onBlockedPaid={setPaidBlockedTarget}
          onEditPenaltyRule={editPenaltyRule}
          onOpenMemberCharges={openMemberCharges}
          onRequestDeactivatePaymentAccount={setPaymentAccountDeactivateTarget}
          onSelectPaymentAccount={setSelectedPaymentAccount}
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
          selectedPaymentAccount={selectedPaymentAccount}
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
          <Eyebrow>캠퍼스 운영</Eyebrow>
          <Title>관리자 홈</Title>
          <Body>
            전체 권한 {globalRole}와 캠퍼스 권한 {selectedCampusRole}를 기준으로 관리 범위를 나눠 보여줍니다.
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
        <Eyebrow>운영 개요</Eyebrow>
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
            supportingText="캠퍼스 권한 변경 전용입니다. 전체 권한은 변경하지 않습니다."
            value="보기"
            onPress={onOpenRoles}
            accessibilityLabel="관리자 역할 관리 화면으로 이동"
          />
        ) : null}
      </Card>
    </>
  );
}

type AdminPollSection = 'manage' | 'create' | 'results' | 'missing' | 'templates' | 'status';
type AdminPollTypeFilter = AdminPollType | 'ALL';
type AdminPollListState =
  | {status: 'loading'}
  | {
      status: 'success';
      accounts: PaymentAccount[];
      polls: PollSummary[];
      templates: AdminPollTemplate[];
    }
  | {
      status: 'empty';
      accounts: PaymentAccount[];
      polls: PollSummary[];
      templates: AdminPollTemplate[];
    }
  | {status: 'error'; error: ApiError};
type AdminPollResultState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; comments: PollComment[]; results: PollResults}
  | {status: 'empty'; comments: PollComment[]; results: PollResults}
  | {status: 'error'; error: ApiError};
type AdminPollMissingState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; members: AdminPollMissingMember[]}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};
type AdminPollActionState =
  | {status: 'idle'}
  | {status: 'savingTemplate'}
  | {status: 'deletingTemplate'; templateId: number}
  | {status: 'creatingPoll'}
  | {status: 'sendingMissingNotice'};

type AdminPollTemplateForm = {
  autoCreateEnabled: boolean;
  chargeGenerationType: AdminPollChargeGenerationType;
  endDayOfWeek: string;
  endTime: string;
  optionsText: string;
  paymentAccountId: string;
  paymentCategory: PaymentCategory | 'NONE';
  pollType: AdminPollType;
  selectionType: AdminPollSelectionType;
  startDayOfWeek: string;
  startTime: string;
  templateId: number | null;
  title: string;
};

type AdminPollCreateForm = {
  chargeGenerationType: AdminPollChargeGenerationType;
  endsAt: string;
  isAnonymous: boolean;
  optionsText: string;
  paymentAccountId: string;
  paymentCategory: PaymentCategory | 'NONE';
  pollType: AdminPollType;
  selectionType: AdminPollSelectionType;
  startsAt: string;
  templateId: string;
  title: string;
};

const pollSections: Array<{id: AdminPollSection; label: string}> = [
  {id: 'manage', label: '관리'},
  {id: 'create', label: '생성'},
  {id: 'results', label: '결과'},
  {id: 'missing', label: '미참여'},
  {id: 'templates', label: '템플릿'},
  {id: 'status', label: '상태'},
];

const adminPollTypeFilters: Array<{id: AdminPollTypeFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'WEDNESDAY', label: '수요'},
  {id: 'SATURDAY', label: '토요'},
  {id: 'COFFEE', label: '커피'},
  {id: 'CUSTOM', label: '커스텀'},
];

const adminPollTypes: Array<{id: AdminPollType; label: string}> = [
  {id: 'CUSTOM', label: '커스텀'},
  {id: 'COFFEE', label: '커피'},
  {id: 'WEDNESDAY', label: '수요'},
  {id: 'SATURDAY', label: '토요'},
];

const adminPollSelectionTypes: Array<{id: AdminPollSelectionType; label: string}> = [
  {id: 'SINGLE', label: '단일'},
  {id: 'MULTIPLE', label: '복수'},
];

const adminPollChargeTypes: Array<{id: AdminPollChargeGenerationType; label: string}> = [
  {id: 'NONE', label: '없음'},
  {id: 'OPTION_PRICE', label: '선택가'},
];

const emptyAdminPollTemplateForm: AdminPollTemplateForm = {
  autoCreateEnabled: false,
  chargeGenerationType: 'NONE',
  endDayOfWeek: '1',
  endTime: '18:00:00',
  optionsText: '참석, 불참',
  paymentAccountId: '',
  paymentCategory: 'NONE',
  pollType: 'CUSTOM',
  selectionType: 'SINGLE',
  startDayOfWeek: '1',
  startTime: '09:00:00',
  templateId: null,
  title: '',
};

function createEmptyAdminPollForm(): AdminPollCreateForm {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  return {
    chargeGenerationType: 'NONE',
    endsAt: endsAt.toISOString(),
    isAnonymous: false,
    optionsText: '참석, 불참',
    paymentAccountId: '',
    paymentCategory: 'NONE',
    pollType: 'CUSTOM',
    selectionType: 'SINGLE',
    startsAt: startsAt.toISOString(),
    templateId: '',
    title: '',
  };
}

function AdminPollManagement({
  campusId,
  coffeeDuty,
  onSessionStateChange,
  setNotice,
}: {
  campusId: number;
  coffeeDuty: DutyAssignment | null;
  onSessionStateChange: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
}) {
  const [section, setSection] = useState<AdminPollSection>('manage');
  const [listState, setListState] = useState<AdminPollListState>({status: 'loading'});
  const [resultState, setResultState] = useState<AdminPollResultState>({status: 'idle'});
  const [missingState, setMissingState] = useState<AdminPollMissingState>({status: 'idle'});
  const [actionState, setActionState] = useState<AdminPollActionState>({status: 'idle'});
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [pollTypeFilter, setPollTypeFilter] = useState<AdminPollTypeFilter>('ALL');
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] =
    useState<AdminPollTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<AdminPollTemplateForm>(
    emptyAdminPollTemplateForm,
  );
  const [pollForm, setPollForm] = useState<AdminPollCreateForm>(() =>
    createEmptyAdminPollForm(),
  );

  const loadPolls = async () => {
    setListState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const [polls, templates, accounts] = await Promise.all([
        fetchAdminPolls(accessToken, campusId),
        fetchAdminPollTemplates(accessToken, campusId),
        fetchPaymentAccounts(accessToken, campusId),
      ]);

      setListState(
        polls.length === 0 && templates.length === 0
          ? {status: 'empty', accounts, polls, templates}
          : {status: 'success', accounts, polls, templates},
      );

      if (!selectedPollId && polls[0]) {
        setSelectedPollId(polls[0].id);
      }
    } catch (error) {
      const apiError = toApiError(error, '투표 관리 정보를 불러오지 못했습니다.');
      setListState({status: 'error', error: apiError});
      void handleAuthError(apiError, onSessionStateChange);
    }
  };

  useEffect(() => {
    void loadPolls();
  }, [campusId]);

  const templates =
    listState.status === 'success' || listState.status === 'empty' ? listState.templates : [];
  const polls =
    listState.status === 'success' || listState.status === 'empty' ? listState.polls : [];
  const accounts =
    listState.status === 'success' || listState.status === 'empty' ? listState.accounts : [];
  const filteredPolls = filterAdminPollsByType(polls, pollTypeFilter);
  const selectedPoll = selectedPollId
    ? polls.find((poll) => poll.id === selectedPollId) ?? null
    : null;
  const selectedTemplate = getSelectedTemplate(templateForm, templates);
  const busy = actionState.status !== 'idle';
  const coffeeWarning = getAdminPollCoffeeWarning(pollForm, coffeeDuty);

  const saveTemplate = async () => {
    if (busy) {
      return;
    }

    setActionState({status: 'savingTemplate'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const request = toAdminPollTemplateFormRequest(templateForm);
      const saved =
        templateForm.templateId === null
          ? await createAdminPollTemplate(accessToken, campusId, request)
          : await updateAdminPollTemplate(
              accessToken,
              campusId,
              templateForm.templateId,
              request,
            );

      setTemplateForm(toTemplateForm(saved));
      setNotice({
        tone: saved.isActive ? 'success' : 'warning',
        title: templateForm.templateId === null ? '투표 템플릿 생성' : '투표 템플릿 수정',
        message: `${saved.title} 템플릿을 저장했습니다.`,
      });
      await loadPolls();
    } catch (error) {
      const apiError = toApiError(error, '투표 템플릿을 저장하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, onSessionStateChange);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!deleteTemplateTarget || busy) {
      return;
    }

    const target = deleteTemplateTarget;
    setActionState({status: 'deletingTemplate', templateId: target.id});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const deactivated = await deleteAdminPollTemplate(accessToken, campusId, target.id);
      setDeleteTemplateTarget(null);
      setNotice({
        tone: 'warning',
        title: '투표 템플릿 비활성화',
        message: `${deactivated.title} 템플릿을 비활성화했습니다.`,
      });
      await loadPolls();
    } catch (error) {
      const apiError = toApiError(error, '투표 템플릿을 비활성화하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, onSessionStateChange);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const createPoll = async () => {
    if (busy) {
      return;
    }

    setActionState({status: 'creatingPoll'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const request = toAdminPollCreateFormRequest(pollForm);
      const created = await createAdminPoll(accessToken, campusId, request);
      setSelectedPollId(created.id);
      setPollForm(toPollCreateForm(created));
      setNotice({
        tone: 'success',
        title: '투표 생성',
        message: `${created.title} 투표를 생성했습니다. ${formatDateTime(created.endsAt)} 이후 서버가 자동으로 닫습니다.`,
      });
      await loadPolls();
      setSection('results');
      await loadResults(created.id);
    } catch (error) {
      const apiError = toApiError(error, '투표를 생성하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, onSessionStateChange);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const loadResults = async (pollId: number | null = selectedPollId) => {
    if (!pollId) {
      setResultState({status: 'idle'});
      return;
    }

    setResultState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const [results, comments] = await Promise.all([
        fetchAdminPollResults(accessToken, campusId, pollId),
        fetchAdminPollComments(accessToken, campusId, pollId),
      ]);

      setResultState(
        results.respondedCount === 0 && comments.length === 0
          ? {status: 'empty', results, comments}
          : {status: 'success', results, comments},
      );
    } catch (error) {
      const apiError = toApiError(error, '투표 결과를 불러오지 못했습니다.');
      setResultState({status: 'error', error: apiError});
      void handleAuthError(apiError, onSessionStateChange);
    }
  };

  const loadMissing = async (pollId: number | null = selectedPollId) => {
    if (!pollId) {
      setMissingState({status: 'idle'});
      return;
    }

    setMissingState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const members = await fetchAdminPollMissingMembers(accessToken, campusId, pollId);
      setMissingState(members.length === 0 ? {status: 'empty'} : {status: 'success', members});
    } catch (error) {
      const apiError = toApiError(error, '투표 미응답자를 불러오지 못했습니다.');
      setMissingState({status: 'error', error: apiError});
      void handleAuthError(apiError, onSessionStateChange);
    }
  };

  const sendMissingNotification = async () => {
    if (missingState.status !== 'success' || !selectedPollId || busy) {
      return;
    }

    const targets = missingState.members;
    setActionState({status: 'sendingMissingNotice'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const result = await sendAdminPollMissingNotification(accessToken, campusId, {
        notificationType: 'CUSTOM',
        targetUserIds: targets.map((member) => member.userId),
        targetWeekStartDate: null,
        targetId: selectedPollId,
        title: '투표 응답 알림',
        body: selectedPoll
          ? `${selectedPoll.title} 투표에 응답해 주세요.`
          : '진행 중인 투표에 응답해 주세요.',
      });

      setNotice({
        tone: result.skippedCount > 0 ? 'warning' : 'success',
        title: '투표 미응답 알림 발송',
        message: `${result.queuedCount}명 큐잉, ${result.skippedCount}명 스킵 처리되었습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '투표 미응답 알림을 발송하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, onSessionStateChange);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const selectPoll = (poll: PollSummary) => {
    setSelectedPollId(poll.id);
    setResultState({status: 'idle'});
    setMissingState({status: 'idle'});
  };

  const useTemplateForPoll = (template: AdminPollTemplate) => {
    setPollForm((current) => ({
      ...current,
      chargeGenerationType:
        template.chargeGenerationType === 'OPTION_PRICE' ? 'OPTION_PRICE' : 'NONE',
      optionsText: formatPollOptionsText(template.options),
      paymentAccountId: template.paymentAccountId ? String(template.paymentAccountId) : '',
      paymentCategory: template.paymentCategory ?? 'NONE',
      pollType: toKnownAdminPollType(template.pollType),
      selectionType: template.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE',
      templateId: String(template.id),
      title: template.title,
    }));
    setSection('create');
  };

  return (
    <>
      <Card>
        <Title>투표 관리</Title>
        <Body>투표 생성, 결과 확인, 미참여자 알림, 반복 템플릿을 관리합니다.</Body>
        <SegmentedControl items={pollSections} selectedId={section} onSelect={setSection} />
      </Card>
      {actionError ? <AdminInlineError error={actionError} /> : null}
      {listState.status === 'loading' ? (
        <Loading message="투표와 템플릿을 불러오고 있어요." />
      ) : listState.status === 'error' ? (
        <AdminErrorState error={listState.error} onRetry={loadPolls} />
      ) : (
        <>
          {section === 'manage' ? (
            <AdminPollList
              filter={pollTypeFilter}
              onChangeFilter={setPollTypeFilter}
              onRefresh={loadPolls}
              onSelectPoll={selectPoll}
              polls={filteredPolls}
              selectedPollId={selectedPollId}
              templates={templates}
            />
          ) : null}
          {section === 'templates' ? (
            <AdminPollTemplateEditor
              actionState={actionState}
              accounts={accounts}
              form={templateForm}
              onChangeForm={(patch) =>
                setTemplateForm((current) => ({...current, ...patch}))
              }
              onConfirmDelete={confirmDeleteTemplate}
              onDeleteTarget={setDeleteTemplateTarget}
              onNewTemplate={() => setTemplateForm(emptyAdminPollTemplateForm)}
              onSave={saveTemplate}
              onUseTemplateForPoll={useTemplateForPoll}
              selectedTemplate={selectedTemplate}
              target={deleteTemplateTarget}
              templates={templates}
              onEditTemplate={(template) => setTemplateForm(toTemplateForm(template))}
            />
          ) : null}
          {section === 'create' ? (
            <AdminPollCreatePanel
              accounts={accounts}
              busy={busy}
              coffeeWarning={coffeeWarning}
              form={pollForm}
              onChangeForm={(patch) => setPollForm((current) => ({...current, ...patch}))}
              onCreate={createPoll}
              onPickTemplate={useTemplateForPoll}
              onReset={() => setPollForm(createEmptyAdminPollForm())}
              templates={templates}
            />
          ) : null}
          {section === 'results' ? (
            <AdminPollResultsPanel
              onLoad={() => void loadResults()}
              onSelectPoll={selectPoll}
              polls={polls}
              selectedPoll={selectedPoll}
              state={resultState}
            />
          ) : null}
          {section === 'missing' ? (
            <AdminPollMissingPanel
              actionState={actionState}
              onLoad={() => void loadMissing()}
              onSelectPoll={selectPoll}
              onSendNotification={sendMissingNotification}
              polls={polls}
              selectedPoll={selectedPoll}
              state={missingState}
            />
          ) : null}
          {section === 'status' ? (
            <AdminPollStatusPanel
              onSelectPoll={selectPoll}
              polls={polls}
              selectedPoll={selectedPoll}
            />
          ) : null}
        </>
      )}
    </>
  );
}

function AdminPollList({
  filter,
  onChangeFilter,
  onRefresh,
  onSelectPoll,
  polls,
  selectedPollId,
  templates,
}: {
  filter: AdminPollTypeFilter;
  onChangeFilter: (filter: AdminPollTypeFilter) => void;
  onRefresh: () => void;
  onSelectPoll: (poll: PollSummary) => void;
  polls: PollSummary[];
  selectedPollId: number | null;
  templates: AdminPollTemplate[];
}) {
  if (polls.length === 0 && templates.length === 0) {
    return (
      <Empty
        title="투표와 템플릿이 없습니다"
        message="템플릿을 먼저 만들거나 직접 생성으로 투표를 시작할 수 있습니다."
        actionLabel="다시 불러오기"
        actionAccessibilityLabel="투표 관리 목록 다시 불러오기"
        onActionPress={onRefresh}
      />
    );
  }

  return (
    <>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Title>투표</Title>
            <Body>진행 중이거나 종료된 투표를 유형별로 확인합니다.</Body>
          </View>
          <Button
            accessibilityLabel="투표 목록 다시 불러오기"
            onPress={onRefresh}
            variant="secondary">
            새로고침
          </Button>
        </View>
        <View style={styles.metricGrid}>
          <Metric label="투표" value={`${polls.length}개`} />
          <Metric label="템플릿" value={`${templates.length}개`} />
          <Metric label="진행" value={`${polls.filter((poll) => poll.status === 'OPEN').length}개`} />
          <Metric label="마감" value={`${polls.filter((poll) => poll.status === 'CLOSED').length}개`} />
        </View>
      </Card>
      <Card>
        <Eyebrow>유형별 투표</Eyebrow>
        <SegmentedControl
          items={adminPollTypeFilters}
          selectedId={filter}
          onSelect={onChangeFilter}
        />
        {polls.length === 0 ? <Body>선택한 유형의 투표가 없습니다.</Body> : null}
        {polls.map((poll) => (
          <ListRow
            accessibilityLabel={`${poll.title} 투표 선택`}
            key={poll.id}
            label={poll.title}
            onPress={() => onSelectPoll(poll)}
            supportingText={`${getPollResponseSummary(poll)} · ${formatDateTime(poll.endsAt)} 마감`}
            value={poll.id === selectedPollId ? '선택됨' : getPollStatusLabel(poll.status)}
          />
        ))}
      </Card>
      <Card>
        <Eyebrow>반복</Eyebrow>
        <Title>투표 템플릿</Title>
        <Body>저장된 템플릿으로 반복 투표를 빠르게 만들 수 있습니다.</Body>
      </Card>
    </>
  );
}

function AdminPollTemplateEditor({
  actionState,
  accounts,
  form,
  onChangeForm,
  onConfirmDelete,
  onDeleteTarget,
  onEditTemplate,
  onNewTemplate,
  onSave,
  onUseTemplateForPoll,
  selectedTemplate,
  target,
  templates,
}: {
  accounts: PaymentAccount[];
  actionState: AdminPollActionState;
  form: AdminPollTemplateForm;
  onChangeForm: (patch: Partial<AdminPollTemplateForm>) => void;
  onConfirmDelete: () => void;
  onDeleteTarget: (template: AdminPollTemplate | null) => void;
  onEditTemplate: (template: AdminPollTemplate) => void;
  onNewTemplate: () => void;
  onSave: () => void;
  onUseTemplateForPoll: (template: AdminPollTemplate) => void;
  selectedTemplate: AdminPollTemplate | null;
  target: AdminPollTemplate | null;
  templates: AdminPollTemplate[];
}) {
  const busy = actionState.status !== 'idle';
  const activeTemplates = templates.filter((template) => template.isActive);

  return (
    <>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Title>투표 템플릿</Title>
            <Body>반복 생성에 사용할 템플릿과 마감 규칙을 관리합니다.</Body>
          </View>
          <Chip label={`반복 투표 ${activeTemplates.length}개`} tone="info" />
        </View>
        {templates.length === 0 ? (
          <Body>저장된 템플릿이 없습니다.</Body>
        ) : (
          templates.map((template) => (
            <View key={template.id} style={styles.compactBlock}>
              <ListRow
                label={template.title}
                supportingText={getTemplateScheduleLabel(template)}
                value={template.isActive ? 'ON' : 'OFF'}
              />
              <View style={styles.actionRow}>
                <Button
                  accessibilityLabel={`${template.title} 템플릿 수정`}
                  disabled={busy}
                  onPress={() => onEditTemplate(template)}
                  variant="secondary">
                  수정
                </Button>
                <Button
                  accessibilityLabel={`${template.title} 템플릿 기반 투표 생성`}
                  disabled={busy || !template.isActive}
                  onPress={() => onUseTemplateForPoll(template)}
                  variant="secondary">
                  생성에 사용
                </Button>
                <Button
                  accessibilityLabel={`${template.title} 템플릿 비활성화 확인`}
                  disabled={busy || !template.isActive}
                  onPress={() => onDeleteTarget(template)}
                  variant="danger">
                  비활성화
                </Button>
              </View>
            </View>
          ))
        )}
      </Card>
      <Card>
        <Title>{form.templateId === null ? '템플릿 생성' : '템플릿 수정'}</Title>
        <Body>투표 유형, 선택 방식, 선택지와 반복 시간을 저장합니다.</Body>
        <TextField
          label="템플릿 제목"
          onChangeText={(title) => onChangeForm({title})}
          value={form.title}
        />
        <SegmentedControl
          items={adminPollTypes}
          selectedId={form.pollType}
          onSelect={(pollType) => onChangeForm({pollType})}
        />
        <SegmentedControl
          items={adminPollSelectionTypes}
          selectedId={form.selectionType}
          onSelect={(selectionType) => onChangeForm({selectionType})}
        />
        <SegmentedControl
          items={adminPollChargeTypes}
          selectedId={form.chargeGenerationType}
          onSelect={(chargeGenerationType) =>
            onChangeForm({
              chargeGenerationType,
              paymentCategory: chargeGenerationType === 'NONE' ? 'NONE' : form.paymentCategory,
            })
          }
        />
        <View style={styles.formRow}>
          <TextField
            keyboardType="number-pad"
            label="시작 요일"
            onChangeText={(startDayOfWeek) => onChangeForm({startDayOfWeek})}
            value={form.startDayOfWeek}
          />
          <TextField
            label="시작 시간"
            onChangeText={(startTime) => onChangeForm({startTime})}
            value={form.startTime}
          />
        </View>
        <View style={styles.formRow}>
          <TextField
            keyboardType="number-pad"
            label="마감 요일"
            onChangeText={(endDayOfWeek) => onChangeForm({endDayOfWeek})}
            value={form.endDayOfWeek}
          />
          <TextField
            label="마감 시간"
            onChangeText={(endTime) => onChangeForm({endTime})}
            value={form.endTime}
          />
        </View>
        <TextField
          helper="쉼표로 구분합니다. 커피 메뉴는 menu:4 형식으로 입력할 수 있습니다."
          label="선택지"
          onChangeText={(optionsText) => onChangeForm({optionsText})}
          value={form.optionsText}
        />
        {form.chargeGenerationType === 'OPTION_PRICE' ? (
          <PaymentAccountPicker
            accounts={accounts}
            category={form.paymentCategory}
            onSelect={(account) =>
              onChangeForm({
                paymentAccountId: String(account.id),
                paymentCategory: account.accountType,
              })
            }
            selectedAccountId={toOptionalPositiveId(form.paymentAccountId)}
          />
        ) : null}
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="투표 템플릿 저장"
            disabled={busy}
            onPress={onSave}>
            {busy ? '저장 중...' : '저장'}
          </Button>
          <Button
            accessibilityLabel="새 투표 템플릿 입력"
            disabled={busy}
            onPress={onNewTemplate}
            variant="secondary">
            새 템플릿
          </Button>
        </View>
      </Card>
      {selectedTemplate ? <AdminPollTemplatePreview template={selectedTemplate} /> : null}
      {target ? (
        <Card>
          <Title>{target.title} 비활성화</Title>
          <Body>반복 생성 목록에서 제외합니다. 이미 생성된 투표는 그대로 유지됩니다.</Body>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="투표 템플릿 비활성화 실행"
              disabled={busy}
              onPress={onConfirmDelete}
              variant="danger">
              {actionState.status === 'deletingTemplate' ? '처리 중...' : '비활성화'}
            </Button>
            <Button
              accessibilityLabel="투표 템플릿 비활성화 취소"
              disabled={busy}
              onPress={() => onDeleteTarget(null)}
              variant="secondary">
              취소
            </Button>
          </View>
        </Card>
      ) : null}
    </>
  );
}

function AdminPollCreatePanel({
  accounts,
  busy,
  coffeeWarning,
  form,
  onChangeForm,
  onCreate,
  onPickTemplate,
  onReset,
  templates,
}: {
  accounts: PaymentAccount[];
  busy: boolean;
  coffeeWarning: string | null;
  form: AdminPollCreateForm;
  onChangeForm: (patch: Partial<AdminPollCreateForm>) => void;
  onCreate: () => void;
  onPickTemplate: (template: AdminPollTemplate) => void;
  onReset: () => void;
  templates: AdminPollTemplate[];
}) {
  const selectedTemplate = templates.find((item) => String(item.id) === form.templateId.trim());

  return (
    <Card>
      <Title>투표 생성</Title>
      <Body>투표 유형을 고르고 제목, 마감, 선택지를 입력합니다.</Body>
      {templates.length > 0 ? (
        <View style={styles.compactBlock}>
          <Eyebrow>템플릿 선택</Eyebrow>
          {templates
            .filter((template) => template.isActive)
            .map((template) => (
              <ListRow
                accessibilityLabel={`${template.title} 템플릿 선택`}
                key={template.id}
                label={template.title}
                onPress={() => onPickTemplate(template)}
                supportingText={getTemplateScheduleLabel(template)}
                value={selectedTemplate?.id === template.id ? '선택됨' : getPollTypeLabel(template.pollType)}
              />
            ))}
          <Button
            accessibilityLabel="템플릿 없이 직접 입력"
            disabled={busy}
            onPress={() => onChangeForm({templateId: '', optionsText: form.optionsText || '참석, 불참'})}
            variant="secondary">
            직접 입력
          </Button>
        </View>
      ) : null}
      <TextField
        label="투표 제목"
        onChangeText={(title) => onChangeForm({title})}
        value={form.title}
      />
      <SegmentedControl
        items={adminPollTypes}
        selectedId={form.pollType}
        onSelect={(pollType) => onChangeForm({pollType})}
      />
      <SegmentedControl
        items={adminPollSelectionTypes}
        selectedId={form.selectionType}
        onSelect={(selectionType) => onChangeForm({selectionType})}
      />
      <SegmentedControl
        items={adminPollChargeTypes}
        selectedId={form.chargeGenerationType}
        onSelect={(chargeGenerationType) =>
          onChangeForm({
            chargeGenerationType,
            paymentCategory: chargeGenerationType === 'NONE' ? 'NONE' : form.paymentCategory,
          })
        }
      />
      <View style={styles.formRow}>
        <TextField
          label="시작 일시"
          onChangeText={(startsAt) => onChangeForm({startsAt})}
          value={form.startsAt}
        />
        <TextField
          label="마감 일시"
          onChangeText={(endsAt) => onChangeForm({endsAt})}
          value={form.endsAt}
        />
      </View>
      {!form.templateId.trim() ? (
        <TextField
          helper="쉼표로 구분합니다. 커피 메뉴는 menu:4 형식으로 입력합니다."
          label="직접 선택지"
          onChangeText={(optionsText) => onChangeForm({optionsText})}
          value={form.optionsText}
        />
      ) : null}
      {form.chargeGenerationType === 'OPTION_PRICE' ? (
        <PaymentAccountPicker
          accounts={accounts}
          category={form.paymentCategory}
          onSelect={(account) =>
            onChangeForm({
              paymentAccountId: String(account.id),
              paymentCategory: account.accountType,
            })
          }
          selectedAccountId={toOptionalPositiveId(form.paymentAccountId)}
        />
      ) : null}
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="익명 투표 여부 전환"
          disabled={busy}
          onPress={() => onChangeForm({isAnonymous: !form.isAnonymous})}
          variant="secondary">
          {form.isAnonymous ? '익명 ON' : '익명 OFF'}
        </Button>
        <Button
          accessibilityLabel="투표 생성 입력 초기화"
          disabled={busy}
          onPress={onReset}
          variant="secondary">
          초기화
        </Button>
      </View>
      {coffeeWarning ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{coffeeWarning}</Text>
        </View>
      ) : null}
      <Button
        accessibilityLabel="투표 생성 실행"
        disabled={busy || coffeeWarning !== null}
        onPress={onCreate}>
        {busy ? '생성 중...' : '생성하기'}
      </Button>
    </Card>
  );
}

function AdminPollTemplatePreview({template}: {template: AdminPollTemplate}) {
  return (
    <Card>
      <Title>{template.title}</Title>
      <View style={styles.chipRow}>
        <Chip label={template.autoCreateEnabled ? '반복 ON' : '반복 OFF'} tone="info" />
        <Chip label={getSelectionTypeLabel(template.selectionType)} tone="default" />
        <Chip label={`${getPollTypeLabel(template.pollType)} 템플릿`} tone="default" />
      </View>
      <Body>{getTemplateScheduleLabel(template)}</Body>
      <Eyebrow>옵션</Eyebrow>
      {template.options.map((option, index) => (
        <ListRow
          key={option.id}
          label={option.content}
          supportingText={option.priceAmount > 0 ? formatWon(option.priceAmount) : ''}
          value={String(index + 1)}
        />
      ))}
      <Eyebrow>생성 규칙</Eyebrow>
      <Body>같은 캠퍼스와 템플릿 주차에는 한 번만 생성되도록 서버 규칙을 따릅니다.</Body>
    </Card>
  );
}

function PaymentAccountPicker({
  accounts,
  category,
  onSelect,
  selectedAccountId,
}: {
  accounts: PaymentAccount[];
  category: PaymentCategory | 'NONE';
  onSelect: (account: PaymentAccount) => void;
  selectedAccountId: number | null;
}) {
  const selectableAccounts = accounts.filter((account) =>
    category === 'NONE' ? true : account.accountType === category,
  );

  return (
    <View style={styles.compactBlock}>
      <Eyebrow>청구 계좌</Eyebrow>
      {selectableAccounts.length === 0 ? (
        <Body>선택할 수 있는 청구 계좌가 없습니다. 정산 화면에서 계좌를 먼저 등록해 주세요.</Body>
      ) : (
        selectableAccounts.map((account) => (
          <ListRow
            accessibilityLabel={`${account.nickname} 청구 계좌 선택`}
            key={account.id}
            label={account.nickname}
            onPress={() => onSelect(account)}
            supportingText={`${getPaymentCategoryLabel(account.accountType)} · ${account.bankName}`}
            value={selectedAccountId === account.id ? '선택됨' : ''}
          />
        ))
      )}
    </View>
  );
}

function AdminPollResultsPanel({
  onLoad,
  onSelectPoll,
  polls,
  selectedPoll,
  state,
}: {
  onLoad: () => void;
  onSelectPoll: (poll: PollSummary) => void;
  polls: PollSummary[];
  selectedPoll: PollSummary | null;
  state: AdminPollResultState;
}) {
  return (
    <>
      <AdminPollPicker polls={polls} selectedPoll={selectedPoll} onSelectPoll={onSelectPoll} />
      <Card>
        <Title>{selectedPoll ? selectedPoll.title : '투표를 선택해 주세요'}</Title>
        <Body>선택지별 응답과 댓글을 함께 확인합니다.</Body>
        <Button
          accessibilityLabel="선택한 투표 결과와 댓글 불러오기"
          disabled={!selectedPoll || state.status === 'loading'}
          onPress={onLoad}>
          결과 조회
        </Button>
      </Card>
      {state.status === 'idle' ? null : state.status === 'loading' ? (
        <Loading message="투표 결과와 댓글을 불러오고 있어요." />
      ) : state.status === 'error' ? (
        <AdminErrorState error={state.error} onRetry={onLoad} />
      ) : (
        <AdminPollResultsBody comments={state.comments} results={state.results} />
      )}
    </>
  );
}

function AdminPollResultsBody({
  comments,
  results,
}: {
  comments: PollComment[];
  results: PollResults;
}) {
  return (
    <>
      <Card>
        <Title>{results.title}</Title>
        <View style={styles.metricGrid}>
          <Metric label="대상" value={`${results.targetMemberCount}명`} />
          <Metric label="응답" value={`${results.respondedCount}명`} />
          <Metric label="미참여" value={`${results.notRespondedCount}명`} />
          <Metric label="상태" value={getPollStatusLabel(results.status)} />
        </View>
        <Body>{formatDateTime(results.endsAt)} 마감 기준 결과입니다.</Body>
      </Card>
      <Card>
        <Eyebrow>선택지별 결과</Eyebrow>
        {results.optionResults.map((option) => (
          <View key={option.id} style={styles.compactBlock}>
            <ListRow
              label={option.content}
              supportingText={
                results.anonymous
                  ? '익명 투표는 응답자 목록을 표시하지 않습니다.'
                  : option.respondents.map((person) => person.name).join(', ') || '응답자 없음'
              }
              value={`${option.responseCount}명`}
            />
          </View>
        ))}
      </Card>
      <Card>
        <Eyebrow>댓글</Eyebrow>
        {comments.length === 0 ? (
          <Body>댓글이 없습니다.</Body>
        ) : (
          comments.map((comment) => (
            <ListRow
              key={comment.commentId}
              label={comment.name}
              supportingText={comment.deleted ? '삭제된 댓글입니다.' : comment.content}
              value={formatDateTime(comment.createdAt)}
            />
          ))
        )}
      </Card>
    </>
  );
}

function AdminPollMissingPanel({
  actionState,
  onLoad,
  onSelectPoll,
  onSendNotification,
  polls,
  selectedPoll,
  state,
}: {
  actionState: AdminPollActionState;
  onLoad: () => void;
  onSelectPoll: (poll: PollSummary) => void;
  onSendNotification: () => void;
  polls: PollSummary[];
  selectedPoll: PollSummary | null;
  state: AdminPollMissingState;
}) {
  const canSend = state.status === 'success' && actionState.status === 'idle';

  return (
    <>
      <AdminPollPicker polls={polls} selectedPoll={selectedPoll} onSelectPoll={onSelectPoll} />
      <Card>
        <Title>{selectedPoll ? `${selectedPoll.title} 미참여자` : '투표를 선택해 주세요'}</Title>
        <Body>아직 응답하지 않은 멤버를 확인하고 알림을 보냅니다.</Body>
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="선택한 투표 미참여자 불러오기"
            disabled={!selectedPoll || state.status === 'loading'}
            onPress={onLoad}>
            미참여자 조회
          </Button>
          <Button
            accessibilityLabel="투표 미참여자에게 알림 발송"
            disabled={!canSend}
            onPress={onSendNotification}
            variant="secondary">
            {actionState.status === 'sendingMissingNotice' ? '발송 중...' : '알림 발송'}
          </Button>
        </View>
      </Card>
      {state.status === 'idle' ? null : state.status === 'loading' ? (
        <Loading message="투표 미참여자를 불러오고 있어요." />
      ) : state.status === 'error' ? (
        <AdminErrorState error={state.error} onRetry={onLoad} />
      ) : state.status === 'empty' ? (
        <Empty
          title="모두 응답했습니다"
          message="현재 참여가 필요한 멤버 중 미참여자가 없습니다."
          actionLabel="다시 조회"
          actionAccessibilityLabel="투표 미참여자 다시 조회"
          onActionPress={onLoad}
        />
      ) : (
        <Card>
          <Eyebrow>미참여자 {state.members.length}명</Eyebrow>
          {state.members.map((member) => (
            <ListRow
              key={member.userId}
              label={member.name}
              supportingText={member.email}
              value="알림"
            />
          ))}
        </Card>
      )}
    </>
  );
}

function AdminPollStatusPanel({
  onSelectPoll,
  polls,
  selectedPoll,
}: {
  onSelectPoll: (poll: PollSummary) => void;
  polls: PollSummary[];
  selectedPoll: PollSummary | null;
}) {
  return (
    <>
      <AdminPollPicker polls={polls} selectedPoll={selectedPoll} onSelectPoll={onSelectPoll} />
      <Card>
        <Title>{selectedPoll ? selectedPoll.title : '투표를 선택해 주세요'}</Title>
        {selectedPoll ? (
          <>
            <View style={styles.metricGrid}>
              <Metric label="현재" value={getPollStatusLabel(selectedPoll.status)} />
              <Metric label="마감" value={formatDateTime(selectedPoll.endsAt)} />
            </View>
            <ListRow
              label="예약"
              supportingText="아직 응답할 수 없는 상태입니다."
              value={selectedPoll.status === 'SCHEDULED' ? '현재' : ''}
            />
            <ListRow
              label="진행"
              supportingText="응답과 댓글 작성이 가능합니다."
              value={selectedPoll.status === 'OPEN' ? '현재' : ''}
            />
            <ListRow
              label="마감"
              supportingText="응답과 댓글 작성이 잠깁니다."
              value={selectedPoll.status === 'CLOSED' ? '현재' : ''}
            />
            <Body>현재 운영 상태와 마감 시간을 확인합니다. 변경이 필요한 경우 정해진 관리 절차에 따라 처리해 주세요.</Body>
          </>
        ) : (
          <Body>상태를 확인할 투표를 선택해 주세요.</Body>
        )}
      </Card>
    </>
  );
}

function AdminPollPicker({
  onSelectPoll,
  polls,
  selectedPoll,
}: {
  onSelectPoll: (poll: PollSummary) => void;
  polls: PollSummary[];
  selectedPoll: PollSummary | null;
}) {
  return (
    <Card>
      <Eyebrow>투표 선택</Eyebrow>
      {polls.length === 0 ? (
        <Body>조회할 투표가 없습니다.</Body>
      ) : (
        polls.map((poll) => (
          <ListRow
            accessibilityLabel={`${poll.title} 투표 선택`}
            key={poll.id}
            label={poll.title}
            onPress={() => onSelectPoll(poll)}
            supportingText={`${getPollTypeLabel(poll.pollType)} · ${formatDateTime(poll.endsAt)} 자동 종료`}
            value={selectedPoll?.id === poll.id ? '선택됨' : getPollStatusLabel(poll.status)}
          />
        ))
      )}
    </Card>
  );
}

function AdminDevotionMissing({
  missingState,
  notificationState,
  onChangeWeek,
  onOpenNotificationConfirm,
  onOpenNotificationLogs,
  onRetry,
  summary,
  weekStartDate,
}: {
  missingState: MissingDevotionState;
  notificationState: NotificationSendState;
  onChangeWeek: (direction: -1 | 1) => void;
  onOpenNotificationConfirm: (targets: AdminMissingDevotionMember[]) => void;
  onOpenNotificationLogs: (requestId: string) => void;
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
        <Eyebrow>경건 현황</Eyebrow>
        <Title>경건 제출 현황</Title>
        <Body>
          {weekStartDate} 주차 기준으로 아직 경건생활을 제출하지 않은 활성 멤버를 조회합니다.
        </Body>
        <View style={styles.metricGrid}>
          <Metric label="선택 주차" value={formatShortWeekLabel(weekStartDate)} />
          <Metric label="미제출" value={`${missingCount}명`} />
          <Metric
            label="제출률"
            value={selectedWeekMatchesSummary ? `${summary.devotion.submitRate}%` : '조회 후 확인'}
          />
          <Metric label="조회" value="미제출자" />
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
      {renderNotificationResult(notificationState, onOpenNotificationLogs)}
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
              <Eyebrow>미제출자 목록</Eyebrow>
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
          {member.region} {member.campusName} · 멤버 ID {member.campusMemberId}
        </Text>
        <Text style={styles.memberMeta}>{member.email}</Text>
      </View>
      <Chip label={`사용자 ID ${member.userId}`} tone="info" />
    </View>
  );
}

function AdminNotificationLogs({
  filters,
  onChangeFilter,
  onChangePage,
  onClearFilters,
  onRetry,
  onSearch,
  onSelectLog,
  selectedLogId,
  state,
}: {
  filters: NotificationLogFilters;
  onChangeFilter: <K extends keyof NotificationLogFilters>(
    key: K,
    value: NotificationLogFilters[K],
  ) => void;
  onChangePage: (direction: -1 | 1) => void;
  onClearFilters: () => void;
  onRetry: () => void;
  onSearch: () => void;
  onSelectLog: (logId: number | null) => void;
  selectedLogId: number | null;
  state: NotificationLogState;
}) {
  const logs = state.status === 'success' || state.status === 'empty' ? state.logs : null;
  const selectedLog =
    selectedLogId && logs
      ? logs.items.find((log) => log.notificationLogId === selectedLogId) ?? null
      : null;
  const counts = getNotificationStatusCounts(logs?.items ?? []);
  const loading = state.status === 'loading';

  return (
    <>
      <Card>
        <Eyebrow>알림 로그</Eyebrow>
        <Title>알림 로그</Title>
        <Body>
          발송 요청과 상태를 확인하고, 발송 전 대상 확인 결과와 요청 ID를 연결해 추적합니다.
        </Body>
        <View style={styles.metricGrid}>
          <Metric label="SENT" value={`${counts.SENT}건`} />
          <Metric label="FAILED" value={`${counts.FAILED}건`} />
          <Metric label="SKIPPED" value={`${counts.SKIPPED}건`} />
          <Metric label="PENDING" value={`${counts.PENDING}건`} />
        </View>
      </Card>
      <Card>
        <Eyebrow>필터</Eyebrow>
        <SegmentedControl
          items={notificationStatusFilters}
          selectedId={filters.sendStatus}
          onSelect={(sendStatus) => onChangeFilter('sendStatus', sendStatus)}
        />
        <SegmentedControl
          items={notificationTypeFilters}
          selectedId={filters.notificationType}
          onSelect={(notificationType) => onChangeFilter('notificationType', notificationType)}
        />
        <View style={styles.filterGrid}>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="알림 로그 요청 ID 필터"
              label="요청 ID"
              onChangeText={(requestId) => onChangeFilter('requestId', requestId)}
              placeholder="notificationRequestId"
              returnKeyType="search"
              value={filters.requestId}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="알림 로그 대상 ID 필터"
              keyboardType="number-pad"
              label="대상 ID"
              onChangeText={(targetId) => onChangeFilter('targetId', targetId)}
              placeholder="숫자 ID"
              value={filters.targetId}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="알림 로그 대상 주차 필터"
              label="대상 주차"
              onChangeText={(targetWeekStartDate) =>
                onChangeFilter('targetWeekStartDate', targetWeekStartDate)
              }
              placeholder="YYYY-MM-DD"
              value={filters.targetWeekStartDate}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="알림 로그 시작일 필터"
              label="시작일"
              onChangeText={(startDate) => onChangeFilter('startDate', startDate)}
              placeholder="YYYY-MM-DD"
              value={filters.startDate}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="알림 로그 종료일 필터"
              label="종료일"
              onChangeText={(endDate) => onChangeFilter('endDate', endDate)}
              placeholder="YYYY-MM-DD"
              value={filters.endDate}
            />
          </View>
        </View>
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="알림 로그 필터로 검색"
            disabled={loading}
            onPress={onSearch}>
            조회
          </Button>
          <Button
            accessibilityLabel="알림 로그 필터 초기화"
            disabled={loading}
            onPress={onClearFilters}
            variant="secondary">
            초기화
          </Button>
        </View>
      </Card>
      {selectedLog ? (
        <AdminNotificationLogDetail log={selectedLog} onBack={() => onSelectLog(null)} />
      ) : (
        <>
          <AdminNotificationSendResultSummary filters={filters} logs={logs} />
          <AdminNotificationLogBody
            filters={filters}
            onChangePage={onChangePage}
            onRetry={onRetry}
            onSelectLog={onSelectLog}
            state={state}
          />
        </>
      )}
    </>
  );
}

function AdminNotificationSendResultSummary({
  filters,
  logs,
}: {
  filters: NotificationLogFilters;
  logs: AdminNotificationLogList | null;
}) {
  const counts = getNotificationStatusCounts(logs?.items ?? []);

  return (
    <Card>
      <Eyebrow>발송 결과</Eyebrow>
      <Title>{filters.requestId.trim() ? '요청 ID 발송 결과' : '현재 필터 결과'}</Title>
      <Body>
        {filters.requestId.trim()
          ? `${filters.requestId.trim()} 요청 묶음의 현재 페이지 결과입니다.`
          : '요청 ID를 입력하거나 발송 결과의 로그 보기에서 요청 묶음별 결과를 확인할 수 있습니다.'}
      </Body>
      <View style={styles.metricGrid}>
        <Metric label="SENT" value={`${counts.SENT}건`} />
        <Metric label="FAILED" value={`${counts.FAILED}건`} />
        <Metric label="SKIPPED" value={`${counts.SKIPPED}건`} />
        <Metric label="PENDING" value={`${counts.PENDING}건`} />
      </View>
    </Card>
  );
}

function AdminNotificationLogBody({
  filters,
  onChangePage,
  onRetry,
  onSelectLog,
  state,
}: {
  filters: NotificationLogFilters;
  onChangePage: (direction: -1 | 1) => void;
  onRetry: () => void;
  onSelectLog: (logId: number) => void;
  state: NotificationLogState;
}) {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return <Loading message="알림 로그를 조회하고 있어요." />;
    case 'empty':
      return (
        <Empty
          title="알림 로그가 없습니다"
          message="요청 ID, 발송 상태, 날짜 필터를 조정해 주세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="알림 로그 empty state에서 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return <AdminErrorState error={state.error} onRetry={onRetry} />;
    case 'success':
      return (
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Eyebrow>로그 목록</Eyebrow>
              <Title>
                {state.logs.totalElements}건 중 {state.logs.items.length}건
              </Title>
              <Body>
                {state.logs.page + 1}/{Math.max(state.logs.totalPages, 1)} 페이지 · 최신순
              </Body>
            </View>
          </View>
          {state.logs.items.map((log) => (
            <AdminNotificationLogRow
              key={log.notificationLogId}
              log={log}
              onPress={() => onSelectLog(log.notificationLogId)}
            />
          ))}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="이전 알림 로그 페이지"
              disabled={state.logs.page <= 0}
              onPress={() => onChangePage(-1)}
              variant="secondary">
              이전
            </Button>
            <Button
              accessibilityLabel="다음 알림 로그 페이지"
              disabled={state.logs.totalPages === 0 || filters.page >= state.logs.totalPages - 1}
              onPress={() => onChangePage(1)}
              variant="secondary">
              다음
            </Button>
          </View>
        </Card>
      );
    default:
      return assertNever(state);
  }
}

function AdminNotificationLogRow({
  log,
  onPress,
}: {
  log: AdminNotificationLog;
  onPress: () => void;
}) {
  return (
    <View style={styles.roleRow}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.memberName}>{log.title}</Text>
          <Text style={styles.memberMeta}>
            {log.name} · 사용자 ID {log.userId} · {formatDateTime(log.createdAt)}
          </Text>
          <Text style={styles.memberMeta} numberOfLines={2}>
            {log.body}
          </Text>
        </View>
        <Chip label={getNotificationStatusLabel(log.sendStatus)} tone={getNotificationStatusTone(log.sendStatus)} />
      </View>
      {log.failureReason ? (
        <AdminInlineError
          error={{
            kind: log.sendStatus === 'FAILED' ? 'error' : 'conflict',
            message: log.failureReason,
          }}
        />
      ) : null}
      <ListRow
        accessibilityLabel={`알림 로그 ${log.notificationLogId} 상세 보기`}
        label="요청 ID"
        onPress={onPress}
        supportingText={log.requestId}
        value="상세"
      />
    </View>
  );
}

function AdminNotificationLogDetail({
  log,
  onBack,
}: {
  log: AdminNotificationLog;
  onBack: () => void;
}) {
  return (
    <>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Eyebrow>알림 상세</Eyebrow>
            <Title>{log.title}</Title>
            <Body>{formatDateTime(log.createdAt)} 생성된 알림 로그입니다.</Body>
          </View>
          <Chip label={getNotificationStatusLabel(log.sendStatus)} tone={getNotificationStatusTone(log.sendStatus)} />
        </View>
        <ListRow label="요청 ID" supportingText={log.requestId} value={`로그 ID ${log.notificationLogId}`} />
        <ListRow label="대상" supportingText={log.email} value={`${log.name} · 사용자 ID ${log.userId}`} />
        <ListRow label="유형" supportingText={log.notificationType} value={`캠퍼스 ID ${log.campusId}`} />
        <ListRow
          label="대상 리소스"
          supportingText={`주차 ${log.targetWeekStartDate ?? '-'} · 대상 ID ${log.targetId ?? '-'}`}
        />
        <ListRow label="본문" supportingText={log.body} />
        <ListRow label="발송 시각" value={log.sentAt ? formatDateTime(log.sentAt) : '-'} />
        <ListRow
          label="실패 사유"
          supportingText={log.failureReason ?? '실패 또는 스킵 사유가 없습니다.'}
        />
        <Button accessibilityLabel="알림 로그 상세 닫기" onPress={onBack} variant="secondary">
          목록으로
        </Button>
      </Card>
      <Card>
        <Eyebrow>대상 미리보기</Eyebrow>
        <Title>{log.name}</Title>
        <Body>
          발송 로그에 저장된 대상 정보를 기준으로 미리보기를 제공합니다.
        </Body>
        <ListRow label="대상 이메일" supportingText={log.email} value={`사용자 ID ${log.userId}`} />
        <ListRow label="요청 ID" supportingText={log.requestId} />
      </Card>
    </>
  );
}

function renderNotificationResult(
  notificationState: NotificationSendState,
  onOpenNotificationLogs: (requestId: string) => void,
) {
  switch (notificationState.status) {
    case 'idle':
    case 'confirming':
      return null;
    case 'sending':
      return <Loading message="알림 발송 요청을 처리하고 있어요." />;
    case 'sent':
      return (
        <Card>
          <Eyebrow>발송 요청 완료</Eyebrow>
          <Title>알림 발송 요청이 접수되었습니다</Title>
          <View style={styles.metricGrid}>
            <Metric label="확인 대상" value={`${notificationState.targetCount}명`} />
            <Metric label="큐잉" value={`${notificationState.result.queuedCount}명`} />
            <Metric label="스킵" value={`${notificationState.result.skippedCount}명`} />
          </View>
          <ListRow
            label="요청 ID"
            supportingText="로그에서 같은 요청 묶음으로 확인할 수 있습니다."
            value={notificationState.result.notificationRequestId}
          />
          <Button
            accessibilityLabel="발송 요청 ID로 알림 로그 보기"
            onPress={() => onOpenNotificationLogs(notificationState.result.notificationRequestId)}>
            로그 보기
          </Button>
        </Card>
      );
    case 'failed':
      return (
        <Card>
          <Eyebrow>발송 요청 실패</Eyebrow>
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
        <Eyebrow>기도제목 운영</Eyebrow>
        <Title>기도제목 시즌/조 관리</Title>
        <Body>
          시즌 생성, 조 편집, 조원 배정, 주간 제출 현황을 한 화면에서 관리합니다.
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
      return <Loading message="기도제목 주간 현황을 불러오고 있어요." />;
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
            <Eyebrow>기도조 관리</Eyebrow>
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
                        기도조 ID {group.groupId} · 정렬 순서 {group.sortOrder}
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
                            ? `작성 시각 ${formatDateTime(member.submittedAt)}`
                            : '미작성'
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
      <Eyebrow>주간 제출 현황</Eyebrow>
      <Title>기도제목 주간 현황</Title>
      <Body>
        선택한 주차의 기도조별 작성 현황을 기준으로 제출률을 확인합니다.
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
      <Eyebrow>기도 시즌</Eyebrow>
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
            label="시작일"
            onChangeText={(startDate) => onChangeForm({startDate})}
            placeholder="YYYY-MM-DD"
            value={form.startDate}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="종료할 기도 시즌 ID"
            keyboardType="number-pad"
            label="시즌 ID"
            onChangeText={(seasonId) => onChangeForm({seasonId: seasonId.replace(/\D/g, '')})}
            placeholder="종료/조 생성에 사용"
            value={form.seasonId}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="기도 시즌 종료일"
            label="종료일"
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
      <Eyebrow>기도조 편집</Eyebrow>
      <Title>{form.groupId ? '기도조 수정' : '기도조 생성'}</Title>
      <View style={styles.filterGrid}>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="기도조 시즌 ID"
            keyboardType="number-pad"
            label="시즌 ID"
            onChangeText={(seasonId) => onChangeForm({seasonId: seasonId.replace(/\D/g, '')})}
            placeholder="필수"
            value={form.seasonId}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            accessibilityLabel="수정할 기도조 ID"
            keyboardType="number-pad"
            label="기도조 ID"
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
            label="정렬 순서"
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
      <Eyebrow>조원 배정</Eyebrow>
      <Title>조 멤버 전체 교체</Title>
      <Body>
        입력한 사용자 ID만 조원으로 남기고 빠진 멤버는 배정에서 제외합니다. 빈 값으로 저장하면 빈 조 상태가 됩니다.
      </Body>
      <TextField
        accessibilityLabel="기도조 멤버 배정 기도조 ID"
        keyboardType="number-pad"
        label="기도조 ID"
        onChangeText={(groupId) => onChangeForm({groupId: groupId.replace(/\D/g, '')})}
        placeholder="필수"
        value={form.groupId}
      />
      <TextField
        accessibilityLabel="기도조 멤버 사용자 ID 목록"
        helper="쉼표, 공백, 줄바꿈으로 구분합니다. 예: 98, 99, 100"
        label="사용자 ID 목록"
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
        <Text style={styles.confirmTargetText}>활성 멤버 사용자 ID 참고</Text>
        {members.slice(0, 8).map((member) => (
          <Text key={member.userId} style={styles.confirmTargetText}>
            {member.name} · 사용자 ID {member.userId}
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
  onSelectPaymentAccount,
  onUpdateFilter,
  paymentAccountForm,
  paymentAccountState,
  penaltyRuleForm,
  penaltyRuleState,
  section,
  selectedPaymentAccount,
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
  onSelectPaymentAccount: (account: PaymentAccount | null) => void;
  onUpdateFilter: <Key extends keyof AdminChargeFilters>(
    key: Key,
    value: AdminChargeFilters[Key],
  ) => void;
  paymentAccountForm: PaymentAccountForm;
  paymentAccountState: PaymentAccountState;
  penaltyRuleForm: PenaltyRuleForm;
  penaltyRuleState: PenaltyRuleState;
  section: AdminSettlementSection;
  selectedPaymentAccount: PaymentAccount | null;
  settlementState: AdminSettlementState;
}) {
  const busy = actionState.status !== 'idle';

  return (
    <>
      <FigmaSegmentedControl
        items={settlementSections}
        selectedId={section}
        onSelect={onChangeSection}
      />
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
          onBackToList={() => onSelectPaymentAccount(null)}
          onRequestDeactivate={onRequestDeactivatePaymentAccount}
          onRetry={onRetryPaymentAccounts}
          onSave={onSavePaymentAccount}
          onSelectAccount={onSelectPaymentAccount}
          selectedAccount={selectedPaymentAccount}
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
      <View style={styles.figmaFormCard}>
        <Text style={styles.figmaScreenTitle}>정산 관리</Text>
        <FigmaSegmentedControl
          items={chargeStatusFilters}
          selectedId={filters.status}
          onSelect={(status) => onUpdateFilter('status', status)}
        />
        <FigmaSegmentedControl
          items={paymentCategoryFilters}
          selectedId={filters.paymentCategory}
          onSelect={(paymentCategory) => onUpdateFilter('paymentCategory', paymentCategory)}
        />
        <View style={styles.filterGrid}>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="정산 이름 또는 이메일 검색어"
              label="회원 검색"
              onChangeText={(keyword) => onUpdateFilter('keyword', keyword)}
              onSubmitEditing={onSearch}
              placeholder="이름 또는 이메일"
              returnKeyType="search"
              value={filters.keyword}
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
      </View>
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
  onBackToList,
  onRequestDeactivate,
  onRetry,
  onSave,
  onSelectAccount,
  selectedAccount,
  state,
}: {
  busy: boolean;
  form: PaymentAccountForm;
  onChangeForm: (patch: Partial<PaymentAccountForm>) => void;
  onBackToList: () => void;
  onRequestDeactivate: (account: PaymentAccount) => void;
  onRetry: () => void;
  onSave: () => void;
  onSelectAccount: (account: PaymentAccount) => void;
  selectedAccount: PaymentAccount | null;
  state: PaymentAccountState;
}) {
  if (selectedAccount) {
    return (
      <PaymentAccountDetail
        account={selectedAccount}
        busy={busy}
        onBack={onBackToList}
        onRequestDeactivate={onRequestDeactivate}
      />
    );
  }

  return (
    <>
      {renderPaymentAccountList({busy, onRetry, onSelectAccount, state})}
      <View style={styles.figmaFormCard}>
        <Text style={styles.figmaScreenTitle}>계좌 등록</Text>
        <FigmaSegmentedControl
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
        </View>
        <Button
          accessibilityLabel="관리자 납부 계좌 등록"
          disabled={busy}
          onPress={onSave}>
          {busy ? '저장 중...' : '계좌 저장'}
        </Button>
      </View>
    </>
  );
}

function PaymentAccountDetail({
  account,
  busy,
  onBack,
  onRequestDeactivate,
}: {
  account: PaymentAccount;
  busy: boolean;
  onBack: () => void;
  onRequestDeactivate: (account: PaymentAccount) => void;
}) {
  return (
    <>
      <View style={styles.figmaHeroCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.figmaScreenTitle}>{account.nickname}</Text>
            <Text style={styles.accountNumber}>{account.accountNumber}</Text>
          </View>
          <Chip label={getPaymentCategoryLabel(account.accountType)} tone="info" />
        </View>
        <Text style={styles.figmaBodyText}>
          {account.bankName} · {account.accountHolder}
        </Text>
      </View>
      <View style={styles.figmaListStack}>
        <Text style={styles.sectionTitle}>최근 청구</Text>
        <View style={styles.figmaListItem}>
          <View style={styles.figmaListText}>
            <Text style={styles.figmaCardTitle}>연결된 청구 내역</Text>
            <Text style={styles.figmaBodyText}>청구 내역은 회원별 정산 상세에서 확인해 주세요</Text>
          </View>
          <Chip label="대기" tone="warning" />
        </View>
      </View>
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel={`${account.nickname} 계좌 비활성화 확인 열기`}
          disabled={busy}
          onPress={() => onRequestDeactivate(account)}
          variant="danger">
          비활성화
        </Button>
        <Button accessibilityLabel="납부 계좌 목록으로 돌아가기" onPress={onBack} variant="secondary">
          목록
        </Button>
      </View>
    </>
  );
}

function renderPaymentAccountList({
  busy,
  onRetry,
  onSelectAccount,
  state,
}: {
  busy: boolean;
  onRetry: () => void;
  onSelectAccount: (account: PaymentAccount) => void;
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
          <View style={styles.figmaHeroCard}>
            <Text style={styles.figmaHeroLabel}>활성 납부 계좌</Text>
            <View style={styles.figmaHeroRow}>
              <Text style={styles.figmaHeroCount}>{state.accounts.length}개</Text>
              <Text style={styles.figmaActionPill}>관리</Text>
            </View>
          </View>
          {state.accounts.map((account) => (
            <View key={account.id} style={styles.figmaListItem}>
              <View style={styles.figmaIconBox}>
                <Text style={styles.figmaIconText}>●</Text>
              </View>
              <View style={styles.figmaListContent}>
                <View style={styles.figmaListText}>
                  <Text style={styles.figmaCardTitle}>{account.nickname}</Text>
                  <Text style={styles.figmaBodyText}>
                    {getPaymentCategoryLabel(account.accountType)} · {account.bankName}
                  </Text>
                </View>
                <Button
                  accessibilityLabel={`${account.nickname} 계좌 상세 보기`}
                  disabled={busy}
                  onPress={() => onSelectAccount(account)}
                  variant="secondary">
                  상세
                </Button>
              </View>
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
      <View style={styles.figmaListStack}>
        <Text style={styles.figmaScreenTitle}>벌금 규칙</Text>
        {renderPenaltyRuleList({busy, onEdit, onRetry, state})}
      </View>
      <View style={styles.figmaFormCard}>
        <Text style={styles.figmaScreenTitle}>{form.ruleId === null ? '규칙 등록' : '규칙 수정'}</Text>
        {form.ruleId === null ? (
          <>
            <FigmaSegmentedControl
              items={penaltyRuleTypeOptions}
              selectedId={form.ruleType}
              onSelect={(ruleType) => onChangeForm({ruleType})}
            />
            <FigmaSegmentedControl
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
              label="필수 횟수"
              onChangeText={(requiredCount) => onChangeForm({requiredCount: requiredCount.replace(/\D/g, '')})}
              placeholder="0 이상"
              value={form.requiredCount}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="벌금 규칙 기본 금액"
              keyboardType="number-pad"
              label="기본 금액"
              onChangeText={(baseAmount) => onChangeForm({baseAmount: baseAmount.replace(/\D/g, '')})}
              placeholder="0 이상"
              value={form.baseAmount}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="벌금 규칙 단위당 금액"
              keyboardType="number-pad"
              label="단위당 금액"
              onChangeText={(amountPerUnit) => onChangeForm({amountPerUnit: amountPerUnit.replace(/\D/g, '')})}
              placeholder="0 이상"
              value={form.amountPerUnit}
            />
          </View>
        </View>
        {form.ruleId !== null ? (
          <FigmaSegmentedControl
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
      </View>
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
            <View key={rule.id} style={styles.figmaListItem}>
              <View style={styles.figmaIconBox}>
                <Text style={styles.figmaIconText}>●</Text>
              </View>
              <View style={styles.figmaListContent}>
                <View style={styles.figmaListText}>
                  <Text style={styles.figmaCardTitle}>{getPenaltyRuleTypeLabel(rule.ruleType)}</Text>
                  <Text style={styles.figmaBodyText}>
                    {getPenaltyRuleSummary(rule)}
                  </Text>
                </View>
                <Button
                  accessibilityLabel={`${getPenaltyRuleTypeLabel(rule.ruleType)} 벌금 규칙 수정`}
                  disabled={busy}
                  onPress={() => onEdit(rule)}
                  variant="secondary">
                  수정
                </Button>
              </View>
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
            message="상태, 유형, 검색어 필터를 조정해 주세요."
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
          <View style={styles.figmaListStack}>
            {settlementState.charges.members.map((member) => (
              <SettlementMemberRow
                key={member.userId}
                member={member}
                onPress={() => onOpenMemberCharges(member)}
              />
            ))}
          </View>
        </>
      );
    default:
      return assertNever(settlementState);
  }
}

function SettlementSummaryCard({charges}: {charges: AdminCampusChargeSummary}) {
  return (
    <View style={styles.figmaHeroCard}>
      <Text style={styles.figmaHeroLabel}>이번 달 총 미납</Text>
      <View style={styles.figmaHeroRow}>
        <Text style={styles.figmaHeroAmount}>{formatWon(charges.summary.unpaidAmount)}</Text>
        <Text style={styles.figmaDangerPill}>미납 알림</Text>
      </View>
      <Text style={styles.figmaHeroMeta}>
        {charges.region} {charges.campusName} · 총 {formatWon(charges.summary.totalAmount)}
      </Text>
    </View>
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
      style={({pressed}) => [styles.figmaListItem, pressed ? styles.pressed : null]}>
      <View style={styles.figmaIconBox}>
        <Text style={styles.figmaIconText}>{member.unpaidAmount > 0 ? '○' : '✓'}</Text>
      </View>
      <View style={styles.figmaListContent}>
        <View style={styles.figmaListText}>
          <Text style={styles.figmaCardTitle}>{member.name}</Text>
          <Text style={styles.figmaBodyText}>
            {member.unpaidAmount > 0
              ? `미납 ${formatWon(member.unpaidAmount)} · 납부 ${formatWon(member.paidAmount)}`
              : `납부 완료 ${formatWon(member.paidAmount)}`}
          </Text>
        </View>
        <Text style={styles.figmaActionPill}>상세</Text>
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
          message="정산 목록에서 회원을 선택하면 청구 상세와 상태 변경 액션을 보여줍니다."
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
      <View style={styles.figmaHeroCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.figmaScreenTitle}>{charges.name}</Text>
            <Text style={styles.figmaBodyText}>
              총 미납 {formatWon(charges.summary.unpaidAmount)} · 사용자가 직접 납부 완료 처리
            </Text>
          </View>
          <Button accessibilityLabel="정산 집계로 돌아가기" onPress={onBackToSummary} variant="ghost">
            목록
          </Button>
        </View>
      </View>
      {charges.items.length === 0 ? (
        <Empty title="청구 항목이 없습니다" message="선택한 필터에 맞는 회원별 청구 상세가 없습니다." />
      ) : (
        <View style={styles.figmaListStack}>
          <Text style={styles.sectionTitle}>청구 항목</Text>
          {charges.items.map((charge) => (
            <ChargeItemRow
              busy={busy}
              charge={charge}
              key={charge.id}
              onBlockedPaid={() => onBlockedPaid(charge)}
              onRequestStatusChange={(status) => onRequestStatusChange(charge, status)}
            />
          ))}
        </View>
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
    <View style={styles.figmaChargeItem}>
      <View style={styles.figmaIconBox}>
        <Text style={styles.figmaIconText}>{getChargeIcon(charge)}</Text>
      </View>
      <View style={styles.figmaListContent}>
        <View style={styles.figmaListText}>
          <Text style={styles.figmaCardTitle}>{charge.title}</Text>
          <Text style={styles.figmaBodyText}>
            {getChargeStatusLabel(charge.status)} · {getChargeDescription(charge)}
          </Text>
        </View>
        <Chip label={formatWon(charge.amount)} tone={getChargeStatusTone(charge.status)} />
      </View>
      {charge.account ? (
        <Text style={styles.accountMeta}>
          {charge.account.bankName} · {charge.account.accountHolder}
        </Text>
      ) : null}
      <View style={styles.roleGrid}>
        {adminWritableChargeStatuses.map((status) => (
          <Button
            accessibilityLabel={`${charge.title} 상태를 ${getChargeStatusLabel(status)}로 변경 확인`}
            disabled={busy || charge.status === status}
            key={status}
            onPress={() => onRequestStatusChange(status)}
            variant={status === 'CANCELED' ? 'danger' : 'secondary'}>
            {getChargeStatusLabel(status)}
          </Button>
        ))}
        <Button
          accessibilityLabel={`${charge.title} 납부 완료 직접 변경 불가 안내`}
          disabled={busy}
          onPress={onBlockedPaid}
          variant="ghost">
          납부 완료
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
          <Eyebrow>멤버 관리</Eyebrow>
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
        <Eyebrow>멤버 상세</Eyebrow>
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
          <Chip label={`캠퍼스 권한 ${member.campusRole}`} tone="info" />
          <Chip label={member.status} tone={member.status === 'ACTIVE' ? 'success' : 'warning'} />
        </View>
        <ListRow label="현재 로그인 전체 권한" value={globalRole} />
        <ListRow label="현재 로그인 캠퍼스 권한" value={selectedCampusRole} />
        <Body>이 화면의 역할 변경은 캠퍼스 권한만 변경하며, 전체 권한은 Service ADMIN 영역과 분리합니다.</Body>
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
        <Body>멤버 비활성화는 기록을 삭제하지 않고 캠퍼스 멤버십 상태만 비활성으로 바꿉니다.</Body>
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
        <Eyebrow>역할 관리</Eyebrow>
        <Title>역할 관리</Title>
        <Body>
          캠퍼스 관리자 {adminCount}명. 현재 계정은 전체 권한 {globalRole}, 캠퍼스 권한 {selectedCampusRole}입니다.
        </Body>
        <Body>전체 권한 변경은 이 화면에서 하지 않습니다. 권한 위계 위반은 서버 403 UX로 분리합니다.</Body>
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
          <Eyebrow>알림 발송 확인</Eyebrow>
          <Title>{targets.length}명에게 경건 알림을 보낼까요?</Title>
          <Body>
            {weekStartDate} 주차 미제출자에게 경건생활 제출 알림을 발송합니다.
          </Body>
          <ListRow label="제목" value="경건생활 제출 알림" />
          <ListRow label="본문" supportingText="이번 주 경건생활을 제출해 주세요." />
          <View style={styles.confirmTargetList}>
            {targets.slice(0, 4).map((target) => (
              <Text key={target.userId} style={styles.confirmTargetText}>
                {target.name} · 사용자 ID {target.userId}
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
          <Title>
            {target
              ? `${target.charge.title}을 ${getChargeStatusLabel(target.status)} 처리할까요?`
              : '청구 상태 변경'}
          </Title>
          <Body>
            관리자 화면에서는 면제, 취소, 미납 복구만 처리할 수 있습니다. 납부 완료는 사용자가 직접 처리합니다.
          </Body>
          {target ? (
            <>
              <ListRow label="현재 상태" value={getChargeStatusLabel(target.charge.status)} />
              <ListRow label="변경 상태" value={getChargeStatusLabel(target.status)} />
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
          <Title>관리자는 납부 완료로 직접 변경할 수 없어요</Title>
          <Body>
            납부 완료는 사용자가 본인 화면에서 처리합니다. 관리자는 면제, 취소, 미납 복구만 진행할 수 있습니다.
          </Body>
          {charge ? (
            <ListRow
              label={charge.title}
              supportingText={`현재 상태 ${getChargeStatusLabel(charge.status)}`}
              value={formatWon(charge.amount)}
            />
          ) : null}
          <Button accessibilityLabel="납부 완료 직접 변경 불가 안내 닫기" onPress={onClose}>
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
          <Title>{account ? `${account.nickname} 계좌를 비활성화할까요?` : '계좌 비활성화'}</Title>
          <Body>
            기존 미납 청구는 유지됩니다. 다음 정산 전에 새 활성 계좌 연결 상태를 확인해 주세요.
          </Body>
          {account ? (
            <>
              <ListRow label="계좌 유형" value={getPaymentCategoryLabel(account.accountType)} />
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
          <Eyebrow>시즌 종료 확인</Eyebrow>
          <Title>{target ? `시즌 ID ${target.seasonId}을 종료할까요?` : '기도 시즌 종료'}</Title>
          <Body>
            종료 후 해당 시즌은 CLOSED 상태가 됩니다. active season 중복 생성 409를 풀기 위한 위험 액션이라 확인 후 실행합니다.
          </Body>
          {target ? (
            <>
              <ListRow label="시즌 ID" value={String(target.seasonId)} />
              <ListRow label="종료일" value={target.endDate} />
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

function FigmaSegmentedControl<T extends string>({
  items,
  onSelect,
  selectedId,
}: {
  items: Array<{id: T; label: string}>;
  onSelect: (id: T) => void;
  selectedId: T;
}) {
  return (
    <View style={styles.figmaSegmented}>
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
              styles.figmaSegment,
              active ? styles.figmaSegmentActive : null,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[styles.figmaSegmentText, active ? styles.figmaSegmentTextActive : null]}>
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
  const presentation = getApiErrorPresentation(error, {
    conflictTitle: '최신 상태 확인이 필요합니다',
    conflictMessage: '관리자 작업 대상의 최신 상태와 충돌했습니다. 다시 불러온 뒤 시도해 주세요.',
    permissionTitle: '관리자 권한이 필요합니다',
    permissionMessage: '현재 계정 권한으로는 이 관리자 작업을 진행할 수 없습니다.',
    defaultTitle: '관리자 정보를 불러오지 못했습니다',
  });

  switch (error.kind) {
    case 'permissionDenied':
      return (
        <PermissionDenied
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="관리자 권한 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'conflict':
      return (
        <Conflict
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="관리자 충돌 오류 후 다시 불러오기"
          onActionPress={onRetry}
        />
      );
    case 'offline':
      return (
        <Offline
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="관리자 네트워크 오류 후 다시 시도"
          onActionPress={onRetry}
        />
      );
    case 'sessionExpired':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
          actionAccessibilityLabel="세션 만료 후 앱 상태 다시 확인"
          onActionPress={onRetry}
        />
      );
    case 'error':
      return (
        <ErrorState
          title={presentation.title}
          message={presentation.message}
          actionLabel={presentation.actionLabel}
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

function getAdminActionErrorMessage(error: ApiError) {
  switch (error.kind) {
    case 'permissionDenied':
      return '권한이 부족합니다. 같은 단계 이상의 캠퍼스 권한 변경이나 멤버 비활성화는 서버가 403으로 거부할 수 있습니다.';
    case 'conflict':
      return '최신 상태와 충돌했습니다. 다시 불러온 뒤 시도해 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'error':
      return getApiErrorPresentation(error).message;
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

function toAdminPollTemplateFormRequest(
  form: AdminPollTemplateForm,
): AdminPollTemplateRequest {
  return {
    title: form.title,
    pollType: form.pollType,
    selectionType: form.selectionType,
    chargeGenerationType: form.chargeGenerationType,
    paymentCategory: form.paymentCategory === 'NONE' ? null : form.paymentCategory,
    paymentAccountId: parseNullablePositiveInt(form.paymentAccountId),
    autoCreateEnabled: form.autoCreateEnabled,
    startDayOfWeek: parseRequiredPositiveInt(form.startDayOfWeek, 'startDayOfWeek'),
    startTime: form.startTime,
    endDayOfWeek: parseRequiredPositiveInt(form.endDayOfWeek, 'endDayOfWeek'),
    endTime: form.endTime,
    options: parseAdminPollOptionsText(form.optionsText),
  };
}

function toAdminPollCreateFormRequest(form: AdminPollCreateForm): AdminPollCreateRequest {
  const templateId = parseNullablePositiveInt(form.templateId);

  return {
    templateId,
    title: form.title,
    pollType: form.pollType,
    selectionType: form.selectionType,
    isAnonymous: form.isAnonymous,
    chargeGenerationType: form.chargeGenerationType,
    paymentCategory: form.paymentCategory === 'NONE' ? null : form.paymentCategory,
    paymentAccountId: parseNullablePositiveInt(form.paymentAccountId),
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    options: templateId === null ? parseAdminPollOptionsText(form.optionsText) : [],
  };
}

function toTemplateForm(template: AdminPollTemplate): AdminPollTemplateForm {
  return {
    autoCreateEnabled: template.autoCreateEnabled,
    chargeGenerationType:
      template.chargeGenerationType === 'OPTION_PRICE' ? 'OPTION_PRICE' : 'NONE',
    endDayOfWeek: String(template.endDayOfWeek),
    endTime: template.endTime,
    optionsText: formatPollOptionsText(template.options),
    paymentAccountId: template.paymentAccountId ? String(template.paymentAccountId) : '',
    paymentCategory:
      template.paymentCategory === 'PENALTY' || template.paymentCategory === 'COFFEE'
        ? template.paymentCategory
        : 'NONE',
    pollType: toKnownAdminPollType(template.pollType),
    selectionType: template.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE',
    startDayOfWeek: String(template.startDayOfWeek),
    startTime: template.startTime,
    templateId: template.id,
    title: template.title,
  };
}

function toPollCreateForm(poll: AdminPoll): AdminPollCreateForm {
  return {
    chargeGenerationType: poll.chargeGenerationType === 'OPTION_PRICE' ? 'OPTION_PRICE' : 'NONE',
    endsAt: poll.endsAt,
    isAnonymous: poll.isAnonymous,
    optionsText: formatPollOptionsText(poll.options),
    paymentAccountId: poll.paymentAccountId ? String(poll.paymentAccountId) : '',
    paymentCategory:
      poll.paymentCategory === 'PENALTY' || poll.paymentCategory === 'COFFEE'
        ? poll.paymentCategory
        : 'NONE',
    pollType: toKnownAdminPollType(poll.pollType),
    selectionType: poll.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE',
    startsAt: poll.startsAt,
    templateId: poll.templateId ? String(poll.templateId) : '',
    title: poll.title,
  };
}

function parseAdminPollOptionsText(value: string): AdminPollTemplateOptionRequest[] {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new FaithLogApiError({kind: 'error', message: '선택지를 입력해 주세요.'});
  }

  return parts.map((part, index) => {
    if (/^menu:\d+$/i.test(part)) {
      return {
        content: null,
        menuId: Number(part.split(':')[1]),
        priceAmount: null,
        sortOrder: index + 1,
      };
    }

    const [content, price] = part.split('|').map((item) => item.trim());

    return {
      content: content || null,
      menuId: null,
      priceAmount: price ? parseRequiredNonNegativeInt(price, 'priceAmount') : null,
      sortOrder: index + 1,
    };
  });
}

function formatPollOptionsText(options: PollOption[]) {
  return options
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((option) =>
      option.priceAmount > 0 ? `${option.content}|${option.priceAmount}` : option.content,
    )
    .join(', ');
}

function parseNullablePositiveInt(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return parseRequiredPositiveInt(trimmed, 'id');
}

function getAdminPollCoffeeWarning(
  form: AdminPollCreateForm,
  coffeeDuty: DutyAssignment | null,
) {
  if (form.pollType !== 'COFFEE' || form.chargeGenerationType !== 'OPTION_PRICE') {
    return null;
  }

  if (form.paymentCategory !== 'COFFEE' || !form.paymentAccountId.trim()) {
    return '커피 선택가 투표는 커피 청구 계좌가 필요합니다.';
  }

  if (!coffeeDuty) {
    return '커피 담당자가 지정되지 않아 마감 이후 정산 운영에 문제가 생길 수 있습니다.';
  }

  return null;
}

function filterAdminPollsByType(polls: PollSummary[], filter: AdminPollTypeFilter) {
  switch (filter) {
    case 'ALL':
      return polls;
    case 'COFFEE':
    case 'CUSTOM':
    case 'SATURDAY':
    case 'WEDNESDAY':
      return polls.filter((poll) => poll.pollType === filter);
    default:
      return assertNever(filter);
  }
}

function getSelectedTemplate(
  form: AdminPollTemplateForm,
  templates: AdminPollTemplate[],
) {
  return form.templateId === null
    ? null
    : templates.find((template) => template.id === form.templateId) ?? null;
}

function getPollResponseSummary(poll: PollSummary) {
  return poll.responded ? '내 응답 완료' : '내 응답 대기';
}

function getTemplateScheduleLabel(template: AdminPollTemplate) {
  return `${getDayOfWeekLabel(template.startDayOfWeek)} ${formatShortTime(
    template.startTime,
  )} 시작 · ${getDayOfWeekLabel(template.endDayOfWeek)} ${formatShortTime(
    template.endTime,
  )} 마감`;
}

function getSelectionTypeLabel(value: string) {
  switch (value) {
    case 'MULTIPLE':
      return '복수 선택';
    case 'SINGLE':
      return '단일 선택';
    default:
      return value;
  }
}

function getPaymentCategoryLabel(value: PaymentCategory) {
  switch (value) {
    case 'COFFEE':
      return '커피';
    case 'PENALTY':
      return '벌금';
    default:
      return value;
  }
}

function getDayOfWeekLabel(value: number) {
  switch (value) {
    case 1:
      return '월';
    case 2:
      return '화';
    case 3:
      return '수';
    case 4:
      return '목';
    case 5:
      return '금';
    case 6:
      return '토';
    case 7:
      return '일';
    default:
      return `${value}일`;
  }
}

function formatShortTime(value: string) {
  return value.slice(0, 5);
}

function toOptionalPositiveId(value: string) {
  try {
    return parseNullablePositiveInt(value);
  } catch {
    return null;
  }
}

function toKnownAdminPollType(value: string): AdminPollType {
  switch (value) {
    case 'COFFEE':
    case 'WEDNESDAY':
    case 'SATURDAY':
      return value;
    case 'CUSTOM':
    default:
      return 'CUSTOM';
  }
}

function getPollTypeLabel(value: string) {
  switch (value) {
    case 'COFFEE':
      return '커피';
    case 'WEDNESDAY':
      return '수요';
    case 'SATURDAY':
      return '토요';
    case 'CUSTOM':
      return '커스텀';
    default:
      return value;
  }
}

function getPollStatusLabel(value: string) {
  switch (value) {
    case 'SCHEDULED':
      return '예약';
    case 'OPEN':
      return '진행';
    case 'CLOSED':
      return '마감';
    default:
      return '상태 확인';
  }
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
        message: '기도조 멤버 사용자 ID가 중복되었습니다.',
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

function getPaymentCategoryLabel(category: PaymentCategory) {
  switch (category) {
    case 'PENALTY':
      return '벌금';
    case 'COFFEE':
      return '커피';
    default:
      return assertNever(category);
  }
}

function getPenaltyRuleSummary(rule: PenaltyRule) {
  const activeLabel = rule.isActive ? '활성' : '비활성';
  const calculation = getPenaltyCalculationTypeLabel(rule.calculationType);

  return `${activeLabel} · ${calculation} · 기준 ${rule.requiredCount} · ${formatWon(rule.baseAmount)} + ${formatWon(rule.amountPerUnit)}`;
}

function getChargeStatusLabel(status: ChargeStatus) {
  switch (status) {
    case 'UNPAID':
      return '미납';
    case 'PAID':
      return '납부 완료';
    case 'WAIVED':
      return '면제';
    case 'CANCELED':
      return '취소';
    default:
      return assertNever(status);
  }
}

function getChargeIcon(charge: ChargeItem) {
  if (charge.status === 'PAID') {
    return '✓';
  }

  return charge.paymentCategory === 'COFFEE' ? 'C' : '₩';
}

function getChargeDescription(charge: ChargeItem) {
  if (charge.paidAt) {
    return `납부일 ${charge.paidAt.slice(0, 10)}`;
  }

  if (charge.dueDate) {
    return charge.dueDate;
  }

  return charge.reason;
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

function getNotificationStatusCounts(logs: AdminNotificationLog[]) {
  return logs.reduce(
    (counts, log) => ({
      ...counts,
      [log.sendStatus]: counts[log.sendStatus] + 1,
    }),
    {
      FAILED: 0,
      PENDING: 0,
      SENT: 0,
      SKIPPED: 0,
    } satisfies Record<AdminNotificationSendStatus, number>,
  );
}

function getNotificationStatusLabel(status: AdminNotificationSendStatus) {
  switch (status) {
    case 'PENDING':
      return '대기';
    case 'SENT':
      return '성공';
    case 'FAILED':
      return '실패';
    case 'SKIPPED':
      return '스킵';
    default:
      return assertNever(status);
  }
}

function getNotificationStatusTone(status: AdminNotificationSendStatus) {
  switch (status) {
    case 'PENDING':
      return 'info';
    case 'SENT':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'SKIPPED':
      return 'warning';
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
  accountMeta: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 56,
  },
  accountNumber: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
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
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  compactBlock: {
    gap: spacing.gap,
    marginBottom: spacing.gap,
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
    fontSize: 15,
    fontWeight: '600',
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
  figmaActionPill: {
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 12,
    color: adminFigmaTokens.primary,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 58,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 9,
    textAlign: 'center',
  },
  figmaBodyText: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
  },
  figmaCardTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  figmaChargeItem: {
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 24,
    gap: 8,
    minHeight: 72,
    padding: 14,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  figmaDangerPill: {
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 12,
    color: adminFigmaTokens.danger,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  figmaFormCard: {
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 24,
    gap: spacing.gap,
    paddingHorizontal: 24,
    paddingVertical: 22,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  figmaHeroAmount: {
    color: adminFigmaTokens.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 42,
  },
  figmaHeroCard: {
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 24,
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 22,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  figmaHeroCount: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  figmaHeroLabel: {
    color: adminFigmaTokens.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  figmaHeroMeta: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 19,
  },
  figmaHeroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  figmaIconBox: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 16,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  figmaIconText: {
    color: adminFigmaTokens.primary,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  figmaListContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  figmaListItem: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 24,
    flexDirection: 'row',
    gap: 14,
    minHeight: 82,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  figmaListStack: {
    gap: spacing.gap,
  },
  figmaListText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  figmaScreenTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  figmaSegment: {
    alignItems: 'center',
    borderRadius: 12,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  figmaSegmentActive: {
    backgroundColor: adminFigmaTokens.surface,
  },
  figmaSegmented: {
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    padding: 4,
  },
  figmaSegmentText: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  figmaSegmentTextActive: {
    color: adminFigmaTokens.primary,
  },
  formRow: {
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
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  memberAction: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  memberMeta: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    lineHeight: 20,
  },
  memberName: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: 15,
    fontWeight: '600',
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: colors.textMuted,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sectionTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
});
