export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type PdfCandidateMetadata = {
  byteSize: number;
  contentType: string;
  fileName: string;
};

export function validatePdfCandidate(candidate: PdfCandidateMetadata):
  | {ok: true; fileName: string}
  | {ok: false; reason: 'empty' | 'invalidExtension' | 'invalidFileName' | 'tooLarge' | 'unsupportedType'} {
  const fileName = sanitizePdfFileName(candidate.fileName);
  if (!Number.isSafeInteger(candidate.byteSize) || candidate.byteSize <= 0) return {ok: false, reason: 'empty'};
  if (candidate.byteSize > MAX_PDF_BYTES) return {ok: false, reason: 'tooLarge'};
  if (candidate.contentType !== 'application/pdf') return {ok: false, reason: 'unsupportedType'};
  if (!fileName) return {ok: false, reason: 'invalidFileName'};
  if (!/\.pdf$/i.test(fileName)) return {ok: false, reason: 'invalidExtension'};
  return {ok: true, fileName};
}

export function sanitizePdfFileName(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ');
}

export function formatAttachmentByteSize(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${formatNumber(value / 1024)} KB`;
  return `${formatNumber(value / (1024 * 1024))} MB`;
}

export function dedupeOrderedDocumentAssetIds(ids: readonly number[]) {
  const seen = new Set<number>();
  return ids.filter((id) => {
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}
