import {describe,expect,it} from 'vitest';
import {parseCompanionInstance} from './companionServerContract';

const uuid='12345678-1234-1234-1234-123456789abc';
const value={
 instanceId:uuid,designId:'david-lamb:base',level:2,growthXp:750,totalEarnedXp:800,
 careDays:5,version:3,stats:{satiety:55,cleanliness:70,joy:80,affection:90,health:100},
 lastCaredAt:'2026-11-18T01:00:00Z',
 nextEvolution:{currentLevel:2,nextLevel:3,threshold:{growthXp:1000,distinctCareDays:10,health:70,satiety:60,cleanliness:60},blockers:['EXPERIENCE','CARE_DAYS']},
 canEvolve:false,
};
describe('companion instance API strict parsing',()=>{
 it('accepts real server growth and state values',()=>{
   expect(parseCompanionInstance(value).growthXp).toBe(750);
   expect(parseCompanionInstance(value).nextEvolution?.blockers).toContain('EXPERIENCE');
 });
 it('rejects forged levels, identifiers, XP, stats and readiness',()=>{
   for(const candidate of [
     {...value,instanceId:'not-uuid'},
     {...value,level:4},
     {...value,growthXp:299},
     {...value,totalEarnedXp:200},
     {...value,stats:{...value.stats,health:101}},
     {...value,canEvolve:true},
     {...value,designId:'unknown'},
     {...value,nextEvolution:{...value.nextEvolution,blockers:['UNKNOWN']}},
   ])expect(()=>parseCompanionInstance(candidate)).toThrow();
 });
 it('accepts a miracle with no evolution and rejects impossible level-three readiness',()=>{
   const miracle={...value,designId:'jesus:miracle',level:1,growthXp:0,totalEarnedXp:0,nextEvolution:null};
   expect(parseCompanionInstance(miracle).nextEvolution).toBeNull();
   expect(()=>parseCompanionInstance({...value,level:3,growthXp:1000,totalEarnedXp:1200,canEvolve:true})).toThrow();
 });
});
