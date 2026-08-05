import {describe, expect, it} from 'vitest';

import {MAX_WEEKLY_MATERIAL_PDF_BYTES} from '../media/pdfAttachmentPolicy';
import {validateWeeklyMaterialPdf} from './weeklyMaterialUpload';

describe('weekly material PDF preflight', () => {
  it('accepts an exact 30 MiB PDF and rejects one byte over the limit', () => {
    expect(validateWeeklyMaterialPdf({
      byteSize: MAX_WEEKLY_MATERIAL_PDF_BYTES,
      contentType: 'application/pdf',
      fileName: '주간자료.pdf',
    })).toEqual({ok: true, fileName: '주간자료.pdf'});
    expect(validateWeeklyMaterialPdf({
      byteSize: MAX_WEEKLY_MATERIAL_PDF_BYTES + 1,
      contentType: 'application/pdf',
      fileName: '주간자료.pdf',
    })).toEqual({ok: false, reason: 'tooLarge'});
  });

  it('rejects empty and non-PDF files before upload', () => {
    expect(validateWeeklyMaterialPdf({byteSize: 0, contentType: 'application/pdf', fileName: 'empty.pdf'}).ok).toBe(false);
    expect(validateWeeklyMaterialPdf({byteSize: 10, contentType: 'text/plain', fileName: 'note.txt'}).ok).toBe(false);
  });
});
