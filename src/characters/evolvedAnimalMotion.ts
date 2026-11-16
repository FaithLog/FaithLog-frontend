import type { EvolvedPose } from './evolvedAnimalXmlCatalog';
export const EVOLVED_ACTION_FRAMES = {idle:8,walk:12,feed:10,play:10,sleep:8,wake:6,pet:6,clean:6,happy:8,faint:6} as const;
export type EvolvedAction = keyof typeof EVOLVED_ACTION_FRAMES;
export const EVOLVED_TICK_MS = 115;
export type EvolvedFrame = {pose:EvolvedPose;translateY:number;rotateDeg:number;scaleY:number};
/** 80 timeline ticks, reusing 7 independently illustrated full-body key poses. */
export function getEvolvedActionFrame(action:EvolvedAction,elapsedMs:number,reduceMotion=false):EvolvedFrame {
  const len=EVOLVED_ACTION_FRAMES[action];
  const frame=reduceMotion?0:Math.floor(Math.max(0,Number.isFinite(elapsedMs)?elapsedMs:0)/EVOLVED_TICK_MS)%len;
  const phase=frame/len;
  const alternate:EvolvedPose=Math.floor(frame/2)%2===0?'walk-left':'walk-right';
  if(action==='walk')return{pose:alternate,translateY:frame%2===0?0:-3,rotateDeg:frame%4<2?-3:3,scaleY:1};
  if(action==='feed')return{pose:'feed',translateY:frame%2===0?1:4,rotateDeg:0,scaleY:1};
  if(action==='play')return{pose:'play',translateY:-Math.round(Math.sin(Math.PI*phase)*8),rotateDeg:frame%2?4:-4,scaleY:1};
  if(action==='sleep'||action==='faint')return{pose:'sleep',translateY:2,rotateDeg:0,scaleY:.97+(frame%4)*.01};
  if(action==='wake')return{pose:'wake',translateY:-Math.round(Math.sin(Math.PI*phase)*5),rotateDeg:0,scaleY:1};
  if(action==='happy'||action==='pet')return{pose:'play',translateY:frame%2?-4:0,rotateDeg:frame%2?3:-3,scaleY:1};
  if(action==='clean')return{pose:'idle',translateY:frame%2?1:0,rotateDeg:0,scaleY:1};
  return{pose:'idle',translateY:frame%2?-1:0,rotateDeg:0,scaleY:1};
}
