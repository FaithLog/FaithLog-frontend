import React from 'react';
import {Image,View} from 'react-native';
import type {BibleFriendMotion} from './bibleFriendMotionTimeline';

/** The supplied 10×8 sheet has 20 idle, 20 walk, 20 happy, 10 held and 10 landing frames. */
export function getJesusMiracleFrame(motion:BibleFriendMotion,elapsedMs:number) {
  const ranges={idle:[0,20,120,true],walk:[20,20,80,true],happy:[40,20,80,false],held:[60,10,120,true],land:[70,10,60,false]} as const;
  const [offset,count,duration,loop]=ranges[motion];
  const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0;
  const frame=Math.floor(elapsed/duration);
  return offset+(loop?frame%count:Math.min(count-1,frame));
}
export function JesusMiracleSprite({motion,elapsedMs,size,accessibilityLabel}:{motion:BibleFriendMotion;elapsedMs:number;size:number;accessibilityLabel:string}) {
 const safeSize=Number.isFinite(size)&&size>0?size:96;
 const frame=getJesusMiracleFrame(motion,elapsedMs);
 return <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{width:safeSize,height:safeSize,overflow:'hidden'}}>
  <Image accessible={false} source={require('../../assets/characters/jesus-miracle/atlas.png')} resizeMode="stretch" fadeDuration={0}
   style={{position:'absolute',width:safeSize*10,height:safeSize*8,left:-(frame%10)*safeSize,top:-Math.floor(frame/10)*safeSize}} />
 </View>;
}
