import {describe, expect, it} from 'vitest';

import {
  parseAdminCampusChargeSummary,
  parseAdminMemberChargeList,
  parseChargeList,
} from './runtimeValidation';
import {DEFAULT_PAGE_SIZE, hasNextPage} from './pagination';
import {parseMealSettlement} from '../meal/mealRuntimeValidation';

const metadata = {page: 0, size: 10, totalElements: 1, totalPages: 1};

describe('shared pagination contract', () => {
  it('uses ten items and metadata for next-page decisions', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    expect(hasNextPage({page: 0, totalPages: 2})).toBe(true);
    expect(hasNextPage({page: 1, totalPages: 2})).toBe(false);
  });

  it('requires pagination metadata on user and admin charge responses', () => {
    expect(parseChargeList({...chargeList(), ...metadata})).toMatchObject(metadata);
    expect(parseAdminMemberChargeList({...chargeList(), ...metadata, userId: 7, name: '멤버', email: 'm@example.com'}))
      .toMatchObject(metadata);
    expect(parseAdminCampusChargeSummary({...chargeSummary(), ...metadata})).toMatchObject(metadata);

    expect(() => parseChargeList(chargeList())).toThrow('Invalid API response');
    expect(() => parseAdminCampusChargeSummary(chargeSummary())).toThrow('Invalid API response');
  });

  it('requires pagination metadata on meal settlement responses', () => {
    expect(parseMealSettlement({...mealSettlement(), ...metadata})).toMatchObject(metadata);
    expect(() => parseMealSettlement(mealSettlement())).toThrow('Invalid API response');
  });
});

function summary() {
  return {totalAmount: 1000, unpaidAmount: 1000, paidAmount: 0, waivedAmount: 0, canceledAmount: 0};
}

function chargeList() {
  return {campusId: 1, campusName: '캠퍼스', region: '서울', summary: summary(), items: []};
}

function chargeSummary() {
  return {campusId: 1, campusName: '캠퍼스', region: '서울', summary: summary(), members: []};
}

function mealSettlement() {
  return {campusId: 1, campusName: '캠퍼스', region: '서울', summary: summary(), members: []};
}
