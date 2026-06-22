import type {
  ApiEnvelope,
  ApiError,
  CampusCreateRequest,
  CampusCreateResponse,
  CampusDetail,
  CampusJoinRequest,
  CampusJoinResponse,
  CampusMembershipSummary,
  ChargeSummary,
  CoffeeBrand,
  CoffeeMenu,
  CurrentUser,
  DevotionDailyCheckRequest,
  DevotionDailyCheckSaveResponse,
  DevotionMonthlySummary,
  PollComment,
  PollCommentRequest,
  PollDetail,
  PollResponse,
  PollResponseSaveRequest,
  PollResults,
  PollSummary,
  PrayerWeekSummary,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
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
