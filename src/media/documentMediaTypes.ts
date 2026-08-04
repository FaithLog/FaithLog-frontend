export type PdfUploadCandidate = {
  byteSize: number;
  contentType: 'application/pdf';
  fileName: string;
  sha256: string;
  uri: string;
};

export type DocumentUploadReservationRequest = Omit<PdfUploadCandidate, 'uri'>;

export type DocumentUploadReservation = {
  assetId: number;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
  uploadUrl: string;
};

export type ReadyDocumentAsset = {
  assetId: number;
  assetKind: 'PDF';
  byteSize: number;
  contentType: 'application/pdf';
  fileName: string;
  height: null;
  sha256: string;
  status: 'READY';
  width: null;
};

export type DocumentAccessUrl = Omit<ReadyDocumentAsset, 'height' | 'status' | 'width'> & {
  detailUrl: null;
  downloadUrl: string;
  expiresAt: string;
  thumbnailUrl: null;
};
