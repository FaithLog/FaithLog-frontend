import type {
  AdminChargeStatusTarget,
  ApiError,
  ChargeItem,
} from '../api/types';

export type AdminChargeStatusConfirmation = {
  messages: string[];
  title: string;
};

export type AdminChargeMutationGate = {
  activeOperationId: number | null;
  nextOperationId: number;
};

export function createAdminChargeMutationGate(): AdminChargeMutationGate {
  return {activeOperationId: null, nextOperationId: 0};
}

export function beginAdminChargeMutation(gate: AdminChargeMutationGate) {
  if (gate.activeOperationId !== null) {
    return null;
  }

  gate.nextOperationId += 1;
  gate.activeOperationId = gate.nextOperationId;
  return gate.activeOperationId;
}

export function isAdminChargeMutationCurrent(
  gate: AdminChargeMutationGate,
  operationId: number,
) {
  return gate.activeOperationId === operationId;
}

export function finishAdminChargeMutation(
  gate: AdminChargeMutationGate,
  operationId: number,
) {
  if (!isAdminChargeMutationCurrent(gate, operationId)) {
    return false;
  }

  gate.activeOperationId = null;
  return true;
}

export function invalidateAdminChargeMutation(gate: AdminChargeMutationGate) {
  gate.nextOperationId += 1;
  gate.activeOperationId = null;
}

export async function refreshAdminChargeViews(
  refreshSummary: () => Promise<void>,
  refreshDetail?: () => Promise<void>,
) {
  await Promise.all([
    refreshSummary(),
    refreshDetail ? refreshDetail() : Promise.resolve(),
  ]);
}

export function getAdminChargeStatusActions(
  charge: Pick<ChargeItem, 'status'>,
): AdminChargeStatusTarget[] {
  return charge.status === 'UNPAID'
    ? ['PAID', 'WAIVED', 'CANCELED']
    : ['UNPAID'];
}

export function getAdminChargeStatusConfirmation(
  charge: Pick<ChargeItem, 'paymentCategory' | 'source' | 'title'>,
  status: AdminChargeStatusTarget,
  options: {devotionReopenEnabled?: boolean} = {},
): AdminChargeStatusConfirmation {
  if (status === 'PAID') {
    return {
      title: `${charge.title}을 납부 완료 처리할까요?`,
      messages: ['납부 완료로 처리하면 서버가 납부 시각을 기록합니다.'],
    };
  }

  if (status === 'CANCELED') {
    const isDevotionPenalty =
      charge.paymentCategory === 'PENALTY' &&
      charge.source?.sourceType === 'DEVOTION_RECORD';
    const reopensDevotion =
      isDevotionPenalty && options.devotionReopenEnabled === true;

    return {
      title: `${charge.title}을 취소할까요?`,
      messages: isDevotionPenalty
        ? [
            '벌금이 취소됩니다.',
            ...(reopensDevotion
              ? ['해당 사용자는 그 주의 경건생활을 다시 수정하고 제출할 수 있습니다.']
              : []),
          ]
        : ['청구가 취소됩니다.'],
    };
  }

  if (status === 'WAIVED') {
    return {
      title: `${charge.title}을 면제 처리할까요?`,
      messages: ['청구가 면제됩니다.'],
    };
  }

  return {
    title: `${charge.title}을 미납으로 복구할까요?`,
    messages: ['청구가 미납 상태로 돌아갑니다.'],
  };
}

export function getAdminChargeStatusErrorMessage(error: ApiError) {
  if (error.code === 'API_CONTRACT_PENDING') {
    return '관리자 납부 완료 API 계약이 아직 확정되지 않아 production 요청을 보내지 않았습니다.';
  }

  if (error.kind === 'sessionExpired' && error.status === 401) {
    return '세션이 만료되었습니다. 다시 로그인해 주세요.';
  }

  if (error.status === 403) {
    return error.message.trim() || '청구 상태 변경 권한이 없습니다.';
  }

  if (error.status === 404) {
    return '청구를 찾을 수 없습니다. 캠퍼스 범위와 최신 목록을 확인해 주세요.';
  }

  if (error.status === 409) {
    return '청구 상태가 이미 변경되었습니다. 목록과 상세를 다시 불러와 주세요.';
  }

  if (error.status === 400) {
    return error.message.trim() || '청구 상태 변경 요청을 확인해 주세요.';
  }

  return error.message.trim() || '청구 상태를 변경하지 못했습니다.';
}

export function shouldExpireAdminChargeSession(error: ApiError) {
  return error.kind === 'sessionExpired' && error.status === 401;
}
