import { describe, expect, it } from 'vitest';
import { BIBLE_FRIEND_DESIGN_SPECIES, BIBLE_FRIEND_DESIGN_CATALOG } from './bibleFriendDesignCatalog';
import { getHighFidelityEvolutionDesignId, getHighFidelityFarmMotion } from './highFidelityEvolution';

describe('high-fidelity temporary evolution art', () => {
  it('selects two bundled sprite designs for all 13 species', () => {
    expect(BIBLE_FRIEND_DESIGN_SPECIES).toHaveLength(13);
    for (const species of BIBLE_FRIEND_DESIGN_SPECIES) {
      const stage1 = getHighFidelityEvolutionDesignId(species.id, 1);
      const stage2 = getHighFidelityEvolutionDesignId(species.id, 2);
      expect(stage1).toBe(species.id + ':royal');
      expect(stage2).toBe(species.id + ':unique');
      expect(stage1).not.toBe(stage2);
      expect(BIBLE_FRIEND_DESIGN_CATALOG.some(x => x.id === stage1 && x.animationReady)).toBe(true);
      expect(BIBLE_FRIEND_DESIGN_CATALOG.some(x => x.id === stage2 && x.animationReady)).toBe(true);
    }
  });
  it('keeps ordinary motions and selects supported motions for care actions', () => {
    expect(getHighFidelityFarmMotion(undefined, 'walk')).toBe('walk');
    expect(getHighFidelityFarmMotion('feed', 'walk')).toBe('happy');
    expect(getHighFidelityFarmMotion('sleep', 'walk')).toBe('idle');
    expect(getHighFidelityFarmMotion('pet', 'idle')).toBe('happy');
    expect(getHighFidelityFarmMotion('evolve', 'idle')).toBe('happy');
  });
});
