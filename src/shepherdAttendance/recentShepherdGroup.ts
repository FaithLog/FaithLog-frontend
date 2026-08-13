const recentByCampus = new Map<number, number>();
export function getRecentShepherdGroup(campusId: number) { return recentByCampus.get(campusId) ?? null; }
export function setRecentShepherdGroup(campusId: number, groupId: number) { recentByCampus.set(campusId, groupId); }
export function clearRecentShepherdGroups() { recentByCampus.clear(); }
