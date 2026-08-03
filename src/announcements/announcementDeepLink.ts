export type AnnouncementDeepLinkCampusResolution =
  | {status: 'ready'; campusId: number; switched: boolean}
  | {status: 'unavailable'};

export type AnnouncementDeepLinkCommitQueue = {
  enqueue(input: {
    apply: () => void;
    isLatest: () => boolean;
    isSessionCurrent: () => boolean;
    persist: () => Promise<void>;
  }): Promise<boolean>;
};

export type CampusNavigationIntent = {readonly sequence: number};

export type CampusNavigationIntentCoordinator = {
  begin(): CampusNavigationIntent;
  enqueue(input: {
    apply: () => void;
    intent: CampusNavigationIntent;
    isLatest?: () => boolean;
    isSessionCurrent: () => boolean;
    persist: () => Promise<void>;
  }): Promise<boolean>;
  isCurrent(intent: CampusNavigationIntent): boolean;
};

export async function enqueueCampusNavigationRecovery({
  coordinator,
  intent,
  isSessionCurrent,
  persistCampusId,
  readAuthoritativeCampusId,
}: {
  coordinator: CampusNavigationIntentCoordinator;
  intent: CampusNavigationIntent;
  isSessionCurrent: () => boolean;
  persistCampusId: (campusId: number | null) => Promise<void>;
  readAuthoritativeCampusId: () => number | null;
}) {
  return coordinator.enqueue({
    apply: () => undefined,
    intent,
    isSessionCurrent,
    persist: () => persistCampusId(readAuthoritativeCampusId()),
  });
}

export async function handleInitialAnnouncementNotificationOpen({
  getPayload,
  handlePayload,
  isActive,
  isCurrent,
  readSequence,
}: {
  getPayload: () => Promise<unknown>;
  handlePayload: (payload: unknown) => Promise<void>;
  isActive: () => boolean;
  isCurrent?: () => boolean;
  readSequence: () => number;
}) {
  const capturedSequence = readSequence();
  let payload: unknown;
  try {
    payload = await getPayload();
  } catch {
    return false;
  }
  if (
    !isActive() ||
    isCurrent?.() === false ||
    capturedSequence !== readSequence() ||
    payload === null ||
    payload === undefined
  ) return false;
  await handlePayload(payload);
  return true;
}

export function createAnnouncementDeepLinkCommitQueue(): AnnouncementDeepLinkCommitQueue {
  let tail = Promise.resolve();

  return {
    enqueue({apply, isLatest, isSessionCurrent, persist}) {
      const result = tail.then(async () => {
        if (!isLatest() || !isSessionCurrent()) return false;
        await persist();
        // Persistence cannot be cancelled once it starts, but its UI transition
        // must still be rejected when a newer navigation intent supersedes it.
        // The newer intent queues an authoritative persistence correction.
        if (!isLatest() || !isSessionCurrent()) return false;
        apply();
        return true;
      });
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

export function createCampusNavigationIntentCoordinator(): CampusNavigationIntentCoordinator {
  const commits = createAnnouncementDeepLinkCommitQueue();
  let current: CampusNavigationIntent = {sequence: 0};

  return {
    begin() {
      current = {
        sequence: current.sequence >= Number.MAX_SAFE_INTEGER ? 1 : current.sequence + 1,
      };
      return current;
    },
    enqueue({apply, intent, isLatest, isSessionCurrent, persist}) {
      return commits.enqueue({
        apply,
        isLatest: () => intent === current && (isLatest?.() ?? true),
        isSessionCurrent,
        persist,
      });
    },
    isCurrent(intent) {
      return intent === current;
    },
  };
}

export async function resolveAnnouncementDeepLinkCampus({
  currentCampusId,
  refreshCampus,
  targetCampusId,
}: {
  currentCampusId: number;
  refreshCampus: (targetCampusId: number) => Promise<number | null>;
  targetCampusId: number;
}): Promise<AnnouncementDeepLinkCampusResolution> {
  if (targetCampusId === currentCampusId) {
    return {status: 'ready', campusId: currentCampusId, switched: false};
  }

  const selectedCampusId = await refreshCampus(targetCampusId);

  if (selectedCampusId !== targetCampusId) {
    return {status: 'unavailable'};
  }

  return {status: 'ready', campusId: targetCampusId, switched: true};
}
