import React from 'react';
import { Image, View } from 'react-native';
import type { BibleFriendId } from './bibleFriends';
import type { BibleFriendMotion } from './bibleFriendMotionTimeline';
import { getBibleFriendDesignMotionLayout } from './bibleFriendDesignMotionLayout';
import { PRODUCTION_EVOLVED_ATLASES } from './productionEvolvedAssets';

export type ProductionEvolvedSpriteProps = {
  speciesId: BibleFriendId;
  stage: 1 | 2;
  motion?: BibleFriendMotion;
  elapsedMs?: number;
  size?: number;
  reduceMotion?: boolean;
  accessibilityLabel?: string;
};

/** Uses the project's existing 16-slot timing and pivot; one static local PNG per stage. */
export function ProductionEvolvedSprite({
  speciesId, stage, motion = 'idle', elapsedMs = 0,
  size = 96, reduceMotion = false, accessibilityLabel,
}: ProductionEvolvedSpriteProps) {
  const layout = getBibleFriendDesignMotionLayout(motion, reduceMotion ? 0 : elapsedMs, size);
  const source = PRODUCTION_EVOLVED_ATLASES[speciesId][stage];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? speciesId}
      style={{ width: layout.size, height: layout.size, overflow: 'hidden' }}
    >
      <Image
        accessible={false}
        source={source}
        resizeMode="stretch"
        fadeDuration={0}
        style={{
          position: 'absolute',
          width: layout.width, height: layout.height,
          left: layout.left, top: layout.top,
        }}
      />
    </View>
  );
}
