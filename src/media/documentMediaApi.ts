import {FaithLogApiError} from '../api/apiError';
import {apiRequest} from '../api/client';
import type {
  DocumentAccessUrl,
  DocumentUploadReservation,
  DocumentUploadReservationRequest,
  ReadyDocumentAsset,
} from './documentMediaTypes';
import {sanitizePdfFileName, validatePdfCandidate} from './pdfAttachmentPolicy';

export type DocumentMediaRequestOptions<T> = {accessToken: string; body?: unknown; expectedStatuses?: readonly number[]; method: 'POST'; responseParser: (value: unknown) => T};
export type DocumentMediaRequest = <T>(path: string, options: DocumentMediaRequestOptions<T>) => Promise<T>;
export type DocumentContractStatus = 'confirmed' | 'pending';

export type DocumentMediaApi = {
  reserve(token: string, campusId: number, body: DocumentUploadReservationRequest): Promise<DocumentUploadReservation>;
  complete(token: string, campusId: number, assetId: number): Promise<ReadyDocumentAsset>;
  getAccessUrls(token: string, campusId: number, assetIds: number[]): Promise<DocumentAccessUrl[]>;
};

export function createDocumentMediaApi({contractStatus, maxPdfBytes, request}: {contractStatus: DocumentContractStatus; maxPdfBytes?: number; request: DocumentMediaRequest}): DocumentMediaApi {
  const confirmed = () => {
    if (contractStatus !== 'confirmed') throw new FaithLogApiError({kind: 'error', code: 'API_CONTRACT_PENDING', message: 'PDF 첨부 기능을 준비하고 있습니다.'});
  };
  return {
    async reserve(token, campusId, body) {
      confirmed();
      const checked = validatePdfCandidate(body, maxPdfBytes);
      if (!checked.ok || !/^[a-f0-9]{64}$/.test(body.sha256)) invalidRequest();
      return request(`/api/v1/admin/campuses/${id(campusId)}/media-assets/upload-reservations`, {
        accessToken: token, body: {...body, fileName: checked.fileName}, expectedStatuses: [201], method: 'POST', responseParser: parseReservation,
      });
    },
    async complete(token, campusId, assetId) {
      confirmed();
      const expected = id(assetId);
      return request(`/api/v1/admin/campuses/${id(campusId)}/media-assets/${expected}/complete`, {
        accessToken: token, expectedStatuses: [200], method: 'POST', responseParser: (value) => parseReady(value, expected),
      });
    },
    async getAccessUrls(token, campusId, assetIds) {
      confirmed();
      const ordered = exactIds(assetIds);
      const output: DocumentAccessUrl[] = [];
      for (let offset = 0; offset < ordered.length; offset += 100) {
        const chunk = ordered.slice(offset, offset + 100);
        const result = await request(`/api/v1/campuses/${id(campusId)}/media-assets/access-urls`, {
          accessToken: token, body: {assetIds: chunk}, expectedStatuses: [200], method: 'POST', responseParser: (value) => parseAccess(value, chunk),
        });
        output.push(...result);
      }
      return output;
    },
  };
}

export const documentMediaApi = createDocumentMediaApi({
  contractStatus: 'confirmed',
  request: ((path, options) =>
    (apiRequest as unknown as DocumentMediaRequest)(path, options)) as DocumentMediaRequest,
});

function parseReservation(value: unknown): DocumentUploadReservation {
  const record = object(value); const requiredHeaders = object(record.requiredHeaders); const headers: Record<string, string> = {};
  for (const [key, header] of Object.entries(requiredHeaders)) { if (!key.trim() || typeof header !== 'string') invalidResponse(); headers[key] = header; }
  return {assetId: id(record.assetId), uploadUrl: https(record.uploadUrl), requiredHeaders: headers, expiresAt: iso(record.expiresAt)};
}

function parseReady(value: unknown, expectedId: number): ReadyDocumentAsset {
  const record = object(value);
  if (record.status !== 'READY' || record.assetKind !== 'PDF' || record.contentType !== 'application/pdf' || record.width !== null || record.height !== null) invalidResponse();
  const assetId = id(record.assetId); if (assetId !== expectedId) invalidResponse();
  return {assetId, assetKind: 'PDF', status: 'READY', contentType: 'application/pdf', fileName: fileName(record.fileName), sha256: hash(record.sha256), byteSize: positive(record.byteSize), width: null, height: null};
}

function parseAccess(value: unknown, expected: number[]): DocumentAccessUrl[] {
  if (!Array.isArray(value) || value.length !== expected.length) invalidResponse();
  return value.map((raw, index) => {
    const item = object(raw); const assetId = id(item.assetId); if (assetId !== expected[index] || item.assetKind !== 'PDF' || item.contentType !== 'application/pdf' || item.thumbnailUrl !== null || item.detailUrl !== null) invalidResponse();
    return {assetId, assetKind: 'PDF', contentType: 'application/pdf', fileName: fileName(item.fileName), sha256: hash(item.sha256), byteSize: positive(item.byteSize), thumbnailUrl: null, detailUrl: null, downloadUrl: https(item.downloadUrl), expiresAt: iso(item.expiresAt)};
  });
}

function exactIds(values: number[]) { const result: number[] = []; const seen = new Set<number>(); for (const value of values) { const parsed = id(value); if (seen.has(parsed)) invalidRequest(); seen.add(parsed); result.push(parsed); } return result; }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalidResponse(); return value as Record<string, unknown>; }
function id(value: unknown) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) invalidResponse(); return value; }
function positive(value: unknown) { return id(value); }
function hash(value: unknown) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalidResponse(); return value; }
function fileName(value: unknown) { if (typeof value !== 'string') invalidResponse(); const safe = sanitizePdfFileName(value); if (!safe || !/\.pdf$/i.test(safe)) invalidResponse(); return safe; }
function iso(value: unknown) { if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) invalidResponse(); return value; }
function https(value: unknown) { if (typeof value !== 'string') invalidResponse(); try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) invalidResponse(); return value; } catch { invalidResponse(); } }
function invalidRequest(): never { throw new FaithLogApiError({kind: 'error', code: 'MEDIA_PDF_INVALID', message: 'PDF 파일 정보를 확인해 주세요.'}); }
function invalidResponse(): never { throw new FaithLogApiError({kind: 'error', code: 'INVALID_SERVER_RESPONSE', message: 'PDF 첨부 응답을 확인할 수 없습니다.'}); }
