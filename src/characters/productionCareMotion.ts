/** Evolved characters' source-derived, illustrated care actions (4 distinct PNG frames each). */
export const EVOLVED_CARE_ACTIONS = [
  'feed', 'play', 'sleep', 'wake', 'pet', 'dirty', 'clean',
  'hungry', 'sick', 'faint', 'evolve',
] as const;
export type EvolvedCareAction = typeof EVOLVED_CARE_ACTIONS[number];
export const EVOLVED_CARE_ATLAS_COLUMNS = 4;
export const EVOLVED_CARE_FRAME_SIZE = 192;
export const EVOLVED_CARE_FRAME_MS = 180;
const LOOPING = new Set<EvolvedCareAction>(['sleep', 'dirty', 'hungry', 'sick', 'faint']);

export function getEvolvedCareFrameIndex(
  action: EvolvedCareAction,
  elapsedMs: number,
  reduceMotion = false,
): number {
  if (reduceMotion) return 0;
  const ms = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const n = Math.floor(ms / EVOLVED_CARE_FRAME_MS);
  return LOOPING.has(action) ? n % EVOLVED_CARE_ATLAS_COLUMNS : Math.min(n, EVOLVED_CARE_ATLAS_COLUMNS - 1);
}
