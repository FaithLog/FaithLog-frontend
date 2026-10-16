import {fetchAdminNotificationLogs} from '../api/client';
import type {MemberListEntry} from '../components/MemberListModalButton';

export async function fetchNotificationExcludedMembers(accessToken: string, campusId: number, requestId: string): Promise<MemberListEntry[]> {
  const members = new Map<number, MemberListEntry>();
  let page = 0;
  let totalPages = 1;
  do {
    const logs = await fetchAdminNotificationLogs(accessToken, campusId, {
      requestId, sendStatus: 'SKIPPED', page, size: 100,
    });
    for (const log of logs.items) {
      if (log.requestId === requestId && log.sendStatus === 'SKIPPED') {
        members.set(log.userId, {userId: log.userId, name: log.name, email: log.email,
          reason: log.failureReason ?? '제외 사유가 기록되지 않았습니다.'});
      }
    }
    totalPages = logs.totalPages;
    page += 1;
  } while (page < totalPages);
  return [...members.values()];
}
