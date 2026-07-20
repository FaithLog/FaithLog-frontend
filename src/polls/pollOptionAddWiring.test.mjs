import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const sourcePath = fileURLToPath(new URL('./PollScreen.tsx', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const submitSource = source.slice(
  source.indexOf('const submitUserOption = async'),
  source.indexOf('const submitComment = async'),
);

describe('poll user-option screen wiring', () => {
  it('blocks duplicate submission and sends one exact request', () => {
    expect(submitSource).toContain('actionState ||');
    expect(submitSource).toContain('optionAddOperation.current.inFlight ||');
    expect(submitSource).toContain('optionAddOperation.current = {id: operationId, inFlight: true}');
    expect(submitSource).toContain('optionAddOperation.current.id === operationId');
    expect(submitSource).toContain("setActionState({kind: 'optionAdd'})");
    expect(submitSource.match(/await addUserPollOption\(/g)).toHaveLength(1);
    expect(submitSource).not.toContain('runPollOptionFallback');
  });

  it('refreshes detail after success and renders failures through the shared action error', () => {
    const requestIndex = submitSource.indexOf('await addUserPollOption(');
    const refreshIndex = submitSource.indexOf('await loadDetail(');
    expect(requestIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(requestIndex);
    expect(submitSource).toContain('setActionError(apiError)');
    expect(source).toContain('<ActionErrorCard error={actionError} />');
  });
});
