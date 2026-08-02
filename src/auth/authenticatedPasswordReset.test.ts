import {describe, expect, it} from 'vitest';

import {isAuthenticatedPasswordResetCompletionCurrent} from './authenticatedPasswordReset';

describe('authenticated password reset completion lineage', () => {
  it('accepts only the session generation and user that started the flow', () => {
    expect(isAuthenticatedPasswordResetCompletionCurrent(3, 7, 3, 7)).toBe(true);
    expect(isAuthenticatedPasswordResetCompletionCurrent(3, 7, 4, 7)).toBe(false);
    expect(isAuthenticatedPasswordResetCompletionCurrent(3, 7, 3, 8)).toBe(false);
  });

  it('rejects A completion after logout/login B even when navigation returns to reset', () => {
    expect(isAuthenticatedPasswordResetCompletionCurrent(3, 7, 5, 8)).toBe(false);
  });
});
