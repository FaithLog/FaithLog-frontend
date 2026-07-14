import type {
  ApiEnvelope,
  ApiError,
  AdminCampusChargeSummary,
  AdminChargeContractCapabilities,
  AdminCampusMember,
  AdminCampusRoleChangeRequest,
  AdminDashboardSummary,
  AdminMemberChargeList,
  AdminMissingDevotionMember,
  AdminNotificationLogList,
  AdminNotificationRequest,
  AdminNotificationResponse,
  AdminNotificationSendStatus,
  AdminNotificationType,
  AdminPaymentAccount,
  AdminPrayerGroup,
  AdminPrayerGroupCreateRequest,
  AdminPrayerGroupMembersReplaceRequest,
  AdminPrayerGroupUpdateRequest,
  AdminPrayerSeason,
  AdminPrayerSeasonCloseRequest,
  AdminPrayerSeasonCreateRequest,
  AdminChargeStatusChangeRequest,
  AdminChargeStatusTarget,
  AdminChargeStatusChangeResponse,
  CampusCreateRequest,
  CampusCreateResponse,
  CampusDetail,
  CampusJoinRequest,
  CampusJoinResponse,
  CampusUpdateRequest,
  CampusMembershipSummary,
  ChargeList,
  ChargeStatus,
  ChargeSummary,
  CoffeeDutyAssignRequest,
  CoffeeBrand,
  CoffeeMenu,
  CurrentUser,
  DeleteAccountRequest,
  DeleteAccountResponse,
  DevotionDailyCheckRequest,
  DevotionDailyCheckSaveResponse,
  DutyAssignment,
  DevotionMonthlySummary,
  FcmTokenRegisterRequest,
  FcmTokenRegisterResponse,
  PollComment,
  PollCommentRequest,
  PollDetail,
  PollOption,
  PollOptionAddRequest,
  PollResponse,
  PollResponseSaveRequest,
  PollResults,
  PollSummary,
  PrayerSubmissionSaveRequest,
  PrayerWeekSummary,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  MarkChargePaidRequest,
  MarkChargePaidResponse,
  MyDutyAssignment,
  PaymentAccount,
  PaymentAccountCategory,
  PaymentAccountCreateRequest,
  PaymentCategory,
  PenaltyCalculationType,
  PenaltyRule,
  PenaltyRuleCreateRequest,
  PenaltyRuleType,
  PenaltyRuleUpdateRequest,
  ServiceAdminUserDetail,
  ServiceAdminUserList,
  ServiceAdminUserRoleChangeRequest,
  ServiceAdminCampusList,
  ServiceAdminCampusMemberAddRequest,
  ServiceAdminCampusMemberAddResponse,
  ServiceAdminCampusOperationStatus,
  SignupRequest,
  SignupResponse,
  TokenPair,
  UserRole,
  WeeklyDevotionSaveRequest,
  WeeklyDevotionSummary,
} from './types';
import {FaithLogApiError} from './apiError';
import {getSafeApiErrorMessage} from './errorPolicy';
import {expireAuthSession} from '../auth/sessionExpiration';
import {executeMockRequest} from './mockAdapter';
import {
  parseAdminCampusChargeSummary,
  parseAdminCampusMember,
  parseAdminCampusMembers,
  parseAdminChargeStatusChangeResponse,
  parseAdminDashboardSummary,
  parseAdminMemberChargeList,
  parseAdminMissingDevotionMembers,
  parseAdminNotificationLogList,
  parseAdminNotificationResponse,
  parseAdminPaymentAccount,
  parseAdminPrayerGroup,
  parseAdminPrayerSeason,
  parseCampusMembershipSummaries,
  parseCampusMembershipSummary,
  parseCampusCreateResponse,
  parseCampusDetail,
  parseChargeList,
  parseChargeSummary,
  parseCoffeeBrands,
  parseCoffeeMenus,
  parseCurrentUser,
  parseDeleteAccountResponse,
  parseDevotionDailyCheckSaveResponse,
  parseDevotionMonthlySummary,
  parseDutyAssignment,
  parseDutyAssignments,
  parseFcmTokenRegisterResponse,
  parseLoginResponse,
  parseMarkChargePaidResponse,
  parseMyDutyAssignment,
  parseNullResponse,
  parsePaymentAccounts,
  parsePenaltyRule,
  parsePenaltyRules,
  parsePollComment,
  parsePollComments,
  parsePollDetail,
  parsePollOption,
  parsePollResponse,
  parsePollResults,
  parsePollSummaryList,
  parsePrayerWeekSummary,
  parseServiceAdminCampusList,
  parseServiceAdminCampusMemberAddResponse,
  parseServiceAdminUserDetail,
  parseServiceAdminUserList,
  parseSignupResponse,
  parseTokenPair,
  parseWeeklyDevotionSummary,
} from './runtimeValidation';
import {
  getAuthSessionGeneration,
  getStoredAuthSession,
  isAccessTokenOwnedByAuthSession,
  isAuthSessionRequestAllowed,
  isAuthSessionGenerationCurrent,
  saveTokens,
  type AuthSessionGeneration,
} from './tokenStorage';
import {hasRefreshLogoutHandoff, trackRefreshForLogout} from '../auth/refreshLogoutHandoff';

type RequestOptions = {
  accessToken?: string;
  allowAuthSessionChange?: boolean;
  allowUnstoredAccessToken?: boolean;
  authSessionGeneration?: AuthSessionGeneration;
  exposeServerErrorMessage?: boolean;
  treatUnauthorizedAsPermissionDenied?: boolean;
  skipAuthRefresh?: boolean;
  timeoutMs?: number;
  responseParser?: (value: unknown) => unknown;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  body?: unknown;
  onResponseParsed?: (value: unknown) => void;
  onEffectiveAuthTokens?: (tokens: Pick<TokenPair, 'accessToken' | 'refreshToken'>) =>
    void | Promise<void>;
  onRequestDispatch?: () => void;
};

type ParsedRequestOptions<T> = Omit<RequestOptions, 'responseParser'> & {
  responseParser: (value: unknown) => T;
};

type UnparsedRequestOptions = Omit<RequestOptions, 'responseParser'> & {
  responseParser?: never;
};

export type AuthenticatedTransportRequestOptions<T> = {
  accessToken: string;
  authSessionGeneration: AuthSessionGeneration;
  execute: (effectiveAccessToken: string) => Promise<T>;
};

type RequestExecutor<T> = (options: RequestOptions) => Promise<T>;

export {FaithLogApiError} from './apiError';

type AuthRefreshFlight = {
  generation: AuthSessionGeneration;
  promise: Promise<TokenPair>;
  refreshToken: string;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const LOGOUT_REQUEST_TIMEOUT_MS = 5_000;
const SUPPORTED_APP_ENVIRONMENTS = new Set(['local', 'development', 'preview', 'production']);
const MOCK_ALLOWED_APP_ENVIRONMENTS = new Set(['local', 'development']);
const TRUSTED_DEPLOYMENT_API_ORIGINS = new Set([
  'https://faithlog-549871256004.asia-northeast3.run.app',
]);
let authRefreshInFlight: AuthRefreshFlight | null = null;

export function isMockModeEnabled() {
  const requested =
    process.env.EXPO_PUBLIC_MOCK_MODE?.trim().toLowerCase() === 'true';

  if (!requested) {
    return false;
  }

  const appEnvironment =
    process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase() || 'local';

  if (!MOCK_ALLOWED_APP_ENVIRONMENTS.has(appEnvironment)) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'CONFIGURATION',
      message: '현재 앱 환경에서는 mock API를 사용할 수 없습니다.',
    });
  }

  return true;
}

export function getAdminChargeContractCapabilities(): AdminChargeContractCapabilities {
  const provisionalContractsEnabled = isMockModeEnabled();

  return {
    devotionPenaltyReopenEnabled: provisionalContractsEnabled,
    paidStatusEnabled: provisionalContractsEnabled,
  };
}

export function validateRuntimeConfig() {
  if (isMockModeEnabled()) {
    return;
  }

  getApiBaseUrl();
}

export function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const appEnvironment =
    process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase() || 'local';

  if (!configured || !SUPPORTED_APP_ENVIRONMENTS.has(appEnvironment)) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'CONFIGURATION',
      message: 'API 서버 설정이 필요합니다.',
    });
  }

  try {
    const url = new URL(configured);
    const deployedEnvironment =
      appEnvironment === 'preview' || appEnvironment === 'production';

    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      (deployedEnvironment &&
        (url.protocol !== 'https:' ||
          !TRUSTED_DEPLOYMENT_API_ORIGINS.has(url.origin) ||
          url.pathname !== '/'))
    ) {
      throw new Error('Unsupported protocol');
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'CONFIGURATION',
      message: 'API 서버 설정이 올바르지 않습니다.',
    });
  }
}

export function buildApiUrl(path: string) {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/api/v1/')
    ? path
    : `/api/v1/${path.replace(/^\/+/, '')}`;

  return `${baseUrl}${normalizedPath}`;
}

type PathSegment = string | number;

export function toPositiveIntegerPathSegment(value: unknown, label: string) {
  const numericValue =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (
    typeof numericValue !== 'number' ||
    !Number.isInteger(numericValue) ||
    numericValue <= 0 ||
    !Number.isSafeInteger(numericValue)
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값이 올바르지 않습니다.`,
    });
  }

  return String(numericValue);
}

function encodePathSegment(segment: PathSegment) {
  return encodeURIComponent(String(segment));
}

export function buildApiPath(...segments: PathSegment[]) {
  return `/api/v1/${segments.map(encodePathSegment).join('/')}`;
}

export function buildCampusPath(campusId: unknown, ...segments: PathSegment[]) {
  return buildApiPath('campuses', toPositiveIntegerPathSegment(campusId, 'campusId'), ...segments);
}

export function buildAdminCampusPath(campusId: unknown, ...segments: PathSegment[]) {
  return buildApiPath(
    'admin',
    'campuses',
    toPositiveIntegerPathSegment(campusId, 'campusId'),
    ...segments,
  );
}

export function buildPollListPath(campusId: unknown) {
  const query = new URLSearchParams({
    page: '0',
    size: '100',
  });

  return `${buildCampusPath(campusId, 'polls')}?${query.toString()}`;
}

export function toDatePathSegment(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값이 올바르지 않습니다.`,
    });
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime()) || formatLocalDate(date) !== value) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값이 올바르지 않습니다.`,
    });
  }

  return value;
}

export function toMondayDatePathSegment(value: unknown, label: string) {
  const dateValue = toDatePathSegment(value, label);
  const date = new Date(`${dateValue}T00:00:00`);

  if (date.getDay() !== 1) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label}는 월요일이어야 합니다.`,
    });
  }

  return dateValue;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toSummaryYearMonthQuery(year: unknown, month: unknown) {
  if (
    typeof year !== 'number' ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    typeof month !== 'number' ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '납부 요약 조회 연월이 올바르지 않습니다.',
    });
  }

  const params = new URLSearchParams();
  params.set('year', String(year));
  params.set('month', String(month));

  return params.toString();
}

type ChargeItemSortKey = 'createdAt' | 'dueDate' | 'amount';
type AdminCampusChargeSortKey =
  | 'createdAt'
  | 'userId'
  | 'name'
  | 'email'
  | 'totalAmount'
  | 'unpaidAmount'
  | 'paidAmount'
  | 'waivedAmount'
  | 'canceledAmount';
type SortDirection = 'asc' | 'desc';
type NotificationLogSortKey = 'createdAt' | 'sentAt' | 'sendStatus';
type ServiceAdminUserSortKey = 'id' | 'name' | 'email' | 'role' | 'createdAt';
type ServiceAdminCampusSortKey = 'id' | 'name' | 'region' | 'createdAt';
type PaymentAccountQueryParams = {
  accountType?: PaymentAccountCategory;
  includeInactive?: boolean;
};
type AdminCampusChargeQueryParams = {
  keyword?: string;
  page?: number;
  paymentAccountId?: number;
  paymentCategory?: PaymentCategory | 'ALL';
  size?: number;
  sort?: {direction: SortDirection; key: AdminCampusChargeSortKey};
  status?: ChargeStatus | 'ALL';
  userId?: number;
};

const chargeStatuses = ['UNPAID', 'PAID', 'WAIVED', 'CANCELED'] as const;
const paymentCategories = ['PENALTY', 'COFFEE', 'MEAL'] as const;
const paymentAccountCategories = ['PENALTY', 'COFFEE'] as const;
const penaltyRuleTypes = ['QUIET_TIME', 'PRAYER', 'BIBLE_READING', 'SATURDAY_LATE'] as const;
const penaltyCalculationTypes = ['MISSING_COUNT', 'LATE_MINUTE'] as const;
const chargeItemSortKeys = ['createdAt', 'dueDate', 'amount'] as const;
const adminCampusChargeSortKeys = [
  'createdAt',
  'userId',
  'name',
  'email',
  'totalAmount',
  'unpaidAmount',
  'paidAmount',
  'waivedAmount',
  'canceledAmount',
] as const;
const notificationTypes = ['CUSTOM'] as const;
const notificationSendStatuses = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;
const notificationLogSortKeys = ['createdAt', 'sentAt', 'sendStatus'] as const;
const serviceAdminUserSortKeys = ['id', 'name', 'email', 'role', 'createdAt'] as const;
const serviceAdminCampusSortKeys = ['id', 'name', 'region', 'createdAt'] as const;
const serviceAdminCampusStatuses = ['ACTIVE', 'PAUSED'] as const;
const sortDirections = ['asc', 'desc'] as const;
const userRoles = ['USER', 'MANAGER', 'ADMIN'] as const;

function isPaymentCategory(value: unknown): value is PaymentCategory {
  return paymentCategories.includes(value as PaymentCategory);
}

function isPaymentAccountCategory(value: unknown): value is PaymentAccountCategory {
  return paymentAccountCategories.includes(value as PaymentAccountCategory);
}

function isChargeStatus(value: unknown): value is ChargeStatus {
  return chargeStatuses.includes(value as ChargeStatus);
}

function isPenaltyRuleType(value: unknown): value is PenaltyRuleType {
  return penaltyRuleTypes.includes(value as PenaltyRuleType);
}

function isPenaltyCalculationType(value: unknown): value is PenaltyCalculationType {
  return penaltyCalculationTypes.includes(value as PenaltyCalculationType);
}

function isChargeItemSortKey(value: unknown): value is ChargeItemSortKey {
  return chargeItemSortKeys.includes(value as ChargeItemSortKey);
}

function isAdminCampusChargeSortKey(value: unknown): value is AdminCampusChargeSortKey {
  return adminCampusChargeSortKeys.includes(value as AdminCampusChargeSortKey);
}

function isNotificationType(value: unknown): value is AdminNotificationType {
  return notificationTypes.includes(value as AdminNotificationType);
}

function isNotificationSendStatus(value: unknown): value is AdminNotificationSendStatus {
  return notificationSendStatuses.includes(value as AdminNotificationSendStatus);
}

function isNotificationLogSortKey(value: unknown): value is NotificationLogSortKey {
  return notificationLogSortKeys.includes(value as NotificationLogSortKey);
}

function isServiceAdminUserSortKey(value: unknown): value is ServiceAdminUserSortKey {
  return serviceAdminUserSortKeys.includes(value as ServiceAdminUserSortKey);
}

function isServiceAdminCampusSortKey(value: unknown): value is ServiceAdminCampusSortKey {
  return serviceAdminCampusSortKeys.includes(value as ServiceAdminCampusSortKey);
}

function isServiceAdminCampusStatus(
  value: unknown,
): value is ServiceAdminCampusOperationStatus {
  return serviceAdminCampusStatuses.includes(value as ServiceAdminCampusOperationStatus);
}

function isSortDirection(value: unknown): value is SortDirection {
  return sortDirections.includes(value as SortDirection);
}

function isUserRole(value: unknown): value is (typeof userRoles)[number] {
  return userRoles.includes(value as (typeof userRoles)[number]);
}

function toSafeChargeListQuery(params: {
  page?: number;
  paymentCategory?: PaymentCategory | 'ALL';
  size?: number;
  sort?: {direction: SortDirection; key: ChargeItemSortKey};
  status?: ChargeStatus | 'ALL';
}) {
  const query = new URLSearchParams();
  const page =
    typeof params.page === 'number' && Number.isInteger(params.page) && params.page > 0
      ? Math.min(params.page, 9999)
      : 0;
  const size =
    typeof params.size === 'number' && Number.isInteger(params.size)
      ? Math.min(Math.max(params.size, 1), 100)
      : 20;
  const sortKey = isChargeItemSortKey(params.sort?.key) ? params.sort.key : 'createdAt';
  const sortDirection = isSortDirection(params.sort?.direction) ? params.sort.direction : 'desc';

  query.set('page', String(page));
  query.set('size', String(size));
  query.set('sort', `${sortKey},${sortDirection}`);

  if (isPaymentCategory(params.paymentCategory)) {
    query.set('paymentCategory', params.paymentCategory);
  }

  if (isChargeStatus(params.status)) {
    query.set('status', params.status);
  }

  return query.toString();
}

function toSafeAdminCampusChargeQuery(params: AdminCampusChargeQueryParams) {
  const {sort, ...chargeFilters} = params;
  const query = new URLSearchParams(toSafeChargeListQuery(chargeFilters));
  const keyword = typeof params.keyword === 'string' ? params.keyword.trim().slice(0, 80) : '';
  const sortKey = isAdminCampusChargeSortKey(sort?.key) ? sort.key : 'createdAt';
  const sortDirection = isSortDirection(sort?.direction) ? sort.direction : 'desc';

  query.set('sort', `${sortKey},${sortDirection}`);

  if (keyword) {
    query.set('keyword', keyword);
  }

  if (params.userId !== undefined) {
    query.set('userId', toPositiveIntegerPathSegment(params.userId, 'userId'));
  }

  if (params.paymentAccountId !== undefined) {
    query.set(
      'paymentAccountId',
      toPositiveIntegerPathSegment(params.paymentAccountId, 'paymentAccountId'),
    );
  }

  return query.toString();
}

function toAdminChargeStatusTarget(value: unknown): AdminChargeStatusTarget {
  if (
    value === 'UNPAID' ||
    value === 'PAID' ||
    value === 'WAIVED' ||
    value === 'CANCELED'
  ) {
    return value;
  }

  throw new FaithLogApiError({
    kind: 'error',
    message: '지원하지 않는 청구 상태입니다.',
  });
}

export function buildAdminChargeStatusChangeRequest(
  status: unknown,
): AdminChargeStatusChangeRequest {
  return {status: toAdminChargeStatusTarget(status)};
}

function toRequiredString(value: unknown, label: string) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label}을(를) 입력해 주세요.`,
    });
  }

  return trimmed;
}

function toOptionalSearchQueryValue(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim().slice(0, 80);

  return trimmed || undefined;
}

function toSafePage(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, 9999)
    : 0;
}

function toSafePageSize(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.min(Math.max(value, 1), 100)
    : 20;
}

function toServiceAdminUserRoleChangeRequest(
  body: ServiceAdminUserRoleChangeRequest,
): ServiceAdminUserRoleChangeRequest {
  if (!isUserRole(body.role)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '전역 역할 값이 올바르지 않습니다.',
    });
  }

  return {role: body.role};
}

function toCampusUpdateRequest(body: CampusUpdateRequest): CampusUpdateRequest {
  return {
    name: toRequiredString(body.name, '캠퍼스 이름'),
    region: toRequiredString(body.region, '지역'),
    description: toRequiredString(body.description, '설명'),
    isActive: Boolean(body.isActive),
  };
}

function toServiceAdminCampusMemberAddRequest(
  body: ServiceAdminCampusMemberAddRequest,
): ServiceAdminCampusMemberAddRequest {
  return {
    userId: Number(toPositiveIntegerPathSegment(body.userId, 'userId')),
  };
}

function toNonNegativeInteger(value: unknown, label: string) {
  const numericValue =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (
    typeof numericValue !== 'number' ||
    !Number.isInteger(numericValue) ||
    numericValue < 0 ||
    !Number.isSafeInteger(numericValue)
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label}은(는) 0 이상의 정수여야 합니다.`,
    });
  }

  return numericValue;
}

function toNullablePositiveInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return Number(toPositiveIntegerPathSegment(value, label));
}

function toPaymentAccountCreateRequest(
  body: PaymentAccountCreateRequest,
): PaymentAccountCreateRequest {
  if (!isPaymentAccountCategory(body.accountType)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '계좌 유형이 올바르지 않습니다.',
    });
  }

  const payload: PaymentAccountCreateRequest = {
    accountType: body.accountType,
    nickname: toRequiredString(body.nickname, '계좌 별칭'),
    bankName: toRequiredString(body.bankName, '은행명'),
    accountNumber: toRequiredString(body.accountNumber, '계좌번호'),
    accountHolder: toRequiredString(body.accountHolder, '예금주'),
  };

  if (body.ownerUserId !== undefined && body.ownerUserId !== null) {
    payload.ownerUserId = toNullablePositiveInteger(body.ownerUserId, 'ownerUserId');
  }

  return payload;
}

function toPollOptionAddRequest(body: PollOptionAddRequest): PollOptionAddRequest {
  const payload: PollOptionAddRequest = {};
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (content) {
    payload.content = content;
  }

  if (body.menuId !== undefined && body.menuId !== null) {
    payload.menuId = Number(toPositiveIntegerPathSegment(body.menuId, 'menuId'));
  }

  if (!payload.content && payload.menuId === undefined) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '추가 항목을 선택해 주세요.',
    });
  }

  return payload;
}

function toPenaltyRuleCreateRequest(body: PenaltyRuleCreateRequest): PenaltyRuleCreateRequest {
  if (!isPenaltyRuleType(body.ruleType)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '벌금 규칙 타입이 올바르지 않습니다.',
    });
  }

  if (!isPenaltyCalculationType(body.calculationType)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '벌금 계산 타입이 올바르지 않습니다.',
    });
  }

  return {
    ruleType: body.ruleType,
    calculationType: body.calculationType,
    requiredCount: toNonNegativeInteger(body.requiredCount, '필수 기준 횟수'),
    baseAmount: toNonNegativeInteger(body.baseAmount, '기본 금액'),
    amountPerUnit: toNonNegativeInteger(body.amountPerUnit, '단위당 금액'),
  };
}

function toPenaltyRuleUpdateRequest(body: PenaltyRuleUpdateRequest): PenaltyRuleUpdateRequest {
  return {
    requiredCount: toNonNegativeInteger(body.requiredCount, '필수 기준 횟수'),
    baseAmount: toNonNegativeInteger(body.baseAmount, '기본 금액'),
    amountPerUnit: toNonNegativeInteger(body.amountPerUnit, '단위당 금액'),
    isActive: Boolean(body.isActive),
  };
}

function toPaymentAccountQuery(params: PaymentAccountQueryParams = {}) {
  const query = new URLSearchParams();

  if (params.accountType !== undefined) {
    if (!isPaymentAccountCategory(params.accountType)) {
      throw new FaithLogApiError({
        kind: 'error',
        message: '계좌 유형이 올바르지 않습니다.',
      });
    }

    query.set('accountType', params.accountType);
  }

  if (params.includeInactive !== undefined) {
    query.set('includeInactive', String(params.includeInactive));
  }

  return query.toString();
}

function toAdminPrayerSeasonCreateRequest(
  body: AdminPrayerSeasonCreateRequest,
): AdminPrayerSeasonCreateRequest {
  return {
    name: toRequiredString(body.name, '기도 운영 기간 이름'),
    startDate: toDatePathSegment(body.startDate, 'startDate'),
  };
}

function toAdminPrayerSeasonCloseRequest(
  body: AdminPrayerSeasonCloseRequest,
): AdminPrayerSeasonCloseRequest {
  return {
    endDate: toDatePathSegment(body.endDate, 'endDate'),
  };
}

function toPositiveSortOrder(value: unknown, label: string) {
  return Number(toPositiveIntegerPathSegment(value, label));
}

function toAdminPrayerGroupCreateRequest(
  body: AdminPrayerGroupCreateRequest,
): AdminPrayerGroupCreateRequest {
  return {
    name: toRequiredString(body.name, '기도조 이름'),
    sortOrder: toPositiveSortOrder(body.sortOrder, 'sortOrder'),
  };
}

function toAdminPrayerGroupUpdateRequest(
  body: AdminPrayerGroupUpdateRequest,
): AdminPrayerGroupUpdateRequest {
  return {
    name: toRequiredString(body.name, '기도조 이름'),
    sortOrder: toPositiveSortOrder(body.sortOrder, 'sortOrder'),
    isActive: Boolean(body.isActive),
  };
}

function toAdminPrayerGroupMembersReplaceRequest(
  body: AdminPrayerGroupMembersReplaceRequest,
): AdminPrayerGroupMembersReplaceRequest {
  const seen = new Set<number>();
  const userIds = body.userIds.map((userId) =>
    Number(toPositiveIntegerPathSegment(userId, 'userIds')),
  );

  userIds.forEach((userId) => {
    if (seen.has(userId)) {
      throw new FaithLogApiError({
        kind: 'error',
        message: '기도조 멤버 userId가 중복되었습니다.',
      });
    }

    seen.add(userId);
  });

  return {userIds};
}

function toDevotionSummaryYearMonthQuery(year: unknown, month: unknown) {
  if (
    typeof year !== 'number' ||
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    typeof month !== 'number' ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '경건생활 월간 통계 조회 연월이 올바르지 않습니다.',
    });
  }

  const params = new URLSearchParams();
  params.set('year', String(year));
  params.set('month', String(month));

  return params.toString();
}

function toAdminDashboardSummaryQuery(params: {weekStartDate?: string} = {}) {
  const query = new URLSearchParams();

  if (params.weekStartDate) {
    query.set(
      'weekStartDate',
      toMondayDatePathSegment(params.weekStartDate, 'weekStartDate'),
    );
  }

  return query.toString();
}

function toAdminMissingDevotionQuery(weekStartDate: string) {
  const query = new URLSearchParams();
  query.set('weekStartDate', toMondayDatePathSegment(weekStartDate, 'weekStartDate'));

  return query.toString();
}

function toOptionalRequestIdQueryValue(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new FaithLogApiError({
      kind: 'error',
      message: 'requestId 값이 올바르지 않습니다.',
    });
  }

  const requestId = value.trim();

  if (!requestId) {
    return undefined;
  }

  if (requestId.length > 120 || !/^[0-9A-Za-z_-]+(?:-[0-9A-Za-z_-]+)*$/.test(requestId)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: 'requestId 값이 올바르지 않습니다.',
    });
  }

  return requestId;
}

function toSafeAdminNotificationLogQuery(params: {
  endDate?: string;
  notificationType?: AdminNotificationType | 'ALL';
  page?: number;
  requestId?: string;
  sendStatus?: AdminNotificationSendStatus | 'ALL';
  size?: number;
  sort?: {direction: SortDirection; key: NotificationLogSortKey};
  startDate?: string;
  targetId?: number;
  targetWeekStartDate?: string;
} = {}) {
  const query = new URLSearchParams();
  const page =
    typeof params.page === 'number' && Number.isInteger(params.page) && params.page >= 0
      ? Math.min(params.page, 9999)
      : 0;
  const size =
    typeof params.size === 'number' && Number.isInteger(params.size)
      ? Math.min(Math.max(params.size, 1), 100)
      : 20;
  const sortKey = isNotificationLogSortKey(params.sort?.key)
    ? params.sort.key
    : 'createdAt';
  const sortDirection = isSortDirection(params.sort?.direction)
    ? params.sort.direction
    : 'desc';

  query.set('page', String(page));
  query.set('size', String(size));
  query.set('sort', `${sortKey},${sortDirection}`);

  if (isNotificationType(params.notificationType)) {
    query.set('notificationType', params.notificationType);
  }

  if (isNotificationSendStatus(params.sendStatus)) {
    query.set('sendStatus', params.sendStatus);
  }

  if (params.targetWeekStartDate) {
    query.set(
      'targetWeekStartDate',
      toDatePathSegment(params.targetWeekStartDate, 'targetWeekStartDate'),
    );
  }

  if (params.targetId !== undefined) {
    query.set('targetId', toPositiveIntegerPathSegment(params.targetId, 'targetId'));
  }

  const requestId = toOptionalRequestIdQueryValue(params.requestId);

  if (requestId) {
    query.set('requestId', requestId);
  }

  if (params.startDate) {
    query.set('startDate', toDatePathSegment(params.startDate, 'startDate'));
  }

  if (params.endDate) {
    query.set('endDate', toDatePathSegment(params.endDate, 'endDate'));
  }

  return query.toString();
}

function toSafeServiceAdminUserQuery(params: {
  email?: string;
  name?: string;
  page?: number;
  role?: UserRole | 'ALL';
  size?: number;
  sort?: {direction: SortDirection; key: ServiceAdminUserSortKey};
  userId?: number;
} = {}) {
  const query = new URLSearchParams();
  const page = toSafePage(params.page);
  const size = toSafePageSize(params.size);
  const sortKey = isServiceAdminUserSortKey(params.sort?.key) ? params.sort.key : 'id';
  const sortDirection = isSortDirection(params.sort?.direction) ? params.sort.direction : 'asc';
  const name = toOptionalSearchQueryValue(params.name);
  const email = toOptionalSearchQueryValue(params.email);

  query.set('page', String(page));
  query.set('size', String(size));
  query.set('sort', `${sortKey},${sortDirection}`);

  if (name) {
    query.set('name', name);
  }

  if (email) {
    query.set('email', email);
  }

  if (params.userId !== undefined) {
    query.set('userId', toPositiveIntegerPathSegment(params.userId, 'userId'));
  }

  if (isUserRole(params.role)) {
    query.set('role', params.role);
  }

  return query.toString();
}

function toSafeServiceAdminCampusQuery(params: {
  name?: string;
  page?: number;
  region?: string;
  size?: number;
  sort?: {direction: SortDirection; key: ServiceAdminCampusSortKey};
  status?: ServiceAdminCampusOperationStatus | 'ALL';
} = {}) {
  const query = new URLSearchParams();
  const page = toSafePage(params.page);
  const size = toSafePageSize(params.size);
  const sortKey = isServiceAdminCampusSortKey(params.sort?.key)
    ? params.sort.key
    : 'id';
  const sortDirection = isSortDirection(params.sort?.direction)
    ? params.sort.direction
    : 'asc';
  const name = toOptionalSearchQueryValue(params.name);
  const region = toOptionalSearchQueryValue(params.region);

  query.set('page', String(page));
  query.set('size', String(size));
  query.set('sort', `${sortKey},${sortDirection}`);

  if (name) {
    query.set('name', name);
  }

  if (region) {
    query.set('region', region);
  }

  if (isServiceAdminCampusStatus(params.status)) {
    query.set('status', params.status);
  }

  return query.toString();
}

function toAdminNotificationRequest(body: AdminNotificationRequest): AdminNotificationRequest {
  const targetUserIds = body.targetUserIds.map((userId) =>
    Number(toPositiveIntegerPathSegment(userId, 'targetUserIds')),
  );
  const notificationType = body.notificationType.trim();
  const title = body.title.trim();
  const messageBody = body.body.trim();

  if (targetUserIds.length === 0) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '알림 발송 대상이 없습니다.',
    });
  }

  if (!title || !messageBody) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '알림 제목과 본문을 입력해 주세요.',
    });
  }

  if (!isNotificationType(notificationType)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '알림 유형이 올바르지 않습니다.',
    });
  }

  return {
    notificationType,
    targetUserIds,
    targetWeekStartDate:
      body.targetWeekStartDate === null
        ? null
        : toMondayDatePathSegment(body.targetWeekStartDate, 'targetWeekStartDate'),
    targetId:
      body.targetId === null
        ? null
        : Number(toPositiveIntegerPathSegment(body.targetId, 'targetId')),
    title,
    body: messageBody,
  };
}

function normalizeApiError(
  status: number | undefined,
  envelope?: Partial<ApiEnvelope<unknown>>,
  options: {
    exposeServerErrorMessage?: boolean;
    treatUnauthorizedAsPermissionDenied?: boolean;
  } = {},
): ApiError {
  const code = typeof envelope?.code === 'string' ? envelope.code : undefined;
  const unauthorizedKind =
    options.treatUnauthorizedAsPermissionDenied === true
      ? 'permissionDenied'
      : 'sessionExpired';
  const unsafeError = compactApiError({
    kind: status === 401 ? unauthorizedKind : status === 403 ? 'permissionDenied' : status === 409 ? 'conflict' : 'error',
    status,
    code,
    message: '요청을 처리하지 못했습니다.',
  });
  const exposedMessage = getExposedServerErrorMessage(status, envelope, options);
  const message = exposedMessage ?? getSafeApiErrorMessage(unsafeError);

  if (status === 401) {
    return compactApiError({kind: unauthorizedKind, status, code, message});
  }

  if (status === 403) {
    return compactApiError({kind: 'permissionDenied', status, code, message});
  }

  if (status === 409) {
    return compactApiError({kind: 'conflict', status, code, message});
  }

  return compactApiError({kind: 'error', status, code, message});
}

function getExposedServerErrorMessage(
  status: number | undefined,
  envelope: Partial<ApiEnvelope<unknown>> | undefined,
  options: {exposeServerErrorMessage?: boolean},
) {
  if (
    options.exposeServerErrorMessage !== true ||
    status !== 400 && status !== 403 && status !== 422
  ) {
    return null;
  }

  const serverMessage = typeof envelope?.message === 'string' ? envelope.message.trim() : '';
  const serverCode = typeof envelope?.code === 'string' ? envelope.code.trim() : '';

  if (!serverMessage) {
    return null;
  }

  return serverCode ? `${serverMessage} (${serverCode})` : serverMessage;
}

function compactApiError(error: {
  kind: ApiError['kind'];
  message: string;
  status: number | undefined;
  code: string | undefined;
}): ApiError {
  return {
    kind: error.kind,
    message: error.message,
    ...(error.status === undefined ? {} : {status: error.status}),
    ...(error.code === undefined ? {} : {code: error.code}),
  };
}

function normalizeNetworkError(error: unknown): ApiError {
  if (error instanceof FaithLogApiError) {
    return error.detail;
  }

  return {
    kind: 'offline',
    message: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
  };
}

function isApiEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<ApiEnvelope<T>>;

  return (
    typeof candidate.success === 'boolean' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.timestamp === 'string'
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function parseEnvelope<T>(
  response: Response,
  options: {
    exposeServerErrorMessage?: boolean;
    treatUnauthorizedAsPermissionDenied?: boolean;
  } = {},
): Promise<ApiEnvelope<T>> {
  const payload = await parseJson(response);

  if (response.ok && response.status === 204 && payload === null) {
    return {
      success: true,
      code: 'SUCCESS',
      message: '요청이 성공했습니다.',
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  if (!isApiEnvelope<T>(payload)) {
    if (!response.ok) {
      throw new FaithLogApiError(normalizeApiError(response.status, undefined, options));
    }

    throw new FaithLogApiError({
      kind: 'error',
      status: response.status,
      message: '서버 응답 형식이 올바르지 않습니다.',
    });
  }

  if (!response.ok || !payload.success) {
    throw new FaithLogApiError(normalizeApiError(response.status, payload, options));
  }

  return payload;
}

async function executeApiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {accessToken, method = 'GET', body} = options;
  const init: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  };
  const mockMode = isMockModeEnabled();
  const response = mockMode
    ? await executeMockRequest(path, init)
    : await fetchWithTimeout(
        buildApiUrl(path),
        init,
        options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        options.onRequestDispatch,
      );
  const envelope = await parseEnvelope<T>(
    response,
    {
      ...(options.exposeServerErrorMessage === undefined
        ? {}
        : {exposeServerErrorMessage: options.exposeServerErrorMessage}),
      ...(options.treatUnauthorizedAsPermissionDenied === undefined
        ? {}
        : {treatUnauthorizedAsPermissionDenied: options.treatUnauthorizedAsPermissionDenied}),
    },
  );

  if (!options.responseParser) {
    throw new FaithLogApiError({
      kind: 'error',
      status: response.status,
      code: 'INVALID_SERVER_RESPONSE',
      message: '서버 응답 형식이 올바르지 않습니다.',
    });
  }

  try {
    return options.responseParser(envelope.data) as T;
  } catch {
    throw new FaithLogApiError({
      kind: 'error',
      status: response.status,
      code: 'INVALID_SERVER_RESPONSE',
      message: '서버 응답 형식이 올바르지 않습니다.',
    });
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  onRequestDispatch?: () => void,
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    onRequestDispatch?.();
    return await fetch(url, {...init, signal: controller.signal});
  } catch (error) {
    if (timedOut) {
      throw new FaithLogApiError({
        kind: 'offline',
        code: 'REQUEST_TIMEOUT',
        message: '요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function apiRequest<T>(
  path: string,
  options: ParsedRequestOptions<T>,
): Promise<T>;
export function apiRequest(
  path: string,
  options?: UnparsedRequestOptions,
): Promise<never>;
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const guardAuthSession =
    options.allowAuthSessionChange !== true &&
    (Boolean(options.accessToken) || options.authSessionGeneration !== undefined);
  const requestOptions: RequestOptions = {
    ...options,
    authSessionGeneration:
      options.authSessionGeneration ?? getAuthSessionGeneration(),
  };

  return executeRequestWithAuth(
    requestOptions,
    guardAuthSession,
    (effectiveOptions) => executeApiRequest<T>(path, effectiveOptions),
  );
}

export function authenticatedTransportRequest<T>({
  accessToken,
  authSessionGeneration,
  execute,
}: AuthenticatedTransportRequestOptions<T>) {
  const requestOptions: RequestOptions = {
    accessToken,
    authSessionGeneration,
  };

  return executeRequestWithAuth(requestOptions, true, async (effectiveOptions) => {
    if (!effectiveOptions.accessToken) {
      throw new FaithLogApiError(createSessionExpiredError(authSessionGeneration));
    }
    return execute(effectiveOptions.accessToken);
  });
}

async function executeRequestWithAuth<T>(
  requestOptions: RequestOptions,
  guardAuthSession: boolean,
  execute: RequestExecutor<T>,
): Promise<T> {
  try {
    await assertRequestAccessTokenIsOwned(requestOptions);
    assertRequestAuthSessionIsCurrent(requestOptions, guardAuthSession);
    const data = await execute(requestOptions);
    requestOptions.onResponseParsed?.(data);
    assertRequestAuthSessionIsCurrent(requestOptions, guardAuthSession);
    return data;
  } catch (error) {
    assertRequestAuthSessionIsCurrent(requestOptions, guardAuthSession);
    const normalizedError = withAuthSessionGeneration(
      normalizeNetworkError(error),
      requestOptions.authSessionGeneration,
    );

    if (shouldRetryWithRefreshedAccessToken(normalizedError, requestOptions)) {
      return retryWithRefreshedAccessToken(requestOptions, execute);
    }

    throw new FaithLogApiError(normalizedError);
  }
}

function shouldRetryWithRefreshedAccessToken(error: ApiError, options: RequestOptions) {
  const retryablePermissionDenied401 =
    error.kind === 'permissionDenied' &&
    error.status === 401 &&
    options.treatUnauthorizedAsPermissionDenied === true;

  return (
    (error.kind === 'sessionExpired' || retryablePermissionDenied401) &&
    Boolean(options.accessToken) &&
    options.skipAuthRefresh !== true &&
    options.authSessionGeneration !== undefined &&
    isAuthSessionGenerationCurrent(options.authSessionGeneration)
  );
}

async function retryWithRefreshedAccessToken<T>(
  options: RequestOptions,
  execute: RequestExecutor<T>,
) {
  const previousAccessToken = options.accessToken;
  const generation = options.authSessionGeneration;

  if (!previousAccessToken || generation === undefined) {
    throw new FaithLogApiError(createSessionExpiredError(generation));
  }

  assertAuthSessionRequestIsAllowed(generation);
  const tokens = await getTokensAfterSingleFlightRefresh(previousAccessToken, generation);
  assertAuthSessionRequestIsAllowed(generation);
  await options.onEffectiveAuthTokens?.(tokens);
  assertAuthSessionRequestIsAllowed(generation);

  try {
    const data = await execute({
      ...options,
      accessToken: tokens.accessToken,
      skipAuthRefresh: true,
    });
    assertAuthSessionRequestIsAllowed(generation);
    return data;
  } catch (retryError) {
    assertAuthSessionRequestIsAllowed(generation);
    const normalizedRetryError = withAuthSessionGeneration(
      normalizeNetworkError(retryError),
      generation,
    );

    if (normalizedRetryError.kind === 'sessionExpired') {
      await expireAuthSession(generation);
    }

    throw new FaithLogApiError(normalizedRetryError);
  }
}

async function getTokensAfterSingleFlightRefresh(
  previousAccessToken: string,
  generation: AuthSessionGeneration,
) {
  assertAuthSessionRequestIsAllowed(generation);
  const storedTokens = await getStoredAuthSession(generation);
  assertAuthSessionRequestIsAllowed(generation);

  if (storedTokens.generation !== generation) {
    throw new FaithLogApiError(createAuthSessionChangedError(generation));
  }

  if (
    storedTokens.accessToken &&
    storedTokens.refreshToken &&
    storedTokens.accessToken !== previousAccessToken
  ) {
    return {
      accessToken: storedTokens.accessToken,
      refreshToken: storedTokens.refreshToken,
    };
  }

  if (!storedTokens.refreshToken) {
    await expireAuthSession(generation);
    throw new FaithLogApiError(createSessionExpiredError(generation));
  }

  if (
    !authRefreshInFlight ||
    authRefreshInFlight.generation !== generation ||
    authRefreshInFlight.refreshToken !== storedTokens.refreshToken
  ) {
    const refreshToken = storedTokens.refreshToken;
    const promise = refreshAndPersistTokens(refreshToken, generation).finally(() => {
      if (authRefreshInFlight?.promise === promise) {
        authRefreshInFlight = null;
      }
    });
    authRefreshInFlight = {generation, promise, refreshToken};
  }

  const activeRefresh = authRefreshInFlight;

  if (!activeRefresh) {
    throw new FaithLogApiError(createAuthSessionChangedError(generation));
  }

  return activeRefresh.promise;
}

async function refreshAndPersistTokens(
  refreshToken: string,
  generation: AuthSessionGeneration,
) {
  try {
    const trackedRefresh = trackRefreshForLogout(
      generation,
      (onIssued) => refreshAuthToken(refreshToken, generation, onIssued),
    );
    const tokens = await trackedRefresh;
    assertAuthSessionRequestIsAllowed(generation);
    const saved = await saveTokens(tokens, generation);

    if (!saved) {
      throw new FaithLogApiError(createAuthSessionChangedError(generation));
    }

    assertAuthSessionRequestIsAllowed(generation);
    trackedRefresh.discardAfterCommit();

    return tokens;
  } catch (error) {
    if (
      hasRefreshLogoutHandoff(generation) &&
      isAuthSessionRequestAllowed(generation)
    ) {
      await expireAuthSession(generation);
      throw new FaithLogApiError(createSessionExpiredError(generation));
    }
    if (
      isAuthSessionChangedError(error) ||
      !isAuthSessionGenerationCurrent(generation)
    ) {
      throw new FaithLogApiError(createAuthSessionChangedError(generation));
    }

    const normalizedError = withAuthSessionGeneration(
      normalizeNetworkError(error),
      generation,
    );

    if (normalizedError.kind === 'sessionExpired') {
      await expireAuthSession(generation);
    }

    throw new FaithLogApiError(normalizedError);
  }
}

function createSessionExpiredError(generation?: AuthSessionGeneration): ApiError {
  return {
    kind: 'sessionExpired',
    status: 401,
    message: '다시 로그인한 뒤 이용해 주세요.',
    ...(generation === undefined ? {} : {authSessionGeneration: generation}),
  };
}

function createAuthSessionChangedError(generation: AuthSessionGeneration): ApiError {
  return {
    kind: 'error',
    code: 'AUTH_SESSION_CHANGED',
    message: '로그인 계정이 변경되어 이전 요청을 취소했습니다.',
    authSessionGeneration: generation,
  };
}

function isAuthSessionChangedError(error: unknown) {
  return (
    error instanceof FaithLogApiError &&
    error.detail.code === 'AUTH_SESSION_CHANGED'
  );
}

function assertRequestAuthSessionIsCurrent(
  options: RequestOptions,
  guardAuthSession: boolean,
) {
  if (!guardAuthSession || options.authSessionGeneration === undefined) {
    return;
  }

  if (!isAuthSessionRequestAllowed(options.authSessionGeneration)) {
    throw new FaithLogApiError(createAuthSessionChangedError(options.authSessionGeneration));
  }
}

async function assertRequestAccessTokenIsOwned(options: RequestOptions) {
  if (
    !options.accessToken ||
    options.allowAuthSessionChange === true ||
    options.allowUnstoredAccessToken === true
  ) {
    return;
  }

  const generation = options.authSessionGeneration;

  if (
    generation === undefined ||
    !(await isAccessTokenOwnedByAuthSession(options.accessToken, generation))
  ) {
    throw new FaithLogApiError(
      createAuthSessionChangedError(
        generation ?? getAuthSessionGeneration(),
      ),
    );
  }
}

function assertAuthSessionRequestIsAllowed(generation: AuthSessionGeneration) {
  if (!isAuthSessionRequestAllowed(generation)) {
    throw new FaithLogApiError(createAuthSessionChangedError(generation));
  }
}

function withAuthSessionGeneration(
  error: ApiError,
  generation: AuthSessionGeneration | undefined,
): ApiError {
  return generation === undefined
    ? error
    : {...error, authSessionGeneration: generation};
}

export function refreshAuthToken(
  refreshToken: string,
  authSessionGeneration?: AuthSessionGeneration,
  onIssuedTokens?: (tokens: TokenPair) => void,
) {
  return apiRequest<TokenPair>('/api/v1/auth/refresh', {
    ...(authSessionGeneration === undefined ? {} : {authSessionGeneration}),
    skipAuthRefresh: true,
    responseParser: parseTokenPair,
    ...(onIssuedTokens ? {onResponseParsed: (value: unknown) => onIssuedTokens(value as TokenPair)} : {}),
    method: 'POST',
    body: {refreshToken},
  });
}

export function refreshAuthTokenForCleanup(refreshToken: string) {
  return apiRequest<TokenPair>('/api/v1/auth/refresh', {
    allowAuthSessionChange: true,
    skipAuthRefresh: true,
    responseParser: parseTokenPair,
    method: 'POST',
    body: {refreshToken},
  });
}

export function signupUser(body: SignupRequest) {
  return apiRequest<SignupResponse>('/api/v1/auth/signup', {
    responseParser: parseSignupResponse,
    method: 'POST',
    body,
  });
}

export function loginUser(body: LoginRequest) {
  return apiRequest<LoginResponse>('/api/v1/auth/login', {
    responseParser: parseLoginResponse,
    method: 'POST',
    body,
  });
}

export function logoutUser(
  accessToken: string,
  body: LogoutRequest,
  onRequestDispatch?: RequestOptions['onRequestDispatch'],
) {
  return apiRequest<null>('/api/v1/auth/logout', {
    accessToken,
    allowAuthSessionChange: true,
    responseParser: parseNullResponse,
    skipAuthRefresh: true,
    timeoutMs: LOGOUT_REQUEST_TIMEOUT_MS,
    method: 'POST',
    body,
    ...(onRequestDispatch ? {onRequestDispatch} : {}),
  });
}

export function deleteMyAccount(accessToken: string, body: DeleteAccountRequest) {
  return apiRequest<DeleteAccountResponse>('/api/v1/users/me', {
    accessToken,
    exposeServerErrorMessage: true,
    responseParser: parseDeleteAccountResponse,
    method: 'DELETE',
    body,
  });
}

export function registerMyFcmToken(
  accessToken: string,
  body: FcmTokenRegisterRequest,
  authSessionGeneration?: AuthSessionGeneration,
  onEffectiveAuthTokens?: RequestOptions['onEffectiveAuthTokens'],
  onRequestDispatch?: RequestOptions['onRequestDispatch'],
) {
  return apiRequest<FcmTokenRegisterResponse>('/api/v1/users/me/fcm-tokens', {
    accessToken,
    ...(authSessionGeneration === undefined ? {} : {authSessionGeneration}),
    responseParser: parseFcmTokenRegisterResponse,
    method: 'POST',
    body,
    ...(onEffectiveAuthTokens ? {onEffectiveAuthTokens} : {}),
    ...(onRequestDispatch ? {onRequestDispatch} : {}),
  });
}

export function registerMyFcmTokenForCleanup(
  accessToken: string,
  body: FcmTokenRegisterRequest,
) {
  return apiRequest<FcmTokenRegisterResponse>('/api/v1/users/me/fcm-tokens', {
    accessToken,
    allowAuthSessionChange: true,
    allowUnstoredAccessToken: true,
    responseParser: parseFcmTokenRegisterResponse,
    skipAuthRefresh: true,
    method: 'POST',
    body,
  });
}

export function deactivateMyFcmToken(
  accessToken: string,
  tokenId: unknown,
  authSessionGeneration?: AuthSessionGeneration,
  onEffectiveAuthTokens?: RequestOptions['onEffectiveAuthTokens'],
  onRequestDispatch?: RequestOptions['onRequestDispatch'],
) {
  return apiRequest<null>(
    buildApiPath('users', 'me', 'fcm-tokens', toPositiveIntegerPathSegment(tokenId, 'tokenId')),
    {
      accessToken,
      ...(authSessionGeneration === undefined ? {} : {authSessionGeneration}),
      responseParser: parseNullResponse,
      method: 'DELETE',
      ...(onEffectiveAuthTokens ? {onEffectiveAuthTokens} : {}),
      ...(onRequestDispatch ? {onRequestDispatch} : {}),
    },
  );
}

export function deactivateMyFcmTokenForCleanup(
  accessToken: string,
  tokenId: unknown,
) {
  return apiRequest<null>(
    buildApiPath('users', 'me', 'fcm-tokens', toPositiveIntegerPathSegment(tokenId, 'tokenId')),
    {
      accessToken,
      allowAuthSessionChange: true,
      allowUnstoredAccessToken: true,
      responseParser: parseNullResponse,
      skipAuthRefresh: true,
      method: 'DELETE',
    },
  );
}

export function fetchCurrentUser(
  accessToken: string,
  authSessionGeneration?: AuthSessionGeneration,
) {
  return apiRequest<CurrentUser>('/api/v1/users/me', {
    accessToken,
    ...(authSessionGeneration === undefined
      ? {}
      : {authSessionGeneration, allowUnstoredAccessToken: true}),
    responseParser: parseCurrentUser,
  });
}

export function fetchMyCampuses(
  accessToken: string,
  authSessionGeneration?: AuthSessionGeneration,
) {
  return apiRequest<CampusMembershipSummary[]>('/api/v1/campuses/me', {
    accessToken,
    ...(authSessionGeneration === undefined
      ? {}
      : {authSessionGeneration, allowUnstoredAccessToken: true}),
    responseParser: parseCampusMembershipSummaries,
  });
}

export function createCampus(accessToken: string, body: CampusCreateRequest) {
  return apiRequest<CampusCreateResponse>('/api/v1/campuses', {
    accessToken,
    responseParser: parseCampusCreateResponse,
    method: 'POST',
    body,
  });
}

export function joinCampus(accessToken: string, body: CampusJoinRequest) {
  return apiRequest<CampusJoinResponse>('/api/v1/campuses/join', {
    accessToken,
    responseParser: parseCampusMembershipSummary,
    method: 'POST',
    body,
  });
}

export function fetchCampusDetail(accessToken: string, campusId: unknown) {
  return apiRequest<CampusDetail>(buildCampusPath(campusId), {
    accessToken,
    responseParser: parseCampusDetail,
  });
}

export function fetchWeeklyDevotionSummary(
  accessToken: string,
  campusId: unknown,
  weekStartDate: string,
) {
  return apiRequest<WeeklyDevotionSummary>(
    buildCampusPath(
      campusId,
      'devotions',
      'me',
      'weeks',
      toMondayDatePathSegment(weekStartDate, 'weekStartDate'),
    ),
    {accessToken, responseParser: parseWeeklyDevotionSummary},
  );
}

export function saveDevotionDailyCheck(
  accessToken: string,
  campusId: unknown,
  recordDate: string,
  body: DevotionDailyCheckRequest,
) {
  return apiRequest<DevotionDailyCheckSaveResponse>(
    buildCampusPath(
      campusId,
      'devotions',
      'me',
      'days',
      toDatePathSegment(recordDate, 'recordDate'),
    ),
    {
      accessToken,
      responseParser: parseDevotionDailyCheckSaveResponse,
      method: 'PUT',
      body,
    },
  );
}

export function saveWeeklyDevotion(
  accessToken: string,
  campusId: unknown,
  weekStartDate: string,
  body: WeeklyDevotionSaveRequest,
) {
  return apiRequest<WeeklyDevotionSummary>(
    buildCampusPath(
      campusId,
      'devotions',
      'me',
      'weeks',
      toMondayDatePathSegment(weekStartDate, 'weekStartDate'),
    ),
    {
      accessToken,
      responseParser: parseWeeklyDevotionSummary,
      method: 'PUT',
      body,
    },
  );
}

export function fetchDevotionMonthlySummary(
  accessToken: string,
  campusId: unknown,
  params: {year: number; month: number},
) {
  const query = toDevotionSummaryYearMonthQuery(params.year, params.month);

  return apiRequest<DevotionMonthlySummary>(
    `${buildCampusPath(campusId, 'devotions', 'me', 'monthly-summary')}?${query}`,
    {accessToken, responseParser: parseDevotionMonthlySummary},
  );
}

export function fetchChargeSummary(
  accessToken: string,
  campusId: unknown,
  params: {year: number; month: number},
) {
  const query = toSummaryYearMonthQuery(params.year, params.month);

  return apiRequest<ChargeSummary>(
    `${buildCampusPath(campusId, 'charges', 'me', 'summary')}?${query}`,
    {accessToken, responseParser: parseChargeSummary},
  );
}

export function fetchMyCharges(
  accessToken: string,
  campusId: unknown,
  params: {
    page?: number;
    paymentCategory?: PaymentCategory | 'ALL';
    size?: number;
    sort?: {direction: SortDirection; key: ChargeItemSortKey};
    status?: ChargeStatus | 'ALL';
  } = {},
) {
  const query = toSafeChargeListQuery(params);

  return apiRequest<ChargeList>(
    `${buildCampusPath(campusId, 'charges', 'me')}?${query}`,
    {accessToken, responseParser: parseChargeList},
  );
}

export function fetchPaymentAccounts(
  accessToken: string,
  campusId: unknown,
  params: PaymentAccountQueryParams = {},
) {
  const query = toPaymentAccountQuery(params);
  const path = buildCampusPath(campusId, 'payment-accounts');

  return apiRequest<PaymentAccount[]>(query ? `${path}?${query}` : path, {
    accessToken,
    responseParser: parsePaymentAccounts,
  });
}

export function fetchAdminPaymentAccounts(
  accessToken: string,
  campusId: unknown,
  params: PaymentAccountQueryParams = {},
) {
  const query = toPaymentAccountQuery(params);
  const path = buildAdminCampusPath(campusId, 'payment-accounts');

  return apiRequest<PaymentAccount[]>(query ? `${path}?${query}` : path, {
    accessToken,
    responseParser: parsePaymentAccounts,
  });
}

export function fetchMyDutyAssignment(accessToken: string, campusId: unknown) {
  return apiRequest<MyDutyAssignment>(
    buildCampusPath(campusId, 'duty-assignments', 'me'),
    {accessToken, responseParser: parseMyDutyAssignment},
  );
}

export function createAdminPaymentAccount(
  accessToken: string,
  campusId: unknown,
  body: PaymentAccountCreateRequest,
) {
  return apiRequest<AdminPaymentAccount>(
    buildAdminCampusPath(campusId, 'payment-accounts'),
    {
      accessToken,
      body: toPaymentAccountCreateRequest(body),
      exposeServerErrorMessage: true,
      responseParser: parseAdminPaymentAccount,
      method: 'POST',
      treatUnauthorizedAsPermissionDenied: true,
    },
  );
}

export function createCoffeeDutyPaymentAccount(
  accessToken: string,
  campusId: unknown,
  body: PaymentAccountCreateRequest,
) {
  return apiRequest<AdminPaymentAccount>(
    buildAdminCampusPath(campusId, 'payment-accounts'),
    {
      accessToken,
      body: toPaymentAccountCreateRequest(body),
      exposeServerErrorMessage: true,
      responseParser: parseAdminPaymentAccount,
      method: 'POST',
      treatUnauthorizedAsPermissionDenied: true,
    },
  );
}

export function deactivateAdminPaymentAccount(accessToken: string, accountId: unknown) {
  return apiRequest<AdminPaymentAccount>(
    buildApiPath(
      'admin',
      'payment-accounts',
      toPositiveIntegerPathSegment(accountId, 'accountId'),
      'deactivate',
    ),
    {
      accessToken,
      exposeServerErrorMessage: true,
      responseParser: parseAdminPaymentAccount,
      method: 'PATCH',
      treatUnauthorizedAsPermissionDenied: true,
    },
  );
}

export function activateAdminPaymentAccount(
  accessToken: string,
  campusId: unknown,
  accountId: unknown,
) {
  return apiRequest<AdminPaymentAccount>(
    buildAdminCampusPath(
      campusId,
      'payment-accounts',
      toPositiveIntegerPathSegment(accountId, 'accountId'),
      'activate',
    ),
    {
      accessToken,
      exposeServerErrorMessage: true,
      responseParser: parseAdminPaymentAccount,
      method: 'PATCH',
      treatUnauthorizedAsPermissionDenied: true,
    },
  );
}

export function deleteAdminPaymentAccount(
  accessToken: string,
  campusId: unknown,
  accountId: unknown,
) {
  return apiRequest<null>(
    buildAdminCampusPath(
      campusId,
      'payment-accounts',
      toPositiveIntegerPathSegment(accountId, 'accountId'),
    ),
    {
      accessToken,
      exposeServerErrorMessage: true,
      responseParser: parseNullResponse,
      method: 'DELETE',
      treatUnauthorizedAsPermissionDenied: true,
    },
  );
}

export function deactivateCoffeeDutyPaymentAccount(accessToken: string, accountId: unknown) {
  return apiRequest<AdminPaymentAccount>(
    buildApiPath(
      'admin',
      'payment-accounts',
      toPositiveIntegerPathSegment(accountId, 'accountId'),
      'deactivate',
    ),
    {
      accessToken,
      exposeServerErrorMessage: true,
      responseParser: parseAdminPaymentAccount,
      method: 'PATCH',
      treatUnauthorizedAsPermissionDenied: true,
    },
  );
}

export function fetchPenaltyRules(accessToken: string, campusId: unknown) {
  return apiRequest<PenaltyRule[]>(buildCampusPath(campusId, 'penalty-rules'), {
    accessToken,
    responseParser: parsePenaltyRules,
  });
}

export function createAdminPenaltyRule(
  accessToken: string,
  campusId: unknown,
  body: PenaltyRuleCreateRequest,
) {
  return apiRequest<PenaltyRule>(
    buildAdminCampusPath(campusId, 'penalty-rules'),
    {
      accessToken,
      body: toPenaltyRuleCreateRequest(body),
      responseParser: parsePenaltyRule,
      method: 'POST',
    },
  );
}

export function updateAdminPenaltyRule(
  accessToken: string,
  ruleId: unknown,
  body: PenaltyRuleUpdateRequest,
) {
  return apiRequest<PenaltyRule>(
    buildApiPath(
      'admin',
      'penalty-rules',
      toPositiveIntegerPathSegment(ruleId, 'ruleId'),
    ),
    {
      accessToken,
      body: toPenaltyRuleUpdateRequest(body),
      responseParser: parsePenaltyRule,
      method: 'PATCH',
    },
  );
}

export function markMyChargePaid(
  accessToken: string,
  campusId: unknown,
  chargeItemId: unknown,
  body?: MarkChargePaidRequest,
) {
  const paidAt = body?.paidAt;
  const requestBody =
    typeof paidAt === 'string' && paidAt.trim().length > 0
      ? {paidAt: paidAt.trim()}
      : undefined;

  return apiRequest<MarkChargePaidResponse>(
    buildCampusPath(
      campusId,
      'charges',
      'me',
      toPositiveIntegerPathSegment(chargeItemId, 'chargeItemId'),
      'paid',
    ),
    {
      accessToken,
      body: requestBody,
      responseParser: parseMarkChargePaidResponse,
      method: 'PATCH',
    },
  );
}

export function fetchCoffeeBrands(accessToken: string) {
  return apiRequest<CoffeeBrand[]>(buildApiPath('coffee-brands'), {
    accessToken,
    responseParser: parseCoffeeBrands,
  });
}

export function fetchCoffeeMenus(accessToken: string, brandId: unknown) {
  return apiRequest<CoffeeMenu[]>(
    buildApiPath('coffee-brands', toPositiveIntegerPathSegment(brandId, 'brandId'), 'menus'),
    {accessToken, responseParser: parseCoffeeMenus},
  );
}

export function fetchPolls(accessToken: string, campusId: unknown) {
  return apiRequest<PollSummary[]>(buildPollListPath(campusId), {
    accessToken,
    responseParser: parsePollSummaryList,
  });
}

export function fetchPollDetail(accessToken: string, campusId: unknown, pollId: unknown) {
  return apiRequest<PollDetail>(
    buildCampusPath(campusId, 'polls', toPositiveIntegerPathSegment(pollId, 'pollId')),
    {accessToken, responseParser: parsePollDetail},
  );
}

export function savePollResponse(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
  body: PollResponseSaveRequest,
) {
  return apiRequest<PollResponse>(
    buildCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'responses',
      'me',
    ),
    {
      accessToken,
      responseParser: parsePollResponse,
      method: 'PUT',
      body,
    },
  );
}

export function addUserPollOption(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
  body: PollOptionAddRequest,
) {
  return apiRequest<PollOption>(
    buildCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'options',
    ),
    {
      accessToken,
      body: toPollOptionAddRequest(body),
      exposeServerErrorMessage: true,
      responseParser: parsePollOption,
      method: 'POST',
    },
  );
}

export function fetchPollResults(accessToken: string, campusId: unknown, pollId: unknown) {
  return apiRequest<PollResults>(
    buildCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'results',
    ),
    {accessToken, responseParser: parsePollResults},
  );
}

export function fetchPollComments(accessToken: string, campusId: unknown, pollId: unknown) {
  return apiRequest<PollComment[]>(
    buildCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'comments',
    ),
    {accessToken, responseParser: parsePollComments},
  );
}

export function createPollComment(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
  body: PollCommentRequest,
) {
  return apiRequest<PollComment>(
    buildCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'comments',
    ),
    {
      accessToken,
      responseParser: parsePollComment,
      method: 'POST',
      body,
    },
  );
}

export function updatePollComment(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
  commentId: unknown,
  body: PollCommentRequest,
) {
  return apiRequest<PollComment>(
    buildCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'comments',
      toPositiveIntegerPathSegment(commentId, 'commentId'),
    ),
    {
      accessToken,
      responseParser: parsePollComment,
      method: 'PATCH',
      body,
    },
  );
}

export function deletePollComment(
  accessToken: string,
  campusId: unknown,
  pollId: unknown,
  commentId: unknown,
) {
  return apiRequest<null>(
    buildCampusPath(
      campusId,
      'polls',
      toPositiveIntegerPathSegment(pollId, 'pollId'),
      'comments',
      toPositiveIntegerPathSegment(commentId, 'commentId'),
    ),
    {
      accessToken,
      responseParser: parseNullResponse,
      method: 'DELETE',
    },
  );
}

export function fetchPrayerWeek(
  accessToken: string,
  campusId: unknown,
  weekStartDate: string,
) {
  return apiRequest<PrayerWeekSummary>(
    buildCampusPath(
      campusId,
      'prayers',
      'weeks',
      toMondayDatePathSegment(weekStartDate, 'weekStartDate'),
    ),
    {accessToken, responseParser: parsePrayerWeekSummary},
  );
}

export function savePrayerSubmissions(
  accessToken: string,
  campusId: unknown,
  weekStartDate: string,
  body: PrayerSubmissionSaveRequest,
) {
  return apiRequest<PrayerWeekSummary>(
    buildCampusPath(
      campusId,
      'prayers',
      'weeks',
      toMondayDatePathSegment(weekStartDate, 'weekStartDate'),
      'submissions',
    ),
    {
      accessToken,
      responseParser: parsePrayerWeekSummary,
      method: 'PUT',
      body,
    },
  );
}

export function createAdminPrayerSeason(
  accessToken: string,
  campusId: unknown,
  body: AdminPrayerSeasonCreateRequest,
) {
  return apiRequest<AdminPrayerSeason>(
    buildAdminCampusPath(campusId, 'prayer-seasons'),
    {
      accessToken,
      body: toAdminPrayerSeasonCreateRequest(body),
      responseParser: parseAdminPrayerSeason,
      method: 'POST',
    },
  );
}

export function closeAdminPrayerSeason(
  accessToken: string,
  seasonId: unknown,
  body: AdminPrayerSeasonCloseRequest,
) {
  return apiRequest<AdminPrayerSeason>(
    buildApiPath(
      'admin',
      'prayer-seasons',
      toPositiveIntegerPathSegment(seasonId, 'seasonId'),
      'close',
    ),
    {
      accessToken,
      body: toAdminPrayerSeasonCloseRequest(body),
      responseParser: parseAdminPrayerSeason,
      method: 'PATCH',
    },
  );
}

export function createAdminPrayerGroup(
  accessToken: string,
  seasonId: unknown,
  body: AdminPrayerGroupCreateRequest,
) {
  return apiRequest<AdminPrayerGroup>(
    buildApiPath(
      'admin',
      'prayer-seasons',
      toPositiveIntegerPathSegment(seasonId, 'seasonId'),
      'groups',
    ),
    {
      accessToken,
      body: toAdminPrayerGroupCreateRequest(body),
      responseParser: parseAdminPrayerGroup,
      method: 'POST',
    },
  );
}

export function updateAdminPrayerGroup(
  accessToken: string,
  groupId: unknown,
  body: AdminPrayerGroupUpdateRequest,
) {
  return apiRequest<AdminPrayerGroup>(
    buildApiPath(
      'admin',
      'prayer-groups',
      toPositiveIntegerPathSegment(groupId, 'groupId'),
    ),
    {
      accessToken,
      body: toAdminPrayerGroupUpdateRequest(body),
      responseParser: parseAdminPrayerGroup,
      method: 'PATCH',
    },
  );
}

export function replaceAdminPrayerGroupMembers(
  accessToken: string,
  groupId: unknown,
  body: AdminPrayerGroupMembersReplaceRequest,
) {
  return apiRequest<AdminPrayerGroup>(
    buildApiPath(
      'admin',
      'prayer-groups',
      toPositiveIntegerPathSegment(groupId, 'groupId'),
      'members',
    ),
    {
      accessToken,
      body: toAdminPrayerGroupMembersReplaceRequest(body),
      responseParser: parseAdminPrayerGroup,
      method: 'PUT',
    },
  );
}

export function fetchAdminDashboardSummary(
  accessToken: string,
  campusId: unknown,
  params: {weekStartDate?: string} = {},
) {
  const query = toAdminDashboardSummaryQuery(params);
  const path = buildAdminCampusPath(campusId, 'dashboard', 'summary');

  return apiRequest<AdminDashboardSummary>(query ? `${path}?${query}` : path, {
    accessToken,
    responseParser: parseAdminDashboardSummary,
  });
}

export function fetchAdminCampusMembers(accessToken: string, campusId: unknown) {
  return apiRequest<AdminCampusMember[]>(buildAdminCampusPath(campusId, 'members'), {
    accessToken,
    responseParser: parseAdminCampusMembers,
  });
}

export function fetchAdminCampusCharges(
  accessToken: string,
  campusId: unknown,
  params: AdminCampusChargeQueryParams = {},
) {
  const query = toSafeAdminCampusChargeQuery(params);

  return apiRequest<AdminCampusChargeSummary>(
    `${buildAdminCampusPath(campusId, 'charges')}?${query}`,
    {accessToken, responseParser: parseAdminCampusChargeSummary},
  );
}

export function fetchAdminCampusChargesForMyAccounts(
  accessToken: string,
  campusId: unknown,
  params: AdminCampusChargeQueryParams = {},
) {
  const query = toSafeAdminCampusChargeQuery(params);

  return apiRequest<AdminCampusChargeSummary>(
    `${buildAdminCampusPath(campusId, 'charges', 'my-accounts')}?${query}`,
    {accessToken, responseParser: parseAdminCampusChargeSummary},
  );
}

export function fetchAdminMemberCharges(
  accessToken: string,
  campusId: unknown,
  userId: unknown,
  params: {
    page?: number;
    paymentCategory?: PaymentCategory | 'ALL';
    size?: number;
    sort?: {direction: SortDirection; key: ChargeItemSortKey};
    status?: ChargeStatus | 'ALL';
  } = {},
) {
  const query = toSafeChargeListQuery(params);

  return apiRequest<AdminMemberChargeList>(
    `${buildAdminCampusPath(
      campusId,
      'members',
      toPositiveIntegerPathSegment(userId, 'userId'),
      'charges',
    )}?${query}`,
    {accessToken, responseParser: parseAdminMemberChargeList},
  );
}

export async function changeAdminChargeStatus(
  accessToken: string,
  chargeItemId: unknown,
  status: unknown,
  expected: {
    campusId: number;
    paymentCategory: PaymentCategory;
    userId: number;
  },
) {
  const body = buildAdminChargeStatusChangeRequest(status);
  const requestedChargeItemId = toPositiveIntegerPathSegment(
    chargeItemId,
    'chargeItemId',
  );

  if (
    body.status === 'PAID' &&
    !getAdminChargeContractCapabilities().paidStatusEnabled
  ) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'API_CONTRACT_PENDING',
      message:
        '관리자 납부 완료 API 계약이 아직 REST Docs로 확정되지 않아 요청을 보내지 않았습니다.',
    });
  }

  return apiRequest<AdminChargeStatusChangeResponse>(
    buildApiPath(
      'admin',
      'charges',
      requestedChargeItemId,
      'status',
    ),
    {
      accessToken,
      body,
      responseParser: (value) => {
        const response = parseAdminChargeStatusChangeResponse(value);

        if (
          response.id !== Number(requestedChargeItemId) ||
          response.campusId !== expected.campusId ||
          response.userId !== expected.userId ||
          response.paymentCategory !== expected.paymentCategory ||
          response.status !== body.status
        ) {
          throw new Error('Admin charge response identity mismatch.');
        }

        return response;
      },
      method: 'PATCH',
    },
  );
}

export function fetchAdminMissingDevotionMembers(
  accessToken: string,
  campusId: unknown,
  weekStartDate: string,
) {
  const query = toAdminMissingDevotionQuery(weekStartDate);

  return apiRequest<AdminMissingDevotionMember[]>(
    `${buildAdminCampusPath(campusId, 'devotions', 'missing')}?${query}`,
    {accessToken, responseParser: parseAdminMissingDevotionMembers},
  );
}

export function fetchAdminNotificationLogs(
  accessToken: string,
  campusId: unknown,
  params: {
    endDate?: string;
    notificationType?: AdminNotificationType | 'ALL';
    page?: number;
    requestId?: string;
    sendStatus?: AdminNotificationSendStatus | 'ALL';
    size?: number;
    sort?: {direction: SortDirection; key: NotificationLogSortKey};
    startDate?: string;
    targetId?: number;
    targetWeekStartDate?: string;
  } = {},
) {
  const query = toSafeAdminNotificationLogQuery(params);

  return apiRequest<AdminNotificationLogList>(
    `${buildAdminCampusPath(campusId, 'notification-logs')}?${query}`,
    {accessToken, responseParser: parseAdminNotificationLogList},
  );
}

export function sendAdminNotification(
  accessToken: string,
  campusId: unknown,
  body: AdminNotificationRequest,
) {
  return apiRequest<AdminNotificationResponse>(
    buildAdminCampusPath(campusId, 'notifications'),
    {
      accessToken,
      body: toAdminNotificationRequest(body),
      responseParser: parseAdminNotificationResponse,
      method: 'POST',
    },
  );
}

export function changeAdminCampusMemberRole(
  accessToken: string,
  campusId: unknown,
  campusMemberId: unknown,
  body: AdminCampusRoleChangeRequest,
) {
  return apiRequest<AdminCampusMember>(
    buildAdminCampusPath(
      campusId,
      'members',
      toPositiveIntegerPathSegment(campusMemberId, 'campusMemberId'),
      'campus-role',
    ),
    {
      accessToken,
      body,
      responseParser: parseAdminCampusMember,
      method: 'PATCH',
    },
  );
}

export function getServiceAdminUsers(
  accessToken: string,
  params: {
    email?: string;
    name?: string;
    page?: number;
    role?: UserRole | 'ALL';
    size?: number;
    sort?: {direction: SortDirection; key: ServiceAdminUserSortKey};
    userId?: number;
  } = {},
): Promise<ServiceAdminUserList> {
  const query = toSafeServiceAdminUserQuery(params);

  return apiRequest<ServiceAdminUserList>(`${buildApiPath('admin', 'users')}?${query}`, {
    accessToken,
    responseParser: parseServiceAdminUserList,
  });
}

export function getServiceAdminUser(
  accessToken: string,
  userId: unknown,
): Promise<ServiceAdminUserDetail> {
  return apiRequest<ServiceAdminUserDetail>(
    buildApiPath('admin', 'users', toPositiveIntegerPathSegment(userId, 'userId')),
    {accessToken, responseParser: parseServiceAdminUserDetail},
  );
}

export function updateServiceAdminUserRole(
  accessToken: string,
  userId: unknown,
  body: ServiceAdminUserRoleChangeRequest,
): Promise<ServiceAdminUserDetail> {
  return apiRequest<ServiceAdminUserDetail>(
    buildApiPath(
      'admin',
      'users',
      toPositiveIntegerPathSegment(userId, 'userId'),
      'role',
    ),
    {
      accessToken,
      body: toServiceAdminUserRoleChangeRequest(body),
      responseParser: parseServiceAdminUserDetail,
      method: 'PATCH',
    },
  );
}

export function getServiceAdminCampuses(
  accessToken: string,
  params: {
    name?: string;
    page?: number;
    region?: string;
    size?: number;
    sort?: {direction: SortDirection; key: ServiceAdminCampusSortKey};
    status?: ServiceAdminCampusOperationStatus | 'ALL';
  } = {},
): Promise<ServiceAdminCampusList> {
  const query = toSafeServiceAdminCampusQuery(params);

  return apiRequest<ServiceAdminCampusList>(`${buildApiPath('admin', 'campuses')}?${query}`, {
    accessToken,
    responseParser: parseServiceAdminCampusList,
  });
}

export function updateCampus(
  accessToken: string,
  campusId: unknown,
  body: CampusUpdateRequest,
): Promise<CampusDetail> {
  return apiRequest<CampusDetail>(buildCampusPath(campusId), {
    accessToken,
    body: toCampusUpdateRequest(body),
    responseParser: parseCampusDetail,
    method: 'PATCH',
  });
}

export function addServiceAdminCampusMember(
  accessToken: string,
  campusId: unknown,
  body: ServiceAdminCampusMemberAddRequest,
): Promise<ServiceAdminCampusMemberAddResponse> {
  return apiRequest<ServiceAdminCampusMemberAddResponse>(
    buildAdminCampusPath(campusId, 'members'),
    {
      accessToken,
      body: toServiceAdminCampusMemberAddRequest(body),
      responseParser: parseServiceAdminCampusMemberAddResponse,
      method: 'POST',
    },
  );
}

export function fetchDutyAssignments(accessToken: string, campusId: unknown) {
  return apiRequest<DutyAssignment[]>(
    buildAdminCampusPath(campusId, 'duty-assignments'),
    {accessToken, responseParser: parseDutyAssignments},
  );
}

export function assignCoffeeDuty(
  accessToken: string,
  campusId: unknown,
  body: CoffeeDutyAssignRequest,
) {
  return apiRequest<DutyAssignment>(
    buildAdminCampusPath(campusId, 'duty-assignments', 'coffee'),
    {
      accessToken,
      body,
      responseParser: parseDutyAssignment,
      method: 'PUT',
    },
  );
}

export function revokeCoffeeDuty(
  accessToken: string,
  campusId: unknown,
  assignmentId: unknown,
) {
  return apiRequest<null>(
    buildAdminCampusPath(
      campusId,
      'duty-assignments',
      'coffee',
      toPositiveIntegerPathSegment(assignmentId, 'assignmentId'),
    ),
    {
      accessToken,
      responseParser: parseNullResponse,
      method: 'DELETE',
    },
  );
}

export function deleteCampusMember(
  accessToken: string,
  campusId: unknown,
  membershipId: unknown,
) {
  return apiRequest<null>(
    buildCampusPath(
      campusId,
      'members',
      toPositiveIntegerPathSegment(membershipId, 'membershipId'),
    ),
    {
      accessToken,
      responseParser: parseNullResponse,
      method: 'DELETE',
    },
  );
}
