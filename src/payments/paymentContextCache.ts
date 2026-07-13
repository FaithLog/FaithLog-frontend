import {fetchMyCharges, fetchPaymentAccounts} from '../api/client';
import {getAuthSessionGeneration} from '../api/tokenStorage';
import type {PaymentAccount} from '../api/types';

const TTL_MS = 60_000;
type Context = {accounts: PaymentAccount[]; coffeeAccountIdsWithCharges: number[]; totalUnpaidAmount: number};
const entries = new Map<string, {expiresAt: number; promise: Promise<Context>}>();
let retainedGeneration = getAuthSessionGeneration();

export function getPaymentContext(accessToken: string, campusId: number) {
  const generation = getAuthSessionGeneration();
  if (generation !== retainedGeneration) {
    entries.clear();
    retainedGeneration = generation;
  }
  const key = `${generation}:${campusId}`;
  const cached = entries.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  entries.delete(key);
  const promise = Promise.all([
    fetchMyCharges(accessToken, campusId, {page: 0, paymentCategory: 'ALL', size: 1, sort: {key: 'createdAt', direction: 'desc'}, status: 'UNPAID'}),
    fetchMyCharges(accessToken, campusId, {page: 0, paymentCategory: 'COFFEE', size: 100, sort: {key: 'createdAt', direction: 'desc'}, status: 'ALL'}),
    fetchPaymentAccounts(accessToken, campusId),
  ]).then(([unpaid, coffee, accounts]) => ({
    accounts,
    coffeeAccountIdsWithCharges: Array.from(new Set(coffee.items.flatMap((item) =>
      item.account?.paymentAccountId ? [item.account.paymentAccountId] : []))),
    totalUnpaidAmount: unpaid.summary.unpaidAmount,
  })).catch((error) => { entries.delete(key); throw error; });
  entries.set(key, {expiresAt: Date.now() + TTL_MS, promise});
  return promise;
}

export function invalidatePaymentContextCache(campusId?: number) {
  if (campusId === undefined) { entries.clear(); return; }
  for (const key of entries.keys()) if (key.endsWith(`:${campusId}`)) entries.delete(key);
}
