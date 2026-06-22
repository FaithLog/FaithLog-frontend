export type ApiEnvelope<T> = {
  success: boolean;
  code: string;
  message: string;
  data?: T | null;
  timestamp: string;
};

export type ApiErrorKind =
  | 'sessionExpired'
  | 'permissionDenied'
  | 'conflict'
  | 'offline'
  | 'error';

export type ApiError = {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  message: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer' | string;
};

export type UserRole = 'USER' | 'MANAGER' | 'ADMIN';

export type CampusRole =
  | 'MEMBER'
  | 'CAMPUS_LEADER'
  | 'ELDER'
  | 'MINISTER';

export type CampusStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | string;

export type CampusMembershipSummary = {
  membershipId: number;
  campusId: number;
  campusName: string;
  region: string;
  campusRole: CampusRole;
  status: CampusStatus;
};

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  campusMemberships: CampusMembershipSummary[];
};
