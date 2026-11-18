import {BIBLE_FRIEND_DESIGN_CATALOG, BIBLE_FRIEND_RARITIES, type BibleFriendDesignId, type BibleFriendRarity} from '../characters/bibleFriendDesignCatalog';
import {isGardenBackgroundId, type GardenBackgroundId} from './gardenBackgrounds';
import type {DailyMissionSnapshot} from './dailyMissionContract';
export type GardenPlacement = {slot:number;designId:BibleFriendDesignId;x:number;y:number;instanceId?:string|null};
export type Garden = {version:number;backgroundId:GardenBackgroundId|null;placements:GardenPlacement[]};
export type Operation = {operationId:string;designIds:BibleFriendDesignId[];pointDelta:number;balance:number;policyVersion:string;quantity:number;unitPrice:number};
export type MissionItem = {mission:string;points:number;status:'INCOMPLETE'|'READY'|'CLAIMED';periodStart:string;periodEnd:string;availableAt:string;expiresAt:string};
export type ServerSnapshot = {balance:number;inventory:Partial<Record<BibleFriendDesignId,number>>;garden:Garden;daily:DailyMissionSnapshot;attendance:{date:string;points:number;claimed:boolean;balance:number};periods:{serverNow:string;balance:number;missions:MissionItem[]};backgrounds:GardenBackgroundId[];pool:{poolVersion:string;unitCost:number;totalWeight:number;entries:Array<{designId:BibleFriendDesignId;weight:number}>}|null;prices:Record<BibleFriendRarity,number>;history:Array<{result:Operation;createdAt:string}>;catalog:BibleFriendDesignId[]};
export type ClaimUpdate = {balance:number} & ({daily:ServerSnapshot['daily']} | {attendance:ServerSnapshot['attendance']} | {periods:ServerSnapshot['periods']});
export type CompanionCareAction = 'FEED' | 'PET' | 'PLAY' | 'CLEAN' | 'SLEEP';
export type CompanionStats = {satiety:number;cleanliness:number;joy:number;affection:number;health:number};
export type CompanionEvolutionBlocker = 'MAX_LEVEL'|'EXPERIENCE'|'CARE_DAYS'|'HEALTH'|'SATIETY'|'CLEANLINESS';
export type CompanionEvolution = {
 currentLevel:1|2|3;nextLevel:1|2|3;
 threshold:{growthXp:number;distinctCareDays:number;health:number;satiety:number;cleanliness:number}|null;
 blockers:CompanionEvolutionBlocker[];
};
export type CompanionInstance = {
 instanceId:string;designId:BibleFriendDesignId;level:1|2|3;
 growthXp:number;totalEarnedXp:number;careDays:number;stats:CompanionStats;
 lastCaredAt:string;version:number;nextEvolution:CompanionEvolution|null;canEvolve:boolean;
};
export type CompanionServerApi = {
 load:()=>Promise<ServerSnapshot>;garden:(garden:Garden)=>Promise<Garden>;
 claim:(id:string)=>Promise<ClaimUpdate>;draw:(count:1|10)=>Promise<Operation>;
 sell:(id:BibleFriendDesignId,quantity:number)=>Promise<Operation>;
 // Optional for old server/demo mocks; never fabricate growth stats on 404.
 instances?:()=>Promise<CompanionInstance[]>;
 instancesByDesign?:(designId:BibleFriendDesignId,page:number)=>Promise<CompanionInstance[]>;
 careInstance?:(id:string,action:CompanionCareAction,expectedVersion:number,key:string)=>Promise<CompanionInstance>;
 evolveInstance?:(id:string,expectedVersion:number,key:string)=>Promise<CompanionInstance>;
};
export type PendingOperation = {key:string;kind:'draws'|'sales';body:{poolVersion:string;count:1|10}|{designId:BibleFriendDesignId;quantity:number}};
export type PendingStorage = {get:()=>Promise<string|null>;set:(value:string)=>Promise<void>;clear:()=>Promise<void>};
export function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('서버 응답을 확인해주세요.');return value as Record<string,unknown>;}
export function integer(value:unknown,min=0):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min)throw new Error('Invalid integer');return value;}
export function string(value:unknown):string{if(typeof value!=='string'||!value)throw new Error('Invalid string');return value;}
export function date(value:unknown):string{const s=string(value);if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(s)||!Number.isFinite(Date.parse(s))||s.length===10&&new Date(s).toISOString().slice(0,10)!==s)throw new Error('Invalid date');return s;}
export function array(value:unknown):unknown[]{if(!Array.isArray(value))throw new Error('Invalid array');return value;}
export function designId(value:unknown):BibleFriendDesignId{if(!BIBLE_FRIEND_DESIGN_CATALOG.some(d=>d.id===value))throw new Error('새 캐릭터를 표시하려면 앱을 업데이트해주세요.');return value as BibleFriendDesignId;}
export function parseGarden(value:unknown):Garden{
 const r=object(value);const bg=r.backgroundId;
 if(bg!==null&&(typeof bg!=='string'||!isGardenBackgroundId(bg)))throw new Error('Invalid background');
 const placements:GardenPlacement[]=array(r.placements).map(v=>{
  const p=object(v);const slot=integer(p.slot,1);
  if(slot>5||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)throw new Error('Invalid placement');
  const instanceId=p.instanceId==null?undefined:string(p.instanceId);
  if(instanceId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(instanceId))throw new Error('Invalid companion UUID');
  return{slot,designId:designId(p.designId),x:p.x,y:p.y,...(instanceId?{instanceId}:{})};
 });
 if(placements.length>5||new Set(placements.map(p=>p.slot)).size!==placements.length)throw new Error('Duplicate placement slot');
 const used=new Set<string>();const legacyDesigns=new Set<string>();
 for(const p of placements){
   if(p.instanceId){if(used.has(p.instanceId))throw new Error('Duplicate companion UUID');used.add(p.instanceId);}
   else{if(legacyDesigns.has(p.designId))throw new Error('Duplicate legacy design');legacyDesigns.add(p.designId);}
 }
 if(placements.some(p=>!p.instanceId&&placements.some(other=>other!==p&&other.designId===p.designId)))throw new Error('Ambiguous duplicate legacy design');
 return{version:integer(r.version),backgroundId:bg as GardenBackgroundId|null,placements};
}
export function parseOperation(value:unknown):Operation{const r=object(value);if(typeof r.pointDelta!=='number'||!Number.isSafeInteger(r.pointDelta)||!r.pointDelta)throw new Error('Invalid delta');return{operationId:string(r.operationId),designIds:array(r.designIds).map(designId),pointDelta:r.pointDelta,balance:integer(r.balance),policyVersion:string(r.policyVersion),quantity:integer(r.quantity),unitPrice:integer(r.unitPrice)};}
export function rarity(value:unknown):BibleFriendRarity{if(!BIBLE_FRIEND_RARITIES.includes(value as BibleFriendRarity))throw new Error('Invalid rarity');return value as BibleFriendRarity;}
export const PERIOD_MISSION_IDS = {submission:'WEEKLY_SUBMISSION',vote:'WEEKLY_VOTE','weekly-no-penalty':'WEEKLY_NO_PENALTY','monthly-no-penalty':'MONTHLY_NO_PENALTY','all-submissions':'MONTHLY_ALL_SUBMISSIONS'} as const;
export function parsePeriods(value:unknown):ServerSnapshot['periods']{const r=object(value);const missions=array(r.missions).map(v=>{const m=object(v);const code=string(m.mission);if(!Object.values(PERIOD_MISSION_IDS).some(id=>id===code)||!['INCOMPLETE','READY','CLAIMED'].includes(String(m.status)))throw new Error('Invalid mission');return{mission:code,points:integer(m.points,1),status:m.status as MissionItem['status'],periodStart:date(m.periodStart),periodEnd:date(m.periodEnd),availableAt:date(m.availableAt),expiresAt:date(m.expiresAt)};});if(missions.length!==5||new Set(missions.map(m=>m.mission)).size!==5)throw new Error('Invalid missions');return{serverNow:date(r.serverNow),balance:integer(r.balance),missions};}

export function parseAttendance(value:unknown):ServerSnapshot['attendance']{const r=object(value);if(typeof r.claimed!=='boolean')throw new Error('Invalid attendance');return{date:date(r.date),points:integer(r.points,1),claimed:r.claimed,balance:integer(r.balance)};}

/** Refuse malformed/unknown-server data instead of displaying imaginary care stats. */
export function parseCompanionInstance(value:unknown):CompanionInstance{
 const r=object(value);const instanceId=string(r.instanceId);
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(instanceId))throw new Error('Invalid companion UUID');
 const level=integer(r.level,1);if(level>3)throw new Error('Invalid level');
 const growthXp=integer(r.growthXp),totalEarnedXp=integer(r.totalEarnedXp),careDays=integer(r.careDays);
 if(totalEarnedXp<growthXp||growthXp<(level===3?1000:level===2?300:0))throw new Error('Invalid companion XP');
 const statsObject=object(r.stats);
 const meters=(Object.fromEntries(['satiety','cleanliness','joy','affection','health'].map(k=>{
   const v=integer(statsObject[k]);if(v>100)throw new Error('Invalid companion stats');return[k,v];
 })) as CompanionStats);
 const version=integer(r.version);
 if(typeof r.canEvolve!=='boolean')throw new Error('Invalid evolution status');
 let nextEvolution:CompanionEvolution|null=null;
 if(r.nextEvolution!==null){
  const evolution=object(r.nextEvolution);const currentLevel=integer(evolution.currentLevel,1),nextLevel=integer(evolution.nextLevel,1);
  if(currentLevel!==level||nextLevel>3||nextLevel<currentLevel)throw new Error('Invalid evolution level');
  const valid:CompanionEvolutionBlocker[]=['MAX_LEVEL','EXPERIENCE','CARE_DAYS','HEALTH','SATIETY','CLEANLINESS'];
  const blockers=array(evolution.blockers).map(v=>{if(!valid.includes(v as CompanionEvolutionBlocker))throw new Error('Invalid evolution blocker');return v as CompanionEvolutionBlocker;});
  let threshold:CompanionEvolution['threshold']=null;
  if(evolution.threshold!==null){
   const t=object(evolution.threshold);
   threshold={growthXp:integer(t.growthXp),distinctCareDays:integer(t.distinctCareDays),
      health:integer(t.health),satiety:integer(t.satiety),cleanliness:integer(t.cleanliness)};
  }
  nextEvolution={currentLevel:currentLevel as 1|2|3,nextLevel:nextLevel as 1|2|3,threshold,blockers};
 }
 if(r.canEvolve && (!nextEvolution || nextEvolution.blockers.length || level===3))throw new Error('Invalid evolution readiness');
 return{instanceId,designId:designId(r.designId),level:level as 1|2|3,
  growthXp,totalEarnedXp,careDays,stats:meters,
  lastCaredAt:date(r.lastCaredAt),version,nextEvolution,canEvolve:r.canEvolve};
}
