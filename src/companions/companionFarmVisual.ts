import type {CompanionCareAction, CompanionInstance} from './companionServerContract';
import {FARM_ACTION_TIMELINE, type FarmVisualAction} from '../characters/farmMotionTimeline';

export type FarmMutation = CompanionCareAction | 'EVOLVE';
export type CompanionFarmAnimationEvent = {
 instanceId:string;action:FarmMutation;sequence:number;
};
export type RunningFarmAnimation = CompanionFarmAnimationEvent & {startedAt:number};
export type FarmRuntimeAction = FarmVisualAction | 'wake';
export type FarmSpriteVisual = {
 action?:FarmRuntimeAction; elapsedMs:number; pauseMovement:boolean;
};

const ACTIONS:Record<CompanionCareAction,Exclude<FarmVisualAction,'evolve'>>={
 FEED:'feed', PET:'pet', PLAY:'play', CLEAN:'clean', SLEEP:'sleep',
};
const SLEEP_MS=2600;
const WAKE_MS=720;
const EVOLVE_MS=FARM_ACTION_TIMELINE.evolve.frames*FARM_ACTION_TIMELINE.evolve.frameMs+350;
const NONE:FarmSpriteVisual={elapsedMs:0,pauseMovement:false};

/** Pure local playback: no new timers, no API calls, no synthetic companion stats. */
export function resolveFarmSpriteVisual(
 instance:CompanionInstance|undefined,
 animation:RunningFarmAnimation|null,
 elapsed:number,
):FarmSpriteVisual {
 if(!instance || instance.designId.startsWith('jesus:') || !Number.isFinite(elapsed))return NONE;
 if(animation?.instanceId===instance.instanceId){
  const age=elapsed-animation.startedAt;
  if(Number.isFinite(age) && age>=0){
   if(animation.action==='SLEEP'){
    if(age<SLEEP_MS)return{action:'sleep',elapsedMs:age,pauseMovement:true};
    if(age<SLEEP_MS+WAKE_MS)return{action:'wake',elapsedMs:age-SLEEP_MS,pauseMovement:true};
   }else if(animation.action==='EVOLVE'){
    if(age<EVOLVE_MS)return{action:'evolve',elapsedMs:age,pauseMovement:true};
   }else{
    const action=ACTIONS[animation.action];
    const timing=FARM_ACTION_TIMELINE[action];
    const duration=timing.frames*timing.frameMs+250;
    if(age<duration)return{action,elapsedMs:age,pauseMovement:true};
   }
  }
 }
 const {health,satiety,cleanliness}=instance.stats;
 if(health===0)return{action:'faint',elapsedMs:elapsed,pauseMovement:true};
 if(health<25)return{action:'sick',elapsedMs:elapsed,pauseMovement:true};
 if(satiety<25)return{action:'hungry',elapsedMs:elapsed,pauseMovement:false};
 if(cleanliness<25)return{action:'dirty',elapsedMs:elapsed,pauseMovement:false};
 return NONE;
}
