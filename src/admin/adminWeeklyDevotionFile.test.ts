import {describe, expect, it, vi} from 'vitest';

import {saveAndShareAdminWeeklyDevotionExport} from './adminWeeklyDevotionFile';

const EXPORTED = {
  bytes: new Uint8Array([80, 75, 3, 4]),
  fileName: 'faithlog-devotion-1-2026-07-13.xlsx',
};

describe('saveAndShareAdminWeeklyDevotionExport', () => {
  it('deletes the exact temporary file after successful sharing', async () => {
    const harness = createHarness();

    await expect(
      saveAndShareAdminWeeklyDevotionExport(EXPORTED, harness.dependencies),
    ).resolves.toBeUndefined();

    expect(harness.share).toHaveBeenCalledWith(
      'file:///cache/faithlog-devotion-1-2026-07-13.xlsx',
      expect.any(Object),
    );
    expect(harness.createFile).toHaveBeenCalledWith(EXPORTED.fileName);
    expect(harness.remove).toHaveBeenCalledOnce();
  });

  it('deletes the temporary file when sharing rejects without masking that error', async () => {
    const shareError = new Error('share rejected');
    const harness = createHarness({shareError});

    await expect(
      saveAndShareAdminWeeklyDevotionExport(EXPORTED, harness.dependencies),
    ).rejects.toBe(shareError);
    expect(harness.remove).toHaveBeenCalledOnce();
  });

  it.each(['create', 'write'] as const)(
    'attempts partial-file cleanup when %s fails',
    async (failurePoint) => {
      const operationError = new Error(`${failurePoint} failed`);
      const harness = createHarness({failurePoint, operationError});

      await expect(
        saveAndShareAdminWeeklyDevotionExport(EXPORTED, harness.dependencies),
      ).rejects.toBe(operationError);
      expect(harness.remove).toHaveBeenCalledOnce();
      expect(harness.share).not.toHaveBeenCalled();
    },
  );

  it('does not turn a successful share into failure when best-effort cleanup fails', async () => {
    const observeCleanupFailure = vi.fn();
    const harness = createHarness({cleanupError: new Error('cleanup failed')});

    await expect(
      saveAndShareAdminWeeklyDevotionExport(EXPORTED, {
        ...harness.dependencies,
        observeCleanupFailure,
      }),
    ).resolves.toBeUndefined();
    expect(observeCleanupFailure).toHaveBeenCalledOnce();
    expect(observeCleanupFailure).toHaveBeenCalledWith();
  });

  it('rejects unsafe file names before creating a cache file', async () => {
    const harness = createHarness();

    await expect(
      saveAndShareAdminWeeklyDevotionExport(
        {...EXPORTED, fileName: '../private.xlsx'},
        harness.dependencies,
      ),
    ).rejects.toThrow('파일 이름');
    expect(harness.createFile).not.toHaveBeenCalled();
  });
});

function createHarness({
  cleanupError,
  failurePoint,
  operationError,
  shareError,
}: {
  cleanupError?: Error;
  failurePoint?: 'create' | 'write';
  operationError?: Error;
  shareError?: Error;
} = {}) {
  const remove = vi.fn(() => {
    if (cleanupError) {
      throw cleanupError;
    }
  });
  const file = {
    create: vi.fn(() => {
      if (failurePoint === 'create') {
        throw operationError;
      }
    }),
    delete: remove,
    uri: `file:///cache/${EXPORTED.fileName}`,
    write: vi.fn(() => {
      if (failurePoint === 'write') {
        throw operationError;
      }
    }),
  };
  const createFile = vi.fn(() => file);
  const share = vi.fn(async () => {
    if (shareError) {
      throw shareError;
    }
  });
  return {
    createFile,
    dependencies: {
      createFile,
      isSharingAvailable: async () => true,
      observeCleanupFailure: vi.fn(),
      share,
    },
    remove,
    share,
  };
}
