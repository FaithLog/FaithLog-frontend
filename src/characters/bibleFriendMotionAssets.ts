import type { ImageSourcePropType } from 'react-native';

import type { BibleFriendId } from './bibleFriends';
import type { BibleFriendMotion } from './bibleFriendMotionTimeline';

export const BIBLE_FRIEND_FRAME_SIZE = 192;
export const BIBLE_FRIEND_FRAME_ANCHOR = { x: 96, y: 176 } as const;

// Literal require paths let Metro bundle all motion frames offline.
export const BIBLE_FRIEND_MOTION_FRAMES = {
  'david-lamb': {
    idle: [
      require('../../assets/characters/bible-friends/motions/david-lamb/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/david-lamb/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/david-lamb/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/david-lamb/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/david-lamb/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/david-lamb/land-1.png') as ImageSourcePropType,
    ],
  },
  'noah-bear': {
    idle: [
      require('../../assets/characters/bible-friends/motions/noah-bear/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/noah-bear/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/noah-bear/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/noah-bear/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/noah-bear/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/noah-bear/land-1.png') as ImageSourcePropType,
    ],
  },
  'jonah-whale': {
    idle: [
      require('../../assets/characters/bible-friends/motions/jonah-whale/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/jonah-whale/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/jonah-whale/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/jonah-whale/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/jonah-whale/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/jonah-whale/land-1.png') as ImageSourcePropType,
    ],
  },
  'daniel-lion': {
    idle: [
      require('../../assets/characters/bible-friends/motions/daniel-lion/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/daniel-lion/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/daniel-lion/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/daniel-lion/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/daniel-lion/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/daniel-lion/land-1.png') as ImageSourcePropType,
    ],
  },
  'peace-dove': {
    idle: [
      require('../../assets/characters/bible-friends/motions/peace-dove/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/peace-dove/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/peace-dove/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/peace-dove/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/peace-dove/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-dove/land-1.png') as ImageSourcePropType,
    ],
  },
} as const satisfies Record<BibleFriendId, Record<BibleFriendMotion, readonly ImageSourcePropType[]>>;
