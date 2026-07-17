import type {
  AdminCampusChargeSummary,
  AdminCampusMember,
  AdminChargeStatusChangeResponse,
  AdminDashboardSummary,
  AdminMemberChargeList,
  AdminMissingDevotionMember,
  AdminNotificationLogList,
  AdminNotificationResponse,
  AdminPaymentAccount,
  AdminPrayerAssignableMember,
  AdminPrayerGroup,
  AdminPrayerSeason,
  CampusCreateResponse,
  CampusDetail,
  CampusMembershipSummary,
  CampusRole,
  ChargeAmountSummary,
  ChargeItem,
  ChargeList,
  ChargeSummary,
  CoffeeBrand,
  CoffeeMenu,
  CurrentUser,
  CurrentUserCampusMembershipSummary,
  DeleteAccountResponse,
  DevotionDailyCheck,
  DevotionDailyCheckSaveResponse,
  DevotionMonthTotal,
  DevotionMonthlySummary,
  DutyAssignment,
  FcmDeviceType,
  FcmTokenRegisterResponse,
  LoginResponse,
  MarkChargePaidResponse,
  MyDutyAssignment,
  PaymentAccount,
  PaymentAccountCategory,
  PaymentCategory,
  PenaltyCalculationType,
  PenaltyRule,
  PenaltyRuleType,
  PollComment,
  PollDetail,
  PollOption,
  PollResponse,
  PollResults,
  PollSummary,
  PrayerGroupSummary,
  PrayerMemberSummary,
  PrayerSeasonStatus,
  PrayerWeekSeasonSummary,
  PrayerWeekSummary,
  ServiceAdminCampusList,
  ServiceAdminCampusMemberAddResponse,
  ServiceAdminUserDetail,
  ServiceAdminUserList,
  SignupResponse,
  TokenPair,
  UserRole,
  WeeklyDevotionSummary,
} from './types';
import type {
  AdminPoll,
  AdminPollMissingMember,
  AdminPollTemplate,
} from './adminPollApi';

const INVALID_RESPONSE_MESSAGE = 'Invalid API response.';
const MAX_COLLECTION_ITEMS = 1_000;
const MAX_TEXT_LENGTH = 8_192;

type UnknownRecord = Record<string, unknown>;

const USER_ROLES = new Set<UserRole>(['USER', 'MANAGER', 'ADMIN']);
const CAMPUS_ROLES = new Set<CampusRole>([
  'MEMBER',
  'CAMPUS_LEADER',
  'ELDER',
  'MINISTER',
]);
const FCM_DEVICE_TYPES = new Set<FcmDeviceType>(['ANDROID', 'IOS', 'WEB']);
const PAYMENT_CATEGORIES = new Set<PaymentCategory>(['PENALTY', 'COFFEE', 'MEAL']);
const DUTY_TYPES = new Set(['COFFEE', 'MEAL'] as const);
const PAYMENT_ACCOUNT_CATEGORIES = new Set<PaymentAccountCategory>(['PENALTY', 'COFFEE']);
const CHARGE_STATUSES = new Set(['UNPAID', 'PAID', 'WAIVED', 'CANCELED'] as const);
const PENALTY_RULE_TYPES = new Set<PenaltyRuleType>([
  'QUIET_TIME',
  'PRAYER',
  'BIBLE_READING',
  'SATURDAY_LATE',
]);
const PENALTY_CALCULATION_TYPES = new Set<PenaltyCalculationType>([
  'MISSING_COUNT',
  'LATE_MINUTE',
]);
const NOTIFICATION_SEND_STATUSES = new Set([
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
] as const);
const CAMPUS_OPERATION_STATUSES = new Set(['ACTIVE', 'PAUSED'] as const);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))?$/;
const LOCAL_TIME_PATTERN = /^\d{2}:\d{2}(?::\d{2})?$/;

function invalidResponse(): never {
  throw new Error(INVALID_RESPONSE_MESSAGE);
}

function parseSafely<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    return invalidResponse();
  }
}

function requireRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidResponse();
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidResponse();
  }

  return value as UnknownRecord;
}

function requireString(value: unknown, maxLength = MAX_TEXT_LENGTH): string {
  if (
    typeof value !== 'string' ||
    value.length > maxLength ||
    value.trim().length === 0
  ) {
    return invalidResponse();
  }

  return value;
}

function requireNullableString(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH,
): string | null {
  return value === null ? null : requireString(value, maxLength);
}

function optionalNullableString(
  record: UnknownRecord,
  key: string,
  maxLength = MAX_TEXT_LENGTH,
): Record<string, string | null> {
  return record[key] === undefined
    ? {}
    : {[key]: requireNullableString(record[key], maxLength)};
}

function requirePositiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return invalidResponse();
  }

  return value;
}

function requireNullablePositiveId(value: unknown): number | null {
  return value === null ? null : requirePositiveId(value);
}

function optionalPositiveId(
  record: UnknownRecord,
  key: string,
): Record<string, number> {
  return record[key] === undefined ? {} : {[key]: requirePositiveId(record[key])};
}

function requireNonNegativeInteger(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return invalidResponse();
  }

  return value;
}

function requirePositiveInteger(value: unknown): number {
  const result = requireNonNegativeInteger(value);
  return result > 0 ? result : invalidResponse();
}

function requireDayOfWeek(value: unknown): number {
  const day = requirePositiveInteger(value);
  return day <= 7 ? day : invalidResponse();
}

function requireFiniteNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    return invalidResponse();
  }

  return value;
}

function requireBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalidResponse();
}

function optionalBoolean(
  record: UnknownRecord,
  key: string,
): Record<string, boolean> {
  return record[key] === undefined ? {} : {[key]: requireBoolean(record[key])};
}

function requireEnum<T extends string>(
  value: unknown,
  allowedValues: ReadonlySet<T>,
): T {
  if (typeof value !== 'string' || !allowedValues.has(value as T)) {
    return invalidResponse();
  }

  return value as T;
}

function requireOpenString(value: unknown, maxLength = 64): string {
  return requireString(value, maxLength);
}

function requireDate(value: unknown): string {
  const date = requireString(value, 10);
  if (!DATE_PATTERN.test(date)) {
    return invalidResponse();
  }

  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isValidCalendarDate(year, month, day)) {
    return invalidResponse();
  }

  return date;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}

function requireDateTime(value: unknown): string {
  const date = requireString(value, 64);
  const match = DATE_TIME_PATTERN.exec(date);
  if (!match) {
    return invalidResponse();
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);

  if (
    !isValidCalendarDate(year, month, day) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 18 ||
    offsetMinute > 59 ||
    (offsetHour === 18 && offsetMinute !== 0)
  ) {
    return invalidResponse();
  }

  return date;
}

function requireNullableDate(value: unknown): string | null {
  return value === null ? null : requireDate(value);
}

function requireNullableDateTime(value: unknown): string | null {
  return value === null ? null : requireDateTime(value);
}

function optionalNullableDate(
  record: UnknownRecord,
  key: string,
): Record<string, string | null> {
  return record[key] === undefined ? {} : {[key]: requireNullableDate(record[key])};
}

function optionalNullableDateTime(
  record: UnknownRecord,
  key: string,
): Record<string, string | null> {
  return record[key] === undefined
    ? {}
    : {[key]: requireNullableDateTime(record[key])};
}

function requireLocalTime(value: unknown): string {
  const time = requireString(value, 8);
  if (!LOCAL_TIME_PATTERN.test(time)) {
    return invalidResponse();
  }

  const [hours, minutes, seconds = 0] = time.split(':').map(Number);
  if (hours! > 23 || minutes! > 59 || seconds > 59) {
    return invalidResponse();
  }

  return seconds === 0 && time.length === 5 ? `${time}:00` : time;
}

function requireArray<T>(value: unknown, parser: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > MAX_COLLECTION_ITEMS) {
    return invalidResponse();
  }

  return value.map(parser);
}

function requireArrayPayload(
  value: unknown,
  keys: readonly string[],
  depth = 0,
): unknown[] {
  if (Array.isArray(value)) {
    return value.length <= MAX_COLLECTION_ITEMS ? value : invalidResponse();
  }

  if (depth > 2) {
    return invalidResponse();
  }

  const record = requireRecord(value);
  for (const key of keys) {
    const nested = record[key];
    if (nested === undefined) {
      continue;
    }

    if (Array.isArray(nested)) {
      return nested.length <= MAX_COLLECTION_ITEMS ? nested : invalidResponse();
    }

    if (typeof nested === 'object' && nested !== null) {
      return requireArrayPayload(nested, keys, depth + 1);
    }

    return invalidResponse();
  }

  return invalidResponse();
}

function parseTokenPairValue(value: unknown): TokenPair {
  const record = requireRecord(value);
  return {
    accessToken: requireString(record.accessToken, 32_768),
    refreshToken: requireString(record.refreshToken, 32_768),
    accessTokenExpiresIn: requireFiniteNumber(record.accessTokenExpiresIn),
    refreshTokenExpiresIn: requireFiniteNumber(record.refreshTokenExpiresIn),
    tokenType: requireString(record.tokenType, 64),
  };
}

function parseCampusMembershipSummaryValue(value: unknown): CampusMembershipSummary {
  const record = requireRecord(value);
  return {
    membershipId: requirePositiveId(record.membershipId),
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    campusRole: requireEnum(record.campusRole, CAMPUS_ROLES),
    status: requireOpenString(record.status),
  };
}

function parseCurrentUserMembershipValue(
  value: unknown,
): CurrentUserCampusMembershipSummary {
  const record = requireRecord(value);
  return {
    ...optionalPositiveId(record, 'membershipId'),
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    campusRole: requireEnum(record.campusRole, CAMPUS_ROLES),
    status: requireOpenString(record.status),
  };
}

function parseCurrentUserValue(value: unknown): CurrentUser {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    role: requireEnum(record.role, USER_ROLES),
    isActive: requireBoolean(record.isActive),
    lastLoginAt: requireNullableDateTime(record.lastLoginAt),
    campusMemberships: requireArray(
      record.campusMemberships,
      parseCurrentUserMembershipValue,
    ),
  };
}

function parseCampusDetailValue(value: unknown): CampusDetail {
  const record = requireRecord(value);
  return {
    campusId: requirePositiveId(record.campusId),
    name: requireString(record.name, 200),
    region: requireString(record.region, 200),
    description: requireString(record.description, MAX_TEXT_LENGTH),
    isActive: requireBoolean(record.isActive),
    myCampusRole:
      record.myCampusRole === null
        ? null
        : requireEnum(record.myCampusRole, CAMPUS_ROLES),
    membershipStatus:
      record.membershipStatus === null
        ? null
        : requireOpenString(record.membershipStatus),
    ...(record.inviteCode === undefined || record.inviteCode === null
      ? {}
      : {inviteCode: requireString(record.inviteCode, 128)}),
  };
}

function parseCampusCreateResponseValue(value: unknown): CampusCreateResponse {
  const record = requireRecord(value);
  return {
    campusId: requirePositiveId(record.campusId),
    name: requireString(record.name, 200),
    region: requireString(record.region, 200),
    description: requireString(record.description, MAX_TEXT_LENGTH),
    inviteCode: requireString(record.inviteCode, 128),
    myCampusRole: requireEnum(record.myCampusRole, CAMPUS_ROLES),
    membershipStatus: requireOpenString(record.membershipStatus),
  };
}

function parseDevotionDailyCheckValue(value: unknown): DevotionDailyCheck {
  const record = requireRecord(value);
  return {
    id: requireNullablePositiveId(record.id),
    recordDate: requireDate(record.recordDate),
    quietTimeChecked: requireBoolean(record.quietTimeChecked),
    prayerChecked: requireBoolean(record.prayerChecked),
    bibleReadingChecked: requireBoolean(record.bibleReadingChecked),
  };
}

function parseWeeklyDevotionSummaryValue(value: unknown): WeeklyDevotionSummary {
  const record = requireRecord(value);
  return {
    weeklyRecordId: requireNullablePositiveId(record.weeklyRecordId),
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    userId: requirePositiveId(record.userId),
    weekStartDate: requireDate(record.weekStartDate),
    weekEndDate: requireDate(record.weekEndDate),
    quietTimeCount: requireNonNegativeInteger(record.quietTimeCount),
    prayerCount: requireNonNegativeInteger(record.prayerCount),
    bibleReadingCount: requireNonNegativeInteger(record.bibleReadingCount),
    saturdayLateMinutes: requireNonNegativeInteger(record.saturdayLateMinutes),
    submittedAt: requireNullableDateTime(record.submittedAt),
    dailyChecks: requireArray(record.dailyChecks, parseDevotionDailyCheckValue),
  };
}

function parseDevotionDailyCheckSaveResponseValue(
  value: unknown,
): DevotionDailyCheckSaveResponse {
  const record = requireRecord(value);
  return {
    weeklyRecordId: requirePositiveId(record.weeklyRecordId),
    recordDate: requireDate(record.recordDate),
    quietTimeChecked: requireBoolean(record.quietTimeChecked),
    prayerChecked: requireBoolean(record.prayerChecked),
    bibleReadingChecked: requireBoolean(record.bibleReadingChecked),
    quietTimeCount: requireNonNegativeInteger(record.quietTimeCount),
    prayerCount: requireNonNegativeInteger(record.prayerCount),
    bibleReadingCount: requireNonNegativeInteger(record.bibleReadingCount),
    ...optionalNullableDateTime(record, 'submittedAt'),
  };
}

function parseDevotionMonthTotalValue(value: unknown): DevotionMonthTotal {
  const record = requireRecord(value);
  return {
    quietTimeCount: requireNonNegativeInteger(record.quietTimeCount),
    prayerCount: requireNonNegativeInteger(record.prayerCount),
    bibleReadingCount: requireNonNegativeInteger(record.bibleReadingCount),
    saturdayLateMinutes: requireNonNegativeInteger(record.saturdayLateMinutes),
  };
}

function parseDevotionMonthlySummaryValue(value: unknown): DevotionMonthlySummary {
  const record = requireRecord(value);
  const month = requirePositiveInteger(record.month);
  if (month > 12) {
    return invalidResponse();
  }

  return {
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    year: requirePositiveInteger(record.year),
    month,
    devotion: parseDevotionMonthTotalValue(record.devotion),
    weeklyRecords: requireArray(record.weeklyRecords, (item) => {
      const week = requireRecord(item);
      return {
        ...parseDevotionMonthTotalValue(week),
        weeklyRecordId: requireNullablePositiveId(week.weeklyRecordId),
        weekStartDate: requireDate(week.weekStartDate),
        weekEndDate: requireDate(week.weekEndDate),
        submittedAt: requireNullableDateTime(week.submittedAt),
      };
    }),
  };
}

function parseChargeAmountSummaryValue(value: unknown): ChargeAmountSummary {
  const record = requireRecord(value);
  return {
    totalAmount: requireNonNegativeInteger(record.totalAmount),
    unpaidAmount: requireNonNegativeInteger(record.unpaidAmount),
    paidAmount: requireNonNegativeInteger(record.paidAmount),
    waivedAmount: requireNonNegativeInteger(record.waivedAmount),
    canceledAmount: requireNonNegativeInteger(record.canceledAmount),
  };
}

function parseChargeItemValue(value: unknown): ChargeItem {
  const record = requireRecord(value);
  const account =
    record.account === undefined
      ? {}
      : {
          account:
            record.account === null
              ? null
              : (() => {
                  const source = requireRecord(record.account);
                  return {
                    paymentAccountId: requirePositiveId(source.paymentAccountId),
                    bankName: requireString(source.bankName, 200),
                    accountNumber: requireString(source.accountNumber, 200),
                    accountHolder: requireString(source.accountHolder, 200),
                  };
                })(),
        };
  const source =
    record.source === undefined
      ? {}
      : {
          source:
            record.source === null
              ? null
              : (() => {
                  const item = requireRecord(record.source);
                  return {
                    sourceType: requireOpenString(item.sourceType),
                    sourceId: requirePositiveId(item.sourceId),
                  };
                })(),
        };

  return {
    id: requirePositiveId(record.id),
    paymentCategory: requireEnum(record.paymentCategory, PAYMENT_CATEGORIES),
    title: requireString(record.title, 500),
    ...optionalNullableString(record, 'reason'),
    amount: requireNonNegativeInteger(record.amount),
    status: requireEnum(record.status, CHARGE_STATUSES),
    ...optionalNullableDate(record, 'dueDate'),
    ...optionalNullableDateTime(record, 'paidAt'),
    ...account,
    ...source,
  };
}

function parseChargeSummaryValue(value: unknown): ChargeSummary {
  const record = requireRecord(value);
  return {
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    totalPaidAmount: requireNonNegativeInteger(record.totalPaidAmount),
    monthlyPaidAmount: requireNonNegativeInteger(record.monthlyPaidAmount),
    monthlyUnpaidAmount: requireNonNegativeInteger(record.monthlyUnpaidAmount),
    monthlyTotalChargeAmount: requireNonNegativeInteger(
      record.monthlyTotalChargeAmount,
    ),
    monthlyByCategory: requireArray(record.monthlyByCategory, (item) => {
      const category = requireRecord(item);
      return {
        paymentCategory: requireEnum(category.paymentCategory, PAYMENT_CATEGORIES),
        paidAmount: requireNonNegativeInteger(category.paidAmount),
        unpaidAmount: requireNonNegativeInteger(category.unpaidAmount),
        totalAmount: requireNonNegativeInteger(category.totalAmount),
      };
    }),
  };
}

function parseChargeListValue(value: unknown): ChargeList {
  const record = requireRecord(value);
  return {
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    summary: parseChargeAmountSummaryValue(record.summary),
    items: requireArray(record.items, parseChargeItemValue),
    page: requireNonNegativeInteger(record.page),
    size: requirePositiveId(record.size),
    totalElements: requireNonNegativeInteger(record.totalElements),
    totalPages: requireNonNegativeInteger(record.totalPages),
  };
}

function parsePaymentAccountValue(value: unknown): PaymentAccount {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    ...optionalPositiveId(record, 'campusId'),
    accountType: requireEnum(record.accountType, PAYMENT_ACCOUNT_CATEGORIES),
    nickname: requireString(record.nickname, 200),
    bankName: requireString(record.bankName, 200),
    accountNumber: requireString(record.accountNumber, 200),
    accountHolder: requireString(record.accountHolder, 200),
    ...(record.ownerUserId === undefined
      ? {}
      : {ownerUserId: requireNullablePositiveId(record.ownerUserId)}),
    ...optionalBoolean(record, 'isActive'),
    ...(record.createdAt === undefined
      ? {}
      : {createdAt: requireDateTime(record.createdAt)}),
    ...optionalNullableDateTime(record, 'deactivatedAt'),
  };
}

function parseAdminPaymentAccountValue(value: unknown): AdminPaymentAccount {
  const account = parsePaymentAccountValue(value);
  const record = requireRecord(value);
  return {
    ...account,
    campusId: requirePositiveId(record.campusId),
    ownerUserId: requireNullablePositiveId(record.ownerUserId),
    isActive: requireBoolean(record.isActive),
  };
}

function parsePenaltyRuleValue(value: unknown): PenaltyRule {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    ruleType: requireEnum(record.ruleType, PENALTY_RULE_TYPES),
    calculationType: requireEnum(
      record.calculationType,
      PENALTY_CALCULATION_TYPES,
    ),
    requiredCount: requireNonNegativeInteger(record.requiredCount),
    baseAmount: requireNonNegativeInteger(record.baseAmount),
    amountPerUnit: requireNonNegativeInteger(record.amountPerUnit),
    isActive: requireBoolean(record.isActive),
  };
}

function parseChargeMutationValue(
  value: unknown,
): MarkChargePaidResponse | AdminChargeStatusChangeResponse {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    campusId: requirePositiveId(record.campusId),
    userId: requirePositiveId(record.userId),
    paymentCategory: requireEnum(record.paymentCategory, PAYMENT_CATEGORIES),
    title: requireString(record.title, 500),
    ...optionalNullableString(record, 'reason'),
    amount: requireNonNegativeInteger(record.amount),
    status: requireEnum(record.status, CHARGE_STATUSES),
    ...optionalNullableDateTime(record, 'paidAt'),
  };
}

function parseCoffeeBrandValue(value: unknown): CoffeeBrand {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    brandCode: requireString(record.brandCode, 128),
    name: requireString(record.name, 200),
    sortOrder: requirePositiveInteger(record.sortOrder),
  };
}

function parseCoffeeMenuValue(value: unknown): CoffeeMenu {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    brandId: requirePositiveId(record.brandId),
    menuCode: requireString(record.menuCode, 128),
    name: requireString(record.name, 200),
    priceAmount: requireNonNegativeInteger(record.priceAmount),
    category: requireOpenString(record.category),
  };
}

function requireAliasedPositiveId(record: UnknownRecord, keys: readonly string[]) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return requirePositiveId(record[key]);
    }
  }

  return invalidResponse();
}

function requireAliasedString(
  record: UnknownRecord,
  keys: readonly string[],
  maxLength = MAX_TEXT_LENGTH,
) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return requireString(record[key], maxLength);
    }
  }

  return invalidResponse();
}

function requireAliasedBoolean(record: UnknownRecord, keys: readonly string[]) {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return requireBoolean(record[key]);
    }
  }

  return invalidResponse();
}

function parsePollSummaryValue(value: unknown): PollSummary {
  const record = requireRecord(value);
  if (record.createdByUserId !== undefined) {
    return invalidResponse();
  }
  const allowUserOptionAdd =
    record.allowUserOptionAdd === undefined
      ? {}
      : {allowUserOptionAdd: requireBoolean(record.allowUserOptionAdd)};
  const responded =
    record.responded !== undefined || record.hasResponded !== undefined
      ? requireAliasedBoolean(record, ['responded', 'hasResponded'])
      : record.myResponse !== undefined
        ? record.myResponse !== null
        : invalidResponse();

  return {
    id: requireAliasedPositiveId(record, ['id', 'pollId']),
    campusId: requirePositiveId(record.campusId),
    title: requireString(record.title, 500),
    pollType: requireOpenString(record.pollType),
    selectionType: requireOpenString(record.selectionType),
    isAnonymous: requireAliasedBoolean(record, ['isAnonymous', 'anonymous']),
    ...allowUserOptionAdd,
    startsAt: requireDateTime(
      requireAliasedString(record, [
        'startsAt',
        'startAt',
        'startDateTime',
        'startDate',
        'createdAt',
      ], 64),
    ),
    endsAt: requireDateTime(
      requireAliasedString(record, [
        'endsAt',
        'endAt',
        'endDateTime',
        'deadlineAt',
        'deadline',
        'endDate',
      ], 64),
    ),
    status: requireOpenString(record.status),
    responded,
    manageableByMe: requireBoolean(record.manageableByMe),
  };
}

function parsePollOptionValue(value: unknown, index = 0): PollOption {
  const record = requireRecord(value);
  const composeMenuCodeValue = record.composeMenuCode ?? record.menuCode ?? null;
  const priceAmountValue = record.priceAmount ?? record.price ?? record.amount ?? 0;
  const sortOrderValue = record.sortOrder ?? record.order ?? index + 1;
  return {
    id: requireAliasedPositiveId(record, ['id', 'optionId', 'pollOptionId']),
    content: requireAliasedString(
      record,
      ['content', 'optionContent', 'name', 'menuName', 'title'],
      1_000,
    ),
    composeMenuCode:
      composeMenuCodeValue === null
        ? null
        : requireString(composeMenuCodeValue, 128),
    priceAmount: requireNonNegativeInteger(priceAmountValue),
    sortOrder: requireNonNegativeInteger(sortOrderValue),
    ...optionalBoolean(record, 'userAdded'),
  };
}

function parsePollOptionsPayload(value: unknown): PollOption[] {
  return requireArrayPayload(value, ['content', 'items', 'options']).map(
    parsePollOptionValue,
  );
}

function parsePollResponseValue(value: unknown): PollResponse {
  const record = requireRecord(value);
  const optionValues = requireArrayPayload(
    record.optionIds ?? record.options,
    ['content', 'items'],
  );
  return {
    responseId: requireAliasedPositiveId(record, ['responseId', 'id']),
    pollId: requirePositiveId(record.pollId),
    optionIds: optionValues.map((option) =>
      typeof option === 'number'
        ? requirePositiveId(option)
        : requireAliasedPositiveId(requireRecord(option), ['id', 'optionId']),
    ),
    respondedAt: requireDateTime(record.respondedAt),
  };
}

function parseNullablePollResponseValue(value: unknown): PollResponse | null {
  return value === null || value === undefined
    ? null
    : parsePollResponseValue(value);
}

function parsePollDetailValue(value: unknown): PollDetail {
  const wrapper = requireRecord(value);
  const source =
    wrapper.poll === undefined ? wrapper : requireRecord(wrapper.poll);
  const summary = parsePollSummaryValue(source);
  const optionsValue = source.options ?? wrapper.options;

  return {
    ...summary,
    templateId:
      source.templateId === undefined
        ? null
        : requireNullablePositiveId(source.templateId),
    chargeGenerationType:
      source.chargeGenerationType === undefined
        ? 'NONE'
        : requireOpenString(source.chargeGenerationType),
    paymentCategory:
      source.paymentCategory === undefined || source.paymentCategory === null
        ? null
        : requireOpenString(source.paymentCategory),
    paymentAccountId:
      source.paymentAccountId === undefined
        ? null
        : requireNullablePositiveId(source.paymentAccountId),
    options: parsePollOptionsPayload(optionsValue),
    myResponse: parseNullablePollResponseValue(
      source.myResponse ?? source.response ?? null,
    ),
  };
}

function parsePollResultsValue(value: unknown): PollResults {
  const record = requireRecord(value);
  const options = requireArrayPayload(
    record.optionResults ?? record.options ?? record.content ?? record.items,
    ['content', 'items', 'optionResults', 'options'],
  );
  return {
    pollId: requirePositiveId(record.pollId),
    campusId: requirePositiveId(record.campusId),
    title: requireString(record.title, 500),
    pollType: requireOpenString(record.pollType),
    selectionType: requireOpenString(record.selectionType),
    anonymous: requireAliasedBoolean(record, ['anonymous', 'isAnonymous']),
    status: requireOpenString(record.status),
    startsAt: requireDateTime(record.startsAt),
    endsAt: requireDateTime(record.endsAt),
    targetMemberCount: requireNonNegativeInteger(record.targetMemberCount),
    respondedCount: requireNonNegativeInteger(record.respondedCount),
    notRespondedCount: requireNonNegativeInteger(record.notRespondedCount),
    optionResults: options.map((option, index) => {
      const source = requireRecord(option);
      const normalized = parsePollOptionValue(source, index);
      const respondentsValue = source.respondents ?? [];
      return {
        id: normalized.id,
        content: normalized.content,
        sortOrder: normalized.sortOrder,
        responseCount: requireNonNegativeInteger(
          source.responseCount ?? source.voteCount ?? source.count ?? 0,
        ),
        respondents: requireArrayPayload(respondentsValue, [
          'content',
          'items',
          'respondents',
        ]).map((respondent) => {
          const item = requireRecord(respondent);
          return {
            userId: requireAliasedPositiveId(item, ['userId', 'id']),
            name: requireString(item.name, 200),
            email: requireString(item.email, 320),
          };
        }),
      };
    }),
  };
}

function parsePollCommentValue(value: unknown): PollComment {
  const record = requireRecord(value);
  return {
    commentId: requirePositiveId(record.commentId),
    pollId: requirePositiveId(record.pollId),
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    content: requireString(record.content, MAX_TEXT_LENGTH),
    deleted: requireBoolean(record.deleted),
    createdAt: requireDateTime(record.createdAt),
    updatedAt: requireDateTime(record.updatedAt),
  };
}

function parsePrayerMemberSummaryValue(value: unknown): PrayerMemberSummary {
  const record = requireRecord(value);
  return {
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    ...(record.email === undefined
      ? {}
      : {email: requireNullableString(record.email, 320)}),
    submissionId: requireNullablePositiveId(record.submissionId),
    content: requireNullableString(record.content),
    version: requireNonNegativeInteger(record.version),
    submittedAt: requireNullableDateTime(record.submittedAt),
    ...optionalBoolean(record, 'submitted'),
    ...optionalBoolean(record, 'editable'),
  };
}

function parsePrayerGroupSummaryValue(value: unknown): PrayerGroupSummary {
  const record = requireRecord(value);
  return {
    groupId: requirePositiveId(record.groupId),
    groupName: requireString(record.groupName, 200),
    ...(record.seasonId === undefined
      ? {}
      : {seasonId: requireNullablePositiveId(record.seasonId)}),
    sortOrder: requirePositiveInteger(record.sortOrder),
    members: requireArray(record.members, parsePrayerMemberSummaryValue),
  };
}

function parsePrayerWeekSeasonSummaryValue(
  value: unknown,
): PrayerWeekSeasonSummary {
  const record = requireRecord(value);
  return {
    seasonId: requirePositiveId(record.seasonId),
    name: requireString(record.name, 200),
    startDate: requireDate(record.startDate),
    ...optionalNullableDate(record, 'endDate'),
    ...(record.status === undefined
      ? {}
      : {status: requireOpenString(record.status) as PrayerSeasonStatus}),
  };
}

function optionalPrayerSeason(
  record: UnknownRecord,
  key: 'activeSeason' | 'currentSeason' | 'season',
): Partial<PrayerWeekSummary> {
  return record[key] === undefined
    ? {}
    : {
        [key]:
          record[key] === null
            ? null
            : parsePrayerWeekSeasonSummaryValue(record[key]),
      };
}

function parsePrayerWeekSummaryValue(value: unknown): PrayerWeekSummary {
  const record = requireRecord(value);
  return {
    campusId: requirePositiveId(record.campusId),
    weekStartDate: requireDate(record.weekStartDate),
    weekEndDate: requireDate(record.weekEndDate),
    status: requireOpenString(record.status),
    ...(record.myGroupId === undefined
      ? {}
      : {myGroupId: requireNullablePositiveId(record.myGroupId)}),
    ...(record.seasonId === undefined
      ? {}
      : {seasonId: requireNullablePositiveId(record.seasonId)}),
    ...(record.seasonName === undefined
      ? {}
      : {seasonName: requireNullableString(record.seasonName, 200)}),
    ...optionalNullableDate(record, 'seasonStartDate'),
    ...optionalNullableDate(record, 'seasonEndDate'),
    ...(record.seasonStatus === undefined
      ? {}
      : {seasonStatus: requireOpenString(record.seasonStatus) as PrayerSeasonStatus}),
    ...optionalNullableDate(record, 'endDate'),
    ...optionalPrayerSeason(record, 'activeSeason'),
    ...optionalPrayerSeason(record, 'currentSeason'),
    ...optionalPrayerSeason(record, 'season'),
    submittedCount: requireNonNegativeInteger(record.submittedCount),
    targetMemberCount: requireNonNegativeInteger(record.targetMemberCount),
    groups: requireArray(record.groups, parsePrayerGroupSummaryValue),
  };
}

function parseAdminPrayerSeasonValue(value: unknown): AdminPrayerSeason {
  const record = requireRecord(value);
  return {
    seasonId: requirePositiveId(record.seasonId),
    campusId: requirePositiveId(record.campusId),
    name: requireString(record.name, 200),
    startDate: requireDate(record.startDate),
    endDate: requireNullableDate(record.endDate),
    status: requireOpenString(record.status) as PrayerSeasonStatus,
  };
}

function parseAdminPrayerGroupValue(value: unknown): AdminPrayerGroup {
  const record = requireRecord(value);
  return {
    groupId: requirePositiveId(record.groupId),
    seasonId: requirePositiveId(record.seasonId),
    name: requireString(record.name, 200),
    sortOrder: requirePositiveInteger(record.sortOrder),
    active: requireBoolean(record.active),
    members: requireArray(record.members, (member) => {
      const source = requireRecord(member);
      return {
        userId: requirePositiveId(source.userId),
        name: requireString(source.name, 200),
        ...(source.email === undefined
          ? {}
          : {email: requireNullableString(source.email, 320)}),
      };
    }),
  };
}

function parseAdminPrayerAssignableMemberValue(
  value: unknown,
): AdminPrayerAssignableMember {
  const record = requireRecord(value);
  return {
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    assignedGroupId: requireNullablePositiveId(record.assignedGroupId),
    assignedGroupName: requireNullableString(record.assignedGroupName, 200),
    assignable: requireBoolean(record.assignable),
  };
}

function parseAdminDashboardSummaryValue(value: unknown): AdminDashboardSummary {
  const record = requireRecord(value);
  const campus = requireRecord(record.campus);
  const members = requireRecord(record.members);
  const devotion = requireRecord(record.devotion);
  const charges = requireRecord(record.charges);
  const polls = requireRecord(record.polls);
  return {
    campus: {
      campusId: requirePositiveId(campus.campusId),
      campusName: requireString(campus.campusName, 200),
      region: requireString(campus.region, 200),
    },
    members: {
      activeCount: requireNonNegativeInteger(members.activeCount),
      inactiveCount: requireNonNegativeInteger(members.inactiveCount),
      adminCount: requireNonNegativeInteger(members.adminCount),
    },
    devotion: {
      weekStartDate: requireDate(devotion.weekStartDate),
      submittedCount: requireNonNegativeInteger(devotion.submittedCount),
      missingCount: requireNonNegativeInteger(devotion.missingCount),
      submitRate: requireFiniteNumber(devotion.submitRate, 0, 100),
    },
    charges: {
      unpaidAmount: requireNonNegativeInteger(charges.unpaidAmount),
      unpaidMemberCount: requireNonNegativeInteger(charges.unpaidMemberCount),
      byCategory: requireArray(charges.byCategory, (item) => {
        const category = requireRecord(item);
        return {
          paymentCategory: requireEnum(category.paymentCategory, PAYMENT_CATEGORIES),
          unpaidAmount: requireNonNegativeInteger(category.unpaidAmount),
        };
      }),
    },
    polls: {
      openCount: requireNonNegativeInteger(polls.openCount),
      recentlyClosedCount: requireNonNegativeInteger(polls.recentlyClosedCount),
      missingResponseCount: requireNonNegativeInteger(polls.missingResponseCount),
      recentlyClosedDays: requireNonNegativeInteger(polls.recentlyClosedDays),
    },
  };
}

function parseAdminCampusMemberValue(value: unknown): AdminCampusMember {
  const record = requireRecord(value);
  return {
    membershipId: requirePositiveId(record.membershipId),
    campusId: requirePositiveId(record.campusId),
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    campusRole: requireEnum(record.campusRole, CAMPUS_ROLES),
    status: requireOpenString(record.status),
  };
}

function parseAdminCampusChargeSummaryValue(
  value: unknown,
): AdminCampusChargeSummary {
  const record = requireRecord(value);
  return {
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    summary: parseChargeAmountSummaryValue(record.summary),
    members: requireArray(record.members, (item) => {
      const member = requireRecord(item);
      return {
        ...parseChargeAmountSummaryValue(member),
        userId: requirePositiveId(member.userId),
        name: requireString(member.name, 200),
        email: requireString(member.email, 320),
      };
    }),
    page: requireNonNegativeInteger(record.page),
    size: requirePositiveId(record.size),
    totalElements: requireNonNegativeInteger(record.totalElements),
    totalPages: requireNonNegativeInteger(record.totalPages),
  };
}

function parseAdminMemberChargeListValue(value: unknown): AdminMemberChargeList {
  const record = requireRecord(value);
  const chargeList = parseChargeListValue(record);
  const items = chargeList.items.map((item) => {
    if (item.paymentCategory === 'MEAL') {
      throw new Error('MEAL charges are not part of generic admin billing.');
    }
    return item;
  });
  return {
    ...chargeList,
    items,
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
  };
}

function parseAdminMissingDevotionMemberValue(
  value: unknown,
): AdminMissingDevotionMember {
  const record = requireRecord(value);
  return {
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    campusMemberId: requirePositiveId(record.campusMemberId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
  };
}

function parseAdminNotificationResponseValue(
  value: unknown,
): AdminNotificationResponse {
  const record = requireRecord(value);
  return {
    notificationRequestId: requireString(record.notificationRequestId, 512),
    queuedCount: requireNonNegativeInteger(record.queuedCount),
    skippedCount: requireNonNegativeInteger(record.skippedCount),
  };
}

function parseAdminNotificationLogListValue(
  value: unknown,
): AdminNotificationLogList {
  const record = requireRecord(value);
  return {
    items: requireArray(record.items, (item) => {
      const log = requireRecord(item);
      return {
        notificationLogId: requirePositiveId(log.notificationLogId),
        requestId: requireString(log.requestId, 512),
        userId: requirePositiveId(log.userId),
        name: requireString(log.name, 200),
        email: requireString(log.email, 320),
        campusId: requirePositiveId(log.campusId),
        notificationType: requireEnum(log.notificationType, new Set(['CUSTOM'] as const)),
        targetWeekStartDate: requireNullableDate(log.targetWeekStartDate),
        targetId: requireNullablePositiveId(log.targetId),
        title: requireString(log.title, 500),
        body: requireString(log.body, MAX_TEXT_LENGTH),
        sendStatus: requireEnum(log.sendStatus, NOTIFICATION_SEND_STATUSES),
        failureReason: requireNullableString(log.failureReason, MAX_TEXT_LENGTH),
        sentAt: requireNullableDateTime(log.sentAt),
        createdAt: requireDateTime(log.createdAt),
      };
    }),
    page: requireNonNegativeInteger(record.page),
    size: requireNonNegativeInteger(record.size),
    totalElements: requireNonNegativeInteger(record.totalElements),
    totalPages: requireNonNegativeInteger(record.totalPages),
  };
}

function parseServiceAdminCampusSummaryValue(value: unknown) {
  const record = requireRecord(value);
  return {
    membershipId: requirePositiveId(record.membershipId),
    campusId: requirePositiveId(record.campusId),
    campusName: requireString(record.campusName, 200),
    region: requireString(record.region, 200),
    campusRole: requireEnum(record.campusRole, CAMPUS_ROLES),
    status: requireOpenString(record.status),
  };
}

function parseServiceAdminUserListValue(value: unknown): ServiceAdminUserList {
  const record = requireRecord(value);
  return {
    content: requireArray(record.content, (item) => {
      const user = requireRecord(item);
      return {
        userId: requirePositiveId(user.userId),
        name: requireString(user.name, 200),
        email: requireString(user.email, 320),
        role: requireEnum(user.role, USER_ROLES),
        campusCount: requireNonNegativeInteger(user.campusCount),
        campuses: requireArray(user.campuses, parseServiceAdminCampusSummaryValue),
      };
    }),
    page: requireNonNegativeInteger(record.page),
    size: requireNonNegativeInteger(record.size),
    totalElements: requireNonNegativeInteger(record.totalElements),
    totalPages: requireNonNegativeInteger(record.totalPages),
  };
}

function parseServiceAdminUserDetailValue(value: unknown): ServiceAdminUserDetail {
  const record = requireRecord(value);
  return {
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    role: requireEnum(record.role, USER_ROLES),
    isActive: requireBoolean(record.isActive),
    campuses: requireArray(record.campuses, parseServiceAdminCampusSummaryValue),
  };
}

function parseServiceAdminCampusListValue(value: unknown): ServiceAdminCampusList {
  const record = requireRecord(value);
  return {
    content: requireArray(record.content, (item) => {
      const campus = requireRecord(item);
      return {
        adminCount: requireNonNegativeInteger(campus.adminCount),
        campusId: requirePositiveId(campus.campusId),
        isActive: requireBoolean(campus.isActive),
        memberCount: requireNonNegativeInteger(campus.memberCount),
        name: requireString(campus.name, 200),
        region: requireString(campus.region, 200),
        status: requireEnum(campus.status, CAMPUS_OPERATION_STATUSES),
      };
    }),
    page: requireNonNegativeInteger(record.page),
    size: requireNonNegativeInteger(record.size),
    totalElements: requireNonNegativeInteger(record.totalElements),
    totalPages: requireNonNegativeInteger(record.totalPages),
  };
}

function parseDutyAssignmentValue(value: unknown): DutyAssignment {
  const record = requireRecord(value);
  return {
    assignmentId: requirePositiveId(record.assignmentId),
    campusId: requirePositiveId(record.campusId),
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
    dutyType: requireEnum(record.dutyType, DUTY_TYPES),
    isActive: requireBoolean(record.isActive),
    assignedAt: requireDateTime(record.assignedAt),
  };
}

function parseAdminPollTemplateValue(value: unknown): AdminPollTemplate {
  const record = requireRecord(value);
  return {
    id: requirePositiveId(record.id),
    campusId: requirePositiveId(record.campusId),
    title: requireString(record.title, 500),
    pollType: requireOpenString(record.pollType),
    selectionType: requireOpenString(record.selectionType),
    chargeGenerationType: requireOpenString(record.chargeGenerationType),
    paymentCategory:
      record.paymentCategory === null
        ? null
        : requireEnum(record.paymentCategory, PAYMENT_CATEGORIES),
    paymentAccountId: requireNullablePositiveId(record.paymentAccountId),
    autoCreateEnabled: requireBoolean(record.autoCreateEnabled),
    startDayOfWeek: requireDayOfWeek(record.startDayOfWeek),
    startTime: requireLocalTime(record.startTime),
    endDayOfWeek: requireDayOfWeek(record.endDayOfWeek),
    endTime: requireLocalTime(record.endTime),
    isDefault: requireBoolean(record.isDefault),
    isActive: requireBoolean(record.isActive),
    options: requireArray(record.options, parsePollOptionValue),
  };
}

function parseAdminPollValue(value: unknown): AdminPoll {
  const record = requireRecord(value);
  if (record.createdByUserId !== undefined) {
    return invalidResponse();
  }
  return {
    id: requirePositiveId(record.id),
    campusId: requirePositiveId(record.campusId),
    templateId: requireNullablePositiveId(record.templateId),
    title: requireString(record.title, 500),
    pollType: requireOpenString(record.pollType),
    selectionType: requireOpenString(record.selectionType),
    isAnonymous: requireBoolean(record.isAnonymous),
    ...optionalBoolean(record, 'allowUserOptionAdd'),
    chargeGenerationType: requireOpenString(record.chargeGenerationType),
    paymentCategory:
      record.paymentCategory === null
        ? null
        : requireEnum(record.paymentCategory, PAYMENT_CATEGORIES),
    paymentAccountId: requireNullablePositiveId(record.paymentAccountId),
    startsAt: requireDateTime(record.startsAt),
    endsAt: requireDateTime(record.endsAt),
    status: requireOpenString(record.status),
    options: requireArray(record.options, parsePollOptionValue),
  };
}

function parseAdminPollMissingMemberValue(
  value: unknown,
): AdminPollMissingMember {
  const record = requireRecord(value);
  return {
    userId: requirePositiveId(record.userId),
    name: requireString(record.name, 200),
    email: requireString(record.email, 320),
  };
}

export function parseNullResponse(value: unknown): null {
  return parseSafely(() =>
    value === null || value === undefined ? null : invalidResponse(),
  );
}

export function parseTokenPair(value: unknown): TokenPair {
  return parseSafely(() => parseTokenPairValue(value));
}

export function parseLoginResponse(value: unknown): LoginResponse {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {...parseTokenPairValue(record), user: parseCurrentUserValue(record.user)};
  });
}

export function parseSignupResponse(value: unknown): SignupResponse {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      id: requirePositiveId(record.id),
      name: requireString(record.name, 200),
      email: requireString(record.email, 320),
      role: requireEnum(record.role, USER_ROLES),
      isActive: requireBoolean(record.isActive),
    };
  });
}

export function parseDeleteAccountResponse(value: unknown): DeleteAccountResponse {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {deletedAt: requireDateTime(record.deletedAt)};
  });
}

export function parseFcmTokenRegisterResponse(
  value: unknown,
): FcmTokenRegisterResponse {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      tokenId: requirePositiveId(record.tokenId),
      deviceType: requireEnum(record.deviceType, FCM_DEVICE_TYPES),
      clientInstanceId: requireString(record.clientInstanceId, 512),
      appVersion: requireString(record.appVersion, 128),
      isActive: requireBoolean(record.isActive),
      lastSeenAt: requireDateTime(record.lastSeenAt),
      lastRefreshedAt: requireDateTime(record.lastRefreshedAt),
    };
  });
}

export function parseCurrentUser(value: unknown): CurrentUser {
  return parseSafely(() => parseCurrentUserValue(value));
}

export function parseCampusMembershipSummary(
  value: unknown,
): CampusMembershipSummary {
  return parseSafely(() => parseCampusMembershipSummaryValue(value));
}

export function parseCampusMembershipSummaries(
  value: unknown,
): CampusMembershipSummary[] {
  return parseSafely(() => requireArray(value, parseCampusMembershipSummaryValue));
}

export function parseCampusCreateResponse(value: unknown): CampusCreateResponse {
  return parseSafely(() => parseCampusCreateResponseValue(value));
}

export function parseCampusDetail(value: unknown): CampusDetail {
  return parseSafely(() => parseCampusDetailValue(value));
}

export function parseWeeklyDevotionSummary(value: unknown): WeeklyDevotionSummary {
  return parseSafely(() => parseWeeklyDevotionSummaryValue(value));
}

export function parseDevotionDailyCheckSaveResponse(
  value: unknown,
): DevotionDailyCheckSaveResponse {
  return parseSafely(() => parseDevotionDailyCheckSaveResponseValue(value));
}

export function parseDevotionMonthlySummary(value: unknown): DevotionMonthlySummary {
  return parseSafely(() => parseDevotionMonthlySummaryValue(value));
}

export function parseChargeSummary(value: unknown): ChargeSummary {
  return parseSafely(() => parseChargeSummaryValue(value));
}

export function parseChargeList(value: unknown): ChargeList {
  return parseSafely(() => parseChargeListValue(value));
}

export function parsePaymentAccounts(value: unknown): PaymentAccount[] {
  return parseSafely(() => requireArray(value, parsePaymentAccountValue));
}

export function parseMyDutyAssignment(value: unknown): MyDutyAssignment {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      userId: requirePositiveId(record.userId),
      campusId: requirePositiveId(record.campusId),
      dutyType: requireEnum(record.dutyType, DUTY_TYPES),
      isActive: requireBoolean(record.isActive),
    };
  });
}

export function parseAdminPaymentAccount(value: unknown): AdminPaymentAccount {
  return parseSafely(() => parseAdminPaymentAccountValue(value));
}

export function parsePenaltyRules(value: unknown): PenaltyRule[] {
  return parseSafely(() => requireArray(value, parsePenaltyRuleValue));
}

export function parsePenaltyRule(value: unknown): PenaltyRule {
  return parseSafely(() => parsePenaltyRuleValue(value));
}

export function parseMarkChargePaidResponse(value: unknown): MarkChargePaidResponse {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      ...parseChargeMutationValue(record),
      paidAt: requireNullableDateTime(record.paidAt),
    } as MarkChargePaidResponse;
  });
}

export function parseCoffeeBrands(value: unknown): CoffeeBrand[] {
  return parseSafely(() => requireArray(value, parseCoffeeBrandValue));
}

export function parseCoffeeMenus(value: unknown): CoffeeMenu[] {
  return parseSafely(() => requireArray(value, parseCoffeeMenuValue));
}

export function parsePollSummaryList(value: unknown): PollSummary[] {
  return parseSafely(() =>
    requireArrayPayload(value, ['content', 'items', 'polls']).map(
      parsePollSummaryValue,
    ),
  );
}

export function parsePollDetail(value: unknown): PollDetail {
  return parseSafely(() => parsePollDetailValue(value));
}

export function parsePollResponse(value: unknown): PollResponse {
  return parseSafely(() => parsePollResponseValue(value));
}

export function parsePollOption(value: unknown): PollOption {
  return parseSafely(() => parsePollOptionValue(value));
}

export function parsePollResults(value: unknown): PollResults {
  return parseSafely(() => parsePollResultsValue(value));
}

export function parsePollComments(value: unknown): PollComment[] {
  return parseSafely(() => requireArray(value, parsePollCommentValue));
}

export function parsePollComment(value: unknown): PollComment {
  return parseSafely(() => parsePollCommentValue(value));
}

export function parsePrayerWeekSummary(value: unknown): PrayerWeekSummary {
  return parseSafely(() => parsePrayerWeekSummaryValue(value));
}

export function parseAdminPrayerSeason(value: unknown): AdminPrayerSeason {
  return parseSafely(() => parseAdminPrayerSeasonValue(value));
}

export function parseNullableAdminPrayerSeason(
  value: unknown,
): AdminPrayerSeason | null {
  return parseSafely(() =>
    value === null || value === undefined
      ? null
      : parseAdminPrayerSeasonValue(value),
  );
}

export function parseAdminPrayerGroups(value: unknown): AdminPrayerGroup[] {
  return parseSafely(() => requireArray(value, parseAdminPrayerGroupValue));
}

export function parseAdminPrayerGroup(value: unknown): AdminPrayerGroup {
  return parseSafely(() => parseAdminPrayerGroupValue(value));
}

export function parseAdminPrayerAssignableMembers(
  value: unknown,
): AdminPrayerAssignableMember[] {
  return parseSafely(() =>
    requireArray(value, parseAdminPrayerAssignableMemberValue),
  );
}

export function parseAdminDashboardSummary(value: unknown): AdminDashboardSummary {
  return parseSafely(() => parseAdminDashboardSummaryValue(value));
}

export function parseAdminCampusMembers(value: unknown): AdminCampusMember[] {
  return parseSafely(() => requireArray(value, parseAdminCampusMemberValue));
}

export function parseAdminCampusMember(value: unknown): AdminCampusMember {
  return parseSafely(() => parseAdminCampusMemberValue(value));
}

export function parseAdminCampusChargeSummary(
  value: unknown,
): AdminCampusChargeSummary {
  return parseSafely(() => parseAdminCampusChargeSummaryValue(value));
}

export function parseAdminMemberChargeList(value: unknown): AdminMemberChargeList {
  return parseSafely(() => parseAdminMemberChargeListValue(value));
}

export function parseAdminChargeStatusChangeResponse(
  value: unknown,
): AdminChargeStatusChangeResponse {
  return parseSafely(() => {
    const record = requireRecord(value);
    const response = parseChargeMutationValue(record);
    if (response.paymentCategory === 'MEAL') {
      throw new Error('MEAL charges are not part of generic admin billing.');
    }

    return response.status === 'PAID'
      ? {...response, paidAt: requireDateTime(record.paidAt)}
      : response;
  });
}

export function parseAdminMissingDevotionMembers(
  value: unknown,
): AdminMissingDevotionMember[] {
  return parseSafely(() => requireArray(value, parseAdminMissingDevotionMemberValue));
}

export function parseAdminNotificationLogList(
  value: unknown,
): AdminNotificationLogList {
  return parseSafely(() => parseAdminNotificationLogListValue(value));
}

export function parseAdminNotificationResponse(
  value: unknown,
): AdminNotificationResponse {
  return parseSafely(() => parseAdminNotificationResponseValue(value));
}

export function parseServiceAdminUserList(value: unknown): ServiceAdminUserList {
  return parseSafely(() => parseServiceAdminUserListValue(value));
}

export function parseServiceAdminUserDetail(
  value: unknown,
): ServiceAdminUserDetail {
  return parseSafely(() => parseServiceAdminUserDetailValue(value));
}

export function parseServiceAdminCampusList(
  value: unknown,
): ServiceAdminCampusList {
  return parseSafely(() => parseServiceAdminCampusListValue(value));
}

export function parseServiceAdminCampusMemberAddResponse(
  value: unknown,
): ServiceAdminCampusMemberAddResponse {
  return parseSafely(() => parseAdminCampusMemberValue(value));
}

export function parseDutyAssignments(value: unknown): DutyAssignment[] {
  return parseSafely(() => requireArray(value, parseDutyAssignmentValue));
}

export function parseDutyAssignment(value: unknown): DutyAssignment {
  return parseSafely(() => parseDutyAssignmentValue(value));
}

export function parseAdminPollTemplates(value: unknown): AdminPollTemplate[] {
  return parseSafely(() => requireArray(value, parseAdminPollTemplateValue));
}

export function parseAdminPollTemplate(value: unknown): AdminPollTemplate {
  return parseSafely(() => parseAdminPollTemplateValue(value));
}

export function parseAdminPoll(value: unknown): AdminPoll {
  return parseSafely(() => parseAdminPollValue(value));
}

export function parseAdminPollMissingMembers(
  value: unknown,
): AdminPollMissingMember[] {
  return parseSafely(() => requireArray(value, parseAdminPollMissingMemberValue));
}
