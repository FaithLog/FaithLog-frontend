import {describe, expect, it} from 'vitest';

import type {ChargeItem} from '../api/types';
import {getPayableAccountsFromCharges} from './paymentPayableAccounts';

const charges: ChargeItem[] = [
  charge(1, 'PENALTY', 11, '벌금은행'),
  charge(2, 'COFFEE', 22, '커피은행'),
  charge(3, 'MEAL', 33, '밥은행'),
  charge(4, 'MEAL', 33, '밥은행'),
  {...charge(5, 'COFFEE', 44, '미연결'), account: null},
];

describe('payable account snapshots', () => {
  it('shows exact charge-linked accounts across all categories without duplicates', () => {
    expect(getPayableAccountsFromCharges(charges, 'ALL').map((account) => account.paymentAccountId))
      .toEqual([11, 22, 33]);
  });

  it.each([
    ['PENALTY', [11]],
    ['COFFEE', [22]],
    ['MEAL', [33]],
  ] as const)('keeps only the %s account linked to visible charges', (category, ids) => {
    expect(getPayableAccountsFromCharges(charges, category).map((account) => account.paymentAccountId))
      .toEqual(ids);
  });
});

function charge(
  id: number,
  paymentCategory: ChargeItem['paymentCategory'],
  paymentAccountId: number,
  bankName: string,
): ChargeItem {
  return {
    id,
    paymentCategory,
    title: `청구 ${id}`,
    amount: 1000,
    status: 'UNPAID',
    account: {
      paymentAccountId,
      bankName,
      accountNumber: `${paymentAccountId}000`,
      accountHolder: '예금주',
    },
  };
}
