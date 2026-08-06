export const weeklyMaterialTypes = [
  'SHEPHERD_GUIDE',
  'SUNDAY_SHARING_SHEET',
  'SATURDAY_LEADER_SHARING_SHEET',
] as const;

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
  SUNDAY_SHARING_SHEET: '주일 나눔지',
  SATURDAY_LEADER_SHARING_SHEET: '토목모 나눔지',
};

export const weeklyMaterialScopeLabels: Partial<Record<WeeklyMaterialType, string>> = {
  SUNDAY_SHARING_SHEET: '모든 캠퍼스 공유',
  SATURDAY_LEADER_SHARING_SHEET: '모든 캠퍼스 공유',
};

export const weeklyMaterialEmptySubjects: Record<WeeklyMaterialType, string> = {
  SHEPHERD_GUIDE: '목자지침이',
  SUNDAY_SHARING_SHEET: '주일 나눔지가',
  SATURDAY_LEADER_SHARING_SHEET: '토목모 나눔지가',
};
