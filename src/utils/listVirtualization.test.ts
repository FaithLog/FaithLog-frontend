import {describe, expect, it} from 'vitest';

import {chunkForVirtualizedRows} from './listVirtualization';

describe('virtualized row chunking', () => {
  it('keeps every respondent in stable display order without mutating the source', () => {
    const respondents = Object.freeze([{id: 1}, {id: 2}, {id: 3}, {id: 4}]);
    expect(chunkForVirtualizedRows(respondents, 3)).toEqual([
      [{id: 1}, {id: 2}, {id: 3}],
      [{id: 4}],
    ]);
    expect(respondents).toEqual([{id: 1}, {id: 2}, {id: 3}, {id: 4}]);
  });

  it('rejects a non-positive row size instead of looping forever', () => {
    expect(() => chunkForVirtualizedRows([1], 0)).toThrow('Virtualized row size must be positive.');
  });
});
