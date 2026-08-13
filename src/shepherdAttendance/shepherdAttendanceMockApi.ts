import {FaithLogApiError} from '../api/apiError';
import type {ShepherdAttendanceApi} from './shepherdAttendanceApi';
import type {AttendanceSaveRequest, ShepherdAttendanceReport, ShepherdBoardGroup, ShepherdGroupResource} from './shepherdAttendanceTypes';

let nextGroupId = 30;
let nextReportId = 100;
const groupsByCampus = new Map<number, ShepherdBoardGroup[]>();

function assignee(userId: number) { return {userId, name: `담당자 ${userId}`, email: `assignee-${userId}@example.test`}; }
function nextSunday() { const seoul = new Date(Date.now() + 9 * 60 * 60 * 1000); seoul.setUTCDate(seoul.getUTCDate() + ((7 - seoul.getUTCDay()) % 7)); return seoul.toISOString().slice(0, 10); }
function report(campusId: number, groupId: number, serviceDate: string, small: number, holy: number, other: number, status: 'DRAFT' | 'SUBMITTED', version: number): ShepherdAttendanceReport { return {reportId: nextReportId++, campusId, groupId, serviceDate, smallGroupMeetingCount: small, holyWaveCount: holy, otherWorshipCount: other, note: null, status, version, lastModifiedByUserId: 1, lastModifiedAt: new Date().toISOString(), lastModifiedByName: '김목자'}; }
function resource(campusId: number, group: ShepherdBoardGroup): ShepherdGroupResource { return {groupId: group.groupId, campusId, name: group.groupName, status: 'ACTIVE', version: group.groupVersion, assignees: structuredClone(group.assignees)}; }
function groups(campusId: number) {
  let value = groupsByCampus.get(campusId);
  if (!value) {
    const serviceDate = nextSunday();
    value = [
      {groupId: 10, groupName: '사랑목장', groupVersion: 1, assignees: [assignee(1)], report: null},
      {groupId: 11, groupName: '소망목장', groupVersion: 1, assignees: [assignee(1), assignee(2)], report: report(campusId, 11, serviceDate, 8, 5, 2, 'SUBMITTED', 1)},
    ];
    groupsByCampus.set(campusId, value);
  }
  return value;
}
function save(campusId: number, groupId: number, serviceDate: string, body: AttendanceSaveRequest) {
  const group = groups(campusId).find((item) => item.groupId === groupId);
  if (!group) throw new FaithLogApiError({kind: 'error', status: 404, code: 'SHEPHERD_GROUP_NOT_FOUND', message: '목장을 찾을 수 없습니다.'});
  const currentVersion = group.report?.version ?? 0;
  if (body.version !== currentVersion) throw new FaithLogApiError({kind: 'conflict', status: 409, code: 'SHEPHERD_ATTENDANCE_CONFLICT', message: '다른 사용자가 먼저 수정했습니다.'});
  group.report = {...report(campusId, groupId, serviceDate, body.smallGroupMeetingCount, body.holyWaveCount, body.otherWorshipCount, body.status, currentVersion + 1), note: body.note};
  return group.report;
}

export const shepherdAttendanceMockApi: ShepherdAttendanceApi = {
  async getHome(_token, campusId) { const current = groups(campusId); return {visible: true, title: '이번 주 목홀타를 입력해 주세요', serviceDate: nextSunday(), assignedGroupCount: current.length, submittedGroupCount: current.filter((item) => item.report?.status === 'SUBMITTED').length, groups: current.map((group) => ({groupId: group.groupId, groupName: group.groupName, report: group.report ? {reportId: group.report.reportId, smallGroupMeetingCount: group.report.smallGroupMeetingCount, holyWaveCount: group.report.holyWaveCount, otherWorshipCount: group.report.otherWorshipCount, note: group.report.note, status: group.report.status, version: group.report.version, lastModifiedAt: group.report.lastModifiedAt} : null}))}; },
  async getMyGroups(_token, campusId) { return structuredClone(groups(campusId).map((group) => resource(campusId, group))); },
  async getMyReport(_token, campusId, groupId, serviceDate) { const found = groups(campusId).find((group) => group.groupId === groupId)?.report; if (!found || found.serviceDate !== serviceDate) throw new FaithLogApiError({kind: 'error', status: 404, code: 'SHEPHERD_ATTENDANCE_NOT_FOUND', message: '보고서를 찾을 수 없습니다.'}); return structuredClone(found); },
  async saveMyReport(_token, campusId, groupId, serviceDate, body) { return structuredClone(save(campusId, groupId, serviceDate, body)); },
  async createGroup(_token, campusId, body) { const name = body.name.trim(); if (groups(campusId).some((item) => item.groupName.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new FaithLogApiError({kind: 'conflict', status: 409, code: 'SHEPHERD_GROUP_NAME_DUPLICATE', message: '이미 사용 중인 목장 이름입니다.'}); const item: ShepherdBoardGroup = {groupId: nextGroupId++, groupName: name, groupVersion: 1, assignees: (body.assigneeUserIds ?? [1]).map(assignee), report: null}; groups(campusId).push(item); return structuredClone(resource(campusId, item)); },
  async getAdminGroups(_token, campusId) { return structuredClone(groups(campusId).map((group) => resource(campusId, group))); },
  async updateGroup(_token, campusId, groupId, body) { const group = groups(campusId).find((item) => item.groupId === groupId); if (!group) throw new Error('NOT_FOUND'); group.groupName = body.name; group.groupVersion += 1; return structuredClone(resource(campusId, group)); },
  async getAdminPage(_token, campusId, serviceDate, page = 0, size = 50) { const all = groups(campusId); const content = all.slice(page * size, page * size + size); return {campusId, serviceDate, content: structuredClone(content), totals: {smallGroupMeetingCount: all.reduce((sum, item) => sum + (item.report?.smallGroupMeetingCount ?? 0), 0), holyWaveCount: all.reduce((sum, item) => sum + (item.report?.holyWaveCount ?? 0), 0), otherWorshipCount: all.reduce((sum, item) => sum + (item.report?.otherWorshipCount ?? 0), 0)}, totalSubmittedCount: all.filter((item) => item.report?.status === 'SUBMITTED').length, totalMissingCount: all.filter((item) => item.report?.status !== 'SUBMITTED').length, page, size, totalElements: all.length, totalPages: all.length === 0 ? 0 : Math.ceil(all.length / size)}; },
  async saveAdminReport(_token, campusId, groupId, serviceDate, body) { return structuredClone(save(campusId, groupId, serviceDate, body)); },
  async updateAssignees(_token, campusId, groupId, assigneeUserIds) { const group = groups(campusId).find((item) => item.groupId === groupId); if (!group) throw new Error('NOT_FOUND'); group.assignees = assigneeUserIds.map(assignee); return structuredClone(resource(campusId, group)); },
};
