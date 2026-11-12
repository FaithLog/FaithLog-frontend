import {describe,expect,it} from 'vitest';
import {parseGarden,parseOperation,parsePeriods,date} from './companionServerContract';
describe('companion server boundaries',()=>{
 it('rejects invalid and duplicate placements instead of applying unsafe state',()=>{
  const p={slot:1,designId:'david-lamb:base',x:.5,y:.5};
  for(const placements of [[{...p,x:NaN}],[p,p],[{...p,slot:6}],[{...p,designId:'unknown'}]])expect(()=>parseGarden({version:0,backgroundId:null,placements})).toThrow();
  expect(parseGarden({version:1,backgroundId:null,placements:[p]}).placements).toHaveLength(1);
 });
 it('rejects unsafe amounts, unknown results and invalid calendar values',()=>{
  const op={operationId:'id',designIds:['david-lamb:base'],pointDelta:-100,balance:0,policyVersion:'v1',quantity:0,unitPrice:0};
  expect(()=>parseOperation({...op,balance:Number.MAX_SAFE_INTEGER+1})).toThrow();
  expect(()=>parseOperation({...op,designIds:['unknown']})).toThrow();
  for(const value of ['2026','2026-02-30','not-date'])expect(()=>date(value)).toThrow();
  expect(date('2026-11-12')).toBe('2026-11-12');
 });
 it('rejects missing or duplicate period missions',()=>{expect(()=>parsePeriods({serverNow:'2026-11-12T00:00:00Z',balance:0,missions:[]})).toThrow();});
});
