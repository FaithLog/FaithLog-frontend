import {moveWeekStartDate, normalizeWeekStartDate} from './weeklyMaterialDate';
import type {
  WeeklyMaterial,
  WeeklyMaterialType,
  WeeklyMaterialWeek,
} from './weeklyMaterialTypes';

export type WeeklyMaterialRequestIdentity = {
  cacheKey: string;
  sequence: number;
};

export type WeeklyMaterialRequestCoordinator = {
  latestByKey: Map<string, number>;
  sequence: number;
};

export function getWeeklyMaterialCacheKey(campusId: number, weekStartDate: string) {
  return `${campusId}:${normalizeWeekStartDate(weekStartDate)}`;
}

export function getAdjacentWeekStartDates(weekStartDate: string) {
  return [moveWeekStartDate(weekStartDate, -1), moveWeekStartDate(weekStartDate, 1)];
}

export function createWeeklyMaterialRequestCoordinator(): WeeklyMaterialRequestCoordinator {
  return {latestByKey: new Map(), sequence: 0};
}

export function beginWeeklyMaterialRequest(
  coordinator: WeeklyMaterialRequestCoordinator,
  campusId: number,
  weekStartDate: string,
): WeeklyMaterialRequestIdentity {
  const cacheKey = getWeeklyMaterialCacheKey(campusId, weekStartDate);
  const sequence = ++coordinator.sequence;
  coordinator.latestByKey.set(cacheKey, sequence);
  return {cacheKey, sequence};
}

export function isWeeklyMaterialRequestCurrent(
  coordinator: WeeklyMaterialRequestCoordinator,
  identity: WeeklyMaterialRequestIdentity,
) {
  return coordinator.latestByKey.get(identity.cacheKey) === identity.sequence;
}

export function applyWeeklyMaterialUpsert(
  week: WeeklyMaterialWeek,
  material: WeeklyMaterial,
): WeeklyMaterialWeek {
  const materials = week.materials.filter(
    (current) => current.materialType !== material.materialType,
  );
  return {...week, materials: [...materials, material].sort(compareMaterialType)};
}

export function applyWeeklyMaterialDelete(
  week: WeeklyMaterialWeek,
  materialType: WeeklyMaterialType,
): WeeklyMaterialWeek {
  return {
    ...week,
    materials: week.materials.filter((material) => material.materialType !== materialType),
  };
}

function compareMaterialType(left: WeeklyMaterial, right: WeeklyMaterial) {
  return order(left.materialType) - order(right.materialType);
}

function order(value: WeeklyMaterialType) {
  if (value === 'SHEPHERD_GUIDE') return 0;
  if (value === 'SUNDAY_SHARING_SHEET') return 1;
  return 2;
}
