export type AdminLoadIdentity = {
  campusId: number;
  generation: number;
  operationId: number;
};

export type AdminLoadCoordinator = {
  committedCampusId: number;
  currentOperationId: number;
  nextOperationId: number;
};

export function createAdminLoadCoordinator(campusId: number): AdminLoadCoordinator {
  return {
    committedCampusId: campusId,
    currentOperationId: 0,
    nextOperationId: 0,
  };
}

export function commitAdminLoadCampus(
  coordinator: AdminLoadCoordinator,
  campusId: number,
) {
  if (coordinator.committedCampusId === campusId) return;
  coordinator.committedCampusId = campusId;
  coordinator.currentOperationId = ++coordinator.nextOperationId;
}

export function beginAdminLoad(
  coordinator: AdminLoadCoordinator,
  campusId: number,
  generation: number,
): AdminLoadIdentity | null {
  if (coordinator.committedCampusId !== campusId) return null;
  const operationId = ++coordinator.nextOperationId;
  coordinator.currentOperationId = operationId;
  return {campusId, generation, operationId};
}

export function invalidateAdminLoad(coordinator: AdminLoadCoordinator) {
  coordinator.currentOperationId = ++coordinator.nextOperationId;
}

export function isAdminLoadCurrent(
  coordinator: AdminLoadCoordinator,
  identity: AdminLoadIdentity,
  context: {
    currentGeneration: number;
    mounted: boolean;
    requestAllowed: boolean;
  },
) {
  return context.mounted &&
    context.requestAllowed &&
    context.currentGeneration === identity.generation &&
    coordinator.committedCampusId === identity.campusId &&
    coordinator.currentOperationId === identity.operationId;
}
