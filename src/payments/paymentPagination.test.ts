import {describe, expect, it} from 'vitest';
import {fetchFreshFallbackPage} from './paymentPagination';

describe('payment empty-page fallback', () => {
  it('fetches page 0 after the final unpaid item on page 1 is paid', async () => {
    const oldPaidCharge = {id: 99, status: 'UNPAID'};
    const freshPage = [{id: 1, status: 'UNPAID'}];
    const result = await fetchFreshFallbackPage(1, async (page) => {
      expect(page).toBe(0);
      return freshPage;
    });
    expect(result.page).toBe(0);
    expect(result.data).toEqual(freshPage);
    expect(result.data).not.toContainEqual(oldPaidCharge);
  });
});
