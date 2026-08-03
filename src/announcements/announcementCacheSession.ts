export type AnnouncementCacheSessionState = {
  inactiveCleanupComplete: boolean;
  userId: number | null;
};

export type AnnouncementCacheSessionAction =
  | {type: 'none'}
  | {type: 'clearAll'}
  | {type: 'clearUser'; userId: number};

export const initialAnnouncementCacheSession: AnnouncementCacheSessionState = {
  inactiveCleanupComplete: false,
  userId: null,
};

const terminalSignedOutStatuses = new Set([
  'configurationError',
  'sessionExpired',
  'signedOut',
]);

export function transitionAnnouncementCacheSession(
  state: AnnouncementCacheSessionState,
  input: {
    authStatus: string;
    capabilityEnabled: boolean;
    userId: number | null;
  },
): {action: AnnouncementCacheSessionAction; state: AnnouncementCacheSessionState} {
  if (!input.capabilityEnabled) {
    return {
      action: state.inactiveCleanupComplete ? {type: 'none'} : {type: 'clearAll'},
      state: {inactiveCleanupComplete: true, userId: null},
    };
  }

  if (input.authStatus === 'authenticated' || input.authStatus === 'noCampus') {
    if (!Number.isSafeInteger(input.userId) || (input.userId ?? 0) <= 0) {
      return {action: {type: 'none'}, state};
    }
    const userId = input.userId as number;
    return {
      action: state.userId !== null && state.userId !== userId
        ? {type: 'clearUser', userId: state.userId}
        : {type: 'none'},
      state: {inactiveCleanupComplete: false, userId},
    };
  }

  if (!terminalSignedOutStatuses.has(input.authStatus)) {
    // Loading and recoverable bootstrap errors do not prove logout. Keep the
    // persistent seven-day cache until authentication reaches a terminal state.
    return {action: {type: 'none'}, state};
  }

  if (state.userId !== null) {
    return {
      action: {type: 'clearUser', userId: state.userId},
      state: {inactiveCleanupComplete: true, userId: null},
    };
  }
  return {
    action: state.inactiveCleanupComplete ? {type: 'none'} : {type: 'clearAll'},
    state: {inactiveCleanupComplete: true, userId: null},
  };
}
