import {apiRequest} from '../api/client';
import {FaithLogApiError} from '../api/apiError';
import {createDailyMissionApi} from './dailyMissionApi';
import {isDailyMission} from './dailyMissionContract';
import {isGardenBackgroundId} from './gardenBackgrounds';
import {array,date,designId,integer,object,parseGarden,parseOperation,parsePeriods,PERIOD_MISSION_IDS,rarity,string,type CompanionServerApi,type Garden,type PendingOperation,type PendingStorage,type ServerSnapshot} from './companionServerContract';

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
 return {
  async load(){
   if(mutation)throw new Error('거래 처리 중이에요.');const old=await pending();if(old){mutation=true;try{await execute(old);}finally{mutation=false;}}
   const [garden,dailyResult,attendance,periods,backgrounds,pools,prices,history,catalog]=await Promise.all([
    request('/api/v1/companions/me/garden',parseGarden),daily.load(),
    request('/api/v1/points/me/attendance',v=>{const r=object(v);if(typeof r.claimed!=='boolean')throw new Error('Invalid attendance');return{date:date(r.date),points:integer(r.points,1),claimed:r.claimed,balance:integer(r.balance)};}),
    request(`/api/v1/campuses/${encodeURIComponent(campusId)}/missions/me`,parsePeriods),
    request('/api/v1/companions/me/backgrounds',v=>array(v).flatMap(x=>{const r=object(x);if(typeof r.owned!=='boolean'||typeof r.backgroundId!=='string'||!isGardenBackgroundId(r.backgroundId))throw new Error('Invalid background');return r.owned?[r.backgroundId]:[];})),
    request('/api/v1/companions/draw-pools',v=>array(v).map(x=>{const r=object(x);const entries=array(r.entries).map(e=>{const p=object(e);return{designId:designId(p.designId),weight:integer(p.weight,1)};});const totalWeight=integer(r.totalWeight,1);if(entries.reduce((s,e)=>s+e.weight,0)!==totalWeight)throw new Error('Invalid weights');return{poolVersion:string(r.poolVersion),unitCost:integer(r.unitCost,1),totalWeight,entries};})),
    request('/api/v1/companions/sale-prices',v=>{const result={} as ServerSnapshot['prices'];for(const x of array(v)){const r=object(x);result[rarity(r.rarity)]=integer(r.unitPrice,1);}if(Object.keys(result).length!==5)throw new Error('Invalid prices');return result;}),
    request('/api/v1/companions/me/draws?page=0',v=>array(v).map(x=>{const r=object(x);return{result:parseOperation(r.result),createdAt:date(r.createdAt)};})),
    request('/api/v1/companions/catalog',v=>array(v).map(x=>designId(object(x).designId))),
   ]);
   const inventory:ServerSnapshot['inventory']={};for(let page=0;page<100;page++){const result=await request(`/api/v1/companions/me/inventory?page=${page}&size=100`,v=>{const r=object(v);return{items:array(r.items).map(x=>{const d=object(x);return{id:designId(d.designId),quantity:integer(d.quantity,1)};}),total:integer(r.total)};});for(const item of result.items)inventory[item.id]=item.quantity;if((page+1)*100>=result.total)break;if(page===99)throw new Error('보유 목록이 너무 커요.');}
   const balance=await request('/api/v1/points/me/wallet',v=>integer(object(v).balance));pool=pools[0]??null;
   return{balance,inventory,garden,daily:dailyResult,attendance,periods,backgrounds,pool,prices,history,catalog};
  },
  garden:(garden:Garden)=>request('/api/v1/companions/me/garden',parseGarden,'PUT',garden),
  async claim(id){if(id==='attendance')await request('/api/v1/points/me/attendance',object,'POST');else if(isDailyMission(id))await daily.claim(id);else{const code=PERIOD_MISSION_IDS[id as keyof typeof PERIOD_MISSION_IDS];if(!code)throw new Error('Invalid mission');await request(`/api/v1/campuses/${encodeURIComponent(campusId)}/missions/me/${code}/claims`,parsePeriods,'POST');}},
  draw:count=>{if(!pool)throw new Error('뽑기 정보를 새로 확인해주세요.');return mutate('draws',{poolVersion:pool.poolVersion,count});},
  sell:(designId,quantity)=>mutate('sales',{designId,quantity}),
 };
}
