import {apiRequest, FaithLogApiError} from '../api/client';
import {DEFAULT_PAGE_SIZE} from '../api/pagination';
import {
  parseClosedMealPollDetailForContext,
  parseCreatedMealPollDetailForContext,
  parseMealChargeResultForContext,
  parseMealDutyAssignmentForContext,
  parseMealPaymentAccountForContext,
  parseMealPaymentAccountsForContext,
  parseMealPollDetailForContext,
  parseMealPollListForContext,
  parseMealSettlementForContext,
  parseMyMealDutyAssignmentForContext,
  parseNull,
} from './mealRuntimeValidation';
import type {
  MealChargeRequest,
  MealChargeResult,
  MealDutyAssignment,
  MealMyDutyAssignment,
  MealDutyAssignRequest,
  MealPaymentAccount,
  MealPaymentAccountCreateRequest,
  MealPollCreateRequest,
  MealPollDetail,
  MealPollList,
  MealPollMutationResponse,
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
  includeArchived?: boolean;
  status?: MealPollStatus;
  page?: number;
  size?: number;
  sort?: 'createdAt,desc' | 'endsAt,asc' | 'endsAt,desc' | 'startsAt,asc' | 'startsAt,desc';
};

export type MealSettlementQuery = {
  includeArchived?: boolean;
  page?: number;
  size?: number;
};

export type MealApi = {
  getMyDuty(accessToken: string, campusId: unknown, currentUserId: unknown): Promise<MealMyDutyAssignment>;
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
    currentUserId: unknown,
    includeInactive?: boolean,
  ): Promise<MealPaymentAccount[]>;
  createPaymentAccount(
    accessToken: string,
    campusId: unknown,
    currentUserId: unknown,
    body: MealPaymentAccountCreateRequest,
  ): Promise<MealPaymentAccount>;
  deactivatePaymentAccount(
    accessToken: string,
    campusId: unknown,
    currentUserId: unknown,
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
  ): Promise<MealPollMutationResponse>;
  getPollDetail(
    accessToken: string,
    campusId: unknown,
    pollId: unknown,
  ): Promise<MealPollDetail>;
  closePoll(
    accessToken: string,
    campusId: unknown,
    pollId: unknown,
  ): Promise<MealPollMutationResponse>;
  createCharges(
    accessToken: string,
    campusId: unknown,
    pollId: unknown,
    body: MealChargeRequest,
  ): Promise<MealChargeResult>;
  getMySettlement(accessToken: string, campusId: unknown, currentUserId: unknown, query?: MealSettlementQuery): Promise<MealSettlement>;
};

export function createMealApi(dependencies: MealApiDependencies = {}): MealApi {
  const request: MealRequestDispatcher = dependencies.request ?? (<T>(path: string, options: MealRequestOptions<T>) =>
    apiRequest<T>(path, options));
  const dispatch = request;

  return {
    getMyDuty(accessToken, campusId, currentUserId) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedUserId = positiveId(currentUserId, 'currentUserId');
      return dispatch(
        campusPath(expectedCampusId, 'duty-assignments', 'me', 'meal'),
        requestOptions(accessToken, (value) => parseMyMealDutyAssignmentForContext(value, {
          campusId: expectedCampusId,
          userId: expectedUserId,
        })),
      );
    },
    assignDuty(accessToken, campusId, body) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedUserId = positiveId(body.userId, 'userId');
      return dispatch(
        adminCampusPath(expectedCampusId, 'duty-assignments', 'meal'),
        requestOptions(accessToken, (value) => parseMealDutyAssignmentForContext(value, {
          campusId: expectedCampusId,
          userId: expectedUserId,
        }), 'POST', {
          body: {userId: expectedUserId},
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
    getMyPaymentAccounts(accessToken, campusId, currentUserId, includeInactive = true) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedOwnerUserId = positiveId(currentUserId, 'currentUserId');
      const path = `${campusPath(expectedCampusId, 'meal', 'payment-accounts', 'me')}?${new URLSearchParams({
        includeInactive: String(includeInactive),
      })}`;
      return dispatch(path, requestOptions(accessToken, (value) => parseMealPaymentAccountsForContext(value, {
        campusId: expectedCampusId,
        ownerUserId: expectedOwnerUserId,
      })));
    },
    createPaymentAccount(accessToken, campusId, currentUserId, body) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedOwnerUserId = positiveId(currentUserId, 'currentUserId');
      return dispatch(
        campusPath(expectedCampusId, 'meal', 'payment-accounts'),
        requestOptions(accessToken, (value) => parseMealPaymentAccountForContext(value, {
          campusId: expectedCampusId,
          ownerUserId: expectedOwnerUserId,
        }), 'POST', {
          body: sanitizePaymentAccountRequest(body),
        }),
      );
    },
    deactivatePaymentAccount(accessToken, campusId, currentUserId, accountId) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedOwnerUserId = positiveId(currentUserId, 'currentUserId');
      const expectedAccountId = positiveId(accountId, 'paymentAccountId');
      return dispatch(
        campusPath(
          expectedCampusId,
          'meal',
          'payment-accounts',
          expectedAccountId,
          'deactivate',
        ),
        requestOptions(accessToken, (value) => parseMealPaymentAccountForContext(value, {
          accountId: expectedAccountId,
          campusId: expectedCampusId,
          ownerUserId: expectedOwnerUserId,
        }), 'PATCH'),
      );
    },
    listPolls(accessToken, campusId, query = {}) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedPage = nonNegativeInteger(query.page ?? 0, 'page');
      const expectedSize = positiveId(query.size ?? DEFAULT_PAGE_SIZE, 'size');
      const params = new URLSearchParams();
      if (query.status) params.set('status', query.status);
      params.set('page', String(expectedPage));
      params.set('size', String(expectedSize));
      params.set('sort', query.sort ?? 'createdAt,desc');
      params.set('includeArchived', String(query.includeArchived === true));
      const path = `${campusPath(expectedCampusId, 'meal', 'polls')}?${params}`;
      return dispatch(
        path,
        requestOptions(accessToken, (value) => parseMealPollListForContext(value, {
          campusId: expectedCampusId,
          page: expectedPage,
          size: expectedSize,
          ...(query.status ? {status: query.status} : {}),
        })),
      );
    },
    createPoll(accessToken, campusId, body) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      return dispatch(
        campusPath(expectedCampusId, 'meal', 'polls'),
        requestOptions(accessToken, (value) => parseCreatedMealPollDetailForContext(value, {
          campusId: expectedCampusId,
        }), 'POST', {
          body: sanitizePollCreateRequest(body),
        }),
      );
    },
    getPollDetail(accessToken, campusId, pollId) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedPollId = positiveId(pollId, 'pollId');
      return dispatch(
        campusPath(expectedCampusId, 'meal', 'polls', expectedPollId),
        requestOptions(accessToken, (value) => parseMealPollDetailForContext(value, {
          campusId: expectedCampusId,
          pollId: expectedPollId,
        })),
      );
    },
    closePoll(accessToken, campusId, pollId) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedPollId = positiveId(pollId, 'pollId');
      return dispatch(
        campusPath(expectedCampusId, 'meal', 'polls', expectedPollId, 'close'),
        requestOptions(accessToken, (value) => parseClosedMealPollDetailForContext(value, {
          campusId: expectedCampusId,
          pollId: expectedPollId,
        }), 'PATCH'),
      );
    },
    createCharges(accessToken, campusId, pollId, body) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedPollId = positiveId(pollId, 'pollId');
      const requestBody = sanitizeMealChargeRequest(body);
      return dispatch(
        campusPath(expectedCampusId, 'meal', 'polls', expectedPollId, 'charges'),
        requestOptions(accessToken, (value) => parseMealChargeResultForContext(value, {
          groups: requestBody.groups,
          paymentAccountId: requestBody.paymentAccountId,
          pollId: expectedPollId,
        }), 'POST', {
          body: requestBody,
        }),
      );
    },
    getMySettlement(accessToken, campusId, currentUserId, query = {}) {
      const expectedCampusId = positiveId(campusId, 'campusId');
      const expectedOwnerUserId = positiveId(currentUserId, 'currentUserId');
      const page = nonNegativeInteger(query.page ?? 0, 'page');
      const size = positiveId(query.size ?? DEFAULT_PAGE_SIZE, 'size');
      const params = new URLSearchParams({
        includeArchived: String(query.includeArchived === true),
        page: String(page),
        size: String(size),
      });
      return dispatch(
        `${campusPath(expectedCampusId, 'meal', 'charges', 'my-accounts')}?${params}`,
        requestOptions(accessToken, (value) => parseMealSettlementForContext(value, {
          campusId: expectedCampusId,
          ownerUserId: expectedOwnerUserId,
        })),
      );
    },
  };
}

export const mealApi = createMealApi();

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
  if (!body || typeof body !== 'object') {
    throw invalidMealRequest('계좌 정보를 확인해 주세요.');
  }
  return {
    nickname: requireText(body.nickname, '계좌 이름'),
    bankName: requireText(body.bankName, '은행명'),
    accountNumber: requireText(body.accountNumber, '계좌번호'),
    accountHolder: requireText(body.accountHolder, '예금주'),
  };
}

function sanitizePollCreateRequest(body: MealPollCreateRequest): MealPollCreateRequest {
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.isAnonymous !== 'boolean' ||
    typeof body.endsAt !== 'string' ||
    Number.isNaN(Date.parse(body.endsAt)) ||
    Date.parse(body.endsAt) <= Date.now() ||
    typeof body.allowUserOptionAdd !== 'boolean' ||
    !Array.isArray(body.options) ||
    body.options.length < 1 ||
    body.options.length > 100
  ) {
    throw invalidMealRequest('투표 생성 정보를 확인해 주세요.');
  }
  const options = body.options.map((option, index) => ({
    content: requireText(option?.content, '선택지'),
    sortOrder: index,
  }));
  if (new Set(options.map((option) => option.content.toLocaleLowerCase())).size !== options.length) {
    throw invalidMealRequest('서로 다른 선택지를 입력해 주세요.');
  }
  return {
    title: requireText(body.title, '제목'),
    isAnonymous: body.isAnonymous,
    endsAt: body.endsAt,
    options,
    allowUserOptionAdd: body.allowUserOptionAdd,
  };
}

function sanitizeMealChargeRequest(body: MealChargeRequest): MealChargeRequest {
  if (!body || typeof body !== 'object') {
    throw invalidMealRequest('청구 요청을 확인해 주세요.');
  }
  const paymentAccountId = positiveId(body.paymentAccountId, 'paymentAccountId');
  if (!Array.isArray(body.groups) || body.groups.length === 0 || body.groups.length > 1000) {
    throw new FaithLogApiError({kind: 'error', status: 400, message: '청구 그룹을 확인해 주세요.'});
  }
  const groups = body.groups.map((group) => {
    if (
      !group ||
      typeof group !== 'object' ||
      (group.calculationType !== 'PER_MEMBER' && group.calculationType !== 'GROUP_TOTAL')
    ) {
      throw new FaithLogApiError({kind: 'error', status: 400, message: '계산 방식을 확인해 주세요.'});
    }
    return {
      optionId: positiveId(group.optionId, 'optionId'),
      calculationType: group.calculationType,
      enteredAmount: positiveId(group.enteredAmount, 'enteredAmount'),
    };
  });
  if (new Set(groups.map((group) => group.optionId)).size !== groups.length) {
    throw new FaithLogApiError({kind: 'error', status: 400, message: '같은 선택지를 중복 청구할 수 없습니다.'});
  }
  return {paymentAccountId, groups};
}

function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FaithLogApiError({kind: 'error', status: 400, message: `${label}을(를) 입력해 주세요.`});
  }
  return value.trim();
}

function invalidMealRequest(message: string) {
  return new FaithLogApiError({kind: 'error', status: 400, message});
}
