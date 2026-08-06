import {describe, expect, it} from 'vitest';

import {createWeeklyMaterialMockApi} from './weeklyMaterialMockApi';

describe('weekly material mock scope parity', () => {
  it('keeps guides campus-scoped while both sharing sheets are global', async () => {
    const api = createWeeklyMaterialMockApi();
    const week = '2026-08-03';

    await api.putMaterial('token', 1, week, 'SHEPHERD_GUIDE', 101);
    await api.putMaterial('token', 2, week, 'SHEPHERD_GUIDE', 201);
    await api.putMaterial('token', 1, week, 'SUNDAY_SHARING_SHEET', 301);
    await api.putMaterial('token', 2, week, 'SATURDAY_LEADER_SHARING_SHEET', 401);

    const campusA = await api.getWeek('token', 1, week);
    const campusB = await api.getWeek('token', 2, week);
    expect(findAsset(campusA, 'SHEPHERD_GUIDE')).toBe(101);
    expect(findAsset(campusB, 'SHEPHERD_GUIDE')).toBe(201);
    expect(findAsset(campusA, 'SUNDAY_SHARING_SHEET')).toBe(301);
    expect(findAsset(campusB, 'SUNDAY_SHARING_SHEET')).toBe(301);
    expect(findAsset(campusA, 'SATURDAY_LEADER_SHARING_SHEET')).toBe(401);
    expect(findAsset(campusB, 'SATURDAY_LEADER_SHARING_SHEET')).toBe(401);
  });

  it('deletes a guide only for its campus and a sharing sheet for every campus', async () => {
    const api = createWeeklyMaterialMockApi();
    const week = '2026-08-03';
    await api.putMaterial('token', 1, week, 'SHEPHERD_GUIDE', 101);
    await api.putMaterial('token', 2, week, 'SHEPHERD_GUIDE', 201);
    await api.putMaterial('token', 1, week, 'SUNDAY_SHARING_SHEET', 301);

    await api.deleteMaterial('token', 1, week, 'SHEPHERD_GUIDE');
    expect(findAsset(await api.getWeek('token', 1, week), 'SHEPHERD_GUIDE')).toBeUndefined();
    expect(findAsset(await api.getWeek('token', 2, week), 'SHEPHERD_GUIDE')).toBe(201);

    await api.deleteMaterial('token', 2, week, 'SUNDAY_SHARING_SHEET');
    expect(findAsset(await api.getWeek('token', 1, week), 'SUNDAY_SHARING_SHEET')).toBeUndefined();
    expect(findAsset(await api.getWeek('token', 2, week), 'SUNDAY_SHARING_SHEET')).toBeUndefined();
  });
});

function findAsset(
  week: Awaited<ReturnType<ReturnType<typeof createWeeklyMaterialMockApi>['getWeek']>>,
  type: 'SATURDAY_LEADER_SHARING_SHEET' | 'SHEPHERD_GUIDE' | 'SUNDAY_SHARING_SHEET',
) {
  return week.materials.find((material) => material.materialType === type)?.mediaAssetId;
}
