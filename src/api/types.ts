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

export type FcmDeviceType = 'ANDROID' | 'IOS' | 'WEB';

export type FcmTokenRegisterRequest = {
  token: string;
  clientInstanceId: string;
  deviceType: FcmDeviceType;
  appVersion: string;
};

export type FcmTokenRegisterResponse = {
  tokenId: number;
  deviceType: FcmDeviceType;
  clientInstanceId: string;
  appVersion: string;
  isActive: boolean;
  lastSeenAt: string;
  lastRefreshedAt: string;
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
  paymentCategory: PaymentCategory;
  paidAmount: number;
  unpaidAmount: number;
  totalAmount: number;
};

export type PaymentCategory = 'PENALTY' | 'COFFEE';

export type ChargeStatus = 'UNPAID' | 'PAID' | 'WAIVED' | 'CANCELED';

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

export type ChargeAmountSummary = {
  totalAmount: number;
  unpaidAmount: number;
  paidAmount: number;
  waivedAmount: number;
  canceledAmount: number;
};

export type ChargePaymentAccountSnapshot = {
  paymentAccountId: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export type ChargeSource = {
  sourceType: string;
  sourceId: number;
};

export type ChargeItem = {
  id: number;
  paymentCategory: PaymentCategory;
  title: string;
  reason: string;
  amount: number;
  status: ChargeStatus;
  dueDate?: string | null;
  paidAt?: string | null;
  account?: ChargePaymentAccountSnapshot | null;
  source?: ChargeSource | null;
};

export type ChargeList = {
  campusId: number;
  campusName: string;
  region: string;
  summary: ChargeAmountSummary;
  items: ChargeItem[];
};

export type PaymentAccount = {
  id: number;
  accountType: PaymentCategory;
  nickname: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export type MarkChargePaidRequest = {
  paidAt?: string;
};

export type MarkChargePaidResponse = Omit<ChargeItem, 'account' | 'dueDate' | 'source'> & {
  campusId: number;
  userId: number;
  paidAt: string | null;
};

export type CoffeeBrand = {
  id: number;
  brandCode: string;
  name: string;
  sortOrder: number;
};

export type CoffeeMenu = {
  id: number;
  brandId: number;
  menuCode: string;
  name: string;
  priceAmount: number;
  category: string;
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

export type PollOption = {
  id: number;
  content: string;
  composeMenuCode: string | null;
  priceAmount: number;
  sortOrder: number;
};

export type PollResponse = {
  responseId: number;
  pollId: number;
  optionIds: number[];
  memo: string;
  respondedAt: string;
};

export type PollDetail = PollSummary & {
  templateId: number | null;
  chargeGenerationType: string;
  paymentCategory: string | null;
  paymentAccountId: number | null;
  options: PollOption[];
  myResponse: PollResponse | null;
};

export type PollResponseSaveRequest = {
  optionIds: number[];
  memo: string;
};

export type PollResultRespondent = {
  userId: number;
  name: string;
  email: string;
};

export type PollOptionResult = {
  id: number;
  content: string;
  sortOrder: number;
  responseCount: number;
  respondents: PollResultRespondent[];
};

export type PollResults = {
  pollId: number;
  campusId: number;
  title: string;
  pollType: string;
  selectionType: string;
  anonymous: boolean;
  status: string;
  startsAt: string;
  endsAt: string;
  targetMemberCount: number;
  respondedCount: number;
  notRespondedCount: number;
  optionResults: PollOptionResult[];
};

export type PollComment = {
  commentId: number;
  pollId: number;
  userId: number;
  name: string;
  content: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PollCommentRequest = {
  content: string;
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

export type AdminDashboardSummary = {
  campus: {
    campusId: number;
    campusName: string;
    region: string;
  };
  members: {
    activeCount: number;
    inactiveCount: number;
    adminCount: number;
  };
  devotion: {
    weekStartDate: string;
    submittedCount: number;
    missingCount: number;
    submitRate: number;
  };
  charges: {
    unpaidAmount: number;
    unpaidMemberCount: number;
    byCategory: Array<{
      paymentCategory: PaymentCategory;
      unpaidAmount: number;
    }>;
  };
  polls: {
    openCount: number;
    recentlyClosedCount: number;
    missingResponseCount: number;
    recentlyClosedDays: number;
  };
};

export type AdminCampusMember = {
  membershipId: number;
  campusId: number;
  userId: number;
  name: string;
  email: string;
  campusRole: CampusRole;
  status: CampusStatus;
};

export type AdminCampusRoleChangeRequest = {
  campusRole: CampusRole;
};

export type DutyAssignment = {
  assignmentId: number;
  campusId: number;
  userId: number;
  name: string;
  email: string;
  dutyType: 'COFFEE' | string;
  isActive: boolean;
  assignedAt: string;
};

export type CoffeeDutyAssignRequest = {
  userId: number;
};
