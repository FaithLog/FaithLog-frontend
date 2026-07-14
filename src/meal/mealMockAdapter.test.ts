import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/tokenStorage', () => ({
  clearTokens: vi.fn(),
  getAuthSessionGeneration: vi.fn(() => 0),
  getStoredAuthSession: vi.fn(async () => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    generation: 0,
  })),
  getStoredTokens: vi.fn(),
  isAccessTokenOwnedByAuthSession: vi.fn(async () => true),
  isAuthSessionGenerationCurrent: vi.fn(() => true),
  isAuthSessionRequestAllowed: vi.fn(() => true),
  saveTokens: vi.fn(),
}));

import {
  addUserPollOption,
  fetchChargeSummary,
  fetchDutyAssignments,
  fetchMyCharges,
  fetchPollDetail,
  markMyChargePaid,
  savePollResponse,
} from '../api/client';
import {
  executeMockRequest,
  mealMockAccessTokens,
  resetMealMockStateForTests,
} from '../api/mockAdapter';
import {mealApi} from './mealApi';

describe('MEAL mock adapter flow', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    process.env.EXPO_PUBLIC_APP_ENV = 'local';
    resetMealMockStateForTests();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.EXPO_PUBLIC_MOCK_SCENARIO;
  });

  it('keeps multiple active MEAL duties independent from campus roles', async () => {
    const before = await fetchDutyAssignments('mock-access-token', 1);
    const mealDuties = before.filter((duty) => duty.dutyType === 'MEAL' && duty.isActive);

    expect(mealDuties.map((duty) => duty.userId)).toEqual([7, 8]);

    const assigned = await mealApi.assignDuty('mock-access-token', 1, {userId: 9});
    const afterAssign = await fetchDutyAssignments('mock-access-token', 1);

    expect(assigned).toMatchObject({dutyType: 'MEAL', userId: 9});
    expect(afterAssign.filter((duty) => duty.dutyType === 'MEAL' && duty.isActive)).toHaveLength(3);

    await mealApi.revokeDuty('mock-access-token', 1, assigned.assignmentId);
    const afterRevoke = await fetchDutyAssignments('mock-access-token', 1);
    expect(afterRevoke.filter((duty) => duty.dutyType === 'MEAL' && duty.isActive)).toHaveLength(2);
  });

  it('exposes coffee and meal duty lookups independently for a user with both duties', async () => {
    const headers = {Authorization: 'Bearer mock-access-token'};
    const [coffeeResponse, mealResponse] = await Promise.all([
      executeMockRequest('/api/v1/campuses/1/duty-assignments/me', {
        headers,
        method: 'GET',
      }),
      executeMockRequest('/api/v1/campuses/1/duty-assignments/me/meal', {
        headers,
        method: 'GET',
      }),
    ]);

    expect(coffeeResponse.status).toBe(200);
    expect(mealResponse.status).toBe(200);
    await expect(coffeeResponse.json()).resolves.toMatchObject({
      data: {dutyType: 'COFFEE', isActive: true, userId: 7},
    });
    await expect(mealResponse.json()).resolves.toMatchObject({
      data: {dutyType: 'MEAL', isActive: true, userId: 7},
    });
  });

  it('returns only the current duty owner MEAL accounts, including inactive history', async () => {
    const accounts = await mealApi.getMyPaymentAccounts('mock-access-token', 1, 7, true);

    expect(accounts).toHaveLength(2);
    expect(accounts.every((account) => account.ownerUserId === 7)).toBe(true);
    expect(accounts.every((account) => account.accountType === 'MEAL')).toBe(true);
    expect(accounts.some((account) => !account.isActive)).toBe(true);

    const newAccount = {
      nickname: '저녁 계좌',
      bankName: '우리은행',
      accountNumber: '1002-000-000000',
      accountHolder: '샘플 사용자',
    };
    await expect(
      mealApi.createPaymentAccount('mock-access-token', 1, 7, newAccount),
    ).rejects.toMatchObject({detail: {status: 409}});

    await mealApi.deactivatePaymentAccount('mock-access-token', 1, 7, 10);
    await mealApi.createPaymentAccount('mock-access-token', 1, 7, newAccount);
    const afterCreate = await mealApi.getMyPaymentAccounts('mock-access-token', 1, 7, true);
    expect(afterCreate.filter((account) => account.isActive)).toEqual([
      expect.objectContaining({nickname: '저녁 계좌'}),
    ]);
    await mealApi.deactivatePaymentAccount('mock-access-token', 1, 7, afterCreate[0]?.id ?? 0);
    await expect(
      mealApi.deactivatePaymentAccount('mock-access-token', 1, 7, afterCreate[0]?.id ?? 0),
    ).rejects.toMatchObject({detail: {status: 409}});
  });

  it('adds a user MEAL option without auto-selecting it, then allows a separate response', async () => {
    const before = await fetchPollDetail('mock-access-token', 1, 901);
    expect(before.myResponse).toBeNull();

    const added = await addUserPollOption('mock-access-token', 1, 901, {content: '비빔밥'});
    const afterAdd = await fetchPollDetail('mock-access-token', 1, 901);

    expect(added).toMatchObject({content: '비빔밥', userAdded: true});
    expect(afterAdd.myResponse).toBeNull();
    expect(afterAdd.options).toContainEqual(expect.objectContaining({id: added.id, content: '비빔밥'}));
    await expect(
      addUserPollOption('mock-access-token', 1, 901, {content: '  비빔밥  '}),
    ).rejects.toMatchObject({detail: {status: 409}});
    await addUserPollOption('mock-access-token', 1, 901, {content: 'Ramen'});
    await expect(
      addUserPollOption('mock-access-token', 1, 901, {content: '  ramen  '}),
    ).rejects.toMatchObject({detail: {status: 409}});

    await savePollResponse('mock-access-token', 1, 901, {optionIds: [added.id]});
    const afterResponse = await fetchPollDetail('mock-access-token', 1, 901);
    const managementDetail = await mealApi.getPollDetail('mock-access-token', 1, 901);
    expect(afterResponse.myResponse?.optionIds).toEqual([added.id]);
    expect(managementDetail.options.find((option) => option.optionId === added.id)?.responseCount)
      .toBe(1);
    expect(managementDetail.totalResponseCount).toBe(6);

    await expect(
      addUserPollOption('mock-access-token', 1, 902, {content: '종료 후 추가'}),
    ).rejects.toMatchObject({detail: {status: 409}});

    const noUserOptions = await mealApi.createPoll('mock-access-token', 1, {
      title: '선택지 추가 금지 투표',
      description: '',
      endsAt: '2027-07-20T03:00:00.000Z',
      options: [{content: '한식'}, {content: '중식'}],
      allowUserOptionAdd: false,
    });
    await expect(
      addUserPollOption('mock-access-token', 1, noUserOptions.id, {content: '일식'}),
    ).rejects.toMatchObject({detail: {status: 409}});
  });

  it('stores MEAL responses independently for each poll and user', async () => {
    const before = await mealApi.getPollDetail(mealMockAccessTokens.activeDuty, 1, 901);
    const firstOptionId = before.options[0]?.optionId ?? 0;
    const secondOptionId = before.options[1]?.optionId ?? 0;
    const firstCount = before.options[0]?.responseCount ?? 0;
    const secondCount = before.options[1]?.responseCount ?? 0;

    await savePollResponse(mealMockAccessTokens.activeDuty, 1, 901, {
      optionIds: [firstOptionId],
    });
    await savePollResponse(mealMockAccessTokens.otherDuty, 1, 901, {
      optionIds: [secondOptionId],
    });

    const actorADetail = await fetchPollDetail(mealMockAccessTokens.activeDuty, 1, 901);
    const actorBDetail = await fetchPollDetail(mealMockAccessTokens.otherDuty, 1, 901);
    const management = await mealApi.getPollDetail(mealMockAccessTokens.activeDuty, 1, 901);

    expect(actorADetail.responded).toBe(true);
    expect(actorADetail.myResponse?.optionIds).toEqual([firstOptionId]);
    expect(actorBDetail.responded).toBe(true);
    expect(actorBDetail.myResponse?.optionIds).toEqual([secondOptionId]);
    expect(management.options[0]?.responseCount).toBe(firstCount + 1);
    expect(management.options[1]?.responseCount).toBe(secondCount + 1);
    expect(management.totalResponseCount).toBe(before.totalResponseCount + 2);

    await mealApi.closePoll(mealMockAccessTokens.activeDuty, 1, 901);
    const result = await mealApi.createCharges(mealMockAccessTokens.activeDuty, 1, 901, {
      paymentAccountId: 10,
      groups: [
        {optionId: firstOptionId, calculationType: 'PER_MEMBER', enteredAmount: 100},
        {optionId: secondOptionId, calculationType: 'PER_MEMBER', enteredAmount: 100},
      ],
    });
    expect(result.chargedMemberCount).toBe(before.totalResponseCount + 2);
  });

  it('creates a canonical payable MEAL charge for each recorded respondent', async () => {
    const poll = await mealApi.createPoll(mealMockAccessTokens.activeDuty, 1, {
      title: '응답자 밥 청구',
      description: '',
      endsAt: '2027-07-20T03:00:00.000Z',
      options: [{content: '제육볶음'}, {content: '김치찌개'}],
      allowUserOptionAdd: false,
    });
    const firstOptionId = poll.options[0]?.optionId ?? 0;
    const secondOptionId = poll.options[1]?.optionId ?? 0;
    await savePollResponse(mealMockAccessTokens.activeDuty, 1, poll.id, {
      optionIds: [firstOptionId],
    });
    await savePollResponse(mealMockAccessTokens.otherDuty, 1, poll.id, {
      optionIds: [secondOptionId],
    });
    await mealApi.closePoll(mealMockAccessTokens.activeDuty, 1, poll.id);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T03:00:00.000Z'));
    try {
      await mealApi.createCharges(mealMockAccessTokens.activeDuty, 1, poll.id, {
        paymentAccountId: 10,
        groups: [
          {optionId: firstOptionId, calculationType: 'PER_MEMBER', enteredAmount: 7000},
          {optionId: secondOptionId, calculationType: 'PER_MEMBER', enteredAmount: 8000},
        ],
      });
    } finally {
      vi.useRealTimers();
    }

    const beforePaid = await fetchMyCharges(mealMockAccessTokens.otherDuty, 1, {
      paymentCategory: 'MEAL',
      status: 'UNPAID',
    });
    const [ownerAllCharges, ownerMealCharges, ownerPenaltyCharges] = await Promise.all([
      fetchMyCharges(mealMockAccessTokens.activeDuty, 1, {}),
      fetchMyCharges(mealMockAccessTokens.activeDuty, 1, {paymentCategory: 'MEAL'}),
      fetchMyCharges(mealMockAccessTokens.activeDuty, 1, {paymentCategory: 'PENALTY'}),
    ]);
    const charge = beforePaid.items[0];
    const ownerSettlementBeforePaid = await mealApi.getMySettlement(
      mealMockAccessTokens.activeDuty,
      1,
      7,
    );
    const ownerChargeBeforePaid = ownerSettlementBeforePaid.accounts[0]?.charges.find(
      (item) => item.memberName === '두 번째 담당자' && item.amount === 8000,
    );
    const memberSummaryBeforePaid = await fetchChargeSummary(
      mealMockAccessTokens.otherDuty,
      1,
      {year: 2026, month: 7},
    );
    const [previousMonthSummary, nextMonthSummary] = await Promise.all([
      fetchChargeSummary(mealMockAccessTokens.otherDuty, 1, {year: 2026, month: 6}),
      fetchChargeSummary(mealMockAccessTokens.otherDuty, 1, {year: 2026, month: 8}),
    ]);

    expect(beforePaid.items).toHaveLength(1);
    expect(ownerAllCharges.summary).toEqual({
      totalAmount: 25000,
      unpaidAmount: 13000,
      paidAmount: 12000,
      waivedAmount: 0,
      canceledAmount: 0,
    });
    expect(ownerMealCharges.summary).toEqual({
      totalAmount: 7000,
      unpaidAmount: 7000,
      paidAmount: 0,
      waivedAmount: 0,
      canceledAmount: 0,
    });
    expect(ownerPenaltyCharges.summary).toEqual({
      totalAmount: 18000,
      unpaidAmount: 6000,
      paidAmount: 12000,
      waivedAmount: 0,
      canceledAmount: 0,
    });
    expect(charge).toMatchObject({
      amount: 8000,
      paymentCategory: 'MEAL',
      reason: '김치찌개',
      source: {sourceType: 'POLL_RESPONSE'},
      status: 'UNPAID',
      title: '응답자 밥 청구',
    });
    expect(charge?.source?.sourceId).toBeGreaterThan(0);
    expect(charge?.account).toMatchObject({paymentAccountId: 10});
    expect(ownerChargeBeforePaid).toMatchObject({
      chargeId: charge?.id,
      memberName: '두 번째 담당자',
      status: 'UNPAID',
    });
    expect(memberSummaryBeforePaid).toMatchObject({
      userId: 8,
      name: '두 번째 담당자',
      totalPaidAmount: 0,
      monthlyPaidAmount: 0,
      monthlyUnpaidAmount: 8000,
      monthlyTotalChargeAmount: 8000,
      monthlyByCategory: [
        {paymentCategory: 'MEAL', paidAmount: 0, unpaidAmount: 8000, totalAmount: 8000},
      ],
    });
    expect(previousMonthSummary).toMatchObject({
      userId: 8,
      monthlyPaidAmount: 0,
      monthlyUnpaidAmount: 0,
      monthlyTotalChargeAmount: 0,
      monthlyByCategory: [],
    });
    expect(nextMonthSummary).toMatchObject({
      userId: 8,
      monthlyPaidAmount: 0,
      monthlyUnpaidAmount: 0,
      monthlyTotalChargeAmount: 0,
      monthlyByCategory: [],
    });

    await expect(
      markMyChargePaid(mealMockAccessTokens.activeDuty, 1, charge?.id ?? 0),
    ).rejects.toMatchObject({detail: {status: 404}});

    const paid = await markMyChargePaid(
      mealMockAccessTokens.otherDuty,
      1,
      charge?.id ?? 0,
    );
    const afterPaid = await fetchMyCharges(mealMockAccessTokens.otherDuty, 1, {
      paymentCategory: 'MEAL',
      status: 'PAID',
    });
    const ownerSettlementAfterPaid = await mealApi.getMySettlement(
      mealMockAccessTokens.activeDuty,
      1,
      7,
    );
    const memberSummaryAfterPaid = await fetchChargeSummary(
      mealMockAccessTokens.otherDuty,
      1,
      {year: 2026, month: 7},
    );
    const previousMonthAfterPaid = await fetchChargeSummary(
      mealMockAccessTokens.otherDuty,
      1,
      {year: 2026, month: 6},
    );

    expect(paid).toMatchObject({
      id: charge?.id,
      paymentCategory: 'MEAL',
      status: 'PAID',
      userId: 8,
    });
    expect(afterPaid.items).toContainEqual(expect.objectContaining({id: charge?.id, status: 'PAID'}));
    expect(ownerSettlementAfterPaid.accounts[0]?.charges).toContainEqual(
      expect.objectContaining({chargeId: charge?.id, memberName: '두 번째 담당자', status: 'PAID'}),
    );
    expect(memberSummaryAfterPaid).toMatchObject({
      userId: 8,
      totalPaidAmount: 8000,
      monthlyPaidAmount: 8000,
      monthlyUnpaidAmount: 0,
      monthlyTotalChargeAmount: 8000,
      monthlyByCategory: [
        {paymentCategory: 'MEAL', paidAmount: 8000, unpaidAmount: 0, totalAmount: 8000},
      ],
    });
    expect(previousMonthAfterPaid).toMatchObject({
      userId: 8,
      totalPaidAmount: 8000,
      monthlyPaidAmount: 0,
      monthlyUnpaidAmount: 0,
      monthlyTotalChargeAmount: 0,
      monthlyByCategory: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('isolates member charge lists and rejects unauthenticated or non-owned payment attempts', async () => {
    const ownerCharges = await fetchMyCharges(mealMockAccessTokens.activeDuty, 1, {});
    const otherCharges = await fetchMyCharges(mealMockAccessTokens.otherDuty, 1, {});
    const otherSummary = await fetchChargeSummary(
      mealMockAccessTokens.otherDuty,
      1,
      {year: 2026, month: 7},
    );
    const otherCampusCharges = await fetchMyCharges(
      mealMockAccessTokens.otherCampusDuty,
      2,
      {},
    );
    const otherCampusSummary = await fetchChargeSummary(
      mealMockAccessTokens.otherCampusDuty,
      2,
      {year: 2026, month: 7},
    );

    expect(ownerCharges).toMatchObject({campusId: 1, campusName: '샘플 캠퍼스', region: '서울'});
    expect(ownerCharges.items).toContainEqual(expect.objectContaining({id: 501}));
    expect(otherCharges.items).not.toContainEqual(expect.objectContaining({id: 501}));
    expect(otherSummary).toMatchObject({
      userId: 8,
      totalPaidAmount: 0,
      monthlyPaidAmount: 0,
      monthlyUnpaidAmount: 0,
      monthlyTotalChargeAmount: 0,
      monthlyByCategory: [],
    });
    expect(otherCampusCharges).toMatchObject({
      campusId: 2,
      campusName: '캠퍼스 2',
      region: '지역 정보 없음',
      summary: {totalAmount: 0, unpaidAmount: 0, paidAmount: 0, waivedAmount: 0, canceledAmount: 0},
      items: [],
    });
    expect(otherCampusSummary).toMatchObject({
      campusId: 2,
      campusName: '캠퍼스 2',
      region: '지역 정보 없음',
      userId: 17,
      name: '다른 캠퍼스 담당자',
      totalPaidAmount: 0,
      monthlyPaidAmount: 0,
      monthlyUnpaidAmount: 0,
      monthlyTotalChargeAmount: 0,
      monthlyByCategory: [],
    });

    const unauthenticatedList = await executeMockRequest('/api/v1/campuses/1/charges/me', {
      method: 'GET',
    });
    const unauthenticatedSummary = await executeMockRequest(
      '/api/v1/campuses/1/charges/me/summary?year=2026&month=7',
      {method: 'GET'},
    );
    const invalidSummaryMonth = await executeMockRequest(
      '/api/v1/campuses/1/charges/me/summary?year=2026&month=13',
      {
        headers: {Authorization: `Bearer ${mealMockAccessTokens.activeDuty}`},
        method: 'GET',
      },
    );
    const crossCampusSummary = await executeMockRequest(
      '/api/v1/campuses/2/charges/me/summary?year=2026&month=7',
      {
        headers: {Authorization: `Bearer ${mealMockAccessTokens.otherDuty}`},
        method: 'GET',
      },
    );
    const unauthenticatedPaid = await executeMockRequest('/api/v1/campuses/1/charges/me/501/paid', {
      method: 'PATCH',
    });
    expect(unauthenticatedList.status).toBe(401);
    expect(unauthenticatedSummary.status).toBe(401);
    expect(invalidSummaryMonth.status).toBe(400);
    expect(crossCampusSummary.status).toBe(404);
    expect(unauthenticatedPaid.status).toBe(401);

    await expect(
      markMyChargePaid(mealMockAccessTokens.otherDuty, 1, 501),
    ).rejects.toMatchObject({detail: {status: 404}});
    await expect(
      markMyChargePaid(mealMockAccessTokens.otherDuty, 1, 999_999),
    ).rejects.toMatchObject({detail: {status: 404}});
  });

  it('scopes and mutates the legacy owner charge within its explicit fixture month', async () => {
    const [juneBefore, julyBefore, augustBefore] = await Promise.all([
      fetchChargeSummary(mealMockAccessTokens.activeDuty, 1, {year: 2026, month: 6}),
      fetchChargeSummary(mealMockAccessTokens.activeDuty, 1, {year: 2026, month: 7}),
      fetchChargeSummary(mealMockAccessTokens.activeDuty, 1, {year: 2026, month: 8}),
    ]);

    expect(juneBefore).toMatchObject({
      totalPaidAmount: 12000,
      monthlyPaidAmount: 12000,
      monthlyUnpaidAmount: 6000,
      monthlyTotalChargeAmount: 18000,
      monthlyByCategory: [
        {paymentCategory: 'PENALTY', paidAmount: 12000, unpaidAmount: 6000, totalAmount: 18000},
      ],
    });
    for (const outsideFixtureMonth of [julyBefore, augustBefore]) {
      expect(outsideFixtureMonth).toMatchObject({
        totalPaidAmount: 12000,
        monthlyPaidAmount: 0,
        monthlyUnpaidAmount: 0,
        monthlyTotalChargeAmount: 0,
        monthlyByCategory: [],
      });
    }

    const paid = await markMyChargePaid(mealMockAccessTokens.activeDuty, 1, 501);
    const [listAfterPaid, juneAfterPaid, julyAfterPaid] = await Promise.all([
      fetchMyCharges(mealMockAccessTokens.activeDuty, 1, {}),
      fetchChargeSummary(mealMockAccessTokens.activeDuty, 1, {year: 2026, month: 6}),
      fetchChargeSummary(mealMockAccessTokens.activeDuty, 1, {year: 2026, month: 7}),
    ]);

    expect(paid).toMatchObject({id: 501, userId: 7, status: 'PAID', amount: 3000});
    expect(listAfterPaid.items).toContainEqual(expect.objectContaining({id: 501, status: 'PAID'}));
    expect(juneAfterPaid).toMatchObject({
      totalPaidAmount: 15000,
      monthlyPaidAmount: 15000,
      monthlyUnpaidAmount: 3000,
      monthlyTotalChargeAmount: 18000,
      monthlyByCategory: [
        {paymentCategory: 'PENALTY', paidAmount: 15000, unpaidAmount: 3000, totalAmount: 18000},
      ],
    });
    expect(julyAfterPaid).toMatchObject({
      totalPaidAmount: 15000,
      monthlyPaidAmount: 0,
      monthlyUnpaidAmount: 0,
      monthlyTotalChargeAmount: 0,
      monthlyByCategory: [],
    });
    await expect(
      markMyChargePaid(mealMockAccessTokens.activeDuty, 1, 501),
    ).rejects.toMatchObject({detail: {status: 409}});

    resetMealMockStateForTests();
    const [listAfterReset, juneAfterReset] = await Promise.all([
      fetchMyCharges(mealMockAccessTokens.activeDuty, 1, {}),
      fetchChargeSummary(mealMockAccessTokens.activeDuty, 1, {year: 2026, month: 6}),
    ]);
    expect(listAfterReset.items).toContainEqual(expect.objectContaining({id: 501, status: 'UNPAID'}));
    expect(juneAfterReset).toMatchObject({
      totalPaidAmount: 12000,
      monthlyPaidAmount: 12000,
      monthlyUnpaidAmount: 6000,
    });
  });

  it('keeps old CLOSED polls in the separate management list', async () => {
    const list = await mealApi.listPolls('mock-access-token', 1, {
      page: 0,
      size: 20,
      sort: 'endsAt,desc',
      status: 'CLOSED',
    });

    expect(list.content).toContainEqual(expect.objectContaining({id: 902, status: 'CLOSED'}));
    expect(new Date(list.content.find((poll) => poll.id === 902)?.endsAt ?? 0).getTime())
      .toBeLessThan(new Date('2026-07-01T00:00:00.000Z').getTime());
  });

  it('closes without charging, then batches every responding group with one account', async () => {
    const closed = await mealApi.closePoll('mock-access-token', 1, 901);

    expect(closed.status).toBe('CLOSED');
    expect(closed.settlementStatus).toBe('NOT_CHARGED');
    expect(closed.options.every((option) => option.charge.chargeStatus === 'NOT_CHARGED')).toBe(true);
    await expect(mealApi.closePoll('mock-access-token', 1, 901)).rejects.toMatchObject({
      detail: {status: 409},
    });

    const perOptionAccount = await executeMockRequest(
      '/api/v1/campuses/1/meal/polls/902/charges',
      {
        body: JSON.stringify({
          paymentAccountId: 10,
          groups: [
            {optionId: 9021, paymentAccountId: 10, calculationType: 'GROUP_TOTAL', enteredAmount: 10000},
            {optionId: 9022, calculationType: 'PER_MEMBER', enteredAmount: 8000},
          ],
        }),
        headers: {Authorization: `Bearer ${mealMockAccessTokens.activeDuty}`},
        method: 'POST',
      },
    );
    expect(perOptionAccount.status).toBe(400);

    const result = await mealApi.createCharges('mock-access-token', 1, 902, {
      paymentAccountId: 10,
      groups: [
        {optionId: 9021, calculationType: 'GROUP_TOTAL', enteredAmount: 10000},
        {optionId: 9022, calculationType: 'PER_MEMBER', enteredAmount: 8000},
      ],
    });
    const detail = await mealApi.getPollDetail('mock-access-token', 1, 902);
    const settlement = await mealApi.getMySettlement('mock-access-token', 1, 7);

    expect(result).toMatchObject({
      paymentAccountId: 10,
      chargedMemberCount: 5,
      requestedTotalAmount: 26000,
      actualTotalAmount: 26002,
      roundingAdjustment: 2,
    });
    expect(result.groups).toHaveLength(2);
    expect(result.groups).not.toContainEqual(expect.objectContaining({optionId: 9023}));
    expect(detail.options.find((option) => option.optionId === 9021)?.charge).toMatchObject({
      amountPerMember: 3334,
      actualTotalAmount: 10002,
      paymentAccountId: 10,
    });
    expect(settlement.accounts).toHaveLength(1);
    expect(settlement.accounts[0]?.account.ownerUserId).toBe(7);
    await expect(
      mealApi.createCharges('mock-access-token', 1, 902, {
        paymentAccountId: 10,
        groups: [
          {optionId: 9021, calculationType: 'GROUP_TOTAL', enteredAmount: 10000},
          {optionId: 9022, calculationType: 'PER_MEMBER', enteredAmount: 8000},
        ],
      }),
    ).rejects.toMatchObject({detail: {status: 409}});
  });

  it('does not reveal another duty owner account id or allow a NOT_CHARGED action', async () => {
    const detail = await mealApi.getPollDetail('mock-access-token', 1, 903);
    const charge = detail.options[0]?.charge;

    expect(charge).toMatchObject({chargeStatus: 'CHARGED', chargedByMe: false, paymentAccountId: null});
    expect(detail.options.some((option) => option.charge.chargeStatus === 'NOT_CHARGED')).toBe(false);
  });

  it('separates non-duty, inactive-duty, and cross-campus authorization', async () => {
    const unauthorized = await executeMockRequest(
      '/api/v1/campuses/1/meal/polls?page=0&size=20&sort=endsAt%2Cdesc',
      {headers: {Authorization: 'Bearer unknown-token'}, method: 'GET'},
    );
    expect(unauthorized.status).toBe(401);
    await expect(
      mealApi.listPolls(mealMockAccessTokens.nonDutyAdmin, 1),
    ).rejects.toMatchObject({detail: {status: 403}});
    await expect(
      mealApi.listPolls(mealMockAccessTokens.inactiveDuty, 1),
    ).rejects.toMatchObject({detail: {status: 403}});
    await expect(
      mealApi.listPolls(mealMockAccessTokens.activeDuty, 2),
    ).rejects.toMatchObject({detail: {status: 404}});

    await expect(
      mealApi.listPolls(mealMockAccessTokens.otherCampusDuty, 2),
    ).resolves.toMatchObject({content: []});
    await expect(
      mealApi.assignDuty(mealMockAccessTokens.otherDuty, 1, {userId: 9}),
    ).rejects.toMatchObject({detail: {status: 403}});
  });

  it('never exposes or mutates another duty owner account', async () => {
    await expect(
      mealApi.getMyPaymentAccounts(mealMockAccessTokens.otherDuty, 1, 8, true),
    ).resolves.toEqual([]);
    await expect(
      mealApi.deactivatePaymentAccount(mealMockAccessTokens.otherDuty, 1, 8, 10),
    ).rejects.toMatchObject({detail: {status: 404}});
  });

  it('rejects cross-campus MEAL option additions', async () => {
    await expect(
      addUserPollOption(mealMockAccessTokens.activeDuty, 2, 901, {content: '다른 캠퍼스 메뉴'}),
    ).rejects.toMatchObject({detail: {status: 404}});
    await expect(
      savePollResponse(mealMockAccessTokens.activeDuty, 2, 901, {optionIds: [9011]}),
    ).rejects.toMatchObject({detail: {status: 404}});
  });

  it('rejects forbidden create fields and missing duty assignments with distinct statuses', async () => {
    const forbidden = await executeMockRequest('/api/v1/campuses/1/meal/polls', {
      body: JSON.stringify({
        title: '금지 필드 투표',
        description: '',
        startsAt: '2027-07-19T03:00:00.000Z',
        endsAt: '2027-07-20T03:00:00.000Z',
        options: [{content: '한식'}, {content: '중식'}],
        allowUserOptionAdd: true,
      }),
      headers: {Authorization: `Bearer ${mealMockAccessTokens.activeDuty}`},
      method: 'POST',
    });
    expect(forbidden.status).toBe(400);
    await expect(
      mealApi.revokeDuty(mealMockAccessTokens.activeDuty, 1, 99999),
    ).rejects.toMatchObject({detail: {status: 404}});
  });

  it('filters settlement and charged account privacy by the requesting duty owner', async () => {
    const account = await mealApi.createPaymentAccount(mealMockAccessTokens.otherDuty, 1, 8, {
      nickname: '두 번째 담당자 계좌',
      bankName: '우리은행',
      accountNumber: '1002-000-000000',
      accountHolder: '두 번째 담당자',
    });
    await mealApi.createCharges(mealMockAccessTokens.otherDuty, 1, 902, {
      paymentAccountId: account.id,
      groups: [
        {optionId: 9021, calculationType: 'GROUP_TOTAL', enteredAmount: 10000},
        {optionId: 9022, calculationType: 'PER_MEMBER', enteredAmount: 8000},
      ],
    });

    const ownSettlement = await mealApi.getMySettlement(mealMockAccessTokens.otherDuty, 1, 8);
    const otherSettlement = await mealApi.getMySettlement(mealMockAccessTokens.activeDuty, 1, 7);
    const hiddenDetail = await mealApi.getPollDetail(mealMockAccessTokens.activeDuty, 1, 902);

    expect(ownSettlement.accounts[0]?.account.ownerUserId).toBe(8);
    expect(otherSettlement.accounts).toEqual([]);
    expect(hiddenDetail.options[0]?.charge).toMatchObject({
      chargeStatus: 'CHARGED',
      chargedByMe: false,
      paymentAccountId: null,
    });
  });
});
