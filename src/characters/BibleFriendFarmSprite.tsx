import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { BibleFriendDesignSprite } from './BibleFriendDesignSprite';
import type { BibleFriendDesignSpriteProps } from './BibleFriendDesignSprite';
import { BIBLE_FRIEND_DESIGN_CATALOG } from './bibleFriendDesignCatalog';
import { ProductionEvolvedSprite } from './ProductionEvolvedSprite';
import { EvolvedCareActionSprite } from './EvolvedCareActionSprite';
import { CostumeEvolvedSprite } from './CostumeEvolvedSprite';
import type { CostumeEvolutionStyle } from './costumeEvolutionMetadata';
import type { BibleFriendId } from './bibleFriends';
import { FARM_ACTION_XML, FARM_EVOLUTION_XML } from './farmVisualAssetCatalog';
import type { FarmVisualAction } from './farmMotionTimeline';
import { getFarmActionFrameIndex } from './farmMotionTimeline';
import { getHighFidelityFarmMotion } from './highFidelityEvolution';

export type BibleFriendFarmSpriteProps = BibleFriendDesignSpriteProps & {
  evolutionStage?: 0 | 1 | 2;
  farmAction?: FarmVisualAction;
  farmActionElapsedMs?: number;
  reduceMotion?: boolean;
};

/** Genuine stage-specific FaithLog illustrations. No royal/unique costume substitutions. */
export function BibleFriendFarmSprite({
  designId, evolutionStage = 0, farmAction,
  farmActionElapsedMs = 0, reduceMotion = false, size = 96, ...friendProps
}: BibleFriendFarmSpriteProps) {
  const design = BIBLE_FRIEND_DESIGN_CATALOG.find(item => item.id === designId);
  if (!design) return null;

  const stageKey = evolutionStage === 2 ? 'stage2' : evolutionStage === 1 ? 'stage1' : undefined;
  const isEvolvedBase = !!stageKey && design.styleId === 'base' &&
    design.friendId !== 'jesus' && !friendProps.silhouette;
  const frames = farmAction && !friendProps.silhouette ? FARM_ACTION_XML[farmAction] : undefined;
  const frameIndex = farmAction
    ? getFarmActionFrameIndex(farmAction, farmActionElapsedMs, reduceMotion) : 0;
  const actionXml: string | undefined = frames?.[frameIndex];

  if (isEvolvedBase) {
    // Dedicated character PNG frame atlases include action props and effects,
    // so DO NOT draw the previous generic SVG overlay a second time.
    const careAction = farmAction ?? (friendProps.motion === 'land' ? 'wake' : undefined);
    const elapsedMs = farmAction ? farmActionElapsedMs : (friendProps.elapsedMs ?? 0);

    return (
      <View style={{ width: size, height: size }}>
        {careAction ? (
          <EvolvedCareActionSprite
            speciesId={design.friendId}
            stage={evolutionStage as 1 | 2}
            action={careAction}
            elapsedMs={elapsedMs}
            reduceMotion={reduceMotion}
            size={size}
            accessibilityLabel={friendProps.accessibilityLabel ?? design.name}
          />
        ) : (
          <ProductionEvolvedSprite
            speciesId={design.friendId}
            stage={evolutionStage as 1 | 2}
            motion={getHighFidelityFarmMotion(undefined, friendProps.motion)}
            elapsedMs={reduceMotion ? 0 : elapsedMs}
            reduceMotion={reduceMotion}
            size={size}
            accessibilityLabel={friendProps.accessibilityLabel ?? design.name}
          />
        )}
      </View>
    );
  }

  // Keep gacha IDs and costume ownership unchanged. Use generated evolution
  // atlases for the original nine costume variants only when actually evolved.
  const isEvolvedCostume = !!stageKey && design.styleId !== 'base' &&
    design.friendId !== 'jesus' && !friendProps.silhouette;
  if (isEvolvedCostume) {
    const motion = getHighFidelityFarmMotion(farmAction, friendProps.motion);
    const elapsedMs = farmAction ? farmActionElapsedMs : (friendProps.elapsedMs ?? 0);
    return (
      <View style={{width:size,height:size}}>
        <CostumeEvolvedSprite
          speciesId={design.friendId as BibleFriendId}
          styleId={design.styleId as CostumeEvolutionStyle}
          stage={evolutionStage as 1 | 2}
          motion={motion} elapsedMs={elapsedMs}
          reduceMotion={reduceMotion} size={size}
          accessibilityLabel={friendProps.accessibilityLabel ?? design.name}
        />
        {actionXml ? (
          <SvgXml xml={actionXml} width={size} height={size}
            pointerEvents="none" style={{position:'absolute',left:0,top:0}} />
        ) : null}
      </View>
    );
  }

  // Lv1, Jesus Miracle and unowned silhouettes keep original presentation.
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
