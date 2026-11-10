import { describe, expect, it } from 'vitest';

import { getBibleFriendMotionFrameIndex } from './bibleFriendMotionTimeline';

describe('Bible friend motion playback', () => {
  it('keeps the eyes open before the brief blink and returns to open eyes', () => {
    expect(getBibleFriendMotionFrameIndex('idle', 1799)).toBe(0);
    expect(getBibleFriendMotionFrameIndex('idle', 1800)).toBe(1);
    expect(getBibleFriendMotionFrameIndex('idle', 1900)).toBe(2);
    expect(getBibleFriendMotionFrameIndex('idle', 2030)).toBe(3);
    expect(getBibleFriendMotionFrameIndex('idle', 2250)).toBe(0);
  });

  it('loops a complete walk cycle at its exact boundary', () => {
    expect([0, 150, 300, 450, 600].map(time => getBibleFriendMotionFrameIndex('walk', time)))
      .toEqual([0, 1, 2, 3, 0]);
  });

  it('alternates held poses until the app switches motion', () => {
    expect([0, 220, 440].map(time => getBibleFriendMotionFrameIndex('held', time)))
      .toEqual([0, 1, 0]);
  });

  it('holds the final happy pose rather than replaying a touch indefinitely', () => {
    expect(getBibleFriendMotionFrameIndex('happy', 779)).toBe(3);
    expect(getBibleFriendMotionFrameIndex('happy', 780)).toBe(3);
    expect(getBibleFriendMotionFrameIndex('happy', 60_000)).toBe(3);
  });

  it('shows the landing compression before the final recovery pose', () => {
    expect(getBibleFriendMotionFrameIndex('land', 149)).toBe(0);
    expect(getBibleFriendMotionFrameIndex('land', 150)).toBe(1);
    expect(getBibleFriendMotionFrameIndex('land', 10_000)).toBe(1);
  });

  it('falls back to the first pose for invalid or negative elapsed time', () => {
    for (const time of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getBibleFriendMotionFrameIndex('walk', time)).toBe(0);
    }
  });
});
