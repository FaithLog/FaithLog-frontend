#!/usr/bin/env node

const { execFileSync } = require('child_process');

const branchPatterns = [
  /^(main|develop)$/,
  /^(feature|bugfix|hotfix|chore|docs|test|refactor|ci|build|perf)\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^release\/v?\d+\.\d+\.\d+(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/,
  /^codex\/issue-\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^codex\/(feature|bugfix|hotfix|chore|docs|test|refactor|ci|build|perf)-\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/,
];

function getCurrentBranch() {
  return execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function validateBranchName(branchName) {
  const branch = branchName.trim();

  if (!branch) {
    return {
      valid: true,
      skipped: true,
      reason: 'detached HEAD 상태에서는 브랜치 이름 검증을 건너뜁니다.',
    };
  }

  if (branchPatterns.some((pattern) => pattern.test(branch))) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: [
      `브랜치 이름 "${branch}"이 규칙과 맞지 않습니다.`,
      '허용 예시:',
      '- feature/login-screen',
      '- bugfix/api-error-state',
      '- release/v1.2.0',
      '- codex/issue-1-git-hooks-templates',
    ].join('\n'),
  };
}

if (require.main === module) {
  const branch = process.argv[2] || getCurrentBranch();
  const result = validateBranchName(branch);

  if (!result.valid) {
    console.error(result.reason);
    process.exit(1);
  }

  if (result.skipped && process.env.VERBOSE_GIT_HOOKS === '1') {
    console.warn(result.reason);
  }
}

module.exports = {
  branchPatterns,
  validateBranchName,
};
