import { describe, expect, it } from 'vitest';
import { FARM_ACTION_TIMELINE, getFarmActionFrameIndex } from './farmMotionTimeline';
import { FARM_ACTION_XML, FARM_EVOLUTION_XML } from './farmVisualAssetCatalog';

const BASE_SPECIES = [
  'david-lamb', 'noah-bear', 'jonah-whale', 'daniel-lion', 'peace-dove',
  'hope-rabbit', 'word-fox', 'gentle-deer', 'companion-donkey',
  'joy-chick', 'peace-penguin', 'love-otter', 'patience-turtle',
] as const;

describe('farm care visual assets', () => {
  it('covers each of the 13 base characters with both evolution stages', () => {
    expect(Object.keys(FARM_EVOLUTION_XML)).toHaveLength(BASE_SPECIES.length);
    for (const id of BASE_SPECIES) {
      expect(FARM_EVOLUTION_XML[id].stage1).toMatch(/^<svg /);
      expect(FARM_EVOLUTION_XML[id].stage2).toMatch(/^<svg /);
    }
  });
  it('keeps each motion timeline consistent with its sprite frames', () => {
    for (const key of Object.keys(FARM_ACTION_TIMELINE) as Array<keyof typeof FARM_ACTION_TIMELINE>) {
      const motion = FARM_ACTION_TIMELINE[key];
      expect(FARM_ACTION_XML[key]).toHaveLength(motion.frames);
      expect(getFarmActionFrameIndex(key, 0)).toBe(0);
      expect(getFarmActionFrameIndex(key, Number.NaN)).toBe(0);
      expect(getFarmActionFrameIndex(key, 10_000, true)).toBe(0);
      const beyond = getFarmActionFrameIndex(key, motion.frames * motion.frameMs);
      expect(beyond).toBe(motion.loop ? 0 : motion.frames - 1);
    }
  });
});
