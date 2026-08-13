import type {
  AdminAttendancePage,
  AttendanceInput,
  AttendanceSaveRequest,
  ShepherdAttendanceHome,
  ShepherdAttendanceReport,
  ShepherdAttendanceStatus,
  ShepherdAssignee,
  ShepherdGroup,
} from './shepherdAttendanceTypes';

const SUNDAY = 0;

export function parseShepherdHome(value: unknown): ShepherdAttendanceHome {
  const record = requireRecord(value);
  const visible = requireBoolean(record.visible);
  const serviceDate = requireSunday(record.serviceDate);
  const assignedGroupCount = requireNonNegativeInteger(record.assignedGroupCount);
  const submittedGroupCount = requireNonNegativeInteger(record.submittedGroupCount);
  if (!Array.isArray(record.groups)) invalidResponse();
  const groups = record.groups.map(parseGroup);
  if (submittedGroupCount > assignedGroupCount || groups.length !== assignedGroupCount) {
    invalidResponse();
  }
  if (!visible && (assignedGroupCount !== 0 || submittedGroupCount !== 0 || groups.length !== 0)) {
    invalidResponse();
  }
  if (groups.filter((group) => group.report?.status === 'SUBMITTED').length !== submittedGroupCount) {
    invalidResponse();
  }
  return {visible, serviceDate, assignedGroupCount, submittedGroupCount, groups};
}

export function parseAdminAttendancePage(
  value: unknown,
  expected: {page: number; size: number; serviceDate: string},
): AdminAttendancePage {
  const record = requireRecord(value);
  if (!Array.isArray(record.content)) invalidResponse();
  const page = requireNonNegativeInteger(record.page);
  const size = requirePositiveInteger(record.size);
  const totalElements = requireNonNegativeInteger(record.totalElements);
  const totalPages = requireNonNegativeInteger(record.totalPages);
  const serviceDate = requireSunday(record.serviceDate);
  if (page !== expected.page || size !== expected.size || serviceDate !== expected.serviceDate) invalidResponse();
  if (totalPages !== (totalElements === 0 ? 0 : Math.ceil(totalElements / size))) invalidResponse();
  const totalsRecord = requireRecord(record.totals);
  return {
    serviceDate,
    content: record.content.map(parseGroup),
    totals: {
      smallGroupMeetingCount: requireNonNegativeInteger(totalsRecord.smallGroupMeetingCount),
      holyWaveCount: requireNonNegativeInteger(totalsRecord.holyWaveCount),
      otherWorshipCount: requireNonNegativeInteger(totalsRecord.otherWorshipCount),
    },
    page, size, totalElements, totalPages,
  };
}

export function parseReport(value: unknown): ShepherdAttendanceReport {
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
    ...(record.lastModifiedByName === undefined
      ? {}
      : {lastModifiedByName: requireNonBlankString(record.lastModifiedByName, 100)}),
  };
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
    if (!/^(0|[1-9]\d*)$/.test(raw)) {
      return {ok: false, message: `${label} 인원은 0 이상의 정수로 입력해 주세요.`};
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) return {ok: false, message: '인원 값이 너무 큽니다.'};
    values.push(value);
  }
  const note = input.note.trim();
  if (note.length > 1000) return {ok: false, message: '메모는 1,000자 이하로 입력해 주세요.'};
  return {ok: true, value: {
    smallGroupMeetingCount: values[0]!,
    holyWaveCount: values[1]!,
    otherWorshipCount: values[2]!,
    note: note || null,
  }};
}

function parseGroup(value: unknown): ShepherdGroup {
  const record = requireRecord(value);
  let assignees: ShepherdAssignee[] | undefined;
  if (record.assignees !== undefined) {
    if (!Array.isArray(record.assignees) || record.assignees.length === 0) invalidResponse();
    assignees = record.assignees.map((item) => {
      const assignee = requireRecord(item);
      return {userId: requirePositiveInteger(assignee.userId), name: requireNonBlankString(assignee.name, 100)};
    });
  }
  return {
    groupId: requirePositiveInteger(record.groupId),
    groupName: requireNonBlankString(record.groupName, 100),
    ...(assignees ? {assignees} : {}),
    report: record.report === null ? null : parseReport(record.report),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}
function requireBoolean(value: unknown) { if (typeof value !== 'boolean') return invalidResponse(); return value; }
function requireNonNegativeInteger(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) return invalidResponse(); return value as number; }
function requirePositiveInteger(value: unknown) { const result = requireNonNegativeInteger(value); if (result === 0) return invalidResponse(); return result; }
function requireNonBlankString(value: unknown, max: number) { if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > max) return invalidResponse(); return value; }
function requireNullableString(value: unknown, max: number) { if (value === null) return null; if (typeof value !== 'string' || value.length > max) return invalidResponse(); return value; }
function requireStatus(value: unknown): ShepherdAttendanceStatus { if (value !== 'DRAFT' && value !== 'SUBMITTED') return invalidResponse(); return value; }
function requireIsoDateTime(value: unknown) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return invalidResponse(); return value; }
function requireSunday(value: unknown) { const result = requireNonBlankString(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || new Date(`${result}T12:00:00+09:00`).getDay() !== SUNDAY) return invalidResponse(); return result; }
function invalidResponse(): never { throw new Error('INVALID_SERVER_RESPONSE'); }
