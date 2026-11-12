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
vi.mock('./GardenBackground', () => ({GardenBackground: (props: Record<string, unknown>) => React.createElement('GardenBackground', props)}));
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
  let s=await api.load();expect(s.balance).toBe(1000);expect(s.inventory['david-lamb:base']).toBe(3);expect(s.catalog).toHaveLength(131);expect(s.prices.COMMON).toBe(10);expect(s.prices.MIRACLE).toBe(1000000);expect(s.pool?.poolVersion).toBe('standard-v2');expect(s.pool?.entries.find(e=>e.designId==='jesus:miracle')!.weight/s.pool!.totalWeight).toBe(0.0001);
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
  const monday=s.periods.missions.find(m=>m.mission==='WEEKLY_SUBMISSION')!.periodStart;
  await saveWeeklyDevotion(token,f.campus,monday,{submit:true,saturdayLateMinutes:0,dailyChecks:[{recordDate:today,quietTimeChecked:false,prayerChecked:true,bibleReadingChecked:false}]});
  await api.claim('submission');s=await api.load();expect(s.balance).toBe(1160);
  const initialQuantity=Object.values(s.inventory).reduce((sum,n)=>sum+(n??0),0);const initialHistory=s.history.length;
  const actualFetch=globalThis.fetch;let drop=true;const keys:string[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(!url.startsWith(baseUrl!))throw new Error('Non-QA network blocked');const response=await actualFetch(input,init);if(url.endsWith('/companions/me/draws')&&init?.method==='POST'){keys.push(new Headers(init.headers).get('Idempotency-Key')!);if(drop){drop=false;throw new TypeError('test-only lost response after commit');}}return response;});
  await expect(api.draw(1)).rejects.toBeDefined();expect(await storage.get()).not.toBeNull();
  const reloaded=createCompanionServerApi(f.campus,async()=>token,storage);s=await reloaded.load();
  expect(s.balance).toBe(1060);expect(Object.values(s.inventory).reduce((sum,n)=>sum+(n??0),0)).toBe(initialQuantity+1);expect(s.history).toHaveLength(initialHistory+1);expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect(await storage.get()).toBeNull();
  const result=await reloaded.draw(10);expect(result.designIds).toHaveLength(10);s=await reloaded.load();expect(s.balance).toBe(60);expect(s.history).toHaveLength(initialHistory+2);
 },120_000);
 it('renders actual server missions, persists a claimed monthly reward after remount and isolates accounts',async()=>{
  const token=await login(1);const f=fixtures[1]!;const storage=memory();const api=createCompanionServerApi(f.campus,async()=>token,storage);
  await act(async()=>{tree=create(<CompanionProvider api={api} key="account-two"><CompanionPages initialPage="missions" onBack={()=>{}} onActivity={()=>{}} /></CompanionProvider>);});
  await ready(()=>expect(button('출석 보상 받기')?.props.disabled).toBe(false));expect(text()).not.toContain('1,200');
  await press('월간 미션 보기');await press('경건 체크 모두 제출 보상 받기');
  await ready(()=>expect(button('경건 체크 모두 제출 수령 완료')?.props.disabled).toBe(true));expect(text()).toContain('300');
  await act(async()=>tree!.unmount());tree=undefined;
  const fresh=createCompanionServerApi(f.campus,async()=>token,storage);
  await act(async()=>{tree=create(<CompanionProvider api={fresh} key="account-two-relogin"><CompanionPages initialPage="missions" onBack={()=>{}} onActivity={()=>{}} /></CompanionProvider>);});
  await ready(()=>expect(button('출석 보상 받기')?.props.disabled).toBe(false));await press('월간 미션 보기');expect(button('경건 체크 모두 제출 수령 완료')?.props.disabled).toBe(true);expect((await fresh.load()).balance).toBe(300);
  await expect(fresh.garden({version:0,backgroundId:null,placements:[{slot:1,designId:'david-lamb:base',x:.5,y:.5}]})).rejects.toMatchObject({detail:{status:403}});
  const wrong=createCompanionServerApi(fixtures[0]!.campus,async()=>token,memory());await expect(wrong.load()).rejects.toMatchObject({detail:{status:403}});
 },120_000);
});
