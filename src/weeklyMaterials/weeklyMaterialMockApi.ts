import type {WeeklyMaterialApi} from './weeklyMaterialApi';
import {getSeoulCurrentWeekStartDate} from './weeklyMaterialDate';
import {applyWeeklyMaterialUpsert, getWeeklyMaterialCacheKey} from './weeklyMaterialState';
import type {
  WeeklyMaterial,
  WeeklyMaterialType,
  WeeklyMaterialWeek,
} from './weeklyMaterialTypes';

export function createWeeklyMaterialMockApi(): WeeklyMaterialApi {
  const campusGuides = new Map<string, WeeklyMaterial>();
  const globalMaterials = new Map<string, WeeklyMaterial[]>();
  const initializedCampusWeeks = new Set<string>();
  const knownWeeksByCampus = new Map<number, Set<string>>();
  let nextSeedAssetId = 90_000;

  const rememberWeek = (campusId: number, weekStartDate: string) => {
    const known = knownWeeksByCampus.get(campusId) ?? new Set<string>();
    known.add(weekStartDate);
    knownWeeksByCampus.set(campusId, known);
  };

  const getOrCreate = (campusId: number, weekStartDate: string) => {
    const campusWeekKey = getWeeklyMaterialCacheKey(campusId, weekStartDate);
    rememberWeek(campusId, weekStartDate);
    if (!initializedCampusWeeks.has(campusWeekKey)) {
      initializedCampusWeeks.add(campusWeekKey);
      if (weekStartDate === getSeoulCurrentWeekStartDate()) {
        campusGuides.set(campusWeekKey, {
          byteSize: 812_032,
          fileName: '이번 주 목자지침.pdf',
          materialType: 'SHEPHERD_GUIDE',
          mediaAssetId: ++nextSeedAssetId,
          sha256: 'a'.repeat(64),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    const guide = campusGuides.get(campusWeekKey);
    const materials = [
      ...(guide ? [guide] : []),
      ...(globalMaterials.get(weekStartDate) ?? []),
    ];
    return clone({campusId, materials, weekStartDate});
  };

  return {
    async getCurrentWeek(_token, campusId) {
      return getOrCreate(campusId, getSeoulCurrentWeekStartDate());
    },
    async getWeek(_token, campusId, weekStartDate) {
      return getOrCreate(campusId, weekStartDate);
    },
    async listYear(_token, campusId, year, page = 0, size = 20) {
      const weekStartDates = new Set([
        ...(knownWeeksByCampus.get(campusId) ?? []),
        ...globalMaterials.keys(),
      ]);
      const matchingWeeks = Array.from(weekStartDates)
        .filter((weekStartDate) => weekStartDate.startsWith(`${year}-`))
        .sort((left, right) => right.localeCompare(left));
      return {
        content: matchingWeeks
          .slice(page * size, (page + 1) * size)
          .map((weekStartDate) => getOrCreate(campusId, weekStartDate)),
        page,
        size,
        totalElements: matchingWeeks.length,
        totalPages: matchingWeeks.length === 0 ? 0 : Math.ceil(matchingWeeks.length / size),
      };
    },
    async putMaterial(_token, campusId, weekStartDate, materialType, mediaAssetId) {
      const material: WeeklyMaterial = {
        byteSize: materialType === 'SHEPHERD_GUIDE' ? 812_032 : 524_288,
        fileName: mockFileName(materialType, '이번 주'),
        materialType,
        mediaAssetId,
        sha256: mockHashCharacter(materialType).repeat(64),
        updatedAt: new Date().toISOString(),
      };
      rememberWeek(campusId, weekStartDate);
      if (materialType === 'SHEPHERD_GUIDE') {
        const key = getWeeklyMaterialCacheKey(campusId, weekStartDate);
        initializedCampusWeeks.add(key);
        campusGuides.set(key, material);
      } else {
        const current = globalMaterials.get(weekStartDate) ?? [];
        globalMaterials.set(
          weekStartDate,
          applyWeeklyMaterialUpsert(
            {campusId, materials: current, weekStartDate},
            material,
          ).materials,
        );
      }
      return getOrCreate(campusId, weekStartDate);
    },
    async deleteMaterial(_token, campusId, weekStartDate, materialType) {
      if (materialType === 'SHEPHERD_GUIDE') {
        const key = getWeeklyMaterialCacheKey(campusId, weekStartDate);
        initializedCampusWeeks.add(key);
        campusGuides.delete(key);
      } else {
        globalMaterials.set(
          weekStartDate,
          (globalMaterials.get(weekStartDate) ?? []).filter(
            (material) => material.materialType !== materialType,
          ),
        );
      }
      rememberWeek(campusId, weekStartDate);
    },
  };
}

export const weeklyMaterialMockApi = createWeeklyMaterialMockApi();

export function createMockWeeklyMaterialCandidate(materialType: WeeklyMaterialType) {
  return {
    byteSize: 256 * 1024,
    contentType: 'application/pdf' as const,
    fileName: mockFileName(materialType, '선택한'),
    sha256: mockHashCharacter(materialType).repeat(64),
    uri: `file:///mock/${materialType}.pdf`,
  };
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
