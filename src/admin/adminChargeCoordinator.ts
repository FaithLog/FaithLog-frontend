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

type AdminChargeRequestFilters = {
  keyword: string;
  paymentCategory: string;
  status: string;
  userId: string;
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
