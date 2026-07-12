import {describe, expect, it} from 'vitest';
import {isPaymentNavigationLocked} from './paymentViewSafety';

describe('payment mutation navigation', () => {
  it('blocks back and page changes while markPaid is deferred', async () => {
    let finish!: () => void;
    const mutation = new Promise<void>((resolve) => { finish = resolve; });
    let page = 2;
    const tryNavigate = (nextPage: number) => {
      if (!isPaymentNavigationLocked('markingPaid')) page = nextPage;
    };
    tryNavigate(0);
    tryNavigate(3);
    expect(page).toBe(2);
    finish();
    await mutation;
  });
});
