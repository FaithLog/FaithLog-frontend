import {apiRequest, FaithLogApiError, isMockModeEnabled} from '../api/client';
import {
  parseClosedMealPollDetail,
  parseCreatedMealPollDetail,
  parseMealChargeResult,
  parseMealDutyAssignment,
  parseMealPaymentAccountResponse,
  parseMealPaymentAccounts,
  parseMealPollDetail,
  parseMealPollList,
  parseMealSettlement,
  parseMyMealDutyAssignment,
  parseNull,
} from './mealRuntimeValidation';
import type {
  MealChargeRequest,
  MealChargeResult,
  MealDutyAssignment,
  MealDutyAssignRequest,
  MealPaymentAccount,
  MealPaymentAccountCreateRequest,
  MealPollCreateRequest,
  MealPollDetail,
  MealPollList,
  MealPollStatus,
  MealSettlement,
} from './mealTypes';

type MealRequestOptions<T> = {
  accessToken: string;
  body?: unknown;
  exposeServerErrorMessage?: boolean;
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST';
  responseParser: (value: unknown) => T;
};

export type MealRequestDispatcher = <T>(
  path: string,
  options: MealRequestOptions<T>,
) => Promise<T>;

type MealApiDependencies = {
  isMockMode?: () => boolean;
  request?: MealRequestDispatcher;
};

export type MealPollListQuery = {
  status?: MealPollStatus;
  page?: number;
  size?: number;
  sort?: 'endsAt,asc' | 'endsAt,desc' | 'startsAt,asc' | 'startsAt,desc';
};

export type MealApi = {
  getMyDuty(accessToken: string, campusId: unknown): Promise<MealDutyAssignment>;
  assignDuty(
    accessToken: string,
    campusId: unknown,
    body: MealDutyAssignRequest,
  ): Promise<MealDutyAssignment>;
  revokeDuty(
    accessToken: string,
    campusId: unknown,
    assignmentId: unknown,
  ): Promise<null>;
  getMyPaymentAccounts(
    accessToken: string,
    campusId: unknown,
    includeInactive?: boolean,
  ): Promise<MealPaymentAccount[]>;
  createPaymentAccount(
    accessToken: string,
    campusId: unknown,
    body: MealPaymentAccountCreateRequest,
  ): Promise<MealPaymentAccount>;
  deactivatePaymentAccount(
    accessToken: string,
    campusId: unknown,
    accountId: unknown,
  ): Promise<MealPaymentAccount>;
  listPolls(
    accessToken: string,
    campusId: unknown,
    query?: MealPollListQuery,
  ): Promise<MealPollList>;
  createPoll(
    accessToken: string,
    campusId: unknown,
    body: MealPollCreateRequest,
  ): Promise<MealPollDetail>;
  getPollDetail(
    accessToken: string,
    campusId: unknown,
    pollId: unknown,
  ): Promise<MealPollDetail>;
  closePoll(
    accessToken: string,
    campusId: unknown,
    pollId: unknown,
  ): Promise<MealPollDetail>;
  createCharges(
    accessToken: string,
    campusId: unknown,
    pollId: unknown,
    body: MealChargeRequest,
  ): Promise<MealChargeResult>;
  getMySettlement(accessToken: string, campusId: unknown): Promise<MealSettlement>;
};

export function createMealApi(dependencies: MealApiDependencies = {}): MealApi {
  const request: MealRequestDispatcher = dependencies.request ?? (<T>(path: string, options: MealRequestOptions<T>) =>
    apiRequest<T>(path, options));
  const isMockMode = dependencies.isMockMode ?? isMockModeEnabled;

  const dispatch = async <T>(path: string, options: MealRequestOptions<T>) => {
    requireConfirmedMealContract(isMockMode);
    return request(path, options);
  };

  return {
    getMyDuty(accessToken, campusId) {
      return dispatch(
        campusPath(campusId, 'duty-assignments', 'me', 'meal'),
        requestOptions(accessToken, parseMyMealDutyAssignment),
      );
    },
    assignDuty(accessToken, campusId, body) {
      return dispatch(
        adminCampusPath(campusId, 'duty-assignments', 'meal'),
        requestOptions(accessToken, parseMealDutyAssignment, 'POST', {
          body: {userId: positiveId(body.userId, 'userId')},
        }),
      );
    },
    revokeDuty(accessToken, campusId, assignmentId) {
      return dispatch(
        adminCampusPath(
          campusId,
          'duty-assignments',
          'meal',
          positiveId(assignmentId, 'assignmentId'),
        ),
        requestOptions(accessToken, parseNull, 'DELETE'),
      );
    },
    getMyPaymentAccounts(accessToken, campusId, includeInactive = true) {
      const path = `${campusPath(campusId, 'meal', 'payment-accounts', 'me')}?${new URLSearchParams({
        includeInactive: String(includeInactive),
      })}`;
      return dispatch(path, requestOptions(accessToken, parseMealPaymentAccounts));
    },
    createPaymentAccount(accessToken, campusId, body) {
      return dispatch(
        campusPath(campusId, 'meal', 'payment-accounts'),
        requestOptions(accessToken, parseMealPaymentAccountResponse, 'POST', {
          body: sanitizePaymentAccountRequest(body),
          exposeServerErrorMessage: true,
        }),
      );
    },
    deactivatePaymentAccount(accessToken, campusId, accountId) {
      return dispatch(
        campusPath(
          campusId,
          'meal',
          'payment-accounts',
          positiveId(accountId, 'paymentAccountId'),
          'deactivate',
        ),
        requestOptions(accessToken, parseMealPaymentAccountResponse, 'PATCH'),
      );
    },
    listPolls(accessToken, campusId, query = {}) {
      const params = new URLSearchParams();
      if (query.status) params.set('status', query.status);
      params.set('page', String(nonNegativeInteger(query.page ?? 0, 'page')));
      params.set('size', String(positiveId(query.size ?? 20, 'size')));
      params.set('sort', query.sort ?? 'endsAt,desc');
      return dispatch(
        `${campusPath(campusId, 'meal', 'polls')}?${params}`,
        requestOptions(accessToken, parseMealPollList),
      );
    },
    createPoll(accessToken, campusId, body) {
      return dispatch(
        campusPath(campusId, 'meal', 'polls'),
        requestOptions(accessToken, parseCreatedMealPollDetail, 'POST', {
          body: sanitizePollCreateRequest(body),
          exposeServerErrorMessage: true,
        }),
      );
    },
    getPollDetail(accessToken, campusId, pollId) {
      return dispatch(
        campusPath(campusId, 'meal', 'polls', positiveId(pollId, 'pollId')),
        requestOptions(accessToken, parseMealPollDetail),
      );
    },
    closePoll(accessToken, campusId, pollId) {
      return dispatch(
        campusPath(campusId, 'meal', 'polls', positiveId(pollId, 'pollId'), 'close'),
        requestOptions(accessToken, parseClosedMealPollDetail, 'PATCH'),
      );
    },
    createCharges(accessToken, campusId, pollId, body) {
      return dispatch(
        campusPath(campusId, 'meal', 'polls', positiveId(pollId, 'pollId'), 'charges'),
        requestOptions(accessToken, parseMealChargeResult, 'POST', {
          body,
          exposeServerErrorMessage: true,
        }),
      );
    },
    getMySettlement(accessToken, campusId) {
      return dispatch(
        campusPath(campusId, 'meal', 'charges', 'my-accounts'),
        requestOptions(accessToken, parseMealSettlement),
      );
    },
  };
}

export const mealApi = createMealApi();

function requireConfirmedMealContract(isMockMode: () => boolean) {
  if (isMockMode()) return;

  throw new FaithLogApiError({
    kind: 'error',
    code: 'API_CONTRACT_PENDING',
    message: 'MEAL API 계약이 REST Docs로 확정될 때까지 mock 모드에서만 사용할 수 있습니다.',
  });
}

function requestOptions<T>(
  accessToken: string,
  responseParser: (value: unknown) => T,
  method: MealRequestOptions<T>['method'] = 'GET',
  patch: Pick<MealRequestOptions<T>, 'body' | 'exposeServerErrorMessage'> = {},
): MealRequestOptions<T> {
  return {accessToken, method, responseParser, ...patch};
}

function positiveId(value: unknown, label: string) {
  const numeric = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new FaithLogApiError({kind: 'error', status: 400, message: `${label} 값이 올바르지 않습니다.`});
  }
  return numeric;
}

function nonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new FaithLogApiError({kind: 'error', status: 400, message: `${label} 값이 올바르지 않습니다.`});
  }
  return value;
}

function encode(segment: string | number) {
  return encodeURIComponent(String(segment));
}

function campusPath(campusId: unknown, ...segments: Array<string | number>) {
  return `/api/v1/campuses/${positiveId(campusId, 'campusId')}/${segments.map(encode).join('/')}`;
}

function adminCampusPath(campusId: unknown, ...segments: Array<string | number>) {
  return `/api/v1/admin/campuses/${positiveId(campusId, 'campusId')}/${segments.map(encode).join('/')}`;
}

function sanitizePaymentAccountRequest(
  body: MealPaymentAccountCreateRequest,
): MealPaymentAccountCreateRequest {
  return {
    nickname: requireText(body.nickname, '계좌 이름'),
    bankName: requireText(body.bankName, '은행명'),
    accountNumber: requireText(body.accountNumber, '계좌번호'),
    accountHolder: requireText(body.accountHolder, '예금주'),
  };
}

function sanitizePollCreateRequest(body: MealPollCreateRequest): MealPollCreateRequest {
  return {
    title: requireText(body.title, '제목'),
    description: body.description.trim(),
    endsAt: body.endsAt,
    options: body.options.map((option) => ({content: requireText(option.content, '선택지')})),
    allowUserOptionAdd: body.allowUserOptionAdd,
  };
}

function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FaithLogApiError({kind: 'error', status: 400, message: `${label}을(를) 입력해 주세요.`});
  }
  return value.trim();
}
