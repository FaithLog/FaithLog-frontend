import {describe, expect, it, vi} from 'vitest';

import {openPdfInNativeViewer} from './nativePdfViewerPolicy';

describe('native PDF viewer policy', () => {
  it('opens Android PDFs with ACTION_VIEW and a read-only content URI', async () => {
    const getContentUri = vi.fn(async () => 'content://com.faithlog.app/cache/guide.pdf');
    const openAndroidActivity = vi.fn(async () => undefined);
    const share = vi.fn(async () => undefined);

    await openPdfInNativeViewer('file:///cache/guide.pdf', {
      getContentUri,
      openAndroidActivity,
      platform: 'android',
      share,
    });

    expect(getContentUri).toHaveBeenCalledWith('file:///cache/guide.pdf');
    expect(openAndroidActivity).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://com.faithlog.app/cache/guide.pdf',
      flags: 1,
      type: 'application/pdf',
    });
    expect(share).not.toHaveBeenCalled();
  });

  it('keeps the native share/open sheet on iOS', async () => {
    const share = vi.fn(async () => undefined);
    await openPdfInNativeViewer('file:///cache/guide.pdf', {
      getContentUri: vi.fn(),
      openAndroidActivity: vi.fn(),
      platform: 'ios',
      share,
    });
    expect(share).toHaveBeenCalledWith('file:///cache/guide.pdf');
  });
});
