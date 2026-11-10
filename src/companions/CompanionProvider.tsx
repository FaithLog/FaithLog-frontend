import {createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type PropsWithChildren} from 'react';
import {companionReducer, createCompanionDemoState, type CompanionAction, type CompanionState} from './companionModel';
import type {DailyMissionApi, DailyMissionId, DailyMissionSnapshot} from './dailyMissionContract';

type DailyState = {snapshot: DailyMissionSnapshot | null; error: string; loading: boolean; claiming: boolean};
const CompanionContext = createContext<{state: CompanionState; dispatch: Dispatch<CompanionAction>; nextTransactionId: (kind: string) => string; daily: DailyState; refreshDaily: () => Promise<void>; claimDaily: (ids: readonly DailyMissionId[]) => Promise<void>} | null>(null);
export function CompanionProvider({children, dailyApi}: PropsWithChildren<{dailyApi?: DailyMissionApi}>) {
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
  return <CompanionContext.Provider value={{state, dispatch, nextTransactionId,daily,refreshDaily,claimDaily}}>{children}</CompanionContext.Provider>;
}
export function useCompanions() {
  const value = useContext(CompanionContext);
  if (!value) throw new Error('CompanionProvider is required');
  return value;
}
/** Keep the unfinished draw/inventory economy out of store builds. */
export function isCompanionPreviewEnabled() {return typeof __DEV__ !== 'undefined' && __DEV__;}
