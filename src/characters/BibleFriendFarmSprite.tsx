import React from 'react';
import {View} from 'react-native';
import {SvgXml} from 'react-native-svg';
import {BibleFriendDesignSprite} from './BibleFriendDesignSprite';
import type {BibleFriendDesignSpriteProps} from './BibleFriendDesignSprite';
import type {BibleFriendId} from './bibleFriends';
import {BIBLE_FRIEND_DESIGN_CATALOG} from './bibleFriendDesignCatalog';
import {EvolvedAnimalSprite} from './EvolvedAnimalSprite';
import type {EvolvedAction} from './evolvedAnimalMotion';
import {FARM_ACTION_XML,FARM_EVOLUTION_XML} from './farmVisualAssetCatalog';
import type {FarmVisualAction} from './farmMotionTimeline';
import {getFarmActionFrameIndex} from './farmMotionTimeline';

export type BibleFriendFarmSpriteProps=BibleFriendDesignSpriteProps & {evolutionStage?:0|1|2;farmAction?:FarmVisualAction;farmActionElapsedMs?:number;reduceMotion?:boolean};
function asAction(action:FarmVisualAction|undefined,motion:BibleFriendDesignSpriteProps['motion']):EvolvedAction {
 if(action==='feed'||action==='hungry')return 'feed';
 if(action==='play')return 'play';
 if(action==='sleep'||action==='sick'||action==='faint')return 'sleep';
 if(action==='evolve')return 'wake';
 if(action==='pet')return 'pet';
 if(action==='clean')return 'clean';
 if(motion==='walk')return 'walk';
 if(motion==='happy')return 'happy';
 if(motion==='land')return 'wake';
 return 'idle';
}
/** Base style gets evolved full-body poses. Other costumes/Jesus retain prior art. */
export function BibleFriendFarmSprite({designId,evolutionStage=0,farmAction,farmActionElapsedMs=0,reduceMotion=false,size=96,...friendProps}:BibleFriendFarmSpriteProps){
 const design=BIBLE_FRIEND_DESIGN_CATALOG.find(x=>x.id===designId);
 if(!design)return null;
 const stageKey=evolutionStage===2?'stage2':evolutionStage===1?'stage1':undefined;
 const full=!!stageKey&&design.styleId==='base'&&design.friendId!=='jesus'&&!friendProps.silhouette;
 const frames=farmAction&&!friendProps.silhouette?FARM_ACTION_XML[farmAction]:undefined;
 const index=farmAction?getFarmActionFrameIndex(farmAction,farmActionElapsedMs,reduceMotion):0;
 const suppress=full&&(farmAction==='feed'||farmAction==='play'||farmAction==='sleep');
 const actionXml:string|undefined=suppress?undefined:frames?.[index];
 if(full){const action=asAction(farmAction,friendProps.motion);const elapsed=farmAction?farmActionElapsedMs:friendProps.elapsedMs??0;
  return <View style={{width:size,height:size}}>
    <EvolvedAnimalSprite speciesId={design.friendId as BibleFriendId} stage={evolutionStage as 1|2} action={action} elapsedMs={elapsed} reduceMotion={reduceMotion} size={size}/>
    {actionXml?<SvgXml xml={actionXml} width={size} height={size} pointerEvents="none" style={{position:'absolute',left:0,top:0}}/>:null}
  </View>;
 }
 const stageXml=design.friendId==='jesus'||!stageKey||friendProps.silhouette?undefined:FARM_EVOLUTION_XML[design.friendId][stageKey];
 return <View style={{width:size,height:size}}>
  <BibleFriendDesignSprite {...friendProps} designId={designId} size={size}/>
  {stageXml?<SvgXml xml={stageXml} width={size} height={size} pointerEvents="none" style={{position:'absolute',left:0,top:0}}/>:null}
  {actionXml?<SvgXml xml={actionXml} width={size} height={size} pointerEvents="none" style={{position:'absolute',left:0,top:0}}/>:null}
 </View>;
}
