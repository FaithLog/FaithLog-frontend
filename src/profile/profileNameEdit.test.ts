import {describe, expect, it, vi} from 'vitest';

import type {ApiError, CurrentUser} from '../api/types';
import {
  applyProfileUserUpdate,
  applyRefreshedAuthState,
  createProfileNameMutationTracker,
  getProfileNameErrorMessage,
  validateProfileName,
} from './profileNameEdit';

const user: CurrentUser = {
  id: 7,
  name: '기존 이름',
  email: 'user@example.test',
  role: 'USER',
  isActive: true,
  lastLoginAt: null,
  campusMemberships: [],
};

describe('profile name edit domain', () => {
  it('trims a valid name and preserves same-name submissions', () => {
    expect(validateProfileName('  새 이름  ')).toEqual({
      valid: true,
      payload: {name: '새 이름'},
    });
    expect(validateProfileName(` ${user.name} `)).toEqual({
      valid: true,
      payload: {name: user.name},
    });
    expect(validateProfileName(`  ${'가'.repeat(100)}  `)).toEqual({
      valid: true,
      payload: {name: '가'.repeat(100)},
    });
  });

  it.each([
    ['', '이름을 입력해 주세요.'],
    ['   ', '이름을 입력해 주세요.'],
    ['가'.repeat(101), '이름은 100자 이하로 입력해 주세요.'],
  ])('blocks invalid name %j with an inline product error', (name, message) => {
    expect(validateProfileName(name)).toEqual({valid: false, error: message});
  });

  it('maps validation, network, and server failures without exposing raw messages', () => {
    expect(getProfileNameErrorMessage({
      kind: 'error',
      status: 400,
      code: 'GLOBAL_VALIDATION_FAILED',
      message: 'raw email=user@example.test token=secret',
    })).toBe('이름은 공백을 제외하고 1~100자로 입력해 주세요.');
    expect(getProfileNameErrorMessage({
      kind: 'offline',
      message: 'raw network details',
    })).toBe('네트워크 상태를 확인하고 다시 시도해 주세요.');
    expect(getProfileNameErrorMessage({
      kind: 'error',
      status: 503,
      message: 'raw upstream details',
    })).toBe('잠시 후 다시 시도해 주세요.');
  });

  it('drops stale operation, generation, user, route, unmount, and A→B→A results', () => {
    const tracker = createProfileNameMutationTracker(7);
    const first = tracker.begin(3);
    expect(tracker.isSuccessCurrent(first, 3, 7)).toBe(true);

    const newer = tracker.begin(3);
    expect(tracker.isSuccessCurrent(first, 3, 7)).toBe(false);
    expect(tracker.isSuccessCurrent(newer, 3, 7)).toBe(true);

    tracker.syncUser(8);
    expect(tracker.isSuccessCurrent(newer, 3, 8)).toBe(false);

    tracker.syncUser(7);
    const backToA = tracker.begin(4);
    expect(tracker.isSuccessCurrent(newer, 4, 7)).toBe(false);
    expect(tracker.isSuccessCurrent(backToA, 4, 7)).toBe(true);

    tracker.unmount();
    expect(tracker.isSuccessCurrent(backToA, 4, 7)).toBe(false);
  });

  it('handles only the current request 401 terminal lineage', () => {
    const tracker = createProfileNameMutationTracker(7);
    const request = tracker.begin(9);
    const current401: ApiError = {
      kind: 'sessionExpired',
      status: 401,
      code: 'AUTH_UNAUTHORIZED',
      message: 'expired',
      authSessionGeneration: 9,
    };
    const staleChanged: ApiError = {
      kind: 'error',
      code: 'AUTH_SESSION_CHANGED',
      message: 'changed',
      authSessionGeneration: 9,
    };

    expect(tracker.shouldApplyError(request, current401, 10, 7)).toBe(true);
    expect(tracker.shouldApplyError(request, staleChanged, 10, 7)).toBe(false);
    tracker.syncUser(8);
    expect(tracker.shouldApplyError(request, current401, 10, 8)).toBe(false);
  });

  it('provides a synchronous single-flight gate', async () => {
    const tracker = createProfileNameMutationTracker(7);
    let resolve!: () => void;
    const operation = new Promise<void>((done) => { resolve = done; });
    const execute = vi.fn(() => operation);

    const first = tracker.runSingleFlight(execute);
    const second = tracker.runSingleFlight(execute);

    expect(execute).toHaveBeenCalledOnce();
    expect(second).toBeNull();
    resolve();
    await first;
    expect(tracker.isInFlight()).toBe(false);
  });

  it('releases the flight gate on identity change without letting an old flight clear a new one', async () => {
    const tracker = createProfileNameMutationTracker(7);
    let resolveOld!: () => void;
    let resolveNew!: () => void;
    const oldFlight = tracker.runSingleFlight(() => new Promise<void>((done) => {
      resolveOld = done;
    }));

    tracker.syncUser(8);
    const newFlight = tracker.runSingleFlight(() => new Promise<void>((done) => {
      resolveNew = done;
    }));
    expect(newFlight).not.toBeNull();
    expect(tracker.isInFlight()).toBe(true);

    resolveOld();
    await oldFlight;
    expect(tracker.isInFlight()).toBe(true);

    resolveNew();
    await newFlight;
    expect(tracker.isInFlight()).toBe(false);
  });

  it('replaces the global authenticated user with the full UserMe only for current lineage', () => {
    const authenticated = {
      status: 'authenticated' as const,
      user,
      activeCampuses: [],
      selectedCampus: {
        membershipId: 10,
        campusId: 1,
        campusName: '캠퍼스',
        region: '서울',
        campusRole: 'MEMBER' as const,
        status: 'ACTIVE',
      },
    };
    const updatedUser = {
      ...user,
      name: '서버 이름',
      role: 'ADMIN' as const,
      lastLoginAt: '2026-08-02T00:00:00.000Z',
    };

    expect(applyProfileUserUpdate(authenticated, updatedUser, 3, 3)).toEqual({
      ...authenticated,
      user: updatedUser,
    });
    expect(applyProfileUserUpdate(authenticated, updatedUser, 3, 4))
      .toBe(authenticated);
    expect(applyProfileUserUpdate(
      authenticated,
      {...updatedUser, id: 8},
      3,
      3,
    )).toBe(authenticated);
  });

  it('reconciles campus refresh at application time with the authoritative PATCH user', () => {
    const authenticated = {
      status: 'authenticated' as const,
      user,
      activeCampuses: [],
      selectedCampus: {
        membershipId: 10,
        campusId: 1,
        campusName: '캠퍼스',
        region: '서울',
        campusRole: 'MEMBER' as const,
        status: 'ACTIVE',
      },
    };
    const staleRefresh = {...authenticated, user: {...user, name: 'GET 이전 이름'}};
    const patchUser = {...user, name: 'PATCH 이름', role: 'ADMIN' as const};

    expect(applyRefreshedAuthState(
      {...authenticated, user: patchUser},
      staleRefresh,
      3,
      3,
      patchUser,
    )).toEqual({...staleRefresh, user: patchUser});
    expect(applyRefreshedAuthState(authenticated, staleRefresh, 3, 4, patchUser))
      .toBe(authenticated);
  });
});
