import type {
  ApiEnvelope,
  ApiError,
  AdminCampusChargeSummary,
  AdminCampusMember,
  AdminCampusRoleChangeRequest,
  AdminDashboardSummary,
  AdminMemberChargeList,
  AdminMissingDevotionMember,
  AdminNotificationRequest,
  AdminNotificationResponse,
  AdminPaymentAccount,
  AdminWritableChargeStatus,
  AdminChargeStatusChangeResponse,
  CampusCreateRequest,
  CampusCreateResponse,
  CampusDetail,
  CampusJoinRequest,
  CampusJoinResponse,
  CampusMembershipSummary,
  ChargeList,
  ChargeStatus,
  ChargeSummary,
  CoffeeDutyAssignRequest,
  CoffeeBrand,
  CoffeeMenu,
  CurrentUser,
  DevotionDailyCheckRequest,
  DevotionDailyCheckSaveResponse,
  DutyAssignment,
  DevotionMonthlySummary,
  FcmTokenRegisterRequest,
  FcmTokenRegisterResponse,
  PollComment,
  PollCommentRequest,
  PollDetail,
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
  PaymentAccount,
  PaymentAccountCreateRequest,
  PaymentCategory,
  PenaltyCalculationType,
  PenaltyRule,
  PenaltyRuleCreateRequest,
  PenaltyRuleType,
  PenaltyRuleUpdateRequest,
  SignupRequest,
  SignupResponse,
  TokenPair,
  WeeklyDevotionSaveRequest,
  WeeklyDevotionSummary,
} from './types';

type RequestOptions = {
  accessToken?: string;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  body?: unknown;
};

export class FaithLogApiError extends Error {
  readonly detail: ApiError;

  constructor(detail: ApiError) {
    super(detail.message);
    this.detail = detail;
  }
}

export function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (!configured) {
    throw new FaithLogApiError({
      kind: 'error',
      message: 'API 서버 설정이 필요합니다.',
    });
  }

  try {
    const url = new URL(configured);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new FaithLogApiError({
      kind: 'error',
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

type ChargeSortKey = 'createdAt' | 'dueDate' | 'amount';
type SortDirection = 'asc' | 'desc';

const chargeStatuses = ['UNPAID', 'PAID', 'WAIVED', 'CANCELED'] as const;
const paymentCategories = ['PENALTY', 'COFFEE'] as const;
const penaltyRuleTypes = ['QUIET_TIME', 'PRAYER', 'BIBLE_READING', 'SATURDAY_LATE'] as const;
const penaltyCalculationTypes = ['MISSING_COUNT', 'LATE_MINUTE'] as const;
const chargeSortKeys = ['createdAt', 'dueDate', 'amount'] as const;
const sortDirections = ['asc', 'desc'] as const;

function isPaymentCategory(value: unknown): value is PaymentCategory {
  return paymentCategories.includes(value as PaymentCategory);
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

function isChargeSortKey(value: unknown): value is ChargeSortKey {
  return chargeSortKeys.includes(value as ChargeSortKey);
}

function isSortDirection(value: unknown): value is SortDirection {
  return sortDirections.includes(value as SortDirection);
}

function toSafeChargeListQuery(params: {
  page?: number;
  paymentCategory?: PaymentCategory | 'ALL';
  size?: number;
  sort?: {direction: SortDirection; key: ChargeSortKey};
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
  const sortKey = isChargeSortKey(params.sort?.key) ? params.sort.key : 'createdAt';
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

function toSafeAdminCampusChargeQuery(params: {
  keyword?: string;
  page?: number;
  paymentCategory?: PaymentCategory | 'ALL';
  size?: number;
  sort?: {direction: SortDirection; key: ChargeSortKey};
  status?: ChargeStatus | 'ALL';
  userId?: number;
}) {
  const query = new URLSearchParams(toSafeChargeListQuery(params));
  const keyword = typeof params.keyword === 'string' ? params.keyword.trim().slice(0, 80) : '';

  if (keyword) {
    query.set('keyword', keyword);
  }

  if (params.userId !== undefined) {
    query.set('userId', toPositiveIntegerPathSegment(params.userId, 'userId'));
  }

  return query.toString();
}

function toAdminWritableChargeStatus(value: unknown): AdminWritableChargeStatus {
  if (value === 'UNPAID' || value === 'WAIVED' || value === 'CANCELED') {
    return value;
  }

  throw new FaithLogApiError({
    kind: 'error',
    message: '관리자는 PAID로 직접 변경할 수 없습니다.',
  });
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
  if (!isPaymentCategory(body.accountType)) {
    throw new FaithLogApiError({
      kind: 'error',
      message: '계좌 유형이 올바르지 않습니다.',
    });
  }

  return {
    accountType: body.accountType,
    nickname: toRequiredString(body.nickname, '계좌 별칭'),
    bankName: toRequiredString(body.bankName, '은행명'),
    accountNumber: toRequiredString(body.accountNumber, '계좌번호'),
    accountHolder: toRequiredString(body.accountHolder, '예금주'),
    ownerUserId: toNullablePositiveInteger(body.ownerUserId, 'ownerUserId'),
  };
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

  if (!notificationType) {
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

function normalizeApiError(status: number | undefined, envelope?: Partial<ApiEnvelope<unknown>>): ApiError {
  const message =
    typeof envelope?.message === 'string' && envelope.message.length > 0
      ? envelope.message
      : '요청을 처리하지 못했습니다.';
  const code = typeof envelope?.code === 'string' ? envelope.code : undefined;

  if (status === 401) {
    return compactApiError({kind: 'sessionExpired', status, code, message});
  }

  if (status === 403) {
    return compactApiError({kind: 'permissionDenied', status, code, message});
  }

  if (status === 409) {
    return compactApiError({kind: 'conflict', status, code, message});
  }

  return compactApiError({kind: 'error', status, code, message});
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

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
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
      throw new FaithLogApiError(normalizeApiError(response.status));
    }

    throw new FaithLogApiError({
      kind: 'error',
      status: response.status,
      message: '서버 응답 형식이 올바르지 않습니다.',
    });
  }

  if (!response.ok || !payload.success) {
    throw new FaithLogApiError(normalizeApiError(response.status, payload));
  }

  return payload;
}

export async function apiRequest<T>(
  path: string,
  {accessToken, method = 'GET', body}: RequestOptions = {},
): Promise<T> {
  try {
    const init: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {}),
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    };
    const response = await fetch(buildApiUrl(path), init);
    const envelope = await parseEnvelope<T>(response);

    return envelope.data as T;
  } catch (error) {
    throw new FaithLogApiError(normalizeNetworkError(error));
  }
}

export function refreshAuthToken(refreshToken: string) {
  return apiRequest<TokenPair>('/api/v1/auth/refresh', {
    method: 'POST',
    body: {refreshToken},
  });
}

export function signupUser(body: SignupRequest) {
  return apiRequest<SignupResponse>('/api/v1/auth/signup', {
    method: 'POST',
    body,
  });
}

export function loginUser(body: LoginRequest) {
  return apiRequest<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body,
  });
}

export function logoutUser(accessToken: string, body: LogoutRequest) {
  return apiRequest<null>('/api/v1/auth/logout', {
    accessToken,
    method: 'POST',
    body,
  });
}

export function registerMyFcmToken(accessToken: string, body: FcmTokenRegisterRequest) {
  return apiRequest<FcmTokenRegisterResponse>('/api/v1/users/me/fcm-tokens', {
    accessToken,
    method: 'POST',
    body,
  });
}

export function deactivateMyFcmToken(accessToken: string, tokenId: unknown) {
  return apiRequest<null>(
    buildApiPath('users', 'me', 'fcm-tokens', toPositiveIntegerPathSegment(tokenId, 'tokenId')),
    {
      accessToken,
      method: 'DELETE',
    },
  );
}

export function fetchCurrentUser(accessToken: string) {
  return apiRequest<CurrentUser>('/api/v1/users/me', {accessToken});
}

export function fetchMyCampuses(accessToken: string) {
  return apiRequest<CampusMembershipSummary[]>('/api/v1/campuses/me', {accessToken});
}

export function createCampus(accessToken: string, body: CampusCreateRequest) {
  return apiRequest<CampusCreateResponse>('/api/v1/campuses', {
    accessToken,
    method: 'POST',
    body,
  });
}

export function joinCampus(accessToken: string, body: CampusJoinRequest) {
  return apiRequest<CampusJoinResponse>('/api/v1/campuses/join', {
    accessToken,
    method: 'POST',
    body,
  });
}

export function fetchCampusDetail(accessToken: string, campusId: unknown) {
  return apiRequest<CampusDetail>(buildCampusPath(campusId), {accessToken});
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
    {accessToken},
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
    {accessToken},
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
    {accessToken},
  );
}

export function fetchMyCharges(
  accessToken: string,
  campusId: unknown,
  params: {
    page?: number;
    paymentCategory?: PaymentCategory | 'ALL';
    size?: number;
    sort?: {direction: SortDirection; key: ChargeSortKey};
    status?: ChargeStatus | 'ALL';
  } = {},
) {
  const query = toSafeChargeListQuery(params);

  return apiRequest<ChargeList>(
    `${buildCampusPath(campusId, 'charges', 'me')}?${query}`,
    {accessToken},
  );
}

export function fetchPaymentAccounts(accessToken: string, campusId: unknown) {
  return apiRequest<PaymentAccount[]>(buildCampusPath(campusId, 'payment-accounts'), {
    accessToken,
  });
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
      method: 'POST',
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
      method: 'PATCH',
    },
  );
}

export function fetchPenaltyRules(accessToken: string, campusId: unknown) {
  return apiRequest<PenaltyRule[]>(buildCampusPath(campusId, 'penalty-rules'), {
    accessToken,
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
      method: 'PATCH',
    },
  );
}

export function fetchCoffeeBrands(accessToken: string) {
  return apiRequest<CoffeeBrand[]>(buildApiPath('coffee-brands'), {accessToken});
}

export function fetchCoffeeMenus(accessToken: string, brandId: unknown) {
  return apiRequest<CoffeeMenu[]>(
    buildApiPath('coffee-brands', toPositiveIntegerPathSegment(brandId, 'brandId'), 'menus'),
    {accessToken},
  );
}

export function fetchPolls(accessToken: string, campusId: unknown) {
  return apiRequest<PollSummary[]>(buildCampusPath(campusId, 'polls'), {accessToken});
}

export function fetchPollDetail(accessToken: string, campusId: unknown, pollId: unknown) {
  return apiRequest<PollDetail>(
    buildCampusPath(campusId, 'polls', toPositiveIntegerPathSegment(pollId, 'pollId')),
    {accessToken},
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
      method: 'PUT',
      body,
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
    {accessToken},
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
    {accessToken},
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
    {accessToken},
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
      method: 'PUT',
      body,
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

  return apiRequest<AdminDashboardSummary>(query ? `${path}?${query}` : path, {accessToken});
}

export function fetchAdminCampusMembers(accessToken: string, campusId: unknown) {
  return apiRequest<AdminCampusMember[]>(buildAdminCampusPath(campusId, 'members'), {
    accessToken,
  });
}

export function fetchAdminCampusCharges(
  accessToken: string,
  campusId: unknown,
  params: {
    keyword?: string;
    page?: number;
    paymentCategory?: PaymentCategory | 'ALL';
    size?: number;
    sort?: {direction: SortDirection; key: ChargeSortKey};
    status?: ChargeStatus | 'ALL';
    userId?: number;
  } = {},
) {
  const query = toSafeAdminCampusChargeQuery(params);

  return apiRequest<AdminCampusChargeSummary>(
    `${buildAdminCampusPath(campusId, 'charges')}?${query}`,
    {accessToken},
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
    sort?: {direction: SortDirection; key: ChargeSortKey};
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
    {accessToken},
  );
}

export function changeAdminChargeStatus(
  accessToken: string,
  chargeItemId: unknown,
  status: unknown,
) {
  return apiRequest<AdminChargeStatusChangeResponse>(
    buildApiPath(
      'admin',
      'charges',
      toPositiveIntegerPathSegment(chargeItemId, 'chargeItemId'),
      'status',
    ),
    {
      accessToken,
      body: {status: toAdminWritableChargeStatus(status)},
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
    {accessToken},
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
      method: 'PATCH',
    },
  );
}

export function fetchDutyAssignments(accessToken: string, campusId: unknown) {
  return apiRequest<DutyAssignment[]>(
    buildAdminCampusPath(campusId, 'duty-assignments'),
    {accessToken},
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
      method: 'DELETE',
    },
  );
}
