import type {GardenExpedition, GardenSeason} from './gardenExpeditionContract';
import type {CampusGardenGoal, FriendGardenPage, FriendGardenVisit} from './friendGardenContract';
import {apiRequest} from '../api/client';
import {FaithLogApiError} from '../api/apiError';
import {createDailyMissionApi} from './dailyMissionApi';
import {isDailyMission} from './dailyMissionContract';
import {isGardenBackgroundId} from './gardenBackgrounds';
import {array,date,designId,integer,object,parseGarden,parseOperation,parsePeriods,parseAttendance,parseCompanionInstance,PERIOD_MISSION_IDS,rarity,string,type CompanionCareGift,type CompanionSaleAvailability,type CompanionServerApi,type Garden,type GardenShopSnapshot,type PendingOperation,type PendingStorage,type ServerSnapshot} from './companionServerContract';

function parseCareGifts(value: unknown): CompanionCareGift[] {
 return array(value).map(item => {
  const row = object(item);
  const {status} = row;
  if (status !== 'LOCKED' && status !== 'READY' && status !== 'TOMORROW' && status !== 'CLAIMED') {
   throw new Error('Invalid care gift status');
  }
  return {milestone: integer(row.milestone, 1), shards: integer(row.shards, 1), status};
 });
}

function parseGardenShop(value: unknown): GardenShopSnapshot {
  const row = object(value);
  return {
    balance: integer(row.balance),
    items: array(row.items).map(value => {
      const item = object(value);
      if (typeof item.owned !== 'boolean') throw new Error('Invalid decoration ownership');
      return {id: string(item.id), price: integer(item.price, 1), owned: item.owned};
    }),
  };
}

function parseGardenSeason(value: unknown): GardenSeason {
 const row = object(value);
 const {name, claimed} = row;
 if ((name !== 'SPRING' && name !== 'SUMMER' && name !== 'AUTUMN' && name !== 'WINTER')
   || typeof claimed !== 'boolean') throw new Error('Invalid garden season');
 return {name, claimed, startsOn: date(row.startsOn), endsOn: date(row.endsOn),
  completed: integer(row.completed), target: integer(row.target, 1), reward: integer(row.reward, 1)};
}

function parseExpedition(value: unknown): GardenExpedition {
 const row = object(value);
 const {state} = row;
 if (state !== 'AVAILABLE' && state !== 'EXPLORING' && state !== 'READY' && state !== 'CLAIMED') {
  throw new Error('Invalid expedition status');
 }
 const id = row.id === null ? null : string(row.id);
 const readyAt = row.readyAt === null ? null : date(row.readyAt);
 const design = row.designId === null ? null : designId(row.designId);
 if (state !== 'AVAILABLE' && (!id || !readyAt || !design)) throw new Error('Missing expedition details');
 return {state, id, readyAt, designId: design, reward: integer(row.reward, 1),
  ...(row.season ? {season: parseGardenSeason(row.season)} : {})};
}

export function createCompanionServerApi(campusId:number,getToken:()=>Promise<string|null>,storage:PendingStorage):CompanionServerApi {
 const daily=createDailyMissionApi(campusId,getToken);let pool:ServerSnapshot['pool']=null;let mutation=false;
 const request=async<T>(path:string,parser:(v:unknown)=>T,method:'GET'|'POST'|'PUT'='GET',body?:unknown,key?:string)=>{const accessToken=await getToken();if(!accessToken)throw new Error('인증이 필요해요.');return apiRequest<T>(path,{accessToken,method,body,responseParser:parser,...(key?{idempotencyKey:key}:{})});};
 const execute=async(p:PendingOperation)=>{
  try{const result=await request(`/api/v1/companions/me/${p.kind}`,parseOperation,'POST',p.body,p.key);await storage.clear();return result;}
  catch(e){if(e instanceof FaithLogApiError&&e.detail.status&&e.detail.status>=400&&e.detail.status<500&&![408,429].includes(e.detail.status))await storage.clear();throw e;}
 };
 const pending=async()=>{const saved=await storage.get();if(!saved)return null;const r=object(JSON.parse(saved));const body=object(r.body);if(typeof r.key!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(r.key)||!['draws','sales'].includes(String(r.kind)))throw new Error('이전 거래 정보를 확인할 수 없어요.');if(r.kind==='draws'){const count=integer(body.count,1);if(count!==1&&count!==10)throw new Error('Invalid count');return{key:r.key,kind:'draws' as const,body:{poolVersion:string(body.poolVersion),count:count as 1|10}};}return{key:r.key,kind:'sales' as const,body:{designId:designId(body.designId),quantity:integer(body.quantity,1)}};};
 const mutate=async(kind:PendingOperation['kind'],body:PendingOperation['body'])=>{
  if(mutation)throw new Error('이전 거래를 처리하고 있어요.');mutation=true;
  try{if(await pending())throw new Error('이전 거래 결과를 먼저 새로 확인해주세요.');const key=`${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;const p={key,kind,body};await storage.set(JSON.stringify(p));return await execute(p);}finally{mutation=false;}
 };
 async function loadInventory():Promise<ServerSnapshot['inventory']>{
  const inventory:ServerSnapshot['inventory']={};
  for(let page=0;page<100;page++){
   const result=await request(`/api/v1/companions/me/inventory?page=${page}&size=100`,v=>{
    const r=object(v);
    return{items:array(r.items).map(x=>{
     const d=object(x);
     return{id:designId(d.designId),quantity:integer(d.quantity,1)};
    }),total:integer(r.total)};
   });
   for(const item of result.items)inventory[item.id]=item.quantity;
   if((page+1)*100>=result.total)return inventory;
  }
  throw new Error('보유 목록이 너무 커요.');
 }
 const friendsPath = `/api/v1/campuses/${encodeURIComponent(campusId)}/friend-gardens`;
 const parseVisibility = (value: unknown) => {
  const {visible} = object(value);
  if (typeof visible !== 'boolean') throw new Error('Invalid garden visibility');
  return visible;
 };
 const careReminderPath = '/api/v1/companions/me/garden/care-reminders';
 const parseCareReminder = (value: unknown) => {
  const {enabled} = object(value);
  if (typeof enabled !== 'boolean') throw new Error('Invalid care reminder preference');
  return enabled;
 };
 const expeditionPath = '/api/v1/companions/me/garden/expedition';
 return {
  careReminder: {
   load: () => request(careReminderPath, parseCareReminder),
   setEnabled: enabled => request(careReminderPath, parseCareReminder, 'PUT', {enabled}),
  },
  expedition: {
   claimSeason: start => request(`${expeditionPath}/seasons/${encodeURIComponent(start)}/claim`, parseExpedition, 'POST'),
   load: () => request(expeditionPath, parseExpedition),
   start: instanceId => request(expeditionPath, parseExpedition, 'POST', {instanceId}),
   claim: id => request(`${expeditionPath}/${encodeURIComponent(id)}/claim`, parseExpedition, 'POST'),
  },
  friendGardens: {
   weeklyGoal: () => request(`${friendsPath}/weekly-goal`, value => {
    const row = object(value);
    if (typeof row.contributed !== 'boolean') throw new Error('Invalid garden contribution');
    return {startsOn: date(row.startsOn), endsOn: date(row.endsOn),
     target: integer(row.target, 1), participants: integer(row.participants),
     contributed: row.contributed} satisfies CampusGardenGoal;
   }),
   list: (after = 0) => request(`${friendsPath}?after=${encodeURIComponent(after)}`, value => {
    const row = object(value);
    return {
     visible: parseVisibility(row),
     items: array(row.items).map(item => {
      const friend = object(item);
      return {userId: integer(friend.userId, 1), name: string(friend.name)};
     }),
     nextCursor: row.nextCursor === null ? null : integer(row.nextCursor, after + 1),
    } satisfies FriendGardenPage;
   }),
   setVisibility: visible => request(`${friendsPath}/me/visibility`, parseVisibility, 'PUT', {visible}),
   help: (ownerId, slot, action) => request(`${friendsPath}/${encodeURIComponent(ownerId)}/help`, value => {
    if (object(value).helped !== true) throw new Error('Invalid garden help result');
   }, 'POST', {slot, action}),
   visit: ownerId => request(`${friendsPath}/${encodeURIComponent(ownerId)}`, value => {
    const row = object(value);
    const backgroundId = typeof row.backgroundId === 'string' && isGardenBackgroundId(row.backgroundId)
      ? row.backgroundId : 'default';
    const coordinate = (value: unknown) => {
     if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error('Invalid garden coordinate');
     }
     return value;
    };
    return {
     name: string(row.name),
     backgroundId,
     animals: array(row.animals).map(item => {
      const animal = object(item);
      const level = integer(animal.level, 1);
      if (level > 3) throw new Error('Invalid animal stage');
      const slot = integer(animal.slot, 1);
      if (slot > 5) throw new Error('Invalid garden slot');
      return {slot, designId: designId(animal.designId), x: coordinate(animal.x), y: coordinate(animal.y),
       stage: (level - 1) as 0 | 1 | 2};
     }),
    } satisfies FriendGardenVisit;
   }),
  },
  loadGardenShop: () => request('/api/v1/companions/me/garden/decorations', parseGardenShop),
  purchaseGardenDecoration: (id, expectedPrice) => request(
    `/api/v1/companions/me/garden/decorations/${encodeURIComponent(id)}/purchase`,
    parseGardenShop, 'POST', {expectedPrice},
  ),
  async load(){
   if(mutation)throw new Error('거래 처리 중이에요.');const old=await pending();if(old){mutation=true;try{await execute(old);}finally{mutation=false;}}
   const snapshotRequests=Promise.all([
    request('/api/v1/companions/me/garden',parseGarden),daily.load(),
    request('/api/v1/points/me/attendance',parseAttendance),
    request(`/api/v1/campuses/${encodeURIComponent(campusId)}/missions/me?includePrayerTopic=true`,parsePeriods),
    request('/api/v1/companions/me/backgrounds',v=>array(v).flatMap(x=>{const r=object(x);if(typeof r.owned!=='boolean'||typeof r.backgroundId!=='string'||!isGardenBackgroundId(r.backgroundId))throw new Error('Invalid background');return r.owned?[r.backgroundId]:[];})),
    request('/api/v1/companions/draw-pools',v=>array(v).map(x=>{const r=object(x);const entries=array(r.entries).map(e=>{const p=object(e);return{designId:designId(p.designId),weight:integer(p.weight,1)};});const totalWeight=integer(r.totalWeight,1);if(entries.reduce((s,e)=>s+e.weight,0)!==totalWeight)throw new Error('Invalid weights');return{poolVersion:string(r.poolVersion),unitCost:integer(r.unitCost,1),totalWeight,entries};})),
    request('/api/v1/companions/sale-prices',v=>{const result={MIRACLE:1000000} as ServerSnapshot['prices'];for(const x of array(v)){const r=object(x);result[rarity(r.rarity)]=integer(r.unitPrice,1);}if(Object.keys(result).length!==6)throw new Error('Invalid prices');return result;}),
    request('/api/v1/companions/me/draws?page=0',v=>array(v).map(x=>{const r=object(x);return{result:parseOperation(r.result),createdAt:date(r.createdAt)};})),
    request('/api/v1/companions/catalog',v=>array(v).map(x=>designId(object(x).designId))),
   ]);
   const [snapshot,inventory,balance]=await Promise.all([
    snapshotRequests,
    loadInventory(),
    snapshotRequests.then(()=>request('/api/v1/points/me/wallet',v=>integer(object(v).balance))),
   ]);
   const [garden,dailyResult,attendance,periods,backgrounds,pools,prices,history,catalog]=snapshot;
   pool=pools[0]??null;
   return{balance,inventory,garden,daily:dailyResult,attendance,periods,backgrounds,pool,prices,history,catalog};
  },
  garden:(garden:Garden)=>request('/api/v1/companions/me/garden',parseGarden,'PUT',
      {...garden,placementProtocol:'INSTANCE_V1'}),
  async claim(id){
   if(id==='attendance'){const attendance=await request('/api/v1/points/me/attendance',parseAttendance,'POST');return{attendance,balance:attendance.balance};}
   if(isDailyMission(id)){const result=await daily.claim(id);const balance=await request('/api/v1/points/me/wallet',v=>integer(object(v).balance));return{daily:result,balance};}
   const code=PERIOD_MISSION_IDS[id as keyof typeof PERIOD_MISSION_IDS];if(!code)throw new Error('Invalid mission');
   const periods=await request(`/api/v1/campuses/${encodeURIComponent(campusId)}/missions/me/${code}/claims?includePrayerTopic=true`,parsePeriods,'POST');return{periods,balance:periods.balance};
  },
  draw:count=>{if(!pool)throw new Error('뽑기 정보를 새로 확인해주세요.');return mutate('draws',{poolVersion:pool.poolVersion,count});},
  sell:(designId,quantity)=>mutate('sales',{designId,quantity}),
  recordGardenVisit:async()=>{
   try{await request('/api/v1/companions/me/instances/visit',object,'POST');}
   catch(e){if(!(e instanceof FaithLogApiError)||e.detail.status!==404)throw e;}
  },
  wakeInstance:id=>request(`/api/v1/companions/me/instances/${encodeURIComponent(id)}/wake`,parseCompanionInstance,'POST'),
  careGifts:id=>request(`/api/v1/companions/me/instances/${encodeURIComponent(id)}/care-gifts`,parseCareGifts),
  claimCareGift:(id,milestone)=>request(
   `/api/v1/companions/me/instances/${encodeURIComponent(id)}/care-gifts/${encodeURIComponent(milestone)}/claim`,
   parseCareGifts,'POST'),
  growthShards:()=>request('/api/v1/companions/me/growth-shards',v=>integer(object(v).balance)),
  exchangeShard:(id,key)=>request('/api/v1/companions/me/growth-shards/exchanges',v=>{
   const result=object(v);
   return {balance:integer(result.balance),awarded:integer(result.awarded,1)};
  },'POST',{designId:id},key),
  boostWithShards:(id,expectedVersion,key)=>request(
   `/api/v1/companions/me/instances/${encodeURIComponent(id)}/growth-shard-boost`,
   parseCompanionInstance,'POST',{expectedVersion},key),
  saleAvailability:(selected)=>request(
     `/api/v1/companions/me/sales/availability?designId=${encodeURIComponent(selected)}`,
     v=>{const r=object(v);const design=designId(r.designId);
       const ownedQuantity=integer(r.ownedQuantity);
       const sellableQuantity=integer(r.sellableQuantity);
       if(design!==selected||sellableQuantity>Math.max(0,ownedQuantity-1))
         throw new Error('Invalid sale availability');
       return{designId:design,ownedQuantity,sellableQuantity} satisfies CompanionSaleAvailability;
     }),
  // Home renders at most five animals; never fetch the owner's full duplicate inventory.
  instances:()=>request('/api/v1/companions/me/instances/garden',v=>array(v).map(parseCompanionInstance)),
  instancesByDesign:(designId,page)=>request(`/api/v1/companions/me/instances/by-design?designId=${encodeURIComponent(designId)}&page=${page}&size=20`,v=>array(v).map(parseCompanionInstance)),
  careInstance:(id,action,expectedVersion,key)=>request(
   `/api/v1/companions/me/instances/${encodeURIComponent(id)}/care`,
   parseCompanionInstance,'POST',{action,expectedVersion},key),
  evolveInstance:(id,expectedVersion,key)=>request(
   `/api/v1/companions/me/instances/${encodeURIComponent(id)}/evolve`,
   parseCompanionInstance,'POST',{expectedVersion},key),
 };
}
