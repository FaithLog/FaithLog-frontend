import type {DocumentMediaApi} from './documentMediaApi';
import type {PdfUploadCandidate, ReadyDocumentAsset} from './documentMediaTypes';
import {validatePdfCandidate} from './pdfAttachmentPolicy';

export type PdfDirectUploadTransport = {upload(input: {headers: Record<string, string>; onProgress: (progress: number) => void; signal?: AbortSignal; uploadUrl: string; uri: string}): Promise<void>};
export type PdfUploadStatus = 'completing' | 'ready' | 'reserving' | 'uploading';

export async function runPdfUpload({accessToken, api, campusId, file, maxPdfBytes, onProgress = () => undefined, onStatus = () => undefined, signal, transport}: {accessToken: string; api: DocumentMediaApi; campusId: number; file: PdfUploadCandidate; maxPdfBytes?: number; onProgress?: (progress: number) => void; onStatus?: (status: PdfUploadStatus) => void; signal?: AbortSignal; transport: PdfDirectUploadTransport}): Promise<ReadyDocumentAsset> {
  if (signal?.aborted) throw new Error('PDF upload canceled');
  const checked = validatePdfCandidate(file, maxPdfBytes); if (!checked.ok || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid PDF file');
  onProgress(0);
  onStatus('reserving');
  const reservation = await api.reserve(accessToken, campusId, {byteSize: file.byteSize, contentType: 'application/pdf', fileName: checked.fileName, sha256: file.sha256});
  if (signal?.aborted) throw new Error('PDF upload canceled');
  onStatus('uploading');
  await transport.upload({headers: {...reservation.requiredHeaders}, onProgress: (value) => onProgress(Math.min(1, Math.max(0, value))), ...(signal ? {signal} : {}), uploadUrl: reservation.uploadUrl, uri: file.uri});
  if (signal?.aborted) throw new Error('PDF upload canceled');
  onStatus('completing');
  const ready = await api.complete(accessToken, campusId, reservation.assetId);
  onProgress(1);
  onStatus('ready');
  return ready;
}
