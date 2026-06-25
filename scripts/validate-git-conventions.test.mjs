import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { validateBranchName } = require('./validate-branch-name.js');
const { validateCommitMessage } = require('./validate-commit-message.js');

describe('git convention validators', () => {
  it('accepts valid commit message fixtures', () => {
    expect(validateCommitMessage('chore(git): add hooks and templates\n').valid).toBe(true);
    expect(validateCommitMessage('feat: add prayer reminder\n\nbody').valid).toBe(true);
  });

  it('rejects invalid commit message fixtures', () => {
    expect(validateCommitMessage('Add hooks').valid).toBe(false);
    expect(validateCommitMessage('chore: ').valid).toBe(false);
  });

  it('accepts valid branch name fixtures', () => {
    expect(validateBranchName('develop').valid).toBe(true);
    expect(validateBranchName('feature/login-screen').valid).toBe(true);
    expect(validateBranchName('release/v1.2.0').valid).toBe(true);
    expect(validateBranchName('codex/issue-1-git-hooks-templates').valid).toBe(true);
  });

  it('rejects invalid branch name fixtures', () => {
    expect(validateBranchName('Feature/Login').valid).toBe(false);
    expect(validateBranchName('codex/issue-one-hooks').valid).toBe(false);
  });
});
