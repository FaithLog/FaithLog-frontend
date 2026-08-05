export const MAX_MEDIA_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_IMAGE_DIMENSION = 4_096;

export type MediaImageCandidate = {
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
};

export type MediaUploadItem = {
  localId: string;
  previewUri: string;
  status: 'pending' | 'uploading' | 'failed' | 'ready';
  progress: number;
  assetId?: number;
  sha256?: string;
  errorMessage?: string;
};

export function getMediaImagePreflight(candidate: MediaImageCandidate):
  | {status: 'ready'}
  | {status: 'needsNormalization'}
  | {status: 'invalid'; message: string} {
  if (candidate.contentType === 'image/heic' || candidate.contentType === 'image/heif') {
    return {status: 'needsNormalization'};
  }
  if (candidate.contentType !== 'image/jpeg' && candidate.contentType !== 'image/png') {
    return {status: 'invalid', message: 'JPEG 또는 PNG 이미지만 사용할 수 있습니다.'};
  }
  if (!Number.isSafeInteger(candidate.byteSize) || candidate.byteSize <= 0 || candidate.byteSize > MAX_MEDIA_IMAGE_BYTES) {
    return {status: 'invalid', message: '이미지는 5MB 이하로 선택해 주세요.'};
  }
  if (
    !Number.isSafeInteger(candidate.width) || !Number.isSafeInteger(candidate.height) ||
    candidate.width <= 0 || candidate.height <= 0 ||
    candidate.width > MAX_MEDIA_IMAGE_DIMENSION || candidate.height > MAX_MEDIA_IMAGE_DIMENSION
  ) {
    return {status: 'invalid', message: '이미지 크기는 4096×4096 이하여야 합니다.'};
  }
  return {status: 'ready'};
}

export function createInitialUploadItems(
  candidates: Array<Pick<MediaUploadItem, 'localId' | 'previewUri'>>,
): MediaUploadItem[] {
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (candidate.localId.trim() === '' || seen.has(candidate.localId)) return [];
    seen.add(candidate.localId);
    return [{...candidate, status: 'pending' as const, progress: 0}];
  });
}

export function markUploadReady(
  items: MediaUploadItem[], localId: string, ready: {assetId: number; sha256: string},
) {
  return items.map((item) => item.localId === localId
    ? toReadyItem(item, ready)
    : item);
}

function toReadyItem(
  item: MediaUploadItem,
  ready: {assetId: number; sha256: string},
): MediaUploadItem {
  const {errorMessage: _errorMessage, ...rest} = item;
  return {...rest, status: 'ready', progress: 1, ...ready};
}

export function markUploadFailed(items: MediaUploadItem[], localId: string, errorMessage: string) {
  return items.map((item) => item.localId === localId
    ? {...item, status: 'failed' as const, errorMessage}
    : item);
}

export function removeUploadItem(items: MediaUploadItem[], localId: string) {
  return items.filter((item) => item.localId !== localId);
}

export function moveUploadItem(items: MediaUploadItem[], localId: string, beforeLocalId: string) {
  if (localId === beforeLocalId) return items;
  const moving = items.find((item) => item.localId === localId);
  if (!moving || !items.some((item) => item.localId === beforeLocalId)) return items;
  const remaining = items.filter((item) => item.localId !== localId);
  const targetIndex = remaining.findIndex((item) => item.localId === beforeLocalId);
  return [...remaining.slice(0, targetIndex), moving, ...remaining.slice(targetIndex)];
}
