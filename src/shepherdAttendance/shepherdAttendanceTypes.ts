export type ShepherdAttendanceStatus = 'DRAFT' | 'SUBMITTED';

export type ShepherdAttendanceReport = {
  reportId: number;
  campusId: number;
  groupId: number;
  serviceDate: string;
  smallGroupMeetingCount: number;
  holyWaveCount: number;
  otherWorshipCount: number;
  note: string | null;
  status: ShepherdAttendanceStatus;
  lastModifiedByUserId: number;
  lastModifiedByName: string;
  lastModifiedAt: string;
  version: number;
};

export type ShepherdHomeReport = Pick<
  ShepherdAttendanceReport,
  | 'reportId'
  | 'smallGroupMeetingCount'
  | 'holyWaveCount'
  | 'otherWorshipCount'
  | 'note'
  | 'status'
  | 'version'
  | 'lastModifiedAt'
>;

export type ShepherdAssignee = {email: string; name: string; userId: number};

export type ShepherdHomeGroup = {
  groupId: number;
  groupName: string;
  report: ShepherdHomeReport | null;
};

export type ShepherdBoardGroup = {
  assignees: ShepherdAssignee[];
  groupId: number;
  groupName: string;
  groupVersion: number;
  report: ShepherdAttendanceReport | null;
};

// UI-facing compatibility name for an admin board row.
export type ShepherdGroup = ShepherdBoardGroup;

export type ShepherdGroupResource = {
  assignees: ShepherdAssignee[];
  campusId: number;
  groupId: number;
  name: string;
  status: 'ACTIVE';
  version: number;
};

export type ShepherdAttendanceHome = {
  assignedGroupCount: number;
  groups: ShepherdHomeGroup[];
  serviceDate: string | null;
  submittedGroupCount: number;
  title: string;
  visible: boolean;
};

export type AttendanceSaveRequest = {
  smallGroupMeetingCount: number;
  holyWaveCount: number;
  otherWorshipCount: number;
  note: string | null;
  status: ShepherdAttendanceStatus;
  version: number;
};

export type AdminAttendanceTotals = {
  smallGroupMeetingCount: number;
  holyWaveCount: number;
  otherWorshipCount: number;
};

export type AdminAttendancePage = {
  campusId: number;
  serviceDate: string;
  content: ShepherdBoardGroup[];
  totals: AdminAttendanceTotals;
  totalSubmittedCount: number;
  totalMissingCount: number;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type AttendanceInput = {
  smallGroupMeetingCount: string;
  holyWaveCount: string;
  otherWorshipCount: string;
  note: string;
};
