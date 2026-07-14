import {describe, expect, it} from 'vitest';

import {canManageAdminPoll} from './adminPollCapabilities';

describe('admin poll management capabilities', () => {
  it('keeps ordinary admin polls manageable', () => {
    expect(canManageAdminPoll({pollType: 'CUSTOM'})).toBe(true);
  });

  it('requires an explicit Coffee ownership capability for mutations', () => {
    expect(canManageAdminPoll({pollType: 'COFFEE'})).toBe(false);
    expect(canManageAdminPoll({pollType: 'COFFEE', manageableByMe: false})).toBe(false);
    expect(canManageAdminPoll({pollType: 'COFFEE', manageableByMe: true})).toBe(true);
  });
});
