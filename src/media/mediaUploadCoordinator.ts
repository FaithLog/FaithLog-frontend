import {FaithLogApiError} from '../api/apiError';
import type {NormalizedPollImage} from '../polls/notice/pollImagePicker';
import type {MediaApi} from './mediaApi';
import {getMediaImagePreflight} from './mediaUploadPolicy';
import type {ReadyMediaAsset} from './mediaTypes';

export type MediaDirectUploadTransport = {
  upload(input: {
    headers: Record<string, string>;
    onProgress: (progress: number) => void;
    signal?: AbortSignal;
    uploadUrl: string;
    uri: string;
  }): Promise<void>;
};

export async function runMediaUpload({
  accessToken,
  api,
  campusId,
  image,
  onProgress = () => undefined,
  signal,
  transport,
}: {
  accessToken: string;
  api: MediaApi;
  campusId: number;
  image: NormalizedPollImage;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  transport: MediaDirectUploadTransport;
}): Promise<ReadyMediaAsset> {
  assertNotCanceled(signal);
  const preflight = getMediaImagePreflight(image);
  if (preflight.status !== 'ready') {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'MEDIA_IMAGE_INVALID',
      message: preflight.status === 'invalid'
        ? preflight.message
        : '이미지를 JPEG로 변환한 뒤 다시 시도해 주세요.',
    });
  }

  let lastProgress = -1;
  const reportProgress = (progress: number) => {
    const normalized = clampProgress(progress);
    if (normalized === lastProgress) return;
    lastProgress = normalized;
    onProgress(normalized);
  };
  reportProgress(0);
  const reservation = await api.reserve(accessToken, campusId, {
    contentType: image.contentType,
    byteSize: image.byteSize,
    sha256: image.sha256,
  });
  assertNotCanceled(signal);
  await transport.upload({
    uri: image.uri,
    uploadUrl: reservation.uploadUrl,
    headers: reservation.requiredHeaders,
    ...(signal ? {signal} : {}),
    onProgress: reportProgress,
  });
  assertNotCanceled(signal);
  const ready = await api.complete(accessToken, campusId, reservation.assetId);
  if (ready.assetId !== reservation.assetId || ready.sha256 !== image.sha256) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'INVALID_SERVER_RESPONSE',
      message: '업로드한 이미지 정보를 확인하지 못했습니다.',
    });
  }
  reportProgress(1);
  return ready;
}

function assertNotCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'MEDIA_UPLOAD_CANCELED',
      message: '이미지 업로드가 취소되었습니다.',
    });
  }
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}
