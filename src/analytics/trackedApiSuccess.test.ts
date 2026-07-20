import {describe, expect, it, vi} from 'vitest';

import {runWithCompletionEvent} from './trackedApiSuccess';

describe('API success Analytics boundary', () => {
  it('records a completion exactly once after the backend operation succeeds', async () => {
    const complete = vi.fn();
    const operation = vi.fn().mockResolvedValue({ok: true});

    await expect(runWithCompletionEvent(operation, complete)).resolves.toEqual({ok: true});
    expect(operation).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('does not record a completion when the backend operation rejects', async () => {
    const complete = vi.fn();
    const error = new Error('request failed');

    await expect(runWithCompletionEvent(() => Promise.reject(error), complete)).rejects.toBe(error);
    expect(complete).not.toHaveBeenCalled();
  });
});
