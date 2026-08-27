import {FaithLogApiError} from '../../api/apiError';

// Provisional until backend #238 REST Docs fixes the exact limit. Keeping the
// value in one place lets the transport contract change without touching UI.
export const POLL_NOTICE_MAX_LENGTH = 2_000;
export const POLL_TITLE_MAX_LENGTH = 500;

export type PollNoticeDraft = {
  notice: string;
  imageAssetIds: number[];
};

export type PollNoticeMutationFields = {
  notice: string | null;
  imageAssetIds: number[];
};

export function normalizePollNotice(value: string) {
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}
export function getPollNoticeValidationMessage(value: string) {
  const normalized = normalizePollNotice(value);
  if (normalized !== null && normalized.length > POLL_NOTICE_MAX_LENGTH) {
    return `공지글은 ${POLL_NOTICE_MAX_LENGTH}자 이하로 입력해 주세요.`;
  }
  return null;
}

export function buildPollNoticeMutationFields(
  draft: PollNoticeDraft,
): PollNoticeMutationFields {
  const validationMessage = getPollNoticeValidationMessage(draft.notice);
  if (validationMessage) {
    throw new FaithLogApiError({kind: 'error', message: validationMessage});
  }

  const uniqueIds: number[] = [];
  const seen = new Set<number>();
  for (const assetId of draft.imageAssetIds) {
    if (!Number.isSafeInteger(assetId) || assetId <= 0) {
      throw new Error('Invalid image asset id');
    }
    if (!seen.has(assetId)) {
      seen.add(assetId);
      uniqueIds.push(assetId);
    }
  }

  return {notice: normalizePollNotice(draft.notice), imageAssetIds: uniqueIds};
}
