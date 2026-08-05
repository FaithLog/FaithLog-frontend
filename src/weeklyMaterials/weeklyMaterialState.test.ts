import {describe, expect, it} from 'vitest';

import {
  applyWeeklyMaterialDelete,
  applyWeeklyMaterialUpsert,
  beginWeeklyMaterialRequest,
  createWeeklyMaterialRequestCoordinator,
  getAdjacentWeekStartDates,
  getWeeklyMaterialCacheKey,
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

  it('updates and deletes one material without changing its sibling', () => {
    const guide = {
      materialType: 'SHEPHERD_GUIDE' as const,
      mediaAssetId: 1,
      fileName: 'guide.pdf',
      byteSize: 100,
      sha256: 'a'.repeat(64),
      updatedAt: '2026-08-03T00:00:00Z',
      uploadedByName: '관리자',
    };
    const sheet = {...guide, materialType: 'SHARING_SHEET' as const, mediaAssetId: 2};
    const withBoth = applyWeeklyMaterialUpsert(
      applyWeeklyMaterialUpsert(emptyWeek, guide),
      sheet,
    );
    const afterDelete = applyWeeklyMaterialDelete(withBoth, 'SHEPHERD_GUIDE');
    expect(afterDelete.materials).toEqual([sheet]);
  });
});
