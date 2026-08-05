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
  async listYear(_token, campusId, year, page = 0, size = 20) {
    const content = Array.from(weeks.values())
      .filter((week) => week.campusId === campusId && week.weekStartDate.startsWith(`${year}-`))
      .sort((left, right) => right.weekStartDate.localeCompare(left.weekStartDate));
    return {
      content: content.slice(page * size, (page + 1) * size).map(clone),
      page,
      size,
      totalElements: content.length,
      totalPages: content.length === 0 ? 0 : Math.ceil(content.length / size),
    };
  },
  async putMaterial(_token, campusId, weekStartDate, materialType, mediaAssetId) {
    const current = getOrCreate(campusId, weekStartDate);
    const next = applyWeeklyMaterialUpsert(current, {
      byteSize: materialType === 'SHEPHERD_GUIDE' ? 812_032 : 524_288,
      fileName: mockFileName(materialType, '이번 주'),
      materialType,
      mediaAssetId,
      sha256: mockHashCharacter(materialType).repeat(64),
      updatedAt: new Date().toISOString(),
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
    fileName: mockFileName(materialType, '선택한'),
    sha256: mockHashCharacter(materialType).repeat(64),
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
    }] : [],
    weekStartDate,
  };
  weeks.set(key, created);
  return clone(created);
}

function clone(value: WeeklyMaterialWeek): WeeklyMaterialWeek {
  return {...value, materials: value.materials.map((material) => ({...material}))};
}

function mockFileName(materialType: WeeklyMaterialType, prefix: string) {
  if (materialType === 'SHEPHERD_GUIDE') return `${prefix} 목자지침.pdf`;
  if (materialType === 'SUNDAY_SHARING_SHEET') return `${prefix} 주일 나눔지.pdf`;
  return `${prefix} 토목모 나눔지.pdf`;
}

function mockHashCharacter(materialType: WeeklyMaterialType) {
  if (materialType === 'SHEPHERD_GUIDE') return 'a';
  if (materialType === 'SUNDAY_SHARING_SHEET') return 'b';
  return 'c';
}
