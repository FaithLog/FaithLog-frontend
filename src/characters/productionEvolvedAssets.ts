import type { ImageSourcePropType } from 'react-native';
import type { BibleFriendId } from './bibleFriends';

/** Real, bundled production illustration PNG atlases (4x4 cells; 192px each). */
export const PRODUCTION_EVOLVED_ATLASES = {
  'david-lamb': {
    1: require('../../assets/characters/bible-friends/evolved/production/david-lamb-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/david-lamb-lv3.png') as ImageSourcePropType,
  },
  'noah-bear': {
    1: require('../../assets/characters/bible-friends/evolved/production/noah-bear-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/noah-bear-lv3.png') as ImageSourcePropType,
  },
  'jonah-whale': {
    1: require('../../assets/characters/bible-friends/evolved/production/jonah-whale-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/jonah-whale-lv3.png') as ImageSourcePropType,
  },
  'daniel-lion': {
    1: require('../../assets/characters/bible-friends/evolved/production/daniel-lion-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/daniel-lion-lv3.png') as ImageSourcePropType,
  },
  'peace-dove': {
    1: require('../../assets/characters/bible-friends/evolved/production/peace-dove-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/peace-dove-lv3.png') as ImageSourcePropType,
  },
  'hope-rabbit': {
    1: require('../../assets/characters/bible-friends/evolved/production/hope-rabbit-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/hope-rabbit-lv3.png') as ImageSourcePropType,
  },
  'word-fox': {
    1: require('../../assets/characters/bible-friends/evolved/production/word-fox-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/word-fox-lv3.png') as ImageSourcePropType,
  },
  'gentle-deer': {
    1: require('../../assets/characters/bible-friends/evolved/production/gentle-deer-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/gentle-deer-lv3.png') as ImageSourcePropType,
  },
  'companion-donkey': {
    1: require('../../assets/characters/bible-friends/evolved/production/companion-donkey-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/companion-donkey-lv3.png') as ImageSourcePropType,
  },
  'joy-chick': {
    1: require('../../assets/characters/bible-friends/evolved/production/joy-chick-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/joy-chick-lv3.png') as ImageSourcePropType,
  },
  'peace-penguin': {
    1: require('../../assets/characters/bible-friends/evolved/production/peace-penguin-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/peace-penguin-lv3.png') as ImageSourcePropType,
  },
  'love-otter': {
    1: require('../../assets/characters/bible-friends/evolved/production/love-otter-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/love-otter-lv3.png') as ImageSourcePropType,
  },
  'patience-turtle': {
    1: require('../../assets/characters/bible-friends/evolved/production/patience-turtle-lv2.png') as ImageSourcePropType,
    2: require('../../assets/characters/bible-friends/evolved/production/patience-turtle-lv3.png') as ImageSourcePropType,
  },
} satisfies Record<BibleFriendId, Record<1 | 2, ImageSourcePropType>>;
