import React from 'react';
import { Image, Platform, View } from 'react-native';

import type { BibleFriendDesignId } from './bibleFriendDesignCatalog';
import { BIBLE_FRIEND_DESIGN_CATALOG } from './bibleFriendDesignCatalog';
import { BIBLE_FRIEND_DESIGN_MOTION_ATLASES } from './bibleFriendDesignMotionAssets';
import { getBibleFriendDesignMotionLayout } from './bibleFriendDesignMotionLayout';
import { BIBLE_FRIEND_MOTION_FRAMES } from './bibleFriendMotionAssets';
import type { BibleFriendMotion } from './bibleFriendMotionTimeline';

export type BibleFriendDesignSpriteProps = {
  designId: BibleFriendDesignId;
  motion?: BibleFriendMotion;
  /** Time since this motion started. Caller owns the clock and pause/reduce-motion policy. */
  elapsedMs?: number;
  size?: number;
  accessibilityLabel?: string;
  silhouette?: boolean;
};

/** Bundled assets only: no fetching or interval per sprite. */
export function BibleFriendDesignSprite({
  designId,
  motion = 'idle',
  elapsedMs = 0,
  size = 96,
  accessibilityLabel,
  silhouette = false,
}: BibleFriendDesignSpriteProps) {
  const design = BIBLE_FRIEND_DESIGN_CATALOG.find(item => item.id === designId);
  if (!design) return null;
  const layout = getBibleFriendDesignMotionLayout(motion, elapsedMs, size);
  const label = accessibilityLabel ?? (silhouette ? `${design.name} · 미획득 실루엣` : design.name);
  const tintColor = silhouette ? '#000000' : undefined;

  if (design.styleId === 'base' && Platform.OS === 'web') {
    // Keep every decoded frame mounted: changing Image.source on each tick
    // causes react-native-web to briefly hide the image while resolving it.
    const frames = BIBLE_FRIEND_MOTION_FRAMES[design.friendId];
    return <View accessible accessibilityRole="image" accessibilityLabel={label}
      style={{width: layout.size, height: layout.size}}>
      {(Object.keys(frames) as BibleFriendMotion[]).flatMap(frameMotion => frames[frameMotion].map((source, index) =>
        <Image key={`${frameMotion}-${index}`} accessible={false} source={source} resizeMode="contain" fadeDuration={0}
          tintColor={tintColor}
          style={{position: 'absolute', width: layout.size, height: layout.size,
            opacity: frameMotion === motion && index === layout.frameIndex ? 1 : 0}} />))}
    </View>;
  }

  if (design.styleId === 'base') {
    return <Image
      tintColor={tintColor}
      source={BIBLE_FRIEND_MOTION_FRAMES[design.friendId][motion][layout.frameIndex]}
      accessibilityLabel={label}
      resizeMode="contain"
      fadeDuration={0}
      style={{ width: layout.size, height: layout.size }}
    />;
  }

  const source = BIBLE_FRIEND_DESIGN_MOTION_ATLASES[
    designId as keyof typeof BIBLE_FRIEND_DESIGN_MOTION_ATLASES
  ];
  return <View
    accessible
    accessibilityRole="image"
    accessibilityLabel={label}
    style={{ width: layout.size, height: layout.size, overflow: 'hidden' }}
  >
    <Image
      accessible={false}
      tintColor={tintColor}
      source={source}
      resizeMode="stretch"
      fadeDuration={0}
      style={{ position: 'absolute', width: layout.width, height: layout.height,
        left: layout.left, top: layout.top }}
    />
  </View>;
}
