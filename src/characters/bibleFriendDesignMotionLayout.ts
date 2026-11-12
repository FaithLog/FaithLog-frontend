import type { BibleFriendMotion } from './bibleFriendMotionTimeline';
import { getBibleFriendMotionFrameIndex } from './bibleFriendMotionTimeline';

export const BIBLE_FRIEND_DESIGN_MOTION_FRAME_SIZE = 192;
export const BIBLE_FRIEND_DESIGN_MOTION_ANCHOR = { x: 96, y: 176 } as const;
export const BIBLE_FRIEND_DESIGN_MOTION_COLUMNS = 4;
export const BIBLE_FRIEND_DESIGN_MOTION_OFFSETS = {
  idle: 0, walk: 4, happy: 8, held: 12, land: 14,
} as const satisfies Record<BibleFriendMotion, number>;

/** A 4×4 atlas uses row-major order; size is the visible square in dp. */
export function getBibleFriendDesignMotionLayout(
  motion: BibleFriendMotion,
  elapsedMs: number,
  size = 96,
) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 96;
  const frameIndex = getBibleFriendMotionFrameIndex(motion, elapsedMs);
  const slot = BIBLE_FRIEND_DESIGN_MOTION_OFFSETS[motion] + frameIndex;
  return {
    frameIndex,
    slot,
    size: safeSize,
    width: safeSize * 4,
    height: safeSize * 4,
    left: -(slot % 4) * safeSize,
    top: -Math.floor(slot / 4) * safeSize,
  };
}
