import {describe, expect, it} from 'vitest';

import {
  MAX_MEDIA_IMAGE_BYTES,
  MAX_MEDIA_IMAGE_DIMENSION,
  createInitialUploadItems,
  getMediaImagePreflight,
  markUploadFailed,
  markUploadReady,
  moveUploadItem,
  removeUploadItem,
} from './mediaUploadPolicy';

describe('poll image upload policy', () => {
  it('accepts JPEG/PNG within the approved client preflight bounds', () => {
    expect(getMediaImagePreflight({contentType: 'image/jpeg', byteSize: 100, width: 100, height: 200})).toEqual({status: 'ready'});
    expect(getMediaImagePreflight({contentType: 'image/png', byteSize: MAX_MEDIA_IMAGE_BYTES, width: MAX_MEDIA_IMAGE_DIMENSION, height: 1})).toEqual({status: 'ready'});
  });

  it('requires HEIC normalization and rejects unsupported/oversized input', () => {
    expect(getMediaImagePreflight({contentType: 'image/heic', byteSize: 100, width: 100, height: 100})).toEqual({status: 'needsNormalization'});
    expect(getMediaImagePreflight({contentType: 'image/gif', byteSize: 100, width: 100, height: 100})).toMatchObject({status: 'invalid'});
    expect(getMediaImagePreflight({contentType: 'image/jpeg', byteSize: MAX_MEDIA_IMAGE_BYTES + 1, width: 100, height: 100})).toMatchObject({status: 'invalid'});
    expect(getMediaImagePreflight({contentType: 'image/jpeg', byteSize: 100, width: MAX_MEDIA_IMAGE_DIMENSION + 1, height: 100})).toMatchObject({status: 'invalid'});
  });

  it('supports add, reorder, remove and preserves successful items after a partial failure', () => {
    const initial = createInitialUploadItems([
      {localId: 'a', previewUri: 'memory://a'},
      {localId: 'b', previewUri: 'memory://b'},
      {localId: 'c', previewUri: 'memory://c'},
    ]);
    const ready = markUploadReady(initial, 'a', {assetId: 10, sha256: 'a'.repeat(64)});
    const failed = markUploadFailed(ready, 'b', '업로드하지 못했습니다.');
    const reordered = moveUploadItem(failed, 'c', 'a');

    expect(reordered.map((item) => item.localId)).toEqual(['c', 'a', 'b']);
    expect(reordered.find((item) => item.localId === 'a')).toMatchObject({status: 'ready', assetId: 10});
    expect(reordered.find((item) => item.localId === 'b')).toMatchObject({status: 'failed'});
    expect(removeUploadItem(reordered, 'b').map((item) => item.localId)).toEqual(['c', 'a']);
  });
});
