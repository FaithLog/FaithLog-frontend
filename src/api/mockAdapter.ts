import {
  createApiEnvelope,
  createApiErrorEnvelope,
  mockApiErrorFixtures,
  mockDomainFixtures,
} from './mockFixtures';
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
  const data = resolveMockData(route, init.body);

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

function resolveMockData(route: MockRoute, body?: BodyInit | null): unknown {
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
    return billing.summary;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/charges\/me$/.test(path)) {
    return billing.charges;
  }
  if (route.method === 'PATCH' && /^\/campuses\/\d+\/charges\/me\/\d+\/paid$/.test(path)) {
    return billing.paidCharge;
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
    return mockMealState.duties.find((duty) => duty.userId === 7 && duty.isActive);
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/meal\/payment-accounts\/me$/.test(path)
  ) {
    return route.searchParams.get('includeInactive') === 'false'
      ? mockMealState.accounts.filter((account) => account.isActive)
      : mockMealState.accounts;
  }
  if (
    route.method === 'POST' &&
    /^\/campuses\/\d+\/meal\/payment-accounts$/.test(path)
  ) {
    if (mockMealState.accounts.some((account) => account.isActive)) {
      return mockConflict(
        'MEAL_ACTIVE_ACCOUNT_EXISTS',
        '기존 활성 MEAL 계좌를 비활성화한 뒤 새 계좌를 등록해 주세요.',
      );
    }
    const bodyRecord = toRecord(parseMockJsonBody(body));
    const account: MealPaymentAccount = {
      id: Math.max(0, ...mockMealState.accounts.map((item) => item.id)) + 1,
      campusId: 1,
      ownerUserId: 7,
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
    const accountId = getPathNumberBeforeSuffix(path, 'deactivate');
    const index = mockMealState.accounts.findIndex((account) => account.id === accountId);
    const account = mockMealState.accounts[index];
    if (!account) return missingMockFixture;
    const deactivated = {...account, isActive: false, deactivatedAt: new Date().toISOString()};
    mockMealState.accounts[index] = deactivated;
    return deactivated;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/meal\/polls$/.test(path)) {
    const requestedStatus = route.searchParams.get('status');
    const filtered = requestedStatus
      ? mockMealState.polls.filter((poll) => poll.status === requestedStatus)
      : mockMealState.polls;
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
    return createMockMealPoll(parseMockJsonBody(body));
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/meal\/polls\/\d+$/.test(path)) {
    const pollId = getLastPathNumber(path);
    return mockMealState.details.find((detail) => detail.id === pollId) ?? missingMockFixture;
  }
  if (
    route.method === 'PATCH' &&
    /^\/campuses\/\d+\/meal\/polls\/\d+\/close$/.test(path)
  ) {
    return closeMockMealPoll(getPathNumberBeforeSuffix(path, 'close'));
  }
  if (
    route.method === 'POST' &&
    /^\/campuses\/\d+\/meal\/polls\/\d+\/charges$/.test(path)
  ) {
    return chargeMockMealPoll(
      getPathNumberBeforeSuffix(path, 'charges'),
      parseMockJsonBody(body),
    );
  }
  if (
    route.method === 'GET' &&
    /^\/campuses\/\d+\/meal\/charges\/my-accounts$/.test(path)
  ) {
    return mockMealState.settlement;
  }
  if (route.method === 'GET' && path === '/coffee-brands') return billing.coffeeBrands;
  if (route.method === 'GET' && /^\/coffee-brands\/\d+\/menus$/.test(path)) {
    return billing.coffeeMenus;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls$/.test(path)) {
    return [...poll.summaries, ...mockMealState.polls.map(toGeneralMealPollSummary)];
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls\/\d+$/.test(path)) {
    const pollId = getLastPathNumber(path);
    const mealDetail = mockMealState.details.find((detail) => detail.id === pollId);

    return mealDetail
      ? toGeneralMealPollDetail(mealDetail)
      : poll.details.find((detail) => detail.id === pollId) ?? poll.detail;
  }
  if (
    route.method === 'PUT' &&
    /^\/campuses\/\d+\/polls\/\d+\/responses\/me$/.test(path)
  ) {
    const pollId = getPathNumberBeforeSuffix(path, 'responses/me');
    const mealDetail = mockMealState.details.find((detail) => detail.id === pollId);
    if (mealDetail && pollId !== null) {
      const request = toRecord(parseMockJsonBody(body));
      const optionIds = Array.isArray(request.optionIds)
        ? request.optionIds.filter((value): value is number => typeof value === 'number')
        : [];
      mockMealState.responses[pollId] = {
        responseId: 7000 + pollId,
        pollId,
        optionIds,
        respondedAt: new Date().toISOString(),
      };
      return mockMealState.responses[pollId];
    }
    return poll.response;
  }
  if (
    route.method === 'POST' &&
    /^\/campuses\/\d+\/polls\/\d+\/options$/.test(path)
  ) {
    const pollId = getPathNumberBeforeSuffix(path, 'options');
    const detailIndex = mockMealState.details.findIndex((detail) => detail.id === pollId);
    const detail = mockMealState.details[detailIndex];
    if (detail) {
      if (detail.status !== 'OPEN' || !detail.allowUserOptionAdd) {
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
  if (route.method === 'GET' && /^\/admin\/campuses\/\d+\/charges$/.test(path)) {
    return admin.campusCharges;
  }
  if (
    route.method === 'GET' &&
    /^\/admin\/campuses\/\d+\/members\/\d+\/charges$/.test(path)
  ) {
    return admin.memberCharges;
  }
  if (route.method === 'PATCH' && /^\/admin\/charges\/\d+\/status$/.test(path)) {
    return admin.chargeStatusChange;
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
    return [...admin.dutyAssignments, ...mockMealState.duties];
  }
  if (
    route.method === 'POST' &&
    /^\/admin\/campuses\/\d+\/duty-assignments\/meal$/.test(path)
  ) {
    const request = toRecord(parseMockJsonBody(body));
    const userId = typeof request.userId === 'number' ? request.userId : 8;
    const existing = mockMealState.duties.find((duty) => duty.userId === userId && duty.isActive);
    if (existing) return existing;
    const member = admin.members.find((item) => item.userId === userId);
    const assignment: MealDutyAssignment = {
      assignmentId: Math.max(1201, ...mockMealState.duties.map((duty) => duty.assignmentId)) + 1,
      campusId: 1,
      userId,
      name: member?.name ?? `멤버 ${userId}`,
      email: member?.email ?? `member${userId}@example.test`,
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
    const assignmentId = getLastPathNumber(path);
    mockMealState.duties = mockMealState.duties.filter(
      (duty) => duty.assignmentId !== assignmentId,
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

function withoutApiPrefix(pathname: string) {
  return pathname.startsWith('/api/v1') ? pathname.slice('/api/v1'.length) || '/' : pathname;
}

type MockMealState = {
  accounts: MealPaymentAccount[];
  details: MealPollDetail[];
  duties: MealDutyAssignment[];
  polls: MealPollSummary[];
  responses: Record<number, {optionIds: number[]; pollId: number; respondedAt: string; responseId: number}>;
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
    polls,
    responses: {},
    details,
    duties: [
      {assignmentId: 1301, campusId: 1, userId: 7, name: '샘플 사용자', email: 'faithlog.user@example.test', dutyType: 'MEAL', isActive: true, assignedAt: '2026-07-01T03:00:00.000Z'},
      {assignmentId: 1302, campusId: 1, userId: 8, name: '두 번째 담당자', email: 'meal.manager@example.test', dutyType: 'MEAL', isActive: true, assignedAt: '2026-07-02T03:00:00.000Z'},
    ],
    settlement: {accounts: [], summary: emptySummary},
  };
}

function toGeneralMealPollSummary(poll: MealPollSummary) {
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
    responded: Boolean(mockMealState.responses[poll.id]),
  };
}

function toGeneralMealPollDetail(detail: MealPollDetail) {
  return {
    ...toGeneralMealPollSummary(detail),
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
    myResponse: mockMealState.responses[detail.id] ?? null,
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

function createMockMealPoll(body: unknown) {
  const record = toRecord(body);
  const options = Array.isArray(record.options) ? record.options : [];
  const id = Math.max(...mockMealState.polls.map((poll) => poll.id)) + 1;
  const now = new Date().toISOString();
  const summary = mealPollSummary({
    id,
    title: stringField(record.title, '새 밥 투표'),
    description:
      typeof record.description === 'string' && record.description.trim()
        ? record.description.trim()
        : null,
    allowUserOptionAdd: record.allowUserOptionAdd === true,
    startsAt: now,
    endsAt: stringField(record.endsAt, '2026-07-20T03:00:00.000Z'),
    status: 'OPEN',
    totalResponseCount: 0,
  });
  const detail: MealPollDetail = {
    ...summary,
    options: options.map((item, index) => ({
      optionId: id * 10 + index + 1,
      content: stringField(toRecord(item).content, `선택지 ${index + 1}`),
      responseCount: 0,
      userAdded: false,
      charge: {chargeStatus: 'NOT_CHARGED'},
    })),
  };
  mockMealState.polls.unshift(summary);
  mockMealState.details.unshift(detail);
  return detail;
}

function closeMockMealPoll(pollId: number | null) {
  const detailIndex = mockMealState.details.findIndex((detail) => detail.id === pollId);
  const detail = mockMealState.details[detailIndex];
  if (!detail) return missingMockFixture;
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

function chargeMockMealPoll(pollId: number | null, body: unknown) {
  const detailIndex = mockMealState.details.findIndex((detail) => detail.id === pollId);
  const detail = mockMealState.details[detailIndex];
  if (!detail || pollId === null) return missingMockFixture;
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
  const paymentAccountId = request.paymentAccountId;
  if (
    typeof paymentAccountId !== 'number' ||
    !mockMealState.accounts.some((account) => account.id === paymentAccountId && account.isActive)
  ) {
    return mockBadRequest('MEAL_PAYMENT_ACCOUNT_INVALID', '본인의 활성 MEAL 계좌를 선택해 주세요.');
  }
  const groups = Array.isArray(request.groups) ? request.groups : [];
  if (
    groups.some((rawGroup) => {
      const group = toRecord(rawGroup);
      return (
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
  const chargedAt = new Date().toISOString();
  let chargedMemberCount = 0;
  let requestedTotalAmount = 0;
  let actualTotalAmount = 0;
  let roundingAdjustment = 0;
  const results: MealChargeGroupResult[] = groups.flatMap((rawGroup) => {
    const group = toRecord(rawGroup);
    const optionId = typeof group.optionId === 'number' ? group.optionId : 0;
    const option = chargeableOptions.find((item) => item.optionId === optionId);
    if (!option) return [];
    const calculationType: MealCalculationType = group.calculationType === 'GROUP_TOTAL' ? 'GROUP_TOTAL' : 'PER_MEMBER';
    const enteredAmount = typeof group.enteredAmount === 'number' ? group.enteredAmount : 0;
    const calculation = calculateMealChargeGroup(calculationType, enteredAmount, option.responseCount);
    chargedMemberCount += option.responseCount;
    requestedTotalAmount += calculation.requestedTotalAmount;
    actualTotalAmount += calculation.actualTotalAmount;
    roundingAdjustment += calculation.roundingAdjustment;
    return [{optionId, calculationType, responseCount: option.responseCount, ...calculation}];
  });
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
  mockMealState.details[detailIndex] = chargedDetail;
  mockMealState.polls = mockMealState.polls.map((poll) =>
    poll.id === pollId ? {...poll, settlementStatus: 'CHARGED'} : poll,
  );
  const result: MealChargeResult = {
    pollId,
    paymentAccountId,
    chargedMemberCount,
    requestedTotalAmount,
    actualTotalAmount,
    roundingAdjustment,
    chargedAt,
    groups: results,
  };
  const activeAccount = mockMealState.accounts.find((account) => account.id === paymentAccountId);
  if (activeAccount) {
    const summary = {chargedMemberCount, requestedTotalAmount, actualTotalAmount, roundingAdjustment};
    mockMealState.settlement = {
      summary,
      accounts: [{
        account: activeAccount,
        summary,
        charges: results.map((group, index) => ({
          chargeId: 5000 + index,
          pollId,
          pollTitle: detail.title,
          optionContent: detail.options.find((option) => option.optionId === group.optionId)?.content ?? '밥 청구',
          memberName: `응답자 ${index + 1}`,
          amount: group.amountPerMember,
          status: 'UNPAID',
          chargedAt,
        })),
      }],
    };
  }
  return result;
}

function mockBadRequest(code: string, message: string): MockErrorResult {
  return {code, message, mockError: true, status: 400};
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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
