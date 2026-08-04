import type {DocumentMediaApi} from './documentMediaApi';
import type {PdfUploadCandidate, ReadyDocumentAsset} from './documentMediaTypes';
import {validatePdfCandidate} from './pdfAttachmentPolicy';

export type PdfDirectUploadTransport = {upload(input: {headers: Record<string, string>; onProgress: (progress: number) => void; signal?: AbortSignal; uploadUrl: string; uri: string}): Promise<void>};

export async function runPdfUpload({accessToken, api, campusId, file, onProgress = () => undefined, signal, transport}: {accessToken: string; api: DocumentMediaApi; campusId: number; file: PdfUploadCandidate; onProgress?: (progress: number) => void; signal?: AbortSignal; transport: PdfDirectUploadTransport}): Promise<ReadyDocumentAsset> {
  if (signal?.aborted) throw new Error('PDF upload canceled');
  const checked = validatePdfCandidate(file); if (!checked.ok || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid PDF file');
  onProgress(0);
  const reservation = await api.reserve(accessToken, campusId, {byteSize: file.byteSize, contentType: 'application/pdf', fileName: checked.fileName, sha256: file.sha256});
  if (signal?.aborted) throw new Error('PDF upload canceled');
  await transport.upload({headers: {...reservation.requiredHeaders}, onProgress: (value) => onProgress(Math.min(1, Math.max(0, value))), ...(signal ? {signal} : {}), uploadUrl: reservation.uploadUrl, uri: file.uri});
  if (signal?.aborted) throw new Error('PDF upload canceled');
  const ready = await api.complete(accessToken, campusId, reservation.assetId);
  onProgress(1);
  return ready;
}
