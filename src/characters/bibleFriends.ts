import type { ImageSourcePropType } from 'react-native';

export type BibleFriendId =
  | 'david-lamb'
  | 'noah-bear'
  | 'jonah-whale'
  | 'daniel-lion'
  | 'peace-dove'
  | 'hope-rabbit'
  | 'word-fox'
  | 'gentle-deer'
  | 'companion-donkey'
  | 'joy-chick'
  | 'peace-penguin'
  | 'love-otter'
  | 'patience-turtle';

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
  {
    id: 'hope-rabbit',
    name: '소망 토끼',
    inspiration: '긴 귀와 당근 장식을 가진 소망의 창작 친구',
    source: require('../../assets/characters/bible-friends/hope-rabbit-idle.png') as ImageSourcePropType,
  },
  {
    id: 'word-fox',
    name: '말씀 여우',
    inspiration: '책을 품은 말씀의 창작 친구',
    source: require('../../assets/characters/bible-friends/word-fox-idle.png') as ImageSourcePropType,
  },
  {
    id: 'gentle-deer',
    name: '온유 사슴',
    inspiration: '잎 목걸이를 단 온유한 창작 친구',
    source: require('../../assets/characters/bible-friends/gentle-deer-idle.png') as ImageSourcePropType,
  },
  {
    id: 'companion-donkey',
    name: '동행 당나귀',
    inspiration: '작은 안장 담요를 두른 동행의 창작 친구',
    source: require('../../assets/characters/bible-friends/companion-donkey-idle.png') as ImageSourcePropType,
  },
  {
    id: 'joy-chick',
    name: '기쁨 병아리',
    inspiration: '밀 이삭 장식을 단 기쁨의 창작 친구',
    source: require('../../assets/characters/bible-friends/joy-chick-idle.png') as ImageSourcePropType,
  },
  {
    id: 'peace-penguin',
    name: '평안 펭귄',
    inspiration: '목도리와 가방을 멘 평안의 창작 친구',
    source: require('../../assets/characters/bible-friends/peace-penguin-idle.png') as ImageSourcePropType,
  },
  {
    id: 'love-otter',
    name: '사랑 수달',
    inspiration: '하트 모양 돌을 품은 사랑의 창작 친구',
    source: require('../../assets/characters/bible-friends/love-otter-idle.png') as ImageSourcePropType,
  },
  {
    id: 'patience-turtle',
    name: '인내 거북이',
    inspiration: '십자가 장식을 단 인내의 창작 친구',
    source: require('../../assets/characters/bible-friends/patience-turtle-idle.png') as ImageSourcePropType,
  },
] as const satisfies readonly BibleFriend[];
