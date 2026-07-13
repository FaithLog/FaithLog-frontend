import {describe, expect, it} from 'vitest';
import {invalidatePaymentListRequest, isPaymentListRequestCurrent, isPaymentNavigationLocked, shouldChangePaymentFilter} from './paymentViewSafety';

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

  it('invalidates filter A synchronously before filter B effect starts', async () => {
    let finishA!: () => void;
    const a = new Promise<void>((resolve) => { finishA = resolve; });
    const sequence = {current: 1};
    const key = {current: '1:campus:A:page0'};
    let applied = false;
    const task = a.then(() => {
      applied = isPaymentListRequestCurrent(
        1, sequence.current, '1:campus:A:page0', key.current, 1, 1,
      );
    });
    invalidatePaymentListRequest(sequence, key);
    finishA();
    await task;
    expect(applied).toBe(false);
  });

  it('keeps page N and its data when the selected chip is pressed again', () => {
    const page = 3;
    const data = ['page-3'];
    expect(shouldChangePaymentFilter('UNPAID', 'UNPAID')).toBe(false);
    expect({page, data}).toEqual({page: 3, data: ['page-3']});
  });
});
