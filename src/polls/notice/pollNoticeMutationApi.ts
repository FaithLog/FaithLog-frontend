import {
  apiRequest,
  buildAdminCampusPath,
  buildCampusPath,
  fetchPollDetail,
  toPositiveIntegerPathSegment,
} from '../../api/client';
import {FaithLogApiError} from '../../api/apiError';
import type {PollDetail} from '../../api/types';
import {getPollNoticeCapabilities} from './pollNoticeCapabilities';
import {
  buildPollNoticeMutationFields,
  POLL_TITLE_MAX_LENGTH,
} from './pollNoticeContract';

export type PublishedPollNoticeUpdate = {
  campusId: unknown;
  pollId: unknown;
  pollType: string;
  title: string;
  notice: string | null;
  imageAssetIds: number[];
};

type PollNoticeCapabilities = ReturnType<typeof getPollNoticeCapabilities>;

type PollNoticeMutationRequestOptions<T> = {
  accessToken: string;
  body: unknown;
  exposeServerErrorMessage: true;
  method: 'PATCH';
  responseParser: (value: unknown) => T;
};

export type PollNoticeMutationRequest = <T>(
  path: string,
  options: PollNoticeMutationRequestOptions<T>,
) => Promise<T>;

export type PollNoticeMutationApi = {
  update(accessToken: string, input: PublishedPollNoticeUpdate): Promise<PollDetail>;
};

type PollNoticeMutationApiDependencies = {
  capabilities?: PollNoticeCapabilities;
  getCapabilities?: () => PollNoticeCapabilities;
  request?: PollNoticeMutationRequest;
  fetchDetail?: typeof fetchPollDetail;
};

export function createPollNoticeMutationApi(
  dependencies: PollNoticeMutationApiDependencies = {},
): PollNoticeMutationApi {
  const request: PollNoticeMutationRequest = dependencies.request ??
    (<T>(path: string, options: PollNoticeMutationRequestOptions<T>) =>
      apiRequest<T>(path, options));
  const loadDetail = dependencies.fetchDetail ?? fetchPollDetail;

  return {
    async update(accessToken, input) {
      const capabilities = dependencies.getCapabilities?.() ??
        dependencies.capabilities ??
        getPollNoticeCapabilities();

      // These routes are provisional until their production REST Docs are
      // confirmed. Keeping the gate ahead of path construction guarantees
      // that the default production client never dispatches them.
      if (!capabilities.canEditPublishedNotice) {
        throw new FaithLogApiError({
          kind: 'error',
          code: 'POLL_NOTICE_CONTRACT_PENDING',
          message: '게시된 투표 공지 수정 계약이 아직 준비되지 않았습니다.',
        });
      }

      const campusId = Number(toPositiveIntegerPathSegment(input.campusId, 'campusId'));
      const pollId = Number(toPositiveIntegerPathSegment(input.pollId, 'pollId'));
      const path = input.pollType === 'MEAL'
        ? buildCampusPath(campusId, 'meal', 'polls', pollId, 'notice')
        : buildAdminCampusPath(campusId, 'polls', pollId, 'notice');
      const body = buildPollNoticeMutationFields({
        notice: input.notice ?? '',
        imageAssetIds: [...input.imageAssetIds],
      });
      const title = input.title.trim();
      if (!title || title.length > POLL_TITLE_MAX_LENGTH) {
        throw new FaithLogApiError({
          kind: 'error',
          code: 'POLL_TITLE_INVALID',
          message: `투표 제목은 1~${POLL_TITLE_MAX_LENGTH}자로 입력해 주세요.`,
        });
      }

      await request(path, {
        accessToken,
        body: {title, ...body},
        exposeServerErrorMessage: true,
        method: 'PATCH',
        responseParser: (value) => parsePublishedPollNoticeMutationResponse(
          value,
          campusId,
          pollId,
          title,
          body.notice,
          body.imageAssetIds,
        ),
      });
      const detail = await loadDetail(accessToken, campusId, pollId);
      if (
        detail.campusId !== campusId || detail.id !== pollId ||
        detail.title !== title || (detail.notice ?? null) !== body.notice ||
        !sameIds(detail.imageAssetIds ?? [], body.imageAssetIds)
      ) {
        return invalidMutationResponse();
      }
      return detail;
    },
  };
}

function parsePublishedPollNoticeMutationResponse(
  value: unknown,
  expectedCampusId: number,
  expectedPollId: number,
  expectedTitle: string,
  expectedNotice: string | null,
  expectedImageAssetIds: number[],
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidMutationResponse();
  const record = value as Record<string, unknown>;
  const id = record.id;
  const campusId = record.campusId;
  const title = record.title;
  const notice = record.notice;
  const imageAssetIds = record.imageAssetIds;
  if (
    id !== expectedPollId || campusId !== expectedCampusId || title !== expectedTitle ||
    (notice !== null && typeof notice !== 'string') || (notice ?? null) !== expectedNotice ||
    !Array.isArray(imageAssetIds) ||
    imageAssetIds.some((assetId) =>
      typeof assetId !== 'number' || !Number.isSafeInteger(assetId) || assetId <= 0) ||
    new Set(imageAssetIds).size !== imageAssetIds.length ||
    !sameIds(imageAssetIds as number[], expectedImageAssetIds)
  ) return invalidMutationResponse();
  return {campusId, id};
}

function sameIds(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidMutationResponse(): never {
  throw new FaithLogApiError({
    kind: 'error',
    code: 'INVALID_SERVER_RESPONSE',
    message: '수정한 투표 정보를 확인하지 못했습니다.',
  });
}

export function updatePublishedPollNotice(
  accessToken: string,
  input: PublishedPollNoticeUpdate,
) {
  // Resolve the default dependencies for every call so switching into local
  // mock mode during a test/dev session cannot be shadowed by an import-time
  // production snapshot.
  return createPollNoticeMutationApi().update(accessToken, input);
}
