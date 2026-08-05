import type {PdfCandidateMetadata} from '../media/pdfAttachmentPolicy';
import {
  MAX_WEEKLY_MATERIAL_PDF_BYTES,
  validatePdfCandidate,
} from '../media/pdfAttachmentPolicy';

export function validateWeeklyMaterialPdf(candidate: PdfCandidateMetadata) {
  return validatePdfCandidate(candidate, MAX_WEEKLY_MATERIAL_PDF_BYTES);
}
