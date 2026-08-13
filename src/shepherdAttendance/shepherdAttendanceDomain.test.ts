import {describe, expect, it} from 'vitest';
import {
  parseAdminAttendancePage,
  parseShepherdHome,
  validateAttendanceInput,
} from './shepherdAttendanceDomain';

describe('shepherd attendance domain', () => {
  it('accepts a visible home payload and keeps independent zero counts', () => {
    const value = parseShepherdHome({
      visible: true,
      serviceDate: '2026-08-16',
      assignedGroupCount: 1,
      submittedGroupCount: 0,
      groups: [{
        groupId: 10,
        groupName: '사랑목장',
        report: {
          reportId: 31,
          smallGroupMeetingCount: 0,
          holyWaveCount: 0,
          otherWorshipCount: 0,
          note: null,
          status: 'DRAFT',
          version: 1,
          lastModifiedAt: '2026-08-16T03:20:00Z',
        },
      }],
    });
    expect(value.groups[0]?.report?.holyWaveCount).toBe(0);
  });

  it('requires hidden home payloads to have no assigned groups', () => {
    expect(() => parseShepherdHome({
      visible: false,
      serviceDate: '2026-08-16',
      assignedGroupCount: 1,
      submittedGroupCount: 0,
      groups: [],
    })).toThrowError(/INVALID_SERVER_RESPONSE/);
  });

  it('validates integer inputs and allows exactly zero', () => {
    expect(validateAttendanceInput({smallGroupMeetingCount: '0', holyWaveCount: '0', otherWorshipCount: '0', note: ''})).toEqual({
      ok: true,
      value: {smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0, note: null},
    });
    for (const invalid of ['', '-1', '1.5']) {
      expect(validateAttendanceInput({smallGroupMeetingCount: invalid, holyWaveCount: '0', otherWorshipCount: '0', note: ''}).ok).toBe(false);
    }
  });

  it('uses server totals instead of summing the current page', () => {
    const page = parseAdminAttendancePage({
      serviceDate: '2026-08-16',
      content: [{
        groupId: 1,
        groupName: '사랑목장',
        assignees: [{userId: 2, name: '홍길동'}],
        report: null,
      }],
      totals: {smallGroupMeetingCount: 80, holyWaveCount: 50, otherWorshipCount: 20},
      page: 0,
      size: 50,
      totalElements: 75,
      totalPages: 2,
    }, {page: 0, size: 50, serviceDate: '2026-08-16'});
    expect(page.totals.smallGroupMeetingCount).toBe(80);
    expect(page.totalElements).toBe(75);
  });
});
