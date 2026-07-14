import type {
  MealCalculationType,
  MealChargeGroupResult,
  MealChargeResult,
  MealCharged,
  MealDutyAssignment,
  MealMyDutyAssignment,
  MealPaymentAccount,
  MealPollDetail,
  MealPollList,
  MealPollOptionDetail,
  MealPollStatus,
  MealPollSummary,
  MealPollMutationResponse,
  MealSettlement,
  MealSettlementStatus,
} from './mealTypes';

type UnknownRecord = Record<string, unknown>;

const INVALID_RESPONSE_MESSAGE = 'Invalid API response.';
const pollStatuses = new Set<MealPollStatus>(['SCHEDULED', 'OPEN', 'CLOSED']);
const settlementStatuses = new Set<MealSettlementStatus>(['NOT_CHARGED', 'CHARGED']);
const calculationTypes = new Set<MealCalculationType>(['PER_MEMBER', 'GROUP_TOTAL']);

export class InvalidServerResponseError extends Error {
  readonly code = 'INVALID_SERVER_RESPONSE';

  constructor() {
    super(INVALID_RESPONSE_MESSAGE);
  }
}

export function parseMyMealDutyAssignment(value: unknown): MealMyDutyAssignment {
  return parseSafely(() => {
    const record = requireRecord(value);
    requireExactKeys(record, ['campusId', 'dutyType', 'isActive', 'userId']);
    if (record.dutyType !== 'MEAL') invalidResponse();
    return {
      campusId: requirePositiveId(record.campusId),
      userId: requirePositiveId(record.userId),
      dutyType: 'MEAL',
      isActive: requireBoolean(record.isActive),
    };
  });
}

export function parseMyMealDutyAssignmentForContext(
  value: unknown,
  context: {campusId: number; userId: number},
): MealMyDutyAssignment {
  return parseSafely(() => {
    const duty = parseMyMealDutyAssignment(value);
    if (duty.campusId !== context.campusId || duty.userId !== context.userId) invalidResponse();
    return duty;
  });
}

export function parseMealDutyAssignment(value: unknown): MealDutyAssignment {
  return parseSafely(() => parseMealDuty(value));
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
        context.status !== undefined && poll.status !== context.status)
    ) {
      invalidResponse();
    }
    return list;
  });
}

export function parseMealPollDetail(value: unknown): MealPollDetail {
  return parseSafely(() => {
    const record = requireRecord(value);
    requireExactKeys(record, [
      'allowUserOptionAdd', 'campusId', 'endsAt', 'id', 'isAnonymous', 'options',
      'pollType', 'selectionType', 'startsAt', 'status', 'title',
    ]);
    const detail: MealPollDetail = {
      id: requirePositiveId(record.id),
      campusId: requirePositiveId(record.campusId),
      title: requireString(record.title),
      pollType: requireExactValue(record.pollType, 'MEAL'),
      selectionType: requireExactValue(record.selectionType, 'SINGLE'),
      isAnonymous: requireBoolean(record.isAnonymous),
      allowUserOptionAdd: requireBoolean(record.allowUserOptionAdd),
      startsAt: requireDateTime(record.startsAt),
      endsAt: requireDateTime(record.endsAt),
      status: requireEnum(record.status, pollStatuses),
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

export function parseCreatedMealPollDetail(value: unknown): MealPollMutationResponse {
  return parseSafely(() => {
    const poll = parseMealPollMutationResponse(value);
    if (poll.status !== 'OPEN') invalidResponse();
    return poll;
  });
}

export function parseCreatedMealPollDetailForContext(
  value: unknown,
  context: {campusId: number},
): MealPollMutationResponse {
  return parseSafely(() => {
    const detail = parseCreatedMealPollDetail(value);
    if (detail.campusId !== context.campusId) invalidResponse();
    return detail;
  });
}

export function parseClosedMealPollDetail(value: unknown): MealPollMutationResponse {
  return parseSafely(() => {
    const poll = parseMealPollMutationResponse(value);
    if (poll.status !== 'CLOSED') invalidResponse();
    return poll;
  });
}

export function parseClosedMealPollDetailForContext(
  value: unknown,
  context: {campusId: number; pollId: number},
): MealPollMutationResponse {
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
    requireExactKeys(record, ['campusId', 'campusName', 'members', 'region', 'summary']);
    const settlement: MealSettlement = {
      campusId: requirePositiveId(record.campusId),
      campusName: requireString(record.campusName),
      region: requireString(record.region),
      summary: parseChargeAmountSummary(record.summary),
      members: requireArray(record.members).map(parseMealSettlementMember),
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
    if (settlement.campusId !== context.campusId) invalidResponse();
    return settlement;
  });
}

export function parseNull(value: unknown): null {
  if (value !== null && value !== undefined) {
    invalidResponse();
  }
  return null;
}

function parseMealDuty(value: unknown): MealDutyAssignment {
  const record = requireRecord(value);
  requireExactKeys(record, [
    'assignedAt', 'assignmentId', 'campusId', 'dutyType', 'email', 'isActive', 'name', 'userId',
  ]);
  if (record.dutyType !== 'MEAL') invalidResponse();

  return {
    assignmentId: requirePositiveId(record.assignmentId),
    campusId: requirePositiveId(record.campusId),
    userId: requirePositiveId(record.userId),
    dutyType: 'MEAL',
    isActive: requireBoolean(record.isActive),
    name: requireString(record.name),
    email: requireString(record.email),
    ...(record.assignedAt === undefined ? {} : {assignedAt: requireDateTime(record.assignedAt)}),
  };
}

function parseMealPaymentAccount(value: unknown): MealPaymentAccount {
  const record = requireRecord(value);
  requireExactKeys(record, [
    'accountHolder', 'accountNumber', 'accountType', 'bankName', 'campusId', 'createdAt',
    'deactivatedAt', 'id', 'isActive', 'nickname', 'ownerUserId',
  ]);
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
  requireExactKeys(record, ['endsAt', 'id', 'settlementStatus', 'startsAt', 'status', 'title']);

  return {
    id: requirePositiveId(record.id),
    title: requireString(record.title),
    startsAt: requireDateTime(record.startsAt),
    endsAt: requireDateTime(record.endsAt),
    status: requireEnum(record.status, pollStatuses),
    settlementStatus: requireEnum(record.settlementStatus, settlementStatuses),
  };
}

function parseMealPollOption(value: unknown): MealPollOptionDetail {
  const record = requireRecord(value);
  requireExactKeys(record, ['charge', 'content', 'optionId', 'responseCount', 'userAdded']);
  const chargeRecord = requireRecord(record.charge);
  const chargeStatus = chargeRecord.chargeStatus;
  const responseCount = requireNonNegativeInteger(record.responseCount);

  if (chargeStatus !== 'NOT_CHARGED' && chargeStatus !== 'CHARGED') invalidResponse();

  if (chargeStatus === 'NOT_CHARGED') {
    requireExactKeys(chargeRecord, [
      'actualTotalAmount', 'amountPerMember', 'calculationType', 'chargeStatus',
      'chargedAt', 'chargedByMe', 'enteredAmount', 'paymentAccountId',
      'requestedTotalAmount', 'roundingAdjustment',
    ]);
    if (
      chargeRecord.calculationType !== null ||
      chargeRecord.enteredAmount !== null ||
      chargeRecord.amountPerMember !== null ||
      chargeRecord.requestedTotalAmount !== null ||
      chargeRecord.actualTotalAmount !== null ||
      chargeRecord.roundingAdjustment !== null ||
      chargeRecord.paymentAccountId !== null ||
      chargeRecord.chargedByMe !== false ||
      chargeRecord.chargedAt !== null
    ) {
      invalidResponse();
    }
  }

  return {
    optionId: requirePositiveId(record.optionId),
    content: requireString(record.content),
    responseCount,
    userAdded: requireBoolean(record.userAdded),
    charge:
      chargeStatus === 'NOT_CHARGED'
        ? {
            chargeStatus,
            calculationType: null,
            enteredAmount: null,
            amountPerMember: null,
            requestedTotalAmount: null,
            actualTotalAmount: null,
            roundingAdjustment: null,
            paymentAccountId: null,
            chargedByMe: false,
            chargedAt: null,
          }
        : parseCharged(chargeRecord),
  };
}

function parseMealPollMutationResponse(value: unknown): MealPollMutationResponse {
  const record = requireRecord(value);
  requireExactKeys(record, [
    'allowUserOptionAdd', 'campusId', 'chargeGenerationType', 'endsAt', 'id',
    'isAnonymous', 'options', 'paymentAccountId', 'paymentCategory', 'pollType',
    'selectionType', 'startsAt', 'status', 'templateId', 'title',
  ]);
  if (
    record.templateId !== null ||
    record.chargeGenerationType !== 'NONE' ||
    record.paymentCategory !== null ||
    record.paymentAccountId !== null
  ) {
    invalidResponse();
  }
  const options = requireArray(record.options).map((value) => {
    const option = requireRecord(value);
    requireExactKeys(option, [
      'composeMenuCode', 'content', 'id', 'priceAmount', 'sortOrder', 'userAdded',
    ]);
    if (option.composeMenuCode !== null || option.priceAmount !== 0) invalidResponse();
    return {
      id: requirePositiveId(option.id),
      content: requireString(option.content),
      sortOrder: requireNonNegativeInteger(option.sortOrder),
      userAdded: requireBoolean(option.userAdded),
    };
  });
  requireUniqueNumbers(options.map((option) => option.id));
  requireUniqueNumbers(options.map((option) => option.sortOrder));
  return {
    id: requirePositiveId(record.id),
    campusId: requirePositiveId(record.campusId),
    title: requireString(record.title),
    pollType: requireExactValue(record.pollType, 'MEAL'),
    selectionType: requireExactValue(record.selectionType, 'SINGLE'),
    isAnonymous: requireBoolean(record.isAnonymous),
    allowUserOptionAdd: requireBoolean(record.allowUserOptionAdd),
    startsAt: requireDateTime(record.startsAt),
    endsAt: requireDateTime(record.endsAt),
    status: requireEnum(record.status, pollStatuses),
    options,
  };
}

function parseCharged(record: UnknownRecord): MealCharged {
  requireExactKeys(record, [
    'actualTotalAmount', 'amountPerMember', 'calculationType', 'chargeStatus',
    'chargedAt', 'chargedByMe', 'enteredAmount', 'paymentAccountId',
    'requestedTotalAmount', 'roundingAdjustment',
  ]);
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
    paymentAccountId,
    chargedByMe,
    chargedAt: requireDateTime(record.chargedAt),
  };
}

function validateMealPollDetailSemantics(detail: MealPollDetail) {
  requireUniqueNumbers(detail.options.map((option) => option.optionId));
  const respondingOptions = detail.options.filter((option) => option.responseCount > 0);

  if (
    detail.options.some(
      (option) => option.responseCount === 0 && option.charge.chargeStatus !== 'NOT_CHARGED',
    )
  ) {
    invalidResponse();
  }

  for (const option of respondingOptions) {
    if (option.charge.chargeStatus === 'CHARGED') {
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
  if (
    respondingOptions.some((option) => option.charge.chargeStatus === 'CHARGED') &&
    respondingOptions.some((option) => option.charge.chargeStatus === 'NOT_CHARGED')
  ) {
    invalidResponse();
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
  requireUniqueNumbers(settlement.members.map((member) => member.userId));
  for (const member of settlement.members) validateChargeAmountSummary(member);
  validateChargeAmountSummary(settlement.summary);
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

function parseChargeAmountSummary(value: unknown) {
  const record = requireRecord(value);
  requireExactKeys(record, [
    'canceledAmount', 'paidAmount', 'totalAmount', 'unpaidAmount', 'waivedAmount',
  ]);
  return parseChargeAmounts(record);
}

function parseChargeAmounts(record: UnknownRecord) {
  return {
    totalAmount: requireNonNegativeInteger(record.totalAmount),
    unpaidAmount: requireNonNegativeInteger(record.unpaidAmount),
    paidAmount: requireNonNegativeInteger(record.paidAmount),
    waivedAmount: requireNonNegativeInteger(record.waivedAmount),
    canceledAmount: requireNonNegativeInteger(record.canceledAmount),
  };
}

function parseMealSettlementMember(value: unknown) {
  const record = requireRecord(value);
  requireExactKeys(record, [
    'canceledAmount', 'email', 'name', 'paidAmount', 'totalAmount', 'unpaidAmount',
    'userId', 'waivedAmount',
  ]);
  return {
    userId: requirePositiveId(record.userId),
    name: requireString(record.name),
    email: requireString(record.email),
    ...parseChargeAmounts(record),
  };
}

function validateChargeAmountSummary(summary: {
  canceledAmount: number;
  paidAmount: number;
  totalAmount: number;
  unpaidAmount: number;
  waivedAmount: number;
}) {
  if (
    safeSum([
      summary.unpaidAmount,
      summary.paidAmount,
      summary.waivedAmount,
      summary.canceledAmount,
    ]) !== summary.totalAmount
  ) {
    invalidResponse();
  }
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

function requireExactKeys(record: UnknownRecord, keys: readonly string[]) {
  const expected = new Set(keys);
  if (
    Object.keys(record).length !== expected.size ||
    Object.keys(record).some((key) => !expected.has(key))
  ) {
    invalidResponse();
  }
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) invalidResponse();
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalidResponse();
  return value;
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

function requireExactValue<T extends string>(value: unknown, expected: T): T {
  if (value !== expected) invalidResponse();
  return expected;
}
