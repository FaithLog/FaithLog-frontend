import {
  FaithLogApiError,
  apiRequest,
  buildAdminCampusPath,
  buildApiPath,
  buildCampusPath,
  toDatePathSegment,
  toMondayDatePathSegment,
  toPositiveIntegerPathSegment,
} from './client';
import type {
  AdminPrayerAssignableMember,
  AdminPrayerGroup,
  AdminPrayerGroupCreateRequest,
  AdminPrayerGroupMembersReplaceRequest,
  AdminPrayerGroupUpdateRequest,
  AdminPrayerSeason,
  AdminPrayerSeasonCloseRequest,
  AdminPrayerSeasonCreateRequest,
  PrayerSelfSaveRequest,
  PrayerSubmissionSaveRequest,
  PrayerWeekSummary,
} from './types';

function toRequiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FaithLogApiError({
      kind: 'error',
      message: `${label} 값을 입력해 주세요.`,
    });
  }

  return value.trim();
}

function toPositiveSortOrder(value: unknown, label: string) {
  return Number(toPositiveIntegerPathSegment(value, label));
}

function toAdminPrayerSeasonCreateRequest(
  body: AdminPrayerSeasonCreateRequest,
): AdminPrayerSeasonCreateRequest {
  return {
    name: toRequiredString(body.name, '기도 운영 기간 이름'),
    startDate: toDatePathSegment(body.startDate, 'startDate'),
  };
}

function toAdminPrayerSeasonCloseRequest(
  body: AdminPrayerSeasonCloseRequest,
): AdminPrayerSeasonCloseRequest {
  return {
    endDate: toDatePathSegment(body.endDate, 'endDate'),
  };
}

function toAdminPrayerGroupCreateRequest(
  body: AdminPrayerGroupCreateRequest,
): AdminPrayerGroupCreateRequest {
  return {
    name: toRequiredString(body.name, '기도조 이름'),
    sortOrder: toPositiveSortOrder(body.sortOrder, 'sortOrder'),
  };
}

function toAdminPrayerGroupUpdateRequest(
  body: AdminPrayerGroupUpdateRequest,
): AdminPrayerGroupUpdateRequest {
  return {
    isActive: Boolean(body.isActive),
    name: toRequiredString(body.name, '기도조 이름'),
    sortOrder: toPositiveSortOrder(body.sortOrder, 'sortOrder'),
  };
}

function toAdminPrayerGroupMembersReplaceRequest(
  body: AdminPrayerGroupMembersReplaceRequest,
): AdminPrayerGroupMembersReplaceRequest {
  const seen = new Set<number>();
  const userIds = body.userIds.map((userId) =>
    Number(toPositiveIntegerPathSegment(userId, 'userIds')),
  );

  userIds.forEach((userId) => {
    if (seen.has(userId)) {
      throw new FaithLogApiError({
        kind: 'error',
        message: '기도조 멤버 userId가 중복되었습니다.',
      });
    }

    seen.add(userId);
  });

  return {userIds};
}

function toPrayerSelfSaveRequest(body: PrayerSelfSaveRequest): PrayerSelfSaveRequest {
  return {
    content: typeof body.content === 'string' && body.content.trim().length > 0
      ? body.content.trim()
      : null,
  };
}

export const prayerApi = {
  getCurrentSeason(accessToken: string, campusId: unknown) {
    return apiRequest<AdminPrayerSeason | null>(
      buildAdminCampusPath(campusId, 'prayer-seasons', 'current'),
      {accessToken},
    );
  },

  createSeason(
    accessToken: string,
    campusId: unknown,
    body: AdminPrayerSeasonCreateRequest,
  ) {
    return apiRequest<AdminPrayerSeason>(
      buildAdminCampusPath(campusId, 'prayer-seasons'),
      {
        accessToken,
        body: toAdminPrayerSeasonCreateRequest(body),
        method: 'POST',
      },
    );
  },

  closeSeason(
    accessToken: string,
    seasonId: unknown,
    body: AdminPrayerSeasonCloseRequest,
  ) {
    return apiRequest<AdminPrayerSeason>(
      buildApiPath(
        'admin',
        'prayer-seasons',
        toPositiveIntegerPathSegment(seasonId, 'seasonId'),
        'close',
      ),
      {
        accessToken,
        body: toAdminPrayerSeasonCloseRequest(body),
        method: 'PATCH',
      },
    );
  },

  getSeasonGroups(accessToken: string, seasonId: unknown) {
    return apiRequest<AdminPrayerGroup[]>(
      buildApiPath(
        'admin',
        'prayer-seasons',
        toPositiveIntegerPathSegment(seasonId, 'seasonId'),
        'groups',
      ),
      {accessToken},
    );
  },

  createGroup(
    accessToken: string,
    seasonId: unknown,
    body: AdminPrayerGroupCreateRequest,
  ) {
    return apiRequest<AdminPrayerGroup>(
      buildApiPath(
        'admin',
        'prayer-seasons',
        toPositiveIntegerPathSegment(seasonId, 'seasonId'),
        'groups',
      ),
      {
        accessToken,
        body: toAdminPrayerGroupCreateRequest(body),
        method: 'POST',
      },
    );
  },

  updateGroup(
    accessToken: string,
    groupId: unknown,
    body: AdminPrayerGroupUpdateRequest,
  ) {
    return apiRequest<AdminPrayerGroup>(
      buildApiPath(
        'admin',
        'prayer-groups',
        toPositiveIntegerPathSegment(groupId, 'groupId'),
      ),
      {
        accessToken,
        body: toAdminPrayerGroupUpdateRequest(body),
        method: 'PATCH',
      },
    );
  },

  getAssignableMembers(accessToken: string, seasonId: unknown) {
    return apiRequest<AdminPrayerAssignableMember[]>(
      buildApiPath(
        'admin',
        'prayer-seasons',
        toPositiveIntegerPathSegment(seasonId, 'seasonId'),
        'members',
        'assignable',
      ),
      {accessToken},
    );
  },

  replaceGroupMembers(
    accessToken: string,
    groupId: unknown,
    body: AdminPrayerGroupMembersReplaceRequest,
  ) {
    return apiRequest<AdminPrayerGroup>(
      buildApiPath(
        'admin',
        'prayer-groups',
        toPositiveIntegerPathSegment(groupId, 'groupId'),
        'members',
      ),
      {
        accessToken,
        body: toAdminPrayerGroupMembersReplaceRequest(body),
        method: 'PUT',
      },
    );
  },

  getPrayerWeekBoard(accessToken: string, campusId: unknown, weekStartDate: string) {
    return apiRequest<PrayerWeekSummary>(
      buildCampusPath(
        campusId,
        'prayers',
        'weeks',
        toMondayDatePathSegment(weekStartDate, 'weekStartDate'),
      ),
      {accessToken},
    );
  },

  saveSubmissions(
    accessToken: string,
    campusId: unknown,
    weekStartDate: string,
    body: PrayerSubmissionSaveRequest,
  ) {
    return apiRequest<PrayerWeekSummary>(
      buildCampusPath(
        campusId,
        'prayers',
        'weeks',
        toMondayDatePathSegment(weekStartDate, 'weekStartDate'),
        'submissions',
      ),
      {
        accessToken,
        body,
        method: 'PUT',
      },
    );
  },

  saveMyPrayer(
    accessToken: string,
    campusId: unknown,
    weekStartDate: string,
    body: PrayerSelfSaveRequest,
  ) {
    return apiRequest<PrayerWeekSummary>(
      buildCampusPath(
        campusId,
        'prayers',
        'weeks',
        toMondayDatePathSegment(weekStartDate, 'weekStartDate'),
        'me',
      ),
      {
        accessToken,
        body: toPrayerSelfSaveRequest(body),
        method: 'PUT',
      },
    );
  },
};
