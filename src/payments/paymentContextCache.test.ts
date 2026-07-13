import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({generation: 1, fetchMyCharges: vi.fn(), fetchPaymentAccounts: vi.fn()}));
vi.mock('../api/tokenStorage', () => ({getAuthSessionGeneration: () => mocks.generation}));
vi.mock('../api/client', () => ({
  fetchMyCharges: mocks.fetchMyCharges,
  fetchPaymentAccounts: mocks.fetchPaymentAccounts,
}));

import {getPaymentContext, invalidatePaymentContextCache} from './paymentContextCache';

describe('payment context cache', () => {
  beforeEach(() => {
    mocks.generation += 1;
    vi.clearAllMocks();
    mocks.fetchMyCharges.mockImplementation(async (_token, _campus, query) => ({
      items: query.paymentCategory === 'COFFEE' ? [{account: {paymentAccountId: 7}}] : [],
      summary: {unpaidAmount: 1200},
    }));
    mocks.fetchPaymentAccounts.mockResolvedValue([]);
  });

  it('deduplicates within a generation and invalidates admin mutations', async () => {
    await getPaymentContext('token', 3);
    await getPaymentContext('token', 3);
    expect(mocks.fetchMyCharges).toHaveBeenCalledTimes(2);
    invalidatePaymentContextCache(3);
    await getPaymentContext('token', 3);
    expect(mocks.fetchMyCharges).toHaveBeenCalledTimes(4);
  });

  it('does not reuse an old generation entry', async () => {
    await getPaymentContext('token', 3);
    mocks.generation += 1;
    await getPaymentContext('next-token', 3);
    expect(mocks.fetchPaymentAccounts).toHaveBeenCalledTimes(2);
  });
});
