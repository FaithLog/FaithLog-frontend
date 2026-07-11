import {
  createApiEnvelope,
  createApiErrorEnvelope,
  mockApiErrorFixtures,
  mockDomainFixtures,
} from './mockFixtures';

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
};

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const missingMockFixture = Symbol('missingMockFixture');
const mockCreatedPollTemplates: Array<Record<string, unknown>> = [];

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
  if (route.method === 'GET' && path === '/coffee-brands') return billing.coffeeBrands;
  if (route.method === 'GET' && /^\/coffee-brands\/\d+\/menus$/.test(path)) {
    return billing.coffeeMenus;
  }
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls$/.test(path)) return poll.summaries;
  if (route.method === 'GET' && /^\/campuses\/\d+\/polls\/\d+$/.test(path)) {
    const pollId = getLastPathNumber(path);

    return poll.details.find((detail) => detail.id === pollId) ?? poll.detail;
  }
  if (
    route.method === 'PUT' &&
    /^\/campuses\/\d+\/polls\/\d+\/responses\/me$/.test(path)
  ) {
    return poll.response;
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
    return admin.dutyAssignments;
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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
