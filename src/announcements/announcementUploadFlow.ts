import type {MediaAssetReady, MediaUploadReservation, MediaUploadReservationRequest} from './announcementTypes';

export type LocalUploadFile = MediaUploadReservationRequest & {localUri: string};
export type MediaBinaryUploadRequest = {headers: Record<string, string>; localUri: string; uploadUrl: string};
export type MediaBinaryUploader = (request: MediaBinaryUploadRequest, onProgress: (progress: number) => void, signal?: AbortSignal) => Promise<void>;
type UploadApi = {
  completeMediaUpload(token: string, campusId: number, assetId: number): Promise<MediaAssetReady>;
  reserveMediaUpload(token: string, campusId: number, body: MediaUploadReservationRequest): Promise<MediaUploadReservation>;
};

export async function uploadAnnouncementImage({api, campusId, file, onProgress, signal, token, uploader}: {api: UploadApi; campusId: number; file: LocalUploadFile; onProgress: (progress: number) => void; signal?: AbortSignal; token: string; uploader?: MediaBinaryUploader}) {
  if (!uploader) throw new MediaUploaderUnavailableError();
  let lastProgress = -1;
  const emitProgress = (progress: number) => {
    const normalized = Math.min(1, Math.max(0, progress));
    if (normalized === lastProgress) return;
    lastProgress = normalized;
    onProgress(normalized);
  };
  emitProgress(0);
  const reservation = await api.reserveMediaUpload(token, campusId, {byteSize: file.byteSize, contentType: file.contentType, sha256: file.sha256});
  await uploader({headers: reservation.requiredHeaders, localUri: file.localUri, uploadUrl: reservation.uploadUrl}, emitProgress, signal);
  const ready = await api.completeMediaUpload(token, campusId, reservation.assetId);
  emitProgress(1);
  return ready;
}

class MediaUploaderUnavailableError extends Error {
  readonly code = 'MEDIA_NATIVE_UPLOADER_UNAVAILABLE';
}
