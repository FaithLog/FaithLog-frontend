import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_EVOLUTION_SPECIES, PRODUCTION_EVOLUTION_LEVELS,
  PRODUCTION_EVOLUTION_MOTION_FRAMES, PRODUCTION_EVOLUTION_ATLAS_SIZE,
  PRODUCTION_EVOLUTION_FRAME_COUNT, PRODUCTION_EVOLUTION_FRAME_SIZE,
} from './productionEvolvedMetadata';
import { BIBLE_FRIEND_DESIGN_SPECIES } from './bibleFriendDesignCatalog';
import { BIBLE_FRIEND_DESIGN_MOTION_OFFSETS } from './bibleFriendDesignMotionLayout';

describe('production evolved PNG asset contract', () => {
  it('covers exactly all 13 existing species at Lv2 and Lv3', () => {
    expect(PRODUCTION_EVOLUTION_SPECIES).toEqual(BIBLE_FRIEND_DESIGN_SPECIES.map(x => x.id));
    expect(PRODUCTION_EVOLUTION_SPECIES.length * PRODUCTION_EVOLUTION_LEVELS.length).toBe(26);
  });
  it('preserves 4x4 slot offsets and 192px per-frame geometry', () => {
    expect(PRODUCTION_EVOLUTION_ATLAS_SIZE).toBe(PRODUCTION_EVOLUTION_FRAME_SIZE * 4);
    expect(Object.values(PRODUCTION_EVOLUTION_MOTION_FRAMES).reduce((a,b) => a+b,0))
      .toBe(PRODUCTION_EVOLUTION_FRAME_COUNT);
    expect(BIBLE_FRIEND_DESIGN_MOTION_OFFSETS)
      .toEqual({ idle:0, walk:4, happy:8, held:12, land:14 });
  });
});
