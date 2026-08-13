import {FaithLogApiError} from '../api/apiError';
import type {ShepherdAttendanceApi} from './shepherdAttendanceApi';
import type {AttendanceSaveRequest, ShepherdAttendanceReport, ShepherdGroup} from './shepherdAttendanceTypes';

let nextGroupId = 30;
let nextReportId = 100;
const groupsByCampus = new Map<number, ShepherdGroup[]>();

function groups(campusId: number) {
  let value = groupsByCampus.get(campusId);
  if (!value) {
    value = [
      {groupId: 10, groupName: '사랑목장', assignees: [{userId: 1, name: '김목자'}], report: null},
      {groupId: 11, groupName: '소망목장', assignees: [{userId: 1, name: '김목자'}, {userId: 2, name: '이목자'}], report: report(8, 5, 2, 'SUBMITTED', 1)},
    ];
    groupsByCampus.set(campusId, value);
  }
  return value;
}

function report(small: number, holy: number, other: number, status: 'DRAFT' | 'SUBMITTED', version: number): ShepherdAttendanceReport {
  return {reportId: nextReportId++, smallGroupMeetingCount: small, holyWaveCount: holy, otherWorshipCount: other, note: null, status, version, lastModifiedAt: new Date().toISOString(), lastModifiedByName: '김목자'};
}

function nextSunday() {
  const seoul = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = seoul.getUTCDay();
  seoul.setUTCDate(seoul.getUTCDate() + ((7 - day) % 7));
  return seoul.toISOString().slice(0, 10);
}

function save(campusId: number, groupId: number, body: AttendanceSaveRequest) {
  const group = groups(campusId).find((item) => item.groupId === groupId);
  if (!group) throw new FaithLogApiError({kind: 'error', status: 404, code: 'SHEPHERD_GROUP_NOT_FOUND', message: '목장을 찾을 수 없습니다.'});
  const currentVersion = group.report?.version ?? 0;
  if (body.version !== currentVersion) throw new FaithLogApiError({kind: 'conflict', status: 409, code: 'SHEPHERD_ATTENDANCE_STALE_VERSION', message: '다른 사용자가 먼저 수정했습니다.'});
  group.report = {...report(body.smallGroupMeetingCount, body.holyWaveCount, body.otherWorshipCount, body.status, currentVersion + 1), note: body.note};
  return group.report;
}

export const shepherdAttendanceMockApi: ShepherdAttendanceApi = {
  async getHome(_token, campusId) {
    const current = groups(campusId);
    return {visible: true, serviceDate: nextSunday(), assignedGroupCount: current.length, submittedGroupCount: current.filter((item) => item.report?.status === 'SUBMITTED').length, groups: structuredClone(current)};
  },
  async saveMyReport(_token, campusId, groupId, _serviceDate, body) { return structuredClone(save(campusId, groupId, body)); },
  async createGroup(_token, campusId, body) {
    const name = body.name.trim();
    if (groups(campusId).some((item) => item.groupName.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new FaithLogApiError({kind: 'conflict', status: 409, code: 'SHEPHERD_GROUP_NAME_DUPLICATE', message: '이미 사용 중인 목장 이름입니다.'});
    const item = {groupId: nextGroupId++, groupName: name, assignees: (body.assigneeUserIds ?? [1]).map((userId) => ({userId, name: `담당자 ${userId}`})), report: null};
    groups(campusId).push(item); return structuredClone(item);
  },
  async getAdminPage(_token, campusId, serviceDate, page = 0, size = 50) {
    const all = groups(campusId);
    const content = all.slice(page * size, page * size + size);
    return {serviceDate, content: structuredClone(content), totals: {
      smallGroupMeetingCount: all.reduce((sum, item) => sum + (item.report?.smallGroupMeetingCount ?? 0), 0),
      holyWaveCount: all.reduce((sum, item) => sum + (item.report?.holyWaveCount ?? 0), 0),
      otherWorshipCount: all.reduce((sum, item) => sum + (item.report?.otherWorshipCount ?? 0), 0),
    }, page, size, totalElements: all.length, totalPages: all.length === 0 ? 0 : Math.ceil(all.length / size)};
  },
  async saveAdminReport(_token, campusId, groupId, _serviceDate, body) { return structuredClone(save(campusId, groupId, body)); },
  async updateAssignees(_token, campusId, groupId, assigneeUserIds) {
    const group = groups(campusId).find((item) => item.groupId === groupId);
    if (!group) throw new Error('NOT_FOUND');
    group.assignees = assigneeUserIds.map((userId) => ({userId, name: `담당자 ${userId}`})); return structuredClone(group);
  },
};
