import { describe, expect, it } from 'vitest';

import { BIBLE_FRIEND_DESIGN_CATALOG, BIBLE_FRIEND_DESIGN_STYLES } from './bibleFriendDesignCatalog';
import {
  BIBLE_FRIEND_DEFAULT_DRAW_POOL,
  createBibleFriendDrawPool,
  getBibleFriendDesignProbability,
  pickBibleFriendDesign,
} from './bibleFriendDesignDraw';

describe('collectible design weights', () => {
  it('contains ten designs per species, including one exclusive unique design', () => {
    expect(BIBLE_FRIEND_DESIGN_CATALOG).toHaveLength(131);
    expect(new Set(BIBLE_FRIEND_DESIGN_CATALOG.map(design => design.id)).size).toBe(131);
    const species = new Set(BIBLE_FRIEND_DESIGN_CATALOG.map(design => design.friendId));
    expect(species.size).toBe(14);
    for (const friendId of species) {
      if(friendId==='jesus') continue;
      const designs = BIBLE_FRIEND_DESIGN_CATALOG.filter(design => design.friendId === friendId);
      expect(designs).toHaveLength(10);
      expect(designs.filter(design => design.rarity === 'UNIQUE')).toHaveLength(1);
      expect(designs.filter(design => design.animationReady)).toHaveLength(10);
    }
  });

  it('uses exactly 54/30/11/4/1 percent tier odds and equal species odds by default', () => {
    const pool = BIBLE_FRIEND_DEFAULT_DRAW_POOL;
    expect(pool.totalWeight).toBe(130_000_000);
    for(const [tier,percent] of Object.entries({COMMON:53.9946,UNCOMMON:29.997,RARE:10.9989,EPIC:3.9996,UNIQUE:0.9999,MIRACLE:0.01})) {
      expect(pool.rarityWeights[tier as keyof typeof pool.rarityWeights]/pool.totalWeight*100).toBeCloseTo(percent,8);
    }
    for (const friendId of new Set(pool.entries.map(design => design.friendId))) {
      if(friendId==='jesus') continue;
      expect(pool.entries.filter(design => design.friendId === friendId)
        .reduce((sum, design) => sum + design.weight, 0)).toBe(9999000);
    }
    expect(getBibleFriendDesignProbability(pool, 'love-otter:unique')).toBeCloseTo(9999 / 13000000);
  });

  it('can select every one of the 130 designs without probabilistic test flakiness', () => {
    const pool = BIBLE_FRIEND_DEFAULT_DRAW_POOL;
    let before = 0;
    for (const design of pool.entries) {
      const middle = (before + design.weight / 2) / pool.totalWeight;
      expect(pickBibleFriendDesign(pool, middle).id).toBe(design.id);
      before += design.weight;
    }
    expect(pickBibleFriendDesign(pool, 0).id).toBe('david-lamb:base');
    expect(pickBibleFriendDesign(pool, 1 - Number.EPSILON).id).toBe('jesus:miracle');
  });

  it('renormalizes odds after a style weight change and excludes a disabled design', () => {
    const pool = createBibleFriendDrawPool({
      styleWeights: { unique: 20 },
      designWeights: { 'love-otter:unique': 0 },
    });
    expect(pool.entries).toHaveLength(130);
    expect(pool.totalWeight).toBe(128700370);
    expect(pool.rarityWeights.UNIQUE).toBe(240);
    expect(getBibleFriendDesignProbability(pool, 'love-otter:unique')).toBe(0);
    expect(getBibleFriendDesignProbability(pool, 'david-lamb:unique')).toBeCloseTo(20 / 128700370);
  });

  it('rejects unusable weights and all-disabled pools', () => {
    for (const weight of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createBibleFriendDrawPool({ styleWeights: { base: weight } })).toThrow(RangeError);
    }
    expect(() => createBibleFriendDrawPool({ styleWeights: { base: Number.MAX_SAFE_INTEGER } }))
      .toThrow(RangeError);
    const allZero = Object.fromEntries(BIBLE_FRIEND_DESIGN_STYLES.map(style => [style.id, 0]));
    expect(() => createBibleFriendDrawPool({ styleWeights: allZero, designWeights: {'jesus:miracle':0} })).toThrow(RangeError);
    expect(() => createBibleFriendDrawPool({ styleWeights: JSON.parse('{"unknown": 10}') }))
      .toThrow('Unknown design weight ID');
  });

  it('rejects random inputs that could bias or overflow the draw', () => {
    for (const random of [-0.1, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => pickBibleFriendDesign(BIBLE_FRIEND_DEFAULT_DRAW_POOL, random)).toThrow(RangeError);
    }
  });
});
