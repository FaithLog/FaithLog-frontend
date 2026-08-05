import type {WeeklyMaterialApi} from './weeklyMaterialApi';
import {getSeoulCurrentWeekStartDate} from './weeklyMaterialDate';
import {applyWeeklyMaterialDelete, applyWeeklyMaterialUpsert, getWeeklyMaterialCacheKey} from './weeklyMaterialState';
import type {WeeklyMaterialType, WeeklyMaterialWeek} from './weeklyMaterialTypes';

const weeks = new Map<string, WeeklyMaterialWeek>();

export const weeklyMaterialMockApi: WeeklyMaterialApi = {
  async getCurrentWeek(_token, campusId) {
    return getOrCreate(campusId, getSeoulCurrentWeekStartDate());
  },
  async getWeek(_token, campusId, weekStartDate) {
    return getOrCreate(campusId, weekStartDate);
  },
  async putMaterial(_token, campusId, weekStartDate, materialType, mediaAssetId) {
    const current = getOrCreate(campusId, weekStartDate);
    const next = applyWeeklyMaterialUpsert(current, {
      byteSize: materialType === 'SHEPHERD_GUIDE' ? 812_032 : 524_288,
      fileName: materialType === 'SHEPHERD_GUIDE' ? '이번 주 목자지침.pdf' : '이번 주 나눔지.pdf',
      materialType,
      mediaAssetId,
      sha256: (materialType === 'SHEPHERD_GUIDE' ? 'a' : 'b').repeat(64),
      updatedAt: new Date().toISOString(),
      uploadedByName: '관리자',
    });
    weeks.set(getWeeklyMaterialCacheKey(campusId, weekStartDate), next);
    return clone(next);
  },
  async deleteMaterial(_token, campusId, weekStartDate, materialType) {
    const next = applyWeeklyMaterialDelete(getOrCreate(campusId, weekStartDate), materialType);
    weeks.set(getWeeklyMaterialCacheKey(campusId, weekStartDate), next);
  },
};

export function createMockWeeklyMaterialCandidate(materialType: WeeklyMaterialType) {
  return {
    byteSize: 256 * 1024,
    contentType: 'application/pdf' as const,
    fileName: materialType === 'SHEPHERD_GUIDE' ? '선택한 목자지침.pdf' : '선택한 나눔지.pdf',
    sha256: (materialType === 'SHEPHERD_GUIDE' ? 'c' : 'd').repeat(64),
    uri: `file:///mock/${materialType}.pdf`,
  };
}

function getOrCreate(campusId: number, weekStartDate: string) {
  const key = getWeeklyMaterialCacheKey(campusId, weekStartDate);
  const existing = weeks.get(key);
  if (existing) return clone(existing);
  const currentWeek = getSeoulCurrentWeekStartDate();
  const created: WeeklyMaterialWeek = {
    campusId,
    materials: weekStartDate === currentWeek ? [{
      byteSize: 812_032,
      fileName: '이번 주 목자지침.pdf',
      materialType: 'SHEPHERD_GUIDE',
      mediaAssetId: 90_001,
      sha256: 'a'.repeat(64),
      updatedAt: new Date().toISOString(),
      uploadedByName: '관리자',
    }] : [],
    weekStartDate,
  };
  weeks.set(key, created);
  return clone(created);
}

function clone(value: WeeklyMaterialWeek): WeeklyMaterialWeek {
  return {...value, materials: value.materials.map((material) => ({...material}))};
}
