import type {ApiError} from '../api/types';
import {getApiErrorPresentation} from '../api/errorPolicy';

export const COMMENT_DELETED_REFRESH_FAILED = 'POLL_COMMENT_DELETED_REFRESH_FAILED';

export function toDeletedCommentRefreshError(error: ApiError): ApiError {
  return {
    ...error,
    code: COMMENT_DELETED_REFRESH_FAILED,
    message: `댓글은 삭제됐지만 목록을 새로고치지 못했습니다. ${error.message}`,
  };
}

export function getPollActionErrorPresentation(error: ApiError) {
  if (error.code === COMMENT_DELETED_REFRESH_FAILED) {
    return {
      ...getApiErrorPresentation(error),
      title: '댓글 목록을 새로고치지 못했습니다',
      message: '댓글은 삭제됐지만 목록을 새로고치지 못했습니다. 목록을 다시 열어 확인해 주세요.',
    };
  }
  return getApiErrorPresentation(error, {
    conflictMessage: '투표 상태가 변경되었습니다. 다시 불러온 뒤 응답해 주세요.',
  });
}
