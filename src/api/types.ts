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
  authSessionGeneration?: number;
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

export type DeleteAccountRequest = {
  password: string;
  confirmText: string;
};

export type DeleteAccountResponse = {
  deletedAt: string;
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

export type CurrentUserCampusMembershipSummary = Omit<
  CampusMembershipSummary,
  'membershipId'
> & {
  membershipId?: number;
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
  campusMemberships: CurrentUserCampusMembershipSummary[];
};

export type ServiceAdminUserCampusSummary = {
  membershipId: number;
  campusId: number;
  campusName: string;
  region: string;
  campusRole: CampusRole;
  status: CampusStatus;
};

export type ServiceAdminUserListItem = {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  campusCount: number;
  campuses: ServiceAdminUserCampusSummary[];
};

export type ServiceAdminUserList = {
  content: ServiceAdminUserListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type ServiceAdminUserDetail = {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  campuses: ServiceAdminUserCampusSummary[];
};

export type ServiceAdminUserRoleChangeRequest = {
  role: UserRole;
};

export type ServiceAdminCampusOperationStatus = 'ACTIVE' | 'PAUSED';

export type ServiceAdminCampusListItem = {
  adminCount: number;
  campusId: number;
  isActive: boolean;
  memberCount: number;
  name: string;
  region: string;
  status: ServiceAdminCampusOperationStatus;
};

export type ServiceAdminCampusList = {
  content: ServiceAdminCampusListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type CampusUpdateRequest = {
  description: string;
  isActive: boolean;
  name: string;
  region: string;
};

export type ServiceAdminCampusMemberAddRequest = {
  userId: number;
};

export type ServiceAdminCampusMemberAddResponse = AdminCampusMember;

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
export type AdminWritableChargeStatus = Exclude<ChargeStatus, 'PAID'>;
export type AdminChargeStatusTarget = AdminWritableChargeStatus | 'PAID';

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

export type AdminChargeMemberSummary = ChargeAmountSummary & {
  userId: number;
  name: string;
  email: string;
};

export type AdminCampusChargeSummary = {
  campusId: number;
  campusName: string;
  region: string;
  summary: ChargeAmountSummary;
  members: AdminChargeMemberSummary[];
};

export type AdminMemberChargeList = ChargeList & {
  userId: number;
  name: string;
  email: string;
};

export type AdminChargeStatusChangeRequest = {
  status: AdminChargeStatusTarget;
};

export type AdminChargeStatusChangeResponse = Omit<ChargeItem, 'account' | 'dueDate' | 'source'> & {
  campusId: number;
  userId: number;
};

export type PaymentAccount = {
  id: number;
  campusId?: number;
  accountType: PaymentCategory;
  nickname: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  ownerUserId?: number | null;
  isActive?: boolean;
  createdAt?: string;
  deactivatedAt?: string | null;
};

export type AdminPaymentAccount = PaymentAccount & {
  campusId: number;
  ownerUserId: number | null;
  isActive: boolean;
};

export type PaymentAccountCreateRequest = {
  accountType: PaymentCategory;
  nickname: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  ownerUserId?: number | null;
};

export type PenaltyRuleType =
  | 'QUIET_TIME'
  | 'PRAYER'
  | 'BIBLE_READING'
  | 'SATURDAY_LATE';

export type PenaltyCalculationType = 'MISSING_COUNT' | 'LATE_MINUTE';

export type PenaltyRule = {
  id: number;
  ruleType: PenaltyRuleType;
  calculationType: PenaltyCalculationType;
  requiredCount: number;
  baseAmount: number;
  amountPerUnit: number;
  isActive: boolean;
};

export type PenaltyRuleCreateRequest = {
  ruleType: PenaltyRuleType;
  calculationType: PenaltyCalculationType;
  requiredCount: number;
  baseAmount: number;
  amountPerUnit: number;
};

export type PenaltyRuleUpdateRequest = {
  requiredCount: number;
  baseAmount: number;
  amountPerUnit: number;
  isActive: boolean;
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

export type MyDutyAssignment = {
  userId: number;
  campusId: number;
  dutyType: string;
  isActive: boolean;
};

export type PollSummary = {
  id: number;
  campusId: number;
  title: string;
  pollType: string;
  selectionType: string;
  isAnonymous: boolean;
  allowUserOptionAdd?: boolean;
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
  userAdded?: boolean;
};

export type PollResponse = {
  responseId: number;
  pollId: number;
  optionIds: number[];
  respondedAt: string;
};

export type PollDetail = PollSummary & {
  templateId: number | null;
  allowUserOptionAdd?: boolean;
  chargeGenerationType: string;
  paymentCategory: string | null;
  paymentAccountId: number | null;
  options: PollOption[];
  myResponse: PollResponse | null;
};

export type PollOptionAddRequest = {
  content?: string;
  menuId?: number;
};

export type PollResponseSaveRequest = {
  optionIds: number[];
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
  email?: string | null;
  submissionId: number | null;
  content: string | null;
  version: number;
  submittedAt: string | null;
  submitted?: boolean;
  editable?: boolean;
};

export type PrayerGroupSummary = {
  groupId: number;
  groupName: string;
  seasonId?: number | null;
  sortOrder: number;
  members: PrayerMemberSummary[];
};

export type PrayerWeekSeasonSummary = {
  seasonId: number;
  name: string;
  startDate: string;
  endDate?: string | null;
  status?: PrayerSeasonStatus;
};

export type PrayerWeekSummary = {
  campusId: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  myGroupId?: number | null;
  seasonId?: number | null;
  seasonName?: string | null;
  seasonStartDate?: string | null;
  seasonEndDate?: string | null;
  seasonStatus?: PrayerSeasonStatus;
  endDate?: string | null;
  activeSeason?: PrayerWeekSeasonSummary | null;
  currentSeason?: PrayerWeekSeasonSummary | null;
  season?: PrayerWeekSeasonSummary | null;
  submittedCount: number;
  targetMemberCount: number;
  groups: PrayerGroupSummary[];
};

export type PrayerSubmissionSaveItem = {
  userId: number;
  content: string | null;
  version: number;
};

export type PrayerSubmissionSaveRequest = {
  submissions: PrayerSubmissionSaveItem[];
};

export type PrayerSelfSaveRequest = {
  content: string | null;
};

export type PrayerSeasonStatus = 'ACTIVE' | 'CLOSED' | string;

export type AdminPrayerSeason = {
  seasonId: number;
  campusId: number;
  name: string;
  startDate: string;
  endDate: string | null;
  status: PrayerSeasonStatus;
};

export type AdminPrayerSeasonCreateRequest = {
  name: string;
  startDate: string;
};

export type AdminPrayerSeasonCloseRequest = {
  endDate: string;
};

export type AdminPrayerGroupMember = {
  userId: number;
  name: string;
  email?: string | null;
};

export type AdminPrayerGroup = {
  groupId: number;
  seasonId: number;
  name: string;
  sortOrder: number;
  active: boolean;
  members: AdminPrayerGroupMember[];
};

export type AdminPrayerGroupCreateRequest = {
  name: string;
  sortOrder: number;
};

export type AdminPrayerGroupUpdateRequest = {
  isActive: boolean;
  name: string;
  sortOrder: number;
};

export type AdminPrayerGroupMembersReplaceRequest = {
  userIds: number[];
};

export type AdminPrayerAssignableMember = {
  userId: number;
  name: string;
  email: string;
  assignedGroupId: number | null;
  assignedGroupName: string | null;
  assignable: boolean;
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

export type AdminMissingDevotionMember = {
  userId: number;
  name: string;
  email: string;
  campusMemberId: number;
  campusName: string;
  region: string;
};

export type AdminNotificationRequest = {
  notificationType: AdminNotificationType;
  targetUserIds: number[];
  targetWeekStartDate: string | null;
  targetId: number | null;
  title: string;
  body: string;
};

export type AdminNotificationResponse = {
  notificationRequestId: string;
  queuedCount: number;
  skippedCount: number;
};

export type AdminNotificationType = 'CUSTOM';

export type AdminNotificationSendStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export type AdminNotificationLog = {
  notificationLogId: number;
  requestId: string;
  userId: number;
  name: string;
  email: string;
  campusId: number;
  notificationType: AdminNotificationType;
  targetWeekStartDate: string | null;
  targetId: number | null;
  title: string;
  body: string;
  sendStatus: AdminNotificationSendStatus;
  failureReason: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type AdminNotificationLogList = {
  items: AdminNotificationLog[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};
