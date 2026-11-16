/** Pure visual playback policy. No state persistence or backend calls. */
export const FARM_ACTION_TIMELINE = {
  "feed": {
    "frameMs": 190,
    "frames": 4,
    "loop": false
  },
  "play": {
    "frameMs": 180,
    "frames": 4,
    "loop": false
  },
  "sleep": {
    "frameMs": 550,
    "frames": 4,
    "loop": true
  },
  "dirty": {
    "frameMs": 420,
    "frames": 4,
    "loop": true
  },
  "clean": {
    "frameMs": 180,
    "frames": 4,
    "loop": false
  },
  "pet": {
    "frameMs": 230,
    "frames": 4,
    "loop": false
  },
  "hungry": {
    "frameMs": 450,
    "frames": 4,
    "loop": true
  },
  "sick": {
    "frameMs": 400,
    "frames": 4,
    "loop": true
  },
  "faint": {
    "frameMs": 360,
    "frames": 4,
    "loop": true
  },
  "evolve": {
    "frameMs": 140,
    "frames": 8,
    "loop": false
  }
} as const;
export type FarmVisualAction = keyof typeof FARM_ACTION_TIMELINE;

/** Clamps non-looping care animations and safely handles bad elapsed values. */
export function getFarmActionFrameIndex(action: FarmVisualAction, elapsedMs: number, reduceMotion = false): number {
  if (reduceMotion) return 0;
  const timeline = FARM_ACTION_TIMELINE[action];
  const ms = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const stepped = Math.floor(ms / timeline.frameMs);
  return timeline.loop ? stepped % timeline.frames : Math.min(stepped, timeline.frames - 1);
}
