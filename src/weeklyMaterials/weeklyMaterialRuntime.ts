import type {WeeklyMaterialApi} from './weeklyMaterialApi';
import {weeklyMaterialApi} from './weeklyMaterialApi';
import {isWeeklyMaterialCapabilityEnabled} from './weeklyMaterialEnvironment';
import {weeklyMaterialMockApi} from './weeklyMaterialMockApi';

export function getWeeklyMaterialRuntimeApi(): WeeklyMaterialApi {
  return isWeeklyMaterialCapabilityEnabled() ? weeklyMaterialMockApi : weeklyMaterialApi;
}
