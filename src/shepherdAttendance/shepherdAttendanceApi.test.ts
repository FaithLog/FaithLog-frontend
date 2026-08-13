import {describe, expect, it, vi} from 'vitest';
vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  toPositiveIntegerPathSegment: (value: number) => {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('INVALID');
    return String(value);
  },
}));
import {createShepherdAttendanceApi} from './shepherdAttendanceApi';

describe('shepherd attendance API boundary', () => {
  it('fails closed without dispatching while REST Docs are pending', async () => {
    const request = vi.fn();
    const api = createShepherdAttendanceApi({contractStatus: 'pending', request});
    await expect(api.getHome('token', 1)).rejects.toMatchObject({detail: {code: 'API_CONTRACT_PENDING'}});
    expect(request).not.toHaveBeenCalled();
  });

  it('uses the exact provisional home and save paths in confirmed tests', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({visible: false, serviceDate: '2026-08-16', assignedGroupCount: 0, submittedGroupCount: 0, groups: []})
      .mockResolvedValueOnce({
        reportId: 1, smallGroupMeetingCount: 0, holyWaveCount: 1, otherWorshipCount: 2,
        note: null, status: 'SUBMITTED', version: 1, lastModifiedAt: '2026-08-16T00:00:00Z',
      });
    const api = createShepherdAttendanceApi({contractStatus: 'confirmed-test', request});
    await api.getHome('token', 7);
    await api.saveMyReport('token', 7, 9, '2026-08-16', {
      smallGroupMeetingCount: 0, holyWaveCount: 1, otherWorshipCount: 2,
      note: null, status: 'SUBMITTED', version: 0,
    });
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/campuses/7/shepherd-attendance/me/home');
    expect(request.mock.calls[1]?.[0]).toBe('/api/v1/campuses/7/shepherd-groups/9/attendance/2026-08-16');
    expect(request.mock.calls[1]?.[1]).toMatchObject({method: 'PUT', body: {
      smallGroupMeetingCount: 0, holyWaveCount: 1, otherWorshipCount: 2,
      note: null, status: 'SUBMITTED', version: 0,
    }});
  });

  it('uses server-paged admin paths and keeps assignee ids exact', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({serviceDate: '2026-08-16', content: [], totals: {smallGroupMeetingCount: 80, holyWaveCount: 50, otherWorshipCount: 20}, page: 1, size: 50, totalElements: 75, totalPages: 2})
      .mockResolvedValueOnce({groupId: 9});
    const api = createShepherdAttendanceApi({contractStatus: 'confirmed-test', request});
    const page = await api.getAdminPage('token', 7, '2026-08-16', 1, 50);
    await api.updateAssignees('token', 7, 9, [10, 11]);
    expect(page.totals).toEqual({smallGroupMeetingCount: 80, holyWaveCount: 50, otherWorshipCount: 20});
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/admin/campuses/7/shepherd-attendance?serviceDate=2026-08-16&page=1&size=50');
    expect(request.mock.calls[1]).toEqual(['/api/v1/admin/campuses/7/shepherd-groups/9/assignees', {accessToken: 'token', body: {assigneeUserIds: [10, 11]}, method: 'PUT'}]);
  });

  it('rejects removing the last assignee before dispatch', async () => {
    const request = vi.fn();
    const api = createShepherdAttendanceApi({contractStatus: 'confirmed-test', request});
    await expect(api.updateAssignees('token', 7, 9, [])).rejects.toMatchObject({detail: {code: 'INVALID_REQUEST'}});
    expect(request).not.toHaveBeenCalled();
  });
});
