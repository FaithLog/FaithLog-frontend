#!/usr/bin/env node

const fs = require('fs');

const allowedTypes = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];

function readCommitMessage(input) {
  if (!input) {
    return fs.readFileSync(0, 'utf8');
  }

  if (fs.existsSync(input)) {
    return fs.readFileSync(input, 'utf8');
  }

  return input;
}

function normalizeMessage(message) {
  return message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .find((line) => line.trim() && !line.trim().startsWith('#')) || '';
}

function validateCommitMessage(message) {
  const subject = normalizeMessage(message);

  if (!subject) {
    return {
      valid: false,
      reason: '커밋 메시지 제목이 비어 있습니다.',
    };
  }

  if (
    subject.startsWith('Merge ') ||
    subject.startsWith('Revert "') ||
    subject.startsWith('fixup! ') ||
    subject.startsWith('squash! ')
  ) {
    return { valid: true };
  }

  const pattern = new RegExp(`^(${allowedTypes.join('|')})(\\([a-z0-9][a-z0-9-]*\\))?!?: .{1,72}$`);

  if (!pattern.test(subject)) {
    return {
      valid: false,
      reason: [
        '커밋 메시지는 "<type>(optional-scope): <subject>" 형식이어야 합니다.',
        `허용 type: ${allowedTypes.join(', ')}`,
        '예: chore(git): add hooks and templates',
      ].join('\n'),
    };
  }

  return { valid: true };
}

if (require.main === module) {
  const input = process.argv[2];
  const result = validateCommitMessage(readCommitMessage(input));

  if (!result.valid) {
    console.error(result.reason);
    process.exit(1);
  }
}

module.exports = {
  allowedTypes,
  normalizeMessage,
  validateCommitMessage,
};
