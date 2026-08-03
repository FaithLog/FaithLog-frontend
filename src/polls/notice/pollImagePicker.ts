import {FaithLogApiError} from '../../api/apiError';

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

export function createProductionPollImagePicker(): PollImagePicker {
  return {
    async pickAndNormalize() {
      throw new FaithLogApiError({
        kind: 'error',
        code: 'NATIVE_MEDIA_DEPENDENCY_PENDING',
        message: '이미지 선택 기능 준비가 필요합니다.',
      });
    },
  };
}
