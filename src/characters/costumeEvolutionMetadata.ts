import type {BibleFriendStyleId} from './bibleFriendDesignCatalog';
export const COSTUME_EVOLUTION_SPECIES = ["david-lamb", "noah-bear", "jonah-whale", "daniel-lion", "peace-dove", "hope-rabbit", "word-fox", "gentle-deer", "companion-donkey", "joy-chick", "peace-penguin", "love-otter", "patience-turtle"] as const;
export const COSTUME_EVOLUTION_STYLES = ["sunshine", "scholar", "gardener", "sailor", "explorer", "festival", "starlight", "royal", "unique"] as const;
export type CostumeEvolutionStyle = Exclude<BibleFriendStyleId,'base'>;
export const COSTUME_EVOLUTION_LEVELS = [1,2] as const;
export const COSTUME_EVOLUTION_COUNT = 234;
export const COSTUME_EVOLUTION_ATLAS_SIZE = 768;
export const COSTUME_EVOLUTION_FRAMES = 16;
