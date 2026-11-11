import {apiRequest} from '../api/client';

import {DAILY_MISSION_SERVER_IDS, parseDailyMissionSnapshot, type DailyMissionApi, type DailyMissionId, type DailyMissionSnapshot} from './dailyMissionContract';
export function createDailyMissionApi(campusId: number, getToken: () => Promise<string | null>): DailyMissionApi {
  const path = `/api/v1/campuses/${encodeURIComponent(campusId)}/devotions/me/daily-missions`;
  const request = async (id?: DailyMissionId) => {
    const accessToken = await getToken();
    if (!accessToken) throw new Error('인증이 필요해요.');
    return apiRequest<DailyMissionSnapshot>(id ? `${path}/${DAILY_MISSION_SERVER_IDS[id]}/claims` : path, {accessToken, method: id ? 'POST' : 'GET', responseParser: parseDailyMissionSnapshot});
  };
  return {load: () => request(), claim: id => request(id)};
}
