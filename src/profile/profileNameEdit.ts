import type {ApiError, UpdateMyProfileNameRequest} from '../api/types';
import {shouldHandleRequestError} from '../auth/requestErrorLineage';
import type {AuthGateState} from '../auth/authGate';

const MAX_PROFILE_NAME_LENGTH = 100;

export type ProfileNameValidation =
  | {valid: true; payload: UpdateMyProfileNameRequest}
  | {valid: false; error: string};

export type ProfileNameRequestIdentity = {
  epoch: number;
  generation: number;
  operationId: number;
  userId: number;
};

export function validateProfileName(value: string): ProfileNameValidation {
  const name = value.trim();

  if (!name) {
    return {valid: false, error: '이름을 입력해 주세요.'};
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH) {
    return {valid: false, error: '이름은 100자 이하로 입력해 주세요.'};
  }

  return {valid: true, payload: {name}};
}

export function getProfileNameErrorMessage(error: ApiError) {
  if (
    error.status === 400 &&
    error.code === 'GLOBAL_VALIDATION_FAILED'
  ) {
    return '이름은 공백을 제외하고 1~100자로 입력해 주세요.';
  }
  if (error.kind === 'offline') {
    return '네트워크 상태를 확인하고 다시 시도해 주세요.';
  }

  return '잠시 후 다시 시도해 주세요.';
}

export function applyProfileUserUpdate(
  current: AuthGateState,
  updatedUser: Extract<AuthGateState, {status: 'authenticated'}>['user'],
  requestGeneration: number,
  currentGeneration: number,
): AuthGateState {
  if (
    current.status !== 'authenticated' ||
    current.user.id !== updatedUser.id ||
    requestGeneration !== currentGeneration
  ) {
    return current;
  }

  return {...current, user: updatedUser};
}

export function applyRefreshedAuthState(
  current: AuthGateState,
  refreshed: Extract<AuthGateState, {status: 'authenticated' | 'noCampus'}>,
  requestGeneration: number,
  currentGeneration: number,
  authoritativeUser?: Extract<AuthGateState, {status: 'authenticated'}>['user'],
): AuthGateState {
  if (requestGeneration !== currentGeneration) return current;
  if (authoritativeUser && authoritativeUser.id !== refreshed.user.id) return current;
  return authoritativeUser ? {...refreshed, user: authoritativeUser} : refreshed;
}

export function createProfileNameMutationTracker(initialUserId: number) {
  let epoch = 0;
  let activeFlightId: number | null = null;
  let flightSequence = 0;
  let mounted = true;
  let operationId = 0;
  let userId = initialUserId;

  const isOperationCurrent = (identity: ProfileNameRequestIdentity) =>
    mounted &&
    identity.epoch === epoch &&
    identity.operationId === operationId &&
    identity.userId === userId;

  return {
    begin(generation: number): ProfileNameRequestIdentity {
      operationId += 1;
      return {epoch, generation, operationId, userId};
    },
    isInFlight() {
      return activeFlightId !== null;
    },
    isSuccessCurrent(
      identity: ProfileNameRequestIdentity,
      currentGeneration: number,
      currentUserId: number,
    ) {
      return isOperationCurrent(identity) &&
        identity.generation === currentGeneration &&
        identity.userId === currentUserId;
    },
    mount() {
      mounted = true;
    },
    runSingleFlight<T>(execute: () => Promise<T>): Promise<T> | null {
      if (activeFlightId !== null) return null;
      flightSequence += 1;
      const flightId = flightSequence;
      activeFlightId = flightId;
      let operation: Promise<T>;
      try {
        operation = execute();
      } catch (error) {
        if (activeFlightId === flightId) activeFlightId = null;
        throw error;
      }
      return operation.finally(() => {
        if (activeFlightId === flightId) activeFlightId = null;
      });
    },
    shouldApplyError(
      identity: ProfileNameRequestIdentity,
      error: ApiError,
      currentGeneration: number,
      currentUserId: number,
    ) {
      return isOperationCurrent(identity) &&
        identity.userId === currentUserId &&
        shouldHandleRequestError(error, identity.generation, currentGeneration);
    },
    syncUser(nextUserId: number) {
      if (nextUserId === userId) return;
      userId = nextUserId;
      epoch += 1;
      operationId = 0;
      activeFlightId = null;
    },
    unmount() {
      mounted = false;
      epoch += 1;
      operationId = 0;
      activeFlightId = null;
    },
  };
}
