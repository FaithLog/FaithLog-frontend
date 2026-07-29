import {describe, expect, it, vi} from 'vitest';

import {
  applyPasswordResetCodeConfirmed,
  clearPasswordResetFlow,
  createPasswordResetState,
  getPasswordResetStep,
  runSingleFlight,
  validateNewPassword,
} from './oneTimeAuthFlow';

describe('password reset flow', () => {
  it('moves from confirm success to the new-password step', () => {
    const confirmed = applyPasswordResetCodeConfirmed({
      ...createPasswordResetState(),
      email: 'user@example.test',
      code: '123456',
    }, {
      passwordResetToken: 'memory-only-reset-token',
      expiresInSeconds: 600,
    }, 1_000);

    expect(getPasswordResetStep(confirmed, 1_001)).toBe('newPassword');
  });

  it('guards direct new-password access when the reset token is missing', () => {
    expect(getPasswordResetStep({...createPasswordResetState(), requested: true}, 1_000))
      .toBe('email');
  });

  it('maps password mismatch without submitting', () => {
    expect(validateNewPassword('password123', 'different123')).toEqual({
      valid: false,
      passwordConfirmError: '비밀번호가 서로 일치하지 않습니다.',
    });
  });

  it('clears token, email, code and password inputs on complete or route exit', () => {
    expect(clearPasswordResetFlow({
      ...createPasswordResetState(),
      email: 'user@example.test',
      code: '123456',
      passwordResetToken: 'memory-only-reset-token',
      newPassword: 'password123',
      passwordConfirm: 'password123',
    })).toEqual(createPasswordResetState());
  });

  it('gates duplicate request, confirm and complete operations synchronously', async () => {
    const gate = {current: false};
    let resolve!: () => void;
    const operation = new Promise<void>((done) => {
      resolve = done;
    });
    const execute = vi.fn(() => operation);

    const first = runSingleFlight(gate, execute);
    const second = runSingleFlight(gate, execute);

    expect(execute).toHaveBeenCalledOnce();
    expect(second).toBeNull();
    resolve();
    await first;
    expect(gate.current).toBe(false);
  });
});
