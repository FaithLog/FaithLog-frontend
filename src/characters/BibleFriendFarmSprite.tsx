import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { BibleFriendDesignSprite } from './BibleFriendDesignSprite';
import type { BibleFriendDesignSpriteProps } from './BibleFriendDesignSprite';
import { BIBLE_FRIEND_DESIGN_CATALOG } from './bibleFriendDesignCatalog';
import { FARM_ACTION_XML, FARM_EVOLUTION_XML } from './farmVisualAssetCatalog';
import type { FarmVisualAction } from './farmMotionTimeline';
import { getFarmActionFrameIndex } from './farmMotionTimeline';
import { getHighFidelityEvolutionDesignId, getHighFidelityFarmMotion } from './highFidelityEvolution';

export type BibleFriendFarmSpriteProps = BibleFriendDesignSpriteProps & {
  evolutionStage?: 0 | 1 | 2;
  farmAction?: FarmVisualAction;
  farmActionElapsedMs?: number;
  reduceMotion?: boolean;
};

/** Use consistent PNG atlases until final evolved-body illustrations are approved. */
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
  const isEvolvedBase = !!stageKey && design.styleId === 'base' &&
    design.friendId !== 'jesus' && !friendProps.silhouette;

  const frames = farmAction && !friendProps.silhouette
    ? FARM_ACTION_XML[farmAction] : undefined;
  const frameIndex = farmAction
    ? getFarmActionFrameIndex(farmAction, farmActionElapsedMs, reduceMotion) : 0;
  const actionXml: string | undefined = frames?.[frameIndex];

  if (isEvolvedBase) {
    const stageDesignId = getHighFidelityEvolutionDesignId(
      design.friendId, evolutionStage as 1 | 2,
    );
    const motion = getHighFidelityFarmMotion(farmAction, friendProps.motion);
    const elapsedMs = farmAction ? farmActionElapsedMs : (friendProps.elapsedMs ?? 0);
    const sleeping = farmAction === 'sleep' || farmAction === 'faint';

    return (
      <View style={{ width: size, height: size }}>
        <View style={{
          width: size, height: size,
          transform: sleeping
            ? [
                { translateY: size * 0.05 },
                { rotate: farmAction === 'faint' ? '18deg' : '9deg' },
                { scaleY: 0.91 },
              ] : [],
        }}>
          <BibleFriendDesignSprite
            designId={stageDesignId}
            motion={motion}
            elapsedMs={reduceMotion ? 0 : elapsedMs}
            size={size}
            accessibilityLabel={friendProps.accessibilityLabel ?? design.name}
          />
        </View>
        {actionXml ? (
          <SvgXml
            xml={actionXml}
            width={size} height={size} pointerEvents="none"
            style={{ position: 'absolute', left: 0, top: 0 }}
          />
        ) : null}
      </View>
    );
  }

  // Preserve other collectible costumes, original base state, silhouettes and Miracle.
  const stageXml = design.friendId === 'jesus' || !stageKey || friendProps.silhouette
    ? undefined : FARM_EVOLUTION_XML[design.friendId][stageKey];

  return (
    <View style={{ width: size, height: size }}>
      <BibleFriendDesignSprite {...friendProps} designId={designId} size={size} />
      {stageXml ? (
        <SvgXml xml={stageXml} width={size} height={size} pointerEvents="none"
          style={{ position: 'absolute', left: 0, top: 0 }} />
      ) : null}
      {actionXml ? (
        <SvgXml xml={actionXml} width={size} height={size} pointerEvents="none"
          style={{ position: 'absolute', left: 0, top: 0 }} />
      ) : null}
    </View>
  );
}
