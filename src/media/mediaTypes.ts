export type MediaVariant = 'thumbnail' | 'detail';

export type MediaUploadReservationRequest = {
  contentType: 'image/jpeg' | 'image/png';
  byteSize: number;
  sha256: string;
};
export type MediaUploadReservation = {
  assetId: number;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
};

export type ReadyMediaAsset = {
  assetId: number;
  status: 'READY';
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
};

export type ProcessingMediaAsset = {
  assetId: number;
  status: 'PROCESSING';
  retryAfterMs?: number;
};

export type MediaAssetCompletion = ReadyMediaAsset | ProcessingMediaAsset;

export type MediaAccessUrl = {
  assetId: number;
  sha256: string;
  thumbnailUrl: string;
  detailUrl: string;
  expiresAt: string;
};
