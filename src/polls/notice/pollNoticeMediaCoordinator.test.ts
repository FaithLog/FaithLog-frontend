import {describe, expect, it, vi} from 'vitest';

import {FaithLogApiError} from '../../api/apiError';
import {createPollNoticeMediaCoordinator} from './pollNoticeMediaCoordinator';

describe('poll notice media coordinator', () => {
  it('returns empty without requesting signed URLs when media capability is disabled', async () => {
    const getAccessUrls = vi.fn();
    const coordinator = createPollNoticeMediaCoordinator({getAccessUrls});

    const result = await coordinator.load({
      accessToken: 'token',
      assetIds: [10],
      authSessionGeneration: 1,
      campusId: 2,
      enabled: false,
      pollId: 3,
    });

    expect(result.state).toEqual({status: 'empty'});
    expect(getAccessUrls).not.toHaveBeenCalled();
  });

  it('tracks media retries independently with poll, campus, and auth lineage', async () => {
    let resolveFirst!: (value: never[]) => void;
    const getAccessUrls = vi.fn()
      .mockImplementationOnce(() => new Promise<never[]>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce([]);
    const coordinator = createPollNoticeMediaCoordinator({getAccessUrls});
    const input = {
      accessToken: 'token',
      assetIds: [10],
      authSessionGeneration: 1,
      campusId: 2,
      enabled: true,
      pollId: 3,
    };

    const first = coordinator.load(input);
    const second = await coordinator.load(input);
    resolveFirst([]);
    const stale = await first;

    expect(coordinator.isCurrent(stale)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
    expect(getAccessUrls).toHaveBeenCalledTimes(2);
  });

  it('converts a media-only failure without turning it into a poll detail failure', async () => {
    const coordinator = createPollNoticeMediaCoordinator({
      getAccessUrls: vi.fn().mockRejectedValue(new FaithLogApiError({
        kind: 'offline',
        message: '네트워크 연결이 필요합니다.',
      })),
    });

    await expect(coordinator.load({
      accessToken: 'token',
      assetIds: [10],
      authSessionGeneration: 1,
      campusId: 2,
      enabled: true,
      pollId: 3,
    })).resolves.toMatchObject({
      state: {status: 'error', error: {kind: 'offline'}},
    });
  });

  it('propagates session expiry to the existing auth flow', async () => {
    const error = new FaithLogApiError({kind: 'sessionExpired', message: '세션 만료'});
    const coordinator = createPollNoticeMediaCoordinator({
      getAccessUrls: vi.fn().mockRejectedValue(error),
    });

    await expect(coordinator.load({
      accessToken: 'token',
      assetIds: [10],
      authSessionGeneration: 1,
      campusId: 2,
      enabled: true,
      pollId: 3,
    })).rejects.toBe(error);
  });
});
