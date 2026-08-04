import {pickAndPrepareAnnouncementImages} from '../../announcements/announcementNativeMedia';

export type NormalizedPollImage = {
  localId: string;
  uri: string;
  contentType: 'image/jpeg' | 'image/png';
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  exifRemoved: true;
  orientationCorrected: true;
};

export type PollImagePicker = {
  pickAndNormalize(): Promise<NormalizedPollImage[]>;
};

export function createMockPollImagePicker(): PollImagePicker {
  return {
    async pickAndNormalize() {
      return [{
        localId: 'mock-normalized-1',
        uri: 'mock://poll-image/normalized-1',
        contentType: 'image/jpeg',
        byteSize: 1_024,
        width: 1_200,
        height: 900,
        sha256: '1'.repeat(64),
        exifRemoved: true,
        orientationCorrected: true,
      }];
    },
  };
}

export function createProductionPollImagePicker(
  pickAndPrepare = pickAndPrepareAnnouncementImages,
): PollImagePicker {
  return {
    async pickAndNormalize() {
      const result = await pickAndPrepare();
      return result.prepared.map((image) => ({
        localId: `poll-native-${image.sourceIndex}-${nextImageIdentity()}`,
        uri: image.uri,
        contentType: image.contentType,
        byteSize: image.byteSize,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        exifRemoved: true,
        orientationCorrected: true,
      }));
    },
  };
}

let imageIdentity = 0;

function nextImageIdentity() {
  imageIdentity += 1;
  return imageIdentity;
}
