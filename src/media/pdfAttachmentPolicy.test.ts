import {describe, expect, it} from 'vitest';

import {
  MAX_PDF_BYTES,
  formatAttachmentByteSize,
  sanitizePdfFileName,
  validatePdfCandidate,
} from './pdfAttachmentPolicy';

describe('PDF attachment policy', () => {
  it('accepts a non-empty application/pdf file at the exact 10MiB boundary', () => {
    expect(validatePdfCandidate({byteSize: MAX_PDF_BYTES, contentType: 'application/pdf', fileName: '안내.pdf'}))
      .toEqual({ok: true, fileName: '안내.pdf'});
  });

  it.each([
    [{byteSize: 0, contentType: 'application/pdf', fileName: 'a.pdf'}, 'empty'],
    [{byteSize: MAX_PDF_BYTES + 1, contentType: 'application/pdf', fileName: 'a.pdf'}, 'tooLarge'],
    [{byteSize: 1, contentType: 'text/plain', fileName: 'a.pdf'}, 'unsupportedType'],
    [{byteSize: 1, contentType: 'application/pdf', fileName: 'a.txt'}, 'invalidExtension'],
  ] as const)('rejects invalid candidate %#', (candidate, reason) => {
    expect(validatePdfCandidate(candidate)).toEqual({ok: false, reason});
  });

  it('strips control characters without logging or exposing a local path', () => {
    expect(sanitizePdfFileName('  2026\u0000 안내\r\n.pdf  ')).toBe('2026 안내.pdf');
  });

  it('formats readable file sizes', () => {
    expect(formatAttachmentByteSize(1_536)).toBe('1.5 KB');
    expect(formatAttachmentByteSize(2 * 1024 * 1024)).toBe('2 MB');
  });
});
