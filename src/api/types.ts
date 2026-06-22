export type ApiEnvelope<T> = {
  success: boolean;
  code: string;
  message: string;
  data?: T | null;
  timestamp: string;
};

export type ApiErrorKind =
  | 'sessionExpired'
  | 'permissionDenied'
  | 'conflict'
  | 'offline'
  | 'error';

export type ApiError = {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  message: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer' | string;
};

export type SignupRequest = {
  name: string;
  email: string;
  password: string;
};

export type SignupResponse = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = TokenPair & {
  user: CurrentUser;
};

export type LogoutRequest = {
  refreshToken?: string;
  clientInstanceId?: string;
  fcmToken?: string;
};

export type UserRole = 'USER' | 'MANAGER' | 'ADMIN';

export type CampusRole =
  | 'MEMBER'
  | 'CAMPUS_LEADER'
  | 'ELDER'
  | 'MINISTER';

export type CampusStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | string;

export type CampusMembershipSummary = {
  membershipId: number;
  campusId: number;
  campusName: string;
  region: string;
  campusRole: CampusRole;
  status: CampusStatus;
};

export type CampusCreateRequest = {
  name: string;
  region: string;
  description: string;
};

export type CampusCreateResponse = {
  campusId: number;
  name: string;
  region: string;
  description: string;
  inviteCode: string;
  myCampusRole: CampusRole;
  membershipStatus: CampusStatus;
};

export type CampusJoinRequest = {
  inviteCode: string;
};

export type CampusJoinResponse = CampusMembershipSummary;

export type CampusDetail = {
  campusId: number;
  name: string;
  region: string;
  description: string;
  isActive: boolean;
  myCampusRole: CampusRole | null;
  membershipStatus: CampusStatus | null;
  inviteCode?: string;
};

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  campusMemberships: CampusMembershipSummary[];
};

export type DevotionDailyCheck = {
  id: number | null;
  recordDate: string;
  quietTimeChecked: boolean;
  prayerChecked: boolean;
  bibleReadingChecked: boolean;
};

export type DevotionDailyCheckRequest = {
  quietTimeChecked: boolean;
  prayerChecked: boolean;
  bibleReadingChecked: boolean;
};

export type DevotionDailyCheckSaveResponse = DevotionDailyCheckRequest & {
  weeklyRecordId: number;
  recordDate: string;
  quietTimeCount: number;
  prayerCount: number;
  bibleReadingCount: number;
  submittedAt?: string | null;
};

export type WeeklyDevotionSaveRequest = {
  dailyChecks: Array<DevotionDailyCheckRequest & {recordDate: string}>;
  saturdayLateMinutes: number;
  submit: boolean;
};

export type WeeklyDevotionSummary = {
  weeklyRecordId: number | null;
  campusId: number;
  campusName: string;
  region: string;
  userId: number;
  weekStartDate: string;
  weekEndDate: string;
  quietTimeCount: number;
  prayerCount: number;
  bibleReadingCount: number;
  saturdayLateMinutes: number;
  submittedAt: string | null;
  dailyChecks: DevotionDailyCheck[];
};

export type DevotionMonthTotal = {
  quietTimeCount: number;
  prayerCount: number;
  bibleReadingCount: number;
  saturdayLateMinutes: number;
};

export type DevotionMonthlyWeekRecord = DevotionMonthTotal & {
  weeklyRecordId: number | null;
  weekStartDate: string;
  weekEndDate: string;
  submittedAt: string | null;
};

export type DevotionMonthlySummary = {
  campusId: number;
  campusName: string;
  region: string;
  userId: number;
  name: string;
  year: number;
  month: number;
  devotion: DevotionMonthTotal;
  weeklyRecords: DevotionMonthlyWeekRecord[];
};

export type ChargeCategorySummary = {
  paymentCategory: string;
  paidAmount: number;
  unpaidAmount: number;
  totalAmount: number;
};

export type ChargeSummary = {
  campusId: number;
  campusName: string;
  region: string;
  userId: number;
  name: string;
  totalPaidAmount: number;
  monthlyPaidAmount: number;
  monthlyUnpaidAmount: number;
  monthlyTotalChargeAmount: number;
  monthlyByCategory: ChargeCategorySummary[];
};

export type PollSummary = {
  id: number;
  campusId: number;
  title: string;
  pollType: string;
  selectionType: string;
  isAnonymous: boolean;
  startsAt: string;
  endsAt: string;
  status: string;
  responded: boolean;
};

export type PrayerMemberSummary = {
  userId: number;
  name: string;
  submissionId: number | null;
  content: string | null;
  version: number;
  submittedAt: string | null;
};

export type PrayerGroupSummary = {
  groupId: number;
  groupName: string;
  sortOrder: number;
  members: PrayerMemberSummary[];
};

export type PrayerWeekSummary = {
  campusId: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  submittedCount: number;
  targetMemberCount: number;
  groups: PrayerGroupSummary[];
};
