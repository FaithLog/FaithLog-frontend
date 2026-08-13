export function isCampusRequestReady(campusId: unknown): campusId is number {
  return Number.isSafeInteger(campusId) && Number(campusId) > 0;
}
