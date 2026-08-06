import {describe, expect, it} from 'vitest';

import {
  applyWeeklyMaterialDelete,
  applyWeeklyMaterialUpsert,
  beginWeeklyMaterialRequest,
  createWeeklyMaterialRequestCoordinator,
  getAdjacentWeekStartDates,
  getWeeklyMaterialCacheKey,
  invalidateWeeklyMaterialCacheForMutation,
  isWeeklyMaterialRequestCurrent,
} from './weeklyMaterialState';
import type {WeeklyMaterialWeek} from './weeklyMaterialTypes';

const emptyWeek: WeeklyMaterialWeek = {
  campusId: 1,
  materials: [],
  weekStartDate: '2026-08-03',
};

describe('weekly material state isolation', () => {
  it('keys cache by campus and actual weekStartDate', () => {
    expect(getWeeklyMaterialCacheKey(1, '2026-08-03')).toBe('1:2026-08-03');
    expect(getWeeklyMaterialCacheKey(2, '2026-08-03')).not.toBe(
      getWeeklyMaterialCacheKey(1, '2026-08-03'),
    );
  });

  it('prefetches only the adjacent previous and next weeks', () => {
    expect(getAdjacentWeekStartDates('2026-08-03')).toEqual([
      '2026-07-27',
      '2026-08-10',
    ]);
  });

  it('ignores late responses after a faster request for the same key', () => {
    const coordinator = createWeeklyMaterialRequestCoordinator();
    const oldRequest = beginWeeklyMaterialRequest(coordinator, 1, '2026-08-03');
    const currentRequest = beginWeeklyMaterialRequest(coordinator, 1, '2026-08-03');
    expect(isWeeklyMaterialRequestCurrent(coordinator, oldRequest)).toBe(false);
    expect(isWeeklyMaterialRequestCurrent(coordinator, currentRequest)).toBe(true);
  });

  it('updates, orders, and deletes three materials without changing siblings', () => {
    const guide = {
      materialType: 'SHEPHERD_GUIDE' as const,
      mediaAssetId: 1,
      fileName: 'guide.pdf',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      updatedAt: '2026-08-03T00:00:00Z',
    };
    const sheet = {...guide, materialType: 'SUNDAY_SHARING_SHEET' as const, mediaAssetId: 2};
    const saturdaySheet = {
      ...guide,
      materialType: 'SATURDAY_LEADER_SHARING_SHEET' as const,
      mediaAssetId: 3,
    };
    const withAll = applyWeeklyMaterialUpsert(
      applyWeeklyMaterialUpsert(emptyWeek, guide),
      saturdaySheet,
    );
    const ordered = applyWeeklyMaterialUpsert(withAll, sheet);
    expect(ordered.materials.map((material) => material.materialType)).toEqual([
      'SHEPHERD_GUIDE',
      'SUNDAY_SHARING_SHEET',
      'SATURDAY_LEADER_SHARING_SHEET',
    ]);
    const afterDelete = applyWeeklyMaterialDelete(ordered, 'SUNDAY_SHARING_SHEET');
    expect(afterDelete.materials).toEqual([guide, saturdaySheet]);
  });

  it('invalidates only the selected campus after a shepherd guide mutation', () => {
    const cache = {
      '1:2026-08-03': 'campus-1-current',
      '1:2026-08-10': 'campus-1-next',
      '2:2026-08-03': 'campus-2-current',
    };

    expect(invalidateWeeklyMaterialCacheForMutation(
      cache,
      1,
      'SHEPHERD_GUIDE',
    )).toEqual({'2:2026-08-03': 'campus-2-current'});
  });

  it.each([
    'SUNDAY_SHARING_SHEET',
    'SATURDAY_LEADER_SHARING_SHEET',
  ] as const)('invalidates every campus after a global %s mutation', (materialType) => {
    expect(invalidateWeeklyMaterialCacheForMutation(
      {
        '1:2026-08-03': 'campus-1',
        '2:2026-08-03': 'campus-2',
      },
      1,
      materialType,
    )).toEqual({});
  });
});
