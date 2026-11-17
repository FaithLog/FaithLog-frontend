import { describe, expect, it } from 'vitest';
import {
  EVOLVED_CARE_ACTIONS, EVOLVED_CARE_ATLAS_COLUMNS,
  getEvolvedCareFrameIndex,
} from './productionCareMotion';

describe('real evolved care action PNG atlas timelines', () => {
  it('has all 11 care actions, each with 4 frames', () => {
    expect(EVOLVED_CARE_ACTIONS).toHaveLength(11);
    expect(EVOLVED_CARE_ATLAS_COLUMNS).toBe(4);
    expect(new Set(EVOLVED_CARE_ACTIONS).size).toBe(11);
    for (const action of EVOLVED_CARE_ACTIONS) {
      expect(getEvolvedCareFrameIndex(action, 0)).toBe(0);
      expect(getEvolvedCareFrameIndex(action, 180)).toBe(1);
      expect(getEvolvedCareFrameIndex(action, Number.NaN)).toBe(0);
      expect(getEvolvedCareFrameIndex(action, 100000, true)).toBe(0);
    }
  });
  it('loops ongoing states but clamps a finite interaction at frame 3', () => {
    expect(getEvolvedCareFrameIndex('sleep', 720)).toBe(0);
    expect(getEvolvedCareFrameIndex('dirty', 720)).toBe(0);
    expect(getEvolvedCareFrameIndex('feed', 720)).toBe(3);
    expect(getEvolvedCareFrameIndex('clean', 720)).toBe(3);
    expect(getEvolvedCareFrameIndex('wake', 720)).toBe(3);
    expect(getEvolvedCareFrameIndex('feed', -1)).toBe(0);
  });
});
