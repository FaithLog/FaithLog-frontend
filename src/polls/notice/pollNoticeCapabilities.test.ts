import {describe, expect, it} from 'vitest';

import {resolvePollNoticeCapabilities} from './pollNoticeCapabilities';

describe('poll notice capability gate', () => {
  it('keeps every provisional surface fail-closed in production', () => {
    expect(resolvePollNoticeCapabilities({mockMode: false})).toEqual({
      canAccessMedia: false,
      canEditPublishedNotice: false,
      canReadNotice: false,
    });
  });

  it('does not expose production media until both the contract and file cache are ready', () => {
    expect(resolvePollNoticeCapabilities({
      mockMode: false,
      productionContractConfirmed: true,
      productionFileCacheReady: false,
    })).toEqual({
      canAccessMedia: false,
      canEditPublishedNotice: true,
      canReadNotice: true,
    });
  });

  it('keeps the complete provisional flow available in development mock mode', () => {
    expect(resolvePollNoticeCapabilities({mockMode: true})).toEqual({
      canAccessMedia: true,
      canEditPublishedNotice: true,
      canReadNotice: true,
    });
  });
});
