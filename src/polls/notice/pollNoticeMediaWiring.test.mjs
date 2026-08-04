import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'src/polls/PollScreen.tsx'), 'utf8');

describe('poll notice media retry wiring', () => {
  it('routes every notice-media retry through the isolated coordinator', () => {
    expect(source).toContain('const retryNoticeMedia = async () =>');
    expect(source).not.toMatch(/onRetryNoticeMedia=\{\(\) => loadDetail\(/);
    expect(source.match(/onRetryNoticeMedia=\{retryNoticeMedia\}/g)).toHaveLength(1);
  });
});
