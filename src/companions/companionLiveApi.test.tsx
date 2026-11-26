import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeAll, afterAll, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const {createElement} = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(name, props, children);
  return {Modal: ({visible,children}: React.PropsWithChildren<{visible:boolean}>)=>visible?createElement('Modal',{},children):null, ScrollView: host('ScrollView'), View: host('View'), Text: host('Text'), Pressable: host('Pressable'), StyleSheet: {create: (s: unknown) => s, absoluteFill: {}},
    AppState: {currentState: 'active', addEventListener: () => ({remove: vi.fn()})},
    BackHandler: {addEventListener: () => ({remove: vi.fn()})}};
});
vi.mock('../components/ui', async () => {
  const {createElement} = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(name, props, children);
  const Button = host('Button');
  return {Button, TextField: host('TextField'), Chip: host('Chip'), DangerConfirmSheet: (props: {visible: boolean; onConfirm: () => void; onCancel: () => void}) => props.visible ? createElement('ConfirmSheet', props) : null};
});
vi.mock('../characters/BibleFriendDesignSprite', async () => ({BibleFriendDesignSprite: (props: Record<string, unknown>) => React.createElement('Sprite', props)}));
vi.mock('../characters/BibleFriendFarmSprite', () => ({BibleFriendFarmSprite: (props: Record<string, unknown>) => React.createElement('FarmSprite', props)}));
vi.mock('./GardenBackground', () => ({GardenBackground: (props: Record<string, unknown>) => React.createElement('GardenBackground', props)}));
vi.mock('./FarmHudAssets', () => ({FarmHudIcon: () => null}));
vi.mock('./CompanionDrawScene', () => ({CompanionDrawScene: (props: {onComplete: () => void}) => React.createElement('DrawScene', props)}));


const auth=vi.hoisted(()=>({token:''}));
vi.mock('../api/tokenStorage',()=>({getAuthSessionGeneration:()=>1,getStoredAuthSession:async()=>({generation:1,accessToken:auth.token,refreshToken:null}),isAccessTokenOwnedByAuthSession:async()=>true,isAuthSessionRequestAllowed:()=>true,isAuthSessionGenerationCurrent:()=>true,saveTokens:vi.fn()}));
import {createCompanionServerApi} from './companionServerApi';
import {CompanionProvider} from './CompanionProvider';
import {CompanionPages} from './CompanionPages';
import {saveDevotionDailyCheck,saveWeeklyDevotion} from '../api/client';
import type {PendingStorage} from './companionServerContract';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let tree:ReactTestRenderer|undefined;
const baseUrl=process.env.FAITHLOG_QA_URL;
const fixtures=JSON.parse(process.env.FAITHLOG_QA_FIXTURES??'[]') as Array<{user:number;campus:number;email:string}>;
function memory():PendingStorage {let value:string|null=null;return{get:async()=>value,set:async v=>{value=v;},clear:async()=>{value=null;}};}
async function login(index:number){const r=await fetch(`${baseUrl}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:fixtures[index]!.email,password:'test-only-password'})});const b=await r.json();expect(r.status).toBe(200);auth.token=b.data.accessToken;return auth.token;}
async function ready(assert:()=>void){let last:unknown;for(let i=0;i<150;i++){try{assert();return;}catch(e){last=e;}await act(async()=>{await new Promise(r=>setTimeout(r,20));});}throw last;}
function button(label:string){return tree!.root.findAllByType('Button' as React.ElementType).find(n=>n.props.accessibilityLabel===label);}
async function press(label:string){const b=button(label);expect(b).toBeDefined();expect(b!.props.disabled).not.toBe(true);await act(async()=>{await b!.props.onPress();});}
function text(){return JSON.stringify(tree!.toJSON());}
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;vi.restoreAllMocks();});
beforeAll(()=>{if(baseUrl){vi.stubEnv('EXPO_PUBLIC_API_BASE_URL',baseUrl);vi.stubEnv('EXPO_PUBLIC_APP_ENV','local');vi.stubEnv('EXPO_PUBLIC_MOCK_MODE','false');}});
afterAll(()=>vi.unstubAllEnvs());
describe.skipIf(!baseUrl)('real develop backend + PostgreSQL + frontend HTTP adapter',()=>{
 it('settles sales/attendance/calendar/submission and restores timed-out draws with the same key',async()=>{
  const token=await login(0);const f=fixtures[0]!;const storage=memory();const api=createCompanionServerApi(f.campus,async()=>token,storage);
  let s=await api.load();expect(s.balance).toBe(1000);expect(s.inventory['david-lamb:base']).toBe(3);expect(s.catalog).toHaveLength(131);expect(s.prices.COMMON).toBe(10);expect(s.prices.MIRACLE).toBe(1000000);expect(s.pool?.poolVersion).toBe('standard-v2');expect(s.pool!.entries.find(e=>e.designId==='jesus:miracle')!.weight/s.pool!.totalWeight).toBe(0.0001);
  const stale=s.garden;
  await api.garden({version:stale.version,backgroundId:'meadow',placements:[{slot:1,designId:'david-lamb:base',x:.2,y:.8}]});
  await expect(api.garden({...stale,placements:[]})).rejects.toMatchObject({detail:{status:409}});
  s=await api.load();expect(s.garden.placements[0]).toMatchObject({x:.2,y:.8});
  await api.sell('david-lamb:base',2);s=await api.load();expect(s.balance).toBe(1020);expect(s.inventory['david-lamb:base']).toBe(1);
  await expect(api.sell('david-lamb:base',1)).rejects.toMatchObject({detail:{status:409}});expect(await storage.get()).toBeNull();
  await api.claim('attendance');await api.claim('attendance');s=await api.load();expect(s.balance).toBe(1030);
  await expect(api.claim('prayer')).rejects.toMatchObject({detail:{status:409}});
  const today=s.daily.recordDate;await saveDevotionDailyCheck(token,f.campus,today,{quietTimeChecked:false,prayerChecked:true,bibleReadingChecked:false});
  await api.claim('prayer');await api.claim('prayer');s=await api.load();expect(s.balance).toBe(1060);
  expect(s.periods.missions.find(m=>m.mission==='WEEKLY_NO_PENALTY')?.points).toBe(100);
  expect(s.periods.missions.find(m=>m.mission==='WEEKLY_PRAYER_TOPIC')).toMatchObject({points:50,status:'INCOMPLETE'});
  const monday=s.periods.missions.find(m=>m.mission==='WEEKLY_SUBMISSION')!.periodStart;
  await saveWeeklyDevotion(token,f.campus,monday,{submit:true,saturdayLateMinutes:0,dailyChecks:[{recordDate:today,quietTimeChecked:false,prayerChecked:true,bibleReadingChecked:false}]});
  await api.claim('submission');s=await api.load();expect(s.balance).toBe(1180);
  const initialQuantity=Object.values(s.inventory).reduce((sum,n)=>sum+(n??0),0);const initialHistory=s.history.length;
  const actualFetch=globalThis.fetch;let drop=true;const keys:string[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(!url.startsWith(baseUrl!))throw new Error('Non-QA network blocked');const response=await actualFetch(input,init);if(url.endsWith('/companions/me/draws')&&init?.method==='POST'){keys.push(new Headers(init.headers).get('Idempotency-Key')!);if(drop){drop=false;throw new TypeError('test-only lost response after commit');}}return response;});
  await expect(api.draw(1)).rejects.toBeDefined();expect(await storage.get()).not.toBeNull();
  const reloaded=createCompanionServerApi(f.campus,async()=>token,storage);s=await reloaded.load();
  expect(s.balance).toBe(1080);expect(Object.values(s.inventory).reduce((sum,n)=>sum+(n??0),0)).toBe(initialQuantity+1);expect(s.history).toHaveLength(initialHistory+1);expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect(await storage.get()).toBeNull();
  const result=await reloaded.draw(10);expect(result.designIds).toHaveLength(10);s=await reloaded.load();expect(s.balance).toBe(80);expect(s.history).toHaveLength(initialHistory+2);
 },120_000);
 it('renders actual server missions, persists a claimed monthly reward after remount and isolates accounts',async()=>{
  const token=await login(1);const f=fixtures[1]!;const storage=memory();const api=createCompanionServerApi(f.campus,async()=>token,storage);
  await act(async()=>{tree=create(<CompanionProvider api={api} key="account-two"><CompanionPages initialPage="missions" onBack={()=>{}} onActivity={()=>{}} /></CompanionProvider>);});
  await ready(()=>expect(button('출석 보상 받기')?.props.disabled).toBe(false));expect(text()).not.toContain('1,200');
  await press('월간 미션 보기');await press('경건 체크 모두 제출 보상 받기');
  await ready(()=>expect(button('경건 체크 모두 제출 수령 완료')?.props.disabled).toBe(true));expect(text()).toContain('500');
  await act(async()=>tree!.unmount());tree=undefined;
  const fresh=createCompanionServerApi(f.campus,async()=>token,storage);
  await act(async()=>{tree=create(<CompanionProvider api={fresh} key="account-two-relogin"><CompanionPages initialPage="missions" onBack={()=>{}} onActivity={()=>{}} /></CompanionProvider>);});
  await ready(()=>expect(button('출석 보상 받기')?.props.disabled).toBe(false));await press('월간 미션 보기');expect(button('경건 체크 모두 제출 수령 완료')?.props.disabled).toBe(true);expect((await fresh.load()).balance).toBe(1500);
  await expect(fresh.garden({version:0,backgroundId:null,placements:[{slot:1,designId:'david-lamb:base',x:.5,y:.5}]})).rejects.toMatchObject({detail:{status:403}});
  const wrong=createCompanionServerApi(fixtures[0]!.campus,async()=>token,memory());await expect(wrong.load()).rejects.toMatchObject({detail:{status:403}});
 },120_000);
});


describe.skipIf(!baseUrl)('real owned-instance care and evolution HTTP contract',()=>{
 it('persists two UUID-distinct pets, five actions, evolution, cooldowns and ownership', async()=>{
  const token=await login(2);
  const owner=fixtures[2]!;
  const api=createCompanionServerApi(owner.campus,async()=>token,memory());
  const initial=await api.load();
  const owned=await api.instancesByDesign!('david-lamb:base',0);
  expect(owned).toHaveLength(2);
  const readyPet=owned.find(pet=>pet.canEvolve);
  const otherPet=owned.find(pet=>pet.instanceId!==readyPet?.instanceId);
  expect(readyPet).toMatchObject({level:1,growthXp:300,careDays:3});
  expect(otherPet).toMatchObject({level:1,growthXp:0});
  expect(readyPet!.instanceId).not.toBe(otherPet!.instanceId);

  const garden=await api.garden({
   version:initial.garden.version,backgroundId:null,
   placements:[
    {slot:1,designId:'david-lamb:base',x:0.2,y:0.4,instanceId:readyPet!.instanceId},
    {slot:2,designId:'david-lamb:base',x:0.8,y:0.4,instanceId:otherPet!.instanceId},
   ],
  });
  expect(garden.placements.map(p=>p.instanceId)).toEqual([readyPet!.instanceId,otherPet!.instanceId]);
  expect((await api.instances!()).map(p=>p.instanceId)).toEqual([readyPet!.instanceId,otherPet!.instanceId]);

  const evolved=await api.evolveInstance!(readyPet!.instanceId,readyPet!.version,'qa-361-evolve');
  expect(evolved).toMatchObject({level:2,version:readyPet!.version+1,growthXp:300});
  const replay=await api.evolveInstance!(readyPet!.instanceId,readyPet!.version,'qa-361-evolve');
  expect(replay).toEqual(evolved);
  await expect(api.evolveInstance!(readyPet!.instanceId,readyPet!.version,'qa-361-evolve-stale'))
   .rejects.toMatchObject({detail:{status:409}});

  let current=evolved;
  let firstFeed:typeof evolved|undefined;
  for(const action of ['FEED','PET','PLAY','CLEAN','SLEEP'] as const){
   const updated=await api.careInstance!(
    readyPet!.instanceId,action,current.version,`qa-361-care-${action}`);
   expect(updated.version).toBe(current.version+1);
   expect(updated.level).toBe(2);
   expect(updated.growthXp).toBeGreaterThanOrEqual(current.growthXp);
   if(action==='FEED'){
    expect(updated.stats.satiety).toBeGreaterThanOrEqual(current.stats.satiety);
    firstFeed=updated;
   }
   if(action==='CLEAN')expect(updated.stats.cleanliness).toBeGreaterThanOrEqual(current.stats.cleanliness);
   current=updated;
  }
  expect(await api.careInstance!(readyPet!.instanceId,'FEED',evolved.version,'qa-361-care-FEED'))
   .toEqual(firstFeed);
  await expect(api.careInstance!(readyPet!.instanceId,'FEED',current.version,'qa-361-care-too-soon'))
   .rejects.toMatchObject({detail:{status:409}});

  const visible=await api.instances!();
  expect(visible).toHaveLength(2);
  expect(visible[0]).toMatchObject({instanceId:readyPet!.instanceId,level:2,version:current.version});
  expect(visible[1]).toMatchObject({instanceId:otherPet!.instanceId,level:1});
  const anotherToken=await login(1);
  const another=createCompanionServerApi(fixtures[1]!.campus,async()=>anotherToken,memory());
  await expect(another.careInstance!(readyPet!.instanceId,'FEED',current.version,'qa-361-other-owner'))
   .rejects.toMatchObject({detail:{status:403}});
 },120_000);

 it('credits a care gift once and enforces the account daily limit', async()=>{
  const owner=fixtures[3]!;
  const token=await login(3);
  const api=createCompanionServerApi(owner.campus,async()=>token,memory());
  const [pet]=await api.instancesByDesign!('david-lamb:base',0);
  const id=pet!.instanceId;
  expect(await api.careGifts!(id)).toEqual([
   {milestone:3,shards:1,status:'READY'},
   {milestone:7,shards:2,status:'READY'},
   {milestone:14,shards:3,status:'LOCKED'},
  ]);
  expect(await api.growthShards!()).toBe(0);

  const claimed=await api.claimCareGift!(id,3);
  expect(claimed).toEqual([
   {milestone:3,shards:1,status:'CLAIMED'},
   {milestone:7,shards:2,status:'TOMORROW'},
   {milestone:14,shards:3,status:'LOCKED'},
  ]);
  expect(await api.claimCareGift!(id,3)).toEqual(claimed);
  await expect(api.claimCareGift!(id,7)).rejects.toMatchObject({detail:{status:409}});
  expect(await api.growthShards!()).toBe(1);
  expect(await api.careGifts!(id)).toEqual(claimed);

  const anotherToken=await login(1);
  const another=createCompanionServerApi(fixtures[1]!.campus,async()=>anotherToken,memory());
  await expect(another.careGifts!(id)).rejects.toMatchObject({detail:{status:403}});
  await expect(another.claimCareGift!(id,3)).rejects.toMatchObject({detail:{status:403}});
 },120_000);

 it('persists final evolution through a fresh client and blocks further evolution',async()=>{
  const owner=fixtures[3]!;
  const token=await login(3);
  const api=createCompanionServerApi(owner.campus,async()=>token,memory());
  const initial=await api.load();
  const [pet]=await api.instancesByDesign!('david-lamb:base',0);
  expect(pet).toMatchObject({level:1,growthXp:1000,careDays:10,canEvolve:true});
  const id=pet!.instanceId;
  await api.garden({
   version:initial.garden.version,backgroundId:null,
   placements:[{slot:1,designId:'david-lamb:base',instanceId:id,x:0.5,y:0.5}],
  });

  const levelTwo=await api.evolveInstance!(id,pet!.version,'qa-368-level-two');
  expect(levelTwo).toMatchObject({level:2,canEvolve:true});
  const levelThree=await api.evolveInstance!(id,levelTwo.version,'qa-368-level-three');
  expect(levelThree).toMatchObject({
   level:3,growthXp:1000,version:levelTwo.version+1,canEvolve:false,
  });
  expect(await api.evolveInstance!(id,levelTwo.version,'qa-368-level-three')).toEqual(levelThree);
  await expect(api.evolveInstance!(id,levelThree.version,'qa-368-beyond-final'))
   .rejects.toMatchObject({detail:{status:409}});

  const freshToken=await login(3);
  const fresh=createCompanionServerApi(owner.campus,async()=>freshToken,memory());
  expect(await fresh.instances!()).toMatchObject([
   {instanceId:id,level:3,version:levelThree.version,canEvolve:false},
  ]);
 },120_000);

});

describe.skipIf(!baseUrl)('real garden shop HTTP contract', () => {
 it('debits once and restores purchased ownership across new sessions', async () => {
  const token = await login(1);
  const campus = fixtures[1]!.campus;
  const api = createCompanionServerApi(campus, async () => token, memory());
  const initial = await api.loadGardenShop!();
  const id = 'seed-dish';
  expect(initial.items).toHaveLength(50);
  expect(initial.items.find(item => item.id === id)).toEqual({id, price: 100, owned: false});
  await expect(api.purchaseGardenDecoration!(id, 200)).rejects.toMatchObject({detail: {status: 409}});
  expect((await api.loadGardenShop!()).balance).toBe(initial.balance);
  const purchased = await api.purchaseGardenDecoration!(id, 100);
  expect(purchased.balance).toBe(initial.balance - 100);
  expect(purchased.items.find(item => item.id === id)?.owned).toBe(true);
  const freshToken = await login(1);
  const fresh = createCompanionServerApi(campus, async () => freshToken, memory());
  expect(await fresh.loadGardenShop!()).toEqual(purchased);
  expect(await fresh.purchaseGardenDecoration!(id, 100)).toEqual(purchased);
  const otherToken = await login(0);
  const other = createCompanionServerApi(fixtures[0]!.campus, async () => otherToken, memory());
  expect((await other.loadGardenShop!()).items.find(item => item.id === id)?.owned).toBe(false);
 }, 120_000);
});
