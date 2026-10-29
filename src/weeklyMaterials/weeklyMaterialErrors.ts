import {getKnownApiErrorMessage} from '../api/errorPolicy';
import {FaithLogApiError} from '../api/apiError';

export type WeeklyMaterialErrorOperation = 'delete' | 'read' | 'upload';

export function getWeeklyMaterialErrorMessage(
  error: unknown,
  operation: WeeklyMaterialErrorOperation,
) {
  if (error instanceof FaithLogApiError) {
    if (error.detail.kind === 'sessionExpired' || error.detail.status === 401) {
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    }
    if (error.detail.kind === 'offline') {
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    }
  }

  const knownMessage = getKnownApiErrorMessage(error);
  if (knownMessage) return knownMessage;

  switch (operation) {
    case 'delete':
      return '자료를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    case 'read':
      return '이 주차 자료를 불러오지 못했습니다.';
    case 'upload':
      return '업로드하지 못했습니다. 다시 시도해 주세요.';
  }
}
