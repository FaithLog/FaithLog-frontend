import type {CompanionAppearanceStorage} from './companionAppearanceStorage';
import {AppState} from 'react-native';
import type {CompanionServerApi, ServerSnapshot, CompanionInstance, CompanionCareAction, CompanionSaleAvailability, GardenRewards} from './companionServerContract';
import {FaithLogApiError} from '../api/apiError';
import type {CompanionFarmAnimationEvent} from './companionFarmVisual';
import {PERIOD_MISSION_IDS} from './companionServerContract';
import {DAILY_MISSION_SERVER_IDS} from './dailyMissionContract';
import type {BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type PropsWithChildren} from 'react';
import {companionGardenSlots, companionReducer, createCompanionDemoState, type CompanionAction, type CompanionState} from './companionModel';
import type {DailyMissionApi, DailyMissionId, DailyMissionSnapshot} from './dailyMissionContract';

type DailyState = {snapshot: DailyMissionSnapshot | null; error: string; loading: boolean; claiming: boolean};
type Context = {
  gardenRewards?: GardenRewards | null;
  refreshGardenRewards?: () => Promise<void>;
  selectRewardBackground?: (id: string | null) => Promise<void>;
  renameCompanion?: (id: string, nickname: string) => Promise<void>;
  careReminder?: NonNullable<CompanionServerApi['careReminder']>;
  expedition?: NonNullable<CompanionServerApi['expedition']>;
  friendGardens?: NonNullable<CompanionServerApi['friendGardens']>;
  baseAppearance?: ReadonlySet<string>;
  toggleAppearance?: (instanceId: string) => void;
  wakeInstance?: (id: string) => Promise<void>;
  shardBalance?: number | null;
  loadGardenShop?: NonNullable<CompanionServerApi['loadGardenShop']>;
  purchaseGardenDecoration?: NonNullable<CompanionServerApi['purchaseGardenDecoration']>;
  careGifts?: NonNullable<CompanionServerApi['careGifts']>;
  claimCareGift?: NonNullable<CompanionServerApi['claimCareGift']>;
  loadShards?: () => Promise<void>;
  exchangeShard?: (id: BibleFriendDesignId) => Promise<number | null>;
  boostWithShards?: (id: string) => Promise<void>;
  farmAnimation?: CompanionFarmAnimationEvent | null;
  instances?: CompanionInstance[] | null;
  careError?: string;
  careInstance?: (instanceId:string,action:CompanionCareAction,facilitySlot?:number)=>Promise<void>;
  evolveInstance?: (instanceId:string)=>Promise<void>;
  instancesByDesign?: (designId:BibleFriendDesignId,page:number)=>Promise<CompanionInstance[]>;
  saleAvailability?: (designId:BibleFriendDesignId)=>Promise<CompanionSaleAvailability>;
  gardenSaving?: boolean;state: CompanionState; dispatch: Dispatch<CompanionAction>; nextTransactionId: (kind: string) => string; daily: DailyState; refreshDaily: () => Promise<void>; claimDaily: (ids: readonly DailyMissionId[]) => Promise<void>; server:boolean; busy:boolean; error:string; serverSnapshot:ServerSnapshot|null; refresh:()=>Promise<void>; executeDraw?: (count:1|10)=>Promise<readonly BibleFriendDesignId[]>; perform?: (action:CompanionAction)=>Promise<boolean>};
const CompanionContext = createContext<Context | null>(null);
function DemoProvider({children, dailyApi}: PropsWithChildren<{dailyApi?: DailyMissionApi}>) {
  const [state, dispatch] = useReducer(companionReducer, undefined, createCompanionDemoState);
  const [daily, setDaily] = useState<DailyState>({snapshot:null,error:'',loading:false,claiming:false});
  const mounted = useRef(true);
  const epoch = useRef(0);
  const claimLock = useRef(false);
  useEffect(() => {mounted.current=true; return () => {mounted.current=false; epoch.current++;};}, []);
  const refreshDaily = useCallback(async () => {
    if (!dailyApi || claimLock.current) return;
    const request = ++epoch.current;
    setDaily(value => ({...value,loading:true,error:''}));
    try {
      const snapshot = await dailyApi.load();
      if (!mounted.current || request !== epoch.current) return;
      dispatch({type:'daily-sync',snapshot});
      setDaily(value => ({...value,snapshot,loading:false,error:''}));
    } catch {
      if (mounted.current && request === epoch.current) setDaily(value => ({...value,snapshot:null,loading:false,error:'저장 기록을 확인하지 못했어요. 다시 시도해주세요.'}));
    }
  }, [dailyApi]);
  const claimDaily = useCallback(async (ids: readonly DailyMissionId[]) => {
    if (!dailyApi || claimLock.current) return;
    claimLock.current=true;
    const request = ++epoch.current;
    setDaily(value => ({...value,claiming:true,loading:false,error:''}));
    try {
      for (const id of [...new Set(ids)]) {
        const snapshot = await dailyApi.claim(id);
        if (!mounted.current || request !== epoch.current) return;
        dispatch({type:'daily-sync',snapshot});
        setDaily(value => ({...value,snapshot}));
      }
    } catch {
      if (mounted.current && request === epoch.current) setDaily(value => ({...value,snapshot:null,error:'보상 수령을 확인하지 못했어요. 새로 확인한 뒤 다시 시도해주세요.'}));
    } finally {
      claimLock.current=false;
      if (mounted.current && request === epoch.current) setDaily(value => ({...value,claiming:false}));
    }
  }, [dailyApi]);
  const sequence = useRef(0);
  const nextTransactionId = (kind: string) => `${kind}-${++sequence.current}`;
  return <CompanionContext.Provider value={{state, dispatch, nextTransactionId,daily,refreshDaily,claimDaily,server:false,busy:false,error:'',serverSnapshot:null,refresh:refreshDaily}}>{children}</CompanionContext.Provider>;
}
export function CompanionProvider({children,dailyApi,api,appearanceStorage}:PropsWithChildren<{dailyApi?:DailyMissionApi;api?:CompanionServerApi;appearanceStorage?:CompanionAppearanceStorage}>) {
 return api?<ServerProvider api={api} {...(appearanceStorage ? {appearanceStorage} : {})}>{children}</ServerProvider>:<DemoProvider {...(dailyApi?{dailyApi}:{})}>{children}</DemoProvider>;
}
function ServerProvider({children,api,appearanceStorage}:PropsWithChildren<{api:CompanionServerApi;appearanceStorage?:CompanionAppearanceStorage}>) {
 const empty:CompanionState={points:0,dailyAwardedPoints:0,backgroundId:'default',inventory:{},equipped:[],gardenPositions:{},claimed:[],transactions:[]};
 const [state,setState]=useState(empty);const current=useRef(state);
 const [snapshot,setSnapshot]=useState<ServerSnapshot|null>(null);const source=useRef<ServerSnapshot|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);const alive=useRef(true);
 const gardenDirty = useRef(false);
 const gardenRevision = useRef(0);
 const gardenInstancesDirty = useRef(false);
 const gardenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const [gardenRewards,setGardenRewards] = useState<GardenRewards | null>(null);
 const rewardRequest = useRef(0);
 const rewardWrite = useRef(false);
 const refreshGardenRewards = useCallback(async () => {
  if (!api.gardenRewards || rewardWrite.current) return;
  const ticket = ++rewardRequest.current;
  try {
   const rewards = await api.gardenRewards.load();
   if (alive.current && ticket === rewardRequest.current) setGardenRewards(rewards);
  } catch {
   // The previous server does not expose this inventory.
  }
 }, [api]);
 useEffect(() => {void refreshGardenRewards();}, [refreshGardenRewards]);
 const selectRewardBackground = useCallback(async (id: string | null) => {
  if (!api.gardenRewards || rewardWrite.current) return;
  rewardWrite.current = true;
  ++rewardRequest.current;
  try {
   const rewards = await api.gardenRewards.selectBackground(id);
   if (alive.current) setGardenRewards(rewards);
  } finally {
   rewardWrite.current = false;
  }
 }, [api]);
 const [gardenSaving, setGardenSaving] = useState(false);
 const [baseAppearance,setBaseAppearance] = useState<ReadonlySet<string>>(() => new Set());
 const [appearanceReady,setAppearanceReady] = useState(!appearanceStorage);
 const appearance = useRef<ReadonlySet<string>>(baseAppearance);
 const canSaveAppearance = useRef(false);
 useEffect(() => {
  if (!appearanceStorage) return;
  let active = true;
  canSaveAppearance.current = false;
  setAppearanceReady(false);
  const finish = (value: ReadonlySet<string>, loaded: boolean) => {
   if (!active) return;
   appearance.current = value;
   canSaveAppearance.current = loaded;
   setBaseAppearance(value);
   setAppearanceReady(true);
  };
  void appearanceStorage.load().then(value => finish(value, true), () => finish(new Set(), false));
  return () => {active = false;};
 }, [appearanceStorage]);
 const toggleAppearance = useCallback((instanceId: string) => {
  const next = new Set(appearance.current);
  if (!next.delete(instanceId)) next.add(instanceId);
  appearance.current = next;
  setBaseAppearance(next);
  if (appearanceStorage && canSaveAppearance.current) void appearanceStorage.save(next).catch(() => undefined);
 }, [appearanceStorage]);
 const [instances,setInstances] = useState<CompanionInstance[] | null>(null);
 const renameCompanion = useCallback(async (id: string, nickname: string) => {
  if (!api.gardenRewards) return;
  const result = await api.gardenRewards.rename(id, nickname);
  if (alive.current) {
   ++instanceReadGeneration.current;
   setInstances(values => values?.map(item => item.instanceId === id
     ? {...item, affectionPeak: result.peak, nickname: result.nickname} : item) ?? null);
  }
 }, [api]);
 const [careError,setCareError] = useState('');
 const [farmAnimation,setFarmAnimation] = useState<CompanionFarmAnimationEvent|null>(null);
 const farmAnimationSequence = useRef(0);
 const instanceBusy = useRef(false);
 const instanceReadGeneration=useRef(0);
 const pendingOperation=useRef<{
  type:'CARE'|'EVOLVE';id:string;action?:CompanionCareAction;version:number;key:string
 }|null>(null);
 const lastSuccessfulRefreshAt = useRef(0);
 const FOREGROUND_MIN_REFRESH_MS = 30_000;
 const refreshInstances=useCallback(async():Promise<CompanionInstance[]|undefined>=>{
  if(!api.instances)return;
  const generation=++instanceReadGeneration.current;
  try{
   const result=await api.instances();
   if(alive.current&&generation===instanceReadGeneration.current){
    // Ignore out-of-order GET responses and never downgrade a confirmed
    // care/evolution version, even when a read started before the POST.
    setInstances(previous=>result.map(item=>{
     const current=previous?.find(old=>old.instanceId===item.instanceId);
     return current&&current.version>item.version?current:item;
    }));
   }
   return result;
  }catch(e){
   if(alive.current&&generation===instanceReadGeneration.current){
    if(e instanceof FaithLogApiError&&e.detail.status===404){
     setInstances(null);
     setCareError('이 서버는 개체별 돌봄을 지원하지 않아요. 서버 업데이트가 필요해요.');
    }else{
     setCareError('동물 상태를 불러오지 못했어요. 네트워크를 확인해주세요.');
    }
   }
   return;
  }
 },[api]);
 const apply=useCallback((value:ServerSnapshot)=>{
  if(!alive.current)return;
  source.current=value;setSnapshot(value);
  const claimed:string[]=[];
  for(const [id,code] of Object.entries(DAILY_MISSION_SERVER_IDS))if(value.daily.missions.some(m=>m.mission===code&&m.status==='CLAIMED'))claimed.push(`${value.daily.recordDate}:${id}`);
  if(value.attendance.claimed)claimed.push(`${value.attendance.date}:attendance`);
  for(const [id,code] of Object.entries(PERIOD_MISSION_IDS)){const item=value.periods.missions.find(m=>m.mission===code);if(item?.status==='CLAIMED')claimed.push(`${item.periodStart}:${id}`);}
  const slots=[...value.garden.placements].sort((a,b)=>a.slot-b.slot).map(p=>({
    designId:p.designId,instanceId:p.instanceId??null,x:p.x,y:p.y,
  }));
  let next:CompanionState={points:value.balance,dailyAwardedPoints:0,backgroundId:value.garden.backgroundId??'default',inventory:value.inventory,equipped:slots.map(p=>p.designId),gardenSlots:slots,gardenPositions:Object.fromEntries(value.garden.placements.map(p=>[p.designId,{x:p.x,y:p.y}])),claimed,transactions:[]};
  if (gardenDirty.current) {
    next = {...next,equipped:current.current.equipped,gardenSlots:current.current.gardenSlots,backgroundId:current.current.backgroundId,gardenPositions:current.current.gardenPositions};
  }
  current.current=next;setState(next);
 },[]);
 const refresh=useCallback(async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{const [loaded]=await Promise.all([api.load(),api.recordGardenVisit?.().catch(()=>undefined)]);apply(loaded);await refreshInstances();if(alive.current){lastSuccessfulRefreshAt.current=Date.now();setError('');}}catch{if(alive.current)setError('서버 정보를 확인하지 못했어요. 새로 확인하면 이전 거래 결과도 복구해요.');}finally{lock.current=false;if(alive.current)setBusy(false);}},[api,apply,refreshInstances]);
 const flushGarden = useCallback(async function saveGarden(): Promise<void> {
  if (gardenTimer.current) clearTimeout(gardenTimer.current);
  gardenTimer.current = null;
  if (!gardenDirty.current || !source.current) return;
  if (lock.current) {
    gardenTimer.current = setTimeout(() => {void saveGarden();}, 700);
    return;
  }
  lock.current = true;
  setBusy(true);
  const revision = gardenRevision.current;
  const draft = current.current;
  try {
    const garden = await api.garden({
      version:source.current.garden.version,
      backgroundId:draft.backgroundId === 'default' ? null : draft.backgroundId,
      placements:companionGardenSlots(draft).map((p,index)=>({
        slot:index+1,designId:p.designId,x:p.x,y:p.y,
        ...(p.instanceId?{instanceId:p.instanceId}:{}),
      })),
    });
    if (!alive.current) return;
    // A new garden assignment may point at a different owned instance.
    // Refresh only the <=5 equipped pets, not the full wallet/catalog/
    // inventory snapshot. Background-only changes require no extra API call.
    const previous = [...source.current!.garden.placements]
      .sort((a,b)=>a.slot-b.slot).map(item=>item.instanceId??item.designId);
    const updated = [...garden.placements]
      .sort((a,b)=>a.slot-b.slot).map(item=>item.instanceId??item.designId);
    const equippedChanged = previous.length !== updated.length ||
      previous.some((id,index)=>id!==updated[index]);
    gardenInstancesDirty.current ||= equippedChanged;
    gardenDirty.current = revision !== gardenRevision.current;
    apply({...source.current!,garden});
    if (!gardenDirty.current) {
      setGardenSaving(false);
      if (gardenInstancesDirty.current) {
        gardenInstancesDirty.current = false;
        await refreshInstances();
      }
    }
  } catch {
    if (alive.current) {
      gardenDirty.current = false;
      if (gardenTimer.current) clearTimeout(gardenTimer.current);
      gardenTimer.current = null;
      setGardenSaving(false);
      apply(source.current!);
      if (gardenInstancesDirty.current) {
        gardenInstancesDirty.current = false;
        await refreshInstances();
      }
      if (!alive.current) return;
      setError('정원 변경을 저장하지 못했어요. 새로 확인한 뒤 다시 변경해주세요.');
    }
  } finally {
    lock.current = false;
    if (alive.current) setBusy(false);
    if (alive.current && gardenDirty.current && !gardenTimer.current) {
      gardenTimer.current = setTimeout(() => {void saveGarden();}, 700);
    }
  }
 }, [api,apply,refreshInstances]);
 useEffect(() => {
  alive.current = true;
  void refresh();
  const sub = AppState.addEventListener('change',value => {
    if (value === 'active') {
      // Short app switches/notification overlays must not trigger a dozen
      // wallet, catalog, mission and garden requests in quick succession.
      // Explicit user refresh still runs immediately, even within 30 seconds.
      if(Date.now()-lastSuccessfulRefreshAt.current >= FOREGROUND_MIN_REFRESH_MS) void refresh();
    } else void flushGarden();
  });
  return () => {
    if (gardenTimer.current) clearTimeout(gardenTimer.current);
    gardenTimer.current = null;
    // Best effort on account/provider exit; normal page navigation keeps this provider.
    if (gardenDirty.current && !lock.current) void flushGarden();
    alive.current = false;
    sub.remove();
  };
 }, [refresh,flushGarden]);
 const operate=useCallback(async<T,>(job:()=>Promise<T>,reconcile?:(result:T)=>ServerSnapshot):Promise<T>=>{if(lock.current||!source.current||error)throw new Error('서버 정보를 먼저 새로 확인해주세요.');lock.current=true;setBusy(true);try{const result=await job();apply(reconcile?reconcile(result):await api.load());return result;}catch(e){if(alive.current)setError('처리 결과를 확인해주세요. 새로 확인한 뒤 다시 시도할 수 있어요.');throw e;}finally{lock.current=false;if(alive.current)setBusy(false);}},[api,apply,error]);
 const perform=useCallback(async(action:CompanionAction)=>{
  if (['background','equip','replace','equip-instance','unequip-instance'].includes(action.type)) {
    if (!source.current || error) return false;
    if (action.type === 'background' && action.backgroundId !== 'default' && !source.current.backgrounds.includes(action.backgroundId)) return false;
    const next = companionReducer(current.current,action);
    if (next === current.current) return false;
    current.current = next;
    setState(next);
    gardenDirty.current = true;
    gardenRevision.current++;
    setGardenSaving(true);
    if (gardenTimer.current) clearTimeout(gardenTimer.current);
    gardenTimer.current = setTimeout(() => {void flushGarden();}, 700);
    return true;
  }
  // Drag positions are transient and never persisted by the server provider.
  if (action.type === 'move') return false;
  try{
   if(action.type==='claim'){await operate(()=>api.claim(action.missionId),result=>({...source.current!,...result}));if(action.missionId in PERIOD_MISSION_IDS)void refreshGardenRewards();return true;}
   return await operate(async()=>{
   if(action.type==='sell'){await api.sell(action.designId,action.quantity);return true;}
   return false;
  });}catch{return false;}
 },[api,operate,error,flushGarden,refreshGardenRewards]);
 const claimDaily=useCallback(async(ids:readonly DailyMissionId[])=>{for(const id of ids)if(!await perform({type:'claim',missionId:id,periodKey:'server',status:'ready'}))break;},[perform]);
 const executeDraw=useCallback(async(count:1|10)=>{const result=await operate(()=>api.draw(count));return result.designIds;},[api,operate]);
 const careInstance=useCallback(async(id:string,action:CompanionCareAction,facilitySlot?:number)=>{
  if(!api.careInstance || !instances || instanceBusy.current || lock.current || error) return;
  const found=instances.find(item=>item.instanceId===id);
  if(!found)return;
  instanceBusy.current=true;setBusy(true);setCareError('');
  try{
   const pending=pendingOperation.current;
   if(pending&&!(pending.type==='CARE'&&pending.id===id&&pending.action===action&&pending.version===found.version)){
    if(alive.current)setCareError('이전 돌봄 결과를 먼저 확인해주세요.');
    return;
   }
   const key=pending?.key??`pet-care-${Date.now()}-${Math.random().toString(36).slice(2)}`;
   pendingOperation.current={type:'CARE',id,action,version:found.version,key};
   const updated=await api.careInstance(id,action,found.version,key);
   if(alive.current){
    setInstances(items=>items?.map(item=>item.instanceId!==id?item:
      item.version>updated.version?item:updated)??null);
    if((updated.affectionPeak ?? 0) >= 90 && (found.affectionPeak ?? 0) < 90)void refreshGardenRewards();
    if(updated.version>found.version)setFarmAnimation({instanceId:id,action,sequence:++farmAnimationSequence.current,...(facilitySlot === undefined ? {} : {facilitySlot})});
   }
   pendingOperation.current=null;
  }catch(e){
   const definitive=e instanceof FaithLogApiError &&
     (e.detail.status??0)>=400 && (e.detail.status??0)<500 &&
     ![408,429].includes(e.detail.status??0);
   if(definitive)pendingOperation.current=null;
   if(alive.current)setCareError(definitive
     ?'돌봄 요청이 거절됐어요. 현재 상태와 쿨타임을 확인해주세요.'
     :'돌봄 응답이 불확실해요. 같은 요청으로 다시 시도할 수 있어요.');
   const latest=await refreshInstances();
   if(latest?.some(item=>item.instanceId===id&&item.version>found.version)){
    pendingOperation.current=null;
    if(alive.current)setCareError('서버에서 돌봄 결과를 복구했어요.');
   }
  }finally{instanceBusy.current=false;if(alive.current)setBusy(false);}
 },[api,instances,error,refreshInstances,refreshGardenRewards]);

 const evolveInstance=useCallback(async(id:string)=>{
  if(!api.evolveInstance || !instances || instanceBusy.current || lock.current || error) return;
  const found=instances.find(item=>item.instanceId===id);
  if(!found?.canEvolve)return;
  instanceBusy.current=true;setBusy(true);setCareError('');
  try{
   const pending=pendingOperation.current;
   if(pending&&!(pending.type==='EVOLVE'&&pending.id===id&&pending.version===found.version)){
    if(alive.current)setCareError('이전 진화 결과를 먼저 확인해주세요.');
    return;
   }
   const key=pending?.key??`pet-evolve-${Date.now()}-${Math.random().toString(36).slice(2)}`;
   pendingOperation.current={type:'EVOLVE',id,version:found.version,key};
   const updated=await api.evolveInstance(id,found.version,key);
   if(alive.current){
    setInstances(items=>items?.map(item=>item.instanceId!==id?item:
      item.version>updated.version?item:updated)??null);
    if(updated.level>found.level&&updated.version>found.version){
     setFarmAnimation({instanceId:id,action:'EVOLVE',sequence:++farmAnimationSequence.current});
    }
   }
   pendingOperation.current=null;
  }catch(e){
   const definitive=e instanceof FaithLogApiError &&
     (e.detail.status??0)>=400 && (e.detail.status??0)<500 &&
     ![408,429].includes(e.detail.status??0);
   if(definitive)pendingOperation.current=null;
   if(alive.current)setCareError(definitive
     ?'진화 요청이 거절됐어요. 성장 조건을 다시 확인해주세요.'
     :'진화 응답이 불확실해요. 같은 요청으로 다시 시도할 수 있어요.');
   const latest=await refreshInstances();
   if(latest?.some(item=>item.instanceId===id&&item.version>found.version)){
    pendingOperation.current=null;
    if(alive.current)setCareError('서버에서 진화 결과를 복구했어요.');
   }
  }finally{instanceBusy.current=false;if(alive.current)setBusy(false);}
 },[api,instances,error,refreshInstances]);

 const instancesByDesign = useCallback(async(designId:BibleFriendDesignId,page:number)=>{
  if(!api.instancesByDesign || page<0 || page>100) return [];
  return api.instancesByDesign(designId,page);
 },[api]);

 const wakeInstance=useCallback(async(id:string)=>{
  if(!api.wakeInstance||lock.current||instanceBusy.current)return;
  instanceBusy.current=true;
  setBusy(true);
  setCareError('');
  try{
   const previous=instances?.find(item=>item.instanceId===id);
   const updated=await api.wakeInstance(id);
   if(alive.current){
    setInstances(items=>items?.map(item=>
     item.instanceId===id&&item.version<=updated.version?updated:item)??null);
    if(previous&&updated.version>previous.version){
     setFarmAnimation({instanceId:id,action:'WAKE',sequence:++farmAnimationSequence.current});
    }
   }
  }catch{
   if(alive.current)setCareError('동물을 깨우지 못했어요. 다시 시도해주세요.');
  }finally{instanceBusy.current=false;if(alive.current)setBusy(false);}
 },[api,instances]);
 const [shardBalance,setShardBalance]=useState<number|null>(null);
 const pendingExchange=useRef<{id:BibleFriendDesignId;key:string}|null>(null);
 const pendingBoost=useRef<{id:string;version:number;key:string}|null>(null);
 const loadShards=useCallback(async()=>{
  try {
   const balance=await api.growthShards?.();
   if(alive.current&&balance!==undefined)setShardBalance(balance);
  }catch{
   if(alive.current)setShardBalance(null);
  }
 },[api]);
 const claimCareGift=useCallback(async(id:string,milestone:number)=>{
  if(!api.claimCareGift)throw new Error('돌봄 선물을 받을 수 없어요.');
  const gifts=await api.claimCareGift(id,milestone);
  await loadShards();
  return gifts;
 },[api,loadShards]);
 const exchangeShard=useCallback(async(id:BibleFriendDesignId)=>{
  if(!api.exchangeShard||lock.current||instanceBusy.current||gardenDirty.current)return null;
  const pending=pendingExchange.current;
  if(pending&&pending.id!==id){setCareError('이전 교환과 같은 동물로 다시 시도해주세요.');return null;}
  const key=pending?.key??`shard-exchange-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  pendingExchange.current={id,key};
  lock.current=true;
  setBusy(true);
  setCareError('');
  try{
   const result=await api.exchangeShard(id,key);
   pendingExchange.current=null;
   if(alive.current){
    setShardBalance(result.balance);

   }
   await api.load().then(apply).catch(()=>undefined);
   return result.awarded;
  }catch(e){
   if(e instanceof FaithLogApiError && (e.detail.status??0)>=400
      && (e.detail.status??0)<500 && ![408,429].includes(e.detail.status??0))pendingExchange.current=null;
   if(alive.current)setCareError('성장 조각 교환을 확인하지 못했어요. 다시 시도해주세요.');
   return null;
  }finally{lock.current=false;if(alive.current)setBusy(false);}
 },[api,apply]);
 const boostWithShards=useCallback(async(id:string)=>{
  const animal=instances?.find(item=>item.instanceId===id);
  if(!animal||!api.boostWithShards||lock.current||instanceBusy.current)return;
  const pending=pendingBoost.current;
  if(pending&&pending.id!==id){setCareError('이전 강화와 같은 동물로 다시 시도해주세요.');return;}
  const operation=pending??{id,version:animal.version,key:`shard-boost-${Date.now()}-${Math.random().toString(36).slice(2)}`};
  pendingBoost.current=operation;
  instanceBusy.current=true;
  setBusy(true);
  setCareError('');
  try{
   const result=await api.boostWithShards(id,operation.version,operation.key);
   pendingBoost.current=null;
   if(alive.current)setInstances(items=>items?.map(item=>
    item.instanceId===id&&item.version<=result.version?result:item)??null);
   await loadShards();
  }catch(e){
   if(e instanceof FaithLogApiError && (e.detail.status??0)>=400
      && (e.detail.status??0)<500 && ![408,429].includes(e.detail.status??0))pendingBoost.current=null;
   if(alive.current)setCareError('강화에 실패했어요. 조각 잔액과 하루 사용 한도를 확인해주세요.');
  }finally{instanceBusy.current=false;if(alive.current)setBusy(false);}
 },[api,instances,loadShards]);

 const purchaseGardenDecoration = useCallback(async (id: string, price: number) => {
  if (!api.purchaseGardenDecoration || lock.current || !source.current) {
    throw new Error('이전 요청이 끝난 뒤 다시 시도해 주세요.');
  }
  lock.current = true;
  setBusy(true);
  try {
    const result = await api.purchaseGardenDecoration(id, price);
    if (source.current) apply({...source.current, balance: result.balance});
    return result;
  } finally {
    lock.current = false;
    if (alive.current) setBusy(false);
  }
 }, [api, apply]);

 const daily:DailyState={snapshot:snapshot?.daily??null,error,loading:busy,claiming:busy};
 return <CompanionContext.Provider value={{...(api.gardenRewards ? {gardenRewards,refreshGardenRewards,selectRewardBackground,renameCompanion} : {}),...(api.careReminder ? {careReminder: api.careReminder} : {}),...(api.expedition ? {expedition: api.expedition} : {}),...(api.friendGardens ? {friendGardens: api.friendGardens} : {}),...(api.loadGardenShop && api.purchaseGardenDecoration ? {loadGardenShop: api.loadGardenShop, purchaseGardenDecoration} : {}),...(api.careGifts&&api.claimCareGift?{careGifts:api.careGifts,claimCareGift}:{}),gardenSaving,wakeInstance,shardBalance,loadShards,exchangeShard,boostWithShards,baseAppearance,...(appearanceReady ? {toggleAppearance} : {}),instances,farmAnimation,careError,careInstance,evolveInstance,...(api.instancesByDesign?{instancesByDesign}:{}),...(api.saleAvailability?{saleAvailability:api.saleAvailability}:{}),state,dispatch:action=>{void perform(action);},nextTransactionId:kind=>`${kind}-${Date.now()}`,daily,refreshDaily:refresh,claimDaily,server:true,busy,error,serverSnapshot:snapshot,refresh,executeDraw,perform}}>{children}</CompanionContext.Provider>;
}
export function useCompanions() {
  const value = useContext(CompanionContext);
  if (!value) throw new Error('CompanionProvider is required');
  return value;
}
/** Released economy uses the authenticated server in every build. */
export function isCompanionPreviewEnabled() {return true;}
