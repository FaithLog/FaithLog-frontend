import {
  createApiEnvelope,
  createApiErrorEnvelope,
  mockApiErrorFixtures,
  mockDomainFixtures,
} from './mockFixtures';
import type {
  AdminCampusChargeSummary,
  AdminMemberChargeList,
  ChargeAmountSummary,
  ChargeItem,
  ChargeList,
  ChargeSummary,
  MarkChargePaidResponse,
  PaymentCategory,
} from './types';
import {calculateMealChargeGroup} from '../meal/mealModel';
import type {
  MealChargeResult,
  MealChargeGroupResult,
  MealCalculationType,
  MealDutyAssignment,
  MealPaymentAccount,
  MealPollDetail,
  MealPollSummary,
  MealSettlement,
  MealSettlementCharge,
} from '../meal/mealTypes';
type MockScenario =
  | '401'
  | '403'
  | '409'
  | '422'
  | 'offline'
  | 'invalid-envelope'
  | 'none';

type MockRoute = {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
};

type MockMealActor = {
  adminCampusIds: number[];
  campusIds: number[];
  userId: number;
};

type MockChargePeriod = {month: number; year: number};

type MockLegacyBillingState = {
  charges: ChargeList;
  period: MockChargePeriod;
  summary: ChargeSummary;
};

export const mealMockAccessTokens = {
  activeDuty: 'mock-access-token',
  otherDuty: 'mock-meal-duty-8-token',
  nonDutyAdmin: 'mock-non-duty-admin-token',
  inactiveDuty: 'mock-inactive-meal-token',
  otherCampusDuty: 'mock-campus-2-meal-token',
} as const;

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const missingMockFixture = Symbol('missingMockFixture');
type MockErrorResult = {
  code: string;
  message: string;
  mockError: true;
  status: number;
};

const mockCreatedPollTemplates: Array<Record<string, unknown>> = [];
let mockMealState = createInitialMockMealState();

export function resetMockAdapterStateForTests() {
  mockMealState = createInitialMockMealState();
}

export function resetMealMockStateForTests() {
  mockMealState = createInitialMockMealState();
}

export async function executeMockRequest(path: string, init: RequestInit): Promise<Response> {
  const scenario = getMockScenario();

  if (scenario === 'offline') {
    throw new TypeError('Mock offline scenario');
  }

  const scenarioResponse = getScenarioResponse(scenario);

  if (scenarioResponse) {
    return scenarioResponse;
  }

  const route = toMockRoute(path, init.method);
  const data = resolveMockData(route, init.body, getMockMealActor(init.headers));

  if (isMockErrorResult(data)) {
    return jsonResponse(data.status, createApiErrorEnvelope(data.code, data.message));
  }

  if (data === missingMockFixture) {
    return jsonResponse(
      501,
      createApiErrorEnvelope(
        'MOCK_FIXTURE_MISSING',
        'Mock fixture가 아직 준비되지 않은 API입니다.',
      ),
    );
  }

  return jsonResponse(200, createApiEnvelope(data));
}

function getMockScenario(): MockScenario {
  const configured = process.env.EXPO_PUBLIC_MOCK_SCENARIO?.trim().toLowerCase();

  if (
    configured === '401' ||
    configured === '403' ||
    configured === '409' ||
    configured === '422' ||
    configured === 'offline' ||
    configured === 'invalid-envelope'
  ) {
    return configured;
  }

  return 'none';
}

function getScenarioResponse(scenario: MockScenario) {
  if (scenario === '401') {
    return jsonResponse(
      mockApiErrorFixtures.sessionExpired.status,
      mockApiErrorFixtures.sessionExpired.body,
    );
  }

  if (scenario === '403') {
    return jsonResponse(
      mockApiErrorFixtures.permissionDenied.status,
      mockApiErrorFixtures.permissionDenied.body,
    );
  }

  if (scenario === '409') {
    return jsonResponse(mockApiErrorFixtures.conflict.status, mockApiErrorFixtures.conflict.body);
  }

  if (scenario === '422') {
    return jsonResponse(
      mockApiErrorFixtures.validation.status,
      mockApiErrorFixtures.validation.body,
    );
  }

  if (scenario === 'invalid-envelope') {
    return jsonResponse(
      mockApiErrorFixtures.invalidEnvelope.status,
      mockApiErrorFixtures.invalidEnvelope.body,
    );
  }

  return null;
}

function toMockRoute(path: string, method = 'GET'): MockRoute {
  const url = new URL(path, 'https://mock.faithlog.test');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  return {
    method: method.toUpperCase(),
    pathname,
    searchParams: url.searchParams,
  };
}

function resolveMockData(
  route: MockRoute,
  body?: BodyInit | null,
  mealActor: MockMealActor | null = null,
): unknown {
  const path = withoutApiPrefix(route.pathname);
  const {admin, auth, billing, campus, devotion, notification, poll, prayer} =
    mockDomainFixtures;

  if (route.method === 'POST' && path === '/auth/signup') return auth.signup;
  if (route.method === 'POST' && path === '/auth/login') return auth.login;
  if (route.method === 'POST' && path === '/auth/refresh') return auth.tokenPair;
  if (route.method === 'POST' && path === '/auth/logout') return null;
  if (route.method === 'GET' && path === '/users/me') return auth.currentUser;
  if (route.method === 'DELETE' && path === '/users/me') {
    return {deletedAt: '2026-07-06T12:00:00'};
  }
  if (route.method === 'POST' && path === '/users/me/fcm-tokens') {
    return notification.fcmRegistration;
  }
  if (route.method === 'DELETE' && /^\/users\/me\/fcm-tokens\/\d+$/.test(path)) {
    return null;
  }
  if (route.method === 'GET' && path === '/campuses/me') return campus.memberships;
  if (route.method === 'POST' && path === '/campuses') return campus.created;
  if (route.method === 'POST' && path === '/campuses/join') return campus.joined;
  if (route.method === 'GET' && /^\/campuses\/\d+$/.test(path)) return campus.detail;
  if (route.method === 'PATCH' && /^\/campuses\/\d+$/.test(path)) return campus.detail;
  if (route.method === 'DELETE' && /^\/campuses\/\d+\/members\/\d+$/.test(path)) {
    return null;
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/devotions\/me\/weeks\/\d{4}-\d{2}-\d{2}$/.test(path)
  ) {
    return devotion.weekly;
  }
  if (
    route.method === 'PUT' &&
    /^\/campuses\/\d+\/devotions\/me\/days\/\d{4}-\d{2}-\d{2}$/.test(path)
  ) {
    return devotion.dailySave;
  }
  if (
    route.method === 'PUT' &&
    /^\/campuses\/\d+\/devotions\/me\/weeks\/\d{4}-\d{2}-\d{2}$/.test(path)
  ) {
    return devotion.weekly;
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/devotions\/me\/monthly-summary$/.test(path)
  ) {
    return devotion.monthly;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/charges\/me\/summary$/.test(path)) {
    const campusId = getCampusId(path);
    const denied = authorizeCampusMember(mealActor, campusId);
    if (denied) return denied;
    const period = parseMockChargeSummaryPeriod(route.searchParams);
    if (isMockErrorResult(period)) return period;
    return getMockMemberChargeSummary(mealActor, campusId, period);
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/charges\/me$/.test(path)) {
    const campusId = getCampusId(path);
    const denied = authorizeCampusMember(mealActor, campusId);
    if (denied) return denied;
    return getMockMemberChargeList(
      mealActor,
      campusId,
      route.searchParams,
    );
  }
  if (route.method === 'PATCH' && /^\/campuses\/\d+\/charges\/me\/\d+\/paid$/.test(path)) {
    const campusId = getCampusId(path);
    const denied = authorizeCampusMember(mealActor, campusId);
    if (denied) return denied;
    const chargeItemId = getPathNumberBeforeSuffix(path, 'paid');
    const mealPaid = markMockMealChargePaid(
      mealActor,
      campusId,
      chargeItemId,
    );
    if (mealPaid) return mealPaid;
    return mockNotFound('CHARGE_NOT_FOUND', '청구를 찾을 수 없습니다.');
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/payment-accounts$/.test(path)) {
    return billing.paymentAccounts;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/penalty-rules$/.test(path)) {
    return billing.penaltyRules;
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/duty-assignments\/me\/meal$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    return mockMealState.duties.find(
      (duty) => duty.campusId === campusId && duty.userId === mealActor?.userId && duty.isActive,
    ) ?? mockForbidden('MEAL_DUTY_REQUIRED', '활성 밥 담당자만 이용할 수 있습니다.');
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/meal\/payment-accounts\/me$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    return route.searchParams.get('includeInactive') === 'false'
      ? mockMealState.accounts.filter((account) => account.campusId === campusId && account.ownerUserId === mealActor?.userId && account.isActive)
      : mockMealState.accounts.filter((account) => account.campusId === campusId && account.ownerUserId === mealActor?.userId);
  }
  if (
    route.method === 'POST' &&
    /^\/campuses\/\d+\/meal\/payment-accounts$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    if (mockMealState.accounts.some((account) => account.campusId === campusId && account.ownerUserId === mealActor?.userId && account.isActive)) {
      return mockConflict(
        'MEAL_ACTIVE_ACCOUNT_EXISTS',
        '기존 활성 MEAL 계좌를 비활성화한 뒤 새 계좌를 등록해 주세요.',
      );
    }
    const bodyRecord = toRecord(parseMockJsonBody(body));
    const accountFields = ['nickname', 'bankName', 'accountNumber', 'accountHolder'] as const;
    if (
      hasUnexpectedKeys(bodyRecord, accountFields) ||
      accountFields.some((field) => typeof bodyRecord[field] !== 'string' || !bodyRecord[field].trim())
    ) {
      return mockBadRequest('MEAL_ACCOUNT_FIELDS_REQUIRED', '계좌 정보를 모두 입력해 주세요.');
    }
    const account: MealPaymentAccount = {
      id: Math.max(0, ...mockMealState.accounts.map((item) => item.id)) + 1,
      campusId,
      ownerUserId: mealActor?.userId ?? 0,
      accountType: 'MEAL',
      nickname: stringField(bodyRecord.nickname, '새 밥 계좌'),
      bankName: stringField(bodyRecord.bankName, '신한은행'),
      accountNumber: stringField(bodyRecord.accountNumber, '110-000-000000'),
      accountHolder: stringField(bodyRecord.accountHolder, '샘플 사용자'),
      isActive: true,
      createdAt: new Date().toISOString(),
      deactivatedAt: null,
    };
    mockMealState.accounts.unshift(account);
    return account;
  }
  if (
    route.method === 'PATCH' &&
    /^\/campuses\/\d+\/meal\/payment-accounts\/\d+\/deactivate$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    const accountId = getPathNumberBeforeSuffix(path, 'deactivate');
    const index = mockMealState.accounts.findIndex(
      (account) => account.id === accountId && account.campusId === campusId && account.ownerUserId === mealActor?.userId,
    );
    const account = mockMealState.accounts[index];
    if (!account) return mockNotFound('MEAL_ACCOUNT_NOT_FOUND', '계좌를 찾을 수 없습니다.');
    if (!account.isActive) {
      return mockConflict('MEAL_ACCOUNT_ALREADY_INACTIVE', '이미 비활성화된 계좌입니다.');
    }
    const deactivated = {...account, isActive: false, deactivatedAt: new Date().toISOString()};
    mockMealState.accounts[index] = deactivated;
    return deactivated;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/meal\/polls$/.test(path)) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    const requestedStatus = route.searchParams.get('status');
    if (requestedStatus && !['SCHEDULED', 'OPEN', 'CLOSED'].includes(requestedStatus)) {
      return mockBadRequest('MEAL_POLL_STATUS_INVALID', '투표 상태 조건이 올바르지 않습니다.');
    }
    const filtered = requestedStatus
      ? mockMealState.polls.filter((poll) => poll.campusId === campusId && poll.status === requestedStatus)
      : mockMealState.polls.filter((poll) => poll.campusId === campusId);
    const page = Number(route.searchParams.get('page') ?? 0);
    const size = Number(route.searchParams.get('size') ?? 20);
    const start = page * size;
    return {
      content: filtered.slice(start, start + size),
      page,
      size,
      totalElements: filtered.length,
      totalPages: filtered.length === 0 ? 0 : Math.ceil(filtered.length / size),
    };
  }
  if (route.method === 'POST' && /^\/campuses\/\d+\/meal\/polls$/.test(path)) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    return createMockMealPoll(campusId, parseMockJsonBody(body));
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/meal\/polls\/\d+$/.test(path)) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    const pollId = getLastPathNumber(path);
    const detail = mockMealState.details.find(
      (item) => item.id === pollId && item.campusId === campusId,
    );
    return detail
      ? toRequesterMealPollDetail(detail, mealActor?.userId ?? 0)
      : mockNotFound('MEAL_POLL_NOT_FOUND', '투표를 찾을 수 없습니다.');
  }
  if (
    route.method === 'PATCH' &&
    /^\/campuses\/\d+\/meal\/polls\/\d+\/close$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    return denied ?? closeMockMealPoll(campusId, getPathNumberBeforeSuffix(path, 'close'));
  }
  if (
    route.method === 'POST' &&
    /^\/campuses\/\d+\/meal\/polls\/\d+\/charges$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    return chargeMockMealPoll(
      campusId,
      mealActor?.userId ?? 0,
      getPathNumberBeforeSuffix(path, 'charges'),
      parseMockJsonBody(body),
    );
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/meal\/charges\/my-accounts$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealDuty(mealActor, campusId);
    if (denied) return denied;
    return getMockMealSettlement(campusId, mealActor?.userId ?? 0);
  }
  if (route.method === 'GET' && path === '/coffee-brands') return billing.coffeeBrands;
  if (route.method === 'GET' && /^\/coffee-brands\/\d+\/menus$/.test(path)) {
    return billing.coffeeMenus;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls$/.test(path)) {
    const campusId = getCampusId(path);
    const membershipDenied = authorizeCampusMember(mealActor, campusId);
    if (membershipDenied) return membershipDenied;
    return [
      ...poll.summaries,
      ...mockMealState.polls
        .filter((item) => item.campusId === campusId)
        .map((item) => toGeneralMealPollSummary(item, mealActor?.userId ?? 0)),
    ];
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls\/\d+$/.test(path)) {
    const campusId = getCampusId(path);
    const membershipDenied = authorizeCampusMember(mealActor, campusId);
    if (membershipDenied) return membershipDenied;
    const pollId = getLastPathNumber(path);
    const mealDetail = mockMealState.details.find((detail) => detail.id === pollId && detail.campusId === campusId);

    return mealDetail
      ? toGeneralMealPollDetail(mealDetail, mealActor?.userId ?? 0)
      : poll.details.find((detail) => detail.id === pollId) ?? poll.detail;
  }
  if (
    route.method === 'PUT' &&
    /^\/campuses\/\d+\/polls\/\d+\/responses\/me$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const membershipDenied = authorizeCampusMember(mealActor, campusId);
    if (membershipDenied) return membershipDenied;
    const pollId = getPathNumberBeforeSuffix(path, 'responses/me');
    const mealDetail = mockMealState.details.find(
      (detail) => detail.id === pollId && detail.campusId === campusId,
    );
    if (mealDetail && pollId !== null) {
      if (
        mealDetail.status !== 'OPEN' ||
        Date.parse(mealDetail.startsAt) > Date.now() ||
        Date.parse(mealDetail.endsAt) <= Date.now()
      ) {
        return mockConflict('MEAL_POLL_NOT_OPEN', '현재 응답할 수 없는 투표입니다.');
      }
      const request = toRecord(parseMockJsonBody(body));
      const optionIds = Array.isArray(request.optionIds)
        ? request.optionIds.filter((value): value is number => typeof value === 'number')
        : [];
      if (
        optionIds.length !== 1 ||
        !mealDetail.options.some((option) => option.optionId === optionIds[0])
      ) {
        return mockBadRequest('MEAL_POLL_RESPONSE_INVALID', '선택지를 한 개 선택해 주세요.');
      }
      const responseKey = mockMealResponseKey(pollId, mealActor?.userId ?? 0);
      const previousOptionIds = mockMealState.responses[responseKey]?.optionIds ?? [];
      const updatedOptions = mealDetail.options.map((option) => ({
        ...option,
        responseCount:
          option.responseCount - (previousOptionIds.includes(option.optionId) ? 1 : 0) +
          (optionIds.includes(option.optionId) ? 1 : 0),
      }));
      const updatedDetail = {
        ...mealDetail,
        options: updatedOptions,
        totalResponseCount: updatedOptions.reduce((sum, option) => sum + option.responseCount, 0),
      };
      mockMealState.details = mockMealState.details.map((detail) =>
        detail.id === pollId && detail.campusId === campusId ? updatedDetail : detail,
      );
      mockMealState.polls = mockMealState.polls.map((pollSummary) =>
        pollSummary.id === pollId && pollSummary.campusId === campusId
          ? {...pollSummary, totalResponseCount: updatedDetail.totalResponseCount}
          : pollSummary,
      );
      mockMealState.responses[responseKey] = {
        responseId: 7000 + pollId * 100 + (mealActor?.userId ?? 0),
        pollId,
        optionIds,
        respondedAt: new Date().toISOString(),
        userId: mealActor?.userId ?? 0,
      };
      return mockMealState.responses[responseKey];
    }
    return poll.response;
  }
  if (
    route.method === 'POST' &&
    /^\/campuses\/\d+\/polls\/\d+\/options$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const membershipDenied = authorizeCampusMember(mealActor, campusId);
    if (membershipDenied) return membershipDenied;
    const pollId = getPathNumberBeforeSuffix(path, 'options');
    const detailIndex = mockMealState.details.findIndex((detail) => detail.id === pollId && detail.campusId === campusId);
    const detail = mockMealState.details[detailIndex];
    if (detail) {
      if (
        detail.status !== 'OPEN' ||
        !detail.allowUserOptionAdd ||
        Date.parse(detail.startsAt) > Date.now() ||
        Date.parse(detail.endsAt) <= Date.now()
      ) {
        return mockConflict('MEAL_OPTION_ADD_NOT_ALLOWED', '진행 중이며 사용자 선택지 추가가 허용된 투표만 선택지를 추가할 수 있습니다.');
      }
      const request = toRecord(parseMockJsonBody(body));
      const content = stringField(request.content, '');
      if (!content) {
        return mockBadRequest('MEAL_OPTION_CONTENT_REQUIRED', '선택지 내용을 입력해 주세요.');
      }
      if (
        detail.options.some(
          (item) => item.content.trim().toLocaleLowerCase() === content.toLocaleLowerCase(),
        )
      ) {
        return mockConflict('MEAL_OPTION_DUPLICATE', '이미 같은 내용의 선택지가 있습니다.');
      }
      const option = {
        optionId: Math.max(0, ...detail.options.map((item) => item.optionId)) + 1,
        content,
        responseCount: 0,
        userAdded: true,
        charge: {chargeStatus: 'NOT_CHARGED' as const},
      };
      mockMealState.details[detailIndex] = {...detail, options: [...detail.options, option]};
      return {
        id: option.optionId,
        content: option.content,
        composeMenuCode: null,
        priceAmount: 0,
        sortOrder: detail.options.length + 1,
        userAdded: true,
      };
    }
    return {
      id: 9999,
      content: stringField(toRecord(parseMockJsonBody(body)).content, '사용자 추가 선택지'),
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 99,
      userAdded: true,
    };
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls\/\d+\/results$/.test(path)) {
    const pollId = getPathNumberBeforeSuffix(path, 'results');

    return poll.resultsByPollId.find((results) => results.pollId === pollId) ?? poll.results;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls\/\d+\/comments$/.test(path)) {
    return poll.comments;
  }
  if (
    (route.method === 'POST' || route.method === 'PATCH') &&
    /^\/campuses\/\d+\/polls\/\d+\/comments(\/\d+)?$/.test(path)
  ) {
    return poll.comments[0];
  }
  if (route.method === 'DELETE' && /^\/campuses\/\d+\/polls\/\d+\/comments\/\d+$/.test(path)) {
    return null;
  }
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/poll-templates$/.test(path)) {
    return [...mockCreatedPollTemplates, ...createMockAdminPollTemplates()];
  }
  if (
    route.method === 'GET' &&
    /^\/admin\/campuses\/\d+\/poll-templates\/\d+$/.test(path)
  ) {
    return createMockAdminPollTemplate();
  }
  if (
    (route.method === 'POST' || route.method === 'PATCH' || route.method === 'DELETE') &&
    /^\/admin\/campuses\/\d+\/poll-templates(\/\d+)?$/.test(path)
  ) {
    const request = parseMockJsonBody(body);
    const requestRecord =
      typeof request === 'object' && request !== null
        ? (request as Record<string, unknown>)
        : null;
    const templateId =
      route.method === 'POST'
        ? 900 + mockCreatedPollTemplates.length
        : (getLastPathNumber(path) ?? 801);
    const template = {
      ...createMockAdminPollTemplate(),
      ...(requestRecord ?? {}),
      id: templateId,
      ...(Array.isArray(requestRecord?.options)
        ? {options: createMockPollTemplateOptions(requestRecord.options, templateId)}
        : {}),
      isActive: route.method !== 'DELETE',
      isDefault: false,
    };

    if (route.method === 'POST') {
      mockCreatedPollTemplates.unshift(template);
    }

    if (route.method === 'PATCH') {
      const targetId = getLastPathNumber(path);
      const targetIndex = mockCreatedPollTemplates.findIndex((item) => item.id === targetId);

      if (targetIndex >= 0) {
        mockCreatedPollTemplates[targetIndex] = template;
      }
    }

    return template;
  }
  if (route.method === 'POST' && /^\/admin\/campuses\/\d+\/polls$/.test(path)) {
    return {
      ...poll.detail,
      id: 701,
      pollType: 'COFFEE',
      selectionType: 'SINGLE',
    };
  }
  if (
    route.method === 'GET' &&
    /^\/admin\/campuses\/\d+\/polls\/\d+\/missing-members$/.test(path)
  ) {
    return admin.missingDevotionMembers.map(({email, name, userId}) => ({email, name, userId}));
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/prayers\/weeks\/\d{4}-\d{2}-\d{2}$/.test(path)
  ) {
    return prayer.week;
  }
  if (
    route.method === 'PUT' &&
    /^\/campuses\/\d+\/prayers\/weeks\/\d{4}-\d{2}-\d{2}\/submissions$/.test(path)
  ) {
    return prayer.week;
  }
  if (
    route.method === 'PUT' &&
    /^\/campuses\/\d+\/prayers\/weeks\/\d{4}-\d{2}-\d{2}\/me$/.test(path)
  ) {
    return prayer.week;
  }
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/dashboard\/summary$/.test(path)) {
    return admin.dashboard;
  }
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/members$/.test(path)) {
    return admin.members;
  }
  if (
    route.method === 'PATCH' &&
    /^\/admin\/campuses\/\d+\/members\/\d+\/campus-role$/.test(path)
  ) {
    return admin.members[0];
  }
  if (route.method === 'POST' && /^\/admin\/campuses\/\d+\/members$/.test(path)) {
    return admin.addedCampusMember;
  }
  if (
    route.method === 'GET' &&
    /^\/admin\/campuses\/\d+\/charges(?:\/my-accounts)?$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealAdmin(mealActor, campusId);
    if (denied) return denied;
    if (campusId !== admin.campusCharges.campusId) {
      return mockNotFound('CAMPUS_NOT_FOUND', '캠퍼스를 찾을 수 없습니다.');
    }
    return getMockAdminCampusCharges(
      admin.campusCharges,
      admin.memberCharges.userId,
      route.searchParams,
    );
  }
  if (
    route.method === 'GET' &&
    /^\/admin\/campuses\/\d+\/members\/\d+\/charges$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealAdmin(mealActor, campusId);
    if (denied) return denied;
    const requestedUserId = getPathNumberBeforeSuffix(path, 'charges');
    if (
      requestedUserId === null ||
      getMockMealCampusMember(campusId, requestedUserId) === undefined
    ) {
      return mockNotFound('MEMBER_NOT_FOUND', '멤버를 찾을 수 없습니다.');
    }
    return getMockAdminMemberCharges(
      admin.memberCharges,
      campusId,
      requestedUserId,
      route.searchParams,
    );
  }
  if (route.method === 'PATCH' && /^\/admin\/charges\/\d+\/status$/.test(path)) {
    const chargeItemId = getPathNumberBeforeSuffix(path, 'status');
    const request = parseMockJsonBody(body);
    const status = getMockAdminChargeStatus(request);
    if (!mealActor) return mockUnauthorized('AUTH_REQUIRED', '로그인이 필요합니다.');
    if (!chargeItemId) return mockNotFound('CHARGE_NOT_FOUND', '청구를 찾을 수 없습니다.');
    const canonical = findMockCanonicalAdminCharge(chargeItemId);
    if (!canonical) return mockNotFound('CHARGE_NOT_FOUND', '청구를 찾을 수 없습니다.');
    const denied = authorizeMealAdmin(mealActor, canonical.campusId);
    if (denied) return denied;
    if (!status) return mockBadRequest('BILLING_INVALID_STATUS', '변경할 상태를 확인해 주세요.');

    const paidAt = status === 'PAID' ? '2026-07-13T12:00:00.000Z' : null;
    const transitioned = transitionMockCanonicalAdminCharge(canonical, status, paidAt);

    if (!transitioned || isMockErrorResult(transitioned)) {
      return transitioned ?? mockNotFound('CHARGE_NOT_FOUND', '청구를 찾을 수 없습니다.');
    }

    return {
      id: transitioned.id,
      campusId: canonical.campusId,
      userId: canonical.userId,
      paymentCategory: transitioned.paymentCategory,
      title: transitioned.title,
      ...(transitioned.reason === undefined ? {} : {reason: transitioned.reason}),
      amount: transitioned.amount,
      status: transitioned.status,
      paidAt: transitioned.paidAt,
    };
  }
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/devotions\/missing$/.test(path)) {
    return admin.missingDevotionMembers;
  }
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/notification-logs$/.test(path)) {
    return notification.logs;
  }
  if (route.method === 'POST' && /^\/admin\/campuses\/\d+\/notifications$/.test(path)) {
    return notification.sendResponse;
  }
  if (route.method === 'POST' && /^\/admin\/campuses\/\d+\/payment-accounts$/.test(path)) {
    return billing.adminPaymentAccount;
  }
  if (route.method === 'PATCH' && /^\/admin\/payment-accounts\/\d+\/deactivate$/.test(path)) {
    return billing.adminPaymentAccount;
  }
  if (route.method === 'POST' && /^\/admin\/campuses\/\d+\/penalty-rules$/.test(path)) {
    return billing.penaltyRules[0];
  }
  if (route.method === 'PATCH' && /^\/admin\/penalty-rules\/\d+$/.test(path)) {
    return billing.penaltyRules[0];
  }
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/prayer-seasons\/current$/.test(path)) {
    return prayer.season;
  }
  if (route.method === 'POST' && /^\/admin\/campuses\/\d+\/prayer-seasons$/.test(path)) {
    return prayer.season;
  }
  if (route.method === 'PATCH' && /^\/admin\/prayer-seasons\/\d+\/close$/.test(path)) {
    return {...prayer.season, endDate: '2026-06-30', status: 'CLOSED'};
  }
  if (route.method === 'GET' && /^\/admin\/prayer-seasons\/\d+\/groups$/.test(path)) {
    return [prayer.group];
  }
  if (route.method === 'POST' && /^\/admin\/prayer-seasons\/\d+\/groups$/.test(path)) {
    return prayer.group;
  }
  if (
    route.method === 'GET' &&
    /^\/admin\/prayer-seasons\/\d+\/members\/assignable$/.test(path)
  ) {
    return [
      {
        userId: 7,
        name: '샘플 사용자',
        email: 'faithlog.user@example.test',
        assignedGroupId: 401,
        assignedGroupName: '샘플 기도조',
        assignable: false,
      },
      {
        userId: 8,
        name: '샘플 친구',
        email: 'faithlog.friend@example.test',
        assignedGroupId: null,
        assignedGroupName: null,
        assignable: true,
      },
    ];
  }
  if (route.method === 'PATCH' && /^\/admin\/prayer-groups\/\d+$/.test(path)) {
    return prayer.group;
  }
  if (route.method === 'PUT' && /^\/admin\/prayer-groups\/\d+\/members$/.test(path)) {
    return prayer.group;
  }
  if (route.method === 'GET' && path === '/admin/users') return admin.serviceAdminUsers;
  if (route.method === 'GET' && /^\/admin\/users\/\d+$/.test(path)) {
    return admin.serviceAdminUser;
  }
  if (route.method === 'PATCH' && /^\/admin\/users\/\d+\/role$/.test(path)) {
    return admin.serviceAdminUser;
  }
  if (route.method === 'GET' && path === '/admin/campuses') return admin.serviceAdminCampuses;
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/duty-assignments$/.test(path)) {
    const campusId = getCampusId(path);
    const denied = authorizeMealAdmin(mealActor, campusId);
    if (denied) return denied;
    return [
      ...admin.dutyAssignments.filter((duty) => duty.campusId === campusId),
      ...mockMealState.duties.filter((duty) => duty.campusId === campusId),
    ];
  }
  if (
    route.method === 'POST' &&
    /^\/admin\/campuses\/\d+\/duty-assignments\/meal$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealAdmin(mealActor, campusId);
    if (denied) return denied;
    const request = toRecord(parseMockJsonBody(body));
    if (hasUnexpectedKeys(request, ['userId'])) {
      return mockBadRequest('MEAL_DUTY_REQUEST_INVALID', '담당자 지정 요청이 올바르지 않습니다.');
    }
    if (typeof request.userId !== 'number' || !Number.isSafeInteger(request.userId) || request.userId <= 0) {
      return mockBadRequest('MEAL_DUTY_USER_INVALID', '지정할 멤버가 올바르지 않습니다.');
    }
    const userId = request.userId;
    const member = getMockMealCampusMember(campusId, userId);
    if (!member) return mockNotFound('CAMPUS_MEMBER_NOT_FOUND', '캠퍼스 멤버를 찾을 수 없습니다.');
    const existing = mockMealState.duties.find(
      (duty) => duty.campusId === campusId && duty.userId === userId && duty.isActive,
    );
    if (existing) return existing;
    const assignment: MealDutyAssignment = {
      assignmentId: Math.max(1201, ...mockMealState.duties.map((duty) => duty.assignmentId)) + 1,
      campusId,
      userId,
      name: member.name,
      email: member.email,
      dutyType: 'MEAL',
      isActive: true,
      assignedAt: new Date().toISOString(),
    };
    mockMealState.duties.push(assignment);
    return assignment;
  }
  if (
    route.method === 'DELETE' &&
    /^\/admin\/campuses\/\d+\/duty-assignments\/meal\/\d+$/.test(path)
  ) {
    const campusId = getCampusId(path);
    const denied = authorizeMealAdmin(mealActor, campusId);
    if (denied) return denied;
    const assignmentId = getLastPathNumber(path);
    const assignment = mockMealState.duties.find(
      (duty) => duty.assignmentId === assignmentId && duty.campusId === campusId,
    );
    if (!assignment) {
      return mockNotFound('MEAL_DUTY_NOT_FOUND', '밥 담당자 배정을 찾을 수 없습니다.');
    }
    if (!assignment.isActive) {
      return mockConflict('MEAL_DUTY_ALREADY_INACTIVE', '이미 해제된 밥 담당자입니다.');
    }
    mockMealState.duties = mockMealState.duties.filter(
      (duty) => duty.assignmentId !== assignmentId || duty.campusId !== campusId,
    );
    return null;
  }
  if (
    route.method === 'PUT' &&
    /^\/admin\/campuses\/\d+\/duty-assignments\/coffee$/.test(path)
  ) {
    return admin.dutyAssignments[0];
  }
  if (
    route.method === 'DELETE' &&
    /^\/admin\/campuses\/\d+\/duty-assignments\/coffee\/\d+$/.test(path)
  ) {
    return null;
  }

  return missingMockFixture;
}

function createMockAdminPollTemplate() {
  const {poll} = mockDomainFixtures;

  return {
    ...poll.detail,
    id: 801,
    pollType: 'COFFEE',
    selectionType: 'SINGLE',
    autoCreateEnabled: true,
    startDayOfWeek: 3,
    startTime: '09:00',
    endDayOfWeek: 4,
    endTime: '09:00',
    isDefault: true,
    isActive: true,
  };
}

function createMockAdminPollTemplates() {
  const coffeeTemplate = createMockAdminPollTemplate();

  return [
    {
      ...coffeeTemplate,
      id: 801,
      title: '수요예배 참석',
      pollType: 'WEDNESDAY',
      chargeGenerationType: 'NONE',
      paymentCategory: null,
      paymentAccountId: null,
      startDayOfWeek: 1,
      startTime: '09:00:00',
      endDayOfWeek: 3,
      endTime: '18:00:00',
      options: mockDomainFixtures.poll.details.find((detail) => detail.id === 703)?.options ?? [],
    },
    {
      ...coffeeTemplate,
      id: 802,
      title: '토요 목자모임',
      pollType: 'SATURDAY',
      chargeGenerationType: 'NONE',
      paymentCategory: null,
      paymentAccountId: null,
      startDayOfWeek: 4,
      startTime: '09:00:00',
      endDayOfWeek: 6,
      endTime: '09:00:00',
      options: mockDomainFixtures.poll.details.find((detail) => detail.id === 704)?.options ?? [],
    },
  ];
}

function createMockPollTemplateOptions(options: unknown[], templateId: number) {
  return options.map((value, index) => {
    const option =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
    const menuId = typeof option.menuId === 'number' ? option.menuId : null;

    return {
      id: templateId * 100 + index + 1,
      content:
        typeof option.content === 'string'
          ? option.content
          : menuId === null
            ? `선택지 ${index + 1}`
            : `메뉴 ${menuId}`,
      composeMenuCode: menuId === null ? null : `MENU-${menuId}`,
      priceAmount: typeof option.priceAmount === 'number' ? option.priceAmount : 0,
      sortOrder: typeof option.sortOrder === 'number' ? option.sortOrder : index + 1,
    };
  });
}

function getLastPathNumber(path: string) {
  const match = path.match(/\/(\d+)$/);

  return match ? Number(match[1]) : null;
}

function parseMockJsonBody(body?: BodyInit | null) {
  if (typeof body !== 'string') {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function getPathNumberBeforeSuffix(path: string, suffix: string) {
  const match = path.match(new RegExp(`/([0-9]+)/${suffix}$`));

  return match ? Number(match[1]) : null;
}

function getMockAdminChargeStatus(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const status = Reflect.get(value, 'status');

  return status === 'UNPAID' ||
    status === 'PAID' ||
    status === 'WAIVED' ||
    status === 'CANCELED'
    ? status
    : null;
}

function getMockAdminMemberCharges(
  charges: AdminMemberChargeList,
  campusId: number,
  userId: number,
  searchParams: URLSearchParams,
): AdminMemberChargeList {
  const member = getMockMealCampusMember(campusId, userId);
  if (!member) throw new Error('Known mock campus member required');
  const {items, summary} = getMockAdminMemberChargeState(campusId, userId, searchParams);
  const campusIdentity = getMockChargeCampusIdentity(mockMealState.legacyBilling.charges, campusId);

  return {
    ...charges,
    ...campusIdentity,
    userId,
    name: member.name,
    email: member.email,
    items,
    summary,
  };
}

function getMockAdminCampusCharges(
  charges: AdminCampusChargeSummary,
  legacyUserId: number,
  searchParams: URLSearchParams,
): AdminCampusChargeSummary {
  const campusId = charges.campusId;
  const userIds = new Set<number>([legacyUserId]);
  for (const key of Object.keys(mockMealState.memberCharges)) {
    const parts = key.split(':');
    const chargeCampusId = Number(parts[0] ?? Number.NaN);
    const userId = Number(parts[1] ?? Number.NaN);
    if (chargeCampusId === campusId && Number.isSafeInteger(userId) && userId > 0) {
      userIds.add(userId);
    }
  }
  const requestedUserId = Number(searchParams.get('userId'));
  const keyword = (searchParams.get('keyword') ?? '').trim().toLocaleLowerCase();
  const allMembers = [...userIds].flatMap((userId) => {
    const member = getMockMealCampusMember(campusId, userId);
    if (
      !member ||
      (Number.isSafeInteger(requestedUserId) && requestedUserId > 0 && requestedUserId !== userId) ||
      (keyword && !member.name.toLocaleLowerCase().includes(keyword) &&
        !member.email.toLocaleLowerCase().includes(keyword))
    ) {
      return [];
    }
    const {summary} = getMockAdminMemberChargeState(campusId, userId, searchParams);
    return summary.totalAmount === 0 ? [] : [{...member, ...summary}];
  });
  const summary = allMembers.reduce<ChargeAmountSummary>(
    (total, member) => addMockChargeAmountSummaries(total, member),
    emptyMockChargeAmountSummary(),
  );
  const {page, size} = getMockChargePagination(searchParams);
  const sort = searchParams.get('sort') ?? 'createdAt,desc';
  const direction = sort.endsWith(',asc') ? 1 : -1;
  const sortedMembers = [...allMembers].sort((left, right) => {
    const difference = sort.startsWith('amount,')
      ? left.totalAmount - right.totalAmount
      : left.userId - right.userId;
    return difference === 0 ? left.userId - right.userId : difference * direction;
  });
  const members = sortedMembers.slice(page * size, page * size + size);

  return {...charges, summary, members};
}

function getMockAdminMemberChargeState(
  campusId: number,
  userId: number,
  searchParams: URLSearchParams,
) {
  const legacyBilling = mockMealState.legacyBilling;
  const ownsLegacy = campusId === legacyBilling.charges.campusId &&
    userId === legacyBilling.summary.userId;
  const requestedCategory = searchParams.get('paymentCategory');
  const requestedStatus = searchParams.get('status');
  const paymentAccountIdValue = Number(searchParams.get('paymentAccountId'));
  const requestedPaymentAccountId = Number.isSafeInteger(paymentAccountIdValue) &&
    paymentAccountIdValue > 0
    ? paymentAccountIdValue
    : null;
  const matchesFilters = (charge: ChargeItem) =>
    (requestedCategory === null || charge.paymentCategory === requestedCategory) &&
    (requestedStatus === null || charge.status === requestedStatus) &&
    (requestedPaymentAccountId === null ||
      charge.account?.paymentAccountId === requestedPaymentAccountId);
  const legacyItems = ownsLegacy
    ? legacyBilling.charges.items.filter(matchesFilters)
    : [];
  const dynamicItems = (mockMealState.memberCharges[mockMealMemberChargeKey(campusId, userId)] ?? [])
    .filter(matchesFilters);
  const visibleItems = [...legacyItems, ...dynamicItems];
  const sort = searchParams.get('sort') ?? 'createdAt,desc';
  const sortedItems = [...visibleItems].sort((left, right) => {
    if (sort.startsWith('amount,')) {
      return sort.endsWith(',asc') ? left.amount - right.amount : right.amount - left.amount;
    }
    return sort.endsWith(',asc') ? left.id - right.id : right.id - left.id;
  });
  const {page, size} = getMockChargePagination(searchParams);

  return {
    items: sortedItems.slice(page * size, page * size + size),
    summary: summarizeMockMemberCharges(visibleItems),
  };
}

function getMockChargePagination(searchParams: URLSearchParams) {
  const pageValue = Number(searchParams.get('page') ?? 0);
  const sizeValue = Number(searchParams.get('size') ?? 20);
  return {
    page: Number.isSafeInteger(pageValue) && pageValue >= 0 ? pageValue : 0,
    size: Number.isSafeInteger(sizeValue) && sizeValue > 0 ? Math.min(sizeValue, 100) : 20,
  };
}

function getMockSummaryKey(
  status: ChargeItem['status'],
): Exclude<keyof ChargeAmountSummary, 'totalAmount'> {
  switch (status) {
    case 'UNPAID':
      return 'unpaidAmount';
    case 'PAID':
      return 'paidAmount';
    case 'WAIVED':
      return 'waivedAmount';
    case 'CANCELED':
      return 'canceledAmount';
  }
}

function withoutApiPrefix(pathname: string) {
  return pathname.startsWith('/api/v1') ? pathname.slice('/api/v1'.length) || '/' : pathname;
}

type MockMealState = {
  accounts: MealPaymentAccount[];
  details: MealPollDetail[];
  duties: MealDutyAssignment[];
  legacyBilling: MockLegacyBillingState;
  memberChargeIssuedAt: Record<number, string>;
  memberCharges: Record<string, ChargeItem[]>;
  nextChargeItemId: number;
  polls: MealPollSummary[];
  responses: Record<string, {optionIds: number[]; pollId: number; respondedAt: string; responseId: number; userId: number}>;
  settlement: MealSettlement;
};

function createInitialMockMealState(): MockMealState {
  const accounts: MealPaymentAccount[] = [
    {
      id: 10,
      campusId: 1,
      ownerUserId: 7,
      accountType: 'MEAL',
      nickname: '점심 계좌',
      bankName: '신한은행',
      accountNumber: '110-000-000000',
      accountHolder: '샘플 사용자',
      isActive: true,
      createdAt: '2026-07-01T03:00:00.000Z',
      deactivatedAt: null,
    },
    {
      id: 9,
      campusId: 1,
      ownerUserId: 7,
      accountType: 'MEAL',
      nickname: '이전 밥 계좌',
      bankName: '국민은행',
      accountNumber: '000-000-000000',
      accountHolder: '샘플 사용자',
      isActive: false,
      createdAt: '2026-06-01T03:00:00.000Z',
      deactivatedAt: '2026-07-01T03:00:00.000Z',
    },
  ];
  const polls: MealPollSummary[] = [
    mealPollSummary({id: 901, title: '오늘 점심 메뉴', status: 'OPEN'}),
    mealPollSummary({
      id: 902,
      title: '지난달 공동체 식사',
      startsAt: '2026-06-01T01:00:00.000Z',
      endsAt: '2026-06-01T02:00:00.000Z',
      status: 'CLOSED',
    }),
    mealPollSummary({
      id: 903,
      title: '지난주 저녁 메뉴',
      startsAt: '2026-07-05T01:00:00.000Z',
      endsAt: '2026-07-05T02:00:00.000Z',
      status: 'CLOSED',
      settlementStatus: 'CHARGED',
      totalResponseCount: 3,
    }),
  ];
  const details: MealPollDetail[] = polls.map((poll) => ({
    ...poll,
    options: poll.id === 903
      ? [
          {
            optionId: 9031,
            content: '김치찌개',
            responseCount: 3,
            userAdded: false,
            charge: {
              chargeStatus: 'CHARGED',
              calculationType: 'GROUP_TOTAL',
              enteredAmount: 10000,
              amountPerMember: 3334,
              requestedTotalAmount: 10000,
              actualTotalAmount: 10002,
              roundingAdjustment: 2,
              chargedMemberCount: 3,
              paymentAccountId: null,
              chargedByMe: false,
              chargedAt: '2026-07-05T03:00:00.000Z',
            },
          },
        ]
      : [
          {optionId: poll.id * 10 + 1, content: '제육볶음', responseCount: 3, userAdded: false, charge: {chargeStatus: 'NOT_CHARGED'}},
          {optionId: poll.id * 10 + 2, content: '김치찌개', responseCount: 2, userAdded: true, charge: {chargeStatus: 'NOT_CHARGED'}},
          {optionId: poll.id * 10 + 3, content: '샐러드', responseCount: 0, userAdded: false, charge: {chargeStatus: 'NOT_CHARGED'}},
        ],
  }));
  const emptySummary = {
    chargedMemberCount: 0,
    requestedTotalAmount: 0,
    actualTotalAmount: 0,
    roundingAdjustment: 0,
  };

  return {
    accounts,
    legacyBilling: createInitialMockLegacyBillingState(),
    memberChargeIssuedAt: {},
    memberCharges: {},
    nextChargeItemId: 10_000,
    polls,
    responses: {},
    details,
    duties: [
      {assignmentId: 1301, campusId: 1, userId: 7, name: '샘플 사용자', email: 'faithlog.user@example.test', dutyType: 'MEAL', isActive: true, assignedAt: '2026-07-01T03:00:00.000Z'},
      {assignmentId: 1302, campusId: 1, userId: 8, name: '두 번째 담당자', email: 'meal.manager@example.test', dutyType: 'MEAL', isActive: true, assignedAt: '2026-07-02T03:00:00.000Z'},
      {assignmentId: 1303, campusId: 1, userId: 18, name: '이전 담당자', email: 'inactive.meal@example.test', dutyType: 'MEAL', isActive: false, assignedAt: '2026-06-02T03:00:00.000Z'},
      {assignmentId: 1304, campusId: 2, userId: 17, name: '다른 캠퍼스 담당자', email: 'campus2.meal@example.test', dutyType: 'MEAL', isActive: true, assignedAt: '2026-07-02T03:00:00.000Z'},
    ],
    settlement: {accounts: [], summary: emptySummary},
  };
}

function createInitialMockLegacyBillingState(): MockLegacyBillingState {
  const {charges, summary} = mockDomainFixtures.billing;
  return {
    charges: {
      ...charges,
      summary: {...charges.summary},
      items: charges.items.map((charge) => ({
        ...charge,
        ...(charge.account === undefined
          ? {}
          : {account: charge.account === null ? null : {...charge.account}}),
        ...(charge.source === undefined
          ? {}
          : {source: charge.source === null ? null : {...charge.source}}),
      })),
    },
    period: {year: 2026, month: 6},
    summary: {
      ...summary,
      monthlyByCategory: summary.monthlyByCategory.map((category) => ({...category})),
    },
  };
}

function mockMealResponseKey(pollId: number, userId: number) {
  return `${pollId}:${userId}`;
}

function mockMealMemberChargeKey(campusId: number, userId: number) {
  return `${campusId}:${userId}`;
}

function toGeneralMealPollSummary(poll: MealPollSummary, userId: number) {
  return {
    id: poll.id,
    campusId: poll.campusId,
    title: poll.title,
    pollType: poll.pollType,
    selectionType: poll.selectionType,
    isAnonymous: false,
    allowUserOptionAdd: poll.allowUserOptionAdd,
    startsAt: poll.startsAt,
    endsAt: poll.endsAt,
    status: poll.status,
    responded: Boolean(mockMealState.responses[mockMealResponseKey(poll.id, userId)]),
  };
}

function toGeneralMealPollDetail(detail: MealPollDetail, userId: number) {
  return {
    ...toGeneralMealPollSummary(detail, userId),
    templateId: null,
    chargeGenerationType: 'NONE',
    paymentCategory: null,
    paymentAccountId: null,
    options: detail.options.map((option, index) => ({
      id: option.optionId,
      content: option.content,
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: index + 1,
      userAdded: option.userAdded,
    })),
    myResponse: mockMealState.responses[mockMealResponseKey(detail.id, userId)] ?? null,
  };
}

function toRequesterMealPollDetail(detail: MealPollDetail, userId: number): MealPollDetail {
  return {
    ...detail,
    options: detail.options.map((option) => {
      const charge = option.charge;
      if (charge.chargeStatus !== 'CHARGED') return option;
      const chargedByMe = charge.paymentAccountId !== null && mockMealState.accounts.some(
        (account) => account.id === charge.paymentAccountId && account.ownerUserId === userId,
      );
      return {
        ...option,
        charge: {
          ...charge,
          chargedByMe,
          paymentAccountId: chargedByMe ? charge.paymentAccountId : null,
        },
      };
    }),
  };
}

function mealPollSummary(patch: Partial<MealPollSummary>): MealPollSummary {
  return {
    id: 901,
    campusId: 1,
    title: '점심 메뉴',
    description: '먹고 싶은 메뉴를 선택해 주세요.',
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    allowUserOptionAdd: true,
    startsAt: '2026-07-13T01:00:00.000Z',
    endsAt: '2026-07-14T01:00:00.000Z',
    status: 'OPEN',
    settlementStatus: 'NOT_CHARGED',
    totalResponseCount: 5,
    ...patch,
  };
}

function createMockMealPoll(campusId: number, body: unknown) {
  const record = toRecord(body);
  if (hasUnexpectedKeys(record, ['title', 'description', 'endsAt', 'options', 'allowUserOptionAdd'])) {
    return mockBadRequest('MEAL_POLL_FIELDS_FORBIDDEN', '투표 생성 요청에 지원하지 않는 값이 포함되어 있습니다.');
  }
  if (
    typeof record.title !== 'string' ||
    !record.title.trim() ||
    (record.description !== undefined && typeof record.description !== 'string') ||
    typeof record.endsAt !== 'string' ||
    Number.isNaN(Date.parse(record.endsAt)) ||
    Date.parse(record.endsAt) <= Date.now() ||
    typeof record.allowUserOptionAdd !== 'boolean' ||
    !Array.isArray(record.options)
  ) {
    return mockBadRequest('MEAL_POLL_CREATE_INVALID', '투표 생성 정보를 확인해 주세요.');
  }
  const options = record.options;
  if (options.some((item) => hasUnexpectedKeys(toRecord(item), ['content']))) {
    return mockBadRequest('MEAL_POLL_OPTIONS_INVALID', '선택지 요청이 올바르지 않습니다.');
  }
  const contents = options.map((item) => stringField(toRecord(item).content, ''));
  if (
    contents.length < 2 ||
    contents.some((content) => !content) ||
    new Set(contents.map((content) => content.toLocaleLowerCase())).size !== contents.length
  ) {
    return mockBadRequest('MEAL_POLL_OPTIONS_INVALID', '서로 다른 선택지를 두 개 이상 입력해 주세요.');
  }
  const id = Math.max(...mockMealState.polls.map((poll) => poll.id)) + 1;
  const now = new Date().toISOString();
  const summary = mealPollSummary({
    campusId,
    id,
    title: record.title.trim(),
    description:
      typeof record.description === 'string' && record.description.trim()
        ? record.description.trim()
        : null,
    allowUserOptionAdd: record.allowUserOptionAdd,
    startsAt: now,
    endsAt: record.endsAt,
    status: 'OPEN',
    totalResponseCount: 0,
  });
  const detail: MealPollDetail = {
    ...summary,
    options: contents.map((content, index) => ({
      optionId: id * 10 + index + 1,
      content,
      responseCount: 0,
      userAdded: false,
      charge: {chargeStatus: 'NOT_CHARGED'},
    })),
  };
  mockMealState.polls.unshift(summary);
  mockMealState.details.unshift(detail);
  return detail;
}

function closeMockMealPoll(campusId: number, pollId: number | null) {
  const detailIndex = mockMealState.details.findIndex((detail) => detail.id === pollId && detail.campusId === campusId);
  const detail = mockMealState.details[detailIndex];
  if (!detail) return mockNotFound('MEAL_POLL_NOT_FOUND', '투표를 찾을 수 없습니다.');
  if (detail.status !== 'OPEN') {
    return mockConflict('MEAL_POLL_ALREADY_CLOSED', '이미 종료된 밥 투표입니다.');
  }
  const closed = {...detail, status: 'CLOSED' as const};
  mockMealState.details[detailIndex] = closed;
  mockMealState.polls = mockMealState.polls.map((poll) =>
    poll.id === pollId ? {...poll, status: 'CLOSED'} : poll,
  );
  return closed;
}

function chargeMockMealPoll(campusId: number, userId: number, pollId: number | null, body: unknown) {
  const detailIndex = mockMealState.details.findIndex((detail) => detail.id === pollId && detail.campusId === campusId);
  const detail = mockMealState.details[detailIndex];
  if (!detail || pollId === null) return mockNotFound('MEAL_POLL_NOT_FOUND', '투표를 찾을 수 없습니다.');
  if (detail.status !== 'CLOSED') {
    return mockConflict('MEAL_POLL_NOT_CLOSED', '종료된 밥 투표만 청구할 수 있습니다.');
  }
  const chargeableOptions = detail.options.filter(
    (option) => option.responseCount > 0 && option.charge.chargeStatus === 'NOT_CHARGED',
  );
  if (chargeableOptions.length === 0) {
    return mockConflict('MEAL_POLL_ALREADY_CHARGED', '이미 청구된 밥 투표입니다.');
  }
  const request = toRecord(body);
  if (hasUnexpectedKeys(request, ['paymentAccountId', 'groups'])) {
    return mockBadRequest('MEAL_CHARGE_REQUEST_INVALID', '청구 요청이 올바르지 않습니다.');
  }
  const paymentAccountId = request.paymentAccountId;
  if (
    typeof paymentAccountId !== 'number' ||
    !mockMealState.accounts.some((account) =>
      account.id === paymentAccountId &&
      account.campusId === campusId &&
      account.ownerUserId === userId &&
      account.isActive,
    )
  ) {
    return mockBadRequest('MEAL_PAYMENT_ACCOUNT_INVALID', '본인의 활성 MEAL 계좌를 선택해 주세요.');
  }
  const groups = Array.isArray(request.groups) ? request.groups : [];
  if (
    groups.some((rawGroup) => {
      const group = toRecord(rawGroup);
      return (
        hasUnexpectedKeys(group, ['optionId', 'calculationType', 'enteredAmount']) ||
        (group.calculationType !== 'PER_MEMBER' && group.calculationType !== 'GROUP_TOTAL') ||
        typeof group.enteredAmount !== 'number' ||
        !Number.isSafeInteger(group.enteredAmount) ||
        group.enteredAmount <= 0
      );
    })
  ) {
    return mockBadRequest('MEAL_CHARGE_AMOUNT_INVALID', '계산 방식과 청구 금액을 확인해 주세요.');
  }
  const requestedOptionIds = groups.map((rawGroup) => toRecord(rawGroup).optionId);
  const chargeableOptionIds = chargeableOptions.map((option) => option.optionId);
  if (
    new Set(requestedOptionIds).size !== groups.length ||
    groups.length !== chargeableOptionIds.length ||
    chargeableOptionIds.some((optionId) => !requestedOptionIds.includes(optionId))
  ) {
    return mockBadRequest('MEAL_CHARGE_GROUPS_INVALID', '응답자가 있는 모든 미청구 옵션을 정확히 한 번 포함해 주세요.');
  }
  let results: MealChargeGroupResult[];
  let summary: MealChargeResultSummary;
  try {
    results = groups.map((rawGroup) => {
      const group = toRecord(rawGroup);
      const optionId = typeof group.optionId === 'number' ? group.optionId : 0;
      const option = chargeableOptions.find((item) => item.optionId === optionId);
      if (!option) throw new Error('Unknown option');
      const calculationType: MealCalculationType = group.calculationType === 'GROUP_TOTAL' ? 'GROUP_TOTAL' : 'PER_MEMBER';
      const enteredAmount = typeof group.enteredAmount === 'number' ? group.enteredAmount : 0;
      return {
        optionId,
        calculationType,
        responseCount: option.responseCount,
        ...calculateMealChargeGroup(calculationType, enteredAmount, option.responseCount),
      };
    });
    summary = summarizeMealChargeGroups(results);
  } catch {
    return mockBadRequest('MEAL_CHARGE_AMOUNT_OVERFLOW', '청구 금액이 처리 가능한 범위를 벗어났습니다.');
  }
  const chargedAt = new Date().toISOString();
  const chargedDetail: MealPollDetail = {
    ...detail,
    settlementStatus: 'CHARGED',
    options: detail.options.map((option) => {
      const result = results.find((item) => item.optionId === option.optionId);
      return result
        ? {
            ...option,
            charge: {
              chargeStatus: 'CHARGED' as const,
              ...result,
              chargedMemberCount: option.responseCount,
              paymentAccountId,
              chargedByMe: true,
              chargedAt,
            },
          }
        : option;
    }),
  };
  const result: MealChargeResult = {
    pollId,
    paymentAccountId,
    ...summary,
    chargedAt,
    groups: results,
  };
  const activeAccount = mockMealState.accounts.find((account) =>
    account.id === paymentAccountId && account.campusId === campusId && account.ownerUserId === userId,
  );
  if (!activeAccount) return mockBadRequest('MEAL_PAYMENT_ACCOUNT_INVALID', '본인의 활성 MEAL 계좌를 선택해 주세요.');
  let nextSettlement: MealSettlement;
  let chargeMaterialization: ReturnType<typeof materializeMockMealCharges>;
  try {
    chargeMaterialization = materializeMockMealCharges(
      mockMealState.memberChargeIssuedAt,
      mockMealState.memberCharges,
      mockMealState.nextChargeItemId,
      activeAccount,
      detail,
      results,
      chargedAt,
    );
    nextSettlement = appendMockMealSettlement(
      mockMealState.settlement,
      activeAccount,
      chargeMaterialization.settlementCharges,
      summary,
    );
  } catch {
    return mockBadRequest('MEAL_CHARGE_AMOUNT_OVERFLOW', '청구 금액이 처리 가능한 범위를 벗어났습니다.');
  }
  mockMealState.details[detailIndex] = chargedDetail;
  mockMealState.polls = mockMealState.polls.map((poll) =>
    poll.id === pollId ? {...poll, settlementStatus: 'CHARGED'} : poll,
  );
  mockMealState.settlement = nextSettlement;
  mockMealState.memberChargeIssuedAt = chargeMaterialization.memberChargeIssuedAt;
  mockMealState.memberCharges = chargeMaterialization.memberCharges;
  mockMealState.nextChargeItemId = chargeMaterialization.nextChargeItemId;
  return result;
}

type MealChargeResultSummary = Pick<
  MealChargeResult,
  'actualTotalAmount' | 'chargedMemberCount' | 'requestedTotalAmount' | 'roundingAdjustment'
>;

function materializeMockMealCharges(
  currentIssuedAt: Record<number, string>,
  current: Record<string, ChargeItem[]>,
  nextChargeItemId: number,
  account: MealPaymentAccount,
  detail: MealPollDetail,
  groups: MealChargeGroupResult[],
  chargedAt: string,
) {
  const memberCharges = Object.fromEntries(
    Object.entries(current).map(([memberKey, charges]) => [memberKey, [...charges]]),
  ) as Record<string, ChargeItem[]>;
  const memberChargeIssuedAt = {...currentIssuedAt};
  const settlementCharges: MealSettlementCharge[] = [];
  let nextId = nextChargeItemId;

  for (const [groupIndex, group] of groups.entries()) {
    const option = detail.options.find((item) => item.optionId === group.optionId);
    if (!option) throw new Error('Unknown option');
    const recordedResponses = Object.values(mockMealState.responses).filter(
      (response) => response.pollId === detail.id && response.optionIds.includes(group.optionId),
    );
    if (recordedResponses.length > group.responseCount) throw new Error('Invalid response count');

    for (const response of recordedResponses) {
      const chargeId = claimNextMockChargeId(nextId);
      nextId = chargeId + 1;
      const memberName = getMockMealCampusMember(detail.campusId, response.userId)?.name
        ?? `사용자 ${response.userId}`;
      const charge: ChargeItem = {
        id: chargeId,
        paymentCategory: 'MEAL',
        title: detail.title,
        reason: option.content,
        amount: group.amountPerMember,
        status: 'UNPAID',
        dueDate: null,
        paidAt: null,
        account: {
          paymentAccountId: account.id,
          bankName: account.bankName,
          accountNumber: account.accountNumber,
          accountHolder: account.accountHolder,
        },
        source: {sourceType: 'POLL_RESPONSE', sourceId: response.responseId},
      };
      const memberChargeKey = mockMealMemberChargeKey(detail.campusId, response.userId);
      memberCharges[memberChargeKey] = [...(memberCharges[memberChargeKey] ?? []), charge];
      memberChargeIssuedAt[chargeId] = chargedAt;
      settlementCharges.push(toMockMealSettlementCharge(
        chargeId,
        detail,
        option.content,
        memberName,
        group.amountPerMember,
        chargedAt,
      ));
    }

    const unrecordedCount = group.responseCount - recordedResponses.length;
    for (let index = 0; index < unrecordedCount; index += 1) {
      const chargeId = claimNextMockChargeId(nextId);
      nextId = chargeId + 1;
      settlementCharges.push(toMockMealSettlementCharge(
        chargeId,
        detail,
        option.content,
        `응답자 ${groupIndex + 1}-${index + 1}`,
        group.amountPerMember,
        chargedAt,
      ));
    }
  }

  return {memberChargeIssuedAt, memberCharges, nextChargeItemId: nextId, settlementCharges};
}

function claimNextMockChargeId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value === Number.MAX_SAFE_INTEGER) {
    throw new Error('Unsafe mock charge id');
  }
  return value;
}

function toMockMealSettlementCharge(
  chargeId: number,
  detail: MealPollDetail,
  optionContent: string,
  memberName: string,
  amount: number,
  chargedAt: string,
): MealSettlementCharge {
  return {
    chargeId,
    pollId: detail.id,
    pollTitle: detail.title,
    optionContent,
    memberName,
    amount,
    status: 'UNPAID',
    chargedAt,
  };
}

function summarizeMealChargeGroups(groups: MealChargeGroupResult[]): MealChargeResultSummary {
  return groups.reduce<MealChargeResultSummary>(
    (summary, group) => ({
      chargedMemberCount: safeMockAdd(summary.chargedMemberCount, group.responseCount),
      requestedTotalAmount: safeMockAdd(summary.requestedTotalAmount, group.requestedTotalAmount),
      actualTotalAmount: safeMockAdd(summary.actualTotalAmount, group.actualTotalAmount),
      roundingAdjustment: safeMockAdd(summary.roundingAdjustment, group.roundingAdjustment),
    }),
    emptyMealSettlementSummary(),
  );
}

function appendMockMealSettlement(
  settlement: MealSettlement,
  account: MealPaymentAccount,
  charges: MealSettlementCharge[],
  summary: MealChargeResultSummary,
): MealSettlement {
  const existing = settlement.accounts.find((item) => item.account.id === account.id);
  const accountSettlement = existing
    ? {
        account,
        charges: [...existing.charges, ...charges],
        summary: addMealSettlementSummaries(existing.summary, summary),
      }
    : {account, charges, summary};
  const accounts = existing
    ? settlement.accounts.map((item) => item.account.id === account.id ? accountSettlement : item)
    : [...settlement.accounts, accountSettlement];
  return {
    accounts,
    summary: accounts.reduce(
      (total, item) => addMealSettlementSummaries(total, item.summary),
      emptyMealSettlementSummary(),
    ),
  };
}

function addMealSettlementSummaries(
  left: MealChargeResultSummary,
  right: MealChargeResultSummary,
): MealChargeResultSummary {
  return {
    chargedMemberCount: safeMockAdd(left.chargedMemberCount, right.chargedMemberCount),
    requestedTotalAmount: safeMockAdd(left.requestedTotalAmount, right.requestedTotalAmount),
    actualTotalAmount: safeMockAdd(left.actualTotalAmount, right.actualTotalAmount),
    roundingAdjustment: safeMockAdd(left.roundingAdjustment, right.roundingAdjustment),
  };
}

function safeMockAdd(left: number, right: number) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left > Number.MAX_SAFE_INTEGER - right) {
    throw new Error('Unsafe mock amount');
  }
  return left + right;
}

function getMockMealSettlement(campusId: number, userId: number): MealSettlement {
  const accounts = mockMealState.settlement.accounts.filter(
    (item) => item.account.campusId === campusId && item.account.ownerUserId === userId,
  );
  return {
    accounts,
    summary: accounts.reduce(
      (summary, item) => addMealSettlementSummaries(summary, item.summary),
      emptyMealSettlementSummary(),
    ),
  };
}

function getMockMemberChargeList(
  actor: MockMealActor | null,
  campusId: number,
  searchParams: URLSearchParams,
): ChargeList {
  const legacyBilling = mockMealState.legacyBilling;
  const ownsLegacyBilling = actor?.userId === legacyBilling.summary.userId &&
    campusId === legacyBilling.charges.campusId
  const legacyItems = ownsLegacyBilling ? legacyBilling.charges.items : [];
  const mealCharges = actor?.campusIds.includes(campusId)
    ? mockMealState.memberCharges[mockMealMemberChargeKey(campusId, actor.userId)] ?? []
    : [];
  const requestedCategory = searchParams.get('paymentCategory');
  const requestedStatus = searchParams.get('status');
  const visibleItems = [...legacyItems, ...mealCharges].filter((charge) =>
    (requestedCategory === null || charge.paymentCategory === requestedCategory) &&
    (requestedStatus === null || charge.status === requestedStatus),
  );
  const sort = searchParams.get('sort') ?? 'createdAt,desc';
  const sortedItems = [...visibleItems].sort((left, right) => {
    if (sort.startsWith('amount,')) {
      return sort.endsWith(',asc') ? left.amount - right.amount : right.amount - left.amount;
    }
    return sort.endsWith(',asc') ? left.id - right.id : right.id - left.id;
  });
  const pageValue = Number(searchParams.get('page') ?? 0);
  const sizeValue = Number(searchParams.get('size') ?? 20);
  const page = Number.isSafeInteger(pageValue) && pageValue >= 0 ? pageValue : 0;
  const size = Number.isSafeInteger(sizeValue) && sizeValue > 0 ? Math.min(sizeValue, 100) : 20;
  const start = page * size;
  const campusIdentity = getMockChargeCampusIdentity(legacyBilling.charges, campusId);
  return {
    ...campusIdentity,
    summary: summarizeMockMemberCharges(visibleItems),
    items: sortedItems.slice(start, start + size),
  };
}

function getMockMemberChargeSummary(
  actor: MockMealActor | null,
  campusId: number,
  period: MockChargePeriod,
): ChargeSummary {
  if (!actor) throw new Error('Authorized mock member required');
  const legacyBilling = mockMealState.legacyBilling;
  const ownsLegacy = actor.userId === legacyBilling.summary.userId &&
    campusId === legacyBilling.summary.campusId;
  const includesLegacyMonth = ownsLegacy && isSameMockChargePeriod(period, legacyBilling.period);
  const allMemberCharges = mockMealState.memberCharges[
    mockMealMemberChargeKey(campusId, actor.userId)
  ] ?? [];
  const memberCharges = allMemberCharges.filter((charge) => isMockChargeInPeriod(
    mockMealState.memberChargeIssuedAt[charge.id],
    period,
  ));
  const monthlyByCategory = new Map<PaymentCategory, ChargeSummary['monthlyByCategory'][number]>();

  if (includesLegacyMonth) {
    for (const category of legacyBilling.summary.monthlyByCategory) {
      monthlyByCategory.set(category.paymentCategory, {...category});
    }
  }

  let dynamicPaidAmount = 0;
  let dynamicUnpaidAmount = 0;
  for (const charge of memberCharges) {
    if (charge.status !== 'PAID' && charge.status !== 'UNPAID') continue;
    const paidAmount = charge.status === 'PAID' ? charge.amount : 0;
    const unpaidAmount = charge.status === 'UNPAID' ? charge.amount : 0;
    dynamicPaidAmount = safeMockAdd(dynamicPaidAmount, paidAmount);
    dynamicUnpaidAmount = safeMockAdd(dynamicUnpaidAmount, unpaidAmount);
    const previous = monthlyByCategory.get(charge.paymentCategory) ?? {
      paymentCategory: charge.paymentCategory,
      paidAmount: 0,
      unpaidAmount: 0,
      totalAmount: 0,
    };
    monthlyByCategory.set(charge.paymentCategory, {
      paymentCategory: charge.paymentCategory,
      paidAmount: safeMockAdd(previous.paidAmount, paidAmount),
      unpaidAmount: safeMockAdd(previous.unpaidAmount, unpaidAmount),
      totalAmount: safeMockAdd(previous.totalAmount, charge.amount),
    });
  }

  const member = getMockMealCampusMember(campusId, actor.userId);
  const basePaidAmount = includesLegacyMonth ? legacyBilling.summary.monthlyPaidAmount : 0;
  const baseUnpaidAmount = includesLegacyMonth ? legacyBilling.summary.monthlyUnpaidAmount : 0;
  const baseTotalAmount = includesLegacyMonth ? legacyBilling.summary.monthlyTotalChargeAmount : 0;
  const dynamicTotalPaidAmount = allMemberCharges.reduce(
    (total, charge) => safeMockAdd(total, charge.status === 'PAID' ? charge.amount : 0),
    0,
  );
  const campusIdentity = getMockChargeCampusIdentity(legacyBilling.charges, campusId);
  return {
    ...campusIdentity,
    userId: actor.userId,
    name: member?.name ?? `사용자 ${actor.userId}`,
    totalPaidAmount: safeMockAdd(
      ownsLegacy ? legacyBilling.summary.totalPaidAmount : 0,
      dynamicTotalPaidAmount,
    ),
    monthlyPaidAmount: safeMockAdd(basePaidAmount, dynamicPaidAmount),
    monthlyUnpaidAmount: safeMockAdd(baseUnpaidAmount, dynamicUnpaidAmount),
    monthlyTotalChargeAmount: safeMockAdd(
      baseTotalAmount,
      safeMockAdd(dynamicPaidAmount, dynamicUnpaidAmount),
    ),
    monthlyByCategory: [...monthlyByCategory.values()],
  };
}

function getMockChargeCampusIdentity(
  fixture: Pick<ChargeList, 'campusId' | 'campusName' | 'region'>,
  campusId: number,
) {
  return campusId === fixture.campusId
    ? {campusId, campusName: fixture.campusName, region: fixture.region}
    : {campusId, campusName: `캠퍼스 ${campusId}`, region: '지역 정보 없음'};
}

function parseMockChargeSummaryPeriod(
  searchParams: URLSearchParams,
): MockChargePeriod | MockErrorResult {
  const year = Number(searchParams.get('year'));
  const month = Number(searchParams.get('month'));
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return mockBadRequest('CHARGE_SUMMARY_PERIOD_INVALID', '납부 요약 조회 연월이 올바르지 않습니다.');
  }
  return {month, year};
}

function isMockChargeInPeriod(
  chargedAt: string | undefined,
  period: MockChargePeriod,
) {
  if (!chargedAt) return false;
  const date = new Date(chargedAt);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === period.year &&
    date.getUTCMonth() + 1 === period.month
  );
}

function isSameMockChargePeriod(left: MockChargePeriod, right: MockChargePeriod) {
  return left.year === right.year && left.month === right.month;
}

function summarizeMockMemberCharges(items: ChargeItem[]) {
  return items.reduce(
    (summary, charge) => ({
      totalAmount: safeMockAdd(summary.totalAmount, charge.amount),
      unpaidAmount: safeMockAdd(
        summary.unpaidAmount,
        charge.status === 'UNPAID' ? charge.amount : 0,
      ),
      paidAmount: safeMockAdd(
        summary.paidAmount,
        charge.status === 'PAID' ? charge.amount : 0,
      ),
      waivedAmount: safeMockAdd(
        summary.waivedAmount,
        charge.status === 'WAIVED' ? charge.amount : 0,
      ),
      canceledAmount: safeMockAdd(
        summary.canceledAmount,
        charge.status === 'CANCELED' ? charge.amount : 0,
      ),
    }),
    emptyMockChargeAmountSummary(),
  );
}

function emptyMockChargeAmountSummary(): ChargeAmountSummary {
  return {totalAmount: 0, unpaidAmount: 0, paidAmount: 0, waivedAmount: 0, canceledAmount: 0};
}

function addMockChargeAmountSummaries(
  left: ChargeAmountSummary,
  right: ChargeAmountSummary,
): ChargeAmountSummary {
  return {
    totalAmount: safeMockAdd(left.totalAmount, right.totalAmount),
    unpaidAmount: safeMockAdd(left.unpaidAmount, right.unpaidAmount),
    paidAmount: safeMockAdd(left.paidAmount, right.paidAmount),
    waivedAmount: safeMockAdd(left.waivedAmount, right.waivedAmount),
    canceledAmount: safeMockAdd(left.canceledAmount, right.canceledAmount),
  };
}

function markMockMealChargePaid(
  actor: MockMealActor | null,
  campusId: number,
  chargeItemId: number | null,
): MarkChargePaidResponse | MockErrorResult | null {
  if (!actor || !actor.campusIds.includes(campusId) || chargeItemId === null) return null;
  const memberChargeKey = mockMealMemberChargeKey(campusId, actor.userId);
  const charges = mockMealState.memberCharges[memberChargeKey] ?? [];
  const chargeIndex = charges.findIndex((charge) => charge.id === chargeItemId);
  const charge = charges[chargeIndex];
  if (!charge) return markMockLegacyChargePaid(actor, campusId, chargeItemId);
  if (charge.status !== 'UNPAID') {
    return mockConflict('CHARGE_ALREADY_TERMINAL', '이미 처리된 청구입니다.');
  }

  const paidAt = new Date().toISOString();
  const paidCharge: ChargeItem = {...charge, status: 'PAID', paidAt};
  mockMealState.memberCharges[memberChargeKey] = charges.map((item, index) =>
    index === chargeIndex ? paidCharge : item,
  );
  mockMealState.settlement = {
    ...mockMealState.settlement,
    accounts: mockMealState.settlement.accounts.map((item) => ({
      ...item,
      charges: item.charges.map((settlementCharge) =>
        settlementCharge.chargeId === chargeItemId
          ? {...settlementCharge, status: 'PAID'}
          : settlementCharge,
      ),
    })),
  };

  return {
    id: paidCharge.id,
    campusId,
    userId: actor.userId,
    paymentCategory: paidCharge.paymentCategory,
    title: paidCharge.title,
    ...(paidCharge.reason === undefined ? {} : {reason: paidCharge.reason}),
    amount: paidCharge.amount,
    status: paidCharge.status,
    paidAt,
  };
}

function markMockLegacyChargePaid(
  actor: MockMealActor,
  campusId: number,
  chargeItemId: number,
): MarkChargePaidResponse | MockErrorResult | null {
  const legacyBilling = mockMealState.legacyBilling;
  if (
    actor.userId !== legacyBilling.summary.userId ||
    campusId !== legacyBilling.charges.campusId
  ) {
    return null;
  }
  const chargeIndex = legacyBilling.charges.items.findIndex((charge) => charge.id === chargeItemId);
  const charge = legacyBilling.charges.items[chargeIndex];
  if (!charge) return null;
  if (charge.status !== 'UNPAID') {
    return mockConflict('CHARGE_ALREADY_TERMINAL', '이미 처리된 청구입니다.');
  }
  const transitioned = transitionMockLegacyChargeStatus(
    chargeItemId,
    'PAID',
    new Date().toISOString(),
  );
  if (!transitioned || isMockErrorResult(transitioned)) return transitioned;

  return {
    id: transitioned.id,
    campusId,
    userId: actor.userId,
    paymentCategory: transitioned.paymentCategory,
    title: transitioned.title,
    ...(transitioned.reason === undefined ? {} : {reason: transitioned.reason}),
    amount: transitioned.amount,
    status: transitioned.status,
    paidAt: transitioned.paidAt ?? null,
  };
}

type MockCanonicalAdminCharge = {
  campusId: number;
  charge: ChargeItem;
  kind: 'legacy' | 'meal';
  memberChargeKey?: string;
  userId: number;
};

function findMockCanonicalAdminCharge(chargeItemId: number): MockCanonicalAdminCharge | null {
  const legacyBilling = mockMealState.legacyBilling;
  const legacyCharge = legacyBilling.charges.items.find((charge) => charge.id === chargeItemId);
  if (legacyCharge) {
    return {
      campusId: legacyBilling.charges.campusId,
      charge: legacyCharge,
      kind: 'legacy',
      userId: legacyBilling.summary.userId,
    };
  }

  for (const [memberChargeKey, charges] of Object.entries(mockMealState.memberCharges)) {
    const charge = charges.find((candidate) => candidate.id === chargeItemId);
    if (!charge) continue;
    const parts = memberChargeKey.split(':');
    const campusId = Number(parts[0] ?? Number.NaN);
    const userId = Number(parts[1] ?? Number.NaN);
    if (
      !Number.isSafeInteger(campusId) || campusId <= 0 ||
      !Number.isSafeInteger(userId) || userId <= 0
    ) {
      throw new Error('Invalid canonical mock charge owner');
    }
    return {campusId, charge, kind: 'meal', memberChargeKey, userId};
  }

  return null;
}

function transitionMockCanonicalAdminCharge(
  canonical: MockCanonicalAdminCharge,
  targetStatus: ChargeItem['status'],
  paidAt: string | null,
) {
  if (canonical.kind === 'legacy') {
    return transitionMockLegacyChargeStatus(canonical.charge.id, targetStatus, paidAt);
  }
  const memberChargeKey = canonical.memberChargeKey;
  if (!memberChargeKey) throw new Error('Canonical meal charge key required');
  const charges = mockMealState.memberCharges[memberChargeKey] ?? [];
  const chargeIndex = charges.findIndex((charge) => charge.id === canonical.charge.id);
  const charge = charges[chargeIndex];
  if (!charge) return null;
  const transitionDenied = validateMockAdminChargeTransition(charge.status, targetStatus);
  if (transitionDenied) return transitionDenied;
  const transitioned: ChargeItem = {
    ...charge,
    status: targetStatus,
    paidAt: targetStatus === 'PAID' ? paidAt : null,
  };
  mockMealState.memberCharges[memberChargeKey] = charges.map((item, index) =>
    index === chargeIndex ? transitioned : item,
  );
  mockMealState.settlement = {
    ...mockMealState.settlement,
    accounts: mockMealState.settlement.accounts.map((account) => ({
      ...account,
      charges: account.charges.map((settlementCharge) =>
        settlementCharge.chargeId === transitioned.id
          ? {...settlementCharge, status: targetStatus}
          : settlementCharge,
      ),
    })),
  };
  return transitioned;
}

function transitionMockLegacyChargeStatus(
  chargeItemId: number,
  targetStatus: ChargeItem['status'],
  paidAt: string | null,
): ChargeItem | MockErrorResult | null {
  const legacyBilling = mockMealState.legacyBilling;
  const chargeIndex = legacyBilling.charges.items.findIndex((charge) => charge.id === chargeItemId);
  const charge = legacyBilling.charges.items[chargeIndex];
  if (!charge) return null;
  const transitionDenied = validateMockAdminChargeTransition(charge.status, targetStatus);
  if (transitionDenied) return transitionDenied;
  const categoryIndex = legacyBilling.summary.monthlyByCategory.findIndex(
    (category) => category.paymentCategory === charge.paymentCategory,
  );
  const category = legacyBilling.summary.monthlyByCategory[categoryIndex];
  if (!category) {
    return mockBadRequest('MOCK_CHARGE_SUMMARY_INVALID', '청구 요약 상태가 올바르지 않습니다.');
  }

  const nextChargeSummary = moveMockChargeAmount(
    legacyBilling.charges.summary,
    charge.status,
    targetStatus,
    charge.amount,
  );
  const nextMonthlyAmounts = moveMockPaidUnpaidAmounts(
    {
      paidAmount: legacyBilling.summary.monthlyPaidAmount,
      unpaidAmount: legacyBilling.summary.monthlyUnpaidAmount,
    },
    charge.status,
    targetStatus,
    charge.amount,
  );
  const nextCategoryAmounts = moveMockPaidUnpaidAmounts(
    {paidAmount: category.paidAmount, unpaidAmount: category.unpaidAmount},
    charge.status,
    targetStatus,
    charge.amount,
  );
  const nextTotalPaidAmount = moveMockTotalPaidAmount(
    legacyBilling.summary.totalPaidAmount,
    charge.status,
    targetStatus,
    charge.amount,
  );
  if (
    isMockErrorResult(nextChargeSummary) ||
    isMockErrorResult(nextMonthlyAmounts) ||
    isMockErrorResult(nextCategoryAmounts) ||
    isMockErrorResult(nextTotalPaidAmount)
  ) {
    return mockBadRequest('MOCK_CHARGE_SUMMARY_INVALID', '청구 요약 상태가 올바르지 않습니다.');
  }

  const transitionedCharge: ChargeItem = {
    ...charge,
    status: targetStatus,
    paidAt: targetStatus === 'PAID' ? paidAt : null,
  };
  const nextItems = legacyBilling.charges.items.map((item, index) =>
    index === chargeIndex ? transitionedCharge : item,
  );
  mockMealState.legacyBilling = {
    ...legacyBilling,
    charges: {
      ...legacyBilling.charges,
      items: nextItems,
      summary: nextChargeSummary,
    },
    summary: {
      ...legacyBilling.summary,
      totalPaidAmount: nextTotalPaidAmount.value,
      monthlyPaidAmount: nextMonthlyAmounts.paidAmount,
      monthlyUnpaidAmount: nextMonthlyAmounts.unpaidAmount,
      monthlyByCategory: legacyBilling.summary.monthlyByCategory.map((item, index) =>
        index === categoryIndex
          ? {
              ...item,
              paidAmount: nextCategoryAmounts.paidAmount,
              unpaidAmount: nextCategoryAmounts.unpaidAmount,
            }
          : item,
      ),
    },
  };

  return transitionedCharge;
}

function validateMockAdminChargeTransition(
  previousStatus: ChargeItem['status'],
  targetStatus: ChargeItem['status'],
) {
  if (previousStatus === targetStatus) {
    return mockConflict('CHARGE_ALREADY_TERMINAL', '이미 처리된 청구입니다.');
  }
  if (previousStatus === 'UNPAID' || targetStatus === 'UNPAID') {
    return null;
  }
  return mockConflict('CHARGE_STATUS_CONFLICT', '완료된 청구는 미납 상태로만 복구할 수 있습니다.');
}

function moveMockChargeAmount(
  summary: ChargeAmountSummary,
  previousStatus: ChargeItem['status'],
  nextStatus: ChargeItem['status'],
  amount: number,
): ChargeAmountSummary | MockErrorResult {
  const previousKey = getMockSummaryKey(previousStatus);
  const nextKey = getMockSummaryKey(nextStatus);
  if (summary[previousKey] < amount) {
    return mockBadRequest('MOCK_CHARGE_SUMMARY_INVALID', '청구 요약 상태가 올바르지 않습니다.');
  }
  return {
    ...summary,
    [previousKey]: summary[previousKey] - amount,
    [nextKey]: safeMockAdd(summary[nextKey], amount),
  };
}

function moveMockPaidUnpaidAmounts(
  summary: {paidAmount: number; unpaidAmount: number},
  previousStatus: ChargeItem['status'],
  nextStatus: ChargeItem['status'],
  amount: number,
): {paidAmount: number; unpaidAmount: number} | MockErrorResult {
  let {paidAmount, unpaidAmount} = summary;
  if (previousStatus === 'PAID') {
    if (paidAmount < amount) return mockBadRequest('MOCK_CHARGE_SUMMARY_INVALID', '청구 요약 상태가 올바르지 않습니다.');
    paidAmount -= amount;
  }
  if (previousStatus === 'UNPAID') {
    if (unpaidAmount < amount) return mockBadRequest('MOCK_CHARGE_SUMMARY_INVALID', '청구 요약 상태가 올바르지 않습니다.');
    unpaidAmount -= amount;
  }
  if (nextStatus === 'PAID') paidAmount = safeMockAdd(paidAmount, amount);
  if (nextStatus === 'UNPAID') unpaidAmount = safeMockAdd(unpaidAmount, amount);
  return {paidAmount, unpaidAmount};
}

function moveMockTotalPaidAmount(
  totalPaidAmount: number,
  previousStatus: ChargeItem['status'],
  nextStatus: ChargeItem['status'],
  amount: number,
): {value: number} | MockErrorResult {
  let value = totalPaidAmount;
  if (previousStatus === 'PAID') {
    if (value < amount) return mockBadRequest('MOCK_CHARGE_SUMMARY_INVALID', '청구 요약 상태가 올바르지 않습니다.');
    value -= amount;
  }
  if (nextStatus === 'PAID') value = safeMockAdd(value, amount);
  return {value};
}

function getMockMealCampusMember(campusId: number, userId: number) {
  const members = [
    {campusId: 1, userId: 7, name: '샘플 사용자', email: 'faithlog.user@example.test'},
    {campusId: 1, userId: 8, name: '두 번째 담당자', email: 'meal.manager@example.test'},
    {campusId: 1, userId: 9, name: '캠퍼스 관리자', email: 'campus.admin@example.test'},
    {campusId: 1, userId: 18, name: '이전 담당자', email: 'inactive.meal@example.test'},
    {campusId: 2, userId: 17, name: '다른 캠퍼스 담당자', email: 'campus2.meal@example.test'},
  ];
  return members.find((member) => member.campusId === campusId && member.userId === userId);
}

function emptyMealSettlementSummary() {
  return {
    chargedMemberCount: 0,
    requestedTotalAmount: 0,
    actualTotalAmount: 0,
    roundingAdjustment: 0,
  };
}

function getMockMealActor(headers: HeadersInit | undefined): MockMealActor | null {
  const authorization = new Headers(headers).get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  const actors: Record<string, MockMealActor> = {
    [mealMockAccessTokens.activeDuty]: {userId: 7, campusIds: [1], adminCampusIds: [1]},
    [mealMockAccessTokens.otherDuty]: {userId: 8, campusIds: [1], adminCampusIds: []},
    [mealMockAccessTokens.nonDutyAdmin]: {userId: 9, campusIds: [1], adminCampusIds: [1]},
    [mealMockAccessTokens.inactiveDuty]: {userId: 18, campusIds: [1], adminCampusIds: []},
    [mealMockAccessTokens.otherCampusDuty]: {userId: 17, campusIds: [2], adminCampusIds: []},
  };
  return actors[token] ?? null;
}

function getCampusId(path: string) {
  const match = /^\/(?:admin\/)?campuses\/(\d+)/.exec(path);
  return match ? Number(match[1]) : 0;
}

function authorizeCampusMember(actor: MockMealActor | null, campusId: number) {
  if (!actor) return mockUnauthorized('AUTH_REQUIRED', '로그인이 필요합니다.');
  return actor.campusIds.includes(campusId)
    ? null
    : mockNotFound('CAMPUS_NOT_FOUND', '캠퍼스를 찾을 수 없습니다.');
}

function authorizeMealDuty(actor: MockMealActor | null, campusId: number) {
  const membershipDenied = authorizeCampusMember(actor, campusId);
  if (membershipDenied) return membershipDenied;
  return mockMealState.duties.some(
    (duty) => duty.campusId === campusId && duty.userId === actor?.userId && duty.isActive,
  )
    ? null
    : mockForbidden('MEAL_DUTY_REQUIRED', '활성 밥 담당자만 이용할 수 있습니다.');
}

function authorizeMealAdmin(actor: MockMealActor | null, campusId: number) {
  const membershipDenied = authorizeCampusMember(actor, campusId);
  if (membershipDenied) return membershipDenied;
  return actor?.adminCampusIds.includes(campusId)
    ? null
    : mockForbidden('CAMPUS_ADMIN_REQUIRED', '관리자 권한이 필요합니다.');
}

function mockBadRequest(code: string, message: string): MockErrorResult {
  return {code, message, mockError: true, status: 400};
}

function mockUnauthorized(code: string, message: string): MockErrorResult {
  return {code, message, mockError: true, status: 401};
}

function mockForbidden(code: string, message: string): MockErrorResult {
  return {code, message, mockError: true, status: 403};
}

function mockNotFound(code: string, message: string): MockErrorResult {
  return {code, message, mockError: true, status: 404};
}

function mockConflict(code: string, message: string): MockErrorResult {
  return {code, message, mockError: true, status: 409};
}

function isMockErrorResult(value: unknown): value is MockErrorResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.mockError === true &&
    typeof record.code === 'string' &&
    typeof record.message === 'string' &&
    typeof record.status === 'number'
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function hasUnexpectedKeys(record: Record<string, unknown>, allowedKeys: readonly string[]) {
  return Object.keys(record).some((key) => !allowedKeys.includes(key));
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
