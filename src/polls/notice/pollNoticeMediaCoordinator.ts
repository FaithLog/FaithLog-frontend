import {FaithLogApiError} from '../../api/apiError';
import type {ApiError} from '../../api/types';
import type {MediaAccessUrl} from '../../media/mediaTypes';

export type PollNoticeMediaState =
  | {status: 'empty'}
  | {status: 'success'; assets: MediaAccessUrl[]}
  | {status: 'error'; error: ApiError};

type PollNoticeMediaLoadInput = {
  accessToken: string;
  assetIds: number[];
  authSessionGeneration: number;
  campusId: number;
  enabled: boolean;
  pollId: number;
};

export type PollNoticeMediaLoadResult = {
  requestId: number;
  scopeKey: string;
  state: PollNoticeMediaState;
};

type GetAccessUrls = (
  accessToken: string,
  campusId: number,
  assetIds: number[],
) => Promise<MediaAccessUrl[]>;

export function createPollNoticeMediaCoordinator({
  getAccessUrls,
}: {
  getAccessUrls: GetAccessUrls;
}) {
  let latestRequestId = 0;
  let latestScopeKey: string | null = null;

  return {
    async load(input: PollNoticeMediaLoadInput): Promise<PollNoticeMediaLoadResult> {
      const requestId = ++latestRequestId;
      const scopeKey = buildScopeKey(input);
      latestScopeKey = scopeKey;

      if (!input.enabled || input.assetIds.length === 0) {
        return {requestId, scopeKey, state: {status: 'empty'}};
      }

      try {
        const assets = await getAccessUrls(
          input.accessToken,
          input.campusId,
          input.assetIds,
        );
        return {requestId, scopeKey, state: {status: 'success', assets}};
      } catch (error) {
        const apiError = toMediaApiError(error);
        if (apiError.kind === 'sessionExpired') throw error;
        return {requestId, scopeKey, state: {status: 'error', error: apiError}};
      }
    },
    isCurrent(result: PollNoticeMediaLoadResult) {
      return result.requestId === latestRequestId && result.scopeKey === latestScopeKey;
    },
    invalidate() {
      latestRequestId += 1;
      latestScopeKey = null;
    },
  };
}

function buildScopeKey(input: PollNoticeMediaLoadInput) {
  return `${input.authSessionGeneration}:${input.campusId}:${input.pollId}`;
}

function toMediaApiError(error: unknown): ApiError {
  if (error instanceof FaithLogApiError) return error.detail;
  return {
    kind: 'error',
    message: '투표 공지 이미지를 불러오지 못했습니다.',
  };
}
