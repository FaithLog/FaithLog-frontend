import type {
  AdminChargeContractCapabilities,
  AdminChargeStatusChangeResponse,
  AdminChargeStatusTarget,
  ApiError,
  ChargeItem,
  PaymentCategory,
} from '../api/types';
import {
  beginAdminChargeMutation,
  finishAdminChargeMutation,
  getAdminChargeStatusActions,
  invalidateAdminChargeMutation,
  isAdminChargeMutationCurrent,
  shouldExpireAdminChargeSession,
  type AdminChargeMutationGate,
} from './adminChargeStatus';

export type AdminChargeReadChannel = 'summary' | 'detail';

type AdminChargeReadState = {
  key: string | null;
  sequence: number;
};

export type AdminChargeReadCoordinator = Record<
  AdminChargeReadChannel,
  AdminChargeReadState
>;

type AdminChargeReadTicket = {
  channel: AdminChargeReadChannel;
  key: string;
  sequence: number;
};

export type AdminChargeReadResult =
  | {kind: 'applied'}
  | {kind: 'stale'}
  | {kind: 'aborted'}
  | {kind: 'failed'; error: ApiError};

export type AdminChargeRequestFilters = {
  keyword: string;
  paymentCategory: string;
  status: string;
  userId: string;
};

type AdminChargeDetailIdentity = {
  userId: number;
};

export type AdminChargeViewIdentity<
  Filters extends AdminChargeRequestFilters,
  Detail extends AdminChargeDetailIdentity = AdminChargeDetailIdentity,
> = {
  detail: Detail | null;
  filters: Filters;
};

type AdminChargeRequestKeyInput = {
  campusId: number;
  filters: AdminChargeRequestFilters;
  generation: number;
};

export function createAdminChargeReadCoordinator(): AdminChargeReadCoordinator {
  return {
    summary: {key: null, sequence: 0},
    detail: {key: null, sequence: 0},
  };
}

export function createAdminChargeViewIdentity<
  Filters extends AdminChargeRequestFilters,
  Detail extends AdminChargeDetailIdentity = AdminChargeDetailIdentity,
>(filters: Filters): AdminChargeViewIdentity<Filters, Detail> {
  return {detail: null, filters};
}

export function setAdminChargeViewFilters<
  Filters extends AdminChargeRequestFilters,
  Detail extends AdminChargeDetailIdentity,
>(
  identity: AdminChargeViewIdentity<Filters, Detail>,
  filters: Filters,
) {
  identity.filters = filters;
  identity.detail = null;
}

export function setAdminChargeViewDetail<
  Filters extends AdminChargeRequestFilters,
  Detail extends AdminChargeDetailIdentity,
>(
  identity: AdminChargeViewIdentity<Filters, Detail>,
  detail: Detail | null,
) {
  identity.detail = detail;
}

export function getAdminChargeRefreshIdentity<
  Filters extends AdminChargeRequestFilters,
  Detail extends AdminChargeDetailIdentity,
>(identity: AdminChargeViewIdentity<Filters, Detail>) {
  return {
    detail: identity.detail,
    filters: identity.filters,
  };
}

export function commitAdminChargeCampusIdentity({
  committedCampusId,
  coordinator,
  gate,
  nextCampusId,
  onCommit,
}: {
  committedCampusId: {current: number};
  coordinator: AdminChargeReadCoordinator;
  gate: AdminChargeMutationGate;
  nextCampusId: number;
  onCommit?: () => void;
}) {
  if (committedCampusId.current === nextCampusId) {
    return false;
  }

  committedCampusId.current = nextCampusId;
  invalidateAdminChargeMutation(gate);
  invalidateAdminChargeRead(coordinator);
  onCommit?.();
  return true;
}

export function applyAdminChargeFilterChange<
  Filters extends AdminChargeRequestFilters,
>({
  coordinator,
  currentTimer,
  key,
  nextFilters,
  onLoad,
  onVisibleStateChange,
}: {
  coordinator: AdminChargeReadCoordinator;
  currentTimer: ReturnType<typeof setTimeout> | null;
  key: keyof Filters;
  nextFilters: Filters;
  onLoad: (filters: Filters) => void;
  onVisibleStateChange: (filters: Filters) => void;
}): ReturnType<typeof setTimeout> | null {
  invalidateAdminChargeRead(coordinator);

  if (currentTimer !== null) {
    clearTimeout(currentTimer);
  }

  onVisibleStateChange(nextFilters);

  if (key !== 'keyword') {
    onLoad(nextFilters);
    return null;
  }

  return setTimeout(() => onLoad(nextFilters), 350);
}

export function selectAdminChargeStatusRequest({
  actionIdle,
  capabilities,
  charge,
  mutationActive,
  status,
}: {
  actionIdle: boolean;
  capabilities: Pick<AdminChargeContractCapabilities, 'paidStatusEnabled'>;
  charge: ChargeItem;
  mutationActive: boolean;
  status: AdminChargeStatusTarget;
}) {
  if (
    !actionIdle ||
    mutationActive ||
    charge.status === status ||
    !getAdminChargeStatusActions(charge, capabilities).includes(status)
  ) {
    return null;
  }

  return {charge, status};
}

export function buildAdminChargeSummaryRequestKey({
  campusId,
  filters,
  generation,
}: AdminChargeRequestKeyInput) {
  return JSON.stringify([
    'summary',
    campusId,
    generation,
    filters.keyword,
    filters.paymentCategory,
    filters.status,
    filters.userId,
  ]);
}

export function buildAdminChargeDetailRequestKey({
  campusId,
  filters,
  generation,
  memberUserId,
}: AdminChargeRequestKeyInput & {memberUserId: number}) {
  return JSON.stringify([
    'detail',
    campusId,
    generation,
    memberUserId,
    filters.keyword,
    filters.paymentCategory,
    filters.status,
    filters.userId,
  ]);
}

export function isAdminChargeSummaryRequestKeyCurrent<
  Filters extends AdminChargeRequestFilters,
  Detail extends AdminChargeDetailIdentity,
>({
  campusId,
  generation,
  identity,
  key,
}: {
  campusId: number;
  generation: number;
  identity: AdminChargeViewIdentity<Filters, Detail>;
  key: string;
}) {
  return key === buildAdminChargeSummaryRequestKey({
    campusId,
    filters: identity.filters,
    generation,
  });
}

export function isAdminChargeDetailRequestKeyCurrent<
  Filters extends AdminChargeRequestFilters,
  Detail extends AdminChargeDetailIdentity,
>({
  campusId,
  generation,
  identity,
  key,
}: {
  campusId: number;
  generation: number;
  identity: AdminChargeViewIdentity<Filters, Detail>;
  key: string;
}) {
  return identity.detail !== null && key === buildAdminChargeDetailRequestKey({
    campusId,
    filters: identity.filters,
    generation,
    memberUserId: identity.detail.userId,
  });
}

export function invalidateAdminChargeRead(
  coordinator: AdminChargeReadCoordinator,
  channel?: AdminChargeReadChannel,
) {
  const channels: AdminChargeReadChannel[] = channel
    ? [channel]
    : ['summary', 'detail'];

  for (const currentChannel of channels) {
    const state = coordinator[currentChannel];
    state.sequence += 1;
    state.key = null;
  }
}

function beginAdminChargeRead(
  coordinator: AdminChargeReadCoordinator,
  channel: AdminChargeReadChannel,
  key: string,
): AdminChargeReadTicket {
  const state = coordinator[channel];
  state.sequence += 1;
  state.key = key;

  return {channel, key, sequence: state.sequence};
}

function isAdminChargeReadCurrent(
  coordinator: AdminChargeReadCoordinator,
  ticket: AdminChargeReadTicket,
) {
  const state = coordinator[ticket.channel];
  return state.sequence === ticket.sequence && state.key === ticket.key;
}

export async function runLatestAdminChargeRead<Value>({
  coordinator,
  channel,
  key,
  request,
  normalizeError,
  canApplySuccess,
  canApplyError,
  onStart,
  onSuccess,
  onError,
}: {
  coordinator: AdminChargeReadCoordinator;
  channel: AdminChargeReadChannel;
  key: string;
  request: () => Promise<Value | null>;
  normalizeError: (error: unknown) => ApiError;
  canApplySuccess: () => boolean;
  canApplyError: (error: ApiError) => boolean;
  onStart?: () => void;
  onSuccess: (value: Value) => void;
  onError: (error: ApiError) => void;
}): Promise<AdminChargeReadResult> {
  const ticket = beginAdminChargeRead(coordinator, channel, key);
  onStart?.();

  try {
    const value = await request();

    if (value === null) {
      return isAdminChargeReadCurrent(coordinator, ticket)
        ? {kind: 'aborted'}
        : {kind: 'stale'};
    }

    if (
      !isAdminChargeReadCurrent(coordinator, ticket) ||
      !canApplySuccess()
    ) {
      return {kind: 'stale'};
    }

    onSuccess(value);
    return {kind: 'applied'};
  } catch (error) {
    const apiError = normalizeError(error);

    if (
      !isAdminChargeReadCurrent(coordinator, ticket) ||
      !canApplyError(apiError)
    ) {
      return {kind: 'stale'};
    }

    onError(apiError);
    return {kind: 'failed', error: apiError};
  }
}

export type AdminChargeRefreshResult = {
  detail?: AdminChargeReadResult;
  kind: 'complete' | 'partial' | 'failed' | 'superseded';
  summary: AdminChargeReadResult;
};

const refreshFailure: AdminChargeReadResult = {
  kind: 'failed',
  error: {
    kind: 'error',
    code: 'ADMIN_CHARGE_REFRESH_FAILED',
    message: '관리자 청구 정보를 다시 불러오지 못했습니다.',
  },
};

export async function refreshAdminChargeSurfaces(
  refreshSummary: () => Promise<AdminChargeReadResult>,
  refreshDetail?: () => Promise<AdminChargeReadResult>,
): Promise<AdminChargeRefreshResult> {
  const [summaryResult, detailResult] = await Promise.allSettled([
    refreshSummary(),
    refreshDetail ? refreshDetail() : Promise.resolve(undefined),
  ]);
  const summary = summaryResult.status === 'fulfilled'
    ? summaryResult.value
    : refreshFailure;
  const detail = detailResult.status === 'fulfilled'
    ? detailResult.value
    : refreshFailure;
  const attempted = detail === undefined ? [summary] : [summary, detail];
  const superseded = attempted.some((result) => result.kind === 'stale');
  const failureCount = attempted.filter(
    (result) => result.kind === 'failed' || result.kind === 'aborted',
  ).length;
  const kind = superseded
    ? 'superseded'
    : failureCount === 0
    ? 'complete'
    : failureCount === attempted.length
      ? 'failed'
      : 'partial';

  return {
    kind,
    summary,
    ...(detail === undefined ? {} : {detail}),
  };
}

type ExpectedAdminChargeMutation = {
  campusId: number;
  chargeItemId: number;
  paymentCategory: PaymentCategory;
  status: AdminChargeStatusTarget;
  userId: number;
};

export type AdminChargeMutationOutcome =
  | {kind: 'duplicate'}
  | {kind: 'aborted'}
  | {kind: 'stale'}
  | {kind: 'error'; error: ApiError}
  | {kind: 'conflict'; error: ApiError; refresh: AdminChargeRefreshResult}
  | {
      kind: 'success';
      refresh: AdminChargeRefreshResult;
      response: AdminChargeStatusChangeResponse;
    };

function getAdminChargeIdentityError(
  response: AdminChargeStatusChangeResponse,
  expected: ExpectedAdminChargeMutation,
): ApiError | null {
  if (
    response.id === expected.chargeItemId &&
    response.campusId === expected.campusId &&
    response.userId === expected.userId &&
    response.paymentCategory === expected.paymentCategory &&
    response.status === expected.status
  ) {
    return null;
  }

  return {
    kind: 'error',
    code: 'INVALID_SERVER_RESPONSE',
    message: '서버 응답 형식이 올바르지 않습니다.',
  };
}

export async function coordinateAdminChargeStatusMutation({
  gate,
  expected,
  mutate,
  normalizeError,
  canApplySuccess,
  canHandleError,
  onStart,
  onFinish,
  onAccepted,
  onConflict,
  onSessionExpired,
  refresh,
}: {
  gate: AdminChargeMutationGate;
  expected: ExpectedAdminChargeMutation;
  mutate: () => Promise<AdminChargeStatusChangeResponse | null>;
  normalizeError: (error: unknown) => ApiError;
  canApplySuccess: () => boolean;
  canHandleError: (error: ApiError) => boolean;
  onStart: () => void;
  onFinish: () => void;
  onAccepted: (response: AdminChargeStatusChangeResponse) => void;
  onConflict: () => void;
  onSessionExpired: (error: ApiError) => Promise<void> | void;
  refresh: () => Promise<AdminChargeRefreshResult>;
}): Promise<AdminChargeMutationOutcome> {
  const operationId = beginAdminChargeMutation(gate);

  if (operationId === null) {
    return {kind: 'duplicate'};
  }

  onStart();

  try {
    const response = await mutate();

    if (response === null) {
      return {kind: 'aborted'};
    }

    if (!isAdminChargeMutationCurrent(gate, operationId) || !canApplySuccess()) {
      return {kind: 'stale'};
    }

    const identityError = getAdminChargeIdentityError(response, expected);

    if (identityError) {
      return {kind: 'error', error: identityError};
    }

    onAccepted(response);
    const refreshResult = await refresh();

    if (refreshResult.kind === 'superseded') {
      return {kind: 'stale'};
    }

    if (!isAdminChargeMutationCurrent(gate, operationId) || !canApplySuccess()) {
      return {kind: 'stale'};
    }

    return {kind: 'success', response, refresh: refreshResult};
  } catch (error) {
    const apiError = normalizeError(error);

    if (
      !isAdminChargeMutationCurrent(gate, operationId) ||
      !canHandleError(apiError)
    ) {
      return {kind: 'stale'};
    }

    if (apiError.status === 409) {
      onConflict();
      const refreshResult = await refresh();

      if (refreshResult.kind === 'superseded') {
        return {kind: 'stale'};
      }

      if (
        !isAdminChargeMutationCurrent(gate, operationId) ||
        !canHandleError(apiError)
      ) {
        return {kind: 'stale'};
      }

      return {kind: 'conflict', error: apiError, refresh: refreshResult};
    }

    if (shouldExpireAdminChargeSession(apiError)) {
      await onSessionExpired(apiError);
    }

    return {kind: 'error', error: apiError};
  } finally {
    if (finishAdminChargeMutation(gate, operationId)) {
      onFinish();
    }
  }
}
