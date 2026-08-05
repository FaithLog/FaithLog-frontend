import {FaithLogApiError} from '../api/apiError';
import type {
  MediaAssetCompletion,
  MediaAssetIdentity,
  MediaAssetReady,
  MediaUploadReservation,
  MediaUploadReservationRequest,
} from './announcementTypes';
import type {ApiError} from '../api/types';

export type LocalUploadFile = MediaUploadReservationRequest & {localUri: string};
export type MediaBinaryUploadRequest = {headers: Record<string, string>; localUri: string; uploadUrl: string};
export type MediaBinaryUploader = (request: MediaBinaryUploadRequest, onProgress: (progress: number) => void, signal?: AbortSignal) => Promise<void>;
export type MediaBinaryUploadRetryContext = {
  file: LocalUploadFile;
  identity: MediaAssetIdentity;
  reservation: MediaUploadReservation;
};
type UploadApi = {
  completeMediaUpload(token: string, campusId: number, expected: MediaAssetIdentity): Promise<MediaAssetCompletion>;
  reserveMediaUpload(token: string, campusId: number, body: MediaUploadReservationRequest): Promise<MediaUploadReservation>;
};
export type MediaCompletionWait = (milliseconds: number, signal?: AbortSignal) => Promise<void>;
export type MediaCompletionPolling = {
  intervalMs?: number;
  maxAttempts?: number;
  wait?: MediaCompletionWait;
};

const defaultCompletionIntervalMs = 500;
const defaultCompletionMaxAttempts = 3;

export class MediaAssetProcessingError extends FaithLogApiError {
  readonly identity: MediaAssetIdentity;
  readonly reason: 'processing' | 'rateLimited' | 'unknown';

  constructor(
    identity: MediaAssetIdentity,
    reason: 'processing' | 'rateLimited' | 'unknown' = 'processing',
  ) {
    super({
      kind: 'error',
      code: 'MEDIA_ASSET_PROCESSING',
      message: '이미지를 처리하고 있습니다. 잠시 후 다시 시도해 주세요.',
    });
    this.name = 'MediaAssetProcessingError';
    this.identity = identity;
    this.reason = reason;
  }
}

export class MediaAssetCompletionRejectedError extends FaithLogApiError {
  readonly identity: MediaAssetIdentity;

  constructor(identity: MediaAssetIdentity, detail: ApiError) {
    super(detail);
    this.name = 'MediaAssetCompletionRejectedError';
    this.identity = identity;
  }
}

export class MediaBinaryUploadHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Announcement media upload failed with status ${String(status)}.`);
    this.name = 'MediaBinaryUploadHttpError';
    this.status = status;
  }
}

export class MediaBinaryUploadUncertainError extends Error {
  readonly code = 'MEDIA_BINARY_UPLOAD_OUTCOME_UNKNOWN';
  readonly context: MediaBinaryUploadRetryContext;

  constructor(context: MediaBinaryUploadRetryContext) {
    super('Announcement media upload outcome is unknown.');
    this.name = 'MediaBinaryUploadUncertainError';
    this.context = context;
  }
}

export async function uploadAnnouncementImage({api, campusId, completionPolling, file, onProgress, signal, token, uploader}: {api: UploadApi; campusId: number; completionPolling?: MediaCompletionPolling; file: LocalUploadFile; onProgress: (progress: number) => void; signal?: AbortSignal; token: string; uploader?: MediaBinaryUploader}) {
  if (!uploader) throw new MediaUploaderUnavailableError();
  const emitProgress = createProgressEmitter(onProgress);
  throwIfUploadAborted(signal);
  emitProgress(0);
  const reservation = await api.reserveMediaUpload(token, campusId, {byteSize: file.byteSize, contentType: file.contentType, sha256: file.sha256});
  throwIfUploadAborted(signal);
  return uploadReservedAnnouncementImage({
    api,
    campusId,
    completionPolling,
    context: createRetryContext(file, reservation),
    emitProgress,
    signal,
    token,
    uploader,
  });
}

export async function retryAnnouncementImageUpload({api, campusId, completionPolling, context, onProgress, signal, token, uploader}: {api: UploadApi; campusId: number; completionPolling?: MediaCompletionPolling; context: MediaBinaryUploadRetryContext; onProgress: (progress: number) => void; signal?: AbortSignal; token: string; uploader?: MediaBinaryUploader}) {
  if (!uploader) throw new MediaUploaderUnavailableError();
  const emitProgress = createProgressEmitter(onProgress);
  throwIfUploadAborted(signal);
  emitProgress(0);
  return uploadReservedAnnouncementImage({
    api,
    campusId,
    completionPolling,
    context,
    emitProgress,
    signal,
    token,
    uploader,
  });
}

export async function resumeAnnouncementImageCompletion({
  api,
  campusId,
  completionPolling,
  identity,
  signal,
  token,
}: {
  api: UploadApi;
  campusId: number;
  completionPolling?: MediaCompletionPolling;
  identity: MediaAssetIdentity;
  signal?: AbortSignal;
  token: string;
}) {
  try {
    return await waitForMediaReady(api, token, campusId, identity, completionPolling, signal);
  } catch (error) {
    if (signal?.aborted || error instanceof MediaAssetProcessingError) throw error;
    if (error instanceof FaithLogApiError) {
      if (error.detail.status === 429) {
        throw new MediaAssetProcessingError(identity, 'rateLimited');
      }
      if (error.detail.kind === 'offline' || (error.detail.status ?? 0) >= 500) {
        throw new MediaAssetProcessingError(identity, 'unknown');
      }
      throw new MediaAssetCompletionRejectedError(identity, error.detail);
    }
    // A transport/parser exception has an unknown completion outcome. Keep the
    // reservation identity so retry performs completion only.
    throw new MediaAssetProcessingError(identity, 'unknown');
  }
}

async function waitForMediaReady(
  api: UploadApi,
  token: string,
  campusId: number,
  expected: MediaAssetIdentity,
  polling: MediaCompletionPolling | undefined,
  signal: AbortSignal | undefined,
): Promise<MediaAssetReady> {
  const maxAttempts = polling?.maxAttempts ?? defaultCompletionMaxAttempts;
  const intervalMs = polling?.intervalMs ?? defaultCompletionIntervalMs;
  const wait = polling?.wait ?? waitForDelay;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
    throw new TypeError('maxAttempts must be a positive safe integer');
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new TypeError('intervalMs must be a non-negative safe integer');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const completion = await api.completeMediaUpload(token, campusId, expected);
    if (completion.status === 'READY') return completion;
    if (attempt + 1 < maxAttempts) await wait(intervalMs, signal);
  }

  throw new MediaAssetProcessingError(expected);
}

async function uploadReservedAnnouncementImage({
  api,
  campusId,
  completionPolling,
  context,
  emitProgress,
  signal,
  token,
  uploader,
}: {
  api: UploadApi;
  campusId: number;
  completionPolling: MediaCompletionPolling | undefined;
  context: MediaBinaryUploadRetryContext;
  emitProgress: (progress: number) => void;
  signal: AbortSignal | undefined;
  token: string;
  uploader: MediaBinaryUploader;
}) {
  try {
    await uploader(
      {
        headers: context.reservation.requiredHeaders,
        localUri: context.file.localUri,
        uploadUrl: context.reservation.uploadUrl,
      },
      (progress) => emitProgress(Math.min(0.99, progress)),
      signal,
    );
  } catch (error) {
    if (signal?.aborted || error instanceof MediaBinaryUploadHttpError) throw error;
    if (error instanceof MediaBinaryUploadUncertainError) throw error;
    throw new MediaBinaryUploadUncertainError(context);
  }
  throwIfUploadAborted(signal);
  const ready = await resumeAnnouncementImageCompletion({
    api,
    campusId,
    identity: context.identity,
    token,
    ...(completionPolling === undefined ? {} : {completionPolling}),
    ...(signal === undefined ? {} : {signal}),
  });
  emitProgress(1);
  return ready;
}

function createRetryContext(
  file: LocalUploadFile,
  reservation: MediaUploadReservation,
): MediaBinaryUploadRetryContext {
  return {
    file: {...file},
    identity: {
      assetId: reservation.assetId,
      byteSize: file.byteSize,
      contentType: file.contentType,
      sha256: file.sha256,
    },
    reservation: {
      ...reservation,
      requiredHeaders: {...reservation.requiredHeaders},
    },
  };
}

function createProgressEmitter(onProgress: (progress: number) => void) {
  let lastProgress = -1;
  return (progress: number) => {
    if (!Number.isFinite(progress)) return;
    const normalized = Math.min(1, Math.max(0, progress));
    if (normalized === lastProgress) return;
    lastProgress = normalized;
    onProgress(normalized);
  };
}

function waitForDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal ? abortReason(signal) : new Error('Upload aborted'));
    };
    signal?.addEventListener('abort', onAbort, {once: true});
  });
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error ? signal.reason : new Error('Upload aborted');
}

function throwIfUploadAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortReason(signal);
}

class MediaUploaderUnavailableError extends Error {
  readonly code = 'MEDIA_NATIVE_UPLOADER_UNAVAILABLE';
}
