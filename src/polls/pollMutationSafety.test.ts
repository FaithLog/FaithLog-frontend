import {describe, expect, it} from 'vitest';
import {getPollActionErrorPresentation, toDeletedCommentRefreshError} from './pollMutationSafety';

describe('poll comment delete refresh context', () => {
  it.each([
    {kind: 'sessionExpired' as const, status: 401, message: '세션 만료'},
    {kind: 'offline' as const, message: '네트워크 오류'},
  ])('preserves $kind while marking deletion as successful', (error) => {
    const contextual = toDeletedCommentRefreshError(error);
    expect(contextual.kind).toBe(error.kind);
    expect('status' in error ? contextual.status : undefined).toBe('status' in error ? error.status : undefined);
    expect(contextual.message).toContain('댓글은 삭제됐지만');
    expect(getPollActionErrorPresentation(contextual).message).toBe(
      '댓글은 삭제됐지만 목록을 새로고치지 못했습니다. 목록을 다시 열어 확인해 주세요.',
    );
  });
});
