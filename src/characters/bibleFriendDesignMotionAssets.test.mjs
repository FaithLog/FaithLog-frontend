import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BIBLE_FRIEND_DESIGN_CATALOG } from './bibleFriendDesignCatalog.ts';
import { BIBLE_FRIEND_MOTIONS } from './bibleFriendMotionTimeline.ts';

const root = resolve('assets/characters/bible-friends/design-motions');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('costume motion coverage', () => {
  it('covers every non-base design with one 768px transparent PNG atlas and static require', () => {
    const costumes = BIBLE_FRIEND_DESIGN_CATALOG.filter(design => design.styleId !== 'base');
    const registry = readFileSync(resolve('src/characters/bibleFriendDesignMotionAssets.ts'), 'utf8');
    expect(manifest.designs.map(design => design.id).sort()).toEqual(costumes.map(design => design.id).sort());
    expect(manifest.designs).toHaveLength(117);
    for (const design of manifest.designs) {
      const png = readFileSync(resolve(root, design.file));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(768);
      expect(png.readUInt32BE(20)).toBe(768);
      expect(png.length).toBe(design.bytes);
      // Palette atlases carry explicit alpha transparency.
      expect(png.includes(Buffer.from('tRNS'))).toBe(true);
      expect(registry).toContain(`'${design.id}': require('../../assets/characters/bible-friends/design-motions/${design.file}')`);
    }
    for (const id of new Set(costumes.map(design => design.friendId))) {
      expect(readdirSync(resolve(root, id)).filter(file => file.endsWith('.png'))).toHaveLength(9);
    }
    expect(BIBLE_FRIEND_DESIGN_CATALOG.every(design => design.animationReady)).toBe(true);
  });

  it('uses the same five timelines as base motion frames, covering all 16 atlas slots', () => {
    let offset = 0;
    for (const [motion, timeline] of Object.entries(BIBLE_FRIEND_MOTIONS)) {
      expect(manifest.motions[motion]).toEqual({ offset, ...timeline });
      offset += timeline.durationsMs.length;
    }
    expect(offset).toBe(manifest.framesPerDesign);
    expect(manifest.frameSize).toBe(192);
    expect(manifest.columns * manifest.rows).toBe(16);
  });
});
