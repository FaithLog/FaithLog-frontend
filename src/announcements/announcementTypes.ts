export type AnnouncementStatus = 'ARCHIVED' | 'PUBLISHED' | 'SCHEDULED';

export type AnnouncementCategory = {
  color: string;
  id: number;
  isActive: boolean;
  name: string;
  sortOrder: number;
};

export type AnnouncementSummary = {
  attachmentCount: number;
  body: string;
  campusId: number;
  category: AnnouncementCategory;
  documentAssetIds: number[];
  hasAttachments: boolean;
  id: number;
  imageAssetIds: number[];
  pinned: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  status: AnnouncementStatus;
  title: string;
};

export type AnnouncementDetail = AnnouncementSummary;

export type AnnouncementSaveRequest = {
  body: string;
  categoryId: number;
  documentAssetIds: number[];
  imageAssetIds: number[];
  pinned: boolean;
  publishAt: string | null;
  publishMode: 'NOW' | 'SCHEDULED';
  title: string;
};

export type AnnouncementCategorySaveRequest = {
  color: string;
  isActive: boolean;
  name: string;
  sortOrder: number;
};

export type MediaUploadContentType = 'image/jpeg' | 'image/png';

export type MediaUploadReservationRequest = {
  byteSize: number;
  contentType: MediaUploadContentType;
  sha256: string;
};

export type MediaUploadReservation = {
  assetId: number;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
  uploadUrl: string;
};

export type MediaAssetIdentity = MediaUploadReservationRequest & {
  assetId: number;
};

export type MediaAssetProcessing = MediaAssetIdentity & {status: 'PROCESSING'};
export type MediaAssetReady = MediaAssetIdentity & {status: 'READY'};
export type MediaAssetCompletion = MediaAssetProcessing | MediaAssetReady;

export type MediaAccessUrl = {
  assetId: number;
  detailUrl: string;
  expiresAt: string;
  sha256: string;
  thumbnailUrl: string;
};
