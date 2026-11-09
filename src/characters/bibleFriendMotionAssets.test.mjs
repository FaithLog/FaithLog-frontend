import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BIBLE_FRIEND_MOTIONS } from './bibleFriendMotionTimeline.ts';

const root = resolve('assets/characters/bible-friends/motions');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('bundled Bible friend animation assets', () => {
  it('ships all 80 equally sized PNG frames with literal Metro references', () => {
    const source = readFileSync(resolve('src/characters/bibleFriendMotionAssets.ts'), 'utf8');
    expect(manifest.characters).toHaveLength(5);
    let count = 0;
    for (const character of manifest.characters) {
      expect(readdirSync(resolve(root, character.id)).filter(file => file.endsWith('.png'))).toHaveLength(16);
      for (const [motion, timing] of Object.entries(BIBLE_FRIEND_MOTIONS)) {
        const animation = character.animations[motion];
        expect(animation?.loop).toBe(timing.loop);
        expect(animation?.frames.map(frame => frame.durationMs)).toEqual([...timing.durationsMs]);
        for (const frame of animation?.frames ?? []) {
          const png = readFileSync(resolve(root, frame.file));
          expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
          expect(png.readUInt32BE(16)).toBe(manifest.frameSize);
          expect(png.readUInt32BE(20)).toBe(manifest.frameSize);
          expect(source).toContain(`require('../../assets/characters/bible-friends/motions/${frame.file}')`);
          count += 1;
        }
      }
    }
    expect(count).toBe(80);
  });
});
