export type ShepherdAttendanceStatus = 'DRAFT' | 'SUBMITTED';

export type ShepherdAttendanceReport = {
  reportId: number;
  smallGroupMeetingCount: number;
  holyWaveCount: number;
  otherWorshipCount: number;
  note: string | null;
  status: ShepherdAttendanceStatus;
  version: number;
  lastModifiedAt: string;
  lastModifiedByName?: string;
};

export type ShepherdAssignee = {userId: number; name: string};

export type ShepherdGroup = {
  groupId: number;
  groupName: string;
  assignees?: ShepherdAssignee[];
  report: ShepherdAttendanceReport | null;
};

export type ShepherdAttendanceHome = {
  visible: boolean;
  serviceDate: string;
  assignedGroupCount: number;
  submittedGroupCount: number;
  groups: ShepherdGroup[];
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
  serviceDate: string;
  content: ShepherdGroup[];
  totals: AdminAttendanceTotals;
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
