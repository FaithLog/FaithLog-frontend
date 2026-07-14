import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('./tokenStorage', () => ({
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(() => 0),
  getStoredAuthSession: vi.fn(),
  getStoredTokens: vi.fn(),
  isAccessTokenOwnedByAuthSession: vi.fn(async () => true),
  isAuthSessionGenerationCurrent: vi.fn(() => true),
  isAuthSessionRequestAllowed: vi.fn(() => true),
  saveTokens: vi.fn(),
}));

import {
  apiRequest,
  changeAdminChargeStatus,
  FaithLogApiError,
  fetchChargeSummary,
  fetchDevotionMonthlySummary,
  fetchAdminCampusChargesForMyAccounts,
  fetchAdminMemberCharges,
  fetchMyCharges,
  fetchPrayerWeek,
  fetchWeeklyDevotionSummary,
  loginUser,
  markMyChargePaid,
  savePollResponse,
  validateRuntimeConfig,
} from './client';
import {
  createAdminPollTemplate,
  updateAdminPollTemplate,
  type AdminPollTemplateRequest,
} from './adminPollApi';
import {mockApiErrorFixtures, mockDomainFixtures} from './mockFixtures';
import {
  executeMockRequest,
  mealMockAccessTokens,
  resetMockAdapterStateForTests,
} from './mockAdapter';
import {mealApi} from '../meal/mealApi';

function expectApiError(error: unknown, expected: Partial<FaithLogApiError['detail']>) {
  expect(error).toBeInstanceOf(FaithLogApiError);
  expect((error as FaithLogApiError).detail).toMatchObject(expected);
}

async function createOtherDutyMealCharge(amount = 8_000) {
  const poll = await mealApi.createPoll(mealMockAccessTokens.activeDuty, 1, {
    title: '관리자 청구 상태 테스트',
    isAnonymous: false,
    endsAt: '2027-07-20T03:00:00.000Z',
    options: [
      {content: '비빔밥', sortOrder: 0},
      {content: '국밥', sortOrder: 1},
    ],
    allowUserOptionAdd: false,
  });
  const optionId = poll.options[0]?.id ?? 0;
  await savePollResponse(mealMockAccessTokens.otherDuty, 1, poll.id, {optionIds: [optionId]});
  await mealApi.closePoll(mealMockAccessTokens.activeDuty, 1, poll.id);
  await mealApi.createCharges(mealMockAccessTokens.activeDuty, 1, poll.id, {
    paymentAccountId: 10,
    groups: [{optionId, calculationType: 'PER_MEMBER', enteredAmount: amount}],
  });
  const charges = await fetchMyCharges(mealMockAccessTokens.otherDuty, 1, {
    paymentCategory: 'MEAL',
  });
  const charge = charges.items.find((item) => item.amount === amount);
  if (!charge) throw new Error('Expected generated MEAL charge');
  return charge;
}

function patchMockAdminChargeStatus(
  chargeItemId: number,
  status: 'UNPAID' | 'PAID' | 'WAIVED' | 'CANCELED',
) {
  return executeMockRequest(`/api/v1/admin/charges/${chargeItemId}/status`, {
    body: JSON.stringify({status}),
    headers: {
      Authorization: `Bearer ${mealMockAccessTokens.nonDutyAdmin}`,
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
  });
}

describe('FaithLog mock API adapter', () => {
  beforeEach(() => {
    resetMockAdapterStateForTests();
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
    delete process.env.EXPO_PUBLIC_MOCK_SCENARIO;
  });

  it('lets mock mode bootstrap without a live API base URL', () => {
    expect(() => validateRuntimeConfig()).not.toThrow();
  });

  it('serves auth fixtures without calling the network or leaking personal examples', async () => {
    const response = await loginUser({
      email: 'faithlog.user@example.test',
      password: 'samplepass8',
    });

    expect(response.user.email).toBe('faithlog.user@example.test');
    expect(response.accessToken).toBe('mock-access-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves domain fixtures through existing API functions', async () => {
    const prayerWeek = await fetchPrayerWeek('mock-access-token', 1, '2026-06-22');

    expect(prayerWeek.groups[0]?.members[0]?.content).toBe('Mock fixture 기도제목입니다.');
    expect(mockDomainFixtures).toHaveProperty('auth');
    expect(mockDomainFixtures).toHaveProperty('campus');
    expect(mockDomainFixtures).toHaveProperty('devotion');
    expect(mockDomainFixtures).toHaveProperty('billing');
    expect(mockDomainFixtures).toHaveProperty('admin');
    expect(mockDomainFixtures).toHaveProperty('poll');
    expect(mockDomainFixtures).toHaveProperty('prayer');
    expect(mockDomainFixtures).toHaveProperty('notification');
  });

  it('supports the confirmed PAID payload in mock mode with paidAt', async () => {
    const changed = await changeAdminChargeStatus('mock-access-token', 501, 'PAID', {
      campusId: 1,
      userId: 7,
      paymentCategory: 'PENALTY',
    });
    const [summary, detail] = await Promise.all([
      fetchAdminCampusChargesForMyAccounts('mock-access-token', 1),
      fetchAdminMemberCharges('mock-access-token', 1, 7),
    ]);

    expect(changed).toMatchObject({id: 501, status: 'PAID'});
    expect(changed.paidAt).toEqual(expect.any(String));
    expect(summary.summary).toMatchObject({unpaidAmount: 3_000, paidAmount: 15_000});
    expect(detail.summary).toMatchObject({unpaidAmount: 3_000, paidAmount: 15_000});
    expect(detail.items).toContainEqual(
      expect.objectContaining({id: 501, status: 'PAID', paidAt: changed.paidAt}),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reopens only the linked weekly devotion after a successful devotion penalty cancellation', async () => {
    const beforeWeekly = await fetchWeeklyDevotionSummary(
      'mock-access-token',
      1,
      '2026-06-22',
    );
    const beforeMonthly = await fetchDevotionMonthlySummary(
      'mock-access-token',
      1,
      {year: 2026, month: 6},
    );
    const preservedDailyChecks = structuredClone(beforeWeekly.dailyChecks);

    expect(beforeWeekly.submittedAt).toEqual(expect.any(String));
    expect(beforeMonthly.weeklyRecords[0]?.submittedAt).toEqual(expect.any(String));

    await changeAdminChargeStatus('mock-access-token', 501, 'CANCELED', {
      campusId: 1,
      userId: 7,
      paymentCategory: 'PENALTY',
    });

    const [afterWeekly, afterMonthly] = await Promise.all([
      fetchWeeklyDevotionSummary('mock-access-token', 1, '2026-06-22'),
      fetchDevotionMonthlySummary('mock-access-token', 1, {year: 2026, month: 6}),
    ]);

    expect(afterWeekly.submittedAt).toBeNull();
    expect(afterWeekly.dailyChecks).toEqual(preservedDailyChecks);
    expect(afterMonthly.weeklyRecords[0]?.submittedAt).toBeNull();

    resetMockAdapterStateForTests();
    const [resetWeekly, resetMonthly] = await Promise.all([
      fetchWeeklyDevotionSummary('mock-access-token', 1, '2026-06-22'),
      fetchDevotionMonthlySummary('mock-access-token', 1, {year: 2026, month: 6}),
    ]);
    expect(resetWeekly.submittedAt).toBe(beforeWeekly.submittedAt);
    expect(resetMonthly.weeklyRecords[0]?.submittedAt).toBe(beforeWeekly.submittedAt);
  });

  it.each([
    ['WAIVED devotion penalty', 'PENALTY', 'DEVOTION_RECORD', 'WAIVED'],
    ['CANCELED poll penalty', 'PENALTY', 'POLL_RESPONSE', 'CANCELED'],
  ] as const)(
    'does not reopen weekly devotion for %s',
    async (_label, paymentCategory, sourceType, status) => {
      const charge = mockDomainFixtures.admin.memberCharges.items[0];
      if (!charge) throw new Error('Expected the linked mock charge fixture.');
      const originalPaymentCategory = charge.paymentCategory;
      const originalSource = charge.source;

      charge.paymentCategory = paymentCategory;
      charge.source = {sourceId: 101, sourceType};
      resetMockAdapterStateForTests();

      try {
        const beforeWeekly = await fetchWeeklyDevotionSummary(
          'mock-access-token',
          1,
          '2026-06-22',
        );

        await expect(patchMockAdminChargeStatus(501, status)).resolves.toMatchObject({status: 200});

        const [afterWeekly, afterMonthly] = await Promise.all([
          fetchWeeklyDevotionSummary('mock-access-token', 1, '2026-06-22'),
          fetchDevotionMonthlySummary('mock-access-token', 1, {year: 2026, month: 6}),
        ]);

        expect(afterWeekly.submittedAt).toBe(beforeWeekly.submittedAt);
        expect(afterMonthly.weeklyRecords[0]?.submittedAt).toBe(beforeWeekly.submittedAt);
      } finally {
        charge.paymentCategory = originalPaymentCategory;
        if (originalSource === undefined) delete charge.source;
        else charge.source = originalSource;
        resetMockAdapterStateForTests();
      }
    },
  );

  it('does not reopen weekly devotion for a successful non-penalty cancellation', async () => {
    const charge = await createOtherDutyMealCharge();
    const beforeWeekly = await fetchWeeklyDevotionSummary(
      'mock-access-token',
      1,
      '2026-06-22',
    );

    await changeAdminChargeStatus(
      mealMockAccessTokens.nonDutyAdmin,
      charge.id,
      'CANCELED',
      {campusId: 1, userId: 8, paymentCategory: 'MEAL'},
    );

    const afterWeekly = await fetchWeeklyDevotionSummary(
      'mock-access-token',
      1,
      '2026-06-22',
    );
    expect(afterWeekly.submittedAt).toBe(beforeWeekly.submittedAt);
  });

  it('does not reopen devotion when an invalid status transition returns the canonical conflict', async () => {
    const beforeWeekly = await fetchWeeklyDevotionSummary(
      'mock-access-token',
      1,
      '2026-06-22',
    );
    const response = await patchMockAdminChargeStatus(501, 'UNPAID');
    const body = await response.json();
    const afterWeekly = await fetchWeeklyDevotionSummary(
      'mock-access-token',
      1,
      '2026-06-22',
    );

    expect(response.status).toBe(409);
    expect(body).toMatchObject({code: 'BILLING_CHARGE_STATUS_TRANSITION_CONFLICT'});
    expect(afterWeekly.submittedAt).toBe(beforeWeekly.submittedAt);
  });

  it('shares an admin CANCELED transition with the member list and blocks member payment', async () => {
    await changeAdminChargeStatus('mock-access-token', 501, 'CANCELED', {
      campusId: 1,
      userId: 7,
      paymentCategory: 'PENALTY',
    });

    const [memberList, memberSummary, adminDetail] = await Promise.all([
      fetchMyCharges('mock-access-token', 1, {status: 'CANCELED'}),
      fetchChargeSummary('mock-access-token', 1, {year: 2026, month: 6}),
      fetchAdminMemberCharges('mock-access-token', 1, 7),
    ]);

    expect(memberList.items).toContainEqual(expect.objectContaining({id: 501, status: 'CANCELED'}));
    expect(memberList.summary).toMatchObject({
      totalAmount: 3000,
      unpaidAmount: 0,
      paidAmount: 0,
      waivedAmount: 0,
      canceledAmount: 3000,
    });
    expect(memberSummary).toMatchObject({
      totalPaidAmount: 12000,
      monthlyPaidAmount: 12000,
      monthlyUnpaidAmount: 3000,
      monthlyTotalChargeAmount: 18000,
    });
    expect(adminDetail.items).toContainEqual(expect.objectContaining({id: 501, status: 'CANCELED'}));
    await expect(
      markMyChargePaid('mock-access-token', 1, 501),
    ).rejects.toMatchObject({detail: {status: 409}});
  });

  it('shares a member PAID transition with admin detail and canonical filtered aggregates', async () => {
    const before = await fetchMyCharges('mock-access-token', 1, {});
    expect(before.summary).toMatchObject({
      totalAmount: 18000,
      unpaidAmount: 6000,
      paidAmount: 12000,
      waivedAmount: 0,
      canceledAmount: 0,
    });

    await markMyChargePaid('mock-access-token', 1, 501);
    const [memberAll, memberPaid, memberUnpaid, memberSummary, adminDetail, adminCampus] =
      await Promise.all([
        fetchMyCharges('mock-access-token', 1, {}),
        fetchMyCharges('mock-access-token', 1, {status: 'PAID'}),
        fetchMyCharges('mock-access-token', 1, {status: 'UNPAID'}),
        fetchChargeSummary('mock-access-token', 1, {year: 2026, month: 6}),
        fetchAdminMemberCharges('mock-access-token', 1, 7),
        fetchAdminCampusChargesForMyAccounts('mock-access-token', 1),
      ]);

    expect(memberAll.items).toContainEqual(expect.objectContaining({id: 501, status: 'PAID'}));
    expect(memberAll.summary).toMatchObject({totalAmount: 18000, unpaidAmount: 3000, paidAmount: 15000});
    expect(memberPaid.summary).toMatchObject({totalAmount: 15000, paidAmount: 15000, unpaidAmount: 0});
    expect(memberUnpaid.summary).toMatchObject({totalAmount: 3000, unpaidAmount: 3000, paidAmount: 0});
    expect(memberSummary).toMatchObject({
      totalPaidAmount: 15000,
      monthlyPaidAmount: 15000,
      monthlyUnpaidAmount: 3000,
    });
    expect(adminDetail.items).toContainEqual(expect.objectContaining({id: 501, status: 'PAID'}));
    expect(adminDetail.summary).toMatchObject({totalAmount: 18000, unpaidAmount: 3000, paidAmount: 15000});
    expect(adminCampus.summary).toMatchObject({totalAmount: 18000, unpaidAmount: 3000, paidAmount: 15000});

    resetMockAdapterStateForTests();
    const [memberAfterReset, adminAfterReset, summaryAfterReset] = await Promise.all([
      fetchMyCharges('mock-access-token', 1, {}),
      fetchAdminMemberCharges('mock-access-token', 1, 7),
      fetchChargeSummary('mock-access-token', 1, {year: 2026, month: 6}),
    ]);
    expect(memberAfterReset.items).toContainEqual(expect.objectContaining({id: 501, status: 'UNPAID'}));
    expect(memberAfterReset.summary).toMatchObject({totalAmount: 18000, unpaidAmount: 6000, paidAmount: 12000});
    expect(adminAfterReset.items).toContainEqual(expect.objectContaining({id: 501, status: 'UNPAID'}));
    expect(adminAfterReset.summary).toMatchObject({totalAmount: 18000, unpaidAmount: 6000, paidAmount: 12000});
    expect(summaryAfterReset).toMatchObject({totalPaidAmount: 12000, monthlyUnpaidAmount: 6000});
  });

  it('enforces admin charge authentication, campus authorization, and member identity', async () => {
    const request = (path: string, accessToken?: string) => executeMockRequest(path, {
      ...(accessToken === undefined
        ? {}
        : {headers: {Authorization: `Bearer ${accessToken}`}}),
      method: 'GET',
    });

    await expect(request('/api/v1/admin/campuses/1/charges')).resolves.toMatchObject({status: 401});
    await expect(
      request('/api/v1/admin/campuses/1/charges', mealMockAccessTokens.otherDuty),
    ).resolves.toMatchObject({status: 403});
    await expect(
      request('/api/v1/admin/campuses/2/charges', mealMockAccessTokens.nonDutyAdmin),
    ).resolves.toMatchObject({status: 404});

    const otherMember = await request(
      '/api/v1/admin/campuses/1/members/8/charges',
      mealMockAccessTokens.nonDutyAdmin,
    );
    const otherMemberBody = await otherMember.json();

    expect(otherMember.status).toBe(200);
    expect(otherMemberBody).toMatchObject({data: {campusId: 1, userId: 8, items: []}});
    expect(JSON.stringify(otherMemberBody)).not.toContain('"id":501');
  });

  it('authorizes admin charge mutations against the canonical charge owner', async () => {
    const request = (chargeItemId: number, accessToken?: string) => executeMockRequest(
      `/api/v1/admin/charges/${chargeItemId}/status`,
      {
        body: JSON.stringify({status: 'CANCELED'}),
        headers: accessToken === undefined
          ? {'Content-Type': 'application/json'}
          : {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
        method: 'PATCH',
      },
    );

    await expect(request(501)).resolves.toMatchObject({status: 401});
    await expect(request(501, mealMockAccessTokens.otherDuty)).resolves.toMatchObject({status: 403});
    await expect(
      request(501, mealMockAccessTokens.otherCampusDuty),
    ).resolves.toMatchObject({status: 404});
    await expect(
      request(999_999, mealMockAccessTokens.nonDutyAdmin),
    ).resolves.toMatchObject({status: 404});
    await expect(
      request(501, mealMockAccessTokens.nonDutyAdmin),
    ).resolves.toMatchObject({status: 200});
  });

  it('applies status and payment-category filters to admin summary and detail together', async () => {
    const [paidSummary, paidDetail, coffeeSummary, coffeeDetail] = await Promise.all([
      fetchAdminCampusChargesForMyAccounts(mealMockAccessTokens.nonDutyAdmin, 1, {status: 'PAID'}),
      fetchAdminMemberCharges(mealMockAccessTokens.nonDutyAdmin, 1, 7, {status: 'PAID'}),
      fetchAdminCampusChargesForMyAccounts(mealMockAccessTokens.nonDutyAdmin, 1, {
        paymentCategory: 'COFFEE',
      }),
      fetchAdminMemberCharges(mealMockAccessTokens.nonDutyAdmin, 1, 7, {
        paymentCategory: 'COFFEE',
      }),
    ]);

    expect(paidSummary.summary).toEqual({
      totalAmount: 12_000,
      unpaidAmount: 0,
      paidAmount: 12_000,
      waivedAmount: 0,
      canceledAmount: 0,
    });
    expect(paidSummary.members).toEqual([
      expect.objectContaining({userId: 7, totalAmount: 12_000, paidAmount: 12_000}),
    ]);
    expect(paidDetail.items).toEqual([
      expect.objectContaining({paymentCategory: 'PENALTY', status: 'PAID'}),
    ]);
    expect(paidDetail.items.reduce((total, item) => total + item.amount, 0)).toBe(
      paidDetail.summary.totalAmount,
    );
    expect(paidDetail.summary).toEqual(paidSummary.summary);
    expect(coffeeSummary.summary).toEqual({
      totalAmount: 0,
      unpaidAmount: 0,
      paidAmount: 0,
      waivedAmount: 0,
      canceledAmount: 0,
    });
    expect(coffeeSummary.members).toEqual([]);
    expect(coffeeDetail.items).toEqual([]);
    expect(coffeeDetail.summary).toEqual(coffeeSummary.summary);
  });

  it('enforces the confirmed admin charge transition graph for legacy charges', async () => {
    await expect(patchMockAdminChargeStatus(501, 'CANCELED')).resolves.toMatchObject({status: 200});
    await expect(patchMockAdminChargeStatus(501, 'CANCELED')).resolves.toMatchObject({status: 409});
    await expect(patchMockAdminChargeStatus(501, 'WAIVED')).resolves.toMatchObject({status: 409});
    await expect(patchMockAdminChargeStatus(501, 'UNPAID')).resolves.toMatchObject({status: 200});
    await expect(patchMockAdminChargeStatus(501, 'WAIVED')).resolves.toMatchObject({status: 200});
    await expect(patchMockAdminChargeStatus(501, 'PAID')).resolves.toMatchObject({status: 409});
    await expect(patchMockAdminChargeStatus(501, 'UNPAID')).resolves.toMatchObject({status: 200});
    await expect(patchMockAdminChargeStatus(501, 'PAID')).resolves.toMatchObject({status: 200});
    await expect(patchMockAdminChargeStatus(501, 'CANCELED')).resolves.toMatchObject({status: 409});
    await expect(patchMockAdminChargeStatus(501, 'UNPAID')).resolves.toMatchObject({status: 200});
  });

  it('sorts and paginates admin members without reducing the filtered aggregate summary', async () => {
    await createOtherDutyMealCharge(8_000);

    const [firstPage, secondPage] = await Promise.all([
      fetchAdminCampusChargesForMyAccounts(mealMockAccessTokens.nonDutyAdmin, 1, {
        page: 0,
        size: 1,
        sort: {key: 'totalAmount', direction: 'asc'},
      }),
      fetchAdminCampusChargesForMyAccounts(mealMockAccessTokens.nonDutyAdmin, 1, {
        page: 1,
        size: 1,
        sort: {key: 'totalAmount', direction: 'asc'},
      }),
    ]);

    expect(firstPage.members).toEqual([
      expect.objectContaining({userId: 8, name: '두 번째 담당자', totalAmount: 8_000}),
    ]);
    expect(secondPage.members).toEqual([
      expect.objectContaining({userId: 7, name: '샘플 사용자', totalAmount: 18_000}),
    ]);
    expect(firstPage.summary).toEqual(secondPage.summary);
    expect(firstPage.summary).toMatchObject({totalAmount: 26_000, unpaidAmount: 14_000});
  });

  it.each([
    ['createdAt', 'asc', [7, 8]],
    ['createdAt', 'desc', [8, 7]],
    ['userId', 'asc', [7, 8]],
    ['userId', 'desc', [8, 7]],
    ['name', 'asc', [8, 7]],
    ['name', 'desc', [7, 8]],
    ['email', 'asc', [7, 8]],
    ['email', 'desc', [8, 7]],
    ['totalAmount', 'asc', [8, 7]],
    ['totalAmount', 'desc', [7, 8]],
    ['unpaidAmount', 'asc', [7, 8]],
    ['unpaidAmount', 'desc', [8, 7]],
    ['paidAmount', 'asc', [8, 7]],
    ['paidAmount', 'desc', [7, 8]],
    ['waivedAmount', 'asc', [7, 8]],
    ['waivedAmount', 'desc', [7, 8]],
    ['canceledAmount', 'asc', [7, 8]],
    ['canceledAmount', 'desc', [7, 8]],
  ] as const)(
    'sorts admin campus member rows by %s,%s',
    async (key, direction, expectedUserIds) => {
      await createOtherDutyMealCharge(8_000);

      const result = await fetchAdminCampusChargesForMyAccounts(
        mealMockAccessTokens.nonDutyAdmin,
        1,
        {size: 100, sort: {key, direction}},
      );

      expect(result.members.map((member) => member.userId)).toEqual(expectedUserIds);
    },
  );

  it.each([
    ['createdAt', 'asc', [502, 501, 503]],
    ['createdAt', 'desc', [503, 501, 502]],
    ['dueDate', 'asc', [502, 501, 503]],
    ['dueDate', 'desc', [501, 503, 502]],
    ['amount', 'asc', [501, 503, 502]],
    ['amount', 'desc', [502, 501, 503]],
  ] as const)(
    'sorts admin member charge rows by %s,%s',
    async (key, direction, expectedChargeIds) => {
      const result = await fetchAdminMemberCharges(
        mealMockAccessTokens.nonDutyAdmin,
        1,
        7,
        {size: 100, sort: {key, direction}},
      );

      expect(result.items.map((charge) => charge.id)).toEqual(expectedChargeIds);
    },
  );

  it('updates a canonical dynamic MEAL charge and settlement through the admin PATCH boundary', async () => {
    const charge = await createOtherDutyMealCharge(8_000);

    const canceled = await changeAdminChargeStatus(
      mealMockAccessTokens.nonDutyAdmin,
      charge.id,
      'CANCELED',
      {campusId: 1, userId: 8, paymentCategory: 'MEAL'},
    );
    const [canceledDetail, canceledSettlement] = await Promise.all([
      fetchAdminMemberCharges(mealMockAccessTokens.nonDutyAdmin, 1, 8, {
        paymentCategory: 'MEAL',
      }),
      mealApi.getMySettlement(mealMockAccessTokens.activeDuty, 1, 7),
    ]);

    expect(canceled).toMatchObject({
      id: charge.id,
      campusId: 1,
      userId: 8,
      paymentCategory: 'MEAL',
      status: 'CANCELED',
    });
    expect(canceledDetail.items).toContainEqual(
      expect.objectContaining({id: charge.id, status: 'CANCELED'}),
    );
    expect(canceledSettlement.members).toContainEqual(
      expect.objectContaining({userId: 8, canceledAmount: 8_000, unpaidAmount: 0}),
    );
    await expect(patchMockAdminChargeStatus(charge.id, 'CANCELED')).resolves.toMatchObject({
      status: 409,
    });
    await expect(patchMockAdminChargeStatus(charge.id, 'PAID')).resolves.toMatchObject({status: 409});
    await expect(patchMockAdminChargeStatus(charge.id, 'UNPAID')).resolves.toMatchObject({status: 200});

    const paid = await changeAdminChargeStatus(
      mealMockAccessTokens.nonDutyAdmin,
      charge.id,
      'PAID',
      {campusId: 1, userId: 8, paymentCategory: 'MEAL'},
    );
    const [paidDetail, paidSettlement] = await Promise.all([
      fetchAdminMemberCharges(mealMockAccessTokens.nonDutyAdmin, 1, 8, {
        paymentCategory: 'MEAL',
      }),
      mealApi.getMySettlement(mealMockAccessTokens.activeDuty, 1, 7),
    ]);

    expect(paid).toMatchObject({id: charge.id, status: 'PAID', paidAt: expect.any(String)});
    expect(paidDetail.items).toContainEqual(expect.objectContaining({id: charge.id, status: 'PAID'}));
    expect(paidSettlement.members).toContainEqual(
      expect.objectContaining({userId: 8, paidAmount: 8_000, unpaidAmount: 0}),
    );
    await expect(patchMockAdminChargeStatus(charge.id, 'WAIVED')).resolves.toMatchObject({status: 409});
  });

  it('returns parser-compatible options when mock poll templates are created and updated', async () => {
    const request: AdminPollTemplateRequest = {
      title: '반복 투표',
      pollType: 'COFFEE',
      selectionType: 'SINGLE',
      chargeGenerationType: 'OPTION_PRICE',
      paymentCategory: 'COFFEE',
      paymentAccountId: 1,
      autoCreateEnabled: true,
      startDayOfWeek: 1,
      startTime: '09:00:00',
      endDayOfWeek: 2,
      endTime: '18:00:00',
      options: [
        {content: null, menuId: 11, priceAmount: 4_500, sortOrder: 1},
        {content: '참석 안 함', menuId: null, priceAmount: null, sortOrder: 2},
      ],
    };

    const created = await createAdminPollTemplate('mock-access-token', 1, request);
    const updated = await updateAdminPollTemplate(
      'mock-access-token',
      1,
      created.id,
      {...request, title: '수정된 반복 투표'},
    );

    expect(created.options).toHaveLength(2);
    expect(created.options.every((option) => option.id > 0)).toBe(true);
    expect(updated).toMatchObject({id: created.id, title: '수정된 반복 투표'});
    expect(updated.options.every((option) => option.id > 0)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['401', 'sessionExpired', mockApiErrorFixtures.sessionExpired.status],
    ['403', 'permissionDenied', mockApiErrorFixtures.permissionDenied.status],
    ['409', 'conflict', mockApiErrorFixtures.conflict.status],
    ['422', 'error', mockApiErrorFixtures.validation.status],
  ] as const)(
    'normalizes mock %s scenarios through the API client',
    async (scenario, kind, status) => {
      process.env.EXPO_PUBLIC_MOCK_SCENARIO = scenario;

      await expect(apiRequest('/api/v1/users/me', {skipAuthRefresh: true})).rejects.toSatisfy(
        (error) => {
          expectApiError(error, {kind, status});
          return true;
        },
      );
    },
  );

  it('normalizes mock offline and invalid envelope scenarios', async () => {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'offline';

    await expect(apiRequest('/api/v1/users/me')).rejects.toSatisfy((error) => {
      expectApiError(error, {kind: 'offline'});
      return true;
    });

    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'invalid-envelope';

    await expect(apiRequest('/api/v1/users/me')).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        status: 200,
        message: '서버 응답 형식이 올바르지 않습니다.',
      });
      return true;
    });
  });

  it('reports missing mock-only endpoints as blocked API fixtures, not offline', async () => {
    await expect(apiRequest('/api/v1/not-yet-documented')).rejects.toSatisfy((error) => {
      expectApiError(error, {
        kind: 'error',
        status: 501,
        code: 'MOCK_FIXTURE_MISSING',
      });
      return true;
    });
  });
});
