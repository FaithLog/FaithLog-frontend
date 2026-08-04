import {FaithLogApiError} from '../api/apiError';
import type {NormalizedPollImage} from '../polls/notice/pollImagePicker';
import type {MediaApi} from './mediaApi';
import {getMediaImagePreflight} from './mediaUploadPolicy';
import type {MediaAssetCompletion, ReadyMediaAsset} from './mediaTypes';

const DEFAULT_COMPLETE_MAX_ATTEMPTS = 4;
const MAX_COMPLETE_MAX_ATTEMPTS = 10;
const DEFAULT_COMPLETE_RETRY_DELAY_MS = 250;
const MAX_COMPLETE_RETRY_DELAY_MS = 5_000;

type CompleteRetryWait = (delayMs: number, signal?: AbortSignal) => Promise<void>;

export type MediaCompleteRetryOptions = {
  maxAttempts?: number;
  wait?: CompleteRetryWait;
};

export type UploadedMediaReservation = {
  assetId: number;
  campusId: number;
  sha256: string;
};

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
  completeRetry,
  image,
  onProgress = () => undefined,
  onUploaded,
  signal,
  transport,
}: {
  accessToken: string;
  api: MediaApi;
  campusId: number;
  completeRetry?: MediaCompleteRetryOptions;
  image: NormalizedPollImage;
  onProgress?: (progress: number) => void;
  onUploaded?: (uploaded: UploadedMediaReservation) => void;
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
  const uploaded = {assetId: reservation.assetId, campusId, sha256: image.sha256};
  onUploaded?.(uploaded);
  assertNotCanceled(signal);
  const ready = await resumeMediaUploadCompletion({
    accessToken,
    api,
    uploaded,
    ...(completeRetry === undefined ? {} : {completeRetry}),
    ...(signal === undefined ? {} : {signal}),
  });
  reportProgress(1);
  return ready;
}

export async function resumeMediaUploadCompletion({
  accessToken,
  api,
  completeRetry,
  signal,
  uploaded,
}: {
  accessToken: string;
  api: MediaApi;
  completeRetry?: MediaCompleteRetryOptions;
  signal?: AbortSignal;
  uploaded: UploadedMediaReservation;
}): Promise<ReadyMediaAsset> {
  return completeMediaAsset({
    accessToken,
    api,
    assetId: uploaded.assetId,
    campusId: uploaded.campusId,
    ...(completeRetry === undefined ? {} : {completeRetry}),
    ...(signal === undefined ? {} : {signal}),
  });
}

async function completeMediaAsset({
  accessToken,
  api,
  assetId,
  campusId,
  completeRetry,
  signal,
}: {
  accessToken: string;
  api: MediaApi;
  assetId: number;
  campusId: number;
  completeRetry?: MediaCompleteRetryOptions;
  signal?: AbortSignal;
}): Promise<ReadyMediaAsset> {
  const maxAttempts = normalizeMaxAttempts(completeRetry?.maxAttempts);
  const wait = completeRetry?.wait ?? waitForCompleteRetry;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    assertNotCanceled(signal);
    let completion: MediaAssetCompletion;
    try {
      completion = await api.complete(accessToken, campusId, assetId);
    } catch (error) {
      assertNotCanceled(signal);
      if (!isRetryableCompleteError(error) || attempt === maxAttempts) throw error;
      await wait(getRetryDelayMs(attempt), signal);
      assertNotCanceled(signal);
      continue;
    }

    assertNotCanceled(signal);
    assertMatchingAssetId(completion, assetId);
    if (completion.status === 'READY') return completion;
    if (attempt === maxAttempts) throw createProcessingError();
    await wait(getRetryDelayMs(attempt, completion.retryAfterMs), signal);
    assertNotCanceled(signal);
  }

  throw createProcessingError();
}

function normalizeMaxAttempts(maxAttempts: number | undefined) {
  if (maxAttempts === undefined) return DEFAULT_COMPLETE_MAX_ATTEMPTS;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'MEDIA_COMPLETE_RETRY_INVALID',
      message: '이미지 처리 재시도 설정이 올바르지 않습니다.',
    });
  }
  return Math.min(maxAttempts, MAX_COMPLETE_MAX_ATTEMPTS);
}

function getRetryDelayMs(attempt: number, retryAfterMs?: number) {
  const delayMs = retryAfterMs ?? DEFAULT_COMPLETE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(MAX_COMPLETE_RETRY_DELAY_MS, Math.max(0, delayMs));
}

function isRetryableCompleteError(error: unknown) {
  if (!(error instanceof FaithLogApiError)) return false;
  const {code, kind, status} = error.detail;
  if (code === 'INVALID_SERVER_RESPONSE' || code === 'MEDIA_UPLOAD_CANCELED') return false;
  return kind === 'offline' ||
    kind === 'conflict' ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500);
}

function assertMatchingAssetId(completion: MediaAssetCompletion, expectedAssetId: number) {
  if (completion.assetId !== expectedAssetId) {
    throw new FaithLogApiError({
      kind: 'error',
      code: 'INVALID_SERVER_RESPONSE',
      message: '업로드한 이미지 정보를 확인하지 못했습니다.',
    });
  }
}

function createProcessingError() {
  return new FaithLogApiError({
    kind: 'conflict',
    code: 'MEDIA_COMPLETE_PROCESSING',
    message: '이미지 처리가 아직 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.',
  });
}

function waitForCompleteRetry(delayMs: number, signal?: AbortSignal) {
  assertNotCanceled(signal);
  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener('abort', cancel);
      reject(createCanceledError());
    };
    signal?.addEventListener('abort', cancel, {once: true});
    timeoutId = setTimeout(finish, delayMs);
  });
}

function assertNotCanceled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createCanceledError();
  }
}

function createCanceledError() {
  return new FaithLogApiError({
    kind: 'error',
    code: 'MEDIA_UPLOAD_CANCELED',
    message: '이미지 업로드가 취소되었습니다.',
  });
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}
