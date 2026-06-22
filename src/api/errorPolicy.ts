import type {ApiError, ApiErrorKind} from './types';

export type ApiErrorPresentation = {
  actionLabel: string;
  message: string;
  retryable: boolean;
  title: string;
};

export type ApiErrorPresentationOptions = {
  actionLabel?: string;
  conflictMessage?: string;
  conflictTitle?: string;
  defaultMessage?: string;
  defaultTitle?: string;
  permissionMessage?: string;
  permissionTitle?: string;
};

const ERROR_COPY: Record<ApiErrorKind, ApiErrorPresentation> = {
  sessionExpired: {
    title: '세션이 만료되었습니다',
    message: '다시 로그인한 뒤 이용해 주세요.',
    actionLabel: '다시 로그인',
    retryable: false,
  },
  permissionDenied: {
    title: '권한이 필요합니다',
    message: '현재 계정으로는 이 작업을 진행할 수 없습니다.',
    actionLabel: '다시 확인',
    retryable: false,
  },
  conflict: {
    title: '최신 상태 확인이 필요합니다',
    message: '서버의 최신 상태와 충돌했습니다. 다시 불러온 뒤 진행해 주세요.',
    actionLabel: '다시 불러오기',
    retryable: true,
  },
  offline: {
    title: '네트워크 연결이 필요합니다',
    message: '네트워크 상태를 확인하고 다시 시도해 주세요.',
    actionLabel: '다시 시도',
    retryable: true,
  },
  error: {
    title: '요청을 처리하지 못했습니다',
    message: '잠시 후 다시 시도해 주세요.',
    actionLabel: '다시 시도',
    retryable: true,
  },
};

export function getApiErrorPresentation(
  error: ApiError,
  options: ApiErrorPresentationOptions = {},
): ApiErrorPresentation {
  const base = getBasePresentation(error);

  if (error.kind === 'conflict') {
    return {
      ...base,
      title: options.conflictTitle ?? base.title,
      message: options.conflictMessage ?? base.message,
      actionLabel: options.actionLabel ?? base.actionLabel,
    };
  }

  if (error.kind === 'permissionDenied') {
    return {
      ...base,
      title: options.permissionTitle ?? base.title,
      message: options.permissionMessage ?? base.message,
      actionLabel: options.actionLabel ?? base.actionLabel,
    };
  }

  if (error.kind === 'error' && error.status !== 400 && error.status !== 404 && error.status !== 422) {
    return {
      ...base,
      title: options.defaultTitle ?? base.title,
      message: options.defaultMessage ?? base.message,
      actionLabel: options.actionLabel ?? base.actionLabel,
    };
  }

  return {
    ...base,
    actionLabel: options.actionLabel ?? base.actionLabel,
  };
}

export function getSafeApiErrorMessage(error: ApiError) {
  return getBasePresentation(error).message;
}

function getBasePresentation(error: ApiError): ApiErrorPresentation {
  if (error.status === 400 || error.status === 422) {
    return {
      title: '입력값을 확인해 주세요',
      message: '입력한 값 중 처리할 수 없는 항목이 있습니다. 내용을 확인한 뒤 다시 시도해 주세요.',
      actionLabel: '다시 입력',
      retryable: false,
    };
  }

  if (error.status === 404) {
    return {
      title: '대상을 찾을 수 없습니다',
      message: '요청한 정보를 찾을 수 없습니다. 목록을 다시 불러와 주세요.',
      actionLabel: '목록 갱신',
      retryable: true,
    };
  }

  return ERROR_COPY[error.kind];
}
