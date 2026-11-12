import {beforeEach,describe,expect,it,vi} from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('../api/client',()=>({apiRequest:request}));
import {createCompanionServerApi} from './companionServerApi';
import {PERIOD_MISSION_IDS,type PendingStorage} from './companionServerContract';
const daily={recordDate:'2026-11-12',serverNow:'2026-11-12T00:00:00Z',totalAwardedPoints:30,missions:[{mission:'QUIET_TIME',status:'INCOMPLETE',points:30},{mission:'PRAYER',status:'CLAIMED',points:30},{mission:'BIBLE',status:'INCOMPLETE',points:30}]};
const periods={serverNow:'2026-11-12T00:00:00Z',balance:1100,missions:Object.values(PERIOD_MISSION_IDS).map(mission=>({mission,points:100,status:'CLAIMED',periodStart:'2026-11-09',periodEnd:'2026-11-15',availableAt:'2026-11-09T00:00:00Z',expiresAt:'2026-11-16T00:00:00Z'}))};
function api(){const storage:PendingStorage={get:async()=>null,set:async()=>{},clear:async()=>{}};return createCompanionServerApi(7,async()=>'test-only',storage);}
beforeEach(()=>{request.mockReset();});
describe('reward responses without unrelated reloads',()=>{
 it('uses the attendance POST balance with no GET',async()=>{
  const attendance={date:'2026-11-12',points:10,claimed:true,balance:1010};
  request.mockImplementation(async(_path,options)=>options.responseParser(attendance));
  expect(await api().claim('attendance')).toEqual({balance:1010,attendance});
  expect(request).toHaveBeenCalledTimes(1);
 });
 it('returns daily state plus one authoritative wallet read',async()=>{
  request.mockImplementation(async(path,options)=>options.responseParser(path.endsWith('/wallet')?{balance:1030}:daily));
  expect(await api().claim('prayer')).toEqual({balance:1030,daily});
  expect(request.mock.calls.map(([path])=>path)).toEqual(['/api/v1/campuses/7/devotions/me/daily-missions/PRAYER/claims','/api/v1/points/me/wallet']);
 });
 it('uses the period POST balance without another mission GET',async()=>{
  request.mockImplementation(async(_path,options)=>options.responseParser(periods));
  expect(await api().claim('submission')).toEqual({balance:1100,periods});
  expect(request).toHaveBeenCalledTimes(1);
 });
 it('does not report successful credit when the wallet confirmation fails',async()=>{
  request.mockImplementation(async(path,options)=>{if(path.endsWith('/wallet'))throw new Error('offline');return options.responseParser(daily);});
  await expect(api().claim('prayer')).rejects.toThrow('offline');
 });
});
