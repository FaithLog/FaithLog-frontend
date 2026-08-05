import {describe, expect, it, vi} from 'vitest';

import {
  pickAndPrepareAnnouncementPdfs,
  type AnnouncementNativeDocumentDependencies,
} from './announcementNativeDocument';

describe('native announcement PDF preparation', () => {
  it('selects PDFs, validates metadata, and hashes the exact bytes', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const dependencies: AnnouncementNativeDocumentDependencies = {
      getByteSize: vi.fn(async () => bytes.byteLength),
      pickDocuments: vi.fn(async () => [{
        contentType: 'application/pdf',
        fileName: ' 주보.pdf ',
        uri: 'file:///cache/bulletin.pdf',
      }]),
      readBytes: vi.fn(async () => bytes),
      sha256: vi.fn(async (value) => {
        expect(value).toEqual(bytes);
        return 'a'.repeat(64);
      }),
    };

    await expect(pickAndPrepareAnnouncementPdfs(dependencies)).resolves.toEqual({
      failures: [],
      prepared: [{
        byteSize: 4,
        contentType: 'application/pdf',
        fileName: '주보.pdf',
        sha256: 'a'.repeat(64),
        sourceIndex: 0,
        uri: 'file:///cache/bulletin.pdf',
      }],
    });
  });

  it('preserves a valid file when another selected PDF fails preflight', async () => {
    const dependencies: AnnouncementNativeDocumentDependencies = {
      getByteSize: vi.fn(async (uri) => uri.includes('empty') ? 0 : 4),
      pickDocuments: vi.fn(async () => [
        {contentType: 'application/pdf', fileName: 'empty.pdf', uri: 'file:///empty.pdf'},
        {contentType: 'application/pdf', fileName: 'valid.pdf', uri: 'file:///valid.pdf'},
      ]),
      readBytes: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
      sha256: vi.fn(async () => 'b'.repeat(64)),
    };

    const result = await pickAndPrepareAnnouncementPdfs(dependencies);

    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0]?.fileName).toBe('valid.pdf');
    expect(result.failures).toEqual([{sourceIndex: 0, userMessage: 'PDF 파일을 확인해 주세요.'}]);
  });
});
