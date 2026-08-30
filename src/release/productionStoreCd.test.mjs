import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/production-store-cd.yml'), 'utf8');
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));

describe('production store CD', () => {
  it('deploys only a successful main push CI commit and serializes releases', () => {
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('Frontend CI');
    expect(workflow).toContain("workflow_run.event == 'push'");
    expect(workflow).toContain("workflow_run.head_branch == 'main'");
    expect(workflow).toContain("workflow_run.conclusion == 'success'");
    expect(workflow).toContain('ref: ${{ github.event.workflow_run.head_sha }}');
    expect(workflow).toContain('group: production-store-cd');
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('uses production without mocks and auto-submits to the test channels', () => {
    expect(workflow).toContain('EXPO_PUBLIC_APP_ENV: production');
    expect(workflow).toContain("EXPO_PUBLIC_MOCK_MODE: 'false'");
    expect(workflow).toContain(
      'EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY: ${{ vars.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY }}',
    );
    expect(workflow).toContain('test -n "$EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY"');
    expect(workflow).toContain('--auto-submit-with-profile production');
    expect(workflow).not.toMatch(/^\s+--auto-submit\s*$/m);
    expect(eas.submit.production.android).toEqual({track: 'internal', releaseStatus: 'completed'});
    expect(eas.submit.production.ios.ascAppId).toBe('6784053598');
    expect(app.expo.version).toBe('1.2.3');
  });
});
