import {apiRequest} from '../api/client';
import {createDocumentMediaApi} from '../media/documentMediaApi';
import {MAX_WEEKLY_MATERIAL_PDF_BYTES} from '../media/pdfAttachmentPolicy';

export const weeklyMaterialDocumentMediaApi = createDocumentMediaApi({
  contractStatus: 'confirmed',
  maxPdfBytes: MAX_WEEKLY_MATERIAL_PDF_BYTES,
  request: (path, options) => apiRequest(path, options),
});
