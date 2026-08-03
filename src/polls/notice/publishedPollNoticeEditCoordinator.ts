export type PublishedPollNoticeEditCoordinator = {
  campusId: number;
  requestId: number;
};

export type PublishedPollNoticeEditIdentity = {
  campusId: number;
  pollId: number;
  requestId: number;
  sessionGeneration: number;
};

export function createPublishedPollNoticeEditCoordinator(
  campusId: number,
): PublishedPollNoticeEditCoordinator {
  return {campusId, requestId: 0};
}

export function commitPublishedPollNoticeEditCampus(
  coordinator: PublishedPollNoticeEditCoordinator,
  campusId: number,
) {
  if (coordinator.campusId === campusId) return false;
  coordinator.campusId = campusId;
  coordinator.requestId += 1;
  return true;
}

export function invalidatePublishedPollNoticeEdit(
  coordinator: PublishedPollNoticeEditCoordinator,
) {
  coordinator.requestId += 1;
}

export function beginPublishedPollNoticeEdit(
  coordinator: PublishedPollNoticeEditCoordinator,
  input: {campusId: number; pollId: number; sessionGeneration: number},
): PublishedPollNoticeEditIdentity {
  commitPublishedPollNoticeEditCampus(coordinator, input.campusId);
  coordinator.requestId += 1;
  return {...input, requestId: coordinator.requestId};
}

export function isPublishedPollNoticeEditCurrent(
  coordinator: PublishedPollNoticeEditCoordinator,
  identity: PublishedPollNoticeEditIdentity,
  currentSessionGeneration: number,
) {
  return coordinator.campusId === identity.campusId &&
    coordinator.requestId === identity.requestId &&
    currentSessionGeneration === identity.sessionGeneration;
}
