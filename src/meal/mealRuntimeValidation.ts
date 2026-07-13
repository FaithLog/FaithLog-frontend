import type {
  MealAccountSettlement,
  MealCalculationType,
  MealChargeGroupResult,
  MealChargeResult,
  MealCharged,
  MealDutyAssignment,
  MealPaymentAccount,
  MealPollDetail,
  MealPollList,
  MealPollOptionDetail,
  MealPollStatus,
  MealPollSummary,
  MealSettlement,
  MealSettlementCharge,
  MealSettlementStatus,
  MealSettlementSummary,
} from './mealTypes';

type UnknownRecord = Record<string, unknown>;

const INVALID_RESPONSE_MESSAGE = 'Invalid API response.';
const pollStatuses = new Set<MealPollStatus>(['SCHEDULED', 'OPEN', 'CLOSED']);
const settlementStatuses = new Set<MealSettlementStatus>(['NOT_CHARGED', 'CHARGED']);
const calculationTypes = new Set<MealCalculationType>(['PER_MEMBER', 'GROUP_TOTAL']);
const chargeStatuses = new Set(['UNPAID', 'PAID', 'WAIVED', 'CANCELED'] as const);

export function parseMyMealDutyAssignment(value: unknown): MealDutyAssignment {
  return parseSafely(() => {
    const duty = parseMealDuty(value, false);
    if (!duty.isActive) invalidResponse();
    return duty;
  });
}

export function parseMealDutyAssignment(value: unknown): MealDutyAssignment {
  return parseSafely(() => parseMealDuty(value, true));
}

export function parseMealPaymentAccounts(value: unknown): MealPaymentAccount[] {
  return parseSafely(() => requireArray(value).map(parseMealPaymentAccount));
}

export function parseMealPaymentAccountResponse(value: unknown): MealPaymentAccount {
  return parseSafely(() => parseMealPaymentAccount(value));
}

export function parseMealPollList(value: unknown): MealPollList {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      content: requireArray(record.content).map(parseMealPollSummary),
      page: requireNonNegativeInteger(record.page),
      size: requireNonNegativeInteger(record.size),
      totalElements: requireNonNegativeInteger(record.totalElements),
      totalPages: requireNonNegativeInteger(record.totalPages),
    };
  });
}

export function parseMealPollDetail(value: unknown): MealPollDetail {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      ...parseMealPollSummary(record),
      options: requireArray(record.options).map(parseMealPollOption),
    };
  });
}

export function parseCreatedMealPollDetail(value: unknown): MealPollDetail {
  return parseSafely(() => {
    const detail = parseMealPollDetail(value);
    if (detail.status !== 'OPEN') invalidResponse();
    return detail;
  });
}

export function parseClosedMealPollDetail(value: unknown): MealPollDetail {
  return parseSafely(() => {
    const detail = parseMealPollDetail(value);
    if (detail.status !== 'CLOSED') invalidResponse();
    return detail;
  });
}

export function parseMealChargeResult(value: unknown): MealChargeResult {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      pollId: requirePositiveId(record.pollId),
      paymentAccountId: requirePositiveId(record.paymentAccountId),
      chargedMemberCount: requireNonNegativeInteger(record.chargedMemberCount),
      requestedTotalAmount: requireNonNegativeInteger(record.requestedTotalAmount),
      actualTotalAmount: requireNonNegativeInteger(record.actualTotalAmount),
      roundingAdjustment: requireNonNegativeInteger(record.roundingAdjustment),
      chargedAt: requireDateTime(record.chargedAt),
      groups: requireArray(record.groups).map(parseMealChargeGroupResult),
    };
  });
}

export function parseMealSettlement(value: unknown): MealSettlement {
  return parseSafely(() => {
    const record = requireRecord(value);
    return {
      accounts: requireArray(record.accounts).map(parseAccountSettlement),
      summary: parseSettlementSummary(record.summary),
    };
  });
}

export function parseNull(value: unknown): null {
  if (value !== null && value !== undefined) {
    invalidResponse();
  }
  return null;
}

function parseMealDuty(value: unknown, includeIdentity: boolean): MealDutyAssignment {
  const record = requireRecord(value);
  if (record.dutyType !== 'MEAL') invalidResponse();

  const name = includeIdentity ? requireString(record.name) : optionalString(record.name);
  const email = includeIdentity ? requireString(record.email) : optionalString(record.email);

  return {
    assignmentId: requirePositiveId(record.assignmentId),
    campusId: requirePositiveId(record.campusId),
    userId: requirePositiveId(record.userId),
    dutyType: 'MEAL',
    isActive: requireBoolean(record.isActive),
    ...(name === undefined ? {} : {name}),
    ...(email === undefined ? {} : {email}),
    ...(record.assignedAt === undefined ? {} : {assignedAt: requireDateTime(record.assignedAt)}),
  };
}

function parseMealPaymentAccount(value: unknown): MealPaymentAccount {
  const record = requireRecord(value);
  if (record.accountType !== 'MEAL') invalidResponse();

  return {
    id: requirePositiveId(record.id),
    campusId: requirePositiveId(record.campusId),
    ownerUserId: requirePositiveId(record.ownerUserId),
    accountType: 'MEAL',
    nickname: requireString(record.nickname),
    bankName: requireString(record.bankName),
    accountNumber: requireString(record.accountNumber),
    accountHolder: requireString(record.accountHolder),
    isActive: requireBoolean(record.isActive),
    createdAt: requireDateTime(record.createdAt),
    deactivatedAt: requireNullableDateTime(record.deactivatedAt),
  };
}

function parseMealPollSummary(value: unknown): MealPollSummary {
  const record = requireRecord(value);
  if (record.pollType !== 'MEAL' || record.selectionType !== 'SINGLE') invalidResponse();

  return {
    id: requirePositiveId(record.id),
    campusId: requirePositiveId(record.campusId),
    title: requireString(record.title),
    description: requireNullableString(record.description),
    pollType: 'MEAL',
    selectionType: 'SINGLE',
    allowUserOptionAdd: requireBoolean(record.allowUserOptionAdd),
    startsAt: requireDateTime(record.startsAt),
    endsAt: requireDateTime(record.endsAt),
    status: requireEnum(record.status, pollStatuses),
    settlementStatus: requireEnum(record.settlementStatus, settlementStatuses),
    totalResponseCount: requireNonNegativeInteger(record.totalResponseCount),
  };
}

function parseMealPollOption(value: unknown): MealPollOptionDetail {
  const record = requireRecord(value);
  const chargeRecord = requireRecord(record.charge);
  const chargeStatus = chargeRecord.chargeStatus;

  if (chargeStatus !== 'NOT_CHARGED' && chargeStatus !== 'CHARGED') invalidResponse();

  return {
    optionId: requirePositiveId(record.optionId),
    content: requireString(record.content),
    responseCount: requireNonNegativeInteger(record.responseCount),
    userAdded: requireBoolean(record.userAdded),
    charge:
      chargeStatus === 'NOT_CHARGED'
        ? {chargeStatus}
        : parseCharged(chargeRecord),
  };
}

function parseCharged(record: UnknownRecord): MealCharged {
  const chargedByMe = requireBoolean(record.chargedByMe);
  const paymentAccountId = requireNullablePositiveId(record.paymentAccountId);
  if (chargedByMe ? paymentAccountId === null : paymentAccountId !== null) invalidResponse();

  return {
    chargeStatus: 'CHARGED',
    calculationType: requireEnum(record.calculationType, calculationTypes),
    enteredAmount: requirePositiveId(record.enteredAmount),
    amountPerMember: requirePositiveId(record.amountPerMember),
    requestedTotalAmount: requirePositiveId(record.requestedTotalAmount),
    actualTotalAmount: requirePositiveId(record.actualTotalAmount),
    roundingAdjustment: requireNonNegativeInteger(record.roundingAdjustment),
    chargedMemberCount: requirePositiveId(record.chargedMemberCount),
    paymentAccountId,
    chargedByMe,
    chargedAt: requireDateTime(record.chargedAt),
  };
}

function parseMealChargeGroupResult(value: unknown): MealChargeGroupResult {
  const record = requireRecord(value);
  return {
    optionId: requirePositiveId(record.optionId),
    calculationType: requireEnum(record.calculationType, calculationTypes),
    responseCount: requirePositiveId(record.responseCount),
    enteredAmount: requirePositiveId(record.enteredAmount),
    amountPerMember: requirePositiveId(record.amountPerMember),
    requestedTotalAmount: requirePositiveId(record.requestedTotalAmount),
    actualTotalAmount: requirePositiveId(record.actualTotalAmount),
    roundingAdjustment: requireNonNegativeInteger(record.roundingAdjustment),
  };
}

function parseSettlementSummary(value: unknown): MealSettlementSummary {
  const record = requireRecord(value);
  return {
    chargedMemberCount: requireNonNegativeInteger(record.chargedMemberCount),
    requestedTotalAmount: requireNonNegativeInteger(record.requestedTotalAmount),
    actualTotalAmount: requireNonNegativeInteger(record.actualTotalAmount),
    roundingAdjustment: requireNonNegativeInteger(record.roundingAdjustment),
  };
}

function parseAccountSettlement(value: unknown): MealAccountSettlement {
  const record = requireRecord(value);
  return {
    account: parseMealPaymentAccount(record.account),
    summary: parseSettlementSummary(record.summary),
    charges: requireArray(record.charges).map(parseSettlementCharge),
  };
}

function parseSettlementCharge(value: unknown): MealSettlementCharge {
  const record = requireRecord(value);
  return {
    chargeId: requirePositiveId(record.chargeId),
    pollId: requirePositiveId(record.pollId),
    pollTitle: requireString(record.pollTitle),
    optionContent: requireString(record.optionContent),
    memberName: requireString(record.memberName),
    amount: requirePositiveId(record.amount),
    status: requireEnum(record.status, chargeStatuses),
    chargedAt: requireDateTime(record.chargedAt),
  };
}

function parseSafely<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    return invalidResponse();
  }
}

function invalidResponse(): never {
  throw new Error(INVALID_RESPONSE_MESSAGE);
}

function requireRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidResponse();
  return value as UnknownRecord;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) invalidResponse();
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalidResponse();
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : requireString(value);
}

function requireNullableString(value: unknown): string | null {
  return value === null ? null : requireString(value);
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalidResponse();
  return value;
}

function requirePositiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) invalidResponse();
  return value;
}

function requireNullablePositiveId(value: unknown): number | null {
  return value === null || value === undefined ? null : requirePositiveId(value);
}

function requireNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalidResponse();
  return value;
}

function requireDateTime(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) invalidResponse();
  return value;
}

function requireNullableDateTime(value: unknown): string | null {
  return value === null ? null : requireDateTime(value);
}

function requireEnum<T extends string>(value: unknown, values: Set<T>): T {
  if (typeof value !== 'string' || !values.has(value as T)) invalidResponse();
  return value as T;
}
