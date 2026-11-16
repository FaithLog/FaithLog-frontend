import {describe,expect,it} from 'vitest';
import {EVOLVED_ANIMAL_XML} from './evolvedAnimalXmlCatalog';
import {EVOLVED_ACTION_FRAMES,getEvolvedActionFrame} from './evolvedAnimalMotion';
const poses=['idle','walk-left','walk-right','feed','play','sleep','wake'];
describe('full body evolution assets',()=>{
 it('contains 13 species, 2 stages and 7 independent body poses',()=>{
  expect(Object.keys(EVOLVED_ANIMAL_XML)).toHaveLength(13);
  for(const stages of Object.values(EVOLVED_ANIMAL_XML)){
   for(const stage of [1,2] as const){expect(Object.keys(stages[stage])).toEqual(poses);
    for(const pose of poses as Array<keyof typeof stages[typeof stage]>){expect(stages[stage][pose]).toContain('viewBox="0 0 192 192"');}
    expect(stages[stage].idle).not.toBe(stages[stage].sleep);
    expect(stages[stage]['walk-left']).not.toBe(stages[stage]['walk-right']);
   }expect(stages[1].idle).not.toBe(stages[2].idle);
  }
 });
 it('has 80 logical animation frames and valid poses',()=>{
  expect(Object.values(EVOLVED_ACTION_FRAMES).reduce((a,b)=>a+b,0)).toBe(80);
  for(const action of Object.keys(EVOLVED_ACTION_FRAMES) as Array<keyof typeof EVOLVED_ACTION_FRAMES>){
   for(const ms of [-1,0,115,Number.NaN,Infinity,1000000])expect(poses).toContain(getEvolvedActionFrame(action,ms).pose);
   expect(getEvolvedActionFrame(action,99999,true)).toEqual(getEvolvedActionFrame(action,0,true));
  }
 });
});
