import {describe, expect, it} from 'vitest';

import {createAnnouncementImageTemporaryFileRegistry} from './announcementImageTemporaryFiles';

describe('announcement image temporary file registry', () => {
  it('protects active downloads and drafts while explicit cleanup waits for preparation', async () => {
    const registry = createAnnouncementImageTemporaryFileRegistry();
    const session = registry.createPreparedSession();
    const preparation = registry.beginPreparedOperation(session);
    registry.protectDownload('account-42-campus-1--download-active.image-download');
    registry.protectPreparedFile(
      'file:///cache/prepared-active.image-upload',
      'prepared-active.image-upload',
    );

    const cleanup = registry.beginExplicitPreparedCleanup();
    expect(() => preparation.assertValid()).toThrow('invalidated');
    let cleanupSettled = false;
    const waiting = cleanup.waitForPending().then(() => {
      cleanupSettled = true;
    });
    await Promise.resolve();
    expect(cleanupSettled).toBe(false);

    preparation.finish();
    await waiting;
    expect(cleanup.releasePreparedFiles()).toEqual(['prepared-active.image-upload']);
    expect(registry.getProtectedEntryNames()).toEqual(new Set([
      'account-42-campus-1--download-active.image-download',
    ]));

    cleanup.finish();
    registry.unprotectDownload('account-42-campus-1--download-active.image-download');
    expect(registry.getProtectedEntryNames()).toEqual(new Set());
  });
});
