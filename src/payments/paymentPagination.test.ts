import {describe, expect, it} from 'vitest';
import {findFreshFallbackPage} from './paymentPagination';

describe('payment empty-page fallback', () => {
  it('fetches page 0 after the final unpaid item on page 1 is paid', async () => {
    const oldPaidCharge = {id: 99, status: 'UNPAID'};
    const freshPage = [{id: 1, status: 'UNPAID'}];
    const result = await findFreshFallbackPage(1, async (page) => {
      expect(page).toBe(0);
      return freshPage;
    }, (data) => data.length === 0, () => true);
    expect(result?.page).toBe(0);
    expect(result?.data).toEqual(freshPage);
    expect(result?.data).not.toContainEqual(oldPaidCharge);
  });

  it('walks backward across empty intermediate pages', async () => {
    const visited: number[] = [];
    const result = await findFreshFallbackPage(3, async (page) => {
      visited.push(page);
      return page === 1 ? ['fresh'] : [];
    }, (data) => data.length === 0, () => true);
    expect(visited).toEqual([2, 1]);
    expect(result).toEqual({page: 1, data: ['fresh']});
  });
});
