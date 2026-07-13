import {getApiErrorPresentation, type ApiErrorPresentation} from '../api/errorPolicy';
import type {ApiError} from '../api/types';
import type {
  MealCalculationType,
  MealChargeCalculation,
  MealChargeGroupRequest,
  MealChargeRequest,
  MealPollCreateDraft,
  MealPollCreateRequest,
} from './mealTypes';

type ChargeableOption = {
  optionId: number;
  responseCount: number;
};

export type MealChargeSubmitGate = {
  inFlight: boolean;
  operationId: number;
};

export function buildMealPollCreateRequest(
  draft: MealPollCreateDraft,
  now = new Date(),
): MealPollCreateRequest {
  const title = draft.title.trim();
  const description = draft.description.trim();
  const endsAt = new Date(draft.endsAt);

  if (!title) {
    throw new Error('투표 제목을 입력해 주세요.');
  }

  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now.getTime()) {
    throw new Error('마감 시간은 현재보다 미래여야 합니다.');
  }

  const options = draft.options.map((content) => content.trim());

  if (options.length < 2 || options.some((content) => !content)) {
    throw new Error('선택지를 두 개 이상 입력해 주세요.');
  }

  const normalized = options.map((content) => content.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('중복 선택지는 사용할 수 없습니다.');
  }

  return {
    title,
    description,
    endsAt: endsAt.toISOString(),
    options: options.map((content) => ({content})),
    allowUserOptionAdd: draft.allowUserOptionAdd,
  };
}

export function calculateMealChargeGroup(
  calculationType: MealCalculationType,
  enteredAmount: number,
  responseCount: number,
): MealChargeCalculation {
  requirePositiveSafeInteger(enteredAmount, '입력 금액');
  requirePositiveSafeInteger(responseCount, '응답자 수');

  if (calculationType === 'PER_MEMBER') {
    const actualTotalAmount = safeMultiply(enteredAmount, responseCount);
    return {
      actualTotalAmount,
      amountPerMember: enteredAmount,
      enteredAmount,
      requestedTotalAmount: actualTotalAmount,
      roundingAdjustment: 0,
    };
  }

  const quotient = Math.floor(enteredAmount / responseCount);
  const amountPerMember = quotient + (enteredAmount % responseCount === 0 ? 0 : 1);
  requirePositiveSafeInteger(amountPerMember, '1인당 금액');
  const actualTotalAmount = safeMultiply(amountPerMember, responseCount);

  return {
    actualTotalAmount,
    amountPerMember,
    enteredAmount,
    requestedTotalAmount: enteredAmount,
    roundingAdjustment: actualTotalAmount - enteredAmount,
  };
}

export function buildMealChargeRequest(
  paymentAccountId: number,
  options: ChargeableOption[],
  groups: MealChargeGroupRequest[],
): MealChargeRequest {
  requirePositiveSafeInteger(paymentAccountId, '계좌');

  const optionById = new Map(options.map((option) => [option.optionId, option]));
  const respondingOptionIds = options
    .filter((option) => option.responseCount > 0)
    .map((option) => option.optionId);
  const seen = new Set<number>();

  for (const group of groups) {
    if (seen.has(group.optionId)) {
      throw new Error('같은 선택지 그룹을 중복 청구할 수 없습니다.');
    }
    seen.add(group.optionId);

    const option = optionById.get(group.optionId);
    if (!option) {
      throw new Error('현재 투표에 없는 선택지입니다.');
    }
    if (option.responseCount === 0) {
      throw new Error('응답자가 없는 선택지는 청구 대상에서 제외해 주세요.');
    }

    calculateMealChargeGroup(group.calculationType, group.enteredAmount, option.responseCount);
  }

  if (
    groups.length !== respondingOptionIds.length ||
    respondingOptionIds.some((optionId) => !seen.has(optionId))
  ) {
    throw new Error('응답자가 있는 모든 선택지의 금액을 입력해 주세요.');
  }

  return {
    paymentAccountId,
    groups: groups.map((group) => ({...group})),
  };
}

export function createMealChargeSubmitGate(): MealChargeSubmitGate {
  return {inFlight: false, operationId: 0};
}

export function beginMealChargeSubmit(gate: MealChargeSubmitGate) {
  if (gate.inFlight) {
    return null;
  }

  gate.inFlight = true;
  gate.operationId += 1;
  return gate.operationId;
}

export function finishMealChargeSubmit(gate: MealChargeSubmitGate, operationId: number) {
  if (!gate.inFlight || gate.operationId !== operationId) {
    return false;
  }

  gate.inFlight = false;
  return true;
}

export function getMealErrorPresentation(error: ApiError): ApiErrorPresentation {
  if (error.status === 401 || error.kind === 'sessionExpired') {
    return {
      actionLabel: '다시 로그인',
      message: '세션이 만료되었습니다. 다시 로그인해 주세요.',
      retryable: false,
      title: '세션이 만료되었습니다',
    };
  }

  if (error.status === 400) {
    return {
      actionLabel: '다시 입력',
      message: '입력값을 확인한 뒤 다시 시도해 주세요.',
      retryable: false,
      title: '입력값을 확인해 주세요',
    };
  }

  if (error.status === 403) {
    return getApiErrorPresentation(error, {
      permissionMessage: '활성 밥 담당자만 이 기능을 사용할 수 있습니다.',
      permissionTitle: '밥 담당 권한이 필요합니다',
    });
  }

  if (error.status === 409) {
    return getApiErrorPresentation(error, {
      conflictMessage: '최신 상태를 다시 불러온 뒤 진행해 주세요.',
    });
  }

  return getApiErrorPresentation(error);
}

export function notifyMealSessionExpired(
  error: ApiError,
  onSessionExpired?: (message: string) => void,
) {
  if (error.status === 401 || error.kind === 'sessionExpired') {
    onSessionExpired?.(error.message);
  }
}

function requirePositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label}은(는) 안전한 정수 범위의 양수여야 합니다.`);
  }
}

function safeMultiply(left: number, right: number) {
  if (left > Math.floor(Number.MAX_SAFE_INTEGER / right)) {
    throw new Error('계산 금액이 안전한 정수 범위를 벗어났습니다.');
  }

  return left * right;
}
