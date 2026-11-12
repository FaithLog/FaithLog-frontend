import {AppState} from 'react-native';
import type {CompanionServerApi, ServerSnapshot} from './companionServerContract';
import {PERIOD_MISSION_IDS} from './companionServerContract';
import {DAILY_MISSION_SERVER_IDS} from './dailyMissionContract';
import type {BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type PropsWithChildren} from 'react';
import {companionReducer, createCompanionDemoState, type CompanionAction, type CompanionState} from './companionModel';
import type {DailyMissionApi, DailyMissionId, DailyMissionSnapshot} from './dailyMissionContract';

type DailyState = {snapshot: DailyMissionSnapshot | null; error: string; loading: boolean; claiming: boolean};
type Context = {state: CompanionState; dispatch: Dispatch<CompanionAction>; nextTransactionId: (kind: string) => string; daily: DailyState; refreshDaily: () => Promise<void>; claimDaily: (ids: readonly DailyMissionId[]) => Promise<void>; server:boolean; busy:boolean; error:string; serverSnapshot:ServerSnapshot|null; refresh:()=>Promise<void>; executeDraw?: (count:1|10)=>Promise<readonly BibleFriendDesignId[]>; perform?: (action:CompanionAction)=>Promise<boolean>};
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
export function CompanionProvider({children,dailyApi,api}:PropsWithChildren<{dailyApi?:DailyMissionApi;api?:CompanionServerApi}>) {
 return api?<ServerProvider api={api}>{children}</ServerProvider>:<DemoProvider {...(dailyApi?{dailyApi}:{})}>{children}</DemoProvider>;
}
function ServerProvider({children,api}:PropsWithChildren<{api:CompanionServerApi}>) {
 const empty:CompanionState={points:0,dailyAwardedPoints:0,backgroundId:'default',inventory:{},equipped:[],gardenPositions:{},claimed:[],transactions:[]};
 const [state,setState]=useState(empty);const current=useRef(state);
 const [snapshot,setSnapshot]=useState<ServerSnapshot|null>(null);const source=useRef<ServerSnapshot|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);const alive=useRef(true);
 const apply=useCallback((value:ServerSnapshot)=>{
  if(!alive.current)return;
  source.current=value;setSnapshot(value);
  const claimed:string[]=[];
  for(const [id,code] of Object.entries(DAILY_MISSION_SERVER_IDS))if(value.daily.missions.some(m=>m.mission===code&&m.status==='CLAIMED'))claimed.push(`${value.daily.recordDate}:${id}`);
  if(value.attendance.claimed)claimed.push(`${value.attendance.date}:attendance`);
  for(const [id,code] of Object.entries(PERIOD_MISSION_IDS)){const item=value.periods.missions.find(m=>m.mission===code);if(item?.status==='CLAIMED')claimed.push(`${item.periodStart}:${id}`);}
  const next:CompanionState={points:value.balance,dailyAwardedPoints:0,backgroundId:value.garden.backgroundId??'default',inventory:value.inventory,equipped:[...value.garden.placements].sort((a,b)=>a.slot-b.slot).map(p=>p.designId),gardenPositions:Object.fromEntries(value.garden.placements.map(p=>[p.designId,{x:p.x,y:p.y}])),claimed,transactions:[]};
  current.current=next;setState(next);
 },[]);
 const refresh=useCallback(async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{apply(await api.load());if(alive.current)setError('');}catch{if(alive.current)setError('서버 정보를 확인하지 못했어요. 새로 확인하면 이전 거래 결과도 복구해요.');}finally{lock.current=false;if(alive.current)setBusy(false);}},[api,apply]);
 useEffect(()=>{alive.current=true;void refresh();const sub=AppState.addEventListener('change',value=>{if(value==='active')void refresh();});return()=>{alive.current=false;sub.remove();};},[refresh]);
 const operate=useCallback(async<T,>(job:()=>Promise<T>):Promise<T>=>{if(lock.current||!source.current||error)throw new Error('서버 정보를 먼저 새로 확인해주세요.');lock.current=true;setBusy(true);try{const result=await job();apply(await api.load());return result;}catch(e){if(alive.current)setError('처리 결과를 확인해주세요. 새로 확인한 뒤 다시 시도할 수 있어요.');throw e;}finally{lock.current=false;if(alive.current)setBusy(false);}},[api,apply,error]);
 const perform=useCallback(async(action:CompanionAction)=>{
  try{return await operate(async()=>{
   if(action.type==='claim'){await api.claim(action.missionId);return true;}
   if(action.type==='sell'){await api.sell(action.designId,action.quantity);return true;}
   if(!['background','move','equip','replace'].includes(action.type))return false;
   const next=companionReducer(current.current,action);const old=source.current!.garden;
   await api.garden({version:old.version,backgroundId:next.backgroundId==='default'?null:next.backgroundId,placements:next.equipped.map((id,index)=>({slot:index+1,designId:id,x:next.gardenPositions[id]?.x??0.5,y:next.gardenPositions[id]?.y??0.5}))});return true;
  });}catch{return false;}
 },[api,operate]);
 const claimDaily=useCallback(async(ids:readonly DailyMissionId[])=>{for(const id of ids)if(!await perform({type:'claim',missionId:id,periodKey:'server',status:'ready'}))break;},[perform]);
 const executeDraw=useCallback(async(count:1|10)=>{const result=await operate(()=>api.draw(count));return result.designIds;},[api,operate]);
 const daily:DailyState={snapshot:snapshot?.daily??null,error,loading:busy,claiming:busy};
 return <CompanionContext.Provider value={{state,dispatch:action=>{void perform(action);},nextTransactionId:kind=>`${kind}-${Date.now()}`,daily,refreshDaily:refresh,claimDaily,server:true,busy,error,serverSnapshot:snapshot,refresh,executeDraw,perform}}>{children}</CompanionContext.Provider>;
}
export function useCompanions() {
  const value = useContext(CompanionContext);
  if (!value) throw new Error('CompanionProvider is required');
  return value;
}
/** Released economy uses the authenticated server in every build. */
export function isCompanionPreviewEnabled() {return true;}
