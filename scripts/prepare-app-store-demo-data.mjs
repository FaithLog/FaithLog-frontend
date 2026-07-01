#!/usr/bin/env node

const apiBaseUrl =
  process.env.FAITHLOG_API_BASE_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://faithlog-549871256004.asia-northeast3.run.app';
const adminEmail = process.env.FAITHLOG_ADMIN_EMAIL;
const adminPassword = process.env.FAITHLOG_ADMIN_PASSWORD;
const runId =
  process.env.FAITHLOG_DEMO_RUN_ID ||
  new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

if (!adminEmail || !adminPassword) {
  console.error('FAITHLOG_ADMIN_EMAIL and FAITHLOG_ADMIN_PASSWORD are required.');
  process.exit(1);
}

const demoPassword = process.env.FAITHLOG_DEMO_PASSWORD || `FaithLog!${runId.slice(-6)}`;
const today = process.env.FAITHLOG_DEMO_DATE || '2026-07-01';
const weekStartDate = process.env.FAITHLOG_DEMO_WEEK_START || '2026-06-29';

const demoUsers = [
  {key: 'haeun', name: '김하은'},
  {key: 'junseo', name: '이준서'},
  {key: 'minjae', name: '박민재'},
  {key: 'seoyun', name: '최서윤'},
  {key: 'daeun', name: '정다은'},
  {key: 'jiho', name: '한지호'},
  {key: 'pastor', name: '오세훈'},
];

const output = {
  apiBaseUrl,
  runId,
  campus: null,
  users: [],
  accounts: {},
  prayer: {},
  polls: {},
  charges: {},
  backendQa: [],
  backendQaFailures: [],
};

main().catch((error) => {
  console.error(JSON.stringify({ok: false, message: error.message, detail: error.detail}, null, 2));
  process.exit(1);
});

async function main() {
  let adminToken = await getFreshAdminToken();

  const campus = await api('/api/v1/campuses', {
    token: adminToken,
    method: 'POST',
    body: {
      name: '은혜숲 청년부',
      region: '서울',
      description: '주일 예배와 소그룹 나눔을 함께하는 청년 공동체',
    },
  });
  output.campus = campus;

  const users = [];
  for (const demoUser of demoUsers) {
    const email = `faithlog.demo.${demoUser.key}.${runId}@example.com`;
    await api('/api/v1/auth/signup', {
      method: 'POST',
      body: {name: demoUser.name, email, password: demoPassword},
    });
    const session = await login(email, demoPassword);
    await api('/api/v1/campuses/join', {
      token: session.accessToken,
      method: 'POST',
      body: {inviteCode: campus.inviteCode},
    });
    const currentUser = await api('/api/v1/users/me', {token: session.accessToken});
    users.push({...demoUser, email, session, userId: currentUser.id});
  }
  output.users = users.map(({session: _session, ...user}) => user);

  adminToken = await getFreshAdminToken();
  const pastor = users.find((user) => user.key === 'pastor');
  const adminUser = await api('/api/v1/users/me', {token: adminToken});
  await api(`/api/v1/admin/users/${pastor.userId}/role`, {
    token: adminToken,
    method: 'PATCH',
    body: {role: 'MANAGER'},
  });
  const adminMembers = await api(`/api/v1/admin/campuses/${campus.campusId}/members`, {
    token: adminToken,
  });
  const adminMembership = adminMembers.find((member) => member.userId === adminUser.id);
  if (adminMembership) {
    await api(
      `/api/v1/admin/campuses/${campus.campusId}/members/${adminMembership.membershipId}/campus-role`,
      {
        token: adminToken,
        method: 'PATCH',
        body: {campusRole: 'MINISTER'},
      },
    );
  }
  const pastorMembership = adminMembers.find((member) => member.userId === pastor.userId);
  if (pastorMembership) {
    await api(
      `/api/v1/admin/campuses/${campus.campusId}/members/${pastorMembership.membershipId}/campus-role`,
      {
        token: adminToken,
        method: 'PATCH',
        body: {campusRole: 'MINISTER'},
      },
    );
  }
  const campusAdminToken = (await login(pastor.email, demoPassword)).accessToken;

  await setupPenaltyAccounts(campusAdminToken, campus.campusId);
  const adminCoffeeAccount = await tryApi(
    `/api/v1/admin/campuses/${campus.campusId}/payment-accounts`,
    {
      token: campusAdminToken,
      method: 'POST',
      body: {
        accountType: 'COFFEE',
        nickname: '청년부 커피 정산',
        bankName: '카카오뱅크',
        accountNumber: '3333-10-202607',
        accountHolder: '은혜숲 청년부',
      },
    },
    '관리자 본인 COFFEE 계좌 등록',
  );
  output.accounts.adminCoffee = adminCoffeeAccount;

  const coffeeDutyUser = users.find((user) => user.key === 'minjae');
  await tryApi(
    `/api/v1/admin/campuses/${campus.campusId}/duty-assignments/coffee`,
    {
      token: campusAdminToken,
      method: 'PUT',
      body: {userId: coffeeDutyUser.userId},
    },
    '커피 담당자 지정',
  );
  const dutyCoffeeAccount = await createCoffeeAccountAsDutyUser(
    coffeeDutyUser.session.accessToken,
    campus.campusId,
    {
      accountType: 'COFFEE',
      nickname: '민재 커피 계좌',
      bankName: '토스뱅크',
      accountNumber: '1000-26-0701',
      accountHolder: '박민재',
    },
  );
  output.accounts.dutyCoffee = dutyCoffeeAccount;

  if (dutyCoffeeAccount) {
    await verifyCoffeeAccountOwnership(
      campusAdminToken,
      campus.campusId,
      adminCoffeeAccount,
      dutyCoffeeAccount,
    );
  }

  await setupPenaltyRules(campusAdminToken, campus.campusId);
  await setupDevotionAndPrayer(campusAdminToken, campus.campusId, users);
  await setupPollsAndCoffeeCharge(campusAdminToken, campus.campusId, adminCoffeeAccount, users);
  await verifyAdminChargesAccess(pastor, campus.campusId);
  await verifyNoDefaultCoffeeTemplate(campusAdminToken, campus.campusId);

  console.log(JSON.stringify({ok: true, ...output}, sanitizeSession, 2));
}

async function setupPenaltyAccounts(adminToken, campusId) {
  try {
    const first = await api(`/api/v1/admin/campuses/${campusId}/payment-accounts`, {
      token: adminToken,
      method: 'POST',
      body: {
        accountType: 'PENALTY',
        nickname: '헌금 정산 계좌',
        bankName: '국민은행',
        accountNumber: '004-21-2026',
        accountHolder: '은혜숲 청년부',
      },
    });
    const second = await api(`/api/v1/admin/campuses/${campusId}/payment-accounts`, {
      token: adminToken,
      method: 'POST',
      body: {
        accountType: 'PENALTY',
        nickname: '이전 벌금 계좌',
        bankName: '신한은행',
        accountNumber: '110-2026-0701',
        accountHolder: '은혜숲 청년부',
      },
    });
    const afterCreate = await api(
      `/api/v1/admin/campuses/${campusId}/payment-accounts?accountType=PENALTY&includeInactive=true`,
      {token: adminToken},
    );
    assert(
      afterCreate.some((account) => account.id === first.id && account.isActive === false) &&
        afterCreate.some((account) => account.id === second.id && account.isActive === true),
      'PENALTY account activation did not move previous account to inactive.',
    );
    output.backendQa.push('PENALTY 새 계좌 등록 시 기존 활성 계좌 비활성화 확인');

    const reactivated = await api(`/api/v1/admin/campuses/${campusId}/payment-accounts/${first.id}/activate`, {
      token: adminToken,
      method: 'PATCH',
    });
    assert(reactivated.isActive === true, 'PENALTY inactive account activation failed.');
    await api(`/api/v1/admin/campuses/${campusId}/payment-accounts/${second.id}`, {
      token: adminToken,
      method: 'DELETE',
    });
    const afterDelete = await api(
      `/api/v1/admin/campuses/${campusId}/payment-accounts?accountType=PENALTY&includeInactive=true`,
      {token: adminToken},
    );
    assert(
      afterDelete.some((account) => account.id === first.id && account.isActive === true) &&
        !afterDelete.some((account) => account.id === second.id),
      'PENALTY inactive account delete or final active account state failed.',
    );
    output.accounts.penalty = first;
    output.backendQa.push('PENALTY 비활성 계좌 활성화/삭제 확인');
  } catch (error) {
    output.backendQaFailures.push({
      item: 'PENALTY 계좌 등록/활성화/삭제',
      status: error.detail?.status,
      code: error.detail?.payload?.code,
      message: error.detail?.payload?.message || error.message,
      path: error.detail?.path,
    });
  }
}

async function setupPenaltyRules(adminToken, campusId) {
  const rules = [
    ['QUIET_TIME', 5, 0, 500],
    ['PRAYER', 5, 0, 500],
    ['BIBLE_READING', 5, 0, 300],
    ['SATURDAY_LATE', 0, 0, 100],
  ];

  for (const [ruleType, requiredCount, baseAmount, amountPerUnit] of rules) {
    await tryApi(`/api/v1/admin/campuses/${campusId}/penalty-rules`, {
      token: adminToken,
      method: 'POST',
      body: {
        ruleType,
        calculationType: ruleType === 'SATURDAY_LATE' ? 'LATE_MINUTE' : 'MISSING_COUNT',
        requiredCount,
        baseAmount,
        amountPerUnit,
      },
    }, `벌금 규칙 생성 ${ruleType}`);
  }
}

async function setupDevotionAndPrayer(adminToken, campusId, users) {
  const haeun = users.find((user) => user.key === 'haeun');
  const junseo = users.find((user) => user.key === 'junseo');
  const minjae = users.find((user) => user.key === 'minjae');
  const seoyun = users.find((user) => user.key === 'seoyun');
  const daeun = users.find((user) => user.key === 'daeun');
  const jiho = users.find((user) => user.key === 'jiho');

  await api(`/api/v1/campuses/${campusId}/devotions/me/weeks/${weekStartDate}`, {
    token: haeun.session.accessToken,
    method: 'PUT',
    body: {
      submit: true,
      saturdayLateMinutes: 0,
      dailyChecks: [
        {recordDate: '2026-06-29', quietTimeChecked: true, prayerChecked: true, bibleReadingChecked: true},
        {recordDate: '2026-06-30', quietTimeChecked: true, prayerChecked: true, bibleReadingChecked: false},
        {recordDate: '2026-07-01', quietTimeChecked: false, prayerChecked: true, bibleReadingChecked: false},
        {recordDate: '2026-07-02', quietTimeChecked: false, prayerChecked: false, bibleReadingChecked: false},
        {recordDate: '2026-07-03', quietTimeChecked: false, prayerChecked: false, bibleReadingChecked: false},
        {recordDate: '2026-07-04', quietTimeChecked: false, prayerChecked: false, bibleReadingChecked: false},
        {recordDate: '2026-07-05', quietTimeChecked: false, prayerChecked: false, bibleReadingChecked: false},
      ],
    },
  });

  const season = await api(`/api/v1/admin/campuses/${campusId}/prayer-seasons`, {
    token: adminToken,
    method: 'POST',
    body: {
      name: '2026 여름 기도 나눔',
      startDate: today,
    },
  });
  const groupA = await api(`/api/v1/admin/prayer-seasons/${season.seasonId}/groups`, {
    token: adminToken,
    method: 'POST',
    body: {name: '믿음나눔조', sortOrder: 1},
  });
  const groupB = await api(`/api/v1/admin/prayer-seasons/${season.seasonId}/groups`, {
    token: adminToken,
    method: 'POST',
    body: {name: '소망기도조', sortOrder: 2},
  });
  await api(`/api/v1/admin/prayer-groups/${groupA.groupId}/members`, {
    token: adminToken,
    method: 'PUT',
    body: {userIds: [haeun.userId, junseo.userId, minjae.userId]},
  });
  await api(`/api/v1/admin/prayer-groups/${groupB.groupId}/members`, {
    token: adminToken,
    method: 'PUT',
    body: {userIds: [seoyun.userId, daeun.userId, jiho.userId]},
  });

  const board = await api(`/api/v1/campuses/${campusId}/prayers/weeks/${weekStartDate}`, {
    token: haeun.session.accessToken,
  });
  const myGroup = board.groups.find((group) => group.groupId === board.myGroupId) || board.groups[0];
  const contentByUserId = new Map([
    [haeun.userId, '새 학기 팀원들을 지혜롭게 섬기고 싶어요.'],
    [junseo.userId, '이번 주 프로젝트를 평안하게 마무리하도록 기도해 주세요.'],
    [minjae.userId, '가족과 더 자주 대화하고 감사하는 마음을 갖고 싶어요.'],
  ]);
  await api(`/api/v1/campuses/${campusId}/prayers/weeks/${weekStartDate}/submissions`, {
    token: haeun.session.accessToken,
    method: 'PUT',
    body: {
      submissions: myGroup.members.map((member) => ({
        userId: member.userId,
        content: contentByUserId.get(member.userId) || null,
        version: member.version || 0,
      })),
    },
  });

  output.prayer = {season, groups: [groupA, groupB]};
}

async function setupPollsAndCoffeeCharge(adminToken, campusId, adminCoffeeAccount, users) {
  const startsAt = '2026-07-01T00:00:00+09:00';
  const endsAt = '2026-07-08T23:00:00+09:00';
  const customPoll = await api(`/api/v1/admin/campuses/${campusId}/polls`, {
    token: adminToken,
    method: 'POST',
    body: {
      templateId: null,
      title: '7월 청년부 소풍 장소를 골라주세요',
      pollType: 'CUSTOM',
      selectionType: 'SINGLE',
      isAnonymous: false,
      allowUserOptionAdd: true,
      chargeGenerationType: 'NONE',
      startsAt,
      endsAt,
      options: [
        {content: '한강공원 피크닉', menuId: null, priceAmount: null, sortOrder: 1},
        {content: '북악산 산책', menuId: null, priceAmount: null, sortOrder: 2},
        {content: '성수동 카페 투어', menuId: null, priceAmount: null, sortOrder: 3},
      ],
    },
  });
  output.polls.custom = customPoll;

  const pollDetail = await api(`/api/v1/campuses/${campusId}/polls/${customPoll.id}`, {
    token: users[0].session.accessToken,
  });
  await api(`/api/v1/campuses/${campusId}/polls/${customPoll.id}/responses/me`, {
    token: users[0].session.accessToken,
    method: 'PUT',
    body: {optionIds: [pollDetail.options[0].id]},
  });
  await api(`/api/v1/campuses/${campusId}/polls/${customPoll.id}/responses/me`, {
    token: users[1].session.accessToken,
    method: 'PUT',
    body: {optionIds: [pollDetail.options[0].id]},
  });
  await api(`/api/v1/campuses/${campusId}/polls/${customPoll.id}/comments`, {
    token: users[0].session.accessToken,
    method: 'POST',
    body: {content: '날씨가 좋으면 한강에서 같이 도시락 먹고 싶어요.'},
  });

  if (!adminCoffeeAccount) {
    output.backendQaFailures.push({
      item: 'COFFEE 투표/청구 검증',
      message: '관리자 COFFEE 계좌 등록 실패로 커피투표 청구 검증을 건너뜀',
    });
    return;
  }

  const brands = await api('/api/v1/coffee-brands', {token: adminToken});
  const brand = brands[0];
  const menus = await api(`/api/v1/coffee-brands/${brand.id}/menus`, {token: adminToken});
  const selectedMenus = pickCoffeeMenus(menus);
  const coffeePoll = await api(`/api/v1/admin/campuses/${campusId}/polls`, {
    token: adminToken,
    method: 'POST',
    body: {
      templateId: null,
      title: '주일 예배 후 커피 주문',
      pollType: 'COFFEE',
      selectionType: 'SINGLE',
      isAnonymous: false,
      allowUserOptionAdd: true,
      chargeGenerationType: 'OPTION_PRICE',
      paymentCategory: 'COFFEE',
      paymentAccountId: adminCoffeeAccount.id,
      startsAt,
      endsAt,
      options: selectedMenus.map((menu, index) => ({
        content: menu.name,
        menuId: menu.id,
        priceAmount: menu.priceAmount,
        sortOrder: index + 1,
      })),
    },
  });
  output.polls.coffee = {
    id: coffeePoll.id,
    title: coffeePoll.title,
    selectedMenu: selectedMenus[0],
  };

  if (output.accounts.dutyCoffee) {
    await expectFailure(
      () =>
        api(`/api/v1/admin/campuses/${campusId}/polls`, {
          token: adminToken,
          method: 'POST',
          body: {
            templateId: null,
            title: '다른 사람 계좌 검증용 커피 주문',
            pollType: 'COFFEE',
            selectionType: 'SINGLE',
            isAnonymous: false,
            allowUserOptionAdd: true,
            chargeGenerationType: 'OPTION_PRICE',
            paymentCategory: 'COFFEE',
            paymentAccountId: output.accounts.dutyCoffee.id,
            startsAt,
            endsAt,
            options: selectedMenus.slice(0, 1).map((menu, index) => ({
              content: menu.name,
              menuId: menu.id,
              priceAmount: menu.priceAmount,
              sortOrder: index + 1,
            })),
          },
        }),
      'COFFEE poll creation with another user account should fail.',
    );
    output.backendQa.push('COFFEE 투표 생성 시 타 사용자 계좌 거절 확인');
  }

  const coffeeDetail = await api(`/api/v1/campuses/${campusId}/polls/${coffeePoll.id}`, {
    token: users[0].session.accessToken,
  });
  await api(`/api/v1/campuses/${campusId}/polls/${coffeePoll.id}/responses/me`, {
    token: users[0].session.accessToken,
    method: 'PUT',
    body: {optionIds: [coffeeDetail.options[0].id]},
  });
  await api(`/api/v1/admin/campuses/${campusId}/polls/${coffeePoll.id}/close`, {
    token: adminToken,
    method: 'PATCH',
  });

  const myCoffeeCharges = await api(
    `/api/v1/campuses/${campusId}/charges/me?page=0&size=20&sort=createdAt,desc&paymentCategory=COFFEE&status=UNPAID`,
    {token: users[0].session.accessToken},
  );
  const coffeeCharge = myCoffeeCharges.items.find(
    (item) =>
      item.amount === selectedMenus[0].priceAmount &&
      item.account?.paymentAccountId === adminCoffeeAccount.id,
  );
  assert(coffeeCharge, 'Coffee charge was not created with selected account and menu price.');
  output.charges.coffee = coffeeCharge;
  output.backendQa.push('COFFEE 투표 종료 후 선택 메뉴 금액/계좌 연결 청구 생성 확인');

  const adminCoffeeCharges = await api(
    `/api/v1/admin/campuses/${campusId}/charges?page=0&size=20&sort=createdAt,desc&paymentCategory=COFFEE&status=UNPAID&paymentAccountId=${adminCoffeeAccount.id}`,
    {token: adminToken},
  );
  assert(adminCoffeeCharges.summary.unpaidAmount >= selectedMenus[0].priceAmount, 'Admin coffee charge account filter failed.');
  output.backendQa.push('관리자 정산 조회 paymentAccountId 필터 확인');
}

async function verifyCoffeeAccountOwnership(adminToken, campusId, adminCoffeeAccount, dutyCoffeeAccount) {
  const accounts = await api(
    `/api/v1/admin/campuses/${campusId}/payment-accounts?accountType=COFFEE&includeInactive=true`,
    {token: adminToken},
  );
  const adminAccount = accounts.find((account) => account.id === adminCoffeeAccount.id);
  const dutyAccount = accounts.find((account) => account.id === dutyCoffeeAccount.id);
  assert(adminAccount?.isActive === true && dutyAccount?.isActive === true, 'COFFEE accounts are not active per owner.');
  assert(
    adminAccount.ownerUserId &&
      dutyAccount.ownerUserId &&
      adminAccount.ownerUserId !== dutyAccount.ownerUserId,
    'COFFEE account ownerUserId separation failed.',
  );
  output.backendQa.push('COFFEE 사용자별 활성 계좌/ownerUserId 분리 확인');
}

async function createCoffeeAccountAsDutyUser(token, campusId, body) {
  const attempts = [
    `/api/v1/admin/campuses/${campusId}/payment-accounts`,
    `/api/v1/campuses/${campusId}/coffee/payment-accounts`,
  ];
  const failures = [];

  for (const path of attempts) {
    try {
      return await api(path, {
        token,
        method: 'POST',
        body,
      });
    } catch (error) {
      failures.push({
        path,
        status: error.detail?.status,
        code: error.detail?.payload?.code,
        message: error.detail?.payload?.message || error.message,
      });
    }
  }

  output.backendQaFailures.push({
    item: '커피 담당자 일반 계정 커피 계좌 등록',
    failures,
  });

  return null;
}

async function verifyAdminChargesAccess(pastor, campusId) {
  try {
    const charges = await api(
      `/api/v1/admin/campuses/${campusId}/charges?page=0&size=20&sort=createdAt,desc&status=UNPAID`,
      {token: pastor.session.accessToken},
    );
    assert(typeof charges.summary.unpaidAmount === 'number', 'Campus MINISTER could not access admin charges.');
    output.backendQa.push('캠퍼스 MINISTER 역할의 관리자 정산 조회 확인');
  } catch (error) {
    output.backendQaFailures.push({
      item: '캠퍼스 MINISTER 관리자 정산 조회',
      status: error.detail?.status,
      code: error.detail?.payload?.code,
      message: error.detail?.payload?.message || error.message,
      path: error.detail?.path,
    });
  }
}

async function verifyNoDefaultCoffeeTemplate(adminToken, campusId) {
  const templates = await api(`/api/v1/admin/campuses/${campusId}/poll-templates`, {
    token: adminToken,
  });
  assert(
    !templates.some((template) => template.pollType === 'COFFEE' && template.isDefault === true),
    'Default coffee poll template still exists on new campus.',
  );
  output.backendQa.push('신규 캠퍼스 기본 커피 반복투표 미생성 확인');
}

function pickCoffeeMenus(menus) {
  const preferredNames = ['아메리카노', '카페라떼', '바닐라라떼'];
  const picked = [];

  for (const preferredName of preferredNames) {
    const menu = menus.find((item) => item.name.includes(preferredName));
    if (menu && !picked.some((item) => item.id === menu.id)) {
      picked.push(menu);
    }
  }

  return picked.length >= 2 ? picked.slice(0, 3) : menus.slice(0, 3);
}

async function login(email, password) {
  return api('/api/v1/auth/login', {
    method: 'POST',
    body: {email, password},
  });
}

async function getFreshAdminToken() {
  const session = await login(adminEmail, adminPassword);
  return session.accessToken;
}

async function api(path, {body, method = 'GET', token} = {}) {
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.message || response.statusText || 'API request failed');
    error.detail = {path, method, status: response.status, payload};
    throw error;
  }

  return payload?.data ?? null;
}

async function tryApi(path, options, item) {
  try {
    return await api(path, options);
  } catch (error) {
    output.backendQaFailures.push({
      item,
      status: error.detail?.status,
      code: error.detail?.payload?.code,
      message: error.detail?.payload?.message || error.message,
      path: error.detail?.path || path,
    });

    return null;
  }
}

async function expectFailure(action, message) {
  try {
    await action();
  } catch (error) {
    output.backendQa.push(`${message} (${error.detail?.status || 'error'})`);
    return;
  }

  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sanitizeSession(key, value) {
  if (key === 'session') {
    return undefined;
  }

  if (key === 'inviteCode') {
    return value;
  }

  return value;
}
