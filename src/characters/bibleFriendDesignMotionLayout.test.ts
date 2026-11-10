import { describe, expect, it } from 'vitest';

import { getBibleFriendDesignMotionLayout } from './bibleFriendDesignMotionLayout';
import { BIBLE_FRIEND_MOTIONS } from './bibleFriendMotionTimeline';

 describe('costume atlas playback', () => {
  it('visits exactly all sixteen slots at frame boundaries without crossing cells', () => {
    const slots: number[] = [];
    for (const motion of Object.keys(BIBLE_FRIEND_MOTIONS) as (keyof typeof BIBLE_FRIEND_MOTIONS)[]) {
      let elapsed = 0;
      for (const duration of BIBLE_FRIEND_MOTIONS[motion].durationsMs) {
        const frame = getBibleFriendDesignMotionLayout(motion, elapsed, 80);
        slots.push(frame.slot);
        expect(frame.left).toBe(-(frame.slot % 4) * 80);
        expect(frame.top).toBe(-Math.floor(frame.slot / 4) * 80);
        expect(frame.width).toBe(320);
        expect(frame.height).toBe(320);
        elapsed += duration;
      }
    }
    expect(slots).toEqual(Array.from({ length: 16 }, (_, index) => index));
  });

  it('loops held/walk but holds the last happy/landing recovery frame', () => {
    expect(getBibleFriendDesignMotionLayout('walk', 600).slot).toBe(4);
    expect(getBibleFriendDesignMotionLayout('held', 440).slot).toBe(12);
    expect(getBibleFriendDesignMotionLayout('happy', 10000).slot).toBe(11);
    expect(getBibleFriendDesignMotionLayout('land', 10000).slot).toBe(15);
  });

  it('uses the first frame and safe size for invalid input', () => {
    for (const elapsed of [-1, NaN, Infinity]) {
      expect(getBibleFriendDesignMotionLayout('held', elapsed).slot).toBe(12);
    }
    for (const size of [0, -1, NaN, Infinity]) {
      expect(getBibleFriendDesignMotionLayout('idle', 0, size).size).toBe(96);
    }
  });
});
