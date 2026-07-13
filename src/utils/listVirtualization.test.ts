import {describe, expect, it} from 'vitest';

import {chunkForVirtualizedRows} from './listVirtualization';

describe('virtualized row chunking', () => {
  it('fills two-column rows for four respondents without mutating the source', () => {
    const respondents = Object.freeze([{id: 1}, {id: 2}, {id: 3}, {id: 4}]);
    expect(chunkForVirtualizedRows(respondents, 2)).toEqual([
      [{id: 1}, {id: 2}],
      [{id: 3}, {id: 4}],
    ]);
    expect(respondents).toEqual([{id: 1}, {id: 2}, {id: 3}, {id: 4}]);
  });

  it('keeps the fifth respondent as the only item in the final two-column row', () => {
    const respondents = Object.freeze([{id: 1}, {id: 2}, {id: 3}, {id: 4}, {id: 5}]);
    expect(chunkForVirtualizedRows(respondents, 2)).toEqual([
      [{id: 1}, {id: 2}],
      [{id: 3}, {id: 4}],
      [{id: 5}],
    ]);
    expect(respondents).toHaveLength(5);
  });

  it('rejects a non-positive row size instead of looping forever', () => {
    expect(() => chunkForVirtualizedRows([1], 0)).toThrow('Virtualized row size must be positive.');
  });
});
