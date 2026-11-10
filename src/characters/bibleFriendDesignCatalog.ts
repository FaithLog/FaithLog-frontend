import type { BibleFriendId } from './bibleFriends';

export const BIBLE_FRIEND_RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'UNIQUE'] as const;
export type BibleFriendRarity = typeof BIBLE_FRIEND_RARITIES[number];

export const BIBLE_FRIEND_DESIGN_STYLES = [
  { id: 'base', name: '기본', rarity: 'COMMON', weight: 240 },
  { id: 'sunshine', name: '햇살 소풍', rarity: 'COMMON', weight: 160 },
  { id: 'scholar', name: '작은 학자', rarity: 'COMMON', weight: 140 },
  { id: 'gardener', name: '초록 정원사', rarity: 'UNCOMMON', weight: 120 },
  { id: 'sailor', name: '바다 선원', rarity: 'UNCOMMON', weight: 100 },
  { id: 'explorer', name: '숲 탐험가', rarity: 'UNCOMMON', weight: 80 },
  { id: 'festival', name: '등불 축제', rarity: 'RARE', weight: 65 },
  { id: 'starlight', name: '별빛 잠옷', rarity: 'RARE', weight: 45 },
  { id: 'royal', name: '로열 가든', rarity: 'EPIC', weight: 40 },
  { id: 'unique', name: '전용 유니크', rarity: 'UNIQUE', weight: 10 },
] as const satisfies readonly { id: string; name: string; rarity: BibleFriendRarity; weight: number }[];

export type BibleFriendStyleId = typeof BIBLE_FRIEND_DESIGN_STYLES[number]['id'];
export type BibleFriendDesignId = `${BibleFriendId}:${BibleFriendStyleId}`;

export const BIBLE_FRIEND_DESIGN_SPECIES = [
  { id: 'david-lamb', name: '다윗의 양', uniqueName: '새벽 찬양' },
  { id: 'noah-bear', name: '노아의 곰', uniqueName: '무지개 방주 선장' },
  { id: 'jonah-whale', name: '요나의 고래', uniqueName: '별바다 항해자' },
  { id: 'daniel-lion', name: '다니엘의 사자', uniqueName: '새벽의 수호자' },
  { id: 'peace-dove', name: '평화의 비둘기', uniqueName: '올리브 정원의 전령' },
  { id: 'hope-rabbit', name: '소망 토끼', uniqueName: '달빛 정원사' },
  { id: 'word-fox', name: '말씀 여우', uniqueName: '별빛 서고지기' },
  { id: 'gentle-deer', name: '온유 사슴', uniqueName: '숲의 약속' },
  { id: 'companion-donkey', name: '동행 당나귀', uniqueName: '축제의 동행' },
  { id: 'joy-chick', name: '기쁨 병아리', uniqueName: '황금 밀밭의 노래' },
  { id: 'peace-penguin', name: '평안 펭귄', uniqueName: '오로라 우편배달부' },
  { id: 'love-otter', name: '사랑 수달', uniqueName: '진주빛 보물지기' },
  { id: 'patience-turtle', name: '인내 거북이', uniqueName: '오래된 정원의 파수꾼' },
 ] as const satisfies readonly { id: BibleFriendId; name: string; uniqueName: string }[];

export type BibleFriendDesign = Readonly<{
  id: BibleFriendDesignId;
  friendId: BibleFriendId;
  styleId: BibleFriendStyleId;
  name: string;
  rarity: BibleFriendRarity;
  weight: number;
  animationReady: boolean;
}>;

export const BIBLE_FRIEND_DESIGN_CATALOG: readonly BibleFriendDesign[] =
  BIBLE_FRIEND_DESIGN_SPECIES.flatMap(friend => BIBLE_FRIEND_DESIGN_STYLES.map(style => ({
    id: `${friend.id}:${style.id}` as BibleFriendDesignId,
    friendId: friend.id,
    styleId: style.id,
    name: style.id === 'unique' ? friend.uniqueName : `${friend.name} · ${style.name}`,
    rarity: style.rarity,
    weight: style.weight,
    animationReady: true,
  })));
