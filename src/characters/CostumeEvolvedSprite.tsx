import React from 'react';
import {Image, View} from 'react-native';
import type {BibleFriendId} from './bibleFriends';
import type {BibleFriendMotion} from './bibleFriendMotionTimeline';
import type {CostumeEvolutionStyle} from './costumeEvolutionMetadata';
import {COSTUME_EVOLVED_ATLASES} from './costumeEvolvedAssets';
import {getBibleFriendDesignMotionLayout} from './bibleFriendDesignMotionLayout';

export type CostumeEvolvedSpriteProps = {
  speciesId: BibleFriendId;
  styleId: CostumeEvolutionStyle;
  stage: 1 | 2;
  motion?: BibleFriendMotion;
  elapsedMs?: number;
  reduceMotion?: boolean;
  size?: number;
  accessibilityLabel?: string;
};

/** One 4x4 PNG per species/costume/stage; no network or timer for each sprite. */
export function CostumeEvolvedSprite({
  speciesId, styleId, stage, motion = 'idle', elapsedMs = 0,
  reduceMotion = false, size = 96, accessibilityLabel,
}: CostumeEvolvedSpriteProps) {
  const layout = getBibleFriendDesignMotionLayout(motion, reduceMotion ? 0 : elapsedMs, size);
  const source = COSTUME_EVOLVED_ATLASES[speciesId][styleId][stage];
  return (
    <View accessible accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `${speciesId} ${styleId} 진화 ${stage}`}
      style={{width:layout.size,height:layout.size,overflow:'hidden'}}>
      <Image source={source} accessible={false} fadeDuration={0}
        resizeMode="stretch" style={{position:'absolute',left:layout.left,top:layout.top,
          width:layout.width,height:layout.height}} />
    </View>
  );
}
