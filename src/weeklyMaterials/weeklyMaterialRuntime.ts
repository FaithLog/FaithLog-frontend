import type {WeeklyMaterialApi} from './weeklyMaterialApi';
import {weeklyMaterialApi} from './weeklyMaterialApi';
import {shouldUseWeeklyMaterialMockApi} from './weeklyMaterialEnvironment';
import {weeklyMaterialMockApi} from './weeklyMaterialMockApi';

export function getWeeklyMaterialRuntimeApi(): WeeklyMaterialApi {
  return shouldUseWeeklyMaterialMockApi() ? weeklyMaterialMockApi : weeklyMaterialApi;
}
