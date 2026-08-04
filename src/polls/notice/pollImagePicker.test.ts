import {describe, expect, it} from 'vitest';

import {
  createMockPollImagePicker,
  createProductionPollImagePicker,
} from './pollImagePicker';

describe('poll image picker boundary', () => {
  it('provides normalized metadata in development mock without native dependencies', async () => {
    const picker = createMockPollImagePicker();
    await expect(picker.pickAndNormalize()).resolves.toEqual([
      expect.objectContaining({contentType: 'image/jpeg', exifRemoved: true, orientationCorrected: true}),
    ]);
  });

  it('maps the approved native JPEG preparation boundary into normalized poll images', async () => {
    const picker = createProductionPollImagePicker(async () => ({
      failures: [],
      prepared: [{
        byteSize: 1024,
        contentType: 'image/jpeg',
        height: 900,
        sha256: 'a'.repeat(64),
        sourceIndex: 0,
        uri: 'file:///prepared.jpg',
        width: 1200,
      }],
    }));
    await expect(picker.pickAndNormalize()).resolves.toEqual([
      expect.objectContaining({
        contentType: 'image/jpeg',
        exifRemoved: true,
        orientationCorrected: true,
        sha256: 'a'.repeat(64),
      }),
    ]);
  });
});
