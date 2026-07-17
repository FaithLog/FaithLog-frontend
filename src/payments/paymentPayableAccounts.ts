import type {
  ChargeItem,
  ChargePaymentAccountSnapshot,
  PaymentCategory,
} from '../api/types';

export type PaymentCategoryFilter = PaymentCategory | 'ALL';

export type PayableAccount = ChargePaymentAccountSnapshot & {
  paymentCategories: PaymentCategory[];
};

export function getPayableAccountsFromCharges(
  charges: ChargeItem[],
  category: PaymentCategoryFilter,
): PayableAccount[] {
  const accounts = new Map<number, PayableAccount>();

  for (const charge of charges) {
    if (category !== 'ALL' && charge.paymentCategory !== category) continue;
    if (!charge.account) continue;

    const current = accounts.get(charge.account.paymentAccountId);
    if (current) {
      if (!current.paymentCategories.includes(charge.paymentCategory)) {
        current.paymentCategories.push(charge.paymentCategory);
      }
      continue;
    }

    accounts.set(charge.account.paymentAccountId, {
      ...charge.account,
      paymentCategories: [charge.paymentCategory],
    });
  }

  return [...accounts.values()];
}
