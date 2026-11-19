import {describe, expect, it} from 'vitest';
import type {CompanionInstance} from './companionServerContract';
import {resolveFarmSpriteVisual, type RunningFarmAnimation} from './companionFarmVisual';

const pet:CompanionInstance={
 instanceId:'12345678-1234-1234-1234-123456789abc', designId:'david-lamb:base',
 level:2,growthXp:500,totalEarnedXp:500,careDays:5,version:1,
 stats:{satiety:80,cleanliness:80,joy:90,affection:85,health:100},
 lastCaredAt:'2026-11-18T00:00:00Z',nextEvolution:null,canEvolve:false,
};
const event=(action:RunningFarmAnimation['action']):RunningFarmAnimation=>({
 instanceId:pet.instanceId,action,sequence:1,startedAt:400,
});

describe('farm runtime animation selection',()=>{
 it('plays only the confirmed UUID and returns to idle after a finite action',()=>{
  expect(resolveFarmSpriteVisual(pet,event('FEED'),400)).toMatchObject({action:'feed',elapsedMs:0,pauseMovement:true});
  expect(resolveFarmSpriteVisual(pet,event('FEED'),1190).action).toBe('feed');
  expect(resolveFarmSpriteVisual(pet,event('FEED'),2200).action).toBeUndefined();
  expect(resolveFarmSpriteVisual({...pet,instanceId:'other'},event('FEED'),500).action).toBeUndefined();
 });
 it('loops sleep briefly and plays wake before resuming normal movement',()=>{
  expect(resolveFarmSpriteVisual(pet,event('SLEEP'),400).action).toBe('sleep');
  expect(resolveFarmSpriteVisual(pet,event('SLEEP'),2800).action).toBe('sleep');
  expect(resolveFarmSpriteVisual(pet,event('SLEEP'),3000)).toMatchObject({action:'wake',elapsedMs:0,pauseMovement:true});
  expect(resolveFarmSpriteVisual(pet,event('SLEEP'),3760).action).toBeUndefined();
 });
 it('uses evolution motion only after a confirmed evolution event',()=>{
  expect(resolveFarmSpriteVisual(pet,event('EVOLVE'),500).action).toBe('evolve');
  expect(resolveFarmSpriteVisual(pet,event('EVOLVE'),2100).action).toBeUndefined();
 });
 it('uses server-backed passive priority of faint, sick, hungry and dirty',()=>{
  const low={...pet,stats:{satiety:5,cleanliness:5,joy:5,affection:5,health:0}};
  expect(resolveFarmSpriteVisual(low,null,2000)).toMatchObject({action:'faint',pauseMovement:true});
  expect(resolveFarmSpriteVisual({...low,stats:{...low.stats,health:12}},null,2000).action).toBe('sick');
  expect(resolveFarmSpriteVisual({...low,stats:{...low.stats,health:90}},null,2000)).toMatchObject({action:'hungry',pauseMovement:false});
  expect(resolveFarmSpriteVisual({...low,stats:{...low.stats,health:90,satiety:70}},null,2000).action).toBe('dirty');
  expect(resolveFarmSpriteVisual(pet,null,2000).action).toBeUndefined();
 });
 it('prefers a just-confirmed action over a passive warning, and never invents missing stats',()=>{
  const hungry={...pet,stats:{...pet.stats,satiety:3}};
  expect(resolveFarmSpriteVisual(hungry,event('PLAY'),450).action).toBe('play');
  expect(resolveFarmSpriteVisual(hungry,event('PLAY'),2200).action).toBe('hungry');
  expect(resolveFarmSpriteVisual(undefined,event('FEED'),450).action).toBeUndefined();
 });
 it('keeps Jesus Miracle original art and ignores invalid clock values',()=>{
  expect(resolveFarmSpriteVisual({...pet,designId:'jesus:miracle'},event('FEED'),450).action).toBeUndefined();
  expect(resolveFarmSpriteVisual(pet,event('FEED'),Number.NaN).action).toBeUndefined();
 });
});
