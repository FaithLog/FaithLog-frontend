import {describe, expect, it} from 'vitest';

import {filterDutySettlementMembers} from './dutySettlementFilter';

const members = [
  {userId: 1, unpaidAmount: 5000, paidAmount: 0},
  {userId: 2, unpaidAmount: 0, paidAmount: 7000},
  {userId: 3, unpaidAmount: 2000, paidAmount: 3000},
  {userId: 4, unpaidAmount: 0, paidAmount: 0},
];

describe('duty settlement member filtering', () => {
  it('keeps every member in the all view', () => {
    expect(filterDutySettlementMembers(members, 'ALL').map((member) => member.userId))
      .toEqual([1, 2, 3, 4]);
  });

  it('separates unpaid and paid members without losing mixed-status members', () => {
    expect(filterDutySettlementMembers(members, 'UNPAID').map((member) => member.userId))
      .toEqual([1, 3]);
    expect(filterDutySettlementMembers(members, 'PAID').map((member) => member.userId))
      .toEqual([2, 3]);
  });
});
