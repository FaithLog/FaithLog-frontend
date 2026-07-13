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

export class InvalidServerResponseError extends Error {
  readonly code = 'INVALID_SERVER_RESPONSE';

  constructor() {
    super(INVALID_RESPONSE_MESSAGE);
  }
}

export function parseMyMealDutyAssignment(value: unknown): MealDutyAssignment {
  return parseSafely(() => {
    const duty = parseMealDuty(value, false);
    if (!duty.isActive) invalidResponse();
    return duty;
  });
}

export function parseMyMealDutyAssignmentForContext(
  value: unknown,
  context: {campusId: number; userId: number},
): MealDutyAssignment {
  return parseSafely(() => {
    const duty = parseMyMealDutyAssignment(value);
    if (duty.campusId !== context.campusId || duty.userId !== context.userId) invalidResponse();
    return duty;
  });
}

export function parseMealDutyAssignment(value: unknown): MealDutyAssignment {
  return parseSafely(() => parseMealDuty(value, true));
}

export function parseMealDutyAssignmentForContext(
  value: unknown,
  context: {campusId: number; userId: number},
): MealDutyAssignment {
  return parseSafely(() => {
    const duty = parseMealDutyAssignment(value);
    if (
      duty.campusId !== context.campusId ||
      duty.userId !== context.userId ||
      !duty.isActive
    ) {
      invalidResponse();
    }
    return duty;
  });
}

export function parseMealPaymentAccounts(value: unknown): MealPaymentAccount[] {
  return parseSafely(() => {
    const accounts = requireArray(value).map(parseMealPaymentAccount);
    requireUniqueNumbers(accounts.map((account) => account.id));
    return accounts;
  });
}

export function parseMealPaymentAccountsForContext(
  value: unknown,
  context: {campusId: number; ownerUserId: number},
): MealPaymentAccount[] {
  return parseSafely(() => {
    const accounts = parseMealPaymentAccounts(value);
    if (accounts.some((account) => !isOwnedAccount(account, context))) invalidResponse();
    return accounts;
  });
}

export function parseMealPaymentAccountResponse(value: unknown): MealPaymentAccount {
  return parseSafely(() => parseMealPaymentAccount(value));
}

export function parseMealPaymentAccountForContext(
  value: unknown,
  context: {accountId?: number; campusId: number; ownerUserId: number},
): MealPaymentAccount {
  return parseSafely(() => {
    const account = parseMealPaymentAccountResponse(value);
    if (
      !isOwnedAccount(account, context) ||
      (context.accountId !== undefined && account.id !== context.accountId)
    ) {
      invalidResponse();
    }
    return account;
  });
}

export function parseMealPollList(value: unknown): MealPollList {
  return parseSafely(() => {
    const record = requireRecord(value);
    const list = {
      content: requireArray(record.content).map(parseMealPollSummary),
      page: requireNonNegativeInteger(record.page),
      size: requireNonNegativeInteger(record.size),
      totalElements: requireNonNegativeInteger(record.totalElements),
      totalPages: requireNonNegativeInteger(record.totalPages),
    };
    requireUniqueNumbers(list.content.map((poll) => poll.id));
    if (list.size === 0) invalidResponse();
    const expectedTotalPages = list.totalElements === 0
      ? 0
      : Math.ceil(list.totalElements / list.size);
    if (list.totalPages !== expectedTotalPages) invalidResponse();
    if (list.totalElements === 0) {
      if (list.page !== 0 || list.content.length !== 0) invalidResponse();
      return list;
    }
    if (list.page >= list.totalPages || list.page > Math.floor(Number.MAX_SAFE_INTEGER / list.size)) {
      invalidResponse();
    }
    const pageOffset = list.page * list.size;
    const expectedContentLength = Math.min(list.size, list.totalElements - pageOffset);
    if (expectedContentLength <= 0 || list.content.length !== expectedContentLength) {
      invalidResponse();
    }
    return list;
  });
}

export function parseMealPollListForContext(
  value: unknown,
  context: {campusId: number; page: number; size: number; status?: MealPollStatus},
): MealPollList {
  return parseSafely(() => {
    const list = parseMealPollList(value);
    if (
      list.page !== context.page ||
      list.size !== context.size ||
      list.content.some((poll) =>
        poll.campusId !== context.campusId ||
        (context.status !== undefined && poll.status !== context.status))
    ) {
      invalidResponse();
    }
    return list;
  });
}

export function parseMealPollDetail(value: unknown): MealPollDetail {
  return parseSafely(() => {
    const record = requireRecord(value);
    const detail: MealPollDetail = {
      ...parseMealPollSummary(record),
      options: requireArray(record.options).map(parseMealPollOption),
    };
    validateMealPollDetailSemantics(detail);
    return detail;
  });
}

export function parseMealPollDetailForContext(
  value: unknown,
  context: {campusId: number; pollId: number},
): MealPollDetail {
  return parseSafely(() => {
    const detail = parseMealPollDetail(value);
    if (detail.campusId !== context.campusId || detail.id !== context.pollId) invalidResponse();
    return detail;
  });
}

export function parseCreatedMealPollDetail(value: unknown): MealPollDetail {
  return parseSafely(() => {
    const detail = parseMealPollDetail(value);
    if (detail.status !== 'OPEN') invalidResponse();
    return detail;
  });
}

export function parseCreatedMealPollDetailForContext(
  value: unknown,
  context: {campusId: number},
): MealPollDetail {
  return parseSafely(() => {
    const detail = parseCreatedMealPollDetail(value);
    if (detail.campusId !== context.campusId) invalidResponse();
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

export function parseClosedMealPollDetailForContext(
  value: unknown,
  context: {campusId: number; pollId: number},
): MealPollDetail {
  return parseSafely(() => {
    const detail = parseClosedMealPollDetail(value);
    if (detail.campusId !== context.campusId || detail.id !== context.pollId) invalidResponse();
    return detail;
  });
}

export function parseMealChargeResult(value: unknown): MealChargeResult {
  return parseSafely(() => {
    const record = requireRecord(value);
    const result: MealChargeResult = {
      pollId: requirePositiveId(record.pollId),
      paymentAccountId: requirePositiveId(record.paymentAccountId),
      chargedMemberCount: requireNonNegativeInteger(record.chargedMemberCount),
      requestedTotalAmount: requireNonNegativeInteger(record.requestedTotalAmount),
      actualTotalAmount: requireNonNegativeInteger(record.actualTotalAmount),
      roundingAdjustment: requireNonNegativeInteger(record.roundingAdjustment),
      chargedAt: requireDateTime(record.chargedAt),
      groups: requireArray(record.groups).map(parseMealChargeGroupResult),
    };
    validateMealChargeResultSemantics(result);
    return result;
  });
}

export function parseMealChargeResultForContext(
  value: unknown,
  context: {
    groups: Array<{calculationType: MealCalculationType; enteredAmount: number; optionId: number}>;
    paymentAccountId: number;
    pollId: number;
  },
): MealChargeResult {
  return parseSafely(() => {
    const result = parseMealChargeResult(value);
    if (
      result.pollId !== context.pollId ||
      result.paymentAccountId !== context.paymentAccountId ||
      result.groups.length !== context.groups.length
    ) {
      invalidResponse();
    }
    const requestedGroups = new Map(context.groups.map((group) => [group.optionId, group]));
    for (const group of result.groups) {
      const requested = requestedGroups.get(group.optionId);
      if (
        !requested ||
        group.calculationType !== requested.calculationType ||
        group.enteredAmount !== requested.enteredAmount
      ) {
        invalidResponse();
      }
    }
    return result;
  });
}

export function parseMealSettlement(value: unknown): MealSettlement {
  return parseSafely(() => {
    const record = requireRecord(value);
    const settlement: MealSettlement = {
      accounts: requireArray(record.accounts).map(parseAccountSettlement),
      summary: parseSettlementSummary(record.summary),
    };
    validateMealSettlementSemantics(settlement);
    return settlement;
  });
}

export function parseMealSettlementForContext(
  value: unknown,
  context: {campusId: number; ownerUserId: number},
): MealSettlement {
  return parseSafely(() => {
    const settlement = parseMealSettlement(value);
    if (settlement.accounts.some((item) => !isOwnedAccount(item.account, context))) {
      invalidResponse();
    }
    return settlement;
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

function isOwnedAccount(
  account: MealPaymentAccount,
  context: {campusId: number; ownerUserId: number},
) {
  return account.campusId === context.campusId && account.ownerUserId === context.ownerUserId;
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
  const responseCount = requireNonNegativeInteger(record.responseCount);

  if (chargeStatus !== 'NOT_CHARGED' && chargeStatus !== 'CHARGED') invalidResponse();

  return {
    optionId: requirePositiveId(record.optionId),
    content: requireString(record.content),
    responseCount,
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

function validateMealPollDetailSemantics(detail: MealPollDetail) {
  requireUniqueNumbers(detail.options.map((option) => option.optionId));
  const totalResponseCount = safeSum(detail.options.map((option) => option.responseCount));
  if (totalResponseCount !== detail.totalResponseCount) invalidResponse();

  const respondingOptions = detail.options.filter((option) => option.responseCount > 0);
  if (detail.settlementStatus === 'CHARGED' && respondingOptions.length === 0) invalidResponse();

  for (const option of respondingOptions) {
    if (
      detail.settlementStatus === 'NOT_CHARGED' &&
      option.charge.chargeStatus !== 'NOT_CHARGED'
    ) {
      invalidResponse();
    }
    if (
      detail.settlementStatus === 'CHARGED' &&
      option.charge.chargeStatus !== 'CHARGED'
    ) {
      invalidResponse();
    }
    if (option.charge.chargeStatus === 'CHARGED') {
      if (option.charge.chargedMemberCount !== option.responseCount) invalidResponse();
      validateMealChargeArithmetic(
        option.charge.calculationType,
        option.charge.enteredAmount,
        option.responseCount,
        option.charge.amountPerMember,
        option.charge.requestedTotalAmount,
        option.charge.actualTotalAmount,
        option.charge.roundingAdjustment,
      );
    }
  }
}

function validateMealChargeResultSemantics(result: MealChargeResult) {
  requireUniqueNumbers(result.groups.map((group) => group.optionId));
  for (const group of result.groups) {
    validateMealChargeArithmetic(
      group.calculationType,
      group.enteredAmount,
      group.responseCount,
      group.amountPerMember,
      group.requestedTotalAmount,
      group.actualTotalAmount,
      group.roundingAdjustment,
    );
  }
  if (safeSum(result.groups.map((group) => group.responseCount)) !== result.chargedMemberCount) {
    invalidResponse();
  }
  if (safeSum(result.groups.map((group) => group.requestedTotalAmount)) !== result.requestedTotalAmount) {
    invalidResponse();
  }
  if (safeSum(result.groups.map((group) => group.actualTotalAmount)) !== result.actualTotalAmount) {
    invalidResponse();
  }
  if (safeSum(result.groups.map((group) => group.roundingAdjustment)) !== result.roundingAdjustment) {
    invalidResponse();
  }
}

function validateMealSettlementSemantics(settlement: MealSettlement) {
  requireUniqueNumbers(settlement.accounts.map((item) => item.account.id));
  const chargeIds = settlement.accounts.flatMap((item) => item.charges.map((charge) => charge.chargeId));
  if (chargeIds.length > 1000) invalidResponse();
  requireUniqueNumbers(chargeIds);

  for (const item of settlement.accounts) {
    validateSettlementSummary(item.summary);
    if (item.summary.chargedMemberCount !== item.charges.length) invalidResponse();
    if (safeSum(item.charges.map((charge) => charge.amount)) !== item.summary.actualTotalAmount) {
      invalidResponse();
    }
  }

  validateSettlementSummary(settlement.summary);
  for (const key of [
    'chargedMemberCount',
    'requestedTotalAmount',
    'actualTotalAmount',
    'roundingAdjustment',
  ] as const) {
    if (safeSum(settlement.accounts.map((item) => item.summary[key])) !== settlement.summary[key]) {
      invalidResponse();
    }
  }
}

function validateSettlementSummary(summary: MealSettlementSummary) {
  if (safeAdd(summary.requestedTotalAmount, summary.roundingAdjustment) !== summary.actualTotalAmount) {
    invalidResponse();
  }
}

function validateMealChargeArithmetic(
  calculationType: MealCalculationType,
  enteredAmount: number,
  responseCount: number,
  amountPerMember: number,
  requestedTotalAmount: number,
  actualTotalAmount: number,
  roundingAdjustment: number,
) {
  const expectedPerMember = calculationType === 'PER_MEMBER'
    ? enteredAmount
    : Math.floor(enteredAmount / responseCount) + (enteredAmount % responseCount === 0 ? 0 : 1);
  const expectedRequested = calculationType === 'PER_MEMBER'
    ? safeMultiply(enteredAmount, responseCount)
    : enteredAmount;
  const expectedActual = safeMultiply(expectedPerMember, responseCount);
  const expectedAdjustment = expectedActual - expectedRequested;
  if (
    amountPerMember !== expectedPerMember ||
    requestedTotalAmount !== expectedRequested ||
    actualTotalAmount !== expectedActual ||
    roundingAdjustment !== expectedAdjustment
  ) {
    invalidResponse();
  }
}

function requireUniqueNumbers(values: number[]) {
  if (new Set(values).size !== values.length) invalidResponse();
}

function safeSum(values: number[]) {
  return values.reduce((sum, value) => safeAdd(sum, value), 0);
}

function safeAdd(left: number, right: number) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left > Number.MAX_SAFE_INTEGER - right) {
    return invalidResponse();
  }
  return left + right;
}

function safeMultiply(left: number, right: number) {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    left < 0 ||
    right <= 0 ||
    left > Math.floor(Number.MAX_SAFE_INTEGER / right)
  ) {
    return invalidResponse();
  }
  return left * right;
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
  throw new InvalidServerResponseError();
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
