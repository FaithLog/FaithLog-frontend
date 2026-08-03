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

export type MediaAccessUrl = {
  assetId: number;
  thumbnailUrl: string;
  detailUrl: string;
  expiresAt: string;
};
