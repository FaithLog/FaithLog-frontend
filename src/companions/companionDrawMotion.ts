import type {BibleFriendRarity} from '../characters/bibleFriendDesignCatalog';
export const MOTION_TONES: Readonly<Record<BibleFriendRarity, {ink: string; soft: string; deep: string}>> = {
  COMMON: {ink: '#92C7CF', soft: '#E8F6F7', deep: '#2E7078'},
  UNCOMMON: {ink: '#71B8C3', soft: '#E8F6F7', deep: '#2E7078'},
  RARE: {ink: '#AB8CE6', soft: '#F1ECFC', deep: '#7852AF'},
  EPIC: {ink: '#AB8CE6', soft: '#EEE6FC', deep: '#7852AF'},
  UNIQUE: {ink: '#E1BD68', soft: '#FFF4DB', deep: '#946313'},
};
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;
export function drawTimings(rarity: BibleFriendRarity, batch: boolean) {
  const special = ['RARE', 'EPIC', 'UNIQUE'].includes(rarity);
  const anticipation = batch ? 360 : 800;
  const gather = special ? 1250 : 500;
  const reveal = rarity === 'UNIQUE' ? 2300 : special ? 1800 : 950;
  return {anticipation, gather, reveal, total: anticipation + gather + reveal};
}
export function getDrawFrame(rarities: readonly BibleFriendRarity[], elapsedMs: number) {
  let remaining = Math.max(0, elapsedMs);
  const batch = rarities.length === 10;
  if (batch && remaining < 1000) return {phase: 'collection' as const, index: 0, progress: remaining / 1000, done: false};
  if (batch) remaining -= 1000;
  for (let index = 0; index < rarities.length; index++) {
    const timings = drawTimings(rarities[index]!, batch);
    if (remaining < timings.anticipation) return {phase: 'anticipation' as const, index, progress: remaining / timings.anticipation, done: false};
    remaining -= timings.anticipation;
    if (remaining < timings.gather) return {phase: 'gather' as const, index, progress: remaining / timings.gather, done: false};
    remaining -= timings.gather;
    if (remaining < timings.reveal) return {phase: 'reveal' as const, index, progress: remaining / timings.reveal, done: false};
    remaining -= timings.reveal;
  }
  return {phase: 'reveal' as const, index: Math.max(0, rarities.length - 1), progress: 1, done: true};
}
