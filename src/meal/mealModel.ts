import {getApiErrorPresentation, type ApiErrorPresentation} from '../api/errorPolicy';
import type {ApiError} from '../api/types';
import type {
  MealCalculationType,
  MealChargeCalculation,
  MealChargeGroupRequest,
  MealChargeRequest,
  MealPollDetail,
  MealPollCreateDraft,
  MealPollCreateRequest,
} from './mealTypes';

export type MealChargeConfirmation = {
  groups: Array<MealChargeCalculation & {
    calculationType: MealCalculationType;
    content: string;
    optionId: number;
    responseCount: number;
  }>;
  totals: {
    actualTotalAmount: number;
    chargedMemberCount: number;
    requestedTotalAmount: number;
    roundingAdjustment: number;
  };
};

type ChargeableOption = {
  optionId: number;
  responseCount: number;
};

export type MealChargeSubmitGate = {
  identityKey: string | null;
  inFlight: boolean;
  operationId: number;
};

export class MealLocalValidationError extends Error {
  readonly code = 'MEAL_LOCAL_VALIDATION';
}

export type MealLocalDeadlineDraft = {
  date: string;
  time: string;
};

export function formatMealLocalDeadline(date: Date): MealLocalDeadlineDraft {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return {date: `${year}년 ${month}월 ${day}일`, time: `${hour}:${minute}`};
}

export function parseMealLocalDeadline(draft: MealLocalDeadlineDraft) {
  const dateMatch = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/.exec(draft.date.trim());
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(draft.time.trim());
  if (!dateMatch || !timeMatch) {
    throw new MealLocalValidationError('마감 날짜와 시간을 예시 형식에 맞게 입력해 주세요.');
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new MealLocalValidationError('올바른 마감 날짜와 시간을 입력해 주세요.');
  }
  return parsed.toISOString();
}

export function buildMealPollCreateRequest(
  draft: MealPollCreateDraft,
  now = new Date(),
): MealPollCreateRequest {
  const title = draft.title.trim();
  const endsAt = new Date(draft.endsAt);

  if (!title) {
    throw new MealLocalValidationError('투표 제목을 입력해 주세요.');
  }

  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now.getTime()) {
    throw new MealLocalValidationError('마감 시간은 현재보다 미래여야 합니다.');
  }

  const options = draft.options.map((content) => content.trim());

  if (options.length < 2 || options.some((content) => !content)) {
    throw new MealLocalValidationError('선택지를 두 개 이상 입력해 주세요.');
  }

  const normalized = options.map((content) => content.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new MealLocalValidationError('중복 선택지는 사용할 수 없습니다.');
  }

  return {
    title,
    isAnonymous: draft.isAnonymous,
    endsAt: endsAt.toISOString(),
    options: options.map((content, sortOrder) => ({content, sortOrder})),
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
      throw new MealLocalValidationError('같은 선택지 그룹을 중복 청구할 수 없습니다.');
    }
    seen.add(group.optionId);

    const option = optionById.get(group.optionId);
    if (!option) {
      throw new MealLocalValidationError('현재 투표에 없는 선택지입니다.');
    }
    if (option.responseCount === 0) {
      throw new MealLocalValidationError('응답자가 없는 선택지는 청구 대상에서 제외해 주세요.');
    }

    calculateMealChargeGroup(group.calculationType, group.enteredAmount, option.responseCount);
  }

  if (
    groups.length !== respondingOptionIds.length ||
    respondingOptionIds.some((optionId) => !seen.has(optionId))
  ) {
    throw new MealLocalValidationError('응답자가 있는 모든 선택지의 금액을 입력해 주세요.');
  }

  return {
    paymentAccountId,
    groups: groups.map((group) => ({...group})),
  };
}

export function isMealPollFullyCharged(detail: MealPollDetail) {
  const responding = detail.options.filter((option) => option.responseCount > 0);
  return responding.length > 0 && responding.every((option) => option.charge.chargeStatus === 'CHARGED');
}

export function buildMealChargeConfirmation(
  detail: MealPollDetail,
  request: MealChargeRequest,
): MealChargeConfirmation {
  const optionById = new Map(detail.options.map((option) => [option.optionId, option]));
  const groups = request.groups.map((group) => {
    const option = optionById.get(group.optionId);
    if (!option || option.responseCount <= 0 || option.charge.chargeStatus !== 'NOT_CHARGED') {
      throw new MealLocalValidationError('청구할 수 없는 선택지가 포함되어 있습니다.');
    }
    return {
      ...calculateMealChargeGroup(group.calculationType, group.enteredAmount, option.responseCount),
      calculationType: group.calculationType,
      content: option.content,
      optionId: option.optionId,
      responseCount: option.responseCount,
    };
  });

  return {
    groups,
    totals: groups.reduce(
      (totals, group) => ({
        actualTotalAmount: safeAdd(totals.actualTotalAmount, group.actualTotalAmount),
        chargedMemberCount: safeAdd(totals.chargedMemberCount, group.responseCount),
        requestedTotalAmount: safeAdd(totals.requestedTotalAmount, group.requestedTotalAmount),
        roundingAdjustment: safeAdd(totals.roundingAdjustment, group.roundingAdjustment),
      }),
      {
        actualTotalAmount: 0,
        chargedMemberCount: 0,
        requestedTotalAmount: 0,
        roundingAdjustment: 0,
      },
    ),
  };
}

export function createMealChargeSubmitGate(): MealChargeSubmitGate {
  return {identityKey: null, inFlight: false, operationId: 0};
}

export function beginMealChargeSubmit(gate: MealChargeSubmitGate, identityKey = 'default') {
  if (gate.inFlight && gate.identityKey === identityKey) {
    return null;
  }

  gate.inFlight = true;
  gate.identityKey = identityKey;
  gate.operationId += 1;
  return gate.operationId;
}

export function finishMealChargeSubmit(gate: MealChargeSubmitGate, operationId: number) {
  if (!gate.inFlight || gate.operationId !== operationId) {
    return false;
  }

  gate.inFlight = false;
  gate.identityKey = null;
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
    if (error.code === 'MEAL_LOCAL_VALIDATION') {
      return {
        actionLabel: '다시 입력',
        message: error.message,
        retryable: false,
        title: '입력값을 확인해 주세요',
      };
    }
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
    throw new MealLocalValidationError(`${label}은(는) 안전한 정수 범위의 양수여야 합니다.`);
  }
}

function safeMultiply(left: number, right: number) {
  if (left > Math.floor(Number.MAX_SAFE_INTEGER / right)) {
    throw new MealLocalValidationError('계산 금액이 안전한 정수 범위를 벗어났습니다.');
  }

  return left * right;
}

function safeAdd(left: number, right: number) {
  if (left > Number.MAX_SAFE_INTEGER - right) {
    throw new MealLocalValidationError('계산 금액이 안전한 정수 범위를 벗어났습니다.');
  }
  return left + right;
}
