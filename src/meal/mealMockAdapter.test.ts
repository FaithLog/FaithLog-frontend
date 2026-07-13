import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../api/tokenStorage', () => ({
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
  addUserPollOption,
  fetchDutyAssignments,
  fetchPollDetail,
  savePollResponse,
} from '../api/client';
import {resetMealMockStateForTests} from '../api/mockAdapter';
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
    expect(afterAssign.filter((duty) => duty.dutyType === 'MEAL')).toHaveLength(3);

    await mealApi.revokeDuty('mock-access-token', 1, assigned.assignmentId);
    const afterRevoke = await fetchDutyAssignments('mock-access-token', 1);
    expect(afterRevoke.filter((duty) => duty.dutyType === 'MEAL')).toHaveLength(2);
  });

  it('returns only the current duty owner MEAL accounts, including inactive history', async () => {
    const accounts = await mealApi.getMyPaymentAccounts('mock-access-token', 1, true);

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
      mealApi.createPaymentAccount('mock-access-token', 1, newAccount),
    ).rejects.toMatchObject({detail: {status: 409}});

    await mealApi.deactivatePaymentAccount('mock-access-token', 1, 10);
    await mealApi.createPaymentAccount('mock-access-token', 1, newAccount);
    const afterCreate = await mealApi.getMyPaymentAccounts('mock-access-token', 1, true);
    expect(afterCreate.filter((account) => account.isActive)).toEqual([
      expect.objectContaining({nickname: '저녁 계좌'}),
    ]);
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

    await savePollResponse('mock-access-token', 1, 901, {optionIds: [added.id]});
    const afterResponse = await fetchPollDetail('mock-access-token', 1, 901);
    expect(afterResponse.myResponse?.optionIds).toEqual([added.id]);

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

    const result = await mealApi.createCharges('mock-access-token', 1, 902, {
      paymentAccountId: 10,
      groups: [
        {optionId: 9021, calculationType: 'GROUP_TOTAL', enteredAmount: 10000},
        {optionId: 9022, calculationType: 'PER_MEMBER', enteredAmount: 8000},
      ],
    });
    const detail = await mealApi.getPollDetail('mock-access-token', 1, 902);
    const settlement = await mealApi.getMySettlement('mock-access-token', 1);

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
});
