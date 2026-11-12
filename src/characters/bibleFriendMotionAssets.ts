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
  'hope-rabbit': {
    idle: [
      require('../../assets/characters/bible-friends/motions/hope-rabbit/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/hope-rabbit/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/hope-rabbit/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/hope-rabbit/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/hope-rabbit/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/hope-rabbit/land-1.png') as ImageSourcePropType,
    ],
  },
  'word-fox': {
    idle: [
      require('../../assets/characters/bible-friends/motions/word-fox/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/word-fox/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/word-fox/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/word-fox/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/word-fox/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/word-fox/land-1.png') as ImageSourcePropType,
    ],
  },
  'gentle-deer': {
    idle: [
      require('../../assets/characters/bible-friends/motions/gentle-deer/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/gentle-deer/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/gentle-deer/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/gentle-deer/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/gentle-deer/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/gentle-deer/land-1.png') as ImageSourcePropType,
    ],
  },
  'companion-donkey': {
    idle: [
      require('../../assets/characters/bible-friends/motions/companion-donkey/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/companion-donkey/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/companion-donkey/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/companion-donkey/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/companion-donkey/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/companion-donkey/land-1.png') as ImageSourcePropType,
    ],
  },
  'joy-chick': {
    idle: [
      require('../../assets/characters/bible-friends/motions/joy-chick/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/joy-chick/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/joy-chick/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/joy-chick/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/joy-chick/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/joy-chick/land-1.png') as ImageSourcePropType,
    ],
  },
  'peace-penguin': {
    idle: [
      require('../../assets/characters/bible-friends/motions/peace-penguin/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/peace-penguin/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/peace-penguin/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/peace-penguin/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/peace-penguin/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/peace-penguin/land-1.png') as ImageSourcePropType,
    ],
  },
  'love-otter': {
    idle: [
      require('../../assets/characters/bible-friends/motions/love-otter/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/love-otter/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/love-otter/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/love-otter/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/love-otter/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/love-otter/land-1.png') as ImageSourcePropType,
    ],
  },
  'patience-turtle': {
    idle: [
      require('../../assets/characters/bible-friends/motions/patience-turtle/idle-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/idle-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/idle-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/idle-3.png') as ImageSourcePropType,
    ],
    walk: [
      require('../../assets/characters/bible-friends/motions/patience-turtle/walk-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/walk-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/walk-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/walk-3.png') as ImageSourcePropType,
    ],
    happy: [
      require('../../assets/characters/bible-friends/motions/patience-turtle/happy-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/happy-1.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/happy-2.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/happy-3.png') as ImageSourcePropType,
    ],
    held: [
      require('../../assets/characters/bible-friends/motions/patience-turtle/held-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/held-1.png') as ImageSourcePropType,
    ],
    land: [
      require('../../assets/characters/bible-friends/motions/patience-turtle/land-0.png') as ImageSourcePropType,
      require('../../assets/characters/bible-friends/motions/patience-turtle/land-1.png') as ImageSourcePropType,
    ],
  },
} as const satisfies Record<BibleFriendId, Record<BibleFriendMotion, readonly ImageSourcePropType[]>>;
