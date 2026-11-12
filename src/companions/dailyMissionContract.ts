export const DAILY_MISSION_IDS = ['quiet-time', 'prayer', 'bible'] as const;
export type DailyMissionId = typeof DAILY_MISSION_IDS[number];
export type DailyMissionSnapshot = {
  recordDate: string; serverNow: string; totalAwardedPoints: number;
  missions: Array<{mission: 'QUIET_TIME' | 'PRAYER' | 'BIBLE'; status: 'INCOMPLETE' | 'READY' | 'CLAIMED'; points: number}>;
};
export type DailyMissionApi = {load: () => Promise<DailyMissionSnapshot>; claim: (id: DailyMissionId) => Promise<DailyMissionSnapshot>};
export const DAILY_MISSION_SERVER_IDS = {'quiet-time':'QUIET_TIME',prayer:'PRAYER',bible:'BIBLE'} as const;
export function isDailyMission(id: string): id is DailyMissionId {return DAILY_MISSION_IDS.some(value => value === id);}
export function parseDailyMissionSnapshot(value: unknown): DailyMissionSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Invalid daily missions');
  const result = value as DailyMissionSnapshot;
  if (typeof result.recordDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(result.recordDate) || !Number.isFinite(Date.parse(result.recordDate)) || typeof result.serverNow !== 'string' || !Number.isFinite(Date.parse(result.serverNow)) || !Number.isSafeInteger(result.totalAwardedPoints) || result.totalAwardedPoints < 0 || !Array.isArray(result.missions) || result.missions.length !== 3) throw new Error('Invalid daily missions');
  const seen = new Set<string>();
  for (const item of result.missions) {
    if (!item || !Object.values(DAILY_MISSION_SERVER_IDS).includes(item.mission) || seen.has(item.mission) || !['INCOMPLETE','READY','CLAIMED'].includes(item.status) || item.points !== 30) throw new Error('Invalid daily mission item');
    seen.add(item.mission);
  }
  return result;
}
