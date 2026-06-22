import type {
  ApiEnvelope,
  ApiError,
  CampusMembershipSummary,
  CurrentUser,
  TokenPair,
} from './types';

const DEFAULT_BASE_URL = 'https://api.example.com';

type RequestOptions = {
  accessToken?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
};

export class FaithLogApiError extends Error {
  readonly detail: ApiError;

  constructor(detail: ApiError) {
    super(detail.message);
    this.detail = detail;
  }
}

function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL;
  return configured.replace(/\/+$/, '');
}

function buildApiUrl(path: string) {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/api/v1/')
    ? path
    : `/api/v1/${path.replace(/^\/+/, '')}`;

  return `${baseUrl}${normalizedPath}`;
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

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const payload = (await response.json().catch(() => null)) as Partial<ApiEnvelope<T>> | null;

  if (!payload || typeof payload.success !== 'boolean') {
    throw new FaithLogApiError({
      kind: 'error',
      status: response.status,
      message: '서버 응답 형식이 올바르지 않습니다.',
    });
  }

  if (!response.ok || !payload.success) {
    throw new FaithLogApiError(normalizeApiError(response.status, payload));
  }

  return payload as ApiEnvelope<T>;
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

    return envelope.data;
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

export function fetchCurrentUser(accessToken: string) {
  return apiRequest<CurrentUser>('/api/v1/users/me', {accessToken});
}

export function fetchMyCampuses(accessToken: string) {
  return apiRequest<CampusMembershipSummary[]>('/api/v1/campuses/me', {accessToken});
}
