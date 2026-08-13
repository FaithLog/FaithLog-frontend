import type {
  AdminAttendancePage,
  AttendanceInput,
  AttendanceSaveRequest,
  ShepherdAttendanceHome,
  ShepherdAttendanceReport,
  ShepherdAttendanceStatus,
  ShepherdAssignee,
  ShepherdBoardGroup,
  ShepherdGroupResource,
  ShepherdHomeReport,
} from './shepherdAttendanceTypes';

const SUNDAY = 0;
const HOME_TITLE = '이번 주 목홀타를 입력해 주세요';

export function parseShepherdHome(value: unknown): ShepherdAttendanceHome {
  const record = requireRecord(value);
  const visible = requireBoolean(record.visible);
  const title = requireNonBlankString(record.title, 100);
  if (title !== HOME_TITLE) invalidResponse();
  const serviceDate = record.serviceDate === null ? null : requireSunday(record.serviceDate);
  const assignedGroupCount = requireNonNegativeInteger(record.assignedGroupCount);
  const submittedGroupCount = requireNonNegativeInteger(record.submittedGroupCount);
  if (!Array.isArray(record.groups)) invalidResponse();
  const groups = record.groups.map(parseHomeGroup);
  if (submittedGroupCount > assignedGroupCount || groups.length !== assignedGroupCount) invalidResponse();
  if (!visible && (serviceDate !== null || assignedGroupCount !== 0 || submittedGroupCount !== 0 || groups.length !== 0)) invalidResponse();
  if (visible && serviceDate === null) invalidResponse();
  if (groups.filter((group) => group.report?.status === 'SUBMITTED').length !== submittedGroupCount) invalidResponse();
  return {visible, title, serviceDate, assignedGroupCount, submittedGroupCount, groups};
}

export function parseAdminAttendancePage(
  value: unknown,
  expected: {campusId: number; page: number; size: number; serviceDate: string},
): AdminAttendancePage {
  const record = requireRecord(value);
  if (!Array.isArray(record.groups)) invalidResponse();
  const campusId = requirePositiveInteger(record.campusId);
  const page = requireNonNegativeInteger(record.page);
  const size = requirePositiveInteger(record.size);
  const totalElements = requireNonNegativeInteger(record.totalElements);
  const totalPages = requireNonNegativeInteger(record.totalPages);
  const totalSubmittedCount = requireNonNegativeInteger(record.totalSubmittedCount);
  const totalMissingCount = requireNonNegativeInteger(record.totalMissingCount);
  const serviceDate = requireSunday(record.serviceDate);
  if (campusId !== expected.campusId || page !== expected.page || size !== expected.size || serviceDate !== expected.serviceDate) invalidResponse();
  if (totalPages !== (totalElements === 0 ? 0 : Math.ceil(totalElements / size))) invalidResponse();
  if (totalSubmittedCount + totalMissingCount !== totalElements) invalidResponse();
  const content = record.groups.map((group) => parseBoardGroup(group, {campusId, serviceDate}));
  if (content.length > size || (totalElements === 0 && content.length !== 0)) invalidResponse();
  return {
    campusId,
    serviceDate,
    content,
    totals: {
      smallGroupMeetingCount: requireNonNegativeInteger(record.totalSmallGroupMeetingCount),
      holyWaveCount: requireNonNegativeInteger(record.totalHolyWaveCount),
      otherWorshipCount: requireNonNegativeInteger(record.totalOtherWorshipCount),
    },
    totalSubmittedCount,
    totalMissingCount,
    page,
    size,
    totalElements,
    totalPages,
  };
}

export function parseReport(
  value: unknown,
  expected?: {campusId: number; groupId: number; serviceDate: string},
): ShepherdAttendanceReport {
  const record = requireRecord(value);
  const report = {
    reportId: requirePositiveInteger(record.reportId),
    campusId: requirePositiveInteger(record.campusId),
    groupId: requirePositiveInteger(record.groupId),
    serviceDate: requireSunday(record.serviceDate),
    smallGroupMeetingCount: requireNonNegativeInteger(record.smallGroupMeetingCount),
    holyWaveCount: requireNonNegativeInteger(record.holyWaveCount),
    otherWorshipCount: requireNonNegativeInteger(record.otherWorshipCount),
    note: requireNullableString(record.note, 1000),
    status: requireStatus(record.status),
    lastModifiedByUserId: requirePositiveInteger(record.lastModifiedByUserId),
    lastModifiedByName: requireNonBlankString(record.lastModifiedByName, 100),
    lastModifiedAt: requireIsoDateTime(record.lastModifiedAt),
    version: requireNonNegativeInteger(record.version),
  };
  if (expected && (report.campusId !== expected.campusId || report.groupId !== expected.groupId || report.serviceDate !== expected.serviceDate)) invalidResponse();
  return report;
}

export function parseGroupResource(value: unknown, expectedCampusId?: number): ShepherdGroupResource {
  const record = requireRecord(value);
  if (!Array.isArray(record.assignees) || record.assignees.length === 0) invalidResponse();
  const campusId = requirePositiveInteger(record.campusId);
  if (expectedCampusId !== undefined && campusId !== expectedCampusId) invalidResponse();
  if (record.status !== 'ACTIVE') invalidResponse();
  return {
    groupId: requirePositiveInteger(record.groupId),
    campusId,
    name: requireNonBlankString(record.name, 100),
    status: 'ACTIVE',
    version: requirePositiveInteger(record.version),
    assignees: record.assignees.map(parseAssignee),
  };
}

export function parseGroupResources(value: unknown, expectedCampusId: number): ShepherdGroupResource[] {
  if (!Array.isArray(value)) invalidResponse();
  return value.map((group) => parseGroupResource(group, expectedCampusId));
}

export function validateAttendanceInput(input: AttendanceInput):
  | {ok: true; value: Omit<AttendanceSaveRequest, 'status' | 'version'>}
  | {ok: false; message: string} {
  const fields = [
    ['목장모임', input.smallGroupMeetingCount],
    ['홀리웨이브', input.holyWaveCount],
    ['타예배', input.otherWorshipCount],
  ] as const;
  const values: number[] = [];
  for (const [label, raw] of fields) {
    if (!/^(0|[1-9]\d*)$/.test(raw)) return {ok: false, message: `${label} 인원은 0 이상의 정수로 입력해 주세요.`};
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) return {ok: false, message: '인원 값이 너무 큽니다.'};
    values.push(value);
  }
  const note = input.note.trim();
  if (note.length > 1000) return {ok: false, message: '메모는 1,000자 이하로 입력해 주세요.'};
  return {ok: true, value: {smallGroupMeetingCount: values[0]!, holyWaveCount: values[1]!, otherWorshipCount: values[2]!, note: note || null}};
}

function parseHomeGroup(value: unknown) {
  const record = requireRecord(value);
  return {
    groupId: requirePositiveInteger(record.groupId),
    groupName: requireNonBlankString(record.groupName, 100),
    report: record.report === null ? null : parseHomeReport(record.report),
  };
}

function parseHomeReport(value: unknown): ShepherdHomeReport {
  const record = requireRecord(value);
  return {
    reportId: requirePositiveInteger(record.reportId),
    smallGroupMeetingCount: requireNonNegativeInteger(record.smallGroupMeetingCount),
    holyWaveCount: requireNonNegativeInteger(record.holyWaveCount),
    otherWorshipCount: requireNonNegativeInteger(record.otherWorshipCount),
    note: requireNullableString(record.note, 1000),
    status: requireStatus(record.status),
    version: requireNonNegativeInteger(record.version),
    lastModifiedAt: requireIsoDateTime(record.lastModifiedAt),
  };
}

function parseBoardGroup(value: unknown, expected: {campusId: number; serviceDate: string}): ShepherdBoardGroup {
  const record = requireRecord(value);
  if (!Array.isArray(record.assignees) || record.assignees.length === 0) invalidResponse();
  const groupId = requirePositiveInteger(record.groupId);
  return {
    groupId,
    groupName: requireNonBlankString(record.groupName, 100),
    groupVersion: requirePositiveInteger(record.groupVersion),
    assignees: record.assignees.map(parseAssignee),
    report: record.report === null ? null : parseReport(record.report, {...expected, groupId}),
  };
}

function parseAssignee(value: unknown): ShepherdAssignee {
  const record = requireRecord(value);
  return {
    userId: requirePositiveInteger(record.userId),
    name: requireNonBlankString(record.name, 100),
    email: requireNonBlankString(record.email, 320),
  };
}

function requireRecord(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse(); return value as Record<string, unknown>; }
function requireBoolean(value: unknown) { if (typeof value !== 'boolean') return invalidResponse(); return value; }
function requireNonNegativeInteger(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) return invalidResponse(); return value as number; }
function requirePositiveInteger(value: unknown) { const result = requireNonNegativeInteger(value); if (result === 0) return invalidResponse(); return result; }
function requireNonBlankString(value: unknown, max: number) { if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > max) return invalidResponse(); return value; }
function requireNullableString(value: unknown, max: number) { if (value === null) return null; if (typeof value !== 'string' || value.length > max) return invalidResponse(); return value; }
function requireStatus(value: unknown): ShepherdAttendanceStatus { if (value !== 'DRAFT' && value !== 'SUBMITTED') return invalidResponse(); return value; }
function requireIsoDateTime(value: unknown) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return invalidResponse(); return value; }
function requireSunday(value: unknown) { const result = requireNonBlankString(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T12:00:00+09:00`).getDay() !== SUNDAY) return invalidResponse(); return result; }
function invalidResponse(): never { throw new Error('INVALID_SERVER_RESPONSE'); }
