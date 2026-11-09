export const BIBLE_FRIEND_MOTIONS = {
  idle: { durationsMs: [1800, 100, 130, 220], loop: true },
  walk: { durationsMs: [150, 150, 150, 150], loop: true },
  happy: { durationsMs: [120, 180, 240, 240], loop: false },
  held: { durationsMs: [220, 220], loop: true },
  land: { durationsMs: [150, 200], loop: false },
} as const;

export type BibleFriendMotion = keyof typeof BIBLE_FRIEND_MOTIONS;

/** Time since the current motion started, excluding background/paused time. */
export function getBibleFriendMotionFrameIndex(
  motion: BibleFriendMotion,
  elapsedMs: number,
): number {
  const { durationsMs, loop } = BIBLE_FRIEND_MOTIONS[motion];
  const totalMs = durationsMs.reduce<number>((total, duration) => total + duration, 0);
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  let remaining = loop ? elapsed % totalMs : Math.min(elapsed, totalMs - 1);

  for (let index = 0; index < durationsMs.length; index += 1) {
    const duration = durationsMs[index];
    if (duration === undefined || remaining < duration) return index;
    remaining -= duration;
  }

  return durationsMs.length - 1;
}
