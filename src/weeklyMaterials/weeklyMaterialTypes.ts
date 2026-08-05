export const weeklyMaterialTypes = ['SHEPHERD_GUIDE', 'SHARING_SHEET'] as const;

export type WeeklyMaterialType = (typeof weeklyMaterialTypes)[number];

export type WeeklyMaterial = {
  materialType: WeeklyMaterialType;
  mediaAssetId: number;
  fileName: string;
  byteSize: number;
  sha256: string;
  updatedAt: string;
};

export type WeeklyMaterialWeek = {
  campusId: number;
  weekStartDate: string;
  materials: WeeklyMaterial[];
};

export type WeeklyMaterialYearPage = {
  content: WeeklyMaterialWeek[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export const weeklyMaterialLabels: Record<WeeklyMaterialType, string> = {
  SHEPHERD_GUIDE: '목자지침',
  SHARING_SHEET: '나눔지',
};
