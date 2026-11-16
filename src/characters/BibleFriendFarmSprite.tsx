import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { BibleFriendDesignSprite } from './BibleFriendDesignSprite';
import type { BibleFriendDesignSpriteProps } from './BibleFriendDesignSprite';
import { BIBLE_FRIEND_DESIGN_CATALOG } from './bibleFriendDesignCatalog';
import { FARM_ACTION_XML, FARM_EVOLUTION_XML } from './farmVisualAssetCatalog';
import type { FarmVisualAction } from './farmMotionTimeline';
import { getFarmActionFrameIndex } from './farmMotionTimeline';

export type BibleFriendFarmSpriteProps = BibleFriendDesignSpriteProps & {
  /** 0 is the original unchanged appearance; 1/2 add a species-specific visual overlay. */
  evolutionStage?: 0 | 1 | 2;
  /** Pure animation state. Gameplay and persistence are handled elsewhere. */
  farmAction?: FarmVisualAction;
  farmActionElapsedMs?: number;
  reduceMotion?: boolean;
};

/** Offline visual composition over existing character images, with no timers or API requests. */
export function BibleFriendFarmSprite({
  designId,
  evolutionStage = 0,
  farmAction,
  farmActionElapsedMs = 0,
  reduceMotion = false,
  size = 96,
  ...friendProps
}: BibleFriendFarmSpriteProps) {
  const design = BIBLE_FRIEND_DESIGN_CATALOG.find(item => item.id === designId);
  if (!design) return null;
  const stageKey = evolutionStage === 2 ? 'stage2' : evolutionStage === 1 ? 'stage1' : undefined;
  // Jesus' existing Miracle/silhouette logic stays entirely unchanged.
  const stageXml = design.friendId === 'jesus' || !stageKey || friendProps.silhouette
    ? undefined
    : FARM_EVOLUTION_XML[design.friendId][stageKey];
  const frames = farmAction && !friendProps.silhouette ? FARM_ACTION_XML[farmAction] : undefined;
  const frameIndex = farmAction ? getFarmActionFrameIndex(farmAction, farmActionElapsedMs, reduceMotion) : 0;
  const actionXml: string | undefined = frames?.[frameIndex];
  return (
    <View style={{ width: size, height: size }}>
      <BibleFriendDesignSprite {...friendProps} designId={designId} size={size} />
      {stageXml ? <SvgXml xml={stageXml} width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none" /> : null}
      {actionXml ? <SvgXml xml={actionXml} width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none" /> : null}
    </View>
  );
}
