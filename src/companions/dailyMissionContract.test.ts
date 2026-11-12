import {describe,it,expect} from 'vitest';
import {parseDailyMissionSnapshot} from './dailyMissionContract';
const valid=()=>({recordDate:'2026-11-11',serverNow:'2026-11-10T22:00:00Z',totalAwardedPoints:30,missions:[{mission:'QUIET_TIME',status:'CLAIMED',points:30},{mission:'PRAYER',status:'READY',points:30},{mission:'BIBLE',status:'INCOMPLETE',points:30}]});
describe('daily mission response boundary',()=>{
 it('accepts the server contract',()=>expect(parseDailyMissionSnapshot(valid())).toEqual(valid()));
 it('rejects incomplete, duplicate and invalid rewards',()=>{
  expect(()=>parseDailyMissionSnapshot({...valid(),missions:[]})).toThrow();
  const data=valid();data.missions[1]=data.missions[0]!;
  expect(()=>parseDailyMissionSnapshot(data)).toThrow();
  expect(()=>parseDailyMissionSnapshot({...valid(),totalAwardedPoints:-30})).toThrow();
 });
});
