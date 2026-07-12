import type {ApiError} from '../api/types';

export function toDeletedCommentRefreshError(error: ApiError): ApiError {
  return {
    ...error,
    message: `댓글은 삭제됐지만 목록을 새로고치지 못했습니다. ${error.message}`,
  };
}
