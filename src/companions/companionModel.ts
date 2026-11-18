import {isDailyMission, DAILY_MISSION_SERVER_IDS, type DailyMissionSnapshot} from './dailyMissionContract';
import {isGardenBackgroundId, type GardenBackgroundId} from './gardenBackgrounds';
import {BIBLE_FRIEND_DESIGN_CATALOG, type BibleFriendDesignId, type BibleFriendRarity} from '../characters/bibleFriendDesignCatalog';

export type CompanionPage = 'manage' | 'missions' | 'draw';
export type MissionPeriod = 'daily' | 'weekly' | 'monthly';
export type MissionStatus = 'incomplete' | 'ready' | 'settling';
export type MissionDefinition = Readonly<{
  id: string; period: MissionPeriod; label: string; points: number;
  destination: 'calendar' | 'devotion' | 'polls' | null;
}>;
export const DRAW_COST = 100;
export const MAX_GARDEN_FRIENDS = 5;
/** Provisional demo prices. Server policy must replace these before launch. */
export const DEMO_SELL_PRICES: Readonly<Record<BibleFriendRarity, number>> = {
  COMMON: 10, UNCOMMON: 15, RARE: 25, EPIC: 40, UNIQUE: 50, MIRACLE: 1000000,
};
export const MISSIONS: readonly MissionDefinition[] = [
  {id: 'attendance', period: 'daily', label: '출석', points: 10, destination: null},
  {id: 'quiet-time', period: 'daily', label: '큐티', points: 30, destination: 'calendar'},
  {id: 'prayer', period: 'daily', label: '기도', points: 30, destination: 'calendar'},
  {id: 'bible', period: 'daily', label: '말씀 읽기', points: 30, destination: 'calendar'},
  {id: 'submission', period: 'weekly', label: '경건 체크 제출', points: 100, destination: 'devotion'},
  {id: 'vote', period: 'weekly', label: '투표 참여', points: 50, destination: 'polls'},
  {id: 'weekly-no-penalty', period: 'weekly', label: '전주 벌금 없음', points: 50, destination: null},
  {id: 'monthly-no-penalty', period: 'monthly', label: '월간 벌금 없음', points: 200, destination: null},
  {id: 'all-submissions', period: 'monthly', label: '경건 체크 모두 제출', points: 300, destination: null},
];
export const RARITY_LABELS: Readonly<Record<BibleFriendRarity, string>> = {
  COMMON: '일반', UNCOMMON: '고급', RARE: '희귀', EPIC: '에픽', UNIQUE: '유니크', MIRACLE: '미라클',
};
export type GardenSlot = Readonly<{designId:BibleFriendDesignId;instanceId?:string|null;x:number;y:number}>;
export function companionGardenSlots(state:CompanionState):readonly GardenSlot[]{
 return state.gardenSlots??state.equipped.map(designId=>({
   designId,x:state.gardenPositions[designId]?.x??0.5,y:state.gardenPositions[designId]?.y??0.5,
 }));
}
export type CompanionState = Readonly<{
  points: number;
  dailyAwardedPoints: number;
  backgroundId: GardenBackgroundId;
  inventory: Readonly<Partial<Record<BibleFriendDesignId, number>>>;
  equipped: readonly BibleFriendDesignId[];
  gardenSlots?: readonly GardenSlot[];
  gardenPositions: Readonly<Partial<Record<BibleFriendDesignId, Readonly<{x: number; y: number}>>>>;
  claimed: readonly string[];
  transactions: readonly string[];
}>;
export type CompanionAction =
  | {type:'server-sync'; state:CompanionState}
  | {type: 'daily-sync'; snapshot: DailyMissionSnapshot}
  | {type: 'replace'; outgoingId: BibleFriendDesignId; incomingId: BibleFriendDesignId}
  | {type: 'background'; backgroundId: GardenBackgroundId}
  | {type: 'move'; designId: BibleFriendDesignId; position: Readonly<{x:number; y:number}>}
  | {type: 'equip'; designId: BibleFriendDesignId}
  | {type: 'equip-instance'; designId:BibleFriendDesignId; instanceId:string}
  | {type: 'unequip-instance'; instanceId:string}
  | {type: 'claim'; missionId: string; periodKey: string; status: MissionStatus}
  | {type: 'draw'; results: readonly BibleFriendDesignId[]; transactionId: string}
  | {type: 'sell'; designId: BibleFriendDesignId; quantity: number; transactionId: string};
const catalog = new Map(BIBLE_FRIEND_DESIGN_CATALOG.map(item => [item.id, item]));
export function createCompanionDemoState(): CompanionState {
  return {
    points: 1200, dailyAwardedPoints: 0, backgroundId: 'meadow',
    inventory: {'david-lamb:base': 3, 'hope-rabbit:base': 2, 'noah-bear:base': 1,
      'joy-chick:base': 1, 'peace-penguin:base': 1, 'love-otter:starlight': 2, 'daniel-lion:unique': 1},
    equipped: ['david-lamb:base', 'hope-rabbit:base', 'noah-bear:base', 'joy-chick:base', 'peace-penguin:base'],
    gardenPositions: {}, claimed: [], transactions: [],
  };
}
export function getSellQuote(state: CompanionState, id: BibleFriendDesignId, quantity: number, prices = DEMO_SELL_PRICES) {
  const design = catalog.get(id);
  if (!design || !Number.isSafeInteger(quantity) || quantity < 1 || quantity >= (state.inventory[id] ?? 0)) return null;
  return {quantity, points: prices[design.rarity] * quantity};
}
/** Session-only preview reducer. Never call this to settle real points or inventory. */
export function companionReducer(state: CompanionState, action: CompanionAction): CompanionState {
  switch (action.type) {
    case 'server-sync': return action.state;
    case 'daily-sync': {
      const {snapshot} = action;
      const total = Math.max(state.dailyAwardedPoints, snapshot.totalAwardedPoints);
      const claimed = [...state.claimed];
      for (const id of ['quiet-time', 'prayer', 'bible'] as const) {
        const item = snapshot.missions.find(mission => mission.mission === DAILY_MISSION_SERVER_IDS[id]);
        const key = `${snapshot.recordDate}:${id}`;
        if (item?.status === 'CLAIMED' && !claimed.includes(key)) claimed.push(key);
      }
      // The surrounding draw/inventory economy remains a development preview.
      return {...state, points: state.points + total - state.dailyAwardedPoints, dailyAwardedPoints: total, claimed};
    }
    case 'background':
      return isGardenBackgroundId(action.backgroundId) ? {...state, backgroundId: action.backgroundId} : state;
    case 'move': {
      if (!state.equipped.includes(action.designId) || !Number.isFinite(action.position.x) || !Number.isFinite(action.position.y)) return state;
      const position = {x:Math.max(0,Math.min(1,action.position.x)),y:Math.max(0,Math.min(1,action.position.y))};
      return {...state,gardenPositions:{...state.gardenPositions,[action.designId]:position}};
    }
    case 'replace': {
      if (!state.equipped.includes(action.outgoingId) || state.equipped.includes(action.incomingId) || !catalog.has(action.incomingId) || !(state.inventory[action.incomingId] ?? 0)) return state;
      const gardenPositions = {...state.gardenPositions};
      const outgoingPosition = gardenPositions[action.outgoingId];
      if (outgoingPosition) gardenPositions[action.incomingId] = outgoingPosition;
      else delete gardenPositions[action.incomingId];
      delete gardenPositions[action.outgoingId];
      if(state.gardenSlots){
        const index=state.gardenSlots.findIndex(p=>p.designId===action.outgoingId);
        if(index<0)return state;
        const slots=state.gardenSlots.map((p,i)=>i===index?{...p,designId:action.incomingId,instanceId:null}:p);
        return{...state,equipped:slots.map(p=>p.designId),gardenSlots:slots,gardenPositions};
      }
      return {...state, equipped: state.equipped.map(id => id === action.outgoingId ? action.incomingId : id), gardenPositions};
    }
    case 'equip': {
      if (state.equipped.includes(action.designId)){
        if(state.gardenSlots){
          const slots=state.gardenSlots.filter(p=>p.designId!==action.designId);
          return{...state,equipped:slots.map(p=>p.designId),gardenSlots:slots};
        }
        return {...state, equipped: state.equipped.filter(id => id !== action.designId)};
      }
      if (!catalog.has(action.designId) || !(state.inventory[action.designId] ?? 0) || state.equipped.length >= MAX_GARDEN_FRIENDS) return state;
      if(state.gardenSlots){
        const slots=[...state.gardenSlots,{designId:action.designId,instanceId:null,x:0.5,y:0.5}];
        return {...state,equipped:slots.map(p=>p.designId),gardenSlots:slots};
      }
      return {...state, equipped: [...state.equipped, action.designId]};
    }
    case 'equip-instance': {
      if(!catalog.has(action.designId)||!action.instanceId||(state.inventory[action.designId]??0)<1)return state;
      const slots=companionGardenSlots(state);
      if(slots.some(p=>p.instanceId===action.instanceId))return state;
      if(slots.length>=MAX_GARDEN_FRIENDS)return state;
      // The server remains authoritative about actual per-design ownership.
      const next=[...slots,{designId:action.designId,instanceId:action.instanceId,x:0.5,y:0.5}];
      return {...state,equipped:next.map(p=>p.designId),gardenSlots:next};
    }
    case 'unequip-instance': {
      const slots=companionGardenSlots(state);
      if(!slots.some(p=>p.instanceId===action.instanceId))return state;
      const next=slots.filter(p=>p.instanceId!==action.instanceId);
      return {...state,equipped:next.map(p=>p.designId),gardenSlots:next};
    }
    case 'claim': {
      const mission = MISSIONS.find(m => m.id === action.missionId);
      const key = `${action.periodKey}:${action.missionId}`;
      if (!mission || isDailyMission(action.missionId) || action.status !== 'ready' || !action.periodKey || state.claimed.includes(key)) return state;
      return {...state, points: state.points + mission.points, claimed: [...state.claimed, key]};
    }
    case 'draw': {
      if (state.transactions.includes(action.transactionId) || ![1, 10].includes(action.results.length) || action.results.some(id => !catalog.has(id))) return state;
      const cost = DRAW_COST * action.results.length;
      if (state.points < cost) return state;
      const inventory = {...state.inventory};
      for (const id of action.results) inventory[id] = (inventory[id] ?? 0) + 1;
      return {...state, points: state.points - cost, inventory, transactions: [...state.transactions, action.transactionId]};
    }
    case 'sell': {
      if (state.transactions.includes(action.transactionId)) return state;
      const quote = getSellQuote(state, action.designId, action.quantity);
      if (!quote) return state;
      return {...state, points: state.points + quote.points,
        inventory: {...state.inventory, [action.designId]: (state.inventory[action.designId] ?? 0) - quote.quantity},
        transactions: [...state.transactions, action.transactionId]};
    }
  }
}
/** Korea calendar boundaries, independent of the device timezone. */
export function getMissionPeriodKeys(now: Date) {
  const day = new Date(now.getTime() + 9 * 3600_000);
  const daily = day.toISOString().slice(0, 10);
  const monday = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return {daily, weekly: monday.toISOString().slice(0, 10), monthly: daily.slice(0, 7)};
}
export function getDemoMissionStatus(id: string): MissionStatus {
  if (['attendance', 'submission'].includes(id)) return 'ready';
  if (['weekly-no-penalty', 'monthly-no-penalty', 'all-submissions'].includes(id)) return 'settling';
  return 'incomplete';
}
