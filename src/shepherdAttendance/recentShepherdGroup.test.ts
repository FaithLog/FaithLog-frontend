import {beforeEach, describe, expect, it} from 'vitest';
import {clearRecentShepherdGroups, getRecentShepherdGroup, setRecentShepherdGroup} from './recentShepherdGroup';
describe('recent shepherd group cache', () => {
  beforeEach(clearRecentShepherdGroups);
  it('isolates campus selections and clears them on logout', () => {
    setRecentShepherdGroup(1, 10); setRecentShepherdGroup(2, 20);
    expect(getRecentShepherdGroup(1)).toBe(10); expect(getRecentShepherdGroup(2)).toBe(20);
    clearRecentShepherdGroups(); expect(getRecentShepherdGroup(1)).toBeNull();
  });
});
