import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BIBLE_FRIEND_DESIGN_CATALOG } from './bibleFriendDesignCatalog.ts';
import { BIBLE_FRIEND_DEFAULT_DRAW_POOL } from './bibleFriendDesignDraw.ts';

const root = resolve('assets/characters/bible-friends/designs');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('collectible design files', () => {
  it('matches all catalog IDs and default weights to the exported PNG manifest', () => {
    expect(manifest.designs).toHaveLength(130);
    expect(manifest.totalWeight).toBe(BIBLE_FRIEND_DEFAULT_DRAW_POOL.totalWeight);
    expect(manifest.designs.map(design => design.id)).toEqual(BIBLE_FRIEND_DESIGN_CATALOG.map(design => design.id));
    for (const design of BIBLE_FRIEND_DESIGN_CATALOG) {
      const exported = manifest.designs.find(item => item.id === design.id);
      expect(exported).toMatchObject(design);
    }
  });

  it('ships 117 costume PNGs and reuses the 13 original basic images with static requires', () => {
    const registry = readFileSync(resolve('src/characters/bibleFriendDesignAssets.ts'), 'utf8');
    const basic = JSON.parse(readFileSync(resolve('assets/characters/bible-friends/manifest.json'), 'utf8'));
    expect(manifest.species.map(friend => friend.id).sort()).toEqual(basic.characters.map(friend => friend.id).sort());
    let costumes = 0;
    for (const friend of manifest.species) {
      expect(readdirSync(resolve(root, friend.id)).filter(file => file.endsWith('.png'))).toHaveLength(9);
    }
    for (const design of manifest.designs) {
      const png = readFileSync(resolve(root, design.file));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(design.width);
      expect(png.readUInt32BE(20)).toBe(design.height);
      expect(png.length).toBe(design.bytes);
      const relative = design.styleId === 'base' ? `${design.friendId}-idle.png` : `designs/${design.file}`;
      expect(registry).toContain(`'${design.id}': require('../../assets/characters/bible-friends/${relative}')`);
      if (design.styleId !== 'base') {
        expect(design.width).toBe(288);
        expect(design.height).toBe(288);
        expect(design.animationReady).toBe(true);
        costumes += 1;
      }
    }
    expect(costumes).toBe(117);
  });
});
