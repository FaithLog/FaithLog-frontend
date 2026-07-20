import {describe, expect, it, vi} from 'vitest';

import {
  DEFAULT_REMOTE_UPDATE_VALUES,
  readRemoteUpdateConfig,
  resolveUpdateRequirement,
  type RemoteUpdateKey,
  type RemoteUpdateValueReader,
} from './updateConfig';

function createReader(overrides: Partial<RemoteUpdateValueReader> = {}): RemoteUpdateValueReader {
  return {
    fetchAndActivate: vi.fn().mockResolvedValue(true),
    getString: vi.fn((key: RemoteUpdateKey) => DEFAULT_REMOTE_UPDATE_VALUES[key]),
    setDefaults: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('readRemoteUpdateConfig', () => {
  it('sets safe in-app defaults before fetching', async () => {
    const reader = createReader();

    await readRemoteUpdateConfig(reader);

    expect(reader.setDefaults).toHaveBeenCalledWith(DEFAULT_REMOTE_UPDATE_VALUES);
    expect(reader.fetchAndActivate).toHaveBeenCalledTimes(1);
  });

  it('uses active cached values when fetch fails', async () => {
    const reader = createReader({
      fetchAndActivate: vi.fn().mockRejectedValue(new Error('offline')),
      getString: vi.fn((key: RemoteUpdateKey) => ({
        ...DEFAULT_REMOTE_UPDATE_VALUES,
        android_min_build: '36',
      })[key]),
    });

    const snapshot = await readRemoteUpdateConfig(reader);

    expect(snapshot.androidMinimumBuild).toBe('36');
  });

  it('returns missing values without throwing when no cache is readable', async () => {
    const reader = createReader({
      fetchAndActivate: vi.fn().mockRejectedValue(new Error('offline')),
      getString: vi.fn(() => {
        throw new Error('unavailable');
      }),
      setDefaults: vi.fn().mockRejectedValue(new Error('unavailable')),
    });

    await expect(readRemoteUpdateConfig(reader)).resolves.toEqual({
      androidMinimumBuild: null,
      androidStoreUrl: null,
      iosMinimumBuild: null,
      iosStoreUrl: null,
      message: null,
      title: null,
    });
  });
});

describe('resolveUpdateRequirement', () => {
  it('returns a complete Android blocking requirement', () => {
    expect(resolveUpdateRequirement({
      platform: 'android',
      currentBuild: '35',
      snapshot: {
        androidMinimumBuild: '36',
        androidStoreUrl: DEFAULT_REMOTE_UPDATE_VALUES.android_store_url,
        iosMinimumBuild: '14',
        iosStoreUrl: DEFAULT_REMOTE_UPDATE_VALUES.ios_store_url,
        title: '새 버전',
        message: '업데이트해 주세요.',
      },
    })).toEqual({
      required: true,
      title: '새 버전',
      message: '업데이트해 주세요.',
      storeUrl: DEFAULT_REMOTE_UPDATE_VALUES.android_store_url,
    });
  });

  it('uses safe copy for blank Remote Config text', () => {
    const result = resolveUpdateRequirement({
      platform: 'ios',
      currentBuild: '13',
      snapshot: {
        androidMinimumBuild: '36',
        androidStoreUrl: DEFAULT_REMOTE_UPDATE_VALUES.android_store_url,
        iosMinimumBuild: '14',
        iosStoreUrl: DEFAULT_REMOTE_UPDATE_VALUES.ios_store_url,
        title: '   ',
        message: '',
      },
    });

    expect(result).toMatchObject({
      required: true,
      title: '업데이트가 필요합니다',
      message: '안정적인 서비스 이용을 위해 최신 버전으로 업데이트해 주세요.',
    });
  });

  it('fails open when minimum is missing or malformed', () => {
    expect(resolveUpdateRequirement({
      platform: 'android',
      currentBuild: '35',
      snapshot: {
        androidMinimumBuild: null,
        androidStoreUrl: null,
        iosMinimumBuild: null,
        iosStoreUrl: null,
        title: null,
        message: null,
      },
    })).toEqual({required: false});
  });

  it('keeps an invalid store URL unavailable instead of executing it', () => {
    expect(resolveUpdateRequirement({
      platform: 'ios',
      currentBuild: '13',
      snapshot: {
        androidMinimumBuild: '36',
        androidStoreUrl: null,
        iosMinimumBuild: '14',
        iosStoreUrl: 'javascript:alert(1)',
        title: null,
        message: null,
      },
    })).toMatchObject({required: true, storeUrl: null});
  });
});
