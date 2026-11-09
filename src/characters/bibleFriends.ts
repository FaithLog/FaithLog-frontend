import type { ImageSourcePropType } from 'react-native';

export type BibleFriendId =
  | 'david-lamb'
  | 'noah-bear'
  | 'jonah-whale'
  | 'daniel-lion'
  | 'peace-dove';

export type BibleFriend = Readonly<{
  id: BibleFriendId;
  name: string;
  inspiration: string;
  source: ImageSourcePropType;
}>;

// Keep literal require paths so Metro includes the assets in native bundles.
export const BIBLE_FRIENDS = [
  {
    id: 'david-lamb',
    name: '다윗의 양',
    inspiration: '다윗의 목동 시절과 수금 연주에서 영감을 받은 친구',
    source: require('../../assets/characters/bible-friends/david-lamb-idle.png') as ImageSourcePropType,
  },
  {
    id: 'noah-bear',
    name: '노아의 곰',
    inspiration: '노아의 방주와 동물들의 이야기에서 영감을 받은 친구',
    source: require('../../assets/characters/bible-friends/noah-bear-idle.png') as ImageSourcePropType,
  },
  {
    id: 'jonah-whale',
    name: '요나의 고래',
    inspiration: '요나와 큰 물고기 이야기에서 영감을 받은 고래 모양의 친구',
    source: require('../../assets/characters/bible-friends/jonah-whale-idle.png') as ImageSourcePropType,
  },
  {
    id: 'daniel-lion',
    name: '다니엘의 사자',
    inspiration: '다니엘의 기도와 사자 굴 이야기에서 영감을 받은 친구',
    source: require('../../assets/characters/bible-friends/daniel-lion-idle.png') as ImageSourcePropType,
  },
  {
    id: 'peace-dove',
    name: '평화의 비둘기',
    inspiration: '올리브 잎을 물고 돌아온 비둘기 이야기에서 영감을 받은 친구',
    source: require('../../assets/characters/bible-friends/peace-dove-idle.png') as ImageSourcePropType,
  },
] as const satisfies readonly BibleFriend[];
