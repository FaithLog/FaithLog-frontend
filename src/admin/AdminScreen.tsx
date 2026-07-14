import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  activateAdminPaymentAccount,
  assignCoffeeDuty,
  changeAdminCampusMemberRole,
  changeAdminChargeStatus,
  createAdminPaymentAccount,
  createAdminPenaltyRule,
  deactivateAdminPaymentAccount,
  deleteAdminPaymentAccount,
  deleteCampusMember,
  FaithLogApiError,
  fetchAdminCampusChargesForMyAccounts,
  fetchAdminCampusMembers,
  fetchAdminDashboardSummary,
  fetchAdminMemberCharges,
  fetchAdminMissingDevotionMembers,
  fetchAdminNotificationLogs,
  fetchAdminPaymentAccounts,
  fetchCoffeeBrands,
  fetchCoffeeMenus,
  fetchCampusDetail,
  fetchDutyAssignments,
  fetchPaymentAccounts,
  fetchPenaltyRules,
  getAdminChargeContractCapabilities,
  revokeCoffeeDuty,
  sendAdminNotification,
  updateAdminPenaltyRule,
} from '../api/client';
import {
  closeAdminPoll,
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
import {prayerApi} from '../api/prayerApi';
import {
  clearStoredPrayerSeason,
  clearTokens,
  getAuthSessionGeneration,
  isAuthSessionGenerationCurrent,
  StaleAuthSessionReadError,
  saveStoredPrayerSeason,
} from '../api/tokenStorage';
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
  AdminPrayerAssignableMember,
  AdminPrayerGroup,
  AdminPrayerSeason,
  AdminChargeStatusTarget,
  ApiError,
  CampusRole,
  ChargeAmountSummary,
  ChargeItem,
  ChargeStatus,
  CoffeeBrand,
  CoffeeMenu,
  DutyAssignment,
  PaymentAccount,
  PaymentAccountCategory,
  PaymentCategory,
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
  expireMissingAuthSession,
  readCurrentAccessToken,
  resolveCurrentAccessToken,
} from '../auth/accessTokenResolver';
import {shouldHandleRequestError} from '../auth/requestErrorLineage';
import {
  getAdminPollsForStatusTab,
  type AdminPollStatusTab,
} from './adminPollListVisibility';
import {getRepeatScheduleValidationMessage} from './repeatSchedule';
import {AdminWeeklyDevotionSection} from './AdminWeeklyDevotionSection';
import {
  createAdminChargeMutationGate,
  getAdminChargeStatusActions,
  getAdminChargeStatusConfirmation,
  getAdminChargeStatusErrorMessage,
} from './adminChargeStatus';
import {
  applyAdminChargeFilterChange,
  buildAdminChargeDetailRequestKey,
  buildAdminChargeSummaryRequestKey,
  commitAdminChargeCampusIdentity,
  coordinateAdminChargeStatusMutation,
  createAdminChargeReadCoordinator,
  createAdminChargeViewIdentity,
  getAdminChargeRefreshIdentity,
  invalidateAdminChargeRead,
  isAdminChargeDetailRequestKeyCurrent,
  isAdminChargeSummaryRequestKeyCurrent,
  refreshAdminChargeSurfaces,
  runLatestAdminChargeRead,
  selectAdminCampusChargeRowsForDisplay,
  selectAdminChargeStatusRequest,
  setAdminChargeViewDetail,
  setAdminChargeViewFilters,
} from './adminChargeCoordinator';
import {isEndedPoll} from '../polls/pollListVisibility';
import {invalidatePaymentContextCache} from '../payments/paymentContextCache';
import {mealApi} from '../meal/mealApi';
import {
  beginMealMutation,
  createMealMutationGate,
  finishMealMutationForScope,
} from '../meal/mealMutationFlow';
import {useCommittedMealMutationScope} from '../meal/useCommittedMealMutationScope';
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
import {useAndroidShellLayoutInsets} from '../navigation/shellLayout';
import {colors, radius, spacing} from '../theme';
import {copyTextToClipboard, formatAccountClipboardText} from '../utils/clipboard';
import {formatCompactWon, formatWon} from '../utils/money';
import {
  beginPenaltyRuleSave,
  createPenaltyRuleSaveGate,
  deriveCurrentActivePenaltyRules,
  emptyPenaltyRuleDraft,
  finishPenaltyRuleSave,
  getPenaltyCalculationType,
  getRequiredCountForRuleType,
  hasActivePenaltyRuleType,
  isPenaltyRuleDraftDirty,
  isPenaltyRuleRequestCurrent,
  isPenaltyRuleSaveOperationCurrent,
  invalidatePenaltyRuleSave,
  startPenaltyRuleCreateFlow,
  startPenaltyRuleEditFlow,
  type PenaltyRuleDraft,
  type PenaltyRuleFlow,
} from './penaltyRuleFlow';

type AuthenticatedState = Extract<AuthGateState, {status: 'authenticated'}>;

type Notice = {
  tone: 'info' | 'warning' | 'success';
  title: string;
  message: string;
} | null;

type AdminScreenProps = {
  onBackToUserMode: () => void;
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
type AdminMemberSection = 'list' | 'roles' | 'coffee';
type AdminDevotionSection = 'missing' | 'weekly' | 'prayer';
type AdminPrayerManagementSection = 'status' | 'groups' | 'period';
type AdminPrayerGroupFlow = 'list' | 'details' | 'members';
type AdminCompactButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
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

type InviteCodeState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; code: string}
  | {status: 'empty'}
  | {status: 'error'; message: string};

type InviteCodeCopyState =
  | {status: 'idle'}
  | {status: 'copied'}
  | {status: 'error'; message: string};

type AdminActionState =
  | {status: 'idle'}
  | {status: 'changingRole'; membershipId: number}
  | {status: 'assigningCoffee'; userId: number}
  | {status: 'revokingCoffee'; assignmentId: number}
  | {status: 'assigningMeal'; userId: number}
  | {status: 'revokingMeal'; assignmentId: number}
  | {status: 'deletingMember'; membershipId: number}
  | {status: 'changingChargeStatus'; chargeItemId: number}
  | {status: 'savingPaymentAccount'}
  | {status: 'activatingPaymentAccount'; accountId: number}
  | {status: 'deactivatingPaymentAccount'; accountId: number}
  | {status: 'deletingPaymentAccount'; accountId: number}
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
  | {status: 'confirming'; draft: AdminNotificationDraft; targets: AdminNotificationTarget[]}
  | {status: 'sending'; draft: AdminNotificationDraft; targets: AdminNotificationTarget[]}
  | {status: 'sent'; draft: AdminNotificationDraft; result: AdminNotificationResponse; targetCount: number}
  | {status: 'failed'; draft: AdminNotificationDraft; error: ApiError; targetCount: number};

type NotificationLogState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; logs: AdminNotificationLogList}
  | {status: 'empty'; logs: AdminNotificationLogList}
  | {status: 'error'; error: ApiError};

type AdminNotificationSection = 'send' | 'logs';
type AdminNotificationTargetMode = 'ALL' | 'MISSING_DEVOTION' | 'SELECTED';

type AdminNotificationSendForm = {
  body: string;
  selectedUserIds: number[];
  targetMode: AdminNotificationTargetMode;
  title: string;
};

type AdminNotificationTarget = {
  email: string;
  meta: string;
  name: string;
  userId: number;
};

type AdminNotificationDraft = {
  body: string;
  sourceLabel: string;
  targetId: number | null;
  targetWeekStartDate: string | null;
  title: string;
};

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
  status: AdminChargeStatusTarget;
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
  accountType: PaymentAccountCategory;
  bankName: string;
  nickname: string;
};

type AccountCopyFeedback = {
  accountId: number;
  message: string;
  tone: 'success' | 'warning';
} | null;

type PenaltyRuleState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; rules: PenaltyRule[]}
  | {status: 'empty'}
  | {status: 'error'; error: ApiError};

type AdminPrayerState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; board: PrayerWeekSummary}
  | {status: 'empty'; board: PrayerWeekSummary}
  | {status: 'error'; error: ApiError};

type AssignablePrayerMembersState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; members: AdminPrayerAssignableMember[]}
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

const adminBottomTabs: Array<{id: AdminTab; label: string}> = [
  {id: 'home', label: '홈'},
  {id: 'members', label: '멤버'},
  {id: 'devotion', label: '경건'},
  {id: 'polls', label: '투표'},
  {id: 'settlement', label: '정산'},
];

const adminMemberSections: Array<{id: AdminMemberSection; label: string}> = [
  {id: 'list', label: '멤버'},
  {id: 'roles', label: '역할'},
  {id: 'coffee', label: '커피담당'},
];

const adminDevotionSections: Array<{id: AdminDevotionSection; label: string}> = [
  {id: 'missing', label: '경건 현황'},
  {id: 'weekly', label: '주차별 현황'},
  {id: 'prayer', label: '기도제목'},
];
const adminPrayerManagementSections: Array<{id: AdminPrayerManagementSection; label: string}> = [
  {id: 'status', label: '현황'},
  {id: 'groups', label: '조 관리'},
  {id: 'period', label: '운영 기간'},
];

const memberFilters: Array<{id: MemberFilter; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'ADMINS', label: '리더'},
  {id: 'MEMBERS', label: '멤버'},
];

const chargeStatusFilters: Array<{id: ChargeStatusFilter; label: string}> = [
  {id: 'UNPAID', label: '미납'},
  {id: 'PAID', label: '납부'},
  {id: 'WAIVED', label: '면제'},
  {id: 'CANCELED', label: '취소'},
];

const paymentCategoryFilters: Array<{id: PaymentCategoryFilter; label: string}> = [
  {id: 'PENALTY', label: '벌금'},
  {id: 'COFFEE', label: '커피'},
  {id: 'MEAL', label: '밥'},
];

const settlementSections: Array<{id: AdminSettlementSection; label: string}> = [
  {id: 'charges', label: '청구'},
  {id: 'accounts', label: '계좌'},
  {id: 'penaltyRules', label: '규칙'},
];

const paymentAccountTypeOptions: Array<{id: PaymentAccountCategory; label: string}> = [
  {id: 'PENALTY', label: '벌금'},
  {id: 'COFFEE', label: '커피'},
];

const penaltyRuleTypeOptions: Array<{id: PenaltyRuleType; label: string}> = [
  {id: 'QUIET_TIME', label: 'QT'},
  {id: 'PRAYER', label: '기도'},
  {id: 'BIBLE_READING', label: '성경'},
  {id: 'SATURDAY_LATE', label: '토요지각'},
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
  {id: 'CUSTOM', label: '일반'},
];

const notificationSections: Array<{id: AdminNotificationSection; label: string}> = [
  {id: 'send', label: '발송'},
  {id: 'logs', label: '로그'},
];

const notificationTargetModes: Array<{id: AdminNotificationTargetMode; label: string}> = [
  {id: 'ALL', label: '전체'},
  {id: 'MISSING_DEVOTION', label: '미제출자'},
  {id: 'SELECTED', label: '직접선택'},
];

const quickNotificationMessages: Record<
  'missingDevotion' | PaymentAccountCategory,
  Pick<AdminNotificationDraft, 'body' | 'sourceLabel' | 'targetId' | 'targetWeekStartDate' | 'title'>
> = {
  missingDevotion: {
    body: '이번 주 경건생활을 제출해 주세요.',
    sourceLabel: '경건 미제출',
    targetId: null,
    targetWeekStartDate: null,
    title: '경건생활 제출 알림',
  },
  PENALTY: {
    body: '아직 납부하지 않은 벌금이 있어요. 납부 페이지에서 금액과 계좌를 확인해 주세요.',
    sourceLabel: '벌금 미납',
    targetId: null,
    targetWeekStartDate: null,
    title: '미납 벌금 납부 안내',
  },
  COFFEE: {
    body: '아직 납부하지 않은 커피 정산 금액이 있어요. 납부 페이지에서 확인해 주세요.',
    sourceLabel: '커피 미납',
    targetId: null,
    targetWeekStartDate: null,
    title: '커피 정산 납부 안내',
  },
};

const campusRoleOptions: CampusRole[] = ['MEMBER', 'CAMPUS_LEADER', 'ELDER', 'MINISTER'];
const adminCampusRoles = new Set<CampusRole>(['MINISTER', 'ELDER', 'CAMPUS_LEADER']);
const adminFigmaTokens = {
  background: colors.background,
  surface: colors.surface,
  primary: colors.primary,
  faith: colors.faith,
  mint: colors.mint,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  borderSoft: colors.borderSoft,
};

const emptyPaymentAccountForm: PaymentAccountForm = {
  accountHolder: '',
  accountNumber: '',
  accountType: 'PENALTY',
  bankName: '',
  nickname: '',
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

const emptyNotificationSendForm: AdminNotificationSendForm = {
  body: '이번 주 경건생활을 제출해 주세요.',
  selectedUserIds: [],
  targetMode: 'MISSING_DEVOTION',
  title: '경건생활 제출 알림',
};

export function AdminScreen({
  onBackToUserMode,
  setAuthState,
  setNotice,
  state,
}: AdminScreenProps) {
  const androidShellInsets = useAndroidShellLayoutInsets();
  const campusId = state.selectedCampus.campusId;
  const [weekStartDate, setWeekStartDate] = useState(() => getWeekStartDate(new Date()));
  const [tab, setTab] = useState<AdminTab>('home');
  const [memberSection, setMemberSection] = useState<AdminMemberSection>('list');
  const [devotionSection, setDevotionSection] = useState<AdminDevotionSection>('missing');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('ALL');
  const [memberSearch, setMemberSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const selectMember = useCallback((member: AdminCampusMember) => {
    setSelectedMemberId(member.membershipId);
  }, []);
  const [loadState, setLoadState] = useState<AdminLoadState>({status: 'loading'});
  const [inviteCodeState, setInviteCodeState] = useState<InviteCodeState>({status: 'idle'});
  const [inviteCodeCopyState, setInviteCodeCopyState] = useState<InviteCodeCopyState>({
    status: 'idle',
  });
  const [missingDevotionState, setMissingDevotionState] = useState<MissingDevotionState>({
    status: 'idle',
  });
  const [notificationState, setNotificationState] = useState<NotificationSendState>({
    status: 'idle',
  });
  const [notificationSection, setNotificationSection] =
    useState<AdminNotificationSection>('send');
  const [notificationSendForm, setNotificationSendForm] =
    useState<AdminNotificationSendForm>(emptyNotificationSendForm);
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
    paymentCategory: 'PENALTY',
    status: 'UNPAID',
    userId: '',
  });
  const [chargeReminderLoadingCategory, setChargeReminderLoadingCategory] =
    useState<PaymentAccountCategory | null>(null);
  const chargeFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [knownOwnedCoffeeAccountIds, setKnownOwnedCoffeeAccountIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [paymentAccountDeactivateTarget, setPaymentAccountDeactivateTarget] =
    useState<PaymentAccount | null>(null);
  const [paymentAccountDeleteTarget, setPaymentAccountDeleteTarget] =
    useState<PaymentAccount | null>(null);
  const [accountCopyFeedback, setAccountCopyFeedback] =
    useState<AccountCopyFeedback>(null);
  const accountCopyOpacity = useRef(new Animated.Value(0)).current;
  const [penaltyRuleState, setPenaltyRuleState] = useState<PenaltyRuleState>({
    status: 'idle',
  });
  const [penaltyRuleFlow, setPenaltyRuleFlow] = useState<PenaltyRuleFlow>({route: 'list'});
  const [penaltyRuleForm, setPenaltyRuleForm] =
    useState<PenaltyRuleDraft>(emptyPenaltyRuleDraft);
  const penaltyRuleCampusIdRef = useRef(campusId);
  const penaltyRuleMountedRef = useRef(true);
  const penaltyRuleRequestSequenceRef = useRef(0);
  const penaltyRuleSaveGateRef = useRef(createPenaltyRuleSaveGate());
  const mealDutyMutationGateRef = useRef(createMealMutationGate());
  penaltyRuleCampusIdRef.current = campusId;
  const [prayerState, setPrayerState] = useState<AdminPrayerState>({status: 'idle'});
  const [assignablePrayerMembersState, setAssignablePrayerMembersState] =
    useState<AssignablePrayerMembersState>({status: 'idle'});
  const [prayerSeasonForm, setPrayerSeasonForm] =
    useState<PrayerSeasonForm>(emptyPrayerSeasonForm);
  const [prayerGroupForm, setPrayerGroupForm] =
    useState<PrayerGroupForm>(emptyPrayerGroupForm);
  const [prayerGroupMembersForm, setPrayerGroupMembersForm] =
    useState<PrayerGroupMembersForm>(emptyPrayerGroupMembersForm);
  const [prayerSeasonCloseTarget, setPrayerSeasonCloseTarget] =
    useState<PrayerSeasonCloseTarget>(null);
  const [chargeStatusConfirm, setChargeStatusConfirm] = useState<ChargeStatusConfirm>(null);
  const chargeStatusMutationGateRef = useRef(createAdminChargeMutationGate());
  const chargeReadCoordinatorRef = useRef(createAdminChargeReadCoordinator());
  const chargeViewIdentityRef = useRef(
    createAdminChargeViewIdentity<AdminChargeFilters, AdminChargeMemberRef>(chargeFilters),
  );
  const chargeStatusCampusIdRef = useRef(campusId);
  const [actionState, setActionState] = useState<AdminActionState>({status: 'idle'});
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminCampusMember | null>(null);
  const resetMealDutyActionForCampusChange = useCallback(() => {
    setActionState((current) =>
      current.status === 'assigningMeal' || current.status === 'revokingMeal'
        ? {status: 'idle'}
        : current,
    );
  }, []);
  const mealDutyCampusIdRef = useCommittedMealMutationScope(
    campusId,
    mealDutyMutationGateRef.current,
    resetMealDutyActionForCampusChange,
  );

  useLayoutEffect(() => {
    commitAdminChargeCampusIdentity({
      committedCampusId: chargeStatusCampusIdRef,
      coordinator: chargeReadCoordinatorRef.current,
      gate: chargeStatusMutationGateRef.current,
      nextCampusId: campusId,
      onCommit: () => {
        if (chargeFilterDebounceRef.current !== null) {
          clearTimeout(chargeFilterDebounceRef.current);
          chargeFilterDebounceRef.current = null;
        }
        setSettlementSection('charges');
        setSettlementState({status: 'idle'});
        setAdminChargeViewDetail(chargeViewIdentityRef.current, null);
        setChargeDetailState({status: 'idle'});
        setChargeStatusConfirm(null);
        setActionState((current) =>
          current.status === 'changingChargeStatus' ? {status: 'idle'} : current,
        );
      },
    });
  }, [campusId]);

  const resetPenaltyRuleFlow = useCallback(() => {
    setPenaltyRuleFlow({route: 'list'});
    setPenaltyRuleForm(emptyPenaltyRuleDraft);
    setActionError(null);
  }, []);

  const returnToPenaltyRuleList = useCallback(() => {
    resetPenaltyRuleFlow();
    AccessibilityInfo.announceForAccessibility('벌금 규칙 목록으로 돌아왔습니다.');
  }, [resetPenaltyRuleFlow]);

  const requestPenaltyRuleFlowExit = useCallback(
    (onDiscard = returnToPenaltyRuleList) => {
      if (penaltyRuleFlow.route === 'list') {
        onDiscard();
        return;
      }

      if (actionState.status === 'savingPenaltyRule') {
        return;
      }

      if (!isPenaltyRuleDraftDirty(penaltyRuleFlow, penaltyRuleForm)) {
        onDiscard();
        return;
      }

      Alert.alert(
        '변경사항을 버릴까요?',
        '저장하지 않은 규칙 내용이 있습니다. 나가면 입력한 내용이 사라집니다.',
        [
          {text: '계속 작성', style: 'cancel'},
          {text: '변경사항 버리기', style: 'destructive', onPress: onDiscard},
        ],
      );
    },
    [actionState.status, penaltyRuleFlow, penaltyRuleForm, returnToPenaltyRuleList],
  );

  const syncPrayerSeason = (season: Pick<AdminPrayerSeason, 'name' | 'seasonId' | 'startDate'>) => {
    setPrayerSeasonForm((current) => ({
      ...current,
      name: season.name || current.name,
      seasonId: String(season.seasonId),
      startDate: season.startDate || current.startDate,
    }));
    setPrayerGroupForm((current) => ({
      ...current,
      seasonId: String(season.seasonId),
    }));
  };

  const clearPrayerSeasonState = () => {
    setPrayerSeasonForm({
      ...emptyPrayerSeasonForm,
      startDate: formatAdminDateForApiDateOnly(new Date()),
    });
    setPrayerGroupForm(emptyPrayerGroupForm);
    setPrayerGroupMembersForm(emptyPrayerGroupMembersForm);
  };

  const loadPrayerBoardForActiveSeason = async (accessToken: string): Promise<AdminPrayerState> => {
    const weekBoard = await prayerApi.getPrayerWeekBoard(accessToken, campusId, weekStartDate);
    const currentSeason = await getCurrentPrayerSeasonWithFallback(
      accessToken,
      campusId,
      weekBoard,
    );

    if (!currentSeason) {
      await clearStoredPrayerSeason(campusId);
      clearPrayerSeasonState();
      setAssignablePrayerMembersState({status: 'success', members: []});
      return {
        status: 'empty',
        board: toPrayerBoardWithoutCurrentSeason(weekBoard),
      };
    }

    await saveStoredPrayerSeason(campusId, {
      name: currentSeason.name,
      seasonId: currentSeason.seasonId,
      startDate: currentSeason.startDate,
    });
    syncPrayerSeason(currentSeason);

    setAssignablePrayerMembersState({status: 'loading'});
    const [seasonGroups, assignableMembers] = await Promise.all([
      prayerApi
        .getSeasonGroups(accessToken, currentSeason.seasonId)
        .catch((error): AdminPrayerGroup[] => {
          if (isPrayerEndpointMissing(error)) {
            return weekBoard.groups.map((group) => toAdminPrayerGroupFromSummary(group));
          }

          throw error;
        }),
      prayerApi
        .getAssignableMembers(accessToken, currentSeason.seasonId)
        .catch((error): AdminPrayerAssignableMember[] => {
          if (isPrayerEndpointMissing(error)) {
            return [];
          }

          throw error;
        }),
    ]);
    setAssignablePrayerMembersState({status: 'success', members: assignableMembers});

    const board = mergePrayerBoardWithSeasonGroups(weekBoard, currentSeason, seasonGroups);

    return board.groups.length === 0 || board.targetMemberCount === 0
      ? {status: 'empty', board}
      : {status: 'success', board};
  };

  const loadAdmin = async () => {
    setLoadState({status: 'loading'});
    setPrayerState({status: 'loading'});
    setActionError(null);
    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const [summary, members, duties, prayerBoardResult] = await Promise.all([
        fetchAdminDashboardSummary(accessToken, campusId, {weekStartDate}),
        fetchAdminCampusMembers(accessToken, campusId),
        fetchDutyAssignments(accessToken, campusId),
        loadPrayerBoardForActiveSeason(accessToken)
          .catch((error): AdminPrayerState => ({
            status: 'error',
            error: toApiError(error, '기도제목 주간 현황을 불러오지 못했습니다.'),
          })),
      ]);

      setPrayerState(prayerBoardResult);

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

  const loadInviteCode = async () => {
    setInviteCodeState({status: 'loading'});
    setInviteCodeCopyState({status: 'idle'});

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const campus = await fetchCampusDetail(accessToken, campusId);
      const inviteCode = campus.inviteCode?.trim();

      setInviteCodeState(inviteCode ? {status: 'success', code: inviteCode} : {status: 'empty'});
    } catch (error) {
      const apiError = toApiError(error, '초대코드를 불러오지 못했습니다.');

      if (apiError.kind === 'sessionExpired') {
        void handleAuthError(apiError, setAuthState);
        return;
      }

      setInviteCodeState({status: 'error', message: getApiErrorPresentation(apiError).message});
    }
  };

  const copyInviteCode = async (inviteCode: string) => {
    const result = await copyTextToClipboard(inviteCode);

    if (result.status === 'copied') {
      setInviteCodeCopyState({status: 'copied'});
      AccessibilityInfo.announceForAccessibility('초대코드를 복사했습니다.');
      return;
    }

    setInviteCodeCopyState({status: 'error', message: result.message});
    AccessibilityInfo.announceForAccessibility(result.message);
  };

  useEffect(() => {
    penaltyRuleMountedRef.current = true;

    return () => {
      penaltyRuleMountedRef.current = false;
      penaltyRuleRequestSequenceRef.current += 1;
      invalidateAdminChargeRead(chargeReadCoordinatorRef.current);
    };
  }, []);

  const isMealDutyOperationMounted = (operationId: number, operationCampusId: number) =>
    penaltyRuleMountedRef.current &&
    mealDutyCampusIdRef.current === operationCampusId &&
    mealDutyMutationGateRef.current.operationId === operationId;

  const resolveMealDutyMutationAccess = async (
    operationId: number,
    operationCampusId: number,
  ) => {
    const generation = getAuthSessionGeneration();
    try {
      const resolution = await readCurrentAccessToken();
      if (
        resolution.generation !== generation ||
        !isAuthSessionGenerationCurrent(generation) ||
        !isMealDutyOperationMounted(operationId, operationCampusId)
      ) {
        return null;
      }
      if (!resolution.accessToken) {
        expireMissingAuthSession(generation);
        setAuthState({status: 'sessionExpired', message: '저장된 로그인 정보가 없습니다.'});
        return null;
      }
      return {accessToken: resolution.accessToken, generation};
    } catch (error) {
      if (error instanceof StaleAuthSessionReadError) return null;
      throw error;
    }
  };

  const refreshMealDutyAdminState = async (
    operationId: number,
    operationCampusId: number,
  ) => {
    const access = await resolveMealDutyMutationAccess(operationId, operationCampusId);
    if (!access) return false;
    try {
      const [summary, members, duties] = await Promise.all([
        fetchAdminDashboardSummary(access.accessToken, operationCampusId, {weekStartDate}),
        fetchAdminCampusMembers(access.accessToken, operationCampusId),
        fetchDutyAssignments(access.accessToken, operationCampusId),
      ]);
      if (
        !isMealDutyOperationMounted(operationId, operationCampusId) ||
        !isAuthSessionGenerationCurrent(access.generation)
      ) {
        return false;
      }
      setLoadState(
        members.length === 0
          ? {status: 'empty', summary}
          : {status: 'success', summary, members, duties},
      );
      if (members.length === 0) setSelectedMemberId(null);
      return true;
    } catch (error) {
      const apiError = toApiError(error, '최신 담당자 목록을 불러오지 못했습니다.');
      if (
        isMealDutyOperationMounted(operationId, operationCampusId) &&
        shouldHandleRequestError(
          apiError,
          access.generation,
          getAuthSessionGeneration(),
        )
      ) {
        void handleAuthError(apiError, setAuthState);
      }
      return false;
    }
  };

  useEffect(() => {
    penaltyRuleRequestSequenceRef.current += 1;
    invalidatePenaltyRuleSave(penaltyRuleSaveGateRef.current);
    setSelectedMemberId(null);
    setMemberSection('list');
    setDevotionSection('missing');
    setMemberSearch('');
    setInviteCodeState({status: 'idle'});
    setInviteCodeCopyState({status: 'idle'});
    setWeekStartDate(getWeekStartDate(new Date()));
    setMissingDevotionState({status: 'idle'});
    setNotificationState({status: 'idle'});
    setNotificationSection('send');
    setNotificationSendForm(emptyNotificationSendForm);
    setNotificationLogFilters(emptyNotificationLogFilters);
    setNotificationLogState({status: 'idle'});
    setSelectedNotificationLogId(null);
    setPaymentAccountState({status: 'idle'});
    setPaymentAccountForm(emptyPaymentAccountForm);
    setSelectedPaymentAccount(null);
    setKnownOwnedCoffeeAccountIds(new Set());
    setPaymentAccountDeactivateTarget(null);
    setPaymentAccountDeleteTarget(null);
    setAccountCopyFeedback(null);
    setPenaltyRuleState({status: 'idle'});
    setPenaltyRuleFlow({route: 'list'});
    setPenaltyRuleForm(emptyPenaltyRuleDraft);
    setActionState((current) =>
      current.status === 'savingPenaltyRule'
        ? {status: 'idle'}
        : current,
    );
    setActionError(null);
    setPrayerState({status: 'idle'});
    setAssignablePrayerMembersState({status: 'idle'});
    setPrayerSeasonForm({...emptyPrayerSeasonForm, startDate: getWeekStartDate(new Date())});
    setPrayerGroupForm(emptyPrayerGroupForm);
    setPrayerGroupMembersForm(emptyPrayerGroupMembersForm);
    setPrayerSeasonCloseTarget(null);
    void loadAdmin();
    void loadInviteCode();
  }, [campusId]);

  useEffect(() => {
    if (penaltyRuleFlow.route === 'list') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestPenaltyRuleFlowExit();
      return true;
    });

    return () => subscription.remove();
  }, [penaltyRuleFlow.route, requestPenaltyRuleFlowExit]);

  useEffect(() => {
    if (
      tab === 'devotion' &&
      devotionSection === 'missing' &&
      missingDevotionState.status === 'idle'
    ) {
      void loadMissingDevotions();
    }
  }, [devotionSection, tab, missingDevotionState.status]);

  useEffect(() => {
    if (tab === 'notificationLogs' && notificationLogState.status === 'idle') {
      void loadNotificationLogs();
    }
  }, [tab, notificationLogState.status]);

  useEffect(() => {
    if (
      ((tab === 'devotion' && devotionSection === 'prayer') || tab === 'prayer') &&
      prayerState.status === 'idle'
    ) {
      void loadPrayerBoard();
    }
  }, [devotionSection, tab, prayerState.status]);

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

  useEffect(
    () => () => {
      if (chargeFilterDebounceRef.current !== null) {
        clearTimeout(chargeFilterDebounceRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!accountCopyFeedback) {
      return undefined;
    }

    accountCopyOpacity.setValue(1);
    const animation = Animated.timing(accountCopyOpacity, {
      delay: 1500,
      duration: 350,
      toValue: 0,
      useNativeDriver: true,
    });

    animation.start(({finished}) => {
      if (finished) {
        setAccountCopyFeedback(null);
      }
    });

    return () => {
      animation.stop();
    };
  }, [accountCopyFeedback, accountCopyOpacity]);

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

  const loadSettlement = async (
    filters: AdminChargeFilters = getAdminChargeRefreshIdentity(chargeViewIdentityRef.current).filters,
  ) => {
    const requestCampusId = campusId;
    const requestGeneration = getAuthSessionGeneration();
    const key = buildAdminChargeSummaryRequestKey({
      campusId: requestCampusId,
      generation: requestGeneration,
      filters,
    });

    return runLatestAdminChargeRead({
      coordinator: chargeReadCoordinatorRef.current,
      channel: 'summary',
      key,
      onStart: () => {
        setSettlementState({status: 'loading'});
        setActionError(null);
      },
      request: async () => {
        const accessToken = await resolveAccessToken(setAuthState);

        if (!accessToken) {
          return null;
        }

        const userId = parseOptionalPositiveInt(filters.userId, 'userId');
        const charges = await fetchAdminCampusChargesForMyAccounts(
          accessToken,
          requestCampusId,
          {
            keyword: filters.keyword,
            paymentCategory: filters.paymentCategory,
            status: filters.status,
            ...(userId === undefined ? {} : {userId}),
          },
        );

        return filterAdminCampusChargeSummary(charges, filters);
      },
      normalizeError: (error) =>
        toApiError(error, '관리자 정산 정보를 불러오지 못했습니다.'),
      canApplySuccess: () =>
        penaltyRuleMountedRef.current &&
        chargeStatusCampusIdRef.current === requestCampusId &&
        isAuthSessionGenerationCurrent(requestGeneration) &&
        isAdminChargeSummaryRequestKeyCurrent({
          campusId: requestCampusId,
          generation: requestGeneration,
          identity: chargeViewIdentityRef.current,
          key,
        }),
      canApplyError: (apiError) =>
        penaltyRuleMountedRef.current &&
        chargeStatusCampusIdRef.current === requestCampusId &&
        isAdminChargeSummaryRequestKeyCurrent({
          campusId: requestCampusId,
          generation: requestGeneration,
          identity: chargeViewIdentityRef.current,
          key,
        }) &&
        shouldHandleRequestError(
          apiError,
          requestGeneration,
          getAuthSessionGeneration(),
        ),
      onSuccess: (visibleCharges) => {
        setSettlementState(
          visibleCharges.members.length === 0
            ? {status: 'empty', charges: visibleCharges}
            : {status: 'success', charges: visibleCharges},
        );
      },
      onError: (apiError) => {
        setSettlementState({status: 'error', error: apiError});
        void handleAuthError(apiError, setAuthState);
      },
    });
  };

  const loadPaymentAccounts = async () => {
    setPaymentAccountState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const accounts = await Promise.all([
        fetchAdminPaymentAccounts(accessToken, campusId, {
          accountType: 'PENALTY',
          includeInactive: true,
        }),
        fetchAdminPaymentAccounts(accessToken, campusId, {
          accountType: 'COFFEE',
          includeInactive: true,
        })
          .catch((error) => {
            if (isPaymentAccountListEndpointMissing(error)) {
              return fetchPaymentAccounts(accessToken, campusId, {accountType: 'COFFEE'});
            }

            throw error;
          }),
      ]).then(([penaltyAccounts, coffeeAccounts]) =>
        mergePaymentAccounts(penaltyAccounts, coffeeAccounts),
      ).catch((error): Promise<PaymentAccount[]> | PaymentAccount[] => {
        if (isPaymentAccountListEndpointMissing(error)) {
          return fetchPaymentAccounts(accessToken, campusId);
        }

        throw error;
      });
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
      });
      invalidatePaymentContextCache(campusId);

      setPaymentAccountForm(emptyPaymentAccountForm);
      if (paymentAccountForm.accountType === 'COFFEE') {
        setKnownOwnedCoffeeAccountIds((current) => {
          const next = new Set(current);
          next.add(account.id);
          return next;
        });
      }
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
      invalidatePaymentContextCache(campusId);
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

  const activatePaymentAccount = async (account: PaymentAccount) => {
    if (actionState.status !== 'idle' || isPaymentAccountActive(account)) {
      return;
    }

    setActionState({status: 'activatingPaymentAccount', accountId: account.id});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await activateAdminPaymentAccount(accessToken, campusId, account.id);
      invalidatePaymentContextCache(campusId);
      setSelectedPaymentAccount(null);
      setPaymentAccountState({status: 'idle'});
      setNotice({
        tone: 'success',
        title: '납부 계좌 활성화',
        message: `${account.nickname} 계좌가 활성 계좌로 변경되었습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '납부 계좌를 활성화하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const confirmDeletePaymentAccount = async () => {
    if (!paymentAccountDeleteTarget || actionState.status !== 'idle') {
      return;
    }

    const target = paymentAccountDeleteTarget;

    if (isPaymentAccountActive(target)) {
      setActionError({
        kind: 'conflict',
        message: '활성 계좌는 삭제할 수 없습니다. 다른 계좌를 활성화한 뒤 다시 시도해 주세요.',
      });
      return;
    }

    setActionState({status: 'deletingPaymentAccount', accountId: target.id});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      await deleteAdminPaymentAccount(accessToken, campusId, target.id);
      invalidatePaymentContextCache(campusId);
      setPaymentAccountDeleteTarget(null);
      setSelectedPaymentAccount(null);
      setPaymentAccountState({status: 'idle'});
      setNotice({
        tone: 'warning',
        title: '납부 계좌 삭제',
        message: `${target.nickname} 비활성 계좌를 삭제했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '납부 계좌를 삭제하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const copyAccountNumber = async (account: PaymentAccount) => {
    const copyText = formatAccountClipboardText(account);
    const result = await copyTextToClipboard(copyText);
    const copied = result.status === 'copied';
    const message = copied ? '계좌번호를 복사했습니다.' : result.message;

    setAccountCopyFeedback({
      accountId: account.id,
      message: copied ? '복사됨' : '복사 불가',
      tone: copied ? 'success' : 'warning',
    });
    AccessibilityInfo.announceForAccessibility(message);
  };

  const loadPenaltyRules = async () => {
    const requestCampusId = campusId;
    const requestGeneration = getAuthSessionGeneration();
    const requestSequence = ++penaltyRuleRequestSequenceRef.current;
    setPenaltyRuleState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const rules = await fetchPenaltyRules(accessToken, campusId);
      if (
        !isPenaltyRuleRequestCurrent({
          currentCampusId: penaltyRuleCampusIdRef.current,
          currentGeneration: getAuthSessionGeneration(),
          currentSequence: penaltyRuleRequestSequenceRef.current,
          mounted: penaltyRuleMountedRef.current,
          requestCampusId,
          requestGeneration,
          requestSequence,
        })
      ) {
        return;
      }
      const currentRules = deriveCurrentActivePenaltyRules(rules);
      if (currentRules.duplicateActiveTypes.length > 0) {
        console.warn(
          '[AdminPenaltyRules] Multiple active rules received; using the latest id per type.',
          currentRules.duplicateActiveTypes,
        );
      }
      setPenaltyRuleState(
        currentRules.rules.length === 0
          ? {status: 'empty'}
          : {status: 'success', rules: currentRules.rules},
      );
    } catch (error) {
      if (
        !isPenaltyRuleRequestCurrent({
          currentCampusId: penaltyRuleCampusIdRef.current,
          currentGeneration: getAuthSessionGeneration(),
          currentSequence: penaltyRuleRequestSequenceRef.current,
          mounted: penaltyRuleMountedRef.current,
          requestCampusId,
          requestGeneration,
          requestSequence,
        })
      ) {
        return;
      }
      const apiError = toApiError(error, '벌금 규칙을 불러오지 못했습니다.');
      setPenaltyRuleState({status: 'error', error: apiError});
      void handleAuthError(apiError, setAuthState);
    }
  };

  const savePenaltyRule = async () => {
    if (
      actionState.status !== 'idle' ||
      penaltyRuleFlow.route === 'list'
    ) {
      return;
    }

    const activeRules = getPenaltyRulesForSelection(penaltyRuleState);
    const replacingActiveRule =
      penaltyRuleFlow.route === 'create' &&
      activeRules !== null &&
      hasActivePenaltyRuleType(activeRules, penaltyRuleForm.ruleType);
    const operationId = beginPenaltyRuleSave(penaltyRuleSaveGateRef.current);
    if (operationId === null) {
      return;
    }

    const editingRuleId = penaltyRuleFlow.route === 'edit' ? penaltyRuleFlow.ruleId : null;
    const operationCampusId = campusId;
    const operationGeneration = getAuthSessionGeneration();
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
              calculationType: getPenaltyCalculationType(penaltyRuleForm.ruleType),
              ...requestAmounts,
            })
          : await updateAdminPenaltyRule(accessToken, editingRuleId, {
              ...requestAmounts,
              isActive: true,
            });

      if (
        !penaltyRuleMountedRef.current ||
        penaltyRuleCampusIdRef.current !== operationCampusId ||
        !isAuthSessionGenerationCurrent(operationGeneration) ||
        !isPenaltyRuleSaveOperationCurrent(
          penaltyRuleSaveGateRef.current,
          operationId,
        )
      ) {
        return;
      }

      setPenaltyRuleFlow({route: 'list'});
      setPenaltyRuleForm(emptyPenaltyRuleDraft);
      await loadPenaltyRules();

      if (
        !penaltyRuleMountedRef.current ||
        penaltyRuleCampusIdRef.current !== operationCampusId ||
        !isAuthSessionGenerationCurrent(operationGeneration) ||
        !isPenaltyRuleSaveOperationCurrent(
          penaltyRuleSaveGateRef.current,
          operationId,
        )
      ) {
        return;
      }
      setNotice({
        tone: 'success',
        title: editingRuleId === null ? '벌금 규칙 등록' : '벌금 규칙 수정',
        message:
          editingRuleId === null && replacingActiveRule
            ? `${getPenaltyRuleTypeLabel(rule.ruleType)} 새 규칙을 적용했습니다. 기존 규칙은 이력으로 보관됩니다.`
            : `${getPenaltyRuleTypeLabel(rule.ruleType)} 규칙을 저장했습니다.`,
      });
      AccessibilityInfo.announceForAccessibility(
        `${getPenaltyRuleTypeLabel(rule.ruleType)} 벌금 규칙을 저장했고 목록으로 돌아왔습니다.`,
      );
    } catch (error) {
      const apiError = toApiError(error, '벌금 규칙을 저장하지 못했습니다.');
      if (
        !penaltyRuleMountedRef.current ||
        penaltyRuleCampusIdRef.current !== operationCampusId ||
        !isAuthSessionGenerationCurrent(operationGeneration) ||
        !isPenaltyRuleSaveOperationCurrent(
          penaltyRuleSaveGateRef.current,
          operationId,
        )
      ) {
        return;
      }

      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      if (
        penaltyRuleMountedRef.current &&
        finishPenaltyRuleSave(penaltyRuleSaveGateRef.current, operationId)
      ) {
        setActionState({status: 'idle'});
      }
    }
  };

  const openPenaltyRuleCreate = () => {
    const nextFlow = startPenaltyRuleCreateFlow();
    const activeRules = getPenaltyRulesForSelection(penaltyRuleState);
    const replacesInitialRule =
      activeRules !== null &&
      hasActivePenaltyRuleType(activeRules, nextFlow.initialDraft.ruleType);

    setPenaltyRuleFlow(nextFlow);
    setPenaltyRuleForm(nextFlow.initialDraft);
    setActionError(null);
    AccessibilityInfo.announceForAccessibility(
      replacesInitialRule
        ? `벌금 규칙 추가 페이지입니다. 현재 적용 중인 ${getPenaltyRuleTypeLabel(nextFlow.initialDraft.ruleType)} 규칙이 있어 저장하면 새 규칙으로 교체됩니다.`
        : '벌금 규칙 추가 페이지입니다. 같은 항목에 현재 규칙이 있으면 새 규칙으로 교체되고 기존 규칙은 이력으로 보관됩니다.',
    );
  };

  const editPenaltyRule = (rule: PenaltyRule) => {
    const nextFlow = startPenaltyRuleEditFlow(rule);
    setPenaltyRuleFlow(nextFlow);
    setPenaltyRuleForm(nextFlow.initialDraft);
    setActionError(null);
    AccessibilityInfo.announceForAccessibility(
      `${getPenaltyRuleTypeLabel(rule.ruleType)} 벌금 규칙 수정 페이지입니다.`,
    );
  };

  const loadPrayerBoard = async () => {
    setPrayerState({status: 'loading'});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const nextPrayerState = await loadPrayerBoardForActiveSeason(accessToken);
      setPrayerState(nextPrayerState);
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

      const startDate = formatAdminDateForApiDateOnly(new Date());
      const season = await prayerApi.createSeason(accessToken, campusId, {
        name: prayerSeasonForm.name,
        startDate,
      });
      await saveStoredPrayerSeason(campusId, {
        name: season.name,
        seasonId: season.seasonId,
        startDate: season.startDate,
      });

      setPrayerSeasonForm((current) => ({
        ...current,
        name: season.name,
        seasonId: String(season.seasonId),
        startDate: season.startDate,
      }));
      setPrayerGroupForm((current) => ({
        ...current,
        seasonId: String(season.seasonId),
      }));
      setNotice({
        tone: 'success',
        title: '기도 운영 기간 시작',
        message: `${season.name} 운영 기간을 시작했습니다.`,
      });
      const nextPrayerState = await loadPrayerBoardForActiveSeason(accessToken);
      setPrayerState(nextPrayerState);
    } catch (error) {
      const apiError = toApiError(error, '기도 운영 기간을 시작하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const openPrayerSeasonCloseConfirm = (seasonIdOverride?: string) => {
    try {
      const seasonId = parseRequiredPositiveInt(
        seasonIdOverride ?? prayerSeasonForm.seasonId,
        '진행 중인 운영 기간',
      );
      const endDate = formatAdminDateForApiDateOnly(new Date());

      setPrayerSeasonCloseTarget({seasonId, endDate});
      setActionError(null);
    } catch (error) {
      setActionError(toApiError(error, '기도 운영 기간 종료 입력값이 올바르지 않습니다.'));
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

      const season = await prayerApi.closeSeason(
        accessToken,
        target.seasonId,
        {endDate: formatAdminDateForApiDateOnly(new Date())},
      );

      clearPrayerSeasonState();
      setNotice({
        tone: 'warning',
        title: '기도 운영 기간 종료',
        message: `${season.name} 운영 기간을 종료했습니다. 새 기간을 시작한 뒤 조를 다시 편성해 주세요.`,
      });

      setPrayerSeasonCloseTarget(null);
      await clearStoredPrayerSeason(campusId);
      setAssignablePrayerMembersState({status: 'success', members: []});
      setPrayerState((current) =>
        current.status === 'success' || current.status === 'empty'
          ? {status: 'empty', board: toPrayerBoardWithoutCurrentSeason(current.board)}
          : current,
      );
    } catch (error) {
      const apiError = toApiError(error, '기도 운영 기간을 종료하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, setAuthState);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const savePrayerGroup = async () => {
    if (actionState.status !== 'idle') {
      return false;
    }

    setActionState({status: 'savingPrayerGroup', groupId: null});
    setActionError(null);

    try {
      const editingGroupId = prayerGroupForm.groupId.trim()
        ? parseRequiredPositiveInt(prayerGroupForm.groupId, 'groupId')
        : null;
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return false;
      }

      setActionState({status: 'savingPrayerGroup', groupId: editingGroupId});

      const request = {
        name: prayerGroupForm.name,
        sortOrder: parseRequiredPositiveInt(prayerGroupForm.sortOrder, 'sortOrder'),
      };
      const unavailableUserIds = getUnavailablePrayerMemberIds(prayerState, editingGroupId);
      const selectedUserIds = parseUserIdList(prayerGroupMembersForm.userIds).filter(
        (userId) => !unavailableUserIds.has(userId),
      );

      if (selectedUserIds.length === 0) {
        setActionError({
          kind: 'error',
          message: '기도조 멤버를 1명 이상 선택해 주세요.',
        });
        return false;
      }

      const group =
        editingGroupId === null
          ? await prayerApi.createGroup(
              accessToken,
              parseRequiredPositiveInt(prayerGroupForm.seasonId, '진행 중인 운영 기간'),
              request,
            )
          : await prayerApi.updateGroup(accessToken, editingGroupId, {
              ...request,
              isActive: prayerGroupForm.isActive,
            });
      const savedGroup = await prayerApi.replaceGroupMembers(accessToken, group.groupId, {
        userIds: selectedUserIds,
      });

      setPrayerGroupForm({
        ...emptyPrayerGroupForm,
        groupId: String(savedGroup.groupId),
        name: savedGroup.name,
        seasonId: String(savedGroup.seasonId),
        sortOrder: String(savedGroup.sortOrder),
        isActive: savedGroup.active,
      });
      setPrayerGroupMembersForm({
        groupId: String(savedGroup.groupId),
        userIds: savedGroup.members.map((member) => String(member.userId)).join(', '),
      });
      setNotice({
        tone: savedGroup.active ? 'success' : 'warning',
        title: editingGroupId === null ? '기도조 생성' : '기도조 수정',
        message: `${savedGroup.name} 조와 조원 ${savedGroup.members.length}명을 저장했습니다.`,
      });
      setPrayerState({status: 'idle'});
      return true;
    } catch (error) {
      const apiError = toApiError(error, '기도조를 저장하지 못했습니다.');
      setActionError(
        apiError.kind === 'conflict'
          ? {
              ...apiError,
              message: '이미 다른 조에 배정된 멤버가 있어요. 멤버 목록을 새로고침한 뒤 다시 선택해 주세요.',
            }
          : apiError,
      );
      void handleAuthError(apiError, setAuthState);
      return false;
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

  const updateChargeFilter = <Key extends keyof AdminChargeFilters>(
    key: Key,
    value: AdminChargeFilters[Key],
  ) => {
    const nextFilters = {
      ...getAdminChargeRefreshIdentity(chargeViewIdentityRef.current).filters,
      [key]: value,
    };

    chargeFilterDebounceRef.current = applyAdminChargeFilterChange({
      coordinator: chargeReadCoordinatorRef.current,
      currentTimer: chargeFilterDebounceRef.current,
      key,
      nextFilters,
      onLoad: (filters) => void loadSettlement(filters),
      onVisibleStateChange: (filters) => {
        setAdminChargeViewFilters(chargeViewIdentityRef.current, filters);
        setChargeFilters(filters);
        setChargeDetailState({status: 'idle'});
        setSettlementState({status: 'loading'});
      },
    });
  };

  const resetChargeFilters = () => {
    const nextFilters: AdminChargeFilters = {
      keyword: '',
      paymentCategory: 'PENALTY',
      status: 'UNPAID',
      userId: '',
    };

    if (chargeFilterDebounceRef.current !== null) {
      clearTimeout(chargeFilterDebounceRef.current);
      chargeFilterDebounceRef.current = null;
    }

    invalidateAdminChargeRead(chargeReadCoordinatorRef.current);
    setAdminChargeViewFilters(chargeViewIdentityRef.current, nextFilters);
    setChargeFilters(nextFilters);
    setChargeDetailState({status: 'idle'});
    void loadSettlement(nextFilters);
  };

  const openMemberCharges = async (
    member: AdminChargeMemberRef,
    filters: AdminChargeFilters = getAdminChargeRefreshIdentity(chargeViewIdentityRef.current).filters,
  ) => {
    const requestCampusId = campusId;
    const requestGeneration = getAuthSessionGeneration();
    const requestFilters = filters;
    setAdminChargeViewDetail(chargeViewIdentityRef.current, member);
    const key = buildAdminChargeDetailRequestKey({
      campusId: requestCampusId,
      generation: requestGeneration,
      filters: requestFilters,
      memberUserId: member.userId,
    });

    return runLatestAdminChargeRead({
      coordinator: chargeReadCoordinatorRef.current,
      channel: 'detail',
      key,
      onStart: () => {
        setChargeDetailState({status: 'loading', member});
        setActionError(null);
      },
      request: async () => {
        const accessToken = await resolveAccessToken(setAuthState);

        if (!accessToken) {
          return null;
        }

        const charges = await fetchAdminMemberCharges(
          accessToken,
          requestCampusId,
          member.userId,
          {
            paymentCategory: requestFilters.paymentCategory,
            status: requestFilters.status,
          },
        );

        return filterAdminMemberChargeList(charges, requestFilters);
      },
      normalizeError: (error) =>
        toApiError(error, '회원별 청구 상세를 불러오지 못했습니다.'),
      canApplySuccess: () =>
        penaltyRuleMountedRef.current &&
        chargeStatusCampusIdRef.current === requestCampusId &&
        isAuthSessionGenerationCurrent(requestGeneration) &&
        isAdminChargeDetailRequestKeyCurrent({
          campusId: requestCampusId,
          generation: requestGeneration,
          identity: chargeViewIdentityRef.current,
          key,
        }),
      canApplyError: (apiError) =>
        penaltyRuleMountedRef.current &&
        chargeStatusCampusIdRef.current === requestCampusId &&
        isAdminChargeDetailRequestKeyCurrent({
          campusId: requestCampusId,
          generation: requestGeneration,
          identity: chargeViewIdentityRef.current,
          key,
        }) &&
        shouldHandleRequestError(
          apiError,
          requestGeneration,
          getAuthSessionGeneration(),
        ),
      onSuccess: (charges) => {
        setChargeDetailState(
          charges.items.length === 0
            ? {status: 'empty', charges}
            : {status: 'success', charges},
        );
      },
      onError: (apiError) => {
        setChargeDetailState({status: 'error', error: apiError, member});
        void handleAuthError(apiError, setAuthState);
      },
    });
  };

  const requestChargeStatusChange = (
    charge: ChargeItem,
    status: AdminChargeStatusTarget,
  ) => {
    const capabilities = getAdminChargeContractCapabilities();
    const target = selectAdminChargeStatusRequest({
      actionIdle: actionState.status === 'idle',
      capabilities,
      charge,
      mutationActive: chargeStatusMutationGateRef.current.activeOperationId !== null,
      status,
    });

    if (!target) {
      return;
    }

    setActionError(null);
    setChargeStatusConfirm(target);
  };

  const confirmChargeStatusChange = async () => {
    if (
      !chargeStatusConfirm ||
      chargeStatusMutationGateRef.current.activeOperationId !== null ||
      actionState.status !== 'idle'
    ) {
      return;
    }

    const target = chargeStatusConfirm;
    const detailMember = getAdminChargeRefreshIdentity(chargeViewIdentityRef.current).detail;
    const operationCampusId = campusId;
    const operationGeneration = getAuthSessionGeneration();

    if (!detailMember) {
      return;
    }
    const expectedUserId = detailMember.userId;

    const outcome = await coordinateAdminChargeStatusMutation({
      gate: chargeStatusMutationGateRef.current,
      expected: {
        campusId: operationCampusId,
        userId: expectedUserId,
        chargeItemId: target.charge.id,
        paymentCategory: target.charge.paymentCategory,
        status: target.status,
      },
      mutate: async () => {
        const accessToken = await resolveAccessToken(setAuthState);

        if (!accessToken) {
          return null;
        }

        return changeAdminChargeStatus(
          accessToken,
          target.charge.id,
          target.status,
          {
            campusId: operationCampusId,
            userId: expectedUserId,
            paymentCategory: target.charge.paymentCategory,
          },
        );
      },
      normalizeError: (error) =>
        toApiError(error, '청구 상태를 변경하지 못했습니다.'),
      canApplySuccess: () =>
        penaltyRuleMountedRef.current &&
        chargeStatusCampusIdRef.current === operationCampusId &&
        isAuthSessionGenerationCurrent(operationGeneration),
      canHandleError: (apiError) =>
        penaltyRuleMountedRef.current &&
        chargeStatusCampusIdRef.current === operationCampusId &&
        shouldHandleRequestError(
          apiError,
          operationGeneration,
          getAuthSessionGeneration(),
        ),
      onStart: () => {
        setActionState({status: 'changingChargeStatus', chargeItemId: target.charge.id});
        setActionError(null);
      },
      onFinish: () => {
        if (penaltyRuleMountedRef.current) {
          setActionState({status: 'idle'});
        }
      },
      onAccepted: (updated) => {
        invalidateAdminChargeRead(chargeReadCoordinatorRef.current);
        invalidatePaymentContextCache(operationCampusId);
        replaceChargeItem(updated);
        setChargeStatusConfirm(null);
      },
      onConflict: () => {
        invalidateAdminChargeRead(chargeReadCoordinatorRef.current);
        setChargeStatusConfirm(null);
        setActionError(null);
      },
      onSessionExpired: (apiError) => handleAuthError(apiError, setAuthState),
      refresh: () => {
        const current = getAdminChargeRefreshIdentity(chargeViewIdentityRef.current);
        const currentDetail = current.detail;

        return refreshAdminChargeSurfaces(
          () => loadSettlement(current.filters),
          currentDetail
            ? () => openMemberCharges(currentDetail, current.filters)
            : undefined,
        );
      },
    });

    if (outcome.kind === 'error') {
      setActionError(outcome.error);
      return;
    }

    if (outcome.kind === 'conflict') {
      setNotice({
        tone: 'warning',
        title: '청구 상태 새로고침',
        message: outcome.refresh.kind === 'complete'
          ? '청구 상태가 이미 변경되어 최신 목록과 상세를 불러왔습니다.'
          : '청구 상태가 이미 변경되었습니다. 최신 정보를 일부 불러오지 못해 다시 시도해 주세요.',
      });
      return;
    }

    if (outcome.kind === 'success') {
      setNotice({
        tone: outcome.refresh.kind === 'complete' ? 'success' : 'warning',
        title: '청구 상태 변경',
        message: outcome.refresh.kind === 'complete'
          ? `${target.charge.title} 상태를 ${getChargeStatusLabel(outcome.response.status)}로 변경했습니다.`
          : `${target.charge.title} 상태 변경은 완료했지만 최신 목록 또는 상세를 일부 불러오지 못했습니다.`,
      });
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

    const message = quickNotificationMessages.missingDevotion;
    setNotificationState({
      status: 'confirming',
      draft: {
        body: message.body,
        sourceLabel: message.sourceLabel,
        targetId: null,
        targetWeekStartDate: weekStartDate,
        title: message.title,
      },
      targets: targets.map(toNotificationTargetFromMissingMember),
    });
    setActionError(null);
  };

  const openChargeReminderConfirm = async (paymentCategory: PaymentAccountCategory) => {
    if (notificationState.status === 'sending' || chargeReminderLoadingCategory !== null) {
      return;
    }

    setActionError(null);
    setChargeReminderLoadingCategory(paymentCategory);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const charges = await fetchAdminCampusChargesForMyAccounts(accessToken, campusId, {
        paymentCategory,
        status: 'UNPAID',
        size: 100,
      });
      const visibleCharges = filterAdminCampusChargeSummary(charges, {
        keyword: '',
        paymentCategory,
        status: 'UNPAID',
        userId: '',
      });
      const targets = dedupeNotificationTargets(
        visibleCharges.members
          .filter((member) => member.unpaidAmount > 0)
          .map((member) => toNotificationTargetFromChargeMember(member, paymentCategory)),
      );

      if (targets.length === 0) {
        throw new FaithLogApiError({
          kind: 'error',
          message: `${getPaymentCategoryLabel(paymentCategory)} 미납 알림을 받을 대상이 없습니다.`,
        });
      }

      const message = quickNotificationMessages[paymentCategory];
      setNotificationState({
        status: 'confirming',
        draft: {
          body: message.body,
          sourceLabel: message.sourceLabel,
          targetId: null,
          targetWeekStartDate: null,
          title: message.title,
        },
        targets,
      });
    } catch (error) {
      const apiError = toApiError(error, '미납 알림 대상을 불러오지 못했습니다.');
      const message = quickNotificationMessages[paymentCategory];
      setNotificationState({
        status: 'failed',
        draft: {
          body: message.body,
          sourceLabel: message.sourceLabel,
          targetId: null,
          targetWeekStartDate: null,
          title: message.title,
        },
        error: apiError,
        targetCount: 0,
      });
      void handleAuthError(apiError, setAuthState);
    } finally {
      setChargeReminderLoadingCategory(null);
    }
  };

  const updateNotificationSendForm = (patch: Partial<AdminNotificationSendForm>) => {
    setNotificationSendForm((current) => ({...current, ...patch}));
  };

  const toggleNotificationTarget = (userId: number) => {
    setNotificationSendForm((current) => {
      const selected = current.selectedUserIds.includes(userId)
        ? current.selectedUserIds.filter((selectedUserId) => selectedUserId !== userId)
        : [...current.selectedUserIds, userId];

      return {...current, selectedUserIds: selected, targetMode: 'SELECTED'};
    });
  };

  const openManualNotificationConfirm = async () => {
    if (notificationState.status === 'sending') {
      return;
    }

    setActionError(null);

    try {
      if (loadState.status !== 'success') {
        throw new FaithLogApiError({
          kind: 'error',
          message: '알림 발송 대상 정보를 다시 불러와 주세요.',
        });
      }

      const draft = toNotificationDraft(notificationSendForm, weekStartDate);
      const targets = await resolveNotificationTargets(
        notificationSendForm,
        loadState.members,
      );

      if (targets.length === 0) {
        throw new FaithLogApiError({
          kind: 'error',
          message: '알림을 받을 대상을 선택해 주세요.',
        });
      }

      setNotificationState({status: 'confirming', draft, targets});
    } catch (error) {
      const apiError = toApiError(error, '알림 발송 입력값을 확인해 주세요.');
      setNotificationState({
        status: 'failed',
        draft: {
          body: notificationSendForm.body.trim() || '알림 본문',
          sourceLabel: getNotificationTargetModeLabel(notificationSendForm.targetMode),
          targetId: null,
          targetWeekStartDate: weekStartDate,
          title: notificationSendForm.title.trim() || '알림',
        },
        error: apiError,
        targetCount: 0,
      });
      void handleAuthError(apiError, setAuthState);
    }
  };

  const resolveNotificationTargets = async (
    form: AdminNotificationSendForm,
    members: AdminCampusMember[],
  ) => {
    switch (form.targetMode) {
      case 'ALL':
        return members.map(toNotificationTargetFromCampusMember);
      case 'SELECTED':
        return members
          .filter((member) => form.selectedUserIds.includes(member.userId))
          .map(toNotificationTargetFromCampusMember);
      case 'MISSING_DEVOTION': {
        const missingMembers =
          missingDevotionState.status === 'success'
            ? missingDevotionState.members
            : await fetchMissingDevotionTargets();

        return missingMembers.map(toNotificationTargetFromMissingMember);
      }
      default:
        return assertNever(form.targetMode);
    }
  };

  const fetchMissingDevotionTargets = async () => {
    const accessToken = await resolveAccessToken(setAuthState);

    if (!accessToken) {
      return [];
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

    return missingMembers;
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
    const draft = notificationState.draft;
    setNotificationState({status: 'sending', draft, targets});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(setAuthState);

      if (!accessToken) {
        return;
      }

      const result = await sendAdminNotification(accessToken, campusId, {
        notificationType: 'CUSTOM',
        targetUserIds: targets.map((target) => target.userId),
        targetWeekStartDate: draft.targetWeekStartDate,
        targetId: draft.targetId,
        title: draft.title,
        body: draft.body,
      });

      setNotificationState({status: 'sent', draft, result, targetCount: targets.length});
      setNotice({
        tone: result.skippedCount > 0 ? 'warning' : 'success',
        title: `${draft.sourceLabel} 알림 발송`,
        message: `${result.queuedCount}명 큐잉, ${result.skippedCount}명 스킵 처리되었습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '알림을 발송하지 못했습니다.');
      setNotificationState({status: 'failed', draft, error: apiError, targetCount: targets.length});
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

  const assignMeal = async (member: AdminCampusMember) => {
    if (actionState.status !== 'idle') return;
    const gate = mealDutyMutationGateRef.current;
    const operationId = beginMealMutation(
      gate,
      `${campusId}:${getAuthSessionGeneration()}:meal-duty`,
    );
    if (operationId === null) return;
    const operationCampusId = campusId;
    const operationGeneration = getAuthSessionGeneration();
    let mutationSucceeded = false;

    setActionState({status: 'assigningMeal', userId: member.userId});
    setActionError(null);
    try {
      const access = await resolveMealDutyMutationAccess(operationId, operationCampusId);
      if (!access) return;

      await mealApi.assignDuty(access.accessToken, operationCampusId, {userId: member.userId});
      if (
        !isMealDutyOperationMounted(operationId, operationCampusId) ||
        !isAuthSessionGenerationCurrent(access.generation)
      ) return;
      mutationSucceeded = true;
      setNotice({
        tone: 'success',
        title: '밥 담당자 지정',
        message: `${member.name}님을 밥 담당자로 지정했습니다. 기존 밥 담당자는 그대로 유지됩니다.`,
      });
      if (!(await refreshMealDutyAdminState(operationId, operationCampusId))) {
        if (!isMealDutyOperationMounted(operationId, operationCampusId)) return;
        setNotice({
          tone: 'warning',
          title: '밥 담당자 지정 완료',
          message: '지정은 완료됐지만 최신 담당자 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.',
        });
      }
    } catch (error) {
      if (mutationSucceeded) {
        if (isMealDutyOperationMounted(operationId, operationCampusId)) {
          setNotice({
            tone: 'warning',
            title: '밥 담당자 지정 완료',
            message: '지정은 완료됐지만 최신 담당자 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.',
          });
        }
        return;
      }
      const apiError = toApiError(error, '밥 담당자를 지정하지 못했습니다.');
      if (
        isMealDutyOperationMounted(operationId, operationCampusId) &&
        shouldHandleRequestError(
          apiError,
          operationGeneration,
          getAuthSessionGeneration(),
        )
      ) {
        setActionError(apiError);
        void handleAuthError(apiError, setAuthState);
      }
    } finally {
      if (finishMealMutationForScope({
        currentScope: mealDutyCampusIdRef.current,
        gate,
        mounted: penaltyRuleMountedRef.current,
        operationId,
        operationScope: operationCampusId,
      })) {
        setActionState({status: 'idle'});
      }
    }
  };

  const revokeMeal = async (assignment: DutyAssignment) => {
    if (actionState.status !== 'idle') return;
    const gate = mealDutyMutationGateRef.current;
    const operationId = beginMealMutation(
      gate,
      `${campusId}:${getAuthSessionGeneration()}:meal-duty`,
    );
    if (operationId === null) return;
    const operationCampusId = campusId;
    const operationGeneration = getAuthSessionGeneration();
    let mutationSucceeded = false;

    setActionState({status: 'revokingMeal', assignmentId: assignment.assignmentId});
    setActionError(null);
    try {
      const access = await resolveMealDutyMutationAccess(operationId, operationCampusId);
      if (!access) return;

      await mealApi.revokeDuty(access.accessToken, operationCampusId, assignment.assignmentId);
      if (
        !isMealDutyOperationMounted(operationId, operationCampusId) ||
        !isAuthSessionGenerationCurrent(access.generation)
      ) return;
      mutationSucceeded = true;
      setNotice({
        tone: 'success',
        title: '밥 담당자 해제',
        message: `${assignment.name}님의 밥 담당자 배정을 해제했습니다.`,
      });
      if (!(await refreshMealDutyAdminState(operationId, operationCampusId))) {
        if (!isMealDutyOperationMounted(operationId, operationCampusId)) return;
        setNotice({
          tone: 'warning',
          title: '밥 담당자 해제 완료',
          message: '해제는 완료됐지만 최신 담당자 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.',
        });
      }
    } catch (error) {
      if (mutationSucceeded) {
        if (isMealDutyOperationMounted(operationId, operationCampusId)) {
          setNotice({
            tone: 'warning',
            title: '밥 담당자 해제 완료',
            message: '해제는 완료됐지만 최신 담당자 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.',
          });
        }
        return;
      }
      const apiError = toApiError(error, '밥 담당자 배정을 해제하지 못했습니다.');
      if (
        isMealDutyOperationMounted(operationId, operationCampusId) &&
        shouldHandleRequestError(
          apiError,
          operationGeneration,
          getAuthSessionGeneration(),
        )
      ) {
        setActionError(apiError);
        void handleAuthError(apiError, setAuthState);
      }
    } finally {
      if (finishMealMutationForScope({
        currentScope: mealDutyCampusIdRef.current,
        gate,
        mounted: penaltyRuleMountedRef.current,
        operationId,
        operationScope: operationCampusId,
      })) {
        setActionState({status: 'idle'});
      }
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

  const selectAdminTab = (nextTab: AdminTab) => {
    const changeTab = () => {
      if (tab === 'settlement' && nextTab !== 'settlement') {
        invalidateAdminChargeRead(chargeReadCoordinatorRef.current);
        setAdminChargeViewDetail(chargeViewIdentityRef.current, null);
        setChargeDetailState({status: 'idle'});
      }
      resetPenaltyRuleFlow();
      setSelectedMemberId(null);
      setActionError(null);
      setTab(nextTab);
    };

    if (penaltyRuleFlow.route !== 'list') {
      requestPenaltyRuleFlowExit(changeTab);
      return;
    }

    changeTab();
  };

  const openMemberRoles = () => {
    setSelectedMemberId(null);
    setMemberSection('roles');
    setTab('members');
  };

  const openPrayerManagement = () => {
    setSelectedMemberId(null);
    setDevotionSection('prayer');
    setTab('devotion');
  };

  if (loadState.status === 'loading') {
    return <Loading message="관리자 홈, 멤버, 커피 담당자 정보를 불러오고 있어요." />;
  }

  if (loadState.status === 'error') {
    return <AdminErrorState error={loadState.error} onRetry={loadAdmin} />;
  }

  if (loadState.status === 'empty') {
    return (
      <View style={styles.adminModeFrame}>
        <ScrollView
          contentContainerStyle={[
            styles.adminModeContent,
            Platform.OS === 'android'
              ? {paddingBottom: androidShellInsets.shellContentBottomPadding}
              : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.adminModeScroll}>
          <AdminShellHeader
            activeTab={tab}
            campusLabel={getCampusLabel(state)}
            onOpenUserMode={onBackToUserMode}
          />
          <AdminHome
            prayerState={prayerState}
            summary={loadState.summary}
            onOpenMembers={() => setTab('members')}
            onOpenPrayer={openPrayerManagement}
          />
          <Empty
            title="활성 멤버가 없습니다"
            message="현재 캠퍼스에서 운영 중인 멤버만 목록에 표시됩니다."
            actionLabel="다시 불러오기"
            actionAccessibilityLabel="관리자 멤버 목록 다시 불러오기"
            onActionPress={loadAdmin}
          />
        </ScrollView>
        <AdminBottomNav
          activeTab={tab}
          bottomInset={androidShellInsets.bottomNavInset}
          onSelectTab={selectAdminTab}
        />
      </View>
    );
  }

  const coffeeDuty = getActiveCoffeeDuty(loadState.duties);
  const activeMealDuties = getActiveMealDuties(loadState.duties);
  const selectedMember = selectedMemberId
    ? loadState.members.find((member) => member.membershipId === selectedMemberId) ?? null
    : null;
  if (!selectedMember && tab === 'members' && memberSection === 'list') {
    return (
      <AdminMemberListRoute
        actionError={actionError}
        bottomInset={androidShellInsets.bottomNavInset}
        campusLabel={getCampusLabel(state)}
        contentBottomPadding={androidShellInsets.shellContentBottomPadding}
        filter={memberFilter}
        inviteCodeCopyState={inviteCodeCopyState}
        inviteCodeState={inviteCodeState}
        memberSearch={memberSearch}
        members={loadState.members}
        onChangeMemberSearch={setMemberSearch}
        onChangeSection={setMemberSection}
        onCopyInviteCode={copyInviteCode}
        onOpenUserMode={onBackToUserMode}
        onSelectFilter={setMemberFilter}
        onSelectMember={selectMember}
        onSelectTab={selectAdminTab}
      />
    );
  }

  return (
    <View style={styles.adminModeFrame}>
      <ScrollView
        contentContainerStyle={[
          styles.adminModeContent,
          Platform.OS === 'android'
            ? {paddingBottom: androidShellInsets.shellContentBottomPadding}
            : null,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.adminModeScroll}>
      <AdminShellHeader
        activeTab={tab}
        campusLabel={getCampusLabel(state)}
        onOpenUserMode={() => requestPenaltyRuleFlowExit(onBackToUserMode)}
      />
      {actionError && !(
        tab === 'settlement' &&
        settlementSection === 'penaltyRules' &&
        penaltyRuleFlow.route !== 'list'
      ) ? (
        <AdminInlineError error={actionError} exposeValidationMessage />
      ) : null}
      {selectedMember ? (
        <AdminMemberDetail
          actionState={actionState}
          activeMealDuties={activeMealDuties}
          coffeeDuty={coffeeDuty}
          globalRole={state.user.role}
          member={selectedMember}
          onAssignCoffee={() => assignCoffee(selectedMember)}
          onAssignMeal={() => assignMeal(selectedMember)}
          onBack={() => setSelectedMemberId(null)}
          onRequestDelete={() => setDeleteTarget(selectedMember)}
          onRevokeCoffee={revokeCoffee}
          onRevokeMeal={revokeMeal}
          onUpdateRole={(role) => updateRole(selectedMember, role)}
          selectedCampusRole={state.selectedCampus.campusRole}
        />
      ) : tab === 'home' ? (
        <AdminHome
          coffeeDuty={coffeeDuty}
          prayerState={prayerState}
          summary={loadState.summary}
          onOpenMembers={() => setTab('members')}
          onOpenPrayer={openPrayerManagement}
          onOpenRoles={openMemberRoles}
        />
      ) : tab === 'devotion' ? (
        <AdminDevotionPage
          assignableMembersState={assignablePrayerMembersState}
          campusId={campusId}
          devotionSection={devotionSection}
          members={loadState.members}
          missingState={missingDevotionState}
          notificationSendState={notificationState}
          onChangeDevotionSection={setDevotionSection}
          onChangePrayerGroupForm={(patch) =>
            setPrayerGroupForm((current) => ({...current, ...patch}))
          }
          onChangePrayerMembersForm={(patch) =>
            setPrayerGroupMembersForm((current) => ({...current, ...patch}))
          }
          onChangePrayerSeasonForm={(patch) =>
            setPrayerSeasonForm((current) => ({...current, ...patch}))
          }
          onChangeWeek={changeMissingWeek}
          onEditPrayerGroup={editPrayerGroup}
          onOpenNotificationConfirm={openNotificationConfirm}
          onOpenPrayerCloseSeason={openPrayerSeasonCloseConfirm}
          onRetryMissing={loadMissingDevotions}
          onRetryPrayer={loadPrayerBoard}
          onSavePrayerGroup={savePrayerGroup}
          onSavePrayerSeason={savePrayerSeason}
          prayerActionState={actionState}
          prayerBoardState={prayerState}
          prayerGroupForm={prayerGroupForm}
          prayerMembersForm={prayerGroupMembersForm}
          prayerSeasonForm={prayerSeasonForm}
          setAuthState={setAuthState}
          summary={loadState.summary}
          weekStartDate={weekStartDate}
        />
      ) : tab === 'polls' ? (
        <AdminPollManagement
          campusId={campusId}
          currentUserId={state.user.id}
          knownOwnedCoffeeAccountIds={knownOwnedCoffeeAccountIds}
          onRequestCoffeeAccountCreate={() => {
            setTab('settlement');
            setSettlementSection('accounts');
            setSelectedPaymentAccount(null);
            setActionError(null);
            setPaymentAccountForm((current) => ({
              ...current,
              accountType: 'COFFEE',
              nickname: current.nickname.trim() ? current.nickname : '커피 계좌',
            }));
          }}
          onSessionStateChange={setAuthState}
          setNotice={setNotice}
        />
      ) : tab === 'notificationLogs' ? (
        <AdminNotificationCenter
          filters={notificationLogFilters}
          form={notificationSendForm}
          members={loadState.members}
          onChangeFilter={updateNotificationLogFilter}
          onChangePage={changeNotificationLogPage}
          onChangeSection={(section) => {
            setNotificationSection(section);
            setSelectedNotificationLogId(null);
          }}
          onChangeSendForm={updateNotificationSendForm}
          onClearFilters={() => {
            setNotificationLogFilters(emptyNotificationLogFilters);
            setSelectedNotificationLogId(null);
            void loadNotificationLogs(emptyNotificationLogFilters);
          }}
          onOpenConfirm={() => void openManualNotificationConfirm()}
          onRetry={() => void loadNotificationLogs()}
          onSearch={() => {
            const nextFilters = {...notificationLogFilters, page: 0};
            setNotificationLogFilters(nextFilters);
            void loadNotificationLogs(nextFilters);
          }}
          onSelectLog={setSelectedNotificationLogId}
          onToggleTarget={toggleNotificationTarget}
          section={notificationSection}
          selectedLogId={selectedNotificationLogId}
          sendState={notificationState}
          state={notificationLogState}
          weekStartDate={weekStartDate}
        />
      ) : tab === 'prayer' ? (
        <AdminPrayerManagement
          actionState={actionState}
          assignableMembersState={assignablePrayerMembersState}
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
          onSaveSeason={savePrayerSeason}
          seasonForm={prayerSeasonForm}
          weekStartDate={weekStartDate}
        />
      ) : tab === 'settlement' ? (
          <AdminSettlement
            actionState={actionState}
            chargeReminderLoadingCategory={chargeReminderLoadingCategory}
            detailState={chargeDetailState}
            filters={chargeFilters}
            currentUserId={state.user.id}
            knownOwnedCoffeeAccountIds={knownOwnedCoffeeAccountIds}
            notificationState={notificationState}
            penaltyRuleError={actionError}
            penaltyRuleFlow={penaltyRuleFlow}
            onBackPenaltyRule={() => requestPenaltyRuleFlowExit()}
            onChangePaymentAccountForm={(patch) =>
              setPaymentAccountForm((current) => ({...current, ...patch}))
            }
          onChangePenaltyRuleForm={(patch) =>
            setPenaltyRuleForm((current) => ({...current, ...patch}))
          }
          onChangeSection={(section) => {
            const changeSection = () => {
              if (section !== 'charges') {
                invalidateAdminChargeRead(chargeReadCoordinatorRef.current);
                setAdminChargeViewDetail(chargeViewIdentityRef.current, null);
              }
              resetPenaltyRuleFlow();
              setSettlementSection(section);
              setSelectedPaymentAccount(null);
              setActionError(null);
            };

            if (penaltyRuleFlow.route !== 'list') {
              requestPenaltyRuleFlowExit(changeSection);
              return;
            }

            changeSection();
          }}
          onBackToSummary={() => {
            invalidateAdminChargeRead(chargeReadCoordinatorRef.current, 'detail');
            setAdminChargeViewDetail(chargeViewIdentityRef.current, null);
            setChargeDetailState({status: 'idle'});
          }}
          onActivatePaymentAccount={(account) => void activatePaymentAccount(account)}
          onCopyPaymentAccount={copyAccountNumber}
          onEditPenaltyRule={editPenaltyRule}
          onOpenPenaltyRuleCreate={openPenaltyRuleCreate}
          onOpenChargeReminderConfirm={(paymentCategory) =>
            void openChargeReminderConfirm(paymentCategory)
          }
          onOpenMemberCharges={openMemberCharges}
          onRequestDeletePaymentAccount={setPaymentAccountDeleteTarget}
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
          onUpdateFilter={updateChargeFilter}
          paymentAccountForm={paymentAccountForm}
          paymentAccountCopyFeedback={accountCopyFeedback}
          paymentAccountCopyOpacity={accountCopyOpacity}
          paymentAccountState={paymentAccountState}
          penaltyRuleForm={penaltyRuleForm}
          penaltyRuleState={penaltyRuleState}
          section={settlementSection}
          selectedPaymentAccount={selectedPaymentAccount}
          settlementState={settlementState}
        />
      ) : tab === 'members' ? (
        <AdminMemberPage
          actionState={actionState}
          coffeeDuty={coffeeDuty}
          filter={memberFilter}
          globalRole={state.user.role}
          inviteCodeCopyState={inviteCodeCopyState}
          inviteCodeState={inviteCodeState}
          memberSearch={memberSearch}
          members={loadState.members}
          onAssignCoffee={assignCoffee}
          onChangeSection={setMemberSection}
          onCopyInviteCode={copyInviteCode}
          onChangeMemberSearch={setMemberSearch}
          onRevokeCoffee={revokeCoffee}
          onSelectFilter={setMemberFilter}
          onSelectMember={(member) => setSelectedMemberId(member.membershipId)}
          onSelectRoleFilter={setRoleFilter}
          roleFilter={roleFilter}
          section={memberSection}
          selectedCampusRole={state.selectedCampus.campusRole}
        />
      ) : (
        <AdminRoleManagement
          filter={roleFilter}
          globalRole={state.user.role}
          members={loadState.members}
          onSelectFilter={setRoleFilter}
          onSelectMember={(member) => setSelectedMemberId(member.membershipId)}
          selectedCampusRole={state.selectedCampus.campusRole}
        />
      )}
      </ScrollView>
      <AdminBottomNav
        activeTab={tab}
        bottomInset={androidShellInsets.bottomNavInset}
        onSelectTab={selectAdminTab}
      />
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
      <NotificationSentSheet
        onClose={() => setNotificationState({status: 'idle'})}
        state={notificationState}
      />
      <ChargeStatusConfirmSheet
        error={actionError}
        loading={actionState.status === 'changingChargeStatus'}
        onCancel={() => setChargeStatusConfirm(null)}
        onConfirm={confirmChargeStatusChange}
        target={chargeStatusConfirm}
      />
      <DeactivatePaymentAccountSheet
        account={paymentAccountDeactivateTarget}
        copyFeedback={accountCopyFeedback}
        copyOpacity={accountCopyOpacity}
        error={actionError}
        loading={actionState.status === 'deactivatingPaymentAccount'}
        onCancel={() => setPaymentAccountDeactivateTarget(null)}
        onCopyAccount={copyAccountNumber}
        onConfirm={confirmDeactivatePaymentAccount}
      />
      <DeletePaymentAccountSheet
        account={paymentAccountDeleteTarget}
        copyFeedback={accountCopyFeedback}
        copyOpacity={accountCopyOpacity}
        error={actionError}
        loading={actionState.status === 'deletingPaymentAccount'}
        onCancel={() => setPaymentAccountDeleteTarget(null)}
        onCopyAccount={copyAccountNumber}
        onConfirm={confirmDeletePaymentAccount}
      />
      <PrayerSeasonCloseSheet
        error={actionError}
        loading={actionState.status === 'closingPrayerSeason'}
        onCancel={() => setPrayerSeasonCloseTarget(null)}
        onConfirm={confirmClosePrayerSeason}
        target={prayerSeasonCloseTarget}
      />
    </View>
  );
}

function AdminShellHeader({
  activeTab,
  campusLabel,
  onOpenUserMode,
}: {
  activeTab: AdminTab;
  campusLabel: string;
  onOpenUserMode: () => void;
}) {
  return (
    <View style={styles.adminShellHeader}>
      <FaithLogHeaderTopRow campusLabel={campusLabel} contextLabel="관리자">
        <FaithLogHeaderPillButton
          accessibilityLabel="일반 사용자로 이동"
          label="사용자"
          onPress={onOpenUserMode}
        />
      </FaithLogHeaderTopRow>
      <Text
        adjustsFontSizeToFit
        ellipsizeMode="tail"
        minimumFontScale={0.82}
        numberOfLines={1}
        style={styles.adminScreenTitle}>
        {getAdminShellTitle(activeTab)}
      </Text>
    </View>
  );
}

function AdminBottomNav({
  activeTab,
  bottomInset,
  onSelectTab,
}: {
  activeTab: AdminTab;
  bottomInset: number;
  onSelectTab: (tab: AdminTab) => void;
}) {
  return (
    <View
      style={[
        styles.adminBottomNavFrame,
        Platform.OS === 'android' ? {paddingBottom: bottomInset} : null,
      ]}>
      <View style={styles.adminBottomNavContent}>
        {adminBottomTabs.map((item) => {
          const selected = item.id === activeTab;

          return (
            <Pressable
              accessibilityLabel={`${item.label} 관리자 섹션으로 이동`}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              key={item.id}
              onPress={() => onSelectTab(item.id)}
              style={({pressed}) => [
                styles.adminBottomNavItem,
                selected ? styles.adminBottomNavItemActive : null,
                pressed ? styles.adminBottomNavItemPressed : null,
              ]}>
              <IconexIcon
                color={selected ? adminFigmaTokens.primary : adminFigmaTokens.textMuted}
                name={getAdminTabIcon(item.id)}
                size={18}
                strokeWidth={1.7}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.adminBottomNavLabel,
                  selected ? styles.adminBottomNavLabelActive : null,
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

function getPrayerMissingMetricValue(prayerState: AdminPrayerState) {
  if (prayerState.status === 'success' || prayerState.status === 'empty') {
    return `${Math.max(0, prayerState.board.targetMemberCount - prayerState.board.submittedCount)}명`;
  }

  if (prayerState.status === 'loading') {
    return '조회 중';
  }

  return '확인 필요';
}

function AdminHome({
  onOpenPrayer,
  onOpenRoles,
  prayerState,
  summary,
}: {
  coffeeDuty?: DutyAssignment | null;
  onOpenMembers?: () => void;
  onOpenPrayer?: () => void;
  onOpenRoles?: () => void;
  prayerState: AdminPrayerState;
  summary: AdminDashboardSummary;
}) {
  return (
    <>
      <Card>
        <Eyebrow>오늘 운영</Eyebrow>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.adminHomeCampusTitle}>
          {summary.campus.campusName}
        </Text>
        <View style={styles.metricGrid}>
          <Metric label="ACTIVE 멤버" value={`${summary.members.activeCount}명`} />
          <Metric label="캠퍼스 관리자" value={`${summary.members.adminCount}명`} />
          <Metric label="미제출" value={`${summary.devotion.missingCount}명`} />
          <Metric label="제출률" value={`${summary.devotion.submitRate}%`} />
          <Metric label="기도 미제출" value={getPrayerMissingMetricValue(prayerState)} />
          <Metric label="벌금 미납" value={formatCompactWon(getPenaltyUnpaidAmount(summary))} />
        </View>
      </Card>
      <Card>
        <Eyebrow>바로가기</Eyebrow>
        {onOpenRoles ? (
          <ListRow
            label="역할 관리"
            supportingText="캠퍼스 권한 변경"
            value="보기"
            onPress={onOpenRoles}
            accessibilityLabel="관리자 역할 관리 화면으로 이동"
          />
        ) : null}
        {onOpenPrayer ? (
          <ListRow
            label="기도 관리"
            supportingText="운영 기간, 조, 조원 배정"
            value="보기"
            onPress={onOpenPrayer}
            accessibilityLabel="관리자 기도 관리 화면으로 이동"
          />
        ) : null}
      </Card>
    </>
  );
}

function getPenaltyUnpaidAmount(summary: AdminDashboardSummary) {
  return (
    summary.charges.byCategory.find((category) => category.paymentCategory === 'PENALTY')
      ?.unpaidAmount ?? 0
  );
}

type AdminPollSection = 'manage' | 'create' | 'results' | 'missing' | 'templates' | 'status';
type AdminPollPrimarySection = 'ongoing' | 'closed' | 'create' | 'templates';
type AdminPollCreateStep = 'type' | 'detail';
type AdminPollTemplateStep = 'info' | 'schedule' | 'options' | 'confirm';
type AdminPollTemplateMode = 'list' | 'editor';
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
type PollCloseTarget = PollSummary | null;
type AdminCoffeeCatalogState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; brands: CoffeeBrand[]; menus: CoffeeMenu[]}
  | {status: 'error'; error: ApiError};
type AdminPollActionState =
  | {status: 'idle'}
  | {status: 'savingTemplate'}
  | {status: 'deletingTemplate'; templateId: number}
  | {status: 'creatingPoll'}
  | {status: 'closingPoll'; pollId: number}
  | {status: 'sendingMissingNotice'};
type AdminPollLoadOptions = {
  focusPoll?: AdminPoll | null;
};

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
  allowUserOptionAdd: boolean;
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

const pollPrimarySections: Array<{id: AdminPollPrimarySection; label: string}> = [
  {id: 'ongoing', label: '진행'},
  {id: 'closed', label: '마감'},
  {id: 'create', label: '생성'},
  {id: 'templates', label: '반복'},
];

const adminPollWeekdays: Array<{id: string; label: string}> = [
  {id: '1', label: '월'},
  {id: '2', label: '화'},
  {id: '3', label: '수'},
  {id: '4', label: '목'},
  {id: '5', label: '금'},
  {id: '6', label: '토'},
  {id: '7', label: '일'},
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
  {id: 'WEDNESDAY', label: '수요'},
  {id: 'SATURDAY', label: '토요'},
];

const adminPollCreateTypes: Array<{id: AdminPollType; label: string}> = [
  {id: 'COFFEE', label: '커피 주문'},
  {id: 'WEDNESDAY', label: '수요예배 참석'},
  {id: 'SATURDAY', label: '토요 목자모임'},
  {id: 'CUSTOM', label: '커스텀 투표'},
];

const adminPollTemplateSteps: Array<{id: AdminPollTemplateStep; label: string}> = [
  {id: 'info', label: '투표 정보'},
  {id: 'schedule', label: '반복 일정'},
  {id: 'options', label: '선택지'},
  {id: 'confirm', label: '확인'},
];

const adminPollSelectionTypes: Array<{id: AdminPollSelectionType; label: string}> = [
  {id: 'SINGLE', label: '단일'},
  {id: 'MULTIPLE', label: '복수'},
];

const adminPollChargeTypes: Array<{id: AdminPollChargeGenerationType; label: string}> = [
  {id: 'NONE', label: '없음'},
  {id: 'OPTION_PRICE', label: '선택가'},
];

const defaultCoffeePollTemplateId = -136001;
const defaultCoffeePollOptionsText = 'menu:4';
const adminPollDefaultDeadlineOffsetMs = 60 * 60 * 1000;
const adminPollDeadlineValidationMessage = '마감 일시는 현재 시각 이후로 선택해 주세요.';

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
    allowUserOptionAdd: true,
    chargeGenerationType: 'OPTION_PRICE',
    endsAt: endsAt.toISOString(),
    isAnonymous: false,
    optionsText: defaultCoffeePollOptionsText,
    paymentAccountId: '',
    paymentCategory: 'COFFEE',
    pollType: 'COFFEE',
    selectionType: 'SINGLE',
    startsAt: startsAt.toISOString(),
    templateId: '',
    title: '커피 주문',
  };
}

function AdminPollManagement({
  campusId,
  currentUserId,
  knownOwnedCoffeeAccountIds,
  onRequestCoffeeAccountCreate,
  onSessionStateChange,
  setNotice,
}: {
  campusId: number;
  currentUserId: number;
  knownOwnedCoffeeAccountIds: Set<number>;
  onRequestCoffeeAccountCreate: () => void;
  onSessionStateChange: (state: AuthGateState) => void;
  setNotice: (notice: Notice) => void;
}) {
  const [section, setSection] = useState<AdminPollSection>('manage');
  const [listState, setListState] = useState<AdminPollListState>({status: 'loading'});
  const [coffeeCatalogState, setCoffeeCatalogState] = useState<AdminCoffeeCatalogState>({
    status: 'idle',
  });
  const [resultState, setResultState] = useState<AdminPollResultState>({status: 'idle'});
  const [missingState, setMissingState] = useState<AdminPollMissingState>({status: 'idle'});
  const [actionState, setActionState] = useState<AdminPollActionState>({status: 'idle'});
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [createStep, setCreateStep] = useState<AdminPollCreateStep>('type');
  const [templateStep, setTemplateStep] = useState<AdminPollTemplateStep>('info');
  const [templateMode, setTemplateMode] = useState<AdminPollTemplateMode>('list');
  const [pollTypeFilter, setPollTypeFilter] = useState<AdminPollTypeFilter>('ALL');
  const [pollStatusTab, setPollStatusTab] = useState<AdminPollStatusTab>('ongoing');
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null);
  const [pollCloseTarget, setPollCloseTarget] = useState<PollCloseTarget>(null);
  const [templateDeleteTarget, setTemplateDeleteTarget] = useState<AdminPollTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<AdminPollTemplateForm>(
    emptyAdminPollTemplateForm,
  );
  const [pollForm, setPollForm] = useState<AdminPollCreateForm>(() =>
    createEmptyAdminPollForm(),
  );

  const loadPolls = async (options: AdminPollLoadOptions = {}) => {
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
        fetchAdminPaymentAccounts(accessToken, campusId, {
          accountType: 'COFFEE',
          includeInactive: true,
        })
          .catch((error) => {
            if (isPaymentAccountListEndpointMissing(error)) {
              return fetchPaymentAccounts(accessToken, campusId, {accountType: 'COFFEE'});
            }

            throw error;
          }),
      ]);

      const nextPolls = options.focusPoll
        ? mergePollSummaries(polls, toPollSummary(options.focusPoll))
        : polls;

      setListState(
        nextPolls.length === 0 && templates.length === 0
          ? {status: 'empty', accounts, polls: nextPolls, templates}
          : {status: 'success', accounts, polls: nextPolls, templates},
      );

      if (options.focusPoll) {
        setSelectedPollId(options.focusPoll.id);
      } else if (!selectedPollId && nextPolls[0]) {
        setSelectedPollId(nextPolls[0].id);
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

  const loadCoffeeCatalog = async () => {
    setCoffeeCatalogState({status: 'loading'});

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const brands = await fetchCoffeeBrands(accessToken);
      const menuGroups = await Promise.all(
        brands.map((brand) => fetchCoffeeMenus(accessToken, brand.id)),
      );
      const menus = menuGroups
        .flat()
        .sort((left, right) => left.brandId - right.brandId || left.id - right.id);

      setCoffeeCatalogState({status: 'success', brands, menus});
    } catch (error) {
      const apiError = toApiError(error, '커피 메뉴를 불러오지 못했습니다.');
      setCoffeeCatalogState({status: 'error', error: apiError});
      void handleAuthError(apiError, onSessionStateChange);
    }
  };

  useEffect(() => {
    if (
      ((section === 'create' && createStep === 'detail' && pollForm.pollType === 'COFFEE') ||
        (section === 'templates' && templateForm.pollType === 'COFFEE')) &&
      coffeeCatalogState.status === 'idle'
    ) {
      void loadCoffeeCatalog();
    }
  }, [
    coffeeCatalogState.status,
    createStep,
    pollForm.pollType,
    section,
    templateForm.pollType,
  ]);

  const templates =
    listState.status === 'success' || listState.status === 'empty' ? listState.templates : [];
  const displayTemplates = getVisibleAdminPollTemplates(templates);
  const polls =
    listState.status === 'success' || listState.status === 'empty' ? listState.polls : [];
  const accounts =
    listState.status === 'success' || listState.status === 'empty' ? listState.accounts : [];
  const pollListNow = new Date();
  const statusPolls = getAdminPollsForStatusTab(
    polls,
    pollStatusTab,
    pollListNow,
    selectedPollId,
  );
  const filteredPolls = getAdminPollsForStatusTab(
    filterAdminPollsByType(polls, pollTypeFilter),
    pollStatusTab,
    pollListNow,
    selectedPollId,
  );
  const visiblePolls = prioritizeAdminPolls(filteredPolls, selectedPollId);
  const selectedPoll = selectedPollId
    ? polls.find((poll) => poll.id === selectedPollId) ?? null
    : null;
  const busy = actionState.status !== 'idle';
  const coffeeWarning = getAdminPollCoffeeWarning(
    pollForm,
    accounts,
    currentUserId,
    knownOwnedCoffeeAccountIds,
  );

  const saveTemplate = async () => {
    if (busy) {
      return;
    }

    const templateValidationMessage = getAdminPollTemplateStepError(
      'confirm',
      templateForm,
      coffeeCatalogState,
    );

    if (templateValidationMessage) {
      setActionError({kind: 'error', message: templateValidationMessage});
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
        templateForm.templateId === null || isDefaultCoffeePollTemplateId(templateForm.templateId)
          ? await createAdminPollTemplate(accessToken, campusId, request)
          : await updateAdminPollTemplate(
              accessToken,
              campusId,
              templateForm.templateId,
              request,
            );

      setTemplateForm(toTemplateForm(saved));
      await loadPolls();
      setTemplateStep('info');
      setTemplateMode('list');
      setSection('templates');
    } catch (error) {
      const apiError = toApiError(error, '반복투표를 저장하지 못했습니다.');
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

    const deadlineValidationMessage = getAdminPollDeadlineValidationMessage(pollForm);

    if (deadlineValidationMessage) {
      setActionError({kind: 'error', message: deadlineValidationMessage});
      return;
    }

    const coffeeValidationMessage = getAdminPollCoffeeWarning(
      pollForm,
      accounts,
      currentUserId,
      knownOwnedCoffeeAccountIds,
    );

    if (coffeeValidationMessage) {
      setActionError({kind: 'error', message: coffeeValidationMessage});
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
      setPollStatusTab('ongoing');
      setPollTypeFilter('ALL');
      await loadPolls({focusPoll: created});
      setSection('manage');
    } catch (error) {
      const apiError = toApiError(error, '투표를 생성하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, onSessionStateChange);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!templateDeleteTarget || busy || isDefaultCoffeePollTemplate(templateDeleteTarget)) {
      return;
    }

    const target = templateDeleteTarget;
    setActionState({status: 'deletingTemplate', templateId: target.id});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const deleted = await deleteAdminPollTemplate(accessToken, campusId, target.id);
      setTemplateDeleteTarget(null);
      setTemplateForm(emptyAdminPollTemplateForm);
      setTemplateStep('info');
      setTemplateMode('list');
      setSection('templates');
      await loadPolls();
      setNotice({
        tone: 'warning',
        title: '반복투표 삭제',
        message: `${deleted.title} 반복투표를 삭제했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '반복투표를 삭제하지 못했습니다.');
      setActionError(apiError);
      void handleAuthError(apiError, onSessionStateChange);
    } finally {
      setActionState({status: 'idle'});
    }
  };

  const confirmClosePoll = async () => {
    if (!pollCloseTarget || busy) {
      return;
    }

    const target = pollCloseTarget;
    setActionState({status: 'closingPoll', pollId: target.id});
    setActionError(null);

    try {
      const accessToken = await resolveAccessToken(onSessionStateChange);

      if (!accessToken) {
        return;
      }

      const closed = await closeAdminPoll(accessToken, campusId, target.id);
      setPollCloseTarget(null);
      setSelectedPollId(closed.id);
      await loadPolls();
      setSection('results');
      await loadResults(closed.id);
      setNotice({
        tone: 'warning',
        title: '투표 종료',
        message: `${closed.title} 투표를 종료했습니다.`,
      });
    } catch (error) {
      const apiError = toApiError(error, '투표를 종료하지 못했습니다.');
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
      setActionError(
        result.skippedCount > 0
          ? {
              kind: 'error',
              message: `${result.queuedCount}명 알림 큐잉, ${result.skippedCount}명은 스킵되었습니다.`,
            }
          : null,
      );
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

  const startCreatePoll = () => {
    setPollForm(createEmptyAdminPollForm());
    setCreateStep('type');
    setSection('create');
  };

  const startCreateTemplate = () => {
    setTemplateDeleteTarget(null);
    setTemplateForm(emptyAdminPollTemplateForm);
    setTemplateStep('info');
    setTemplateMode('editor');
    setSection('templates');
  };

  const openTemplateList = () => {
    setTemplateDeleteTarget(null);
    setTemplateForm(emptyAdminPollTemplateForm);
    setTemplateStep('info');
    setTemplateMode('list');
    setSection('templates');
  };

  const editTemplate = (template: AdminPollTemplate) => {
    setTemplateDeleteTarget(null);
    setTemplateForm(toTemplateForm(template));
    setTemplateStep('info');
    setTemplateMode('editor');
    setSection('templates');
  };

  const activePrimarySection: AdminPollPrimarySection =
    section === 'create'
      ? 'create'
      : section === 'templates'
        ? 'templates'
        : pollStatusTab === 'closed'
          ? 'closed'
          : 'ongoing';
  const selectPrimarySection = (nextSection: AdminPollPrimarySection) => {
    setActionError(null);

    if (nextSection === 'create') {
      startCreatePoll();
      return;
    }

    if (nextSection === 'templates') {
      openTemplateList();
      return;
    }

    setPollStatusTab(nextSection);
    setSection('manage');
  };

  return (
    <>
      <AdminPollTopActions
        activeSection={activePrimarySection}
        onSelectSection={selectPrimarySection}
      />
      {actionError && section !== 'create' && section !== 'templates' ? (
        <AdminInlineError error={actionError} />
      ) : null}
      {listState.status === 'loading' ? (
        <Loading message="투표와 반복투표를 불러오고 있어요." />
      ) : listState.status === 'error' ? (
        <AdminErrorState error={listState.error} onRetry={loadPolls} />
      ) : (
        <>
          {section === 'manage' ? (
            <AdminPollList
              filter={pollTypeFilter}
              onChangeFilter={setPollTypeFilter}
              onRefresh={loadPolls}
              onClosePoll={setPollCloseTarget}
              onViewResults={(poll) => {
                selectPoll(poll);
                setSection('results');
                void loadResults(poll.id);
              }}
              hasPollsInStatusTab={statusPolls.length > 0}
              polls={visiblePolls}
              selectedPollId={selectedPollId}
              statusTab={pollStatusTab}
            />
          ) : null}
          {section === 'templates' ? (
            templateMode === 'editor' ? (
              <AdminPollTemplateEditor
                actionState={actionState}
                actionError={actionError}
                accounts={accounts}
                coffeeCatalogState={coffeeCatalogState}
                form={templateForm}
                onCancel={openTemplateList}
                onChangeForm={(patch) =>
                  setTemplateForm((current) => ({...current, ...patch}))
                }
                onChangeStep={setTemplateStep}
                onRetryCoffeeCatalog={loadCoffeeCatalog}
                onSave={saveTemplate}
                step={templateStep}
              />
            ) : (
              <AdminPollTemplateListPanel
                actionError={actionError}
                actionState={actionState}
                deleteTarget={templateDeleteTarget}
                onCancelDelete={() => setTemplateDeleteTarget(null)}
                onConfirmDelete={confirmDeleteTemplate}
                onDeleteTemplate={setTemplateDeleteTarget}
                onEditTemplate={editTemplate}
                onNewTemplate={startCreateTemplate}
                templates={displayTemplates}
              />
            )
          ) : null}
          {section === 'create' ? (
            <AdminPollCreatePanel
              actionError={actionError}
              accounts={accounts}
              busy={busy}
              coffeeCatalogState={coffeeCatalogState}
              createStep={createStep}
              coffeeWarning={coffeeWarning}
              currentUserId={currentUserId}
              form={pollForm}
              knownOwnedCoffeeAccountIds={knownOwnedCoffeeAccountIds}
              onCancel={() => {
                setPollForm(createEmptyAdminPollForm());
                setCreateStep('type');
                setSection('manage');
              }}
              onChangeForm={(patch) => setPollForm((current) => ({...current, ...patch}))}
              onChangeStep={setCreateStep}
              onCreate={createPoll}
              onRequestCoffeeAccountCreate={onRequestCoffeeAccountCreate}
              onRetryCoffeeCatalog={loadCoffeeCatalog}
              onReset={() => setPollForm(createEmptyAdminPollForm())}
              templates={displayTemplates}
            />
          ) : null}
          {section === 'results' ? (
            <AdminPollResultsPanel
              onLoad={() => void loadResults()}
              onClosePoll={setPollCloseTarget}
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
              onClosePoll={setPollCloseTarget}
              polls={polls}
              selectedPoll={selectedPoll}
            />
          ) : null}
          <PollCloseConfirmSheet
            error={actionError}
            loading={actionState.status === 'closingPoll'}
            onCancel={() => setPollCloseTarget(null)}
            onConfirm={confirmClosePoll}
            target={pollCloseTarget}
          />
        </>
      )}
    </>
  );
}

function AdminPollTopActions({
  activeSection,
  onSelectSection,
}: {
  activeSection: AdminPollPrimarySection;
  onSelectSection: (section: AdminPollPrimarySection) => void;
}) {
  return (
    <View style={styles.pollSectionShell}>
      <SegmentedControl
        items={pollPrimarySections}
        selectedId={activeSection}
        onSelect={onSelectSection}
      />
    </View>
  );
}

function AdminPollList({
  filter,
  hasPollsInStatusTab,
  onChangeFilter,
  onClosePoll,
  onRefresh,
  onViewResults,
  polls,
  selectedPollId,
  statusTab,
}: {
  filter: AdminPollTypeFilter;
  hasPollsInStatusTab: boolean;
  onChangeFilter: (filter: AdminPollTypeFilter) => void;
  onClosePoll: (poll: PollSummary) => void;
  onRefresh: () => void;
  onViewResults: (poll: PollSummary) => void;
  polls: PollSummary[];
  selectedPollId: number | null;
  statusTab: AdminPollStatusTab;
}) {
  if (!hasPollsInStatusTab) {
    return (
      <Empty
        title={statusTab === 'ongoing' ? '진행 중인 투표가 없습니다' : '마감된 투표가 없습니다'}
        message="상단 생성 또는 반복 탭에서 새 투표를 준비할 수 있습니다."
        actionLabel="다시 불러오기"
        actionAccessibilityLabel="투표 관리 목록 다시 불러오기"
        onActionPress={onRefresh}
      />
    );
  }

  return (
    <>
      <View style={styles.pollSectionShell}>
        <Text style={styles.sectionTitle}>
          {statusTab === 'ongoing' ? '진행 투표' : '마감 투표'}
        </Text>
        <SegmentedControl
          items={adminPollTypeFilters}
          selectedId={filter}
          onSelect={onChangeFilter}
        />
        {polls.length === 0 ? (
          <Body>
            {statusTab === 'ongoing'
              ? '선택한 조건의 진행중 투표가 없습니다.'
              : '선택한 조건의 마감 투표가 없습니다.'}
          </Body>
        ) : null}
        {polls.map((poll) => (
          <AdminPollListItem
            accessibilityLabel={`${poll.title} 투표 결과 보기`}
            key={poll.id}
            onPress={() => onViewResults(poll)}
            onClosePress={() => onClosePoll(poll)}
            poll={poll}
            selected={poll.id === selectedPollId}
          />
        ))}
        <Pressable
          accessibilityLabel="투표 목록 다시 불러오기"
          accessibilityRole="button"
          onPress={onRefresh}
          style={({pressed}) => [styles.pollSoftButton, pressed ? styles.pressed : null]}>
          <Text style={styles.pollSoftButtonText}>새로고침</Text>
        </Pressable>
      </View>
    </>
  );
}

function AdminPollListItem({
  accessibilityLabel,
  onClosePress,
  onPress,
  poll,
  selected,
}: {
  accessibilityLabel: string;
  onClosePress: () => void;
  onPress: () => void;
  poll: PollSummary;
  selected: boolean;
}) {
  const canClose = canClosePoll(poll);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.pollListItem,
        selected ? styles.pollListItemSelected : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={[styles.pollIconBox, poll.pollType === 'COFFEE' ? styles.pollIconBoxMint : null]}>
        <Text style={[styles.pollIconText, poll.pollType === 'COFFEE' ? styles.pollIconTextMint : null]}>
          {getAdminPollInitial(poll.pollType)}
        </Text>
      </View>
      <View style={styles.pollItemText}>
        <Text numberOfLines={1} style={styles.pollItemTitle}>
          {poll.title}
        </Text>
        <Text numberOfLines={1} style={styles.pollItemMeta}>
          {getAdminPollListMeta(poll)}
        </Text>
      </View>
      {canClose ? (
        <Pressable
          accessibilityLabel={`${poll.title} 투표 종료`}
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            onClosePress();
          }}
          style={({pressed}) => [styles.pollClosePill, pressed ? styles.pressed : null]}>
          <Text style={styles.pollClosePillText}>종료</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function AdminPollTemplateListPanel({
  actionError,
  actionState,
  deleteTarget,
  onCancelDelete,
  onConfirmDelete,
  onDeleteTemplate,
  onEditTemplate,
  onNewTemplate,
  templates,
}: {
  actionError: ApiError | null;
  actionState: AdminPollActionState;
  deleteTarget: AdminPollTemplate | null;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onDeleteTemplate: (template: AdminPollTemplate) => void;
  onEditTemplate: (template: AdminPollTemplate) => void;
  onNewTemplate: () => void;
  templates: AdminPollTemplate[];
}) {
  const busy = actionState.status !== 'idle';
  const serverTemplates = templates.filter((template) => !isDefaultCoffeePollTemplate(template));
  const activeServerTemplates = serverTemplates.filter(
    (template) => template.isActive && template.autoCreateEnabled,
  );

  return (
    <View style={styles.pollSectionShell}>
      <View style={styles.pollTemplateSummary}>
        <View style={styles.headerText}>
          <Text style={styles.pollTemplateSummaryTitle}>
            {`활성 반복 ${activeServerTemplates.length}개`}
          </Text>
          <Text style={styles.pollTemplateSummaryText}>반복투표를 만들고 편집합니다.</Text>
        </View>
        <Button
          accessibilityLabel="새 반복투표 만들기"
          disabled={busy}
          onPress={onNewTemplate}
          variant="secondary">
          새 반복
        </Button>
      </View>

      {actionError ? <AdminInlineError error={actionError} exposeValidationMessage /> : null}

      {serverTemplates.length === 0 ? (
        <Body>저장된 반복투표가 없습니다.</Body>
      ) : null}

      {templates.map((template) => {
        const isDefaultCoffeePreset = isDefaultCoffeePollTemplate(template);
        const isCoffeeChargeTemplate =
          template.pollType === 'COFFEE' &&
          template.chargeGenerationType === 'OPTION_PRICE';
        const statusLabel = isDefaultCoffeePreset
          ? '기본'
          : template.isActive
            ? isCoffeeChargeTemplate
              ? '주의'
              : 'ON'
            : 'OFF';
        const canDelete = template.isActive && !isDefaultCoffeePollTemplate(template);
        const deleting =
          actionState.status === 'deletingTemplate' && actionState.templateId === template.id;

        return (
          <Pressable
            accessibilityLabel={`${template.title} 반복투표 수정`}
            accessibilityRole="button"
            disabled={busy}
            key={template.id}
            onPress={() => onEditTemplate(template)}
            style={({pressed}) => [styles.pollTemplateRow, pressed ? styles.pressed : null]}>
            <View style={styles.pollItemText}>
              <View style={styles.pollTemplateTitleRow}>
                <Text numberOfLines={1} style={styles.pollItemTitle}>
                  {template.title}
                </Text>
                {isDefaultCoffeePreset ? <Chip label="추천" tone="info" /> : null}
              </View>
              <Text numberOfLines={1} style={styles.pollItemMeta}>
                {isDefaultCoffeePreset
                  ? '저장 전 기본값'
                  : getTemplateScheduleLabel(template)}
              </Text>
            </View>
            <View style={styles.pollTemplateActions}>
              <View
                style={[
                  styles.pollStatusPill,
                  !template.isActive ? styles.pollStatusPillMuted : null,
                  isDefaultCoffeePreset
                    ? styles.pollStatusPillInfo
                    : isCoffeeChargeTemplate
                      ? styles.pollStatusPillDanger
                      : null,
                ]}>
                <Text
                  style={[
                    styles.pollStatusPillText,
                    !template.isActive ? styles.pollStatusPillTextMuted : null,
                    isDefaultCoffeePreset
                      ? styles.pollStatusPillTextInfo
                      : isCoffeeChargeTemplate
                        ? styles.pollStatusPillTextDanger
                        : null,
                  ]}>
                  {statusLabel}
                </Text>
              </View>
              {canDelete ? (
                <Pressable
                  accessibilityLabel={`${template.title} 반복투표 삭제 확인`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={(event) => {
                    event.stopPropagation();
                    onDeleteTemplate(template);
                  }}
                  style={({pressed}) => [styles.pollClosePill, pressed ? styles.pressed : null]}>
                  <Text style={styles.pollClosePillText}>{deleting ? '삭제중' : '삭제'}</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      {deleteTarget ? (
        <Card>
          <Title>{deleteTarget.title}</Title>
          <Body>이 반복투표를 삭제할까요? 이미 생성된 투표는 그대로 유지됩니다.</Body>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel={`${deleteTarget.title} 반복투표 삭제 실행`}
              disabled={busy}
              onPress={onConfirmDelete}
              variant="danger">
              {actionState.status === 'deletingTemplate' ? '삭제 중...' : '삭제'}
            </Button>
            <Button
              accessibilityLabel="반복투표 삭제 취소"
              disabled={busy}
              onPress={onCancelDelete}
              variant="secondary">
              취소
            </Button>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function AdminPollTemplateEditor({
  actionState,
  actionError,
  accounts,
  coffeeCatalogState,
  form,
  onCancel,
  onChangeForm,
  onChangeStep,
  onRetryCoffeeCatalog,
  onSave,
  step,
}: {
  actionError: ApiError | null;
  accounts: PaymentAccount[];
  actionState: AdminPollActionState;
  coffeeCatalogState: AdminCoffeeCatalogState;
  form: AdminPollTemplateForm;
  onCancel: () => void;
  onChangeForm: (patch: Partial<AdminPollTemplateForm>) => void;
  onChangeStep: (step: AdminPollTemplateStep) => void;
  onRetryCoffeeCatalog: () => void;
  onSave: () => void;
  step: AdminPollTemplateStep;
}) {
  const busy = actionState.status !== 'idle';
  const templateOptions = splitAdminPollOptionsText(form.optionsText);
  const [coffeeMenuPickerVisible, setCoffeeMenuPickerVisible] = useState(false);
  const [selectedCoffeeBrandId, setSelectedCoffeeBrandId] = useState<number | null>(null);
  const templateCoffeeMenuIds = parseCoffeeMenuIdsFromOptionsText(form.optionsText);
  const knownCoffeeMenuIds =
    coffeeCatalogState.status === 'success'
      ? new Set(coffeeCatalogState.menus.map((menu) => menu.id))
      : new Set<number>();
  const templateValidationMessage = getAdminPollTemplateValidationMessage(form);
  const repeatSummary = templateValidationMessage
    ? templateValidationMessage
    : getAdminPollTemplateLiveSummary(form);
  const currentStepIndex = Math.max(
    0,
    adminPollTemplateSteps.findIndex((item) => item.id === step),
  );
  const currentStepLabel = adminPollTemplateSteps[currentStepIndex]?.label ?? '투표 정보';
  const stepError = getAdminPollTemplateStepError(step, form, coffeeCatalogState);
  const optionSummaryItems = getAdminPollTemplateOptionSummaryItems(form, coffeeCatalogState);
  const isLastStep = step === 'confirm';
  const primaryActionLabel = isLastStep
    ? form.templateId === null
      ? actionState.status === 'savingTemplate'
        ? '저장 중...'
        : '반복투표 만들기'
      : actionState.status === 'savingTemplate'
        ? '저장 중...'
        : '변경사항 저장'
    : '다음';
  const secondaryActionLabel = currentStepIndex === 0 ? '취소' : '이전';
  const updateTemplateOption = (index: number, value: string) => {
    onChangeForm({optionsText: updateAdminPollOptionText(templateOptions, index, value)});
  };
  const removeTemplateOption = (index: number) => {
    onChangeForm({optionsText: removeAdminPollOptionText(templateOptions, index)});
  };
  const addTemplateOption = () => {
    onChangeForm({optionsText: appendAdminPollOptionText(templateOptions)});
  };
  const addTemplateCoffeeMenu = (menu: CoffeeMenu) => {
    const validIds = templateCoffeeMenuIds.filter((menuId) => knownCoffeeMenuIds.has(menuId));
    const nextIds = validIds.includes(menu.id) ? validIds : [...validIds, menu.id];

    onChangeForm({optionsText: formatCoffeeMenuOptionsText(nextIds)});
    setCoffeeMenuPickerVisible(false);
  };
  const removeTemplateCoffeeMenu = (menuId: number) => {
    onChangeForm({
      optionsText: formatCoffeeMenuOptionsText(
        templateCoffeeMenuIds.filter((selectedMenuId) => selectedMenuId !== menuId),
      ),
    });
  };
  const goToPreviousStep = () => {
    if (currentStepIndex === 0) {
      onCancel();
      return;
    }

    const previousStep = adminPollTemplateSteps[currentStepIndex - 1];

    if (previousStep) {
      onChangeStep(previousStep.id);
    }
  };
  const goToNextStep = () => {
    if (stepError) {
      return;
    }

    if (isLastStep) {
      onSave();
      return;
    }

    const nextStep = adminPollTemplateSteps[currentStepIndex + 1];

    if (nextStep) {
      onChangeStep(nextStep.id);
    }
  };
  const changePollType = (pollType: AdminPollType) => {
    onChangeForm(getRepeatTemplateTypePatch(pollType, form));
  };

  useEffect(() => {
    if (
      selectedCoffeeBrandId === null &&
      coffeeCatalogState.status === 'success' &&
      coffeeCatalogState.brands[0]
    ) {
      setSelectedCoffeeBrandId(coffeeCatalogState.brands[0].id);
    }
  }, [coffeeCatalogState, selectedCoffeeBrandId]);

  return (
    <View style={styles.repeatWizardShell}>
      <View style={styles.repeatWizardHeader}>
        <Pressable
          accessibilityLabel="반복투표 화면 닫기"
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={({pressed}) => [styles.repeatWizardBackButton, pressed ? styles.pressed : null]}>
          <Text style={styles.repeatWizardBackText}>뒤로</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Title>{form.templateId === null ? '반복투표 만들기' : '반복투표 수정'}</Title>
          <Text style={styles.repeatWizardMeta}>
            {`${currentStepIndex + 1}/4 · ${currentStepLabel}`}
          </Text>
        </View>
      </View>

      <View style={styles.repeatStepIndicator}>
        {adminPollTemplateSteps.map((item, index) => {
          const active = item.id === step;
          const completed = index < currentStepIndex;

          return (
            <View
              key={item.id}
              style={[
                styles.repeatStepPill,
                active || completed ? styles.repeatStepPillActive : null,
              ]}>
              <Text
                style={[
                  styles.repeatStepText,
                  active || completed ? styles.repeatStepTextActive : null,
                ]}>
                {`${index + 1}. ${item.label}`}
              </Text>
            </View>
          );
        })}
      </View>

      {step === 'info' ? (
        <>
          <View style={styles.repeatEditorSection}>
            <Text style={styles.repeatEditorSectionTitle}>투표 정보</Text>
            <TextField
              label="반복투표 제목"
              onChangeText={(title) => onChangeForm({title})}
              value={form.title}
            />
            <View style={styles.templateFormSection}>
              <Eyebrow>투표 유형</Eyebrow>
              <SegmentedControl
                items={adminPollTypes}
                selectedId={form.pollType}
                onSelect={changePollType}
              />
            </View>
            <View style={styles.templateFormSection}>
              <Eyebrow>선택 방식</Eyebrow>
              <SegmentedControl
                items={adminPollSelectionTypes}
                selectedId={form.selectionType}
                onSelect={(selectionType) => onChangeForm({selectionType})}
              />
            </View>
          </View>
          {form.pollType === 'COFFEE' ? (
            <View style={styles.repeatEditorSection}>
              <Text style={styles.repeatEditorSectionTitle}>커피 청구</Text>
              <SegmentedControl
                items={adminPollChargeTypes}
                selectedId={form.chargeGenerationType}
                onSelect={(chargeGenerationType) =>
                  onChangeForm({
                    chargeGenerationType,
                    paymentCategory:
                      chargeGenerationType === 'NONE'
                        ? 'NONE'
                        : form.paymentCategory === 'NONE'
                          ? 'COFFEE'
                          : form.paymentCategory,
                  })
                }
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
            </View>
          ) : null}
        </>
      ) : null}

      {step === 'schedule' ? (
        <View style={styles.repeatEditorSection}>
          <Text style={styles.repeatEditorSectionTitle}>반복 일정</Text>
          <Text style={styles.repeatEditorSectionBody}>
            매주 열리는 시작 요일과 마감 요일을 정합니다.
          </Text>
          <AdminRepeatTimeRuleEditor
            disabled={busy}
            endDayOfWeek={form.endDayOfWeek}
            endTime={form.endTime}
            onChange={(patch) => onChangeForm(patch)}
            startDayOfWeek={form.startDayOfWeek}
            startTime={form.startTime}
          />
          <View
            accessibilityRole={templateValidationMessage ? 'alert' : undefined}
            style={[
              styles.repeatSummaryBox,
              templateValidationMessage ? styles.repeatSummaryBoxError : null,
            ]}>
            <Text
              style={[
                styles.repeatSummaryText,
                templateValidationMessage ? styles.repeatSummaryTextError : null,
              ]}>
              {repeatSummary}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="자동 생성 여부 전환"
            accessibilityRole="switch"
            accessibilityState={{checked: form.autoCreateEnabled}}
            disabled={busy}
            onPress={() => onChangeForm({autoCreateEnabled: !form.autoCreateEnabled})}
            style={({pressed}) => [
              styles.pollCreateToggleRow,
              styles.templateAutoRow,
              pressed ? styles.pressed : null,
            ]}>
            <View style={styles.headerText}>
              <Text style={styles.pollCreateTypeTitle}>자동 생성</Text>
              <Text style={styles.pollCreateTypeDescription}>
                켜두면 매주 이 일정으로 투표가 만들어집니다.
              </Text>
            </View>
            <View
              style={[
                styles.pollCreateToggle,
                form.autoCreateEnabled ? styles.pollCreateToggleActive : null,
              ]}>
              <Text
                style={[
                  styles.pollCreateToggleText,
                  form.autoCreateEnabled ? styles.pollCreateToggleTextActive : null,
                ]}>
                {form.autoCreateEnabled ? 'ON' : 'OFF'}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {step === 'options' ? (
        <View style={styles.repeatEditorSection}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.repeatEditorSectionTitle}>
                {form.pollType === 'COFFEE' ? '커피 메뉴' : '선택지'}
              </Text>
              <Text style={styles.repeatEditorSectionBody}>
                {form.pollType === 'COFFEE'
                  ? '메뉴 이름과 금액을 보고 반복투표에 넣을 항목을 고릅니다.'
                  : '응답자가 고를 항목만 남겨 주세요.'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={
                form.pollType === 'COFFEE' ? '반복 커피 메뉴 추가' : '반복투표 선택지 추가'
              }
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                form.pollType === 'COFFEE' ? setCoffeeMenuPickerVisible(true) : addTemplateOption()
              }
              style={({pressed}) => [styles.pollCreateAddOption, pressed ? styles.pressed : null]}>
              <Text style={styles.pollCreateAddOptionText}>
                {form.pollType === 'COFFEE' ? '메뉴 추가' : '추가'}
              </Text>
            </Pressable>
          </View>
          {form.pollType === 'COFFEE' ? (
            <>
              <CoffeeMenuPickerSheet
                onClose={() => setCoffeeMenuPickerVisible(false)}
                onRetry={onRetryCoffeeCatalog}
                onSelectBrand={setSelectedCoffeeBrandId}
                onSelectMenu={addTemplateCoffeeMenu}
                selectedBrandId={selectedCoffeeBrandId}
                selectedMenuIds={templateCoffeeMenuIds.filter((menuId) =>
                  knownCoffeeMenuIds.has(menuId),
                )}
                state={coffeeCatalogState}
                visible={coffeeMenuPickerVisible}
              />
              <AdminPollCoffeeOptions
                catalogState={coffeeCatalogState}
                onRemoveMenu={removeTemplateCoffeeMenu}
                onRetry={onRetryCoffeeCatalog}
                selectedMenuIds={templateCoffeeMenuIds}
              />
            </>
          ) : (
            <View style={styles.pollCreateOptionList}>
              {templateOptions.map((option, index) => (
                <View key={`${index}-${templateOptions.length}`} style={styles.pollCreateOptionRow}>
                  <View style={styles.pollCreateOptionNumber}>
                    <Text style={styles.pollCreateOptionNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.pollCreateOptionField}>
                    <TextField
                      label={`선택지 ${index + 1}`}
                      onChangeText={(value) => updateTemplateOption(index, value)}
                      value={option}
                    />
                  </View>
                  <Pressable
                    accessibilityLabel={`${index + 1}번 반복투표 선택지 삭제`}
                    accessibilityRole="button"
                    disabled={busy || templateOptions.length <= 1}
                    onPress={() => removeTemplateOption(index)}
                    style={({pressed}) => [
                      styles.pollCreateRemoveOption,
                      templateOptions.length <= 1 ? styles.pollCreateRemoveOptionDisabled : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Text style={styles.pollCreateRemoveOptionText}>x</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {step === 'confirm' ? (
        <View style={styles.repeatEditorSection}>
          <Text style={styles.repeatEditorSectionTitle}>확인</Text>
          <Text style={styles.repeatEditorSectionBody}>
            저장하면 이 설정으로 반복투표가 관리됩니다.
          </Text>
          <View style={styles.repeatConfirmList}>
            <View style={styles.repeatConfirmRow}>
              <Text style={styles.repeatConfirmLabel}>제목</Text>
              <Text style={styles.repeatConfirmValue}>{form.title.trim() || '제목 없음'}</Text>
            </View>
            <View style={styles.repeatConfirmRow}>
              <Text style={styles.repeatConfirmLabel}>종류</Text>
              <Text style={styles.repeatConfirmValue}>
                {`${getPollTypeLabel(form.pollType)} · ${getSelectionTypeLabel(form.selectionType)}`}
              </Text>
            </View>
            <View style={styles.repeatConfirmRow}>
              <Text style={styles.repeatConfirmLabel}>일정</Text>
              <Text style={styles.repeatConfirmValue}>{getAdminPollTemplateLiveSummary(form)}</Text>
            </View>
            <View style={styles.repeatConfirmRow}>
              <Text style={styles.repeatConfirmLabel}>자동 생성</Text>
              <Text style={styles.repeatConfirmValue}>
                {form.autoCreateEnabled ? '켜짐' : '꺼짐'}
              </Text>
            </View>
            <View style={styles.repeatConfirmRow}>
              <Text style={styles.repeatConfirmLabel}>선택지</Text>
              <Text style={styles.repeatConfirmValue}>
                {optionSummaryItems.length > 0 ? optionSummaryItems.join(', ') : '선택지 없음'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {stepError ? (
        <View accessibilityRole="alert" style={styles.repeatWizardError}>
          <Text style={styles.repeatWizardErrorText}>{stepError}</Text>
        </View>
      ) : null}
      {actionError ? <AdminInlineError error={actionError} exposeValidationMessage /> : null}

      <View style={styles.repeatWizardActions}>
        <Button
          accessibilityLabel={secondaryActionLabel === '취소' ? '반복투표 작성 취소' : '이전 단계로 이동'}
          disabled={busy}
          onPress={goToPreviousStep}
          variant="secondary">
          {secondaryActionLabel}
        </Button>
        <Button
          accessibilityLabel={
            isLastStep
              ? form.templateId === null
                ? '반복투표 만들기'
                : '반복투표 변경사항 저장'
              : '다음 단계로 이동'
          }
          disabled={busy || stepError !== null}
          onPress={goToNextStep}>
          {primaryActionLabel}
        </Button>
      </View>
    </View>
  );
}

function _LegacyAdminPollTemplateEditor({
  actionState,
  accounts,
  coffeeCatalogState,
  form,
  onChangeForm,
  onConfirmDelete,
  onDeleteTarget,
  onEditTemplate,
  onNewTemplate,
  onRetryCoffeeCatalog,
  onSave,
  onUseTemplateForPoll,
  selectedTemplate,
  target,
  templates,
}: {
  accounts: PaymentAccount[];
  actionState: AdminPollActionState;
  coffeeCatalogState: AdminCoffeeCatalogState;
  form: AdminPollTemplateForm;
  onChangeForm: (patch: Partial<AdminPollTemplateForm>) => void;
  onConfirmDelete: () => void;
  onDeleteTarget: (template: AdminPollTemplate | null) => void;
  onEditTemplate: (template: AdminPollTemplate) => void;
  onNewTemplate: () => void;
  onRetryCoffeeCatalog: () => void;
  onSave: () => void;
  onUseTemplateForPoll: (template: AdminPollTemplate) => void;
  selectedTemplate: AdminPollTemplate | null;
  target: AdminPollTemplate | null;
  templates: AdminPollTemplate[];
}) {
  const busy = actionState.status !== 'idle';
  const serverTemplates = templates.filter((template) => !isDefaultCoffeePollTemplate(template));
  const activeServerTemplates = serverTemplates.filter(
    (template) => template.isActive && template.autoCreateEnabled,
  );
  const selectedTemplateIsDefault = selectedTemplate
    ? isDefaultCoffeePollTemplate(selectedTemplate)
    : false;
  const templateOptions = splitAdminPollOptionsText(form.optionsText);
  const [coffeeMenuPickerVisible, setCoffeeMenuPickerVisible] = useState(false);
  const [selectedCoffeeBrandId, setSelectedCoffeeBrandId] = useState<number | null>(null);
  const templateCoffeeMenuIds = parseCoffeeMenuIdsFromOptionsText(form.optionsText);
  const knownCoffeeMenuIds =
    coffeeCatalogState.status === 'success'
      ? new Set(coffeeCatalogState.menus.map((menu) => menu.id))
      : new Set<number>();
  const templateValidationMessage = getAdminPollTemplateValidationMessage(form);
  const repeatSummary = templateValidationMessage
    ? templateValidationMessage
    : getAdminPollTemplateLiveSummary(form);
  const primaryActionLabel =
    form.templateId === null
      ? actionState.status === 'savingTemplate'
        ? '저장 중...'
        : '반복투표 만들기'
      : actionState.status === 'savingTemplate'
        ? '저장 중...'
        : '변경사항 저장';
  const updateTemplateOption = (index: number, value: string) => {
    onChangeForm({optionsText: updateAdminPollOptionText(templateOptions, index, value)});
  };
  const removeTemplateOption = (index: number) => {
    onChangeForm({optionsText: removeAdminPollOptionText(templateOptions, index)});
  };
  const addTemplateOption = () => {
    onChangeForm({optionsText: appendAdminPollOptionText(templateOptions)});
  };
  const addTemplateCoffeeMenu = (menu: CoffeeMenu) => {
    const validIds = templateCoffeeMenuIds.filter((menuId) => knownCoffeeMenuIds.has(menuId));
    const nextIds = validIds.includes(menu.id) ? validIds : [...validIds, menu.id];

    onChangeForm({optionsText: formatCoffeeMenuOptionsText(nextIds)});
    setCoffeeMenuPickerVisible(false);
  };
  const removeTemplateCoffeeMenu = (menuId: number) => {
    onChangeForm({
      optionsText: formatCoffeeMenuOptionsText(
        templateCoffeeMenuIds.filter((selectedMenuId) => selectedMenuId !== menuId),
      ),
    });
  };

  useEffect(() => {
    if (
      selectedCoffeeBrandId === null &&
      coffeeCatalogState.status === 'success' &&
      coffeeCatalogState.brands[0]
    ) {
      setSelectedCoffeeBrandId(coffeeCatalogState.brands[0].id);
    }
  }, [coffeeCatalogState, selectedCoffeeBrandId]);

  return (
    <>
      <View style={styles.pollSectionShell}>
        <View style={styles.pollTemplateSummary}>
          <View style={styles.headerText}>
            <Text style={styles.pollTemplateSummaryTitle}>
              {`활성 반복 ${activeServerTemplates.length}개`}
            </Text>
            <Text style={styles.pollTemplateSummaryText}>
              저장된 반복투표 중 자동 생성이 켜진 항목만 집계합니다.
            </Text>
          </View>
          <View style={styles.pollResultPill}>
            <Text style={styles.pollResultPillText}>관리</Text>
          </View>
        </View>
        {serverTemplates.length === 0 ? <Body>저장된 반복투표가 없습니다.</Body> : null}
        {templates.map((template) => {
          const isDefaultCoffeePreset = isDefaultCoffeePollTemplate(template);
          const isCoffeeChargeTemplate =
            template.pollType === 'COFFEE' &&
            template.chargeGenerationType === 'OPTION_PRICE';
          const statusLabel = isDefaultCoffeePreset
            ? '기본'
            : template.isActive
              ? isCoffeeChargeTemplate
                ? '주의'
                : 'ON'
              : 'OFF';

          return (
            <Pressable
              accessibilityLabel={`${template.title} 반복투표 수정`}
              accessibilityRole="button"
              key={template.id}
              onPress={() => onEditTemplate(template)}
              style={({pressed}) => [styles.pollTemplateRow, pressed ? styles.pressed : null]}>
              <View style={styles.pollItemText}>
                <View style={styles.pollTemplateTitleRow}>
                  <Text style={styles.pollItemTitle}>{template.title}</Text>
                  {isDefaultCoffeePreset ? <Chip label="추천" tone="info" /> : null}
                </View>
                <Text style={styles.pollItemMeta}>
                  {isDefaultCoffeePreset
                    ? '저장 전 기본값 · 메뉴 선택지는 저장/생성 전 확인'
                    : getTemplateScheduleLabel(template)}
                </Text>
              </View>
              <View
                style={[
                  styles.pollStatusPill,
                  !template.isActive ? styles.pollStatusPillMuted : null,
                  isDefaultCoffeePreset
                    ? styles.pollStatusPillInfo
                    : isCoffeeChargeTemplate
                      ? styles.pollStatusPillDanger
                      : null,
                ]}>
                <Text
                  style={[
                    styles.pollStatusPillText,
                    !template.isActive ? styles.pollStatusPillTextMuted : null,
                    isDefaultCoffeePreset
                      ? styles.pollStatusPillTextInfo
                      : isCoffeeChargeTemplate
                        ? styles.pollStatusPillTextDanger
                        : null,
                  ]}>
                  {statusLabel}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.repeatEditorShell}>
        <View style={styles.repeatEditorHeader}>
          <View style={styles.headerText}>
            <Title>{form.templateId === null ? '반복투표 만들기' : '반복투표 편집'}</Title>
            <Body>매주 열릴 투표의 일정과 응답 항목을 설정합니다.</Body>
          </View>
        </View>

        <View style={styles.repeatEditorSection}>
          <Text style={styles.repeatEditorSectionTitle}>반복 일정</Text>
          <Text style={styles.repeatEditorSectionBody}>
            날짜가 아니라 매주 반복될 시작 요일과 마감 요일을 정합니다.
          </Text>
          <AdminRepeatTimeRuleEditor
            disabled={busy}
            endDayOfWeek={form.endDayOfWeek}
            endTime={form.endTime}
            onChange={(patch) => onChangeForm(patch)}
            startDayOfWeek={form.startDayOfWeek}
            startTime={form.startTime}
          />
          <View
            accessibilityRole={templateValidationMessage ? 'alert' : undefined}
            style={[
              styles.repeatSummaryBox,
              templateValidationMessage ? styles.repeatSummaryBoxError : null,
            ]}>
            <Text
              style={[
                styles.repeatSummaryText,
                templateValidationMessage ? styles.repeatSummaryTextError : null,
              ]}>
              {repeatSummary}
            </Text>
          </View>
        </View>

        <View style={styles.repeatEditorSection}>
          <Text style={styles.repeatEditorSectionTitle}>투표 내용</Text>
          <TextField
            label="반복투표 제목"
            onChangeText={(title) => onChangeForm({title})}
            value={form.title}
          />
          <View style={styles.templateFormSection}>
            <Eyebrow>투표 유형</Eyebrow>
            <SegmentedControl
              items={adminPollTypes}
              selectedId={form.pollType}
              onSelect={(pollType) =>
                onChangeForm({
                  optionsText: pollType === 'COFFEE' ? '' : form.optionsText,
                  pollType,
                })
              }
            />
          </View>
          <View style={styles.templateFormSection}>
            <Eyebrow>선택 방식</Eyebrow>
            <SegmentedControl
              items={adminPollSelectionTypes}
              selectedId={form.selectionType}
              onSelect={(selectionType) => onChangeForm({selectionType})}
            />
          </View>
        </View>

        <View style={styles.repeatEditorSection}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.repeatEditorSectionTitle}>선택지</Text>
              <Text style={styles.repeatEditorSectionBody}>
                {form.pollType === 'COFFEE'
                  ? '커피 메뉴 이름과 가격을 보고 선택합니다.'
                  : '응답자가 고를 항목만 남겨 주세요.'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={form.pollType === 'COFFEE' ? '반복 커피 메뉴 추가' : '반복 투표 선택지 추가'}
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                form.pollType === 'COFFEE' ? setCoffeeMenuPickerVisible(true) : addTemplateOption()
              }
              style={({pressed}) => [styles.pollCreateAddOption, pressed ? styles.pressed : null]}>
              <Text style={styles.pollCreateAddOptionText}>
                {form.pollType === 'COFFEE' ? '메뉴 추가' : '추가'}
              </Text>
            </Pressable>
          </View>
          {form.pollType === 'COFFEE' ? (
            <>
              <CoffeeMenuPickerSheet
                onClose={() => setCoffeeMenuPickerVisible(false)}
                onRetry={onRetryCoffeeCatalog}
                onSelectBrand={setSelectedCoffeeBrandId}
                onSelectMenu={addTemplateCoffeeMenu}
                selectedBrandId={selectedCoffeeBrandId}
                selectedMenuIds={templateCoffeeMenuIds.filter((menuId) =>
                  knownCoffeeMenuIds.has(menuId),
                )}
                state={coffeeCatalogState}
                visible={coffeeMenuPickerVisible}
              />
            <AdminPollCoffeeOptions
              catalogState={coffeeCatalogState}
              onRemoveMenu={removeTemplateCoffeeMenu}
              onRetry={onRetryCoffeeCatalog}
              selectedMenuIds={templateCoffeeMenuIds}
            />
            </>
          ) : (
            <View style={styles.pollCreateOptionList}>
              {templateOptions.map((option, index) => (
                <View key={`${index}-${templateOptions.length}`} style={styles.pollCreateOptionRow}>
                  <View style={styles.pollCreateOptionNumber}>
                    <Text style={styles.pollCreateOptionNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.pollCreateOptionField}>
                    <TextField
                      label={`선택지 ${index + 1}`}
                      onChangeText={(value) => updateTemplateOption(index, value)}
                      value={option}
                    />
                  </View>
                  <Pressable
                    accessibilityLabel={`${index + 1}번 반복 투표 선택지 삭제`}
                    accessibilityRole="button"
                    disabled={busy || templateOptions.length <= 1}
                    onPress={() => removeTemplateOption(index)}
                    style={({pressed}) => [
                      styles.pollCreateRemoveOption,
                      templateOptions.length <= 1 ? styles.pollCreateRemoveOptionDisabled : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Text style={styles.pollCreateRemoveOptionText}>x</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.repeatEditorSection}>
          <Text style={styles.repeatEditorSectionTitle}>자동 생성</Text>
          <Text style={styles.repeatEditorSectionBody}>
            켜두면 저장한 요일과 시간 기준으로 매주 반복투표가 준비됩니다.
          </Text>
        <Pressable
          accessibilityLabel="자동 생성 여부 전환"
          accessibilityRole="switch"
          accessibilityState={{checked: form.autoCreateEnabled}}
          disabled={busy}
          onPress={() => onChangeForm({autoCreateEnabled: !form.autoCreateEnabled})}
          style={({pressed}) => [
            styles.pollCreateToggleRow,
            styles.templateAutoRow,
            pressed ? styles.pressed : null,
          ]}>
          <View style={styles.headerText}>
            <Text style={styles.pollCreateTypeTitle}>자동 생성</Text>
            <Text style={styles.pollCreateTypeDescription}>
              켜면 저장된 요일과 시간 기준으로 매주 생성됩니다.
            </Text>
          </View>
          <View
            style={[
              styles.pollCreateToggle,
              form.autoCreateEnabled ? styles.pollCreateToggleActive : null,
            ]}>
            <Text
              style={[
                styles.pollCreateToggleText,
                form.autoCreateEnabled ? styles.pollCreateToggleTextActive : null,
              ]}>
              {form.autoCreateEnabled ? 'ON' : 'OFF'}
            </Text>
          </View>
        </Pressable>
        </View>

        {form.pollType === 'COFFEE' ? (
          <View style={styles.repeatEditorSection}>
            <Text style={styles.repeatEditorSectionTitle}>청구 설정</Text>
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
          </View>
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

        <View style={styles.repeatEditorActions}>
          <Button
            accessibilityLabel={form.templateId === null ? '반복투표 만들기' : '반복투표 변경사항 저장'}
            disabled={busy || templateValidationMessage !== null}
            onPress={onSave}>
            {primaryActionLabel}
          </Button>
          {selectedTemplate ? (
            <Button
              accessibilityLabel="선택 반복투표 기반 투표 만들기"
              disabled={busy}
              onPress={() => onUseTemplateForPoll(selectedTemplate)}
              variant="secondary">
              투표 만들기
            </Button>
          ) : null}
          {form.templateId !== null ? (
            <Button
              accessibilityLabel="새 입력"
              disabled={busy}
              onPress={onNewTemplate}
              variant="secondary">
              새 입력
            </Button>
          ) : null}
          <Button
            accessibilityLabel="반복투표 비활성화 확인"
            disabled={busy || !selectedTemplate?.isActive || selectedTemplateIsDefault}
            onPress={() => selectedTemplate ? onDeleteTarget(selectedTemplate) : undefined}
            variant="danger">
            비활성화
          </Button>
        </View>
      </View>
      {selectedTemplate ? <AdminPollTemplatePreview template={selectedTemplate} /> : null}
      {target ? (
        <Card>
          <Title>{target.title} 비활성화</Title>
          <Body>반복 생성 목록에서 제외합니다. 이미 생성된 투표는 그대로 유지됩니다.</Body>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="반복투표 비활성화 실행"
              disabled={busy}
              onPress={onConfirmDelete}
              variant="danger">
              {actionState.status === 'deletingTemplate' ? '처리 중...' : '비활성화'}
            </Button>
            <Button
              accessibilityLabel="반복투표 비활성화 취소"
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

function AdminRepeatTimeRuleEditor({
  disabled,
  endDayOfWeek,
  endTime,
  onChange,
  startDayOfWeek,
  startTime,
}: {
  disabled: boolean;
  endDayOfWeek: string;
  endTime: string;
  onChange: (patch: Partial<AdminPollTemplateForm>) => void;
  startDayOfWeek: string;
  startTime: string;
}) {
  return (
    <View style={styles.repeatRuleEditor}>
      <AdminRepeatRulePoint
        dayOfWeek={startDayOfWeek}
        disabled={disabled}
        label="시작"
        onChangeDay={(dayOfWeek) => onChange({startDayOfWeek: dayOfWeek})}
        onChangeTime={(time) => onChange({startTime: time})}
        time={startTime}
      />
      <AdminRepeatRulePoint
        dayOfWeek={endDayOfWeek}
        disabled={disabled}
        label="마감"
        onChangeDay={(dayOfWeek) => onChange({endDayOfWeek: dayOfWeek})}
        onChangeTime={(time) => onChange({endTime: time})}
        time={endTime}
      />
    </View>
  );
}

function AdminRepeatRulePoint({
  dayOfWeek,
  disabled,
  label,
  onChangeDay,
  onChangeTime,
  time,
}: {
  dayOfWeek: string;
  disabled: boolean;
  label: '마감' | '시작';
  onChangeDay: (dayOfWeek: string) => void;
  onChangeTime: (time: string) => void;
  time: string;
}) {
  return (
    <View style={styles.repeatRulePoint}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.dateTimeSelectLabel}>{label}</Text>
          <Text style={styles.dateTimeSelectValue}>
            {`${formatTemplateDateTimeLabel(dayOfWeek, time)} ${label}`}
          </Text>
        </View>
      </View>
      <View style={styles.repeatWeekdayGrid}>
        {adminPollWeekdays.map((weekday) => {
          const selected = weekday.id === dayOfWeek;

          return (
            <Pressable
              accessibilityLabel={`${label} 요일 ${weekday.label} 선택`}
              accessibilityRole="button"
              accessibilityState={{selected}}
              disabled={disabled}
              key={weekday.id}
              onPress={() => onChangeDay(weekday.id)}
              style={({pressed}) => [
                styles.repeatWeekdayPill,
                selected ? styles.repeatWeekdayPillActive : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text
                style={[
                  styles.repeatWeekdayText,
                  selected ? styles.repeatWeekdayTextActive : null,
                ]}>
                {weekday.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <AdminRepeatTimeStepper disabled={disabled} onChange={onChangeTime} time={time} />
    </View>
  );
}

function AdminRepeatTimeStepper({
  disabled,
  onChange,
  time,
}: {
  disabled: boolean;
  onChange: (time: string) => void;
  time: string;
}) {
  const parts = parseAdminTimeParts(time);
  const setHour = (delta: number) => onChange(formatAdminTimeParts(parts.hour + delta, parts.minute));
  const setMinute = (delta: number) => onChange(formatAdminTimeParts(parts.hour, parts.minute + delta));

  return (
    <View style={styles.repeatTimeStepper}>
      <View style={styles.repeatTimeGroup}>
        <Text style={styles.repeatTimeLabel}>시</Text>
        <View style={styles.repeatTimeControls}>
          <Pressable
            accessibilityLabel="반복 시간 시 줄이기"
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => setHour(-1)}
            style={({pressed}) => [styles.repeatTimeButton, pressed ? styles.pressed : null]}>
            <Text style={styles.repeatTimeButtonText}>-</Text>
          </Pressable>
          <Text style={styles.repeatTimeValue}>{String(parts.hour).padStart(2, '0')}</Text>
          <Pressable
            accessibilityLabel="반복 시간 시 늘리기"
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => setHour(1)}
            style={({pressed}) => [styles.repeatTimeButton, pressed ? styles.pressed : null]}>
            <Text style={styles.repeatTimeButtonText}>+</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.repeatTimeGroup}>
        <Text style={styles.repeatTimeLabel}>분</Text>
        <View style={styles.repeatTimeControls}>
          <Pressable
            accessibilityLabel="반복 시간 분 줄이기"
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => setMinute(-5)}
            style={({pressed}) => [styles.repeatTimeButton, pressed ? styles.pressed : null]}>
            <Text style={styles.repeatTimeButtonText}>-</Text>
          </Pressable>
          <Text style={styles.repeatTimeValue}>{String(parts.minute).padStart(2, '0')}</Text>
          <Pressable
            accessibilityLabel="반복 시간 분 늘리기"
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => setMinute(5)}
            style={({pressed}) => [styles.repeatTimeButton, pressed ? styles.pressed : null]}>
            <Text style={styles.repeatTimeButtonText}>+</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function AdminPollCreatePanel({
  actionError,
  accounts,
  busy,
  coffeeCatalogState,
  coffeeWarning,
  createStep,
  form,
  currentUserId,
  knownOwnedCoffeeAccountIds,
  onCancel,
  onChangeForm,
  onChangeStep,
  onCreate,
  onRequestCoffeeAccountCreate,
  onRetryCoffeeCatalog,
  onReset,
  templates,
}: {
  actionError: ApiError | null;
  accounts: PaymentAccount[];
  busy: boolean;
  coffeeCatalogState: AdminCoffeeCatalogState;
  coffeeWarning: string | null;
  createStep: AdminPollCreateStep;
  form: AdminPollCreateForm;
  currentUserId: number;
  knownOwnedCoffeeAccountIds: Set<number>;
  onCancel: () => void;
  onChangeForm: (patch: Partial<AdminPollCreateForm>) => void;
  onChangeStep: (step: AdminPollCreateStep) => void;
  onCreate: () => void;
  onRequestCoffeeAccountCreate: () => void;
  onRetryCoffeeCatalog: () => void;
  onReset: () => void;
  templates: AdminPollTemplate[];
}) {
  const options = splitAdminPollOptionsText(form.optionsText);
  const [deadlinePickerVisible, setDeadlinePickerVisible] = useState(false);
  const [coffeeMenuPickerVisible, setCoffeeMenuPickerVisible] = useState(false);
  const [selectedCoffeeBrandId, setSelectedCoffeeBrandId] = useState<number | null>(null);
  const coffeeMenuIds = parseCoffeeMenuIdsFromOptionsText(form.optionsText);
  const deadlineDate = getAdminDateTimeValue(form.endsAt);
  const deadlineValidationReason = getAdminPollDeadlineValidationMessage(form);
  const createDisabledReason = getAdminPollCreateDisabledReason(form, coffeeWarning);
  const ownedCoffeeAccounts = getOwnedCoffeePaymentAccounts(
    accounts,
    currentUserId,
    knownOwnedCoffeeAccountIds,
  );
  const selectablePaymentAccounts =
    form.pollType === 'COFFEE' ? ownedCoffeeAccounts : accounts;
  const knownCoffeeMenuIds =
    coffeeCatalogState.status === 'success'
      ? new Set(coffeeCatalogState.menus.map((menu) => menu.id))
      : new Set<number>();
  const selectType = (pollType: AdminPollType) => {
    const patch = getCreatePollTypePatch(pollType, form, templates);

    if (pollType === 'COFFEE') {
      const selectedId = toOptionalPositiveId(form.paymentAccountId);
      const selectedAccount = ownedCoffeeAccounts.find((account) => account.id === selectedId);
      patch.paymentAccountId = String(selectedAccount?.id ?? ownedCoffeeAccounts[0]?.id ?? '');
      patch.paymentCategory = 'COFFEE';
    }

    onChangeForm(patch);
  };
  const goToDetail = () => {
    onChangeForm(getCreatePollTimeRefreshPatch(form));
    onChangeStep('detail');
  };
  const updateOption = (index: number, value: string) => {
    onChangeForm({optionsText: updateAdminPollOptionText(options, index, value)});
  };
  const removeOption = (index: number) => {
    onChangeForm({optionsText: removeAdminPollOptionText(options, index)});
  };
  const addCoffeeMenu = (menu: CoffeeMenu) => {
    const validIds = coffeeMenuIds.filter((menuId) => knownCoffeeMenuIds.has(menuId));
    const nextIds = validIds.includes(menu.id) ? validIds : [...validIds, menu.id];

    onChangeForm({optionsText: formatCoffeeMenuOptionsText(nextIds)});
    setCoffeeMenuPickerVisible(false);
  };
  const removeCoffeeMenu = (menuId: number) => {
    onChangeForm({
      optionsText: formatCoffeeMenuOptionsText(
        coffeeMenuIds.filter((selectedMenuId) => selectedMenuId !== menuId),
      ),
    });
  };

  useEffect(() => {
    if (
      selectedCoffeeBrandId === null &&
      coffeeCatalogState.status === 'success' &&
      coffeeCatalogState.brands[0]
    ) {
      setSelectedCoffeeBrandId(coffeeCatalogState.brands[0].id);
    }
  }, [coffeeCatalogState, selectedCoffeeBrandId]);

  if (createStep === 'type') {
    return (
      <View style={styles.pollCreateShell}>
        <View style={styles.pollCreateHeader}>
          <Text style={styles.pollCreateTitle}>투표 유형</Text>
          <Text style={styles.pollCreateDescription}>이번에 만들 투표의 기본 형태를 선택하세요.</Text>
        </View>
        <View style={styles.pollCreateTypeList}>
          {adminPollCreateTypes.map((type) => {
            const selected = form.pollType === type.id;

            return (
              <Pressable
                accessibilityLabel={`${type.label} 투표 유형 선택`}
                accessibilityRole="button"
                accessibilityState={{selected}}
                key={type.id}
                onPress={() => selectType(type.id)}
                style={({pressed}) => [
                  styles.pollCreateTypeCard,
                  selected ? styles.pollCreateTypeCardSelected : null,
                  pressed ? styles.pressed : null,
                ]}>
                <View
                  style={[
                    styles.pollCreateTypeIcon,
                    type.id === 'COFFEE' ? styles.pollCreateTypeIconMint : null,
                  ]}>
                  <Text
                    style={[
                      styles.pollCreateTypeIconText,
                      type.id === 'COFFEE' ? styles.pollCreateTypeIconTextMint : null,
                    ]}>
                    {getAdminPollInitial(type.id)}
                  </Text>
                </View>
                <View style={styles.pollItemText}>
                  <Text style={styles.pollCreateTypeTitle}>{type.label}</Text>
                  <Text style={styles.pollCreateTypeDescription}>
                    {getAdminPollTypeDescription(type.id)}
                  </Text>
                </View>
                <View style={styles.pollCreateSelectPill}>
                  <Text style={styles.pollCreateSelectPillText}>
                    {selected ? '선택됨' : '선택'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.pollCreateCtaRow}>
          <Pressable
            accessibilityLabel="투표 만들기 취소"
            accessibilityRole="button"
            disabled={busy}
            onPress={onCancel}
            style={({pressed}) => [
              styles.pollCreateSecondaryAction,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.pollCreateSecondaryActionText}>취소</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="투표 세부 정보 입력으로 이동"
            accessibilityRole="button"
            disabled={busy}
            onPress={goToDetail}
            style={({pressed}) => [
              styles.pollCreatePrimaryAction,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.pollCreatePrimaryActionText}>다음</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pollCreateShell}>
      <Card>
        <Eyebrow>투표 제목</Eyebrow>
        <TextField
          label="제목"
          onChangeText={(title) => onChangeForm({title})}
          value={form.title}
        />
      </Card>
      <Card>
        <Eyebrow>마감 일시</Eyebrow>
        <Pressable
          accessibilityLabel="투표 마감 일시 선택"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setDeadlinePickerVisible(true)}
          style={({pressed}) => [styles.dateTimeSelectCard, pressed ? styles.pressed : null]}>
          <Text style={styles.dateTimeSelectLabel}>마감 일시</Text>
          <Text style={styles.dateTimeSelectValue}>
            {formatAdminDateTimeLabel(deadlineDate)}
          </Text>
          <Text style={styles.dateTimeSelectHint}>달력과 시간 선택으로 마감 시각을 정합니다.</Text>
        </Pressable>
        <AdminDateTimePickerSheet
          title="마감 일시 선택"
          value={deadlineDate}
          visible={deadlinePickerVisible}
          onApply={(date) => {
            onChangeForm({endsAt: formatAdminDateTimeForApi(date)});
            setDeadlinePickerVisible(false);
          }}
          onCancel={() => setDeadlinePickerVisible(false)}
        />
        {deadlineValidationReason ? (
          <View style={styles.inlineError}>
            <Text style={styles.inlineErrorText}>{deadlineValidationReason}</Text>
          </View>
        ) : null}
      </Card>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Eyebrow>선택지</Eyebrow>
            <Body>
              {form.pollType === 'COFFEE'
                ? '커피 메뉴 이름과 가격을 확인한 뒤 추가합니다.'
                : '응답자가 고를 항목을 입력합니다.'}
            </Body>
          </View>
          <Pressable
            accessibilityLabel={form.pollType === 'COFFEE' ? '커피 메뉴 추가' : '투표 선택지 추가'}
            accessibilityRole="button"
            disabled={busy}
            onPress={() =>
              form.pollType === 'COFFEE'
                ? setCoffeeMenuPickerVisible(true)
                : onChangeForm({optionsText: appendAdminPollOptionText(options)})
            }
            style={({pressed}) => [styles.pollCreateAddOption, pressed ? styles.pressed : null]}>
            <Text style={styles.pollCreateAddOptionText}>
              {form.pollType === 'COFFEE' ? '메뉴 추가' : '추가'}
            </Text>
          </Pressable>
        </View>
        <CoffeeMenuPickerSheet
          onClose={() => setCoffeeMenuPickerVisible(false)}
          onRetry={onRetryCoffeeCatalog}
          onSelectBrand={setSelectedCoffeeBrandId}
          onSelectMenu={addCoffeeMenu}
          selectedBrandId={selectedCoffeeBrandId}
          selectedMenuIds={coffeeMenuIds.filter((menuId) => knownCoffeeMenuIds.has(menuId))}
          state={coffeeCatalogState}
          visible={coffeeMenuPickerVisible}
        />
        {form.pollType === 'COFFEE' ? (
          <AdminPollCoffeeOptions
            catalogState={coffeeCatalogState}
            onRemoveMenu={removeCoffeeMenu}
            onRetry={onRetryCoffeeCatalog}
            selectedMenuIds={coffeeMenuIds}
          />
        ) : (
          <View style={styles.pollCreateOptionList}>
            {options.map((option, index) => (
              <View key={`${index}-${options.length}`} style={styles.pollCreateOptionRow}>
                <View style={styles.pollCreateOptionNumber}>
                  <Text style={styles.pollCreateOptionNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.pollCreateOptionField}>
                  <TextField
                    label={`선택지 ${index + 1}`}
                    onChangeText={(value) => updateOption(index, value)}
                    value={option}
                  />
                </View>
                <Pressable
                  accessibilityLabel={`${index + 1}번 선택지 삭제`}
                  accessibilityRole="button"
                  disabled={busy || options.length <= 1}
                  onPress={() => removeOption(index)}
                  style={({pressed}) => [
                    styles.pollCreateRemoveOption,
                    options.length <= 1 ? styles.pollCreateRemoveOptionDisabled : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Text style={styles.pollCreateRemoveOptionText}>x</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Card>
      <Card>
        <Eyebrow>선택 방식</Eyebrow>
        <SegmentedControl
          items={adminPollSelectionTypes}
          selectedId={form.selectionType}
          onSelect={(selectionType) => onChangeForm({selectionType})}
        />
      </Card>
      <Card>
        <Pressable
          accessibilityLabel="익명 투표 여부 전환"
          accessibilityRole="switch"
          accessibilityState={{checked: form.isAnonymous}}
          disabled={busy}
          onPress={() => onChangeForm({isAnonymous: !form.isAnonymous})}
          style={({pressed}) => [
            styles.pollCreateToggleRow,
            pressed ? styles.pressed : null,
          ]}>
          <View style={styles.headerText}>
            <Text style={styles.pollCreateTypeTitle}>익명 투표</Text>
            <Text style={styles.pollCreateTypeDescription}>
              응답자 이름을 결과 화면에서 숨깁니다.
            </Text>
          </View>
          <View
            style={[
              styles.pollCreateToggle,
              form.isAnonymous ? styles.pollCreateToggleActive : null,
            ]}>
            <Text
              style={[
                styles.pollCreateToggleText,
                form.isAnonymous ? styles.pollCreateToggleTextActive : null,
              ]}>
              {form.isAnonymous ? 'ON' : 'OFF'}
            </Text>
          </View>
        </Pressable>
      </Card>
      <Card>
        <Pressable
          accessibilityLabel="사용자 항목추가 가능 여부 전환"
          accessibilityRole="switch"
          accessibilityState={{checked: form.allowUserOptionAdd}}
          disabled={busy}
          onPress={() => onChangeForm({allowUserOptionAdd: !form.allowUserOptionAdd})}
          style={({pressed}) => [
            styles.pollCreateToggleRow,
            pressed ? styles.pressed : null,
          ]}>
          <View style={styles.headerText}>
            <Text style={styles.pollCreateTypeTitle}>사용자 항목추가 가능</Text>
            <Text style={styles.pollCreateTypeDescription}>
              일반 사용자가 투표 응답 중 필요한 선택지를 직접 추가할 수 있습니다.
            </Text>
          </View>
          <View
            style={[
              styles.pollCreateToggle,
              form.allowUserOptionAdd ? styles.pollCreateToggleActive : null,
            ]}>
            <Text
              style={[
                styles.pollCreateToggleText,
                form.allowUserOptionAdd ? styles.pollCreateToggleTextActive : null,
              ]}>
              {form.allowUserOptionAdd ? 'ON' : 'OFF'}
            </Text>
          </View>
        </Pressable>
      </Card>
      {form.chargeGenerationType === 'OPTION_PRICE' ? (
        <Card>
          {coffeeWarning ? (
            <View style={styles.inlineError}>
              <Text style={styles.inlineErrorText}>{coffeeWarning}</Text>
              {form.pollType === 'COFFEE' ? (
                <Pressable
                  accessibilityLabel="커피 계좌 등록 화면으로 이동"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={onRequestCoffeeAccountCreate}
                  style={({pressed}) => [
                    styles.inlineErrorAction,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Text style={styles.inlineErrorActionText}>계좌 등록</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <PaymentAccountPicker
            accounts={selectablePaymentAccounts}
            category={form.paymentCategory}
            onSelect={(account) =>
              onChangeForm({
                paymentAccountId: String(account.id),
                paymentCategory: account.accountType,
              })
            }
            selectedAccountId={toOptionalPositiveId(form.paymentAccountId)}
          />
        </Card>
      ) : null}
      {actionError ? (
        <AdminInlineError error={actionError} exposeValidationMessage={true} />
      ) : null}
      {createDisabledReason ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{createDisabledReason}</Text>
        </View>
      ) : null}
      <View style={styles.pollCreateCtaRow}>
        <Pressable
          accessibilityLabel="투표 세부 정보 입력 취소"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            onReset();
            onChangeStep('type');
          }}
          style={({pressed}) => [
            styles.pollCreateSecondaryAction,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.pollCreateSecondaryActionText}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="투표 생성 실행"
          accessibilityRole="button"
          disabled={busy || createDisabledReason !== null}
          onPress={onCreate}
          style={({pressed}) => [
            styles.pollCreatePrimaryAction,
            busy || createDisabledReason !== null ? styles.pollCreateActionDisabled : null,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.pollCreatePrimaryActionText}>
            {busy ? '생성 중...' : '생성하기'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminDateTimePickerSheet({
  onApply,
  onCancel,
  title,
  value,
  visible,
}: {
  onApply: (date: Date) => void;
  onCancel: () => void;
  title: string;
  value: Date;
  visible: boolean;
}) {
  const initialValue = getAdminDateTimeValue(value);
  const [draftDate, setDraftDate] = useState(initialValue);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialValue.getFullYear(), initialValue.getMonth(), 1),
  );
  const [hour, setHour] = useState(initialValue.getHours());
  const [minute, setMinute] = useState(roundMinuteToStep(initialValue.getMinutes()));

  useEffect(() => {
    if (!visible) {
      return;
    }

    const nextValue = getAdminDateTimeValue(value);
    setDraftDate(nextValue);
    setVisibleMonth(new Date(nextValue.getFullYear(), nextValue.getMonth(), 1));
    setHour(nextValue.getHours());
    setMinute(roundMinuteToStep(nextValue.getMinutes()));
  }, [value, visible]);

  if (!visible) {
    return null;
  }

  const calendarDays = buildAdminCalendarDays(visibleMonth);
  const selectedDateTime = new Date(
    draftDate.getFullYear(),
    draftDate.getMonth(),
    draftDate.getDate(),
    hour,
    minute,
    0,
    0,
  );

  return (
    <View style={styles.dateTimePickerSheet}>
      <View style={styles.dateTimePickerHeader}>
        <View style={styles.headerText}>
          <Eyebrow>{title}</Eyebrow>
          <Text style={styles.dateTimePickerSelected}>
            {formatAdminDateTimeLabel(selectedDateTime)}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`${title} 닫기`}
          accessibilityRole="button"
          onPress={onCancel}
          style={({pressed}) => [styles.pollCreateRemoveOption, pressed ? styles.pressed : null]}>
          <Text style={styles.pollCreateRemoveOptionText}>x</Text>
        </Pressable>
      </View>
      <View style={styles.dateTimePickerMonthHeader}>
        <Pressable
          accessibilityLabel="이전 달"
          accessibilityRole="button"
          onPress={() => setVisibleMonth(addMonths(visibleMonth, -1))}
          style={({pressed}) => [styles.dateTimeMonthButton, pressed ? styles.pressed : null]}>
          <Text style={styles.dateTimeMonthButtonText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.dateTimeMonthTitle}>
          {visibleMonth.getFullYear()}.{String(visibleMonth.getMonth() + 1).padStart(2, '0')}
        </Text>
        <Pressable
          accessibilityLabel="다음 달"
          accessibilityRole="button"
          onPress={() => setVisibleMonth(addMonths(visibleMonth, 1))}
          style={({pressed}) => [styles.dateTimeMonthButton, pressed ? styles.pressed : null]}>
          <Text style={styles.dateTimeMonthButtonText}>{'>'}</Text>
        </Pressable>
      </View>
      <View style={styles.dateTimeWeekRow}>
        {adminWeekdayLabels.map((label) => (
          <Text key={label} style={styles.dateTimeWeekdayText}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.dateTimeCalendarGrid}>
        {calendarDays.map((day, index) => {
          const selected = day ? isSameCalendarDate(day, draftDate) : false;
          const today = day ? isSameCalendarDate(day, new Date()) : false;

          return day ? (
            <Pressable
              accessibilityLabel={`${formatAdminDateLabel(day)} 선택`}
              accessibilityRole="button"
              key={day.toISOString()}
              onPress={() => setDraftDate(day)}
              style={({pressed}) => [
                styles.dateTimeDayCell,
                today ? styles.dateTimeDayToday : null,
                selected ? styles.dateTimeDaySelected : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text
                style={[
                  styles.dateTimeDayText,
                  selected ? styles.dateTimeDayTextSelected : null,
                ]}>
                {day.getDate()}
              </Text>
            </Pressable>
          ) : (
            <View key={`empty-${index}`} style={styles.dateTimeDayCell} />
          );
        })}
      </View>
      <View style={styles.dateTimeControlBlock}>
        <Text style={styles.dateTimeSelectLabel}>시간</Text>
        <View style={styles.dateTimeStepperRow}>
          <TimeStepper label="시" value={hour} onChange={setHour} max={23} min={0} step={1} />
          <TimeStepper label="분" value={minute} onChange={setMinute} max={55} min={0} step={5} />
        </View>
      </View>
      <View style={styles.pollCreateCtaRow}>
        <Pressable
          accessibilityLabel={`${title} 취소`}
          accessibilityRole="button"
          onPress={onCancel}
          style={({pressed}) => [styles.pollCreateSecondaryAction, pressed ? styles.pressed : null]}>
          <Text style={styles.pollCreateSecondaryActionText}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`${title} 적용`}
          accessibilityRole="button"
          onPress={() => onApply(selectedDateTime)}
          style={({pressed}) => [styles.pollCreatePrimaryAction, pressed ? styles.pressed : null]}>
          <Text style={styles.pollCreatePrimaryActionText}>적용</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TimeStepper({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const decrease = () => onChange(wrapTimeStepperValue(value - step, min, max, step));
  const increase = () => onChange(wrapTimeStepperValue(value + step, min, max, step));

  return (
    <View style={styles.dateTimeStepper}>
      <Text style={styles.dateTimeSelectLabel}>{label}</Text>
      <View style={styles.dateTimeStepperControls}>
        <Pressable
          accessibilityLabel={`${label} 줄이기`}
          accessibilityRole="button"
          onPress={decrease}
          style={({pressed}) => [styles.dateTimeStepperButton, pressed ? styles.pressed : null]}>
          <Text style={styles.dateTimeStepperButtonText}>-</Text>
        </Pressable>
        <Text style={styles.dateTimeStepperValue}>{String(value).padStart(2, '0')}</Text>
        <Pressable
          accessibilityLabel={`${label} 늘리기`}
          accessibilityRole="button"
          onPress={increase}
          style={({pressed}) => [styles.dateTimeStepperButton, pressed ? styles.pressed : null]}>
          <Text style={styles.dateTimeStepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminPollCoffeeOptions({
  catalogState,
  onRemoveMenu,
  onRetry,
  selectedMenuIds,
}: {
  catalogState: AdminCoffeeCatalogState;
  onRemoveMenu: (menuId: number) => void;
  onRetry: () => void;
  selectedMenuIds: number[];
}) {
  if (catalogState.status === 'idle' || catalogState.status === 'loading') {
    return <Body>커피 메뉴를 불러오고 있어요.</Body>;
  }

  if (catalogState.status === 'error') {
    return (
      <View style={styles.compactBlock}>
        <AdminInlineError error={catalogState.error} />
        <Button
          accessibilityLabel="커피 메뉴 다시 불러오기"
          onPress={onRetry}
          variant="secondary">
          다시 시도
        </Button>
      </View>
    );
  }

  if (selectedMenuIds.length === 0) {
    return <Body>선택된 커피 메뉴가 없습니다. 메뉴 추가를 눌러 선택해 주세요.</Body>;
  }

  return (
    <View style={styles.pollCreateOptionList}>
      {selectedMenuIds.map((menuId, index) => {
        const menu = catalogState.menus.find((item) => item.id === menuId) ?? null;

        return (
          <View key={`${menuId}-${index}`} style={styles.pollCreateOptionRow}>
            <View style={styles.pollCreateOptionNumber}>
              <Text style={styles.pollCreateOptionNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.pollItemText}>
              <Text style={styles.pollCreateTypeTitle}>
                {menu ? menu.name : '메뉴를 다시 선택해 주세요'}
              </Text>
              <Text style={styles.pollCreateTypeDescription}>
                {menu
                  ? `${getCoffeeCategoryLabel(menu.category)} · ${formatWon(menu.priceAmount)}`
                  : '목록에 없는 커피 메뉴입니다.'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`${index + 1}번 커피 메뉴 삭제`}
              accessibilityRole="button"
              onPress={() => onRemoveMenu(menuId)}
              style={({pressed}) => [styles.pollCreateRemoveOption, pressed ? styles.pressed : null]}>
              <Text style={styles.pollCreateRemoveOptionText}>x</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function CoffeeMenuPickerSheet({
  onClose,
  onRetry,
  onSelectMenu,
  selectedMenuIds,
  state,
  visible,
}: {
  onClose: () => void;
  onRetry: () => void;
  onSelectBrand: (brandId: number) => void;
  onSelectMenu: (menu: CoffeeMenu) => void;
  selectedBrandId: number | null;
  selectedMenuIds: number[];
  state: AdminCoffeeCatalogState;
  visible: boolean;
}) {
  const menus =
    state.status === 'success'
      ? state.menus.slice().sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'))
      : [];

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, styles.coffeeMenuSheet]}>
          <View style={styles.coffeeMenuSheetHeader}>
            <View style={styles.headerText}>
              <Text style={styles.pollCreateTitle}>커피 메뉴 추가</Text>
              <Text style={styles.pollCreateDescription}>투표에 넣을 메뉴를 선택하세요.</Text>
            </View>
            <Pressable
              accessibilityLabel="커피 메뉴 추가 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={({pressed}) => [styles.pollCreateRemoveOption, pressed ? styles.pressed : null]}>
              <Text style={styles.pollCreateRemoveOptionText}>x</Text>
            </Pressable>
          </View>
          {state.status === 'idle' || state.status === 'loading' ? (
            <Body>커피 메뉴를 불러오고 있어요.</Body>
          ) : state.status === 'error' ? (
            <View style={styles.compactBlock}>
              <AdminInlineError error={state.error} />
              <Button accessibilityLabel="커피 메뉴 다시 불러오기" onPress={onRetry} variant="secondary">
                다시 시도
              </Button>
            </View>
          ) : menus.length === 0 ? (
            <View style={styles.menuSheetEmpty}>
              <Body>추가할 수 있는 메뉴가 없습니다.</Body>
              <Button accessibilityLabel="커피 메뉴 다시 불러오기" onPress={onRetry} variant="secondary">
                새로고침
              </Button>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.coffeeMenuScrollContent}
              style={styles.coffeeMenuList}>
              {menus.map((menu) => {
                const added = selectedMenuIds.includes(menu.id);

                return (
                  <Pressable
                    accessibilityLabel={`${menu.name} 메뉴 ${added ? '추가됨' : '추가'}`}
                    accessibilityRole="button"
                    disabled={added}
                    key={menu.id}
                    onPress={() => {
                      onSelectMenu(menu);
                      onClose();
                    }}
                    style={({pressed}) => [
                      styles.coffeeMenuRow,
                      added ? styles.coffeeMenuRowAdded : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <View style={styles.headerText}>
                      <Text style={styles.pollCreateTypeTitle}>{menu.name}</Text>
                      <Text style={styles.pollCreateTypeDescription}>
                        {getCoffeeCategoryLabel(menu.category)} · {formatWon(menu.priceAmount)}
                      </Text>
                    </View>
                    <View style={styles.pollResultPill}>
                      <Text style={styles.pollResultPillText}>{added ? '추가됨' : '추가'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function AdminPollTemplatePreview({template}: {template: AdminPollTemplate}) {
  const sortedOptions = template.options.slice().sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <View style={styles.templatePreviewShell}>
      <View style={styles.templatePreviewSummary}>
        <Title>{template.title}</Title>
        <View style={styles.chipRow}>
          <Chip label={template.autoCreateEnabled ? '반복 ON' : '반복 OFF'} tone="info" />
          <Chip label={getSelectionTypeLabel(template.selectionType)} tone="default" />
          <Chip label={`${getPollTypeLabel(template.pollType)} 반복투표`} tone="default" />
        </View>
        <Body>{getTemplateRepeatSummary(template)}</Body>
      </View>
      <View style={styles.templatePreviewBlock}>
        <Text style={styles.sectionTitle}>옵션</Text>
        <View style={styles.templatePreviewCard}>
          {sortedOptions.length === 0 ? <Body>저장된 선택지가 없습니다.</Body> : null}
          {sortedOptions.map((option, index) => (
            <View key={option.id} style={styles.templatePreviewOptionRow}>
              <View style={styles.pollCreateOptionNumber}>
                <Text style={styles.pollCreateOptionNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.pollItemText}>
                <Text style={styles.pollItemTitle}>{option.content}</Text>
                {option.priceAmount > 0 ? (
                  <Text style={styles.pollItemMeta}>{formatWon(option.priceAmount)}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.templatePreviewBlock}>
        <Text style={styles.sectionTitle}>생성 규칙</Text>
        <View style={styles.templatePreviewCard}>
          <ListRow
            label="자동 생성"
            supportingText={template.autoCreateEnabled ? '매주 반복 생성' : '직접 생성에만 사용'}
            value={template.autoCreateEnabled ? 'ON' : 'OFF'}
          />
          <ListRow
            label="중복 생성 방지"
            supportingText="같은 캠퍼스와 반복투표의 같은 주차는 한 번만 생성됩니다."
            value=""
          />
        </View>
      </View>
    </View>
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
  onClosePoll,
  onSelectPoll,
  polls,
  selectedPoll,
  state,
}: {
  onLoad: () => void;
  onClosePoll: (poll: PollSummary) => void;
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
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="선택한 투표 결과와 댓글 불러오기"
            disabled={!selectedPoll || state.status === 'loading'}
            onPress={onLoad}>
            결과 조회
          </Button>
          {selectedPoll && canClosePoll(selectedPoll) ? (
            <Button
              accessibilityLabel="선택한 투표 종료 확인 열기"
              disabled={state.status === 'loading'}
              onPress={() => onClosePoll(selectedPoll)}
              variant="danger">
              투표 종료
            </Button>
          ) : null}
        </View>
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
          <AdminPollResultOptionCard
            anonymous={results.anonymous}
            key={option.id}
            option={option}
          />
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

function AdminPollResultOptionCard({
  anonymous,
  option,
}: {
  anonymous: boolean;
  option: PollResults['optionResults'][number];
}) {
  return (
    <View style={styles.adminResultOptionCard}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.pollItemTitle}>{option.content}</Text>
          <Text style={styles.pollItemMeta}>{`${option.responseCount}명 선택`}</Text>
        </View>
        <Chip label={`${option.responseCount}명`} tone={option.responseCount > 0 ? 'info' : 'default'} />
      </View>
      {anonymous ? (
        <Text style={styles.adminResultMutedText}>익명 투표라 응답자 명단은 표시하지 않습니다.</Text>
      ) : option.respondents.length === 0 ? (
        <Text style={styles.adminResultMutedText}>아직 이 항목에 투표한 사람이 없습니다.</Text>
      ) : (
        <View style={styles.adminRespondentGrid}>
          {option.respondents.map((respondent) => (
            <View key={`${option.id}-${respondent.userId}`} style={styles.adminRespondentChip}>
              <View style={styles.adminRespondentAvatar}>
                <Text style={styles.adminRespondentAvatarText}>{respondent.name.slice(0, 1)}</Text>
              </View>
              <Text numberOfLines={1} style={styles.adminRespondentName}>
                {respondent.name}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
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
  onClosePoll,
  onSelectPoll,
  polls,
  selectedPoll,
}: {
  onClosePoll: (poll: PollSummary) => void;
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
            {canClosePoll(selectedPoll) ? (
              <Button
                accessibilityLabel="선택한 투표 종료 확인 열기"
                onPress={() => onClosePoll(selectedPoll)}
                variant="danger">
                투표 종료
              </Button>
            ) : null}
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

function AdminDevotionPage({
  assignableMembersState,
  campusId,
  devotionSection,
  members,
  missingState,
  notificationSendState,
  onChangeDevotionSection,
  onChangePrayerGroupForm,
  onChangePrayerMembersForm,
  onChangePrayerSeasonForm,
  onChangeWeek,
  onEditPrayerGroup,
  onOpenNotificationConfirm,
  onOpenPrayerCloseSeason,
  onRetryMissing,
  onRetryPrayer,
  onSavePrayerGroup,
  onSavePrayerSeason,
  prayerActionState,
  prayerBoardState,
  prayerGroupForm,
  prayerMembersForm,
  prayerSeasonForm,
  setAuthState,
  summary,
  weekStartDate,
}: {
  assignableMembersState: AssignablePrayerMembersState;
  campusId: number;
  devotionSection: AdminDevotionSection;
  members: AdminCampusMember[];
  missingState: MissingDevotionState;
  notificationSendState: NotificationSendState;
  onChangeDevotionSection: (section: AdminDevotionSection) => void;
  onChangePrayerGroupForm: (patch: Partial<PrayerGroupForm>) => void;
  onChangePrayerMembersForm: (patch: Partial<PrayerGroupMembersForm>) => void;
  onChangePrayerSeasonForm: (patch: Partial<PrayerSeasonForm>) => void;
  onChangeWeek: (direction: -1 | 1) => void;
  onEditPrayerGroup: (group: AdminPrayerGroup | PrayerWeekSummary['groups'][number]) => void;
  onOpenNotificationConfirm: (targets: AdminMissingDevotionMember[]) => void;
  onOpenPrayerCloseSeason: (seasonId?: string) => void;
  onRetryMissing: () => void;
  onRetryPrayer: () => void;
  onSavePrayerGroup: () => Promise<boolean>;
  onSavePrayerSeason: () => void;
  prayerActionState: AdminActionState;
  prayerBoardState: AdminPrayerState;
  prayerGroupForm: PrayerGroupForm;
  prayerMembersForm: PrayerGroupMembersForm;
  prayerSeasonForm: PrayerSeasonForm;
  setAuthState: (state: AuthGateState) => void;
  summary: AdminDashboardSummary;
  weekStartDate: string;
}) {
  return (
    <>
      <AdminSubpageSwitcher
        accessibilityLabelPrefix="관리자 경건 하위 페이지"
        items={adminDevotionSections}
        onSelect={onChangeDevotionSection}
        selectedId={devotionSection}
        subtitle="미제출 알림, 주차별 제출 현황, 기도제목 운영을 나누어 봅니다."
        title="경건 관리"
      />
      {devotionSection === 'missing' ? (
        <AdminDevotionMissing
          missingState={missingState}
          notificationState={notificationSendState}
          onChangeWeek={onChangeWeek}
          onOpenNotificationConfirm={onOpenNotificationConfirm}
          onRetry={onRetryMissing}
          summary={summary}
          weekStartDate={weekStartDate}
        />
      ) : devotionSection === 'weekly' ? (
        <AdminWeeklyDevotionSection campusId={campusId} setAuthState={setAuthState} />
      ) : (
        <AdminPrayerManagement
          actionState={prayerActionState}
          assignableMembersState={assignableMembersState}
          boardState={prayerBoardState}
          groupForm={prayerGroupForm}
          members={members}
          membersForm={prayerMembersForm}
          onChangeGroupForm={onChangePrayerGroupForm}
          onChangeMembersForm={onChangePrayerMembersForm}
          onChangeSeasonForm={onChangePrayerSeasonForm}
          onChangeWeek={onChangeWeek}
          onEditGroup={onEditPrayerGroup}
          onOpenCloseSeason={onOpenPrayerCloseSeason}
          onRetry={onRetryPrayer}
          onSaveGroup={onSavePrayerGroup}
          onSaveSeason={onSavePrayerSeason}
          seasonForm={prayerSeasonForm}
          weekStartDate={weekStartDate}
        />
      )}
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
        <Eyebrow>경건 현황</Eyebrow>
        <Title>경건 제출 현황</Title>
        <View style={styles.metricGrid}>
          <Metric label="선택 주차" value={formatShortWeekLabel(weekStartDate)} />
          <Metric label="미제출" value={`${missingCount}명`} />
          <Metric
            label="제출률"
            value={selectedWeekMatchesSummary ? `${summary.devotion.submitRate}%` : '조회 후 확인'}
          />
          <Metric label="조회" value="미제출자" />
        </View>
        <View style={styles.compactActionRow}>
          <AdminCompactButton
            accessibilityLabel="이전 주 경건 미제출자 조회"
            disabled={missingState.status === 'loading' || notificationState.status === 'sending'}
            onPress={() => onChangeWeek(-1)}
            variant="secondary">
            이전
          </AdminCompactButton>
          <AdminCompactButton
            accessibilityLabel="다음 주 경건 미제출자 조회"
            disabled={missingState.status === 'loading' || notificationState.status === 'sending'}
            onPress={() => onChangeWeek(1)}
            variant="secondary">
            다음
          </AdminCompactButton>
          <AdminCompactButton
            accessibilityLabel="경건 미제출자 다시 불러오기"
            disabled={missingState.status === 'loading' || notificationState.status === 'sending'}
            onPress={onRetry}
            variant="ghost">
            새로고침
          </AdminCompactButton>
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
              <Eyebrow>미제출자 목록</Eyebrow>
              <Title>미제출자 {missingState.members.length}명</Title>
            </View>
            <AdminCompactButton
              accessibilityLabel="경건 미제출자 알림 발송 확인 열기"
              disabled={notificationState.status === 'sending'}
              onPress={() => onOpenNotificationConfirm(missingState.members)}>
              알림 발송
            </AdminCompactButton>
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
        <Text style={styles.memberMeta}>{member.campusName}</Text>
        <Text style={styles.memberMeta}>{member.email}</Text>
      </View>
      <Chip label="대상" tone="info" />
    </View>
  );
}

function AdminNotificationCenter({
  filters,
  form,
  members,
  onChangeFilter,
  onChangePage,
  onChangeSection,
  onChangeSendForm,
  onClearFilters,
  onOpenConfirm,
  onRetry,
  onSearch,
  onSelectLog,
  onToggleTarget,
  section,
  selectedLogId,
  sendState,
  state,
  weekStartDate,
}: {
  filters: NotificationLogFilters;
  form: AdminNotificationSendForm;
  members: AdminCampusMember[];
  onChangeFilter: <K extends keyof NotificationLogFilters>(
    key: K,
    value: NotificationLogFilters[K],
  ) => void;
  onChangePage: (direction: -1 | 1) => void;
  onChangeSection: (section: AdminNotificationSection) => void;
  onChangeSendForm: (patch: Partial<AdminNotificationSendForm>) => void;
  onClearFilters: () => void;
  onOpenConfirm: () => void;
  onRetry: () => void;
  onSearch: () => void;
  onSelectLog: (logId: number | null) => void;
  onToggleTarget: (userId: number) => void;
  section: AdminNotificationSection;
  selectedLogId: number | null;
  sendState: NotificationSendState;
  state: NotificationLogState;
  weekStartDate: string;
}) {
  return (
    <>
      <Card>
        <Eyebrow>알림</Eyebrow>
        <Title>관리자 알림</Title>
        <Body>대상을 고르고 발송하면 완료 창에서 결과를 바로 확인합니다.</Body>
        <FigmaSegmentedControl
          items={notificationSections}
          selectedId={section}
          onSelect={onChangeSection}
        />
      </Card>
      {section === 'send' ? (
        <AdminNotificationSendForm
          form={form}
          members={members}
          onChangeForm={onChangeSendForm}
          onOpenConfirm={onOpenConfirm}
          onToggleTarget={onToggleTarget}
          sendState={sendState}
          weekStartDate={weekStartDate}
        />
      ) : (
        <AdminNotificationLogs
          filters={filters}
          onChangeFilter={onChangeFilter}
          onChangePage={onChangePage}
          onClearFilters={onClearFilters}
          onRetry={onRetry}
          onSearch={onSearch}
          onSelectLog={onSelectLog}
          selectedLogId={selectedLogId}
          state={state}
        />
      )}
    </>
  );
}

function AdminNotificationSendForm({
  form,
  members,
  onChangeForm,
  onOpenConfirm,
  onToggleTarget,
  sendState,
  weekStartDate,
}: {
  form: AdminNotificationSendForm;
  members: AdminCampusMember[];
  onChangeForm: (patch: Partial<AdminNotificationSendForm>) => void;
  onOpenConfirm: () => void;
  onToggleTarget: (userId: number) => void;
  sendState: NotificationSendState;
  weekStartDate: string;
}) {
  const targetCount =
    form.targetMode === 'ALL'
      ? members.length
      : form.targetMode === 'SELECTED'
        ? form.selectedUserIds.length
        : 0;
  const disabled = sendState.status === 'sending';

  return (
    <>
      <Card>
        <Eyebrow>알림 발송</Eyebrow>
        <Title>발송 내용을 확인해 주세요</Title>
        <Body>제목과 본문은 수신자에게 그대로 표시됩니다.</Body>
        <View style={styles.formRow}>
          <View style={styles.formFieldFull}>
            <TextField
              accessibilityLabel="알림 제목"
              label="제목"
              onChangeText={(title) => onChangeForm({title})}
              placeholder="알림 제목"
              value={form.title}
            />
          </View>
          <View style={styles.formFieldFull}>
            <TextField
              accessibilityLabel="알림 본문"
              label="본문"
              onChangeText={(body) => onChangeForm({body})}
              placeholder="수신자에게 보낼 내용"
              value={form.body}
            />
          </View>
        </View>
        <Text style={styles.memberName}>대상</Text>
        <FigmaSegmentedControl
          items={notificationTargetModes}
          selectedId={form.targetMode}
          onSelect={(targetMode) => onChangeForm({targetMode})}
        />
        <Body>
          {form.targetMode === 'MISSING_DEVOTION'
            ? `${weekStartDate} 주차 미제출자를 조회한 뒤 확인합니다.`
            : `${targetCount}명을 대상으로 준비 중입니다.`}
        </Body>
        {form.targetMode === 'SELECTED' ? (
          <View style={styles.figmaListStack}>
            {members.slice(0, 8).map((member) => {
              const selected = form.selectedUserIds.includes(member.userId);

              return (
                <Pressable
                  accessibilityLabel={`${member.name} 알림 대상 ${selected ? '해제' : '선택'}`}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  key={member.membershipId}
                  onPress={() => onToggleTarget(member.userId)}
                  style={({pressed}) => [
                    styles.figmaListItem,
                    selected ? styles.notificationTargetSelected : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Avatar name={member.name} role={member.campusRole} />
                  <View style={styles.figmaListText}>
                    <Text style={styles.figmaCardTitle}>{member.name}</Text>
                    <Text style={styles.figmaBodyText}>{member.email}</Text>
                  </View>
                  <Chip label={selected ? '발송' : '대기'} tone={selected ? 'success' : 'info'} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <Button
          accessibilityLabel="관리자 알림 발송 확인"
          disabled={disabled}
          onPress={onOpenConfirm}>
          {disabled ? '발송 중...' : '발송'}
        </Button>
      </Card>
      {renderNotificationResult(sendState)}
    </>
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
          발송 요청 단위로 성공, 실패, 제외 상태를 확인합니다.
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
              accessibilityLabel="알림 로그 요청 묶음 필터"
              label="요청 묶음"
              onChangeText={(requestId) => onChangeFilter('requestId', requestId)}
              placeholder="발송 결과에서 자동 입력"
              returnKeyType="search"
              value={filters.requestId}
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
      <Title>{filters.requestId.trim() ? '요청 묶음 결과' : '현재 필터 결과'}</Title>
      <Body>
        {filters.requestId.trim()
          ? '발송 요청 묶음의 현재 페이지 결과입니다.'
          : '필터 조건에 맞는 발송 이력을 확인합니다.'}
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
            {log.name} · {formatDateTime(log.createdAt)}
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
            message: getNotificationFailureMessage(log.failureReason, log.sendStatus),
          }}
        />
      ) : null}
      <ListRow
        accessibilityLabel={`${log.title} 알림 상세 보기`}
        label="요청 묶음"
        onPress={onPress}
        supportingText={getNotificationLogSummary(log)}
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
            <Body>{formatDateTime(log.createdAt)} 발송 요청의 상세 상태입니다.</Body>
          </View>
          <Chip label={getNotificationStatusLabel(log.sendStatus)} tone={getNotificationStatusTone(log.sendStatus)} />
        </View>
        <ListRow label="대상" supportingText={log.email} value={log.name} />
        <ListRow label="유형" supportingText={getNotificationTypeLabel(log.notificationType)} />
        <ListRow
          label="대상 범위"
          supportingText={getNotificationTargetSummary(log)}
        />
        <ListRow label="본문" supportingText={log.body} />
        <ListRow label="발송 시각" value={log.sentAt ? formatDateTime(log.sentAt) : '-'} />
        <ListRow
          label="실패 사유"
          supportingText={getNotificationFailureMessage(log.failureReason, log.sendStatus)}
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
        <ListRow label="대상 이메일" supportingText={log.email} />
        <ListRow label="상태" supportingText={getNotificationLogSummary(log)} />
      </Card>
    </>
  );
}

function renderNotificationResult(
  notificationState: NotificationSendState,
) {
  switch (notificationState.status) {
    case 'idle':
    case 'confirming':
      return null;
    case 'sending':
      return <Loading message="알림을 보내고 있어요. 잠시만 기다려주세요." />;
    case 'sent':
      return null;
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
  assignableMembersState,
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
  onSaveSeason,
  seasonForm,
  weekStartDate,
}: {
  actionState: AdminActionState;
  assignableMembersState: AssignablePrayerMembersState;
  boardState: AdminPrayerState;
  groupForm: PrayerGroupForm;
  members: AdminCampusMember[];
  membersForm: PrayerGroupMembersForm;
  onChangeGroupForm: (patch: Partial<PrayerGroupForm>) => void;
  onChangeMembersForm: (patch: Partial<PrayerGroupMembersForm>) => void;
  onChangeSeasonForm: (patch: Partial<PrayerSeasonForm>) => void;
  onChangeWeek: (direction: -1 | 1) => void;
  onEditGroup: (group: AdminPrayerGroup | PrayerWeekSummary['groups'][number]) => void;
  onOpenCloseSeason: (seasonId?: string) => void;
  onRetry: () => void;
  onSaveGroup: () => Promise<boolean>;
  onSaveSeason: () => void;
  seasonForm: PrayerSeasonForm;
  weekStartDate: string;
}) {
  const busy = actionState.status !== 'idle';
  const [section, setSection] = useState<AdminPrayerManagementSection>('status');
  const [groupFlow, setGroupFlow] = useState<AdminPrayerGroupFlow>('list');
  const editGroupAndOpenManagement = (
    group: AdminPrayerGroup | PrayerWeekSummary['groups'][number],
  ) => {
    onEditGroup(group);
    setGroupFlow('details');
    setSection('groups');
  };
  const startGroupCreate = () => {
    onChangeGroupForm({
      groupId: '',
      isActive: true,
      name: '',
      seasonId: groupForm.seasonId,
      sortOrder: String(getNextPrayerGroupSortOrder(boardState)),
    });
    onChangeMembersForm(emptyPrayerGroupMembersForm);
    setGroupFlow('details');
  };
  const saveGroupAndReturnToList = async () => {
    const saved = await onSaveGroup();

    if (saved) {
      setGroupFlow('list');
    }
  };

  return (
    <>
      <AdminSubpageSwitcher
        accessibilityLabelPrefix="기도제목 관리 하위 페이지"
        items={adminPrayerManagementSections}
        onSelect={setSection}
        selectedId={section}
        subtitle={getPrayerManagementSectionSubtitle(section)}
        title="기도제목 관리"
      />
      {section === 'status' ? (
        <>
          <Card>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Eyebrow>주간 현황</Eyebrow>
                <Title>{formatShortWeekLabel(weekStartDate)} 기도제목</Title>
              </View>
            </View>
            <View style={styles.compactActionRow}>
              <AdminCompactButton
                accessibilityLabel="이전 주 기도제목 관리자 현황 조회"
                disabled={busy || boardState.status === 'loading'}
                onPress={() => onChangeWeek(-1)}
                variant="secondary">
                이전
              </AdminCompactButton>
              <AdminCompactButton
                accessibilityLabel="다음 주 기도제목 관리자 현황 조회"
                disabled={busy || boardState.status === 'loading'}
                onPress={() => onChangeWeek(1)}
                variant="secondary">
                다음
              </AdminCompactButton>
              <AdminCompactButton
                accessibilityLabel="기도제목 관리자 현황 다시 조회"
                disabled={busy || boardState.status === 'loading'}
                onPress={onRetry}
                variant="ghost">
                새로고침
              </AdminCompactButton>
            </View>
          </Card>
          {renderAdminPrayerBoard({
            boardState,
            onEditGroup: editGroupAndOpenManagement,
            onRetry,
            weekStartDate,
          })}
        </>
      ) : section === 'groups' ? (
        groupFlow === 'list' ? (
          <AdminPrayerGroupList
            boardState={boardState}
            canCreate={groupForm.seasonId.trim().length > 0}
            onCreate={startGroupCreate}
            onEdit={editGroupAndOpenManagement}
            onRetry={onRetry}
          />
        ) : groupFlow === 'details' ? (
          <AdminPrayerGroupForm
            busy={busy}
            form={groupForm}
            onBack={() => setGroupFlow('list')}
            onChangeForm={onChangeGroupForm}
            onNext={() => setGroupFlow('members')}
          />
        ) : (
          <AdminPrayerMembersForm
            allowWithoutGroupId={groupForm.groupId.trim().length === 0}
            assignableMembersState={assignableMembersState}
            busy={busy}
            form={membersForm}
            members={members}
            onBack={() => setGroupFlow('details')}
            boardState={boardState}
            onChangeForm={onChangeMembersForm}
            onSave={saveGroupAndReturnToList}
            submitLabel={groupForm.groupId.trim() ? '조 수정' : '조 생성'}
          />
        )
      ) : (
        <AdminPrayerSeasonForm
          boardState={boardState}
          busy={busy}
          form={seasonForm}
          onChangeForm={onChangeSeasonForm}
          onOpenCloseSeason={onOpenCloseSeason}
          onSave={onSaveSeason}
        />
      )}
    </>
  );
}

function getPrayerManagementSectionSubtitle(section: AdminPrayerManagementSection) {
  switch (section) {
    case 'status':
      return '주차별 제출 현황만 확인합니다.';
    case 'groups':
      return '기도조 생성, 수정, 조원 배정을 처리합니다.';
    case 'period':
      return '기도제목 운영 기간을 시작하거나 종료합니다.';
    default:
      return assertNever(section);
  }
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
            message={`${weekStartDate} 주차 현황은 조회됐지만 관리할 활성 조원이 없습니다. 운영 기간과 조를 확인해 주세요.`}
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
            <Eyebrow>조별 작성 현황</Eyebrow>
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
                        조원 {group.members.length}명
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
                    조 관리로 이동
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

function AdminPrayerGroupList({
  boardState,
  canCreate,
  onCreate,
  onEdit,
  onRetry,
}: {
  boardState: AdminPrayerState;
  canCreate: boolean;
  onCreate: () => void;
  onEdit: (group: PrayerWeekSummary['groups'][number]) => void;
  onRetry: () => void;
}) {
  switch (boardState.status) {
    case 'idle':
    case 'loading':
      return <Loading message="기도조 목록을 불러오고 있어요." />;
    case 'error':
      return <AdminErrorState error={boardState.error} onRetry={onRetry} />;
    case 'empty':
      return (
        <>
          <Card>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Eyebrow>활성 기도조</Eyebrow>
                <Title>아직 조가 없습니다</Title>
              </View>
              <AdminCompactButton
                accessibilityLabel="기도조 생성 시작"
                disabled={!canCreate}
                onPress={onCreate}>
                조 생성
              </AdminCompactButton>
            </View>
            {!canCreate ? (
              <View style={styles.inlineInfo}>
                <Text style={styles.inlineInfoText}>
                  운영 기간을 먼저 시작하면 새 조를 만들 수 있습니다.
                </Text>
              </View>
            ) : null}
          </Card>
          <Empty
            title="활성 기도조가 없습니다"
            message="조 생성 버튼으로 새 조를 만들고 조원을 배정해 주세요."
            actionLabel="다시 조회"
            actionAccessibilityLabel="조 관리 빈 목록 다시 조회"
            onActionPress={onRetry}
          />
        </>
      );
    case 'success':
      return (
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Eyebrow>활성 기도조</Eyebrow>
              <Title>조 목록</Title>
            </View>
            <AdminCompactButton
              accessibilityLabel="기도조 생성 시작"
              disabled={!canCreate}
              onPress={onCreate}>
              조 생성
            </AdminCompactButton>
          </View>
          {!canCreate ? (
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineInfoText}>
                운영 기간을 먼저 시작하면 새 조를 만들 수 있습니다.
              </Text>
            </View>
          ) : null}
          {boardState.board.groups
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((group) => (
              <View key={group.groupId} style={styles.roleRow}>
                <View style={styles.headerRow}>
                  <View style={styles.headerText}>
                    <Text style={styles.memberName}>{group.groupName}</Text>
                    <Text style={styles.memberMeta}>조원 {group.members.length}명</Text>
                  </View>
                  <Chip
                    label={`${countSubmittedMembers(group)}/${group.members.length}`}
                    tone={countSubmittedMembers(group) === group.members.length ? 'success' : 'warning'}
                  />
                </View>
                <AdminCompactButton
                  accessibilityLabel={`${group.groupName} 기도조 수정 폼으로 불러오기`}
                  onPress={() => onEdit(group)}
                  variant="secondary">
                  편집
                </AdminCompactButton>
              </View>
            ))}
        </Card>
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
      <View style={styles.metricGrid}>
        <Metric label="주차" value={formatShortWeekLabel(board.weekStartDate)} />
        <Metric label="상태" value={board.status} />
        <Metric label="작성" value={`${board.submittedCount}/${board.targetMemberCount}`} />
        <Metric label="기도조" value={`${board.groups.length}개`} />
      </View>
    </Card>
  );
}

function getNextPrayerGroupSortOrder(boardState: AdminPrayerState) {
  if (boardState.status !== 'success' && boardState.status !== 'empty') {
    return 1;
  }

  const maxSortOrder = boardState.board.groups.reduce(
    (currentMax, group) => Math.max(currentMax, group.sortOrder),
    0,
  );

  return maxSortOrder + 1;
}

function getPrayerGroupIdFromForm(form: PrayerGroupMembersForm) {
  const groupId = Number(form.groupId);

  return Number.isInteger(groupId) && groupId > 0 ? groupId : null;
}

function getUnavailablePrayerMemberAssignments(
  boardState: AdminPrayerState,
  currentGroupId: number | null,
) {
  const assignments = new Map<number, string>();

  if (boardState.status !== 'success' && boardState.status !== 'empty') {
    return assignments;
  }

  for (const group of boardState.board.groups) {
    if (group.groupId === currentGroupId) {
      continue;
    }

    for (const member of group.members) {
      if (!assignments.has(member.userId)) {
        assignments.set(member.userId, group.groupName);
      }
    }
  }

  return assignments;
}

function getUnavailablePrayerMemberIds(
  boardState: AdminPrayerState,
  currentGroupId: number | null,
) {
  return new Set(getUnavailablePrayerMemberAssignments(boardState, currentGroupId).keys());
}

function getPrayerAssignableMemberOptions({
  assignableMembersState,
  boardState,
  currentGroupId,
  members,
}: {
  assignableMembersState: AssignablePrayerMembersState;
  boardState: AdminPrayerState;
  currentGroupId: number | null;
  members: AdminCampusMember[];
}) {
  if (assignableMembersState.status === 'success' && assignableMembersState.members.length > 0) {
    return assignableMembersState.members;
  }

  const unavailableAssignments = getUnavailablePrayerMemberAssignments(boardState, currentGroupId);

  return members.map((member): AdminPrayerAssignableMember => {
    const assignedGroupName = unavailableAssignments.get(member.userId) ?? null;

    return {
      assignable: assignedGroupName === null,
      assignedGroupId: null,
      assignedGroupName,
      email: member.email,
      name: member.name,
      userId: member.userId,
    };
  });
}

function isPrayerAssignableMemberSelectable(
  member: AdminPrayerAssignableMember,
  currentGroupId: number | null,
) {
  if (member.assignedGroupId === null || member.assignedGroupId === undefined) {
    return member.assignable;
  }

  return member.assignedGroupId === currentGroupId;
}

async function getCurrentPrayerSeasonWithFallback(
  accessToken: string,
  campusId: number,
  weekBoard: PrayerWeekSummary,
) {
  try {
    const currentSeason = await prayerApi.getCurrentSeason(accessToken, campusId);

    if (currentSeason) {
      return currentSeason;
    }
  } catch (error) {
    if (!isPrayerEndpointMissing(error)) {
      throw error;
    }
  }

  const boardSeason = getPrayerBoardActiveSeason(weekBoard);

  return boardSeason
    ? {
        campusId,
        endDate: null,
        name: boardSeason.name,
        seasonId: boardSeason.seasonId,
        startDate: boardSeason.startDate,
        status: 'ACTIVE',
      }
    : null;
}

function isPrayerEndpointMissing(error: unknown) {
  return error instanceof FaithLogApiError && (error.detail.status === 404 || error.detail.status === 501);
}

function toPrayerBoardWithoutCurrentSeason(board: PrayerWeekSummary): PrayerWeekSummary {
  return {
    ...board,
    activeSeason: null,
    currentSeason: null,
    endDate: null,
    groups: [],
    myGroupId: null,
    season: null,
    seasonEndDate: null,
    seasonId: null,
    seasonName: null,
    seasonStartDate: null,
    seasonStatus: 'CLOSED',
    submittedCount: 0,
    targetMemberCount: 0,
  };
}

function mergePrayerBoardWithSeasonGroups(
  board: PrayerWeekSummary,
  season: AdminPrayerSeason,
  groups: AdminPrayerGroup[],
): PrayerWeekSummary {
  const weeklyGroupsById = new Map(board.groups.map((group) => [group.groupId, group]));
  const mergedGroups =
    groups.length > 0
      ? groups
          .filter((group) => group.active)
          .map((group) => {
            const weeklyGroup = weeklyGroupsById.get(group.groupId);
            const weeklyMembersById = new Map(
              (weeklyGroup?.members ?? []).map((member) => [member.userId, member]),
            );

            return {
              groupId: group.groupId,
              groupName: group.name,
              members: group.members.map((member) => {
                const weeklyMember = weeklyMembersById.get(member.userId);

                return {
                  content: weeklyMember?.content ?? null,
                  editable: weeklyMember?.editable ?? false,
                  email: member.email ?? weeklyMember?.email ?? null,
                  name: member.name,
                  submissionId: weeklyMember?.submissionId ?? null,
                  submitted:
                    weeklyMember?.submitted ??
                    Boolean(weeklyMember?.submittedAt || weeklyMember?.content),
                  submittedAt: weeklyMember?.submittedAt ?? null,
                  userId: member.userId,
                  version: weeklyMember?.version ?? 0,
                };
              }),
              seasonId: group.seasonId,
              sortOrder: group.sortOrder,
            };
          })
      : board.groups;
  const submittedCount = countPrayerBoardSubmittedMembers(mergedGroups);
  const targetMemberCount = countPrayerBoardTargetMembers(mergedGroups);

  return {
    ...board,
    currentSeason: {
      endDate: season.endDate,
      name: season.name,
      seasonId: season.seasonId,
      startDate: season.startDate,
      status: season.status,
    },
    groups: mergedGroups,
    seasonEndDate: season.endDate,
    seasonId: season.seasonId,
    seasonName: season.name,
    seasonStartDate: season.startDate,
    seasonStatus: season.status,
    submittedCount: targetMemberCount > 0 ? submittedCount : board.submittedCount,
    targetMemberCount: targetMemberCount > 0 ? targetMemberCount : board.targetMemberCount,
  };
}

function toAdminPrayerGroupFromSummary(group: PrayerWeekSummary['groups'][number]): AdminPrayerGroup {
  return {
    active: true,
    groupId: group.groupId,
    members: group.members.map((member) => ({
      email: member.email ?? null,
      name: member.name,
      userId: member.userId,
    })),
    name: group.groupName,
    seasonId: group.seasonId ?? 0,
    sortOrder: group.sortOrder,
  };
}

function countPrayerBoardSubmittedMembers(groups: PrayerWeekSummary['groups']) {
  return groups.reduce(
    (count, group) => count + group.members.filter(hasPrayerMemberSubmitted).length,
    0,
  );
}

function countPrayerBoardTargetMembers(groups: PrayerWeekSummary['groups']) {
  return groups.reduce((count, group) => count + group.members.length, 0);
}

function AdminPrayerSeasonForm({
  boardState,
  busy,
  form,
  onChangeForm,
  onOpenCloseSeason,
  onSave,
}: {
  boardState: AdminPrayerState;
  busy: boolean;
  form: PrayerSeasonForm;
  onChangeForm: (patch: Partial<PrayerSeasonForm>) => void;
  onOpenCloseSeason: (seasonId?: string) => void;
  onSave: () => void;
}) {
  const boardSeason =
    boardState.status === 'success' || boardState.status === 'empty'
      ? getPrayerBoardActiveSeason(boardState.board)
      : null;
  const activeSeasonId = form.seasonId.trim() || (boardSeason ? String(boardSeason.seasonId) : '');
  const hasKnownActivePeriod = activeSeasonId.length > 0;
  const hasActivePeriod = hasKnownActivePeriod || hasPrayerBoardActivePeriod(boardState);
  const startDisabled = busy || !form.name.trim();
  const closeDisabled = busy || !hasKnownActivePeriod;
  const activeSeasonName = form.name.trim() || boardSeason?.name || '진행 중';
  const activeSeasonStartDate = form.startDate || boardSeason?.startDate || '';
  const todayLabel = formatAdminDateOnlyDisplay(formatAdminDateForApiDateOnly(new Date()));

  return (
    <Card>
      <Eyebrow>기도 운영 기간</Eyebrow>
      <Title>{hasActivePeriod ? '진행 중 운영 기간' : '새 운영 기간 시작'}</Title>
      <Body>
        {hasActivePeriod
          ? '진행 중에는 새 기간을 시작할 수 없습니다. 먼저 현재 기간을 종료해 주세요.'
          : '새 운영 기간은 오늘 날짜로 바로 시작합니다.'}
      </Body>
      {hasActivePeriod && !hasKnownActivePeriod ? (
        <View style={styles.inlineInfo}>
          <Text style={styles.inlineInfoText}>
            진행 중인 운영 기간은 확인됐지만 현재 응답만으로는 종료 요청을 보낼 수 없습니다.
          </Text>
        </View>
      ) : null}
      {hasActivePeriod ? (
        <>
          <View style={styles.prayerPeriodDateStack}>
            <View style={styles.prayerPeriodDateField}>
              <AdminDateInfoCard
                label="운영 기간"
                value={activeSeasonName}
              />
            </View>
            <View style={styles.prayerPeriodDateField}>
              <AdminDateInfoCard
                label="시작일"
                value={
                  activeSeasonStartDate
                    ? formatAdminDateOnlyDisplay(activeSeasonStartDate)
                    : '확인 필요'
                }
              />
            </View>
          </View>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="현재 기도 운영 기간 종료 확인 열기"
              disabled={closeDisabled}
              onPress={() => onOpenCloseSeason(activeSeasonId)}
              variant="danger">
              {busy ? '처리 중...' : '운영 종료'}
            </Button>
          </View>
        </>
      ) : (
        <>
          <View style={styles.prayerPeriodDateStack}>
            <TextField
              accessibilityLabel="기도 운영 기간 이름"
              label="운영 기간 이름"
              onChangeText={(name) => onChangeForm({name})}
              placeholder="2026 여름 나눔조"
              value={form.name}
            />
            <AdminDateInfoCard
              label="시작일"
              value={todayLabel}
            />
          </View>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="기도 운영 기간 시작"
              disabled={startDisabled}
              onPress={onSave}>
              {busy ? '처리 중...' : '운영 기간 시작'}
            </Button>
          </View>
        </>
      )}
    </Card>
  );
}

function hasPrayerBoardActivePeriod(boardState: AdminPrayerState) {
  if (boardState.status !== 'success' && boardState.status !== 'empty') {
    return false;
  }

  return getPrayerBoardActiveSeason(boardState.board) !== null;
}

function getPrayerBoardActiveSeason(board: PrayerWeekSummary) {
  const nestedSeason = board.activeSeason ?? board.currentSeason ?? board.season;

  if (
    nestedSeason?.seasonId &&
    nestedSeason.endDate === null &&
    nestedSeason.status !== 'CLOSED'
  ) {
    return {
      name: nestedSeason.name,
      seasonId: nestedSeason.seasonId,
      startDate: nestedSeason.startDate,
    };
  }

  const rootSeasonEndDate = 'seasonEndDate' in board ? board.seasonEndDate : board.endDate;

  if (board.seasonId && rootSeasonEndDate === null && board.seasonStatus !== 'CLOSED') {
    return {
      name: board.seasonName ?? '',
      seasonId: board.seasonId,
      startDate: board.seasonStartDate ?? board.weekStartDate,
    };
  }

  return null;
}

function AdminDateInfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.dateTimeSelectCard}>
      <Text style={styles.dateTimeSelectLabel}>{label}</Text>
      <Text style={styles.dateTimeSelectValue}>{value}</Text>
    </View>
  );
}

function AdminPrayerGroupForm({
  busy,
  form,
  onBack,
  onChangeForm,
  onNext,
}: {
  busy: boolean;
  form: PrayerGroupForm;
  onBack: () => void;
  onChangeForm: (patch: Partial<PrayerGroupForm>) => void;
  onNext: () => void;
}) {
  const hasActivePeriod = form.seasonId.trim().length > 0;
  const isEditing = form.groupId.trim().length > 0;
  const nextDisabled = busy || !form.name.trim() || (!hasActivePeriod && !isEditing);

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Eyebrow>기도조</Eyebrow>
          <Title>{isEditing ? '조 정보 수정' : '새 조 만들기'}</Title>
        </View>
        {isEditing ? (
          <AdminCompactButton
            accessibilityLabel="새 기도조 생성 모드로 전환"
            disabled={busy}
            onPress={() =>
              onChangeForm({
                groupId: '',
                isActive: true,
                name: '',
                sortOrder: '1',
              })
            }
            variant="ghost">
            새 조
          </AdminCompactButton>
        ) : null}
      </View>
      {!hasActivePeriod && !isEditing ? (
        <View style={styles.inlineInfo}>
          <Text style={styles.inlineInfoText}>
            운영 기간을 먼저 시작하면 새 조를 생성할 수 있습니다.
          </Text>
        </View>
      ) : null}
      {isEditing ? (
        <View style={styles.inlineInfo}>
          <Text style={styles.inlineInfoText}>
            아래 목록에서 선택한 조를 수정합니다.
          </Text>
        </View>
      ) : null}
      <TextField
        accessibilityLabel="기도조 이름"
        label="조 이름"
        onChangeText={(name) => onChangeForm({name})}
        placeholder="2조"
        value={form.name}
      />
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
      <View style={styles.actionRow}>
        <Button
          accessibilityLabel="기도조 목록으로 돌아가기"
          disabled={busy}
          onPress={onBack}
          variant="secondary">
          목록
        </Button>
        <Button
          accessibilityLabel="기도조 멤버 선택 단계로 이동"
          disabled={nextDisabled}
          onPress={onNext}>
          다음
        </Button>
      </View>
    </Card>
  );
}

function AdminPrayerMembersForm({
  allowWithoutGroupId = false,
  assignableMembersState,
  boardState,
  busy,
  form,
  members,
  onBack,
  onChangeForm,
  onSave,
  submitLabel = '멤버 저장',
}: {
  allowWithoutGroupId?: boolean;
  assignableMembersState: AssignablePrayerMembersState;
  boardState: AdminPrayerState;
  busy: boolean;
  form: PrayerGroupMembersForm;
  members: AdminCampusMember[];
  onBack: () => void;
  onChangeForm: (patch: Partial<PrayerGroupMembersForm>) => void;
  onSave: () => Promise<void>;
  submitLabel?: string;
}) {
  const [searchText, setSearchText] = useState('');
  const hasSelectedGroup = allowWithoutGroupId || form.groupId.trim().length > 0;
  const currentGroupId = getPrayerGroupIdFromForm(form);
  const unavailableAssignments = getUnavailablePrayerMemberAssignments(boardState, currentGroupId);
  const memberOptions = getPrayerAssignableMemberOptions({
    assignableMembersState,
    boardState,
    currentGroupId,
    members,
  });
  const selectedUserIds = new Set(
    parsePrayerMemberSelection(form.userIds).filter((userId) => {
      const option = memberOptions.find((member) => member.userId === userId);

      return option ? isPrayerAssignableMemberSelectable(option, currentGroupId) : true;
    }),
  );
  const canSave = hasSelectedGroup && selectedUserIds.size > 0 && !busy;
  const toggleMember = (userId: number) => {
    const option = memberOptions.find((member) => member.userId === userId);

    if (option && !isPrayerAssignableMemberSelectable(option, currentGroupId)) {
      return;
    }

    const next = new Set(selectedUserIds);

    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }

    onChangeForm({userIds: Array.from(next).sort((a, b) => a - b).join(', ')});
  };
  const normalizedSearch = searchText.trim().toLowerCase();
  const displayMembers = memberOptions.filter((member) => {
    if (!normalizedSearch) {
      return true;
    }

    return (
      member.name.toLowerCase().includes(normalizedSearch) ||
      member.email.toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <Card>
      <Eyebrow>조원 배정</Eyebrow>
      <Title>멤버 선택</Title>
      <Body>
        선택한 멤버만 조원으로 남기고, 선택하지 않은 멤버는 이 조에서 제외합니다.
      </Body>
      {hasSelectedGroup ? (
        <View style={styles.inlineInfo}>
          <Text style={styles.inlineInfoText}>
            선택한 멤버 목록으로 조를 저장합니다.
          </Text>
        </View>
      ) : (
        <View style={styles.inlineInfo}>
          <Text style={styles.inlineInfoText}>
            아래 활성 기도조에서 편집을 누르면 멤버 저장을 할 수 있습니다.
          </Text>
        </View>
      )}
      {hasSelectedGroup ? (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>멤버 선택</Text>
            <Chip
              label={`${selectedUserIds.size}명 선택`}
              tone={selectedUserIds.size > 0 ? 'success' : 'default'}
            />
          </View>
          <TextField
            accessibilityLabel="기도조 배정 멤버 검색"
            label="검색"
            onChangeText={setSearchText}
            placeholder="이름 또는 이메일"
            value={searchText}
          />
          {assignableMembersState.status === 'loading' ? (
            <Body>배정 가능 멤버를 불러오고 있어요.</Body>
          ) : assignableMembersState.status === 'error' ? (
            <AdminInlineError error={assignableMembersState.error} />
          ) : null}
          {selectedUserIds.size === 0 ? (
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineInfoText}>조원 1명 이상을 선택해야 저장할 수 있어요.</Text>
            </View>
          ) : null}
          <View style={styles.prayerMemberSelectList}>
            {displayMembers.map((member) => {
              const assignedGroupName =
                member.assignedGroupName ?? unavailableAssignments.get(member.userId) ?? null;
              const disabled =
                busy || !isPrayerAssignableMemberSelectable(member, currentGroupId);
              const selected = selectedUserIds.has(member.userId);

              return (
                <Pressable
                  accessibilityLabel={
                    assignedGroupName
                      ? `${member.name} 조원 ${assignedGroupName}에 배정됨`
                      : `${member.name} 조원 ${selected ? '선택 해제' : '선택'}`
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: selected, disabled}}
                  disabled={disabled}
                  key={member.userId}
                  onPress={() => toggleMember(member.userId)}
                  style={({pressed}) => [
                    styles.prayerMemberSelectRow,
                    selected ? styles.prayerMemberSelectRowActive : null,
                    disabled ? styles.prayerMemberSelectRowDisabled : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <View style={styles.headerText}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberMeta}>{member.email}</Text>
                    {assignedGroupName ? (
                      <Text style={styles.memberMeta}>{assignedGroupName}에 배정됨</Text>
                    ) : null}
                  </View>
                  <Chip
                    label={assignedGroupName && disabled ? '배정됨' : selected ? '선택됨' : '선택'}
                    tone={selected ? 'success' : 'default'}
                  />
                </Pressable>
              );
            })}
          </View>
          <Button
            accessibilityLabel="기도조 멤버 전체 교체 저장"
            disabled={!canSave}
            onPress={onSave}>
            {busy ? '저장 중...' : submitLabel}
          </Button>
          <Button
            accessibilityLabel="기도조 정보 입력 단계로 돌아가기"
            disabled={busy}
            onPress={onBack}
            variant="secondary">
            이전
          </Button>
        </>
      ) : null}
    </Card>
  );
}

function AdminSettlement({
  actionState,
  chargeReminderLoadingCategory,
  currentUserId,
  detailState,
  filters,
  knownOwnedCoffeeAccountIds,
  notificationState,
  penaltyRuleError,
  penaltyRuleFlow,
  onActivatePaymentAccount,
  onBackPenaltyRule,
  onChangePaymentAccountForm,
  onChangePenaltyRuleForm,
  onChangeSection,
  onBackToSummary,
  onCopyPaymentAccount,
  onEditPenaltyRule,
  onOpenPenaltyRuleCreate,
  onOpenChargeReminderConfirm,
  onOpenMemberCharges,
  onRequestDeletePaymentAccount,
  onRequestDeactivatePaymentAccount,
  onRequestStatusChange,
  onRetryPaymentAccounts,
  onRetryPenaltyRules,
  onResetFilters,
  onRetryDetail,
  onRetrySummary,
  onSavePaymentAccount,
  onSavePenaltyRule,
  onSelectPaymentAccount,
  onUpdateFilter,
  paymentAccountForm,
  paymentAccountCopyFeedback,
  paymentAccountCopyOpacity,
  paymentAccountState,
  penaltyRuleForm,
  penaltyRuleState,
  section,
  selectedPaymentAccount,
  settlementState,
}: {
  actionState: AdminActionState;
  chargeReminderLoadingCategory: PaymentAccountCategory | null;
  currentUserId: number;
  detailState: AdminChargeDetailState;
  filters: AdminChargeFilters;
  knownOwnedCoffeeAccountIds: Set<number>;
  notificationState: NotificationSendState;
  penaltyRuleError: ApiError | null;
  penaltyRuleFlow: PenaltyRuleFlow;
  onActivatePaymentAccount: (account: PaymentAccount) => void;
  onBackPenaltyRule: () => void;
  onChangePaymentAccountForm: (patch: Partial<PaymentAccountForm>) => void;
  onChangePenaltyRuleForm: (patch: Partial<PenaltyRuleDraft>) => void;
  onChangeSection: (section: AdminSettlementSection) => void;
  onBackToSummary: () => void;
  onCopyPaymentAccount: (account: PaymentAccount) => void;
  onEditPenaltyRule: (rule: PenaltyRule) => void;
  onOpenPenaltyRuleCreate: () => void;
  onOpenChargeReminderConfirm: (paymentCategory: PaymentAccountCategory) => void;
  onOpenMemberCharges: (member: AdminChargeMemberRef) => void;
  onRequestDeletePaymentAccount: (account: PaymentAccount) => void;
  onRequestDeactivatePaymentAccount: (account: PaymentAccount) => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminChargeStatusTarget) => void;
  onRetryPaymentAccounts: () => void;
  onRetryPenaltyRules: () => void;
  onResetFilters: () => void;
  onRetryDetail: (member: AdminChargeMemberRef) => void;
  onRetrySummary: () => void;
  onSavePaymentAccount: () => void;
  onSavePenaltyRule: () => void;
  onSelectPaymentAccount: (account: PaymentAccount | null) => void;
  onUpdateFilter: <Key extends keyof AdminChargeFilters>(
    key: Key,
    value: AdminChargeFilters[Key],
  ) => void;
  paymentAccountForm: PaymentAccountForm;
  paymentAccountCopyFeedback: AccountCopyFeedback;
  paymentAccountCopyOpacity: Animated.Value;
  paymentAccountState: PaymentAccountState;
  penaltyRuleForm: PenaltyRuleDraft;
  penaltyRuleState: PenaltyRuleState;
  section: AdminSettlementSection;
  selectedPaymentAccount: PaymentAccount | null;
  settlementState: AdminSettlementState;
}) {
  const busy = actionState.status !== 'idle';
  const chargeDetailOpen = section === 'charges' && detailState.status !== 'idle';
  const penaltyRuleFormOpen = section === 'penaltyRules' && penaltyRuleFlow.route !== 'list';
  const sectionHint = getSettlementSectionHint(section);

  return (
    <>
      {chargeDetailOpen || penaltyRuleFormOpen ? null : (
        <View style={styles.settlementTabBlock}>
          <FigmaSegmentedControl
            items={settlementSections}
            selectedId={section}
            onSelect={onChangeSection}
          />
          {sectionHint ? <Text style={styles.settlementTabHint}>{sectionHint}</Text> : null}
        </View>
      )}
      {section === 'charges' ? (
        <AdminChargeSettlement
          actionState={actionState}
          chargeReminderLoadingCategory={chargeReminderLoadingCategory}
          detailState={detailState}
          filters={filters}
          notificationState={notificationState}
          onBackToSummary={onBackToSummary}
          onOpenChargeReminderConfirm={onOpenChargeReminderConfirm}
          onOpenMemberCharges={onOpenMemberCharges}
          onRequestStatusChange={onRequestStatusChange}
          onResetFilters={onResetFilters}
          onRetryDetail={onRetryDetail}
          onRetrySummary={onRetrySummary}
          onUpdateFilter={onUpdateFilter}
          settlementState={settlementState}
        />
      ) : section === 'accounts' ? (
        <AdminPaymentAccounts
          busy={busy}
          copyFeedback={paymentAccountCopyFeedback}
          copyOpacity={paymentAccountCopyOpacity}
          currentUserId={currentUserId}
          form={paymentAccountForm}
          knownOwnedCoffeeAccountIds={knownOwnedCoffeeAccountIds}
          onActivateAccount={onActivatePaymentAccount}
          onChangeForm={onChangePaymentAccountForm}
          onBackToList={() => onSelectPaymentAccount(null)}
          onRequestDelete={onRequestDeletePaymentAccount}
          onRequestDeactivate={onRequestDeactivatePaymentAccount}
          onCopyAccount={onCopyPaymentAccount}
          onRetry={onRetryPaymentAccounts}
          onSave={onSavePaymentAccount}
          onSelectAccount={onSelectPaymentAccount}
          selectedAccount={selectedPaymentAccount}
          state={paymentAccountState}
        />
      ) : (
        <AdminPenaltyRules
          busy={busy}
          error={penaltyRuleError}
          flow={penaltyRuleFlow}
          form={penaltyRuleForm}
          onBack={onBackPenaltyRule}
          onChangeForm={onChangePenaltyRuleForm}
          onEdit={onEditPenaltyRule}
          onOpenCreate={onOpenPenaltyRuleCreate}
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
  chargeReminderLoadingCategory,
  detailState,
  filters,
  notificationState,
  onBackToSummary,
  onOpenChargeReminderConfirm,
  onOpenMemberCharges,
  onRequestStatusChange,
  onResetFilters,
  onRetryDetail,
  onRetrySummary,
  onUpdateFilter,
  settlementState,
}: {
  actionState: AdminActionState;
  chargeReminderLoadingCategory: PaymentAccountCategory | null;
  detailState: AdminChargeDetailState;
  filters: AdminChargeFilters;
  notificationState: NotificationSendState;
  onBackToSummary: () => void;
  onOpenChargeReminderConfirm: (paymentCategory: PaymentAccountCategory) => void;
  onOpenMemberCharges: (member: AdminChargeMemberRef) => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminChargeStatusTarget) => void;
  onResetFilters: () => void;
  onRetryDetail: (member: AdminChargeMemberRef) => void;
  onRetrySummary: () => void;
  onUpdateFilter: <Key extends keyof AdminChargeFilters>(
    key: Key,
    value: AdminChargeFilters[Key],
  ) => void;
  settlementState: AdminSettlementState;
}) {
  if (detailState.status !== 'idle') {
    return renderChargeDetail({
      actionState,
      detailState,
      onBackToSummary,
      onRequestStatusChange,
      onRetryDetail,
    });
  }

  const summary =
    settlementState.status === 'success' || settlementState.status === 'empty'
      ? settlementState.charges
      : null;
  const notificationBusy =
    notificationState.status === 'sending' || chargeReminderLoadingCategory !== null;

  return (
    <>
      {summary ? <SettlementSummaryCard charges={summary} /> : null}
      <View style={styles.chargeFilterCard}>
        <View style={styles.chargeFilterHeader}>
          <View style={styles.headerText}>
            <Text style={styles.sectionTitle}>청구</Text>
            <Text style={styles.settlementSectionDescription}>필터를 누르면 바로 반영됩니다.</Text>
          </View>
          <Button
            accessibilityLabel="관리자 정산 필터 초기화"
            onPress={onResetFilters}
            variant="ghost">
            초기화
          </Button>
        </View>
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
        <View style={styles.chargeReminderBox}>
          <View style={styles.headerText}>
            <Text style={styles.chargeReminderTitle}>미납 푸시 알림</Text>
            <Text style={styles.settlementSectionDescription}>
              문서 기준 미납 청구 조회 후 대상자에게만 보냅니다.
            </Text>
          </View>
          <View style={styles.compactActionRow}>
            <AdminCompactButton
              accessibilityLabel="벌금 미납자 푸시 알림 발송 확인 열기"
              disabled={notificationBusy}
              onPress={() => onOpenChargeReminderConfirm('PENALTY')}
              variant="secondary">
              {chargeReminderLoadingCategory === 'PENALTY' ? '조회 중...' : '벌금 미납 알림'}
            </AdminCompactButton>
            <AdminCompactButton
              accessibilityLabel="커피 미납자 푸시 알림 발송 확인 열기"
              disabled={notificationBusy}
              onPress={() => onOpenChargeReminderConfirm('COFFEE')}
              variant="secondary">
              {chargeReminderLoadingCategory === 'COFFEE' ? '조회 중...' : '커피 미납 알림'}
            </AdminCompactButton>
          </View>
        </View>
        <View style={styles.filterGrid}>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="정산 이름 또는 이메일 검색어"
              label="회원 검색"
              onChangeText={(keyword) => onUpdateFilter('keyword', keyword)}
              placeholder="이름, 이메일"
              value={filters.keyword}
            />
          </View>
        </View>
      </View>
      {isChargeReminderNotificationState(notificationState)
        ? renderNotificationResult(notificationState)
        : null}
      {renderSettlementSummary({
        onOpenMemberCharges,
        onRetrySummary,
        settlementState,
        showSummary: summary === null,
      })}
    </>
  );
}

function SettlementSectionHeader({
  description,
  title,
}: {
  description?: string;
  title: string;
}) {
  return (
    <View style={styles.settlementSectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? <Text style={styles.settlementSectionDescription}>{description}</Text> : null}
    </View>
  );
}

function AdminPaymentAccounts({
  busy,
  copyFeedback,
  copyOpacity,
  currentUserId,
  form,
  knownOwnedCoffeeAccountIds,
  onActivateAccount,
  onChangeForm,
  onBackToList,
  onCopyAccount,
  onRequestDelete,
  onRequestDeactivate,
  onRetry,
  onSave,
  onSelectAccount,
  selectedAccount,
  state,
}: {
  busy: boolean;
  copyFeedback: AccountCopyFeedback;
  copyOpacity: Animated.Value;
  currentUserId: number;
  form: PaymentAccountForm;
  knownOwnedCoffeeAccountIds: Set<number>;
  onActivateAccount: (account: PaymentAccount) => void;
  onChangeForm: (patch: Partial<PaymentAccountForm>) => void;
  onBackToList: () => void;
  onCopyAccount: (account: PaymentAccount) => void;
  onRequestDelete: (account: PaymentAccount) => void;
  onRequestDeactivate: (account: PaymentAccount) => void;
  onRetry: () => void;
  onSave: () => void;
  onSelectAccount: (account: PaymentAccount) => void;
  selectedAccount: PaymentAccount | null;
  state: PaymentAccountState;
}) {
  const [accountPage, setAccountPage] = useState<'overview' | 'penaltyAccounts'>('overview');

  if (accountPage === 'penaltyAccounts') {
    return (
      <PenaltyAccountManager
        busy={busy}
        onActivateAccount={onActivateAccount}
        onBack={() => setAccountPage('overview')}
        onRequestDelete={onRequestDelete}
        onRetry={onRetry}
        state={state}
      />
    );
  }

  if (selectedAccount) {
    return (
      <PaymentAccountDetail
        account={selectedAccount}
        busy={busy}
        copyFeedback={copyFeedback}
        copyOpacity={copyOpacity}
        onActivateAccount={onActivateAccount}
        onBack={onBackToList}
        onCopyAccount={onCopyAccount}
        onRequestDelete={onRequestDelete}
        onRequestDeactivate={onRequestDeactivate}
      />
    );
  }

  return (
    <>
      <SettlementSectionHeader title="계좌 관리" />
      {renderPaymentAccountList({
        busy,
        currentUserId,
        knownOwnedCoffeeAccountIds,
        onOpenPenaltyAccountManager: () => setAccountPage('penaltyAccounts'),
        onRequestDelete,
        onRetry,
        onSelectAccount,
        state,
      })}
      <SettlementSectionHeader title="계좌 등록" />
      <View style={styles.figmaFormCard}>
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
        <Pressable
          accessibilityLabel="관리자 납부 계좌 등록"
          accessibilityRole="button"
          accessibilityState={{disabled: busy}}
          disabled={busy}
          onPress={onSave}
          style={({pressed}) => [
            styles.paymentAccountSubmitButton,
            busy ? styles.adminCompactButtonDisabled : null,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.paymentAccountSubmitButtonText}>
            {busy ? '저장 중...' : '계좌 저장'}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function PaymentAccountDetail({
  account,
  busy,
  copyFeedback,
  copyOpacity,
  onActivateAccount,
  onBack,
  onCopyAccount,
  onRequestDelete,
  onRequestDeactivate,
}: {
  account: PaymentAccount;
  busy: boolean;
  copyFeedback: AccountCopyFeedback;
  copyOpacity: Animated.Value;
  onActivateAccount: (account: PaymentAccount) => void;
  onBack: () => void;
  onCopyAccount: (account: PaymentAccount) => void;
  onRequestDelete: (account: PaymentAccount) => void;
  onRequestDeactivate: (account: PaymentAccount) => void;
}) {
  const active = isPaymentAccountActive(account);

  return (
    <>
      <View style={styles.figmaHeroCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.figmaScreenTitle}>{account.nickname}</Text>
            <Pressable
              accessibilityLabel={`${account.nickname} 계좌번호 복사`}
              accessibilityRole="button"
              onPress={() => onCopyAccount(account)}
              style={({pressed}) => [
                styles.accountNumberButton,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.accountNumber}>{account.accountNumber}</Text>
            </Pressable>
          </View>
          <View style={styles.accountHeaderTrailing}>
            {copyFeedback?.accountId === account.id ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.accountCopyBadge, {opacity: copyOpacity}]}>
                <Text
                  accessibilityLabel={copyFeedback.message}
                  style={[
                    styles.accountCopyHint,
                    copyFeedback.tone === 'warning' ? styles.accountCopyHintWarning : null,
                  ]}>
                  {copyFeedback.message}
                </Text>
              </Animated.View>
            ) : null}
            <Chip label={getPaymentAccountStatusLabel(account)} tone={active ? 'success' : 'warning'} />
          </View>
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
        {active ? (
          <Button
            accessibilityLabel={`${account.nickname} 계좌 비활성화 확인 열기`}
            disabled={busy}
            onPress={() => onRequestDeactivate(account)}
            variant="danger">
            비활성화
          </Button>
        ) : (
          <>
            <Button
              accessibilityLabel={`${account.nickname} 계좌 활성화`}
              disabled={busy}
              onPress={() => onActivateAccount(account)}>
              활성화
            </Button>
            <Button
              accessibilityLabel={`${account.nickname} 비활성 계좌 삭제 확인 열기`}
              disabled={busy}
              onPress={() => onRequestDelete(account)}
              variant="danger">
              삭제
            </Button>
          </>
        )}
        <Button accessibilityLabel="납부 계좌 목록으로 돌아가기" onPress={onBack} variant="secondary">
          목록
        </Button>
      </View>
    </>
  );
}

function renderPaymentAccountList({
  busy,
  currentUserId,
  knownOwnedCoffeeAccountIds,
  onOpenPenaltyAccountManager,
  onRequestDelete,
  onRetry,
  onSelectAccount,
  state,
}: {
  busy: boolean;
  currentUserId: number;
  knownOwnedCoffeeAccountIds: Set<number>;
  onOpenPenaltyAccountManager: () => void;
  onRequestDelete: (account: PaymentAccount) => void;
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
          title="등록된 계좌가 없습니다"
          message="벌금 정산 계좌 또는 커피투표에 사용할 내 커피 계좌를 등록해 주세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="납부 계좌 empty state에서 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'success':
      const activePenaltyAccounts = state.accounts
        .filter((account) => account.accountType === 'PENALTY' && isPaymentAccountActive(account))
        .sort(comparePaymentAccountsForDisplay);
      const inactivePenaltyAccounts = state.accounts
        .filter((account) => account.accountType === 'PENALTY' && !isPaymentAccountActive(account))
        .sort(comparePaymentAccountsForDisplay);
      const ownedCoffeeAccounts = getOwnedCoffeePaymentAccounts(
        state.accounts,
        currentUserId,
        knownOwnedCoffeeAccountIds,
        {includeInactive: true},
      ).sort(comparePaymentAccountsForDisplay);
      const activeOwnedCoffeeAccounts = ownedCoffeeAccounts.filter(isPaymentAccountActive);
      const inactiveOwnedCoffeeAccounts = ownedCoffeeAccounts.filter(
        (account) => !isPaymentAccountActive(account),
      );

      return (
        <>
          <SettlementSectionHeader title="활성 벌금 계좌" />
          {activePenaltyAccounts.length === 0 ? (
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineInfoText}>
                새 벌금 계좌를 등록하거나 비활성 계좌를 활성화해 주세요.
              </Text>
              {inactivePenaltyAccounts.length > 0 ? (
                <AdminCompactButton
                  accessibilityLabel="벌금 계좌 변경 페이지 열기"
                  disabled={busy}
                  onPress={onOpenPenaltyAccountManager}
                  variant="secondary">
                  벌금 계좌 변경
                </AdminCompactButton>
              ) : null}
            </View>
          ) : (
            <>
              {activePenaltyAccounts.map((account) => (
                <PaymentAccountListItem
                  account={account}
                  busy={busy}
                  key={account.id}
                  onSelectAccount={() => onOpenPenaltyAccountManager()}
                  selectAccessibilityLabel="벌금 계좌 변경 페이지 열기"
                  selectLabel="벌금 계좌 변경"
                />
              ))}
            </>
          )}
          <SettlementSectionHeader title="내 커피 계좌" />
          {ownedCoffeeAccounts.length === 0 ? (
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineInfoText}>커피투표를 만들려면 내 커피 계좌를 등록해 주세요.</Text>
            </View>
          ) : (
            <>
              {activeOwnedCoffeeAccounts.map((account) => (
                <PaymentAccountListItem
                  account={account}
                  busy={busy}
                  key={account.id}
                  onSelectAccount={onSelectAccount}
                />
              ))}
              {inactiveOwnedCoffeeAccounts.map((account) => (
                <PaymentAccountListItem
                  account={account}
                  busy={busy}
                  key={account.id}
                  onRequestDelete={onRequestDelete}
                  onSelectAccount={onSelectAccount}
                />
              ))}
            </>
          )}
        </>
      );
    default:
      return assertNever(state);
  }
}

function PenaltyAccountManager({
  busy,
  onActivateAccount,
  onBack,
  onRequestDelete,
  onRetry,
  state,
}: {
  busy: boolean;
  onActivateAccount: (account: PaymentAccount) => void;
  onBack: () => void;
  onRequestDelete: (account: PaymentAccount) => void;
  onRetry: () => void;
  state: PaymentAccountState;
}) {
  return (
    <>
      <View style={styles.accountSubpageHeader}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>벌금 계좌 변경</Text>
          <Text style={styles.settlementSectionDescription}>
            활성 계좌를 바꾸거나 쓰지 않는 비활성 계좌를 정리합니다.
          </Text>
        </View>
        <AdminCompactButton
          accessibilityLabel="계좌 관리로 돌아가기"
          disabled={busy}
          onPress={onBack}
          variant="secondary">
          뒤로
        </AdminCompactButton>
      </View>
      {renderPenaltyAccountManagerList({
        busy,
        onActivateAccount,
        onRequestDelete,
        onRetry,
        state,
      })}
    </>
  );
}

function renderPenaltyAccountManagerList({
  busy,
  onActivateAccount,
  onRequestDelete,
  onRetry,
  state,
}: {
  busy: boolean;
  onActivateAccount: (account: PaymentAccount) => void;
  onRequestDelete: (account: PaymentAccount) => void;
  onRetry: () => void;
  state: PaymentAccountState;
}) {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return <Loading message="벌금 계좌를 불러오고 있어요." />;
    case 'error':
      return <AdminErrorState error={state.error} onRetry={onRetry} />;
    case 'empty':
      return (
        <Empty
          title="등록된 벌금 계좌가 없습니다"
          message="계좌 관리로 돌아가 새 벌금 계좌를 등록해 주세요."
          actionLabel="다시 조회"
          actionAccessibilityLabel="벌금 계좌 변경 empty state에서 다시 조회"
          onActionPress={onRetry}
        />
      );
    case 'success':
      const penaltyAccounts = state.accounts
        .filter((account) => account.accountType === 'PENALTY')
        .sort(comparePaymentAccountsForDisplay);
      const activePenaltyAccounts = penaltyAccounts.filter(isPaymentAccountActive);
      const inactivePenaltyAccounts = penaltyAccounts.filter(
        (account) => !isPaymentAccountActive(account),
      );

      if (penaltyAccounts.length === 0) {
        return (
          <Empty
            title="등록된 벌금 계좌가 없습니다"
            message="계좌 관리로 돌아가 새 벌금 계좌를 등록해 주세요."
            actionLabel="다시 조회"
            actionAccessibilityLabel="벌금 계좌 변경 목록 다시 조회"
            onActionPress={onRetry}
          />
        );
      }

      return (
        <>
          <SettlementSectionHeader title="현재 활성 계좌" />
          {activePenaltyAccounts.length === 0 ? (
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineInfoText}>현재 활성 벌금 계좌가 없습니다.</Text>
            </View>
          ) : (
            activePenaltyAccounts.map((account) => (
              <PaymentAccountListItem account={account} busy={busy} key={account.id} />
            ))
          )}
          <SettlementSectionHeader title="비활성 계좌" />
          {inactivePenaltyAccounts.length === 0 ? (
            <View style={styles.inlineInfo}>
              <Text style={styles.inlineInfoText}>바꿀 수 있는 비활성 계좌가 없습니다.</Text>
            </View>
          ) : (
            inactivePenaltyAccounts.map((account) => (
              <PaymentAccountListItem
                account={account}
                busy={busy}
                key={account.id}
                onActivateAccount={onActivateAccount}
                onRequestDelete={onRequestDelete}
              />
            ))
          )}
        </>
      );
    default:
      return assertNever(state);
  }
}

function PaymentAccountListItem({
  account,
  busy,
  onActivateAccount,
  onRequestDelete,
  onSelectAccount,
  selectAccessibilityLabel,
  selectLabel = '상세',
}: {
  account: PaymentAccount;
  busy: boolean;
  onActivateAccount?: (account: PaymentAccount) => void;
  onRequestDelete?: (account: PaymentAccount) => void;
  onSelectAccount?: (account: PaymentAccount) => void;
  selectAccessibilityLabel?: string;
  selectLabel?: string;
}) {
  const active = isPaymentAccountActive(account);

  return (
    <View style={styles.figmaListItem}>
      <View style={styles.figmaIconBox}>
        <IconexIcon
          color={active ? adminFigmaTokens.primary : adminFigmaTokens.textMuted}
          name={account.accountType === 'COFFEE' ? 'credit-card' : 'wallet'}
          size={22}
        />
      </View>
      <View style={styles.accountListContent}>
        <View style={styles.accountListHeader}>
          <View style={styles.accountListText}>
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.figmaCardTitle}>
              {account.nickname}
            </Text>
            <Text style={styles.figmaBodyText}>
              {getPaymentCategoryLabel(account.accountType)} · {account.bankName}
            </Text>
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.accountListAccountNumber}>
              계좌번호 {account.accountNumber}
            </Text>
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.accountListAccountHolder}>
              예금주 {account.accountHolder}
            </Text>
          </View>
          <View
            style={[
              styles.accountStatusBadge,
              active ? styles.accountStatusBadgeActive : styles.accountStatusBadgeInactive,
            ]}>
            <Text
              style={[
                styles.accountStatusBadgeText,
                active
                  ? styles.accountStatusBadgeTextActive
                  : styles.accountStatusBadgeTextInactive,
              ]}>
              {getPaymentAccountStatusLabel(account)}
            </Text>
          </View>
        </View>
        <View style={styles.accountActionRow}>
          {!active && onActivateAccount ? (
            <AdminCompactButton
              accessibilityLabel={`${account.nickname} 계좌 활성화`}
              disabled={busy}
              onPress={() => onActivateAccount(account)}>
              활성화
            </AdminCompactButton>
          ) : null}
          {!active && onRequestDelete ? (
            <AdminCompactButton
              accessibilityLabel={`${account.nickname} 비활성 계좌 삭제 확인 열기`}
              disabled={busy}
              onPress={() => onRequestDelete(account)}
              variant="danger">
              삭제
            </AdminCompactButton>
          ) : null}
          {onSelectAccount ? (
            <AdminCompactButton
              accessibilityLabel={selectAccessibilityLabel ?? `${account.nickname} 계좌 상세 보기`}
              disabled={busy}
              onPress={() => onSelectAccount(account)}
              variant="secondary">
              {selectLabel}
            </AdminCompactButton>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function AdminPenaltyRules({
  busy,
  error,
  flow,
  form,
  onBack,
  onChangeForm,
  onEdit,
  onOpenCreate,
  onRetry,
  onSave,
  state,
}: {
  busy: boolean;
  error: ApiError | null;
  flow: PenaltyRuleFlow;
  form: PenaltyRuleDraft;
  onBack: () => void;
  onChangeForm: (patch: Partial<PenaltyRuleDraft>) => void;
  onEdit: (rule: PenaltyRule) => void;
  onOpenCreate: () => void;
  onRetry: () => void;
  onSave: () => void;
  state: PenaltyRuleState;
}) {
  const activeRules = getPenaltyRulesForSelection(state);

  if (flow.route === 'list') {
    return (
      <View style={styles.figmaListStack}>
        <View style={styles.penaltyRuleListHeader}>
          <SettlementSectionHeader
            description="현재 적용 중인 규칙만 확인하고, 기존 규칙은 수정 페이지에서 변경합니다."
            title="벌금 규칙"
          />
          <AdminCompactButton
            accessibilityLabel="벌금 규칙 추가 페이지 열기"
            disabled={busy}
            onPress={onOpenCreate}>
            규칙 추가
          </AdminCompactButton>
        </View>
        {renderPenaltyRuleList({busy, onEdit, onRetry, state})}
      </View>
    );
  }

  const lateMinuteRule = isSaturdayLatePenaltyRule(form.ruleType);
  const calculationLabel = lateMinuteRule ? '지각 분 기준' : '미달 횟수 기준';
  const replacesActiveRule =
    flow.route === 'create' &&
    activeRules !== null &&
    hasActivePenaltyRuleType(activeRules, form.ruleType);
  const pageTitle = flow.route === 'create' ? '규칙 추가' : '규칙 수정';

  return (
    <>
      <View accessibilityRole="header" style={styles.accountSubpageHeader}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>{pageTitle}</Text>
          <Text style={styles.settlementSectionDescription}>
            {flow.route === 'create'
              ? '규칙 항목을 선택하고 새로 적용할 금액 기준을 입력합니다.'
              : '규칙 항목은 유지하고 현재 적용 중인 금액 기준만 수정합니다.'}
          </Text>
        </View>
        <AdminCompactButton
          accessibilityLabel={`${pageTitle} 페이지에서 규칙 목록으로 돌아가기`}
          disabled={busy}
          onPress={onBack}
          variant="secondary">
          뒤로
        </AdminCompactButton>
      </View>
      <View style={styles.figmaFormCard}>
        {flow.route === 'create' ? (
          <FigmaSegmentedControl
            accessibilityLabelSuffix="규칙 항목 선택"
            disabled={busy}
            items={penaltyRuleTypeOptions}
            selectedId={form.ruleType}
            onSelect={(ruleType) => {
              onChangeForm({
                ruleType,
                calculationType: getPenaltyCalculationType(ruleType),
                requiredCount: getRequiredCountForRuleType(
                  ruleType,
                  form.requiredCount,
                ),
              });
              if (
                activeRules !== null &&
                hasActivePenaltyRuleType(activeRules, ruleType)
              ) {
                AccessibilityInfo.announceForAccessibility(
                  `${getPenaltyRuleTypeLabel(ruleType)}에는 현재 적용 중인 규칙이 있습니다. 저장하면 새 규칙이 적용되고 기존 규칙은 이력으로 보관됩니다.`,
                );
              }
            }}
          />
        ) : (
          <ListRow label="규칙 항목" value={getPenaltyRuleTypeLabel(form.ruleType)} />
        )}
        {flow.route === 'create' ? (
          <View accessibilityLiveRegion="polite" style={styles.inlineInfo}>
            <Text style={styles.inlineInfoText}>
              {replacesActiveRule
                ? '이 항목에는 현재 적용 중인 규칙이 있습니다. 저장하면 새 규칙이 적용되고 기존 규칙은 이력으로 보관됩니다.'
                : '같은 항목에 현재 적용 중인 규칙이 있으면 새 규칙이 적용되고 기존 규칙은 이력으로 보관됩니다.'}
            </Text>
          </View>
        ) : null}
        <PenaltyRuleModeSummary
          calculationLabel={calculationLabel}
          lateMinuteRule={lateMinuteRule}
          ruleType={form.ruleType}
        />
        <View style={styles.filterGrid}>
          {!lateMinuteRule ? (
            <View style={styles.filterField}>
              <TextField
                accessibilityLabel="벌금 규칙 주간 필수 횟수"
                editable={!busy}
                helper="QT, 기도, 성경의 주간 기준 횟수입니다."
                keyboardType="number-pad"
                label="주간 필수 횟수"
                onChangeText={(requiredCount) =>
                  onChangeForm({requiredCount: requiredCount.replace(/\D/g, '')})
                }
                placeholder="예: 5"
                value={form.requiredCount}
              />
            </View>
          ) : null}
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel="벌금 규칙 기본 금액"
              editable={!busy}
              keyboardType="number-pad"
              label="기본 금액"
              onChangeText={(baseAmount) =>
                onChangeForm({baseAmount: baseAmount.replace(/\D/g, '')})
              }
              placeholder="0 이상"
              value={form.baseAmount}
            />
          </View>
          <View style={styles.filterField}>
            <TextField
              accessibilityLabel={
                lateMinuteRule ? '벌금 규칙 1분당 금액' : '벌금 규칙 미달 1회당 금액'
              }
              editable={!busy}
              helper={lateMinuteRule ? '토요지각 1분마다 추가되는 금액입니다.' : undefined}
              keyboardType="number-pad"
              label={lateMinuteRule ? '1분당 금액' : '미달 1회당 금액'}
              onChangeText={(amountPerUnit) =>
                onChangeForm({amountPerUnit: amountPerUnit.replace(/\D/g, '')})
              }
              placeholder="0 이상"
              value={form.amountPerUnit}
            />
          </View>
        </View>
        {error ? <AdminInlineError error={error} exposeValidationMessage /> : null}
        <View style={styles.actionRow}>
          <Button
            accessibilityLabel="벌금 규칙 저장"
            disabled={busy}
            onPress={onSave}>
            {busy ? '저장 중...' : '규칙 저장'}
          </Button>
          <Button
            accessibilityLabel={`${pageTitle} 취소하고 규칙 목록으로 돌아가기`}
            disabled={busy}
            onPress={onBack}
            variant="secondary">
            취소
          </Button>
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
                <IconexIcon color={adminFigmaTokens.primary} name="settings" size={22} />
              </View>
              <View style={styles.figmaListContent}>
                <View style={styles.figmaListText}>
                  <Text style={styles.figmaCardTitle}>{getPenaltyRuleTypeLabel(rule.ruleType)}</Text>
                  <Text style={styles.figmaBodyText}>{getPenaltyRuleSummary(rule)}</Text>
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

function PenaltyRuleModeSummary({
  calculationLabel,
  lateMinuteRule,
  ruleType,
}: {
  calculationLabel: string;
  lateMinuteRule: boolean;
  ruleType: PenaltyRuleType;
}) {
  return (
    <View style={styles.penaltyModeSummary}>
      <View style={styles.penaltyModeIcon}>
        <IconexIcon
          color={adminFigmaTokens.primary}
          name={lateMinuteRule ? 'calendar' : 'document'}
          size={22}
          strokeWidth={2.2}
        />
      </View>
      <View style={styles.penaltyModeText}>
        <Text style={styles.figmaCardTitle}>{getPenaltyRuleTypeLabel(ruleType)}</Text>
        <Text style={styles.figmaBodyText}>
          {lateMinuteRule
            ? '기본금액에 실제 지각 1분당 금액을 더합니다.'
            : '주간 기준 횟수에서 모자란 횟수마다 금액을 더합니다.'}
        </Text>
      </View>
      <Text style={styles.penaltyModePill}>{calculationLabel}</Text>
    </View>
  );
}

function renderSettlementSummary({
  onOpenMemberCharges,
  onRetrySummary,
  showSummary,
  settlementState,
}: {
  onOpenMemberCharges: (member: AdminChargeMemberRef) => void;
  onRetrySummary: () => void;
  showSummary: boolean;
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
          {showSummary ? <SettlementSummaryCard charges={settlementState.charges} /> : null}
          <Empty
            title="표시할 청구가 없습니다"
            message="필터를 바꾸면 자동으로 다시 표시됩니다."
          />
        </>
      );
    case 'success':
      return (
        <>
          {showSummary ? <SettlementSummaryCard charges={settlementState.charges} /> : null}
          <View style={styles.chargeListHeader}>
            <Text style={styles.sectionTitle}>회원별 청구</Text>
            <Text style={styles.chargeListCount}>{settlementState.charges.members.length}명</Text>
          </View>
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
        <Text style={styles.figmaDangerPill}>미납</Text>
      </View>
      <Text style={styles.figmaHeroMeta}>
        {charges.campusName} · 총 {formatWon(charges.summary.totalAmount)} · 납부 {formatWon(charges.summary.paidAmount)}
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
        <IconexIcon
          color={adminFigmaTokens.primary}
          name="wallet"
          size={22}
          strokeWidth={2.2}
        />
      </View>
      <View style={styles.figmaListContent}>
        <View style={styles.figmaListText}>
          <Text style={styles.figmaCardTitle}>{member.name}</Text>
          <Text style={styles.figmaBodyText}>{getChargeMemberSummaryText(member)}</Text>
        </View>
        <Text style={styles.figmaActionPill}>상세</Text>
      </View>
    </Pressable>
  );
}

function filterAdminCampusChargeSummary(
  charges: AdminCampusChargeSummary,
  filters: AdminChargeFilters,
): AdminCampusChargeSummary {
  return selectAdminCampusChargeRowsForDisplay(charges, filters.status);
}

function filterAdminMemberChargeList(
  charges: AdminMemberChargeList,
  filters: AdminChargeFilters,
): AdminMemberChargeList {
  const items = charges.items.filter((charge) => {
    if (charge.amount <= 0) {
      return false;
    }

    if (filters.status !== 'ALL' && charge.status !== filters.status) {
      return false;
    }

    if (filters.paymentCategory !== 'ALL' && charge.paymentCategory !== filters.paymentCategory) {
      return false;
    }

    return true;
  });

  return {...charges, items};
}

function getChargeMemberSummaryText(summary: ChargeAmountSummary) {
  if (summary.unpaidAmount > 0) {
    return `미납 ${formatWon(summary.unpaidAmount)} · 납부 ${formatWon(summary.paidAmount)}`;
  }

  if (summary.paidAmount > 0) {
    return `납부 완료 ${formatWon(summary.paidAmount)}`;
  }

  if (summary.waivedAmount > 0) {
    return `면제 ${formatWon(summary.waivedAmount)}`;
  }

  if (summary.canceledAmount > 0) {
    return `취소 ${formatWon(summary.canceledAmount)}`;
  }

  return '청구 없음';
}

function renderChargeDetail({
  actionState,
  detailState,
  onBackToSummary,
  onRequestStatusChange,
  onRetryDetail,
}: {
  actionState: AdminActionState;
  detailState: AdminChargeDetailState;
  onBackToSummary: () => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminChargeStatusTarget) => void;
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
  onRequestStatusChange,
}: {
  actionState: AdminActionState;
  charges: AdminMemberChargeList;
  onBackToSummary: () => void;
  onRequestStatusChange: (charge: ChargeItem, status: AdminChargeStatusTarget) => void;
}) {
  const busy = actionState.status !== 'idle';

  return (
    <>
      <View style={styles.figmaHeroCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.figmaScreenTitle}>{charges.name}</Text>
            <Text style={styles.figmaBodyText}>
              총 미납 {formatWon(charges.summary.unpaidAmount)} · 청구 상태 관리
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
  onRequestStatusChange,
}: {
  busy: boolean;
  charge: ChargeItem;
  onRequestStatusChange: (status: AdminChargeStatusTarget) => void;
}) {
  const statusActions = getAdminChargeStatusActions(
    charge,
    getAdminChargeContractCapabilities(),
  );

  return (
    <View style={styles.figmaChargeItem}>
      <View style={styles.figmaIconBox}>
        <IconexIcon
          color={adminFigmaTokens.primary}
          name={getChargeIcon(charge)}
          size={22}
          strokeWidth={2.2}
        />
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
        {statusActions.map((status) => (
          <Button
            accessibilityLabel={`${charge.title} 상태를 ${getChargeStatusLabel(status)}로 변경 확인`}
            disabled={busy || charge.status === status}
            key={status}
            onPress={() => onRequestStatusChange(status)}
            variant={
              status === 'CANCELED'
                ? 'danger'
                : status === 'PAID'
                  ? 'primary'
                  : 'secondary'
            }>
            {getChargeStatusActionLabel(status)}
          </Button>
        ))}
      </View>
    </View>
  );
}

function AdminMemberPage({
  actionState,
  coffeeDuty,
  filter,
  globalRole,
  inviteCodeCopyState,
  inviteCodeState,
  memberSearch,
  members,
  onAssignCoffee,
  onChangeMemberSearch,
  onChangeSection,
  onCopyInviteCode,
  onRevokeCoffee,
  onSelectFilter,
  onSelectMember,
  onSelectRoleFilter,
  roleFilter,
  section,
  selectedCampusRole,
}: {
  actionState: AdminActionState;
  coffeeDuty: DutyAssignment | null;
  filter: MemberFilter;
  globalRole: string;
  inviteCodeCopyState: InviteCodeCopyState;
  inviteCodeState: InviteCodeState;
  memberSearch: string;
  members: AdminCampusMember[];
  onAssignCoffee: (member: AdminCampusMember) => void;
  onChangeMemberSearch: (value: string) => void;
  onChangeSection: (section: AdminMemberSection) => void;
  onCopyInviteCode: (inviteCode: string) => void;
  onRevokeCoffee: (assignment: DutyAssignment) => void;
  onSelectFilter: (filter: MemberFilter) => void;
  onSelectMember: (member: AdminCampusMember) => void;
  onSelectRoleFilter: (filter: RoleFilter) => void;
  roleFilter: RoleFilter;
  section: AdminMemberSection;
  selectedCampusRole: CampusRole;
}) {
  return (
    <>
      <AdminSubpageSwitcher
        accessibilityLabelPrefix="관리자 멤버 하위 페이지"
        items={adminMemberSections}
        onSelect={onChangeSection}
        selectedId={section}
        subtitle="목록, 권한, 커피 담당자를 분리해서 봅니다."
        title="멤버 관리"
      />
      <InviteCodeCopyRow
        copyState={inviteCodeCopyState}
        inviteCodeState={inviteCodeState}
        onCopy={onCopyInviteCode}
      />
      {section === 'list' ? (
        <AdminMembers
          filter={filter}
          memberSearch={memberSearch}
          members={members}
          onChangeMemberSearch={onChangeMemberSearch}
          onSelectFilter={onSelectFilter}
          onSelectMember={onSelectMember}
        />
      ) : section === 'roles' ? (
        <AdminRoleManagement
          filter={roleFilter}
          globalRole={globalRole}
          members={members}
          onSelectFilter={onSelectRoleFilter}
          onSelectMember={onSelectMember}
          selectedCampusRole={selectedCampusRole}
        />
      ) : (
        <AdminCoffeeDutyManagement
          actionState={actionState}
          coffeeDuty={coffeeDuty}
          members={members}
          onAssignCoffee={onAssignCoffee}
          onRevokeCoffee={onRevokeCoffee}
        />
      )}
    </>
  );
}

function AdminMembers({
  filter,
  memberSearch,
  members,
  onChangeMemberSearch,
  onSelectFilter,
  onSelectMember,
}: {
  filter: MemberFilter;
  memberSearch: string;
  members: AdminCampusMember[];
  onChangeMemberSearch: (value: string) => void;
  onSelectFilter: (filter: MemberFilter) => void;
  onSelectMember: (member: AdminCampusMember) => void;
}) {
  const keyword = memberSearch.trim().toLowerCase();
  const filteredMembers = filterMembers(members, filter).filter((member) =>
    keyword
      ? `${member.name} ${member.email} ${member.campusRole}`.toLowerCase().includes(keyword)
      : true,
  );

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Eyebrow>멤버 관리</Eyebrow>
          <Title>멤버 목록</Title>
        </View>
      </View>
      <TextField
        accessibilityLabel="관리자 멤버 검색"
        label="검색"
        onChangeText={onChangeMemberSearch}
        placeholder="이름 또는 이메일"
        value={memberSearch}
      />
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

function AdminMemberListRoute({
  actionError,
  bottomInset,
  campusLabel,
  contentBottomPadding,
  filter,
  inviteCodeCopyState,
  inviteCodeState,
  memberSearch,
  members,
  onChangeMemberSearch,
  onChangeSection,
  onCopyInviteCode,
  onOpenUserMode,
  onSelectFilter,
  onSelectMember,
  onSelectTab,
}: {
  actionError: ApiError | null;
  bottomInset: number;
  campusLabel: string;
  contentBottomPadding: number;
  filter: MemberFilter;
  inviteCodeCopyState: InviteCodeCopyState;
  inviteCodeState: InviteCodeState;
  memberSearch: string;
  members: AdminCampusMember[];
  onChangeMemberSearch: (value: string) => void;
  onChangeSection: (section: AdminMemberSection) => void;
  onCopyInviteCode: (inviteCode: string) => void;
  onOpenUserMode: () => void;
  onSelectFilter: (filter: MemberFilter) => void;
  onSelectMember: (member: AdminCampusMember) => void;
  onSelectTab: (tab: AdminTab) => void;
}) {
  const deferredSearch = useDeferredValue(memberSearch);
  const filteredMembers = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    return filterMembers(members, filter).filter((member) =>
      keyword
        ? `${member.name} ${member.email} ${member.campusRole}`.toLowerCase().includes(keyword)
        : true,
    );
  }, [deferredSearch, filter, members]);

  return (
    <View style={styles.adminModeFrame}>
      <FlatList
        contentContainerStyle={[
          styles.adminVirtualizedContent,
          Platform.OS === 'android' ? {paddingBottom: contentBottomPadding} : null,
        ]}
        data={filteredMembers}
        initialNumToRender={12}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(member) => String(member.membershipId)}
        ListEmptyComponent={(
          <View style={styles.virtualizedMemberListBody}>
            <Empty title="조건에 맞는 멤버가 없습니다" message="다른 역할 필터를 선택해 주세요." />
          </View>
        )}
        ListFooterComponent={<View style={styles.virtualizedMemberListFooter} />}
        ListHeaderComponent={(
          <View style={styles.adminVirtualizedHeader}>
            <AdminShellHeader
              activeTab="members"
              campusLabel={campusLabel}
              onOpenUserMode={onOpenUserMode}
            />
            {actionError ? <AdminInlineError error={actionError} exposeValidationMessage /> : null}
            <AdminSubpageSwitcher
              accessibilityLabelPrefix="관리자 멤버 하위 페이지"
              items={adminMemberSections}
              onSelect={onChangeSection}
              selectedId="list"
              subtitle="목록, 권한, 커피 담당자를 분리해서 봅니다."
              title="멤버 관리"
            />
            <InviteCodeCopyRow
              copyState={inviteCodeCopyState}
              inviteCodeState={inviteCodeState}
              onCopy={onCopyInviteCode}
            />
            <View style={styles.virtualizedMemberListHeader}>
              <View style={styles.headerRow}>
                <View style={styles.headerText}>
                  <Eyebrow>멤버 관리</Eyebrow>
                  <Title>멤버 목록</Title>
                </View>
              </View>
              <TextField
                accessibilityLabel="관리자 멤버 검색"
                label="검색"
                onChangeText={onChangeMemberSearch}
                placeholder="이름 또는 이메일"
                value={memberSearch}
              />
              <SegmentedControl
                items={memberFilters}
                selectedId={filter}
                onSelect={onSelectFilter}
              />
            </View>
          </View>
        )}
        maxToRenderPerBatch={12}
        renderItem={({item}) => (
          <View style={styles.virtualizedMemberListBody}>
            <MemoizedMemberRow member={item} onSelect={onSelectMember} />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.adminModeScroll}
        windowSize={7}
      />
      <AdminBottomNav activeTab="members" bottomInset={bottomInset} onSelectTab={onSelectTab} />
    </View>
  );
}

const MemoizedMemberRow = memo(function MemoizedMemberRow({
  member,
  onSelect,
}: {
  member: AdminCampusMember;
  onSelect: (member: AdminCampusMember) => void;
}) {
  return <MemberRow member={member} onPress={() => onSelect(member)} />;
});

function AdminCoffeeDutyManagement({
  actionState,
  coffeeDuty,
  members,
  onAssignCoffee,
  onRevokeCoffee,
}: {
  actionState: AdminActionState;
  coffeeDuty: DutyAssignment | null;
  members: AdminCampusMember[];
  onAssignCoffee: (member: AdminCampusMember) => void;
  onRevokeCoffee: (assignment: DutyAssignment) => void;
}) {
  const busy = actionState.status !== 'idle';

  return (
    <>
      <Card>
        <Eyebrow>커피 담당</Eyebrow>
        <Title>{coffeeDuty ? coffeeDuty.name : '담당자 없음'}</Title>
        <Body>
          {coffeeDuty
            ? `${coffeeDuty.email} · 활성 담당자`
            : '커피 정산 관리 권한을 줄 멤버를 지정해 주세요.'}
        </Body>
      </Card>
      <Card>
        <Eyebrow>담당자 지정</Eyebrow>
        {members.map((member) => {
          const assigned = coffeeDuty?.userId === member.userId;

          return (
            <View key={member.membershipId} style={styles.roleRow}>
              <View style={styles.roleRowHeader}>
                <Avatar name={member.name} role={member.campusRole} />
                <View style={styles.headerText}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberMeta}>{member.email}</Text>
                </View>
                <Chip label={assigned ? '담당' : member.campusRole} tone={assigned ? 'success' : 'default'} />
              </View>
              <View style={styles.actionRow}>
                {assigned && coffeeDuty ? (
                  <Button
                    accessibilityLabel={`${member.name} 커피 담당자 해제`}
                    disabled={busy}
                    onPress={() => onRevokeCoffee(coffeeDuty)}
                    variant="danger">
                    {actionState.status === 'revokingCoffee' ? '해제 중...' : '해제'}
                  </Button>
                ) : (
                  <Button
                    accessibilityLabel={`${member.name} 커피 담당자로 지정`}
                    disabled={busy}
                    onPress={() => onAssignCoffee(member)}
                    variant="secondary">
                    {actionState.status === 'assigningCoffee' ? '지정 중...' : '지정'}
                  </Button>
                )}
              </View>
            </View>
          );
        })}
      </Card>
    </>
  );
}

function InviteCodeCopyRow({
  copyState,
  inviteCodeState,
  onCopy,
}: {
  copyState: InviteCodeCopyState;
  inviteCodeState: InviteCodeState;
  onCopy: (inviteCode: string) => void;
}) {
  if (inviteCodeState.status === 'idle' || inviteCodeState.status === 'loading' || inviteCodeState.status === 'empty') {
    return null;
  }

  if (inviteCodeState.status === 'error') {
    return (
      <View style={styles.inviteCodeRow}>
        <Text style={styles.inviteCodeLabel}>초대코드</Text>
        <Text style={styles.inviteCodeError}>{inviteCodeState.message}</Text>
      </View>
    );
  }

  const copied = copyState.status === 'copied';

  return (
    <View style={styles.inviteCodeRow}>
      <Text style={styles.inviteCodeLabel}>초대코드</Text>
      <Text selectable style={styles.inviteCodeValue}>
        {inviteCodeState.code}
      </Text>
      <Pressable
        accessibilityLabel="초대코드 복사"
        accessibilityRole="button"
        onPress={() => onCopy(inviteCodeState.code)}
        style={({pressed}) => [
          styles.inviteCodeCopyButton,
          copied ? styles.inviteCodeCopyButtonCopied : null,
          pressed ? styles.pressed : null,
        ]}>
        <IconexIcon
          color={copied ? colors.surface : colors.primary}
          name="document"
          size={16}
          strokeWidth={2}
        />
        <Text
          style={[
            styles.inviteCodeCopyButtonText,
            copied ? styles.inviteCodeCopyButtonTextCopied : null,
          ]}>
          {copied ? '복사됨' : '복사'}
        </Text>
      </Pressable>
      {copyState.status === 'error' ? (
        <Text style={styles.inviteCodeError}>{copyState.message}</Text>
      ) : null}
    </View>
  );
}

function AdminMemberDetail({
  actionState,
  activeMealDuties,
  coffeeDuty,
  globalRole,
  member,
  onAssignCoffee,
  onAssignMeal,
  onBack,
  onRequestDelete,
  onRevokeCoffee,
  onRevokeMeal,
  onUpdateRole,
  selectedCampusRole,
}: {
  actionState: AdminActionState;
  activeMealDuties: DutyAssignment[];
  coffeeDuty: DutyAssignment | null;
  globalRole: string;
  member: AdminCampusMember;
  onAssignCoffee: () => void;
  onAssignMeal: () => void;
  onBack: () => void;
  onRequestDelete: () => void;
  onRevokeCoffee: (assignment: DutyAssignment) => void;
  onRevokeMeal: (assignment: DutyAssignment) => void;
  onUpdateRole: (role: CampusRole) => void;
  selectedCampusRole: CampusRole;
}) {
  const memberCoffeeDuty = coffeeDuty?.userId === member.userId ? coffeeDuty : null;
  const memberMealDuties = activeMealDuties.filter((assignment) => assignment.userId === member.userId);
  const memberMealDuty = memberMealDuties[0] ?? null;
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
          {memberMealDuty ? <Chip label="밥 담당" tone="success" /> : null}
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
        <Eyebrow>밥 담당</Eyebrow>
        <Title>{memberMealDuty ? '현재 밥 담당자입니다' : '현재 밥 담당자가 아니에요'}</Title>
        <Body>
          밥 담당자는 여러 명을 동시에 지정할 수 있습니다.
        </Body>
        <View style={styles.actionRow}>
          {memberMealDuty ? (
            <Button
              accessibilityLabel={`${member.name} 밥 담당자 해제`}
              disabled={busy}
              onPress={() => onRevokeMeal(memberMealDuty)}
              variant="danger">
              {actionState.status === 'revokingMeal' ? '해제 중...' : '밥 담당 해제'}
            </Button>
          ) : (
            <Button
              accessibilityLabel={`${member.name} 밥 담당자로 지정`}
              disabled={busy}
              onPress={onAssignMeal}>
              {actionState.status === 'assigningMeal' ? '지정 중...' : '밥 담당자로 지정'}
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
  filter,
  globalRole,
  members,
  onSelectFilter,
  onSelectMember,
  selectedCampusRole,
}: {
  filter: RoleFilter;
  globalRole: string;
  members: AdminCampusMember[];
  onSelectFilter: (filter: RoleFilter) => void;
  onSelectMember: (member: AdminCampusMember) => void;
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
        <Body>전체 권한 변경은 이 화면에서 하지 않습니다. 권한이 없는 변경은 저장되지 않습니다.</Body>
      </Card>
      <Card>
        <Eyebrow>역할별 보기</Eyebrow>
        <SegmentedControl items={memberFilters} selectedId={filter} onSelect={onSelectFilter} />
        {filteredMembers.map((member) => (
          <View key={member.membershipId} style={styles.roleRow}>
            <Pressable
              accessibilityLabel={`${member.name} 역할 상세 보기`}
              accessibilityRole="button"
              onPress={() => onSelectMember(member)}
              style={({pressed}) => [styles.roleRowHeader, pressed ? styles.pressed : null]}>
              <Avatar name={member.name} role={member.campusRole} />
              <View style={styles.headerText}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberMeta}>
                  {member.email} · {member.campusRole}
                </Text>
              </View>
              <Text style={styles.figmaActionPill}>상세</Text>
            </Pressable>
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
          <Title>{targets.length}명에게 알림을 보낼까요?</Title>
          <Body>
            {state.status === 'confirming' || state.status === 'sending'
              ? `${state.draft.sourceLabel} 대상에게 알림을 발송합니다.`
              : `${weekStartDate} 주차 대상에게 알림을 발송합니다.`}
          </Body>
          <ListRow
            label="제목"
            value={
              state.status === 'confirming' || state.status === 'sending'
                ? state.draft.title
                : '알림'
            }
          />
          <ListRow
            label="본문"
            supportingText={
              state.status === 'confirming' || state.status === 'sending'
                ? state.draft.body
                : '알림 본문'
            }
          />
          <View style={styles.confirmTargetList}>
            {targets.slice(0, 4).map((target) => (
              <Text key={target.userId} style={styles.confirmTargetText}>
                {target.name} · {target.email}
              </Text>
            ))}
            {targets.length > 4 ? (
              <Text style={styles.confirmTargetText}>외 {targets.length - 4}명</Text>
            ) : null}
          </View>
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="관리자 알림 발송 실행"
              disabled={loading}
              onPress={onConfirm}>
              {loading ? '발송 중...' : '발송'}
            </Button>
            <Button
              accessibilityLabel="관리자 알림 발송 취소"
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

function NotificationSentSheet({
  onClose,
  state,
}: {
  onClose: () => void;
  state: NotificationSendState;
}) {
  const visible = state.status === 'sent';
  const targetCount = state.status === 'sent' ? state.targetCount : 0;
  const queuedCount = state.status === 'sent' ? state.result.queuedCount : 0;
  const skippedCount = state.status === 'sent' ? state.result.skippedCount : 0;
  const sourceLabel = state.status === 'sent' ? state.draft.sourceLabel : '알림';

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.notificationSentSheet}>
          <View style={styles.notificationSentIcon}>
            <IconexIcon color={adminFigmaTokens.primary} name="bell" size={24} strokeWidth={1.8} />
          </View>
          <Eyebrow>알림 발송</Eyebrow>
          <Title>알림을 보냈어요</Title>
          <Body>
            {sourceLabel} 대상 {targetCount}명 중 {queuedCount}명에게 발송 요청을 완료했습니다.
          </Body>
          {skippedCount > 0 ? (
            <AdminInlineError
              error={{
                kind: 'conflict',
                message: `${skippedCount}명은 알림 수신 정보가 없어 제외되었습니다.`,
              }}
            />
          ) : null}
          <View style={styles.metricGrid}>
            <Metric label="대상" value={`${targetCount}명`} />
            <Metric label="요청" value={`${queuedCount}명`} />
            <Metric label="제외" value={`${skippedCount}명`} />
          </View>
          <Button accessibilityLabel="알림 발송 완료 모달 닫기" onPress={onClose}>
            확인
          </Button>
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
  const confirmation = target
    ? getAdminChargeStatusConfirmation(
        target.charge,
        target.status,
        getAdminChargeContractCapabilities(),
      )
    : null;

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={loading ? undefined : onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Title>{confirmation?.title ?? '청구 상태 변경'}</Title>
          {confirmation?.messages.map((message) => (
            <Body key={message}>{message}</Body>
          ))}
          {target ? (
            <>
              <ListRow label="현재 상태" value={getChargeStatusLabel(target.charge.status)} />
              <ListRow label="변경 상태" value={getChargeStatusLabel(target.status)} />
              <ListRow label="금액" value={formatWon(target.charge.amount)} />
            </>
          ) : null}
          {error ? (
            <View accessibilityRole="alert" style={styles.inlineError}>
              <Text style={styles.inlineErrorText}>
                {getAdminChargeStatusErrorMessage(error)}
              </Text>
            </View>
          ) : null}
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

function PollCloseConfirmSheet({
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
  target: PollCloseTarget;
}) {
  return (
    <Modal animationType="slide" transparent visible={target !== null} onRequestClose={onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Eyebrow>투표 종료 확인</Eyebrow>
          <Title>{target ? `${target.title} 투표를 종료할까요?` : '투표 종료'}</Title>
          <Body>
            종료 후에는 일반 사용자가 더 이상 응답하거나 댓글을 작성할 수 없습니다. 커피 투표는 서버 정책에 따라 청구 생성 시점이 결정됩니다.
          </Body>
          {target ? (
            <>
              <ListRow label="현재 상태" value={getPollStatusLabel(target.status)} />
              <ListRow label="마감" value={formatDateTime(target.endsAt)} />
            </>
          ) : null}
          {error ? <AdminInlineError error={error} exposeValidationMessage={true} /> : null}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="투표 종료 실행"
              disabled={loading}
              onPress={onConfirm}
              variant="danger">
              {loading ? '종료 중...' : '투표 종료'}
            </Button>
            <Button
              accessibilityLabel="투표 종료 취소"
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

function DeactivatePaymentAccountSheet({
  account,
  copyFeedback,
  copyOpacity,
  error,
  loading,
  onCancel,
  onCopyAccount,
  onConfirm,
}: {
  account: PaymentAccount | null;
  copyFeedback: AccountCopyFeedback;
  copyOpacity: Animated.Value;
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onCopyAccount: (account: PaymentAccount) => void;
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
              <View style={styles.accountCopyRow}>
                <ListRow
                  accessibilityLabel={`${account.nickname} 계좌번호 복사`}
                  label={account.bankName}
                  onPress={() => onCopyAccount(account)}
                  supportingText={account.accountHolder}
                  value={account.accountNumber}
                />
                {copyFeedback?.accountId === account.id ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.accountCopyBadge,
                      styles.accountCopyRowBadge,
                      {opacity: copyOpacity},
                    ]}>
                    <Text
                      accessibilityLabel={copyFeedback.message}
                      style={[
                        styles.accountCopyHint,
                        copyFeedback.tone === 'warning'
                          ? styles.accountCopyHintWarning
                          : null,
                      ]}>
                      {copyFeedback.message}
                    </Text>
                  </Animated.View>
                ) : null}
              </View>
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

function DeletePaymentAccountSheet({
  account,
  copyFeedback,
  copyOpacity,
  error,
  loading,
  onCancel,
  onCopyAccount,
  onConfirm,
}: {
  account: PaymentAccount | null;
  copyFeedback: AccountCopyFeedback;
  copyOpacity: Animated.Value;
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onCopyAccount: (account: PaymentAccount) => void;
  onConfirm: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={account !== null} onRequestClose={onCancel}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Title>{account ? `${account.nickname} 계좌를 삭제할까요?` : '계좌 삭제'}</Title>
          <Body>
            삭제는 비활성 계좌에만 사용할 수 있습니다. 이미 청구에 연결된 계좌라면 서버 정책에 따라
            삭제가 거절될 수 있어요.
          </Body>
          {account ? (
            <>
              <ListRow label="계좌 유형" value={getPaymentCategoryLabel(account.accountType)} />
              <View style={styles.accountCopyRow}>
                <ListRow
                  accessibilityLabel={`${account.nickname} 계좌번호 복사`}
                  label={account.bankName}
                  onPress={() => onCopyAccount(account)}
                  supportingText={account.accountHolder}
                  value={account.accountNumber}
                />
                {copyFeedback?.accountId === account.id ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.accountCopyBadge,
                      styles.accountCopyRowBadge,
                      {opacity: copyOpacity},
                    ]}>
                    <Text
                      accessibilityLabel={copyFeedback.message}
                      style={[
                        styles.accountCopyHint,
                        copyFeedback.tone === 'warning'
                          ? styles.accountCopyHintWarning
                          : null,
                      ]}>
                      {copyFeedback.message}
                    </Text>
                  </Animated.View>
                ) : null}
              </View>
            </>
          ) : null}
          {error ? <AdminInlineError error={error} /> : null}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="비활성 납부 계좌 삭제 실행"
              disabled={loading}
              onPress={onConfirm}
              variant="danger">
              {loading ? '삭제 중...' : '삭제'}
            </Button>
            <Button
              accessibilityLabel="납부 계좌 삭제 취소"
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
          <Eyebrow>운영 종료 확인</Eyebrow>
          <Title>운영 기간을 종료할까요?</Title>
          <Body>
            진행 중인 기도 운영 기간을 오늘 날짜로 종료합니다. 종료 후 새 운영 기간을 시작하면 조를 다시 편성할 수 있습니다.
          </Body>
          {error ? <AdminInlineError error={error} /> : null}
          <View style={styles.actionRow}>
            <Button
              accessibilityLabel="기도 운영 기간 종료 실행"
              disabled={loading}
              onPress={onConfirm}
              variant="danger">
              {loading ? '처리 중...' : '운영 종료'}
            </Button>
            <Button
              accessibilityLabel="기도 운영 기간 종료 취소"
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

function AdminSubpageSwitcher<T extends string>({
  accessibilityLabelPrefix,
  items,
  onSelect,
  selectedId,
  subtitle,
  title,
}: {
  accessibilityLabelPrefix: string;
  items: Array<{id: T; label: string}>;
  onSelect: (id: T) => void;
  selectedId: T;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.adminSubpageSwitcher}>
      <View style={styles.headerText}>
        <Text style={styles.adminSubpageTitle}>{title}</Text>
        <Text style={styles.adminSubpageSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.adminSubpageSegments}>
        {items.map((item) => {
          const active = item.id === selectedId;

          return (
            <Pressable
              accessibilityLabel={`${accessibilityLabelPrefix} ${item.label} 선택`}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              key={item.id}
              onPress={() => onSelect(item.id)}
              style={({pressed}) => [
                styles.adminSubpageSegment,
                active ? styles.adminSubpageSegmentActive : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text
                numberOfLines={1}
                style={[
                  styles.adminSubpageSegmentText,
                  active ? styles.adminSubpageSegmentTextActive : null,
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

function AdminCompactButton({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  variant = 'primary',
}: {
  accessibilityLabel: string;
  children: string;
  disabled?: boolean;
  onPress: () => void;
  variant?: AdminCompactButtonVariant;
}) {
  const variantStyle = getAdminCompactButtonStyle(variant);
  const textStyle = getAdminCompactButtonTextStyle(variant);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.adminCompactButton,
        variantStyle,
        disabled ? styles.adminCompactButtonDisabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[styles.adminCompactButtonText, textStyle]}>
        {children}
      </Text>
    </Pressable>
  );
}

function getAdminCompactButtonStyle(variant: AdminCompactButtonVariant) {
  switch (variant) {
    case 'primary':
      return styles.adminCompactButtonPrimary;
    case 'secondary':
      return styles.adminCompactButtonSecondary;
    case 'danger':
      return styles.adminCompactButtonDanger;
    case 'ghost':
      return styles.adminCompactButtonGhost;
    default:
      return assertNever(variant);
  }
}

function getAdminCompactButtonTextStyle(variant: AdminCompactButtonVariant) {
  switch (variant) {
    case 'primary':
      return styles.adminCompactButtonTextPrimary;
    case 'secondary':
      return styles.adminCompactButtonTextSecondary;
    case 'danger':
      return styles.adminCompactButtonTextDanger;
    case 'ghost':
      return styles.adminCompactButtonTextGhost;
    default:
      return assertNever(variant);
  }
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
  accessibilityLabelSuffix = '필터 선택',
  disabled = false,
  items,
  onSelect,
  selectedId,
}: {
  accessibilityLabelSuffix?: string;
  disabled?: boolean;
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
            accessibilityLabel={`${item.label} ${accessibilityLabelSuffix}`}
            accessibilityRole="button"
            accessibilityState={{disabled, selected: active}}
            disabled={disabled}
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={({pressed}) => [
              styles.figmaSegment,
              active ? styles.figmaSegmentActive : null,
              disabled ? styles.figmaSegmentDisabled : null,
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

function AdminInlineError({
  error,
  exposeValidationMessage = false,
}: {
  error: ApiError;
  exposeValidationMessage?: boolean;
}) {
  return (
    <View accessibilityRole="alert" style={styles.inlineError}>
      <Text style={styles.inlineErrorText}>
        {getAdminActionErrorMessage(error, {exposeValidationMessage})}
      </Text>
    </View>
  );
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

function getAdminActionErrorMessage(
  error: ApiError,
  options: {exposeValidationMessage?: boolean} = {},
) {
  switch (error.kind) {
    case 'permissionDenied':
      return error.message.trim() &&
        error.message !== '현재 계정으로는 이 작업을 진행할 수 없습니다.'
        ? error.message
        : '현재 계정으로는 이 작업을 진행할 수 없습니다. 권한이나 서버 정책을 확인해 주세요.';
    case 'conflict':
      return '최신 상태와 충돌했습니다. 다시 불러온 뒤 시도해 주세요.';
    case 'offline':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'sessionExpired':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'error':
      return getApiErrorPresentation(
        error,
        options.exposeValidationMessage === true
          ? {exposeValidationMessage: true}
          : {},
      ).message;
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

function getActiveMealDuties(duties: DutyAssignment[]) {
  return duties.filter((duty) => duty.dutyType === 'MEAL' && duty.isActive);
}

function getAdminShellTitle(tab: AdminTab) {
  switch (tab) {
    case 'home':
      return '관리자 홈';
    case 'devotion':
      return '경건';
    case 'polls':
      return '투표';
    case 'notificationLogs':
      return '알림';
    case 'prayer':
      return '기도';
    case 'members':
      return '멤버';
    case 'roles':
      return '역할';
    case 'settlement':
      return '정산';
    default:
      return assertNever(tab);
  }
}

function getAdminTabIcon(tab: AdminTab): IconexIconName {
  switch (tab) {
    case 'home':
      return 'home';
    case 'devotion':
      return 'check';
    case 'polls':
      return 'document';
    case 'notificationLogs':
      return 'bell';
    case 'prayer':
      return 'message-circle';
    case 'members':
      return 'users';
    case 'roles':
      return 'lock-check';
    case 'settlement':
      return 'wallet';
    default:
      return assertNever(tab);
  }
}

function getCampusLabel(state: AuthenticatedState) {
  return state.selectedCampus.campusName || '내 캠퍼스';
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

const adminWeekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

function getAdminDateTimeValue(value: Date | string) {
  const date = value instanceof Date ? new Date(value) : new Date(value);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getAdminDateOnlyValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    return new Date();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return new Date();
  }

  return date;
}

function formatAdminDateForApiDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function formatAdminDateOnlyDisplay(value: string) {
  return formatAdminDateLabel(getAdminDateOnlyValue(value));
}

function parseTemplateDayOfWeek(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : 1;
}

function parseAdminTimeParts(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());

  if (!match) {
    return {hour: 9, minute: 0};
  }

  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));

  return {hour, minute};
}

function formatAdminTimeParts(hour: number, minute: number) {
  let nextHour = hour;
  let nextMinute = minute;

  while (nextMinute < 0) {
    nextMinute += 60;
    nextHour -= 1;
  }

  while (nextMinute > 59) {
    nextMinute -= 60;
    nextHour += 1;
  }

  nextHour = ((nextHour % 24) + 24) % 24;

  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}:00`;
}

function formatAdminDateLabel(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')} ${adminWeekdayLabels[date.getDay()]}`;
}

function formatAdminDateTimeLabel(date: Date) {
  return `${formatAdminDateLabel(date)} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function formatTemplateDateTimeLabel(dayOfWeekValue: string, timeValue: string) {
  const dayOfWeek = parseTemplateDayOfWeek(dayOfWeekValue);

  return `${getDayOfWeekLabel(dayOfWeek)} ${formatShortTime(timeValue)}`;
}

function formatAdminDateTimeForApi(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0,
  ).toISOString();
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function buildAdminCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDayOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDayOfMonth; day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function isSameCalendarDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function roundMinuteToStep(value: number) {
  return Math.min(55, Math.max(0, Math.round(value / 5) * 5));
}

function wrapTimeStepperValue(value: number, min: number, max: number, step: number) {
  if (value > max) {
    return min;
  }

  if (value < min) {
    return max - ((max - min) % step);
  }

  return value;
}

function toAdminPollTemplateFormRequest(
  form: AdminPollTemplateForm,
): AdminPollTemplateRequest {
  if (form.pollType === 'COFFEE') {
    throw new FaithLogApiError({
      kind: 'error',
      message: '커피 반복투표는 더 이상 관리자 반복투표에서 만들지 않습니다.',
    });
  }

  const validationMessage = getAdminPollTemplateValidationMessage(form);

  if (validationMessage) {
    throw new FaithLogApiError({kind: 'error', message: validationMessage});
  }

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
  const directCreateStartsAt =
    templateId === null ? new Date().toISOString() : form.startsAt;

  return {
    templateId,
    title: form.title,
    pollType: form.pollType,
    selectionType: form.selectionType,
    isAnonymous: form.isAnonymous,
    allowUserOptionAdd: form.allowUserOptionAdd,
    chargeGenerationType: form.chargeGenerationType,
    paymentCategory: form.paymentCategory === 'NONE' ? null : form.paymentCategory,
    paymentAccountId: parseNullablePositiveInt(form.paymentAccountId),
    startsAt: directCreateStartsAt,
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
    allowUserOptionAdd: Boolean(poll.allowUserOptionAdd),
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

function toPollSummary(poll: AdminPoll): PollSummary {
  return {
    campusId: poll.campusId,
    id: poll.id,
    isAnonymous: poll.isAnonymous,
    ...(poll.allowUserOptionAdd === undefined
      ? {}
      : {allowUserOptionAdd: poll.allowUserOptionAdd}),
    endsAt: poll.endsAt,
    pollType: poll.pollType,
    responded: false,
    selectionType: poll.selectionType,
    startsAt: poll.startsAt,
    status: poll.status,
    title: poll.title,
  };
}

function mergePollSummaries(polls: PollSummary[], focusPoll: PollSummary) {
  return [focusPoll, ...polls.filter((poll) => poll.id !== focusPoll.id)];
}

function getVisibleAdminPollTemplates(templates: AdminPollTemplate[]) {
  return templates.filter(
    (template) => template.pollType !== 'COFFEE' && !isDefaultCoffeePollTemplate(template),
  );
}

function isDefaultCoffeePollTemplate(template: AdminPollTemplate) {
  return (
    isDefaultCoffeePollTemplateId(template.id) ||
    (template.isDefault === true && template.pollType === 'COFFEE')
  );
}

function isDefaultCoffeePollTemplateId(templateId: number | null) {
  return templateId === defaultCoffeePollTemplateId;
}

function parseAdminPollOptionsText(value: string): AdminPollTemplateOptionRequest[] {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new FaithLogApiError({kind: 'error', message: '선택지를 입력해 주세요.'});
  }

  const seenMenuIds = new Set<number>();

  return parts.flatMap((part) => {
    if (/^menu:\d+$/i.test(part)) {
      const menuId = Number(part.split(':')[1]);

      if (seenMenuIds.has(menuId)) {
        return [];
      }

      seenMenuIds.add(menuId);

      return {
        content: null,
        menuId,
        priceAmount: null,
        sortOrder: 0,
      };
    }

    const [content, price] = part.split('|').map((item) => item.trim());

    return {
      content: content || null,
      menuId: null,
      priceAmount: price ? parseRequiredNonNegativeInt(price, 'priceAmount') : null,
      sortOrder: 0,
    };
  }).map((option, index) => ({...option, sortOrder: index + 1}));
}

function prioritizeAdminPolls(polls: PollSummary[], focusPollId: number | null) {
  if (focusPollId === null) {
    return polls;
  }

  return polls.slice().sort((left, right) => {
    if (left.id === focusPollId) {
      return -1;
    }

    if (right.id === focusPollId) {
      return 1;
    }

    return 0;
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
  accounts: PaymentAccount[],
  currentUserId: number,
  knownOwnedCoffeeAccountIds: Set<number>,
) {
  if (form.pollType !== 'COFFEE' || form.chargeGenerationType !== 'OPTION_PRICE') {
    return null;
  }

  const ownedCoffeeAccounts = getOwnedCoffeePaymentAccounts(
    accounts,
    currentUserId,
    knownOwnedCoffeeAccountIds,
  );

  if (ownedCoffeeAccounts.length === 0) {
    return '커피 투표를 만들려면 먼저 내가 만든 커피 계좌를 등록해 주세요.';
  }

  const selectedPaymentAccountId = toOptionalPositiveId(form.paymentAccountId);
  const selectedOwnedCoffeeAccount = ownedCoffeeAccounts.some(
    (account) => account.id === selectedPaymentAccountId,
  );

  if (form.paymentCategory !== 'COFFEE' || !selectedOwnedCoffeeAccount) {
    return '커피 투표 정산에 사용할 내 커피 계좌를 선택해 주세요.';
  }

  return null;
}

function getOwnedCoffeePaymentAccounts(
  accounts: PaymentAccount[],
  currentUserId: number,
  knownOwnedCoffeeAccountIds: Set<number>,
  options: {includeInactive?: boolean} = {},
) {
  return accounts.filter((account) => {
    if (account.accountType !== 'COFFEE') {
      return false;
    }

    if (!options.includeInactive && account.isActive === false) {
      return false;
    }

    if (account.ownerUserId === currentUserId) {
      return true;
    }

    return (
      (account.ownerUserId === undefined || account.ownerUserId === null) &&
      knownOwnedCoffeeAccountIds.has(account.id)
    );
  });
}

function mergePaymentAccounts(...accountGroups: PaymentAccount[][]) {
  const accountMap = new Map<number, PaymentAccount>();

  accountGroups.forEach((accounts) => {
    accounts.forEach((account) => {
      accountMap.set(account.id, account);
    });
  });

  return Array.from(accountMap.values());
}

function isPaymentAccountActive(account: PaymentAccount) {
  return account.isActive !== false;
}

function isPaymentAccountListEndpointMissing(error: unknown) {
  return error instanceof FaithLogApiError && (error.detail.status === 404 || error.detail.status === 501);
}

function getPaymentAccountStatusLabel(account: PaymentAccount) {
  return isPaymentAccountActive(account) ? '활성' : '비활성';
}

function comparePaymentAccountsForDisplay(a: PaymentAccount, b: PaymentAccount) {
  const typePriority = getPaymentAccountTypePriority(a.accountType) - getPaymentAccountTypePriority(b.accountType);

  if (typePriority !== 0) {
    return typePriority;
  }

  return a.id - b.id;
}

function getPaymentAccountTypePriority(type: PaymentAccountCategory) {
  return type === 'PENALTY' ? 0 : 1;
}

function getAdminPollCreateDisabledReason(
  form: AdminPollCreateForm,
  coffeeWarning: string | null,
) {
  const deadlineValidationMessage = getAdminPollDeadlineValidationMessage(form);

  if (deadlineValidationMessage) {
    return deadlineValidationMessage;
  }

  if (form.pollType === 'COFFEE' && form.chargeGenerationType === 'OPTION_PRICE') {
    return coffeeWarning;
  }

  return null;
}

function getAdminPollTemplateValidationMessage(form: AdminPollTemplateForm) {
  return getRepeatScheduleValidationMessage({
    endDayOfWeek: form.endDayOfWeek,
    endTime: form.endTime,
    startDayOfWeek: form.startDayOfWeek,
    startTime: form.startTime,
  });
}

function getAdminPollTemplateOptionsValidationMessage(
  form: AdminPollTemplateForm,
  coffeeCatalogState: AdminCoffeeCatalogState,
) {
  if (form.pollType !== 'COFFEE') {
    return splitAdminPollOptionsText(form.optionsText).some((option) => option.trim().length > 0)
      ? null
      : '선택지를 1개 이상 입력해 주세요.';
  }

  if (coffeeCatalogState.status === 'loading' || coffeeCatalogState.status === 'idle') {
    return '커피 메뉴를 불러온 뒤 선택해 주세요.';
  }

  if (coffeeCatalogState.status === 'error') {
    return '커피 메뉴를 불러오지 못했습니다. 다시 시도해 주세요.';
  }

  const knownMenuIds = new Set(coffeeCatalogState.menus.map((menu) => menu.id));
  const validMenuIds = parseCoffeeMenuIdsFromOptionsText(form.optionsText).filter((menuId) =>
    knownMenuIds.has(menuId),
  );

  return validMenuIds.length > 0 ? null : '커피 메뉴를 1개 이상 선택해 주세요.';
}

function getAdminPollTemplateStepError(
  step: AdminPollTemplateStep,
  form: AdminPollTemplateForm,
  coffeeCatalogState: AdminCoffeeCatalogState,
): string | null {
  if (step === 'info' && form.title.trim().length === 0) {
    return '반복투표 제목을 입력해 주세요.';
  }

  if (step === 'schedule') {
    return getAdminPollTemplateValidationMessage(form);
  }

  if (step === 'options') {
    return getAdminPollTemplateOptionsValidationMessage(form, coffeeCatalogState);
  }

  if (step === 'confirm') {
    return (
      getAdminPollTemplateStepError('info', form, coffeeCatalogState) ??
      getAdminPollTemplateStepError('schedule', form, coffeeCatalogState) ??
      getAdminPollTemplateStepError('options', form, coffeeCatalogState)
    );
  }

  return null;
}

function getAdminPollTemplateOptionSummaryItems(
  form: AdminPollTemplateForm,
  coffeeCatalogState: AdminCoffeeCatalogState,
) {
  if (form.pollType !== 'COFFEE') {
    return splitAdminPollOptionsText(form.optionsText).filter((option) => option.trim().length > 0);
  }

  if (coffeeCatalogState.status !== 'success') {
    const count = parseCoffeeMenuIdsFromOptionsText(form.optionsText).length;
    return count > 0 ? [`선택한 커피 메뉴 ${count}개`] : [];
  }

  const menusById = new Map(coffeeCatalogState.menus.map((menu) => [menu.id, menu]));

  return parseCoffeeMenuIdsFromOptionsText(form.optionsText).map((menuId) => {
    const menu = menusById.get(menuId);

    return menu ? `${menu.name} ${formatCompactWon(menu.priceAmount)}` : '메뉴를 다시 선택해 주세요';
  });
}

function getAdminPollDeadlineValidationMessage(
  form: AdminPollCreateForm,
  now = new Date(),
) {
  const templateId = parseNullablePositiveInt(form.templateId);
  const directCreate = templateId === null;
  const startsAt = directCreate ? now : getAdminDateTimeValue(form.startsAt);
  const endsAt = getAdminDateTimeValue(form.endsAt);

  if (endsAt.getTime() <= now.getTime() || endsAt.getTime() <= startsAt.getTime()) {
    return adminPollDeadlineValidationMessage;
  }

  return null;
}

function getCreatePollTimeRefreshPatch(
  form: AdminPollCreateForm,
  now = new Date(),
): Pick<AdminPollCreateForm, 'endsAt' | 'startsAt'> {
  return {
    endsAt: getStableFutureDeadline(form.endsAt, now).toISOString(),
    startsAt: now.toISOString(),
  };
}

function getStableFutureDeadline(value: string, now = new Date()) {
  const parsed = getAdminDateTimeValue(value);

  return parsed.getTime() > now.getTime()
    ? parsed
    : new Date(now.getTime() + adminPollDefaultDeadlineOffsetMs);
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

function _getSelectedTemplate(
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

function getAdminPollInitial(type: string) {
  switch (type) {
    case 'WEDNESDAY':
      return '수';
    case 'SATURDAY':
      return '토';
    case 'COFFEE':
      return '커';
    default:
      return '커';
  }
}

function getAdminPollListMeta(poll: PollSummary) {
  const status = getPollStatusLabel(poll.status);
  const deadline = formatDateTime(poll.endsAt);

  if (poll.pollType === 'COFFEE') {
    return `${status} · 청구 생성 · ${deadline} 마감`;
  }

  if (poll.pollType === 'CUSTOM') {
    return `${getSelectionTypeLabel(poll.selectionType)} · 댓글 관리 · ${deadline} 마감`;
  }

  return `${getPollResponseSummary(poll)} · ${deadline} 마감`;
}

function canClosePoll(poll: PollSummary) {
  return poll.status !== 'CLOSED' && !isEndedPoll(poll);
}

function getDefaultPollTitle(type: AdminPollType) {
  switch (type) {
    case 'WEDNESDAY':
      return '수요예배 참석';
    case 'SATURDAY':
      return '토요 목자모임';
    case 'COFFEE':
      return '커피 주문';
    case 'CUSTOM':
      return '커스텀 투표';
    default:
      return assertNever(type);
  }
}

function getDefaultPollOptionsText(type: AdminPollType, fallback: string) {
  switch (type) {
    case 'WEDNESDAY':
      return '참석, 불참, 미정';
    case 'SATURDAY':
      return '참석, 불참, 지각, 미정';
    case 'COFFEE':
      return fallback || 'menu:1';
    case 'CUSTOM':
      return fallback || '선택지 1, 선택지 2';
    default:
      return assertNever(type);
  }
}

function getRepeatTemplateTypePatch(
  type: AdminPollType,
  current: AdminPollTemplateForm,
): Partial<AdminPollTemplateForm> {
  const isCoffee = type === 'COFFEE';
  const currentTitle = current.title.trim();
  const defaultTitles = new Set<string>(adminPollTypes.map((item) => getDefaultPollTitle(item.id)));
  const shouldUseTypeTitle =
    currentTitle.length === 0 ||
    defaultTitles.has(currentTitle) ||
    currentTitle === '커피 주문 투표';

  return {
    ...getRepeatTemplateSchedulePatch(type, current),
    chargeGenerationType: isCoffee ? 'OPTION_PRICE' : 'NONE',
    optionsText: isCoffee ? '' : getDefaultPollOptionsText(type, current.optionsText),
    paymentAccountId: isCoffee ? current.paymentAccountId : '',
    paymentCategory: isCoffee ? 'COFFEE' : 'NONE',
    pollType: type,
    selectionType: type === 'CUSTOM' ? current.selectionType : 'SINGLE',
    title: shouldUseTypeTitle
      ? type === 'COFFEE'
        ? '커피 주문 투표'
        : getDefaultPollTitle(type)
      : current.title,
  };
}

function getRepeatTemplateSchedulePatch(
  type: AdminPollType,
  current: AdminPollTemplateForm,
): Pick<AdminPollTemplateForm, 'endDayOfWeek' | 'endTime' | 'startDayOfWeek' | 'startTime'> {
  switch (type) {
    case 'WEDNESDAY':
      return {
        startDayOfWeek: '3',
        startTime: '09:00:00',
        endDayOfWeek: '3',
        endTime: '18:00:00',
      };
    case 'SATURDAY':
      return {
        startDayOfWeek: '6',
        startTime: '09:00:00',
        endDayOfWeek: '6',
        endTime: '11:00:00',
      };
    case 'COFFEE':
      return {
        startDayOfWeek: '3',
        startTime: '09:00:00',
        endDayOfWeek: '4',
        endTime: '09:00:00',
      };
    case 'CUSTOM':
      return {
        startDayOfWeek: current.startDayOfWeek,
        startTime: current.startTime,
        endDayOfWeek: current.endDayOfWeek,
        endTime: current.endTime,
      };
    default:
      return assertNever(type);
  }
}

function getCreatePollTypePatch(
  type: AdminPollType,
  current: AdminPollCreateForm,
  _templates: AdminPollTemplate[],
): Partial<AdminPollCreateForm> {
  const timePatch = getCreatePollTimeRefreshPatch(current);

  return {
    allowUserOptionAdd: type === 'COFFEE' ? true : current.allowUserOptionAdd,
    chargeGenerationType: type === 'COFFEE' ? 'OPTION_PRICE' : 'NONE',
    endsAt: timePatch.endsAt,
    optionsText:
      type === 'COFFEE'
        ? defaultCoffeePollOptionsText
        : getDefaultPollOptionsText(type, current.optionsText),
    paymentAccountId: type === 'COFFEE' ? current.paymentAccountId : '',
    paymentCategory: type === 'COFFEE' ? 'COFFEE' : 'NONE',
    pollType: type,
    selectionType: type === 'CUSTOM' ? current.selectionType : 'SINGLE',
    startsAt: timePatch.startsAt,
    templateId: '',
    title: getDefaultPollTitle(type),
  };
}

function splitAdminPollOptionsText(value: string) {
  const options = value
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean);

  return options.length > 0 ? options : [''];
}

function updateAdminPollOptionText(options: string[], index: number, value: string) {
  return options.map((option, optionIndex) => (optionIndex === index ? value : option)).join(', ');
}

function removeAdminPollOptionText(options: string[], index: number) {
  const nextOptions = options.filter((_, optionIndex) => optionIndex !== index);

  return (nextOptions.length > 0 ? nextOptions : ['']).join(', ');
}

function appendAdminPollOptionText(options: string[]) {
  return [...options, `선택지 ${options.length + 1}`].join(', ');
}

function parseCoffeeMenuIdsFromOptionsText(value: string) {
  return value
    .split(',')
    .map((option) => option.trim())
    .map((option) => {
      const match = /^menu:(\d+)$/i.exec(option);
      return match ? Number(match[1]) : null;
    })
    .filter((menuId): menuId is number => menuId !== null);
}

function formatCoffeeMenuOptionsText(menuIds: number[]) {
  return menuIds.map((menuId) => `menu:${menuId}`).join(', ');
}

function getAdminPollTypeDescription(type: AdminPollType) {
  switch (type) {
    case 'WEDNESDAY':
      return '고정 선택지: 참석/불참/미정';
    case 'SATURDAY':
      return '고정 선택지: 참석/불참/지각/미정';
    case 'COFFEE':
      return '단일 선택 · 메뉴 가격으로 청구 생성';
    case 'CUSTOM':
      return '선택지·댓글·응답자 공개 설정 가능';
    default:
      return assertNever(type);
  }
}

function getTemplateScheduleLabel(template: AdminPollTemplate) {
  return `${getDayOfWeekLabel(template.startDayOfWeek)} ${formatShortTime(
    template.startTime,
  )} 시작 · ${getDayOfWeekLabel(template.endDayOfWeek)} ${formatShortTime(
    template.endTime,
  )} 마감`;
}

function getTemplateRepeatSummary(template: AdminPollTemplate) {
  const schedule = `매주 ${getDayOfWeekLabel(template.startDayOfWeek)} ${formatShortTime(
    template.startTime,
  )} 생성 · ${getDayOfWeekLabel(template.endDayOfWeek)} ${formatShortTime(
    template.endTime,
  )} 마감`;

  return template.autoCreateEnabled ? schedule : `${schedule} · 반복 OFF`;
}

function getAdminPollTemplateLiveSummary(form: AdminPollTemplateForm) {
  const startDayOfWeek = parseTemplateDayOfWeek(form.startDayOfWeek);
  const endDayOfWeek = parseTemplateDayOfWeek(form.endDayOfWeek);

  return `매주 ${getDayOfWeekLongLabel(startDayOfWeek)} ${formatShortTime(
    form.startTime,
  )}에 열리고 ${getDayOfWeekLongLabel(endDayOfWeek)} ${formatShortTime(
    form.endTime,
  )}에 마감됩니다.`;
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

function getDayOfWeekLongLabel(value: number) {
  return `${getDayOfWeekLabel(value)}요일`;
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
    case 'MEAL':
      return '밥';
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

function parsePrayerMemberSelection(value: string) {
  try {
    return parseUserIdList(value);
  } catch {
    return [];
  }
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

function getPenaltyRulesForSelection(state: PenaltyRuleState) {
  switch (state.status) {
    case 'success':
      return state.rules;
    case 'empty':
      return [];
    case 'idle':
    case 'loading':
    case 'error':
      return null;
    default:
      return assertNever(state);
  }
}

function isSaturdayLatePenaltyRule(ruleType: PenaltyRuleType) {
  return ruleType === 'SATURDAY_LATE';
}

function getPaymentCategoryLabel(category: PaymentCategory) {
  switch (category) {
    case 'PENALTY':
      return '벌금';
    case 'COFFEE':
      return '커피';
    case 'MEAL':
      return '밥';
    default:
      return assertNever(category);
  }
}

function getCoffeeCategoryLabel(category: string) {
  switch (category) {
    case 'COFFEE':
      return '커피';
    case 'DUTCH_COFFEE':
      return '더치커피';
    case 'DECAF':
      return '디카페인';
    case 'BEVERAGE':
      return '음료';
    case 'TEA_BEVERAGE':
      return '티/음료';
    case 'SMOOTHIE':
      return '스무디';
    case 'ADE':
      return '에이드';
    case 'TEA':
      return '티';
    case 'JUICE':
      return '주스';
    case 'FRAPPE':
      return '프라페';
    case 'MILK_SHAKE':
      return '밀크쉐이크';
    case 'DESSERT':
      return '디저트';
    default:
      return category;
  }
}

function getPenaltyRuleSummary(rule: PenaltyRule) {
  if (isSaturdayLatePenaltyRule(rule.ruleType)) {
    return `적용 중 · 지각 분 기준 · 기본 ${formatWon(rule.baseAmount)} + 1분당 ${formatWon(rule.amountPerUnit)}`;
  }

  return `적용 중 · 미달 횟수 기준 · 주간 ${rule.requiredCount}회 · 기본 ${formatWon(rule.baseAmount)} + 미달 1회당 ${formatWon(rule.amountPerUnit)}`;
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

function getChargeStatusActionLabel(status: AdminChargeStatusTarget) {
  if (status === 'UNPAID') {
    return '미납 복구';
  }

  return getChargeStatusLabel(status);
}

function getChargeIcon(charge: ChargeItem): IconexIconName {
  if (charge.status === 'PAID') {
    return 'check';
  }

  if (charge.paymentCategory === 'COFFEE') return 'coins';
  if (charge.paymentCategory === 'MEAL') return 'receipt';
  return 'wallet';
}

function getChargeDescription(charge: ChargeItem) {
  if (charge.paidAt) {
    return `납부일 ${charge.paidAt.slice(0, 10)}`;
  }

  if (charge.dueDate) {
    return charge.dueDate;
  }

  return charge.reason?.trim() || getPaymentCategoryLabel(charge.paymentCategory);
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

function toNotificationDraft(
  form: AdminNotificationSendForm,
  weekStartDate: string,
): AdminNotificationDraft {
  const title = form.title.trim();
  const body = form.body.trim();

  if (!title || !body) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '알림 제목과 본문을 입력해 주세요.',
    });
  }

  if (title.length > 80 || body.length > 240) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '알림 제목은 80자, 본문은 240자 이내로 입력해 주세요.',
    });
  }

  return {
    body,
    sourceLabel: getNotificationTargetModeLabel(form.targetMode),
    targetId: null,
    targetWeekStartDate: form.targetMode === 'MISSING_DEVOTION' ? weekStartDate : null,
    title,
  };
}

function toNotificationTargetFromCampusMember(member: AdminCampusMember): AdminNotificationTarget {
  return {
    email: member.email,
    meta: member.email,
    name: member.name,
    userId: member.userId,
  };
}

function toNotificationTargetFromMissingMember(
  member: AdminMissingDevotionMember,
): AdminNotificationTarget {
  return {
    email: member.email,
    meta: member.campusName,
    name: member.name,
    userId: member.userId,
  };
}

function toNotificationTargetFromChargeMember(
  member: AdminCampusChargeSummary['members'][number],
  paymentCategory: PaymentCategory,
): AdminNotificationTarget {
  return {
    email: member.email,
    meta: `${getPaymentCategoryLabel(paymentCategory)} 미납 ${formatWon(member.unpaidAmount)}`,
    name: member.name,
    userId: member.userId,
  };
}

function dedupeNotificationTargets(targets: AdminNotificationTarget[]) {
  const seen = new Set<number>();

  return targets.filter((target) => {
    if (seen.has(target.userId)) {
      return false;
    }

    seen.add(target.userId);
    return true;
  });
}

function isChargeReminderNotificationState(state: NotificationSendState) {
  if (state.status === 'idle') {
    return false;
  }

  return (
    state.draft.sourceLabel === quickNotificationMessages.PENALTY.sourceLabel ||
    state.draft.sourceLabel === quickNotificationMessages.COFFEE.sourceLabel
  );
}

function getNotificationTargetModeLabel(mode: AdminNotificationTargetMode) {
  switch (mode) {
    case 'ALL':
      return '전체';
    case 'MISSING_DEVOTION':
      return '경건 미제출';
    case 'SELECTED':
      return '선택 대상';
    default:
      return assertNever(mode);
  }
}

function getNotificationTypeLabel(type: AdminNotificationType) {
  switch (type) {
    case 'CUSTOM':
      return '일반 알림';
    default:
      return assertNever(type);
  }
}

function getNotificationTargetSummary(log: AdminNotificationLog) {
  if (log.targetWeekStartDate) {
    return `${formatShortWeekLabel(log.targetWeekStartDate)} 주차 대상`;
  }

  if (log.targetId !== null) {
    return '선택 대상';
  }

  return '직접 선택 대상';
}

function getNotificationLogSummary(log: AdminNotificationLog) {
  const sentAt = log.sentAt ? formatDateTime(log.sentAt) : formatDateTime(log.createdAt);

  return `${getNotificationStatusLabel(log.sendStatus)} · ${sentAt}`;
}

function getNotificationFailureMessage(
  reason: string | null,
  status: AdminNotificationSendStatus,
) {
  if (status === 'SENT') {
    return '실패 또는 제외 사유가 없습니다.';
  }

  if (!reason) {
    return status === 'SKIPPED'
      ? '이미 처리된 대상은 자동으로 제외될 수 있습니다.'
      : '발송 상태를 다시 확인해 주세요.';
  }

  const normalized = reason.toLowerCase();

  if (normalized.includes('token')) {
    return '알림 수신 정보가 없어 발송하지 못했습니다.';
  }

  if (normalized.includes('permission') || normalized.includes('403')) {
    return '권한 확인이 필요해 발송하지 못했습니다.';
  }

  if (normalized.includes('duplicate') || normalized.includes('lock') || normalized.includes('already')) {
    return '중복 발송 방지를 위해 제외되었습니다.';
  }

  return reason.length > 80 ? `${reason.slice(0, 80)}...` : reason;
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

function getSettlementSectionHint(section: AdminSettlementSection) {
  switch (section) {
    case 'charges':
      return '청구 요약, 회원별 미납 현황, 선택 회원 상세를 확인합니다.';
    case 'accounts':
      return null;
    case 'penaltyRules':
      return '벌금 규칙과 금액 계산 기준을 관리합니다.';
    default:
      return assertNever(section);
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
  adminRespondentAvatar: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  adminRespondentAvatarText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  adminRespondentChip: {
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '100%',
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  adminRespondentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  adminRespondentName: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    maxWidth: 140,
  },
  adminCompactButton: {
    alignItems: 'center',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 66,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  adminCompactButtonDanger: {
    backgroundColor: adminFigmaTokens.danger,
  },
  adminCompactButtonDisabled: {
    opacity: 0.45,
  },
  adminCompactButtonGhost: {
    backgroundColor: 'transparent',
    borderColor: adminFigmaTokens.borderSoft,
    borderWidth: 1,
  },
  adminCompactButtonPrimary: {
    backgroundColor: adminFigmaTokens.primary,
  },
  adminCompactButtonSecondary: {
    backgroundColor: adminFigmaTokens.surface,
    borderColor: adminFigmaTokens.borderSoft,
    borderWidth: 1,
  },
  adminCompactButtonText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  adminCompactButtonTextDanger: {
    color: adminFigmaTokens.surface,
  },
  adminCompactButtonTextGhost: {
    color: adminFigmaTokens.textSecondary,
  },
  adminCompactButtonTextPrimary: {
    color: adminFigmaTokens.surface,
  },
  adminCompactButtonTextSecondary: {
    color: adminFigmaTokens.primary,
  },
  adminResultMutedText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  adminResultOptionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginBottom: spacing.gap,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  adminBottomNavContent: {
    alignSelf: 'center',
    backgroundColor: adminFigmaTokens.surface,
    borderColor: adminFigmaTokens.borderSoft,
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
  adminBottomNavFrame: {
    flexShrink: 0,
  },
  adminBottomNavItem: {
    alignItems: 'center',
    borderRadius: 16,
    flexBasis: 68,
    flexGrow: 1,
    flexShrink: 1,
    gap: 3,
    height: 52,
    justifyContent: 'center',
    minWidth: 0,
    maxWidth: 68,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  adminBottomNavItemActive: {
    backgroundColor: '#F2F7FF',
  },
  adminBottomNavItemPressed: {
    opacity: 0.72,
  },
  adminBottomNavLabel: {
    color: adminFigmaTokens.textMuted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  adminBottomNavLabelActive: {
    color: adminFigmaTokens.primary,
  },
  adminHeaderContext: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 40,
    width: '100%',
  },
  adminHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  adminCampusChip: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 12,
    flexShrink: 1,
    height: 28,
    justifyContent: 'center',
    maxWidth: 150,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  adminCampusText: {
    color: adminFigmaTokens.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: 130,
  },
  adminContextName: {
    color: adminFigmaTokens.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    maxWidth: 90,
    minWidth: 0,
  },
  adminHomeCampusTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  adminModeContent: {
    flexGrow: 1,
    gap: spacing.gap,
    paddingBottom: 96,
    paddingTop: 4,
  },
  adminVirtualizedContent: {
    flexGrow: 1,
    paddingBottom: 96,
    paddingTop: 4,
  },
  adminVirtualizedHeader: {
    gap: spacing.gap,
  },
  adminModeFrame: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 0,
    minHeight: 0,
  },
  adminModeSheet: {
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 22,
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  adminModeSheetBackdrop: {
    backgroundColor: adminFigmaTokens.textPrimary,
    bottom: 0,
    left: 0,
    opacity: 0.34,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  adminModeSheetContainer: {
    bottom: 0,
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
  },
  adminModeSheetOption: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.background,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  adminModeSheetOptionBody: {
    color: adminFigmaTokens.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  adminModeSheetOptionIcon: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  adminModeSheetOptionList: {
    gap: 10,
  },
  adminModeSheetOptionTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  adminModeSheetRoot: {
    flex: 1,
  },
  adminModeScroll: {
    flex: 1,
    minHeight: 0,
  },
  adminShellHeader: {
    alignItems: 'flex-start',
    gap: 10,
  },
  adminScreenTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    minWidth: 0,
    width: '100%',
  },
  adminSubpageSegment: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  adminSubpageSegmentActive: {
    backgroundColor: adminFigmaTokens.surface,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  adminSubpageSegments: {
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  adminSubpageSegmentText: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  adminSubpageSegmentTextActive: {
    color: adminFigmaTokens.primary,
  },
  adminSubpageSubtitle: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 19,
  },
  adminSubpageSwitcher: {
    gap: 10,
  },
  adminSubpageTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  accountMeta: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 19,
    marginLeft: 56,
  },
  accountCopyHint: {
    color: adminFigmaTokens.success,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  accountCopyHintWarning: {
    color: adminFigmaTokens.warning,
  },
  accountCopyBadge: {
    backgroundColor: adminFigmaTokens.surface,
    borderColor: adminFigmaTokens.borderSoft,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  accountCopyRow: {
    position: 'relative',
  },
  accountCopyRowBadge: {
    position: 'absolute',
    right: 10,
    top: 8,
  },
  accountHeaderTrailing: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 6,
  },
  accountSubpageHeader: {
    alignItems: 'flex-start',
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.025,
    shadowRadius: 10,
  },
  accountActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    width: '100%',
  },
  paymentAccountSubmitButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: adminFigmaTokens.primary,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  paymentAccountSubmitButtonText: {
    color: adminFigmaTokens.surface,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  accountListContent: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  accountListHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    width: '100%',
  },
  accountListText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  accountListAccountNumber: {
    color: adminFigmaTokens.textSecondary,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  accountListAccountHolder: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  accountStatusBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  accountStatusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  accountStatusBadgeInactive: {
    backgroundColor: '#FEF3C7',
  },
  accountStatusBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
  },
  accountStatusBadgeTextActive: {
    color: adminFigmaTokens.success,
  },
  accountStatusBadgeTextInactive: {
    color: adminFigmaTokens.warning,
  },
  accountNumber: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  accountNumberButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingVertical: 4,
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
  chargeFilterCard: {
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 18,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.025,
    shadowRadius: 10,
  },
  chargeFilterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  chargeReminderBox: {
    backgroundColor: adminFigmaTokens.background,
    borderColor: adminFigmaTokens.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  chargeReminderTitle: {
    color: adminFigmaTokens.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  chargeListCount: {
    color: adminFigmaTokens.textMuted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  chargeListHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  compactBlock: {
    gap: spacing.gap,
    marginBottom: spacing.gap,
  },
  compactActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  coffeeBrandChip: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  coffeeBrandChipActive: {
    backgroundColor: '#E8F3FF',
  },
  coffeeBrandChipText: {
    color: adminFigmaTokens.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  coffeeBrandChipTextActive: {
    color: adminFigmaTokens.primary,
  },
  coffeeBrandPicker: {
    gap: 8,
    paddingVertical: 2,
  },
  coffeeMenuList: {
    maxHeight: 360,
  },
  coffeeMenuScrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  coffeeMenuRow: {
    alignItems: 'center',
    borderColor: adminFigmaTokens.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  coffeeMenuRowAdded: {
    backgroundColor: adminFigmaTokens.borderSoft,
    opacity: 0.72,
  },
  coffeeMenuSheet: {
    maxHeight: '82%',
    width: '100%',
  },
  coffeeMenuSheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  coffeeMenuInlineSheet: {
    borderRadius: 24,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.06,
    shadowRadius: 18,
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
  prayerPeriodDateField: {
    width: '100%',
  },
  prayerPeriodDateStack: {
    gap: spacing.gap,
  },
  prayerMemberSelectList: {
    gap: 8,
  },
  prayerMemberSelectRow: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.surface,
    borderColor: adminFigmaTokens.borderSoft,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  prayerMemberSelectRowActive: {
    backgroundColor: '#E8F3FF',
    borderColor: adminFigmaTokens.primary,
  },
  prayerMemberSelectRowDisabled: {
    opacity: 0.55,
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
  figmaSegmentDisabled: {
    opacity: 0.55,
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
  dateTimeCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  dateTimeControlBlock: {
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 16,
    gap: 8,
    padding: 10,
  },
  dateTimeDayCell: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 13,
    borderWidth: 1,
    flexBasis: '13%',
    flexGrow: 1,
    height: 34,
    justifyContent: 'center',
    minWidth: 32,
  },
  dateTimeDaySelected: {
    backgroundColor: adminFigmaTokens.primary,
    borderColor: adminFigmaTokens.primary,
  },
  dateTimeDayText: {
    color: adminFigmaTokens.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  dateTimeDayTextSelected: {
    color: adminFigmaTokens.surface,
  },
  dateTimeDayToday: {
    borderColor: adminFigmaTokens.mint,
  },
  dateTimeMonthButton: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  dateTimeMonthButtonText: {
    color: adminFigmaTokens.primary,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  dateTimeMonthTitle: {
    color: adminFigmaTokens.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 24,
  },
  dateTimePickerBackdrop: {
    backgroundColor: adminFigmaTokens.background,
    bottom: 0,
    flex: 1,
    justifyContent: 'flex-end',
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 20,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dateTimePickerHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  dateTimePickerMonthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateTimePickerSelected: {
    color: adminFigmaTokens.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 25,
  },
  dateTimePickerScroll: {
    flex: 1,
  },
  dateTimePickerScrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  dateTimePickerSheet: {
    backgroundColor: adminFigmaTokens.surface,
    borderColor: adminFigmaTokens.borderSoft,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 14,
    shadowColor: adminFigmaTokens.textPrimary,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  dateTimeSelectCard: {
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 18,
    gap: 6,
    minHeight: 82,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateTimeSelectHint: {
    color: adminFigmaTokens.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  dateTimeSelectLabel: {
    color: adminFigmaTokens.textMuted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  dateTimeSelectValue: {
    color: adminFigmaTokens.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 25,
  },
  dateTimeStepper: {
    flex: 1,
    gap: 8,
    minWidth: 126,
  },
  dateTimeStepperButton: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.surface,
    borderRadius: 14,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  dateTimeStepperButtonText: {
    color: adminFigmaTokens.primary,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  dateTimeStepperControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  dateTimeStepperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dateTimeStepperValue: {
    color: adminFigmaTokens.textPrimary,
    flex: 1,
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 28,
    minWidth: 40,
    textAlign: 'center',
  },
  dateTimeWeekRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dateTimeWeekdayText: {
    color: adminFigmaTokens.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    textAlign: 'center',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  formFieldFull: {
    flexBasis: '100%',
    flexGrow: 1,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  headerRowCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  modeReturnButton: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.borderSoft,
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
  modeReturnButtonPressed: {
    opacity: 0.72,
  },
  modeReturnButtonText: {
    color: adminFigmaTokens.primary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    includeFontPadding: false,
  },
  modeReturnButtonChevron: {
    color: adminFigmaTokens.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginLeft: 1,
  },
  inlineError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.item,
    gap: 10,
    padding: spacing.card,
  },
  inlineErrorAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  inlineErrorActionText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  inlineErrorText: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  inlineInfo: {
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 14,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineInfoText: {
    color: adminFigmaTokens.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  inviteCodeCopyButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  inviteCodeCopyButtonCopied: {
    backgroundColor: colors.primary,
  },
  inviteCodeCopyButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  inviteCodeCopyButtonTextCopied: {
    color: colors.surface,
  },
  inviteCodeError: {
    color: colors.danger,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  inviteCodeLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  inviteCodeRow: {
    alignItems: 'center',
    borderColor: colors.borderSoft,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteCodeValue: {
    color: colors.textPrimary,
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 20,
    minWidth: 120,
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
  virtualizedMemberListBody: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.card,
    paddingTop: spacing.gap,
  },
  virtualizedMemberListFooter: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    height: spacing.card,
  },
  virtualizedMemberListHeader: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    gap: spacing.gap,
    padding: spacing.card,
    paddingBottom: 0,
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
  notificationTargetSelected: {
    borderColor: colors.primary,
    borderWidth: 1,
  },
  pollIconBox: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 15,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pollIconBoxMint: {
    backgroundColor: '#E8F6F7',
  },
  pollIconText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  pollIconTextMint: {
    color: colors.faith,
  },
  pollCreateActionDisabled: {
    opacity: 0.48,
  },
  pollCreateAddOption: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollCreateAddOptionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  pollCreateCtaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pollCreateDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  pollCreateHeader: {
    gap: 6,
  },
  pollCreateOptionField: {
    flex: 1,
    minWidth: 0,
  },
  pollCreateOptionList: {
    gap: 12,
  },
  pollCreateOptionNumber: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pollCreateOptionNumberText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  pollCreateOptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  pollCreatePrimaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
  },
  pollCreatePrimaryActionText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '800',
  },
  pollCreateRemoveOption: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pollCreateRemoveOptionDisabled: {
    opacity: 0.4,
  },
  pollCreateRemoveOptionText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  pollCreateSecondaryAction: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 18,
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
  },
  pollCreateSecondaryActionText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '800',
  },
  pollCreateSelectPill: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollCreateSelectPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  pollCreateShell: {
    gap: 16,
    paddingBottom: 8,
  },
  pollCreateTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  pollCreateToggle: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollCreateToggleActive: {
    backgroundColor: '#E8F3FF',
  },
  pollCreateToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  pollCreateToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  pollCreateToggleTextActive: {
    color: colors.primary,
  },
  pollCreateTypeCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 88,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  pollCreateTypeCardSelected: {
    borderColor: colors.primary,
  },
  pollCreateTypeDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  pollCreateTypeIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 18,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  pollCreateTypeIconMint: {
    backgroundColor: '#E6F7F8',
  },
  pollCreateTypeIconText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  pollCreateTypeIconTextMint: {
    color: colors.faith,
  },
  pollCreateTypeList: {
    gap: 12,
  },
  pollCreateTypeTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
  },
  pollItemMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  pollItemText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  pollItemTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  pollListItem: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  pollListItemSelected: {
    borderColor: colors.primary,
  },
  pollManagePill: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    minWidth: 52,
    paddingHorizontal: 10,
  },
  pollManagePillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  pollPrimaryPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    minWidth: 96,
    paddingHorizontal: 16,
  },
  pollPrimaryPillText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  pollQuickActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  pollResultPill: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollResultPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  pollClosePill: {
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollClosePillText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  pollSectionShell: {
    gap: 16,
  },
  pollSoftButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F2F4F6',
    borderRadius: 12,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pollSoftButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  pollSoftPill: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 12,
  },
  pollSoftPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  pollStatusPill: {
    alignItems: 'center',
    backgroundColor: '#E8F3FF',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    minWidth: 52,
    paddingHorizontal: 12,
  },
  pollStatusPillDanger: {
    backgroundColor: '#FFF1F2',
  },
  pollStatusPillInfo: {
    backgroundColor: '#E6F7F8',
  },
  pollStatusPillMuted: {
    backgroundColor: '#F2F4F6',
  },
  pollStatusPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  pollStatusPillTextDanger: {
    color: colors.danger,
  },
  pollStatusPillTextInfo: {
    color: colors.faith,
  },
  pollStatusPillTextMuted: {
    color: colors.textSecondary,
  },
  repeatEditorActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  repeatEditorHeader: {
    gap: 8,
    paddingHorizontal: 2,
  },
  repeatEditorSection: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  repeatEditorSectionBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  repeatEditorSectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  repeatEditorShell: {
    gap: 14,
  },
  repeatConfirmLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    minWidth: 74,
  },
  repeatConfirmList: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  repeatConfirmRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  repeatConfirmValue: {
    color: colors.textPrimary,
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  repeatStepIndicator: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  repeatStepPill: {
    backgroundColor: colors.borderSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  repeatStepPillActive: {
    backgroundColor: '#E8F3FF',
  },
  repeatStepText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  repeatStepTextActive: {
    color: colors.primary,
  },
  repeatRuleEditor: {
    gap: 12,
  },
  repeatRulePoint: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  repeatTimeButton: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 14,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  repeatTimeButtonText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  repeatTimeControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  repeatTimeGroup: {
    flexGrow: 1,
    gap: 6,
    minWidth: 128,
  },
  repeatTimeLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  repeatTimeStepper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  repeatTimeValue: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 25,
    minWidth: 34,
    textAlign: 'center',
  },
  repeatSummaryBox: {
    backgroundColor: '#E8F3FF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  repeatSummaryBoxError: {
    backgroundColor: '#FFF1F2',
  },
  repeatSummaryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  repeatSummaryTextError: {
    color: colors.danger,
  },
  repeatWizardActions: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 6,
  },
  repeatWizardBackButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 999,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  repeatWizardBackText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  repeatWizardError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  repeatWizardErrorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  repeatWizardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  repeatWizardMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  repeatWizardShell: {
    gap: 18,
  },
  repeatWeekdayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  repeatWeekdayPill: {
    alignItems: 'center',
    backgroundColor: '#F2F4F6',
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    minWidth: 38,
    paddingHorizontal: 10,
  },
  repeatWeekdayPillActive: {
    backgroundColor: '#E8F3FF',
  },
  repeatWeekdayText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  repeatWeekdayTextActive: {
    color: colors.primary,
  },
  pollTemplateEntry: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    padding: 14,
  },
  pollTemplateRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pollTemplateActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  pollTemplateSummary: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    minHeight: 102,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  pollTemplateSummaryText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  pollTemplateSummaryTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  pollTemplateTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  templateAutoRow: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  templateFormSection: {
    gap: 10,
  },
  templatePreviewBlock: {
    gap: 10,
  },
  templatePreviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  templatePreviewOptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 42,
  },
  templatePreviewShell: {
    gap: 22,
  },
  templatePreviewSummary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  menuSheetEmpty: {
    gap: 10,
  },
  pollTypeList: {
    gap: 14,
  },
  penaltyModeIcon: {
    alignItems: 'center',
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  penaltyModePill: {
    alignSelf: 'flex-start',
    backgroundColor: adminFigmaTokens.borderSoft,
    borderRadius: 12,
    color: adminFigmaTokens.primary,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 7,
    textAlign: 'center',
  },
  penaltyModeSummary: {
    alignItems: 'center',
    borderColor: adminFigmaTokens.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  penaltyModeText: {
    flex: 1,
    gap: 4,
    minWidth: 160,
  },
  penaltyRuleListHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
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
    alignItems: 'stretch',
    backgroundColor: colors.textMuted,
    flex: 1,
    justifyContent: 'flex-end',
  },
  notificationSentIcon: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  notificationSentSheet: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: 14,
    marginHorizontal: 24,
    maxWidth: 360,
    paddingHorizontal: 20,
    paddingVertical: 22,
    width: '100%',
  },
  sectionTitle: {
    color: adminFigmaTokens.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  settlementSectionDescription: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 19,
  },
  settlementSectionHeader: {
    borderTopColor: adminFigmaTokens.borderSoft,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 16,
  },
  settlementTabBlock: {
    gap: 8,
  },
  settlementTabHint: {
    color: adminFigmaTokens.textMuted,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 2,
  },
});
