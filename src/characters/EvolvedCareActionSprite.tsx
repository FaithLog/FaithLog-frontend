import React from 'react';
import { Image, View } from 'react-native';

import type { BibleFriendId } from './bibleFriends';
import { EVOLVED_CARE_ATLASES } from './evolvedCareAtlasAssets';
import type { EvolvedCareAction } from './productionCareMotion';
import { getEvolvedCareFrameIndex } from './productionCareMotion';

export type EvolvedCareActionSpriteProps = {
  speciesId: BibleFriendId;
  stage: 1 | 2;
  action: EvolvedCareAction;
  elapsedMs?: number;
  reduceMotion?: boolean;
  size?: number;
  accessibilityLabel?: string;
};

/**
 * Four frames in a single horizontally-sliced PNG (768x192).
 * Static Metro requires ensure that all action art is available offline.
 * The source never changes while the frames animate, preventing web flashing.
 */
export function EvolvedCareActionSprite({
  speciesId, stage, action, elapsedMs = 0, reduceMotion = false,
  size = 96, accessibilityLabel,
}: EvolvedCareActionSpriteProps) {
  const frame = getEvolvedCareFrameIndex(action, elapsedMs, reduceMotion);
  const source = EVOLVED_CARE_ATLASES[speciesId][stage][action];
  const safeSize = Number.isFinite(size) && size > 0 ? size : 96;
  return (
    <View accessible accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `${speciesId} · ${action}`}
      style={{width: safeSize, height: safeSize, overflow: 'hidden'}}>
      <Image source={source} accessible={false} resizeMode="stretch" fadeDuration={0}
        style={{position: 'absolute', left: -frame * safeSize, top: 0,
          width: safeSize * 4, height: safeSize}} />
    </View>
  );
}
