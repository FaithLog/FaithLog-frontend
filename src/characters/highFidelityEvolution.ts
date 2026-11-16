import type { BibleFriendId } from './bibleFriends';
import type { BibleFriendDesignId } from './bibleFriendDesignCatalog';
import type { BibleFriendMotion } from './bibleFriendMotionTimeline';
import type { FarmVisualAction } from './farmMotionTimeline';

/**
 * TEMPORARY visual fallback using existing high-quality costume PNG atlases.
 * It is not a newly illustrated evolved animal body.
 */
export function getHighFidelityEvolutionDesignId(
  speciesId: BibleFriendId,
  stage: 1 | 2,
): BibleFriendDesignId {
  return (speciesId + (stage === 1 ? ':royal' : ':unique')) as BibleFriendDesignId;
}

export function getHighFidelityFarmMotion(
  farmAction: FarmVisualAction | undefined,
  originalMotion: BibleFriendMotion = 'idle',
): BibleFriendMotion {
  if (!farmAction) return originalMotion;
  if (
    farmAction === 'feed' || farmAction === 'play' ||
    farmAction === 'pet' || farmAction === 'clean' || farmAction === 'evolve'
  ) return 'happy';
  return 'idle';
}
