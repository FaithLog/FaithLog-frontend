import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';

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


import {CompanionProvider,useCompanions} from './CompanionProvider';
import type {CompanionServerApi,ServerSnapshot} from './companionServerContract';
import {BIBLE_FRIEND_DESIGN_CATALOG} from '../characters/bibleFriendDesignCatalog';
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let current:ReturnType<typeof useCompanions>;let tree:ReactTestRenderer|undefined;
function Probe(){current=useCompanions();return null;}
function snapshot(balance=1000):ServerSnapshot{return{balance,inventory:{'david-lamb:base':2},garden:{version:0,backgroundId:null,placements:[]},daily:{recordDate:'2026-11-12',serverNow:'2026-11-12T00:00:00Z',totalAwardedPoints:900,missions:[{mission:'QUIET_TIME',status:'INCOMPLETE',points:30},{mission:'PRAYER',status:'READY',points:30},{mission:'BIBLE',status:'INCOMPLETE',points:30}]},attendance:{date:'2026-11-12',points:10,claimed:false,balance},periods:{serverNow:'2026-11-12T00:00:00Z',balance,missions:[]},backgrounds:[],pool:null,prices:{COMMON:10,UNCOMMON:15,RARE:25,EPIC:40,UNIQUE:50},history:[],catalog:BIBLE_FRIEND_DESIGN_CATALOG.map(d=>d.id)};}
function apiFor(s:ServerSnapshot):CompanionServerApi{return{load:vi.fn(async()=>s),garden:vi.fn(async g=>g),claim:vi.fn(async()=>{}),draw:vi.fn(),sell:vi.fn()};}
async function mount(api:CompanionServerApi,key='account'){await act(async()=>{tree=create(<CompanionProvider api={api} key={key}><Probe /></CompanionProvider>);});}
afterEach(async()=>{if(tree)await act(async()=>tree!.unmount());tree=undefined;vi.restoreAllMocks();});
describe('server companion state ownership',()=>{
 it('uses wallet balance without adding campus reward totals or demo inventory',async()=>{await mount(apiFor(snapshot(7)));expect(current.state.points).toBe(7);expect(current.state.inventory).toEqual({'david-lamb:base':2});expect(current.state.equipped).toEqual([]);expect(current.state.backgroundId).toBe('default');});
 it('never credits a failed reward locally and recovers only from a fresh server snapshot',async()=>{const s=snapshot(7);const api=apiFor(s);api.claim=vi.fn(async()=>{throw new Error('offline');});await mount(api);await act(async()=>{expect(await current.perform!({type:'claim',missionId:'prayer',periodKey:'server',status:'ready'})).toBe(false);});expect(current.state.points).toBe(7);expect(current.error).not.toBe('');s.balance=37;await act(async()=>current.refresh());expect(current.state.points).toBe(37);expect(current.error).toBe('');});
 it('serializes repeated taps and waits for server garden state before applying',async()=>{const s=snapshot();const api=apiFor(s);let release!:()=>void;api.garden=vi.fn(async g=>{await new Promise<void>(r=>{release=r;});s.garden={...g,version:1};return s.garden;});await mount(api);let first!:Promise<boolean>;await act(async()=>{first=current.perform!({type:'equip',designId:'david-lamb:base'});await Promise.resolve();expect(await current.perform!({type:'equip',designId:'david-lamb:base'})).toBe(false);});expect(current.state.equipped).toEqual([]);await act(async()=>{release();await first;});expect(api.garden).toHaveBeenCalledTimes(1);expect(current.state.equipped).toEqual(['david-lamb:base']);});
 it('ignores an old account response after the provider is replaced',async()=>{let resolve!:(s:ServerSnapshot)=>void;const slow=apiFor(snapshot());slow.load=vi.fn(()=>new Promise<ServerSnapshot>(r=>{resolve=r;}));await mount(slow,'old');await act(async()=>tree!.unmount());tree=undefined;const s=snapshot(0);s.inventory={};await mount(apiFor(s),'new');await act(async()=>resolve(snapshot(9999)));expect(current.state.points).toBe(0);expect(current.state.inventory).toEqual({});});
});
