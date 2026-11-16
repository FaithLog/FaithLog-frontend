import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { BibleFriendId } from './bibleFriends';
import type { EvolvedAction } from './evolvedAnimalMotion';
import { getEvolvedActionFrame } from './evolvedAnimalMotion';
import { EVOLVED_ANIMAL_XML } from './evolvedAnimalXmlCatalog';

export type EvolvedAnimalSpriteProps = {speciesId:BibleFriendId;stage:1|2;action?:EvolvedAction;elapsedMs?:number;size?:number;reduceMotion?:boolean};
/** Independent full-body art plus interpolated transform animation, no per-sprite timer. */
export function EvolvedAnimalSprite({speciesId,stage,action='idle',elapsedMs=0,size=96,reduceMotion=false}:EvolvedAnimalSpriteProps){
 const frame=getEvolvedActionFrame(action,elapsedMs,reduceMotion);
 const xml:string=EVOLVED_ANIMAL_XML[speciesId][stage][frame.pose];
 return <View style={{width:size,height:size}}><View style={{width:size,height:size,transform:[
 {translateY:frame.translateY/192*size},{rotate:`${frame.rotateDeg}deg`},{scaleY:frame.scaleY}
 ]}}><SvgXml xml={xml} width={size} height={size} /></View></View>;
}
