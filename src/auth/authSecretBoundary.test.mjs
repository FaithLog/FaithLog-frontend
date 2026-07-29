import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('one-time auth secret boundary', () => {
  it('writes neither one-time token through persistence modules', () => {
    const persistence = read('../api/tokenStorage.ts');
    expect(persistence).not.toMatch(/emailVerificationToken|passwordResetToken|resetToken/);
  });

  it('sends no one-time auth event or sensitive value to Analytics or Crashlytics', () => {
    const observability = [
      read('../analytics/analyticsContract.ts'),
      read('../analytics/appAnalytics.ts'),
      read('../crashlytics/nativeFirebaseCrashlytics.ts'),
    ].join('\n');
    expect(observability).not.toMatch(
      /emailVerificationToken|passwordResetToken|resetToken|verification_code|password_reset/,
    );
  });

  it('adds no verification or reset completion Analytics event', () => {
    const flow = read('./PublicAuthForms.tsx');
    expect(flow).not.toMatch(/track(?:EmailVerification|PasswordReset|AuthCode)/);
    expect(flow).not.toMatch(/runWithCompletionEvent\(\s*\(\) => (?:request|confirm|complete)PasswordReset/);
  });
});
