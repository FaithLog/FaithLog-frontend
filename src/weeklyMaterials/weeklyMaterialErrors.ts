import {FaithLogApiError} from '../api/apiError';

export type WeeklyMaterialErrorOperation = 'delete' | 'read' | 'upload';

const codeMessages: Readonly<Record<string, string>> = {
  WEEKLY_MATERIAL_ACCESS_FORBIDDEN: '이 캠퍼스의 주간 자료를 볼 권한이 없습니다.',
  WEEKLY_MATERIAL_INVALID_WEEK_START_DATE: '주차는 월요일 날짜로 선택해 주세요.',
  WEEKLY_MATERIAL_MANAGE_FORBIDDEN: '이 캠퍼스의 주간 자료를 관리할 권한이 없습니다.',
  WEEKLY_MATERIAL_NOT_FOUND: '이미 삭제되었거나 등록되지 않은 자료입니다.',
};

export function getWeeklyMaterialErrorMessage(
  error: unknown,
  operation: WeeklyMaterialErrorOperation,
) {
  if (error instanceof FaithLogApiError) {
    const codeMessage = error.detail.code ? codeMessages[error.detail.code] : undefined;
    if (codeMessage) return codeMessage;
    if (error.detail.kind === 'sessionExpired' || error.detail.status === 401) {
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    }
    if (error.detail.kind === 'offline') {
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
    }
  }

  switch (operation) {
    case 'delete':
      return '자료를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    case 'read':
      return '이 주차 자료를 불러오지 못했습니다.';
    case 'upload':
      return '업로드하지 못했습니다. 다시 시도해 주세요.';
  }
}
