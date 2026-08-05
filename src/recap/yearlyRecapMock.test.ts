import {describe, expect, it} from 'vitest';

import {getMockYearlyRecap} from './yearlyRecapMock';
import {parseYearlyRecapData} from './yearlyRecapRuntimeValidation';

describe('yearly recap exact-contract mocks', () => {
  it('uses exact comment and penalty fields with no poll fixture', () => {
    const recap = getMockYearlyRecap('recap-default');

    expect(recap.commentActivity).toEqual({writtenCount: 6});
    expect(recap.penaltySummary).toEqual({
      totalCount: 3,
      totalAmount: 45_000,
      paidCount: 2,
      paidAmount: 30_000,
      unpaidCount: 1,
      unpaidAmount: 15_000,
    });
    expect(recap).not.toHaveProperty('pollActivity');
    expect(parseYearlyRecapData(recap)).toEqual(recap);
  });

  it('models absent section capabilities without hiding the existing recap', () => {
    const recap = getMockYearlyRecap('recap-partial');

    expect(recap).not.toHaveProperty('commentActivity');
    expect(recap).not.toHaveProperty('penaltySummary');
    expect(recap.devotion.quietTimeCount).toBeGreaterThan(0);
    expect(parseYearlyRecapData(recap)).toEqual(recap);
  });

  it.each([
    'recap-penalty-zero',
    'recap-penalty-paid',
    'recap-penalty-unpaid',
    'recap-penalty-large',
  ])('keeps %s inside the strict runtime boundary', (scenario) => {
    const recap = getMockYearlyRecap(scenario);

    expect(() => parseYearlyRecapData(recap)).not.toThrow();
  });
});
