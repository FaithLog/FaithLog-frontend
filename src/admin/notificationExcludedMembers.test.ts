import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fetchAdminNotificationLogs} from '../api/client';
import {fetchNotificationExcludedMembers} from './notificationExcludedMembers';

vi.mock('../api/client', () => ({fetchAdminNotificationLogs: vi.fn()}));
const fetchLogs = vi.mocked(fetchAdminNotificationLogs);
const log = (userId: number, requestId = 'request', sendStatus = 'SKIPPED') => ({
  userId, requestId, sendStatus, name: `멤버 ${userId}`, email: `${userId}@example.com`, failureReason: null,
});
beforeEach(() => vi.resetAllMocks());
describe('notification excluded members', () => {
  it('loads every page and only includes unique skipped members from this request', async () => {
    fetchLogs.mockResolvedValueOnce({items: [log(1), log(2, 'other'), log(3, 'request', 'SENT')], totalPages: 2} as never);
    fetchLogs.mockResolvedValueOnce({items: [log(1), {...log(4), failureReason: 'NO_ACTIVE_FCM_TOKEN'}], totalPages: 2} as never);
    await expect(fetchNotificationExcludedMembers('token', 1, 'request')).resolves.toEqual([
      {userId: 1, name: '멤버 1', email: '1@example.com', reason: '제외 사유가 기록되지 않았습니다.'},
      {userId: 4, name: '멤버 4', email: '4@example.com', reason: '알림을 받을 수 있는 기기가 등록되어 있지 않습니다. 해당 멤버가 앱에 로그인한 뒤 알림 설정에서 권한과 연결 상태를 확인해야 합니다.'},
    ]);
    expect(fetchLogs).toHaveBeenLastCalledWith('token', 1, {requestId: 'request', sendStatus: 'SKIPPED', page: 1, size: 100});
  });
  it('propagates a failed lookup so the modal can offer retry', async () => {
    fetchLogs.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchNotificationExcludedMembers('token', 1, 'request')).rejects.toThrow('offline');
  });
});
