import {describe, expect, it} from 'vitest';

import {
  moveUploadItem,
  reconcileUploadItem,
  validateImagePreflight,
} from './announcementMedia';

describe('announcement media policy', () => {
  it('validates JPEG/PNG byte and dimension limits', () => {
    expect(validateImagePreflight({contentType: 'image/jpeg', byteSize: 1024, width: 800, height: 600})).toEqual({ok: true});
    expect(validateImagePreflight({contentType: 'image/heic', byteSize: 1024, width: 800, height: 600})).toEqual({ok: false, reason: 'conversionRequired'});
    expect(validateImagePreflight({contentType: 'image/png', byteSize: 5 * 1024 * 1024 + 1, width: 800, height: 600})).toEqual({ok: false, reason: 'tooLarge'});
    expect(validateImagePreflight({contentType: 'image/png', byteSize: 1024, width: 4097, height: 600})).toEqual({ok: false, reason: 'invalidDimensions'});
  });

  it('reorders uploads and preserves successful items when another item fails', () => {
    const items = [
      {localId: 'a', status: 'ready' as const, assetId: 1},
      {localId: 'b', status: 'uploading' as const, progress: 0.5},
    ];
    expect(moveUploadItem(items, 1, 0).map((item) => item.localId)).toEqual(['b', 'a']);
    const next = reconcileUploadItem(items, 'b', {localId: 'b', status: 'failed', message: '업로드하지 못했습니다.'});
    expect(next[0]).toMatchObject({status: 'ready', assetId: 1});
    expect(next[1]).toMatchObject({status: 'failed'});
  });
});
