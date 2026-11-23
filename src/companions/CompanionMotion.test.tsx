import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const native = vi.hoisted(() => ({
  reduce: false,
  appListener: undefined as undefined | ((value: string) => void),
  motionListener: undefined as undefined | ((value: boolean) => void),
  removals: 0,
}));
vi.mock('react-native', async () => {
  const {createElement} = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(name, props, children);
  return {Platform:{OS:'ios'}, PanResponder:{create:(config: Record<string, unknown>)=>({panHandlers:{onResponderGrant:config.onPanResponderGrant,onResponderMove:config.onPanResponderMove,onResponderRelease:config.onPanResponderRelease,onResponderTerminate:config.onPanResponderTerminate}})}, Image: host('Image'), View: host('View'), Text: host('Text'), Pressable: host('Pressable'), StyleSheet: {create: (s: unknown) => s},
    AppState: {currentState: 'active', addEventListener: (_key: string, cb: (v: string) => void) => {native.appListener = cb; return {remove: () => {native.removals++;}};}},
    AccessibilityInfo: {isReduceMotionEnabled: async () => native.reduce, addEventListener: (_key: string, cb: (v: boolean) => void) => {native.motionListener = cb; return {remove: () => {native.removals++;}};}}};
});
vi.mock('./GardenBackground', () => ({GardenBackground: () => React.createElement('GardenBackground')}));
vi.mock('react-native-svg', async () => {
  const {createElement} = await import('react');
  return Object.fromEntries(['default', 'Circle', 'Defs', 'Ellipse', 'G', 'LinearGradient', 'Path', 'RadialGradient', 'Rect', 'Stop'].map(name => [name, ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(`svg-${name}`, props, children)]));
});
vi.mock('../characters/BibleFriendDesignSprite', () => ({BibleFriendDesignSprite: (props: Record<string, unknown>) => React.createElement('Sprite', props)}));
vi.mock('../characters/BibleFriendFarmSprite', () => ({BibleFriendFarmSprite: (props: Record<string, unknown>) => React.createElement('FarmSprite', props)}));
vi.mock('./FarmHudAssets', () => ({
  FarmHudIcon:(props:Record<string,unknown>)=>React.createElement('FarmHudIcon',props),
  FarmHudGauge:(props:Record<string,unknown>)=>React.createElement('FarmHudGauge',props),
  FarmCareButton:(props:Record<string,unknown>)=>React.createElement('FarmCareButton',props),
}));
vi.mock('../components/ui', () => ({Button: (props: Record<string, unknown>) => React.createElement('Button', props), Chip: (props: Record<string, unknown>) => React.createElement('Chip', props)}));
import {BIBLE_FRIEND_DESIGN_CATALOG} from '../characters/bibleFriendDesignCatalog';
import {CompanionDrawScene} from './CompanionDrawScene';
import {CompanionGarden} from './CompanionGarden';
import {CompanionProvider,useCompanions} from './CompanionProvider';
import {useCompanionMotion} from './useCompanionMotion';
import {drawTimings} from './companionDrawMotion';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer | undefined;
beforeEach(() => {vi.useFakeTimers(); native.reduce = false; native.removals = 0;});
afterEach(async () => {if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.useRealTimers();});
async function advance(ms: number) {await act(async () => {vi.advanceTimersByTime(ms);});}
function Probe(){const {state,refresh}=useCompanions();return React.createElement('probe',{positions:state.gardenPositions,refresh});}
function Clock() {const {elapsed} = useCompanionMotion(true, 80); return React.createElement('clock', {elapsed});}
describe('companion motion lifecycle', () => {
  it('excludes background time and disposes timers and listeners on unmount', async () => {
    await act(async () => {tree = create(<Clock />);});
    await advance(160); expect(tree!.root.findByType('clock' as React.ElementType).props.elapsed).toBe(160);
    await act(async () => native.appListener?.('background'));
    expect(vi.getTimerCount()).toBe(0);
    await advance(30_000); expect(tree!.root.findByType('clock' as React.ElementType).props.elapsed).toBe(160);
    await act(async () => native.appListener?.('active'));
    await advance(80); expect(tree!.root.findByType('clock' as React.ElementType).props.elapsed).toBe(240);
    await act(async () => tree!.unmount()); tree = undefined;
    expect(vi.getTimerCount()).toBe(0); expect(native.removals).toBe(2);
  });
  it('finishes reduce-motion playback once without starting a timer', async () => {
    native.reduce = true; const complete = vi.fn();
    await act(async () => {tree = create(<CompanionDrawScene designs={[BIBLE_FRIEND_DESIGN_CATALOG[9]!]} onComplete={complete} />);});
    expect(complete).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('renders real costume sprites during the unique reveal and completes after landing', async () => {
    const complete = vi.fn();
    const design = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === 'hope-rabbit:unique')!;
    await act(async () => {tree = create(<CompanionDrawScene designs={[design]} onComplete={complete} />);});
    await advance(3000);
    expect(tree!.root.findByType('Sprite' as React.ElementType).props.designId).toBe('hope-rabbit:unique');
    await advance(1600); expect(complete).toHaveBeenCalledTimes(1);
    await advance(1000); expect(complete).toHaveBeenCalledTimes(1);
  });
  it('prepares the sprite before cracking and reveals it above the effects at a nonzero size', async () => {
    const design = BIBLE_FRIEND_DESIGN_CATALOG[0]!;
    await act(async () => {tree = create(<CompanionDrawScene designs={[design]} onComplete={vi.fn()} />);});
    const character = () => tree!.root.findAllByType('View' as React.ElementType).find(n => n.props.testID === 'draw-revealed-character')!;
    const sprite = tree!.root.findByType('Sprite' as React.ElementType);
    expect(character().props.style[1].opacity).toBe(0);
    expect(character().props.accessibilityElementsHidden).toBe(true);
    // Layout may briefly report zero when the page is being attached.
    const scene = tree!.root.findAllByType('View' as React.ElementType).find(n => n.props.onLayout)!;
    await act(async () => scene.props.onLayout({nativeEvent:{layout:{width:0}}}));
    const timings = drawTimings(design.rarity, false);
    await advance(timings.anticipation + timings.gather + timings.reveal * .75);
    expect(tree!.root.findByType('Sprite' as React.ElementType)).toBe(sprite);
    expect(character().props.style[0].zIndex).toBeGreaterThan(0);
    expect(character().props.style[1].opacity).toBe(1);
    expect(character().props.style[1].width).toBeGreaterThan(0);
    expect(character().props.accessibilityElementsHidden).toBe(false);
  });
  it('reveals every selected character in a ten-draw sequence', async () => {
    const designs = BIBLE_FRIEND_DESIGN_CATALOG.slice(0, 10);
    const complete = vi.fn();
    await act(async () => {tree = create(<CompanionDrawScene designs={designs} onComplete={complete} />);});
    await advance(1000);
    for (const design of designs) {
      const timings = drawTimings(design.rarity, true);
      await advance(timings.anticipation + timings.gather + Math.ceil(timings.reveal * .75 / 40) * 40);
      const sprite = tree!.root.findByType('Sprite' as React.ElementType);
      expect(sprite.props.designId).toBe(design.id);
      const character = tree!.root.findAllByType('View' as React.ElementType).find(n => n.props.testID === 'draw-revealed-character')!;
      expect(character.props.style[1].opacity).toBe(1);
      // Move to the next draw's anticipation using the same 40ms clock.
      await advance(Math.ceil(timings.total / 40) * 40 - (timings.anticipation + timings.gather + Math.ceil(timings.reveal * .75 / 40) * 40));
    }
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('renders five selected friends and applies a touch reaction', async () => {
    await act(async () => {tree = create(<CompanionProvider><CompanionGarden onOpen={vi.fn()} /></CompanionProvider>);});
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)).toHaveLength(5);
    await act(async () => tree!.root.findAllByType('Pressable' as React.ElementType)[0]!.props.onPress());
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)[0]!.props.motion).toBe('happy');
    await advance(900);
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)[0]!.props.motion).not.toBe('happy');
  });
  it('captures a drag, clamps it and releases scrolling without persisting the position',async()=>{
    const drag=vi.fn();
    await act(async()=>{tree=create(<CompanionProvider><CompanionGarden onOpen={vi.fn()} onDragStateChange={drag}/><Probe/></CompanionProvider>);});
    const animal=()=>tree!.root.findAllByType('View' as React.ElementType).find(n=>n.props.testID==='garden-animal-david-lamb:base')!;
    await act(async()=>animal().props.onResponderGrant());expect(drag).toHaveBeenLastCalledWith(true);
    await act(async()=>animal().props.onResponderMove({}, {dx:9999,dy:-9999}));
    expect(animal().props.style[1]).toMatchObject({left:236,top:0});
    await act(async()=>animal().props.onResponderRelease());expect(drag).toHaveBeenLastCalledWith(false);
    expect(animal().props.style[1]).toMatchObject({left:236,top:0});
    expect(tree!.root.findByType('probe' as React.ElementType).props.positions['david-lamb:base']).toBeUndefined();
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)[0]!.props.motion).toBe('land');
    await advance(1000);expect(tree!.root.findAllByType('Sprite' as React.ElementType)[0]!.props.motion).toBe('idle');
    await act(async()=>tree!.unmount());tree=undefined;expect(vi.getTimerCount()).toBe(0);
  });
  it('allows manual dragging with reduced motion and cancels a held state in the background',async()=>{
    native.reduce=true;const drag=vi.fn();
    await act(async()=>{tree=create(<CompanionProvider><CompanionGarden onOpen={vi.fn()} onDragStateChange={drag}/><Probe/></CompanionProvider>);});
    const animal=()=>tree!.root.findAllByType('View' as React.ElementType).find(n=>n.props.testID==='garden-animal-david-lamb:base')!;
    await act(async()=>animal().props.onResponderGrant());
    await act(async()=>animal().props.onResponderMove({}, {dx:9999,dy:9999}));
    await act(async()=>animal().props.onResponderRelease());
    expect(animal().props.style[1]).toMatchObject({left:236,top:144});
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)[0]!.props.motion).toBe('idle');
    await act(async()=>animal().props.onResponderGrant());
    await act(async()=>native.appListener?.('background'));expect(drag).toHaveBeenLastCalledWith(false);
  });

});

import type {CompanionServerApi, ServerSnapshot} from './companionServerContract';
function snapshot(balance=1000):ServerSnapshot{return{balance,inventory:{'david-lamb:base':2},garden:{version:0,backgroundId:null,placements:[]},daily:{recordDate:'2026-11-12',serverNow:'2026-11-12T00:00:00Z',totalAwardedPoints:900,missions:[{mission:'QUIET_TIME',status:'INCOMPLETE',points:30},{mission:'PRAYER',status:'READY',points:30},{mission:'BIBLE',status:'INCOMPLETE',points:30}]},attendance:{date:'2026-11-12',points:10,claimed:false,balance},periods:{serverNow:'2026-11-12T00:00:00Z',balance,missions:[]},backgrounds:[],pool:null,prices:{COMMON:10,UNCOMMON:15,RARE:25,EPIC:40,UNIQUE:50,MIRACLE:1000000},history:[],catalog:BIBLE_FRIEND_DESIGN_CATALOG.map(d=>d.id)};}

it('handles consecutive drags locally without API requests or resets from server refreshes', async () => {
  const data = snapshot();
  data.garden.placements = [{slot:1,designId:'david-lamb:base',x:0.2,y:0.2}];
  const api: CompanionServerApi = {
    load: vi.fn(async () => ({...data, garden:{...data.garden}})),
    garden: vi.fn(), claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
  };
  await act(async () => {tree=create(<CompanionProvider api={api}><CompanionGarden onOpen={vi.fn()}/><Probe/></CompanionProvider>);});
  const animal = () => tree!.root.findAllByType('View' as React.ElementType).find(n=>n.props.testID==='garden-animal-david-lamb:base')!;
  for (let i=0; i<5; i++) {
    const before = animal().props.style[1].left;
    await act(async () => animal().props.onResponderGrant());
    await act(async () => animal().props.onResponderMove({}, {dx:10,dy:5}));
    await act(async () => animal().props.onResponderRelease());
    expect(animal().props.style[1].left).toBeCloseTo(before+10);
  }
  expect(api.garden).not.toHaveBeenCalled();
  expect(api.load).toHaveBeenCalledTimes(1);
  await act(async () => animal().props.onResponderGrant());
  const position = {...animal().props.style[1]};
  data.garden.version++;
  await act(async () => tree!.root.findByType('probe' as React.ElementType).props.refresh());
  expect(animal().props.style[1]).toEqual(position);
  expect(tree!.root.findByType('Sprite' as React.ElementType).props.motion).toBe('held');
  await act(async () => animal().props.onResponderRelease());
  await advance(3000);
  // Explicit manual refresh already fetched a second snapshot. A quick
  // foreground switch must NOT fetch it a third time.
  expect(api.garden).not.toHaveBeenCalled();
  expect(api.load).toHaveBeenCalledTimes(2);
  await act(async()=>native.appListener?.('active'));
  expect(api.load).toHaveBeenCalledTimes(2);
  await advance(31_000);
  await act(async()=>native.appListener?.('active'));
  expect(api.load).toHaveBeenCalledTimes(3);
});


it('shows only server-backed care gauges and sends the chosen instance version', async () => {
  const data = snapshot();
  data.garden.placements = [{slot:1,designId:'david-lamb:base',x:0.2,y:0.2}];
  const selected = {
    instanceId:'12345678-1234-1234-1234-123456789abc',
    designId:'david-lamb:base' as const,
    level:2 as const,
    growthXp:740,totalEarnedXp:760,careDays:6,version:2,
    stats:{satiety:65,cleanliness:72,joy:81,affection:90,health:95},
    lastCaredAt:'2026-11-18T01:00:00Z',
    nextEvolution:{currentLevel:2 as const,nextLevel:3 as const,threshold:{
      growthXp:1000,distinctCareDays:10,health:70,satiety:60,cleanliness:60,
    },blockers:['EXPERIENCE' as const,'CARE_DAYS' as const]},
    canEvolve:false,
  };
  const response = {...selected,growthXp:755,totalEarnedXp:775,version:3};
  const api: CompanionServerApi = {
    load:vi.fn(async()=>data),garden:vi.fn(),claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
    instances:vi.fn(async()=>[selected]),
    careInstance:vi.fn(async()=>response),
    evolveInstance:vi.fn(),
  };
  const openPage=vi.fn();
  await act(async()=>{
    tree=create(<CompanionProvider api={api}><CompanionGarden onOpen={openPage}/></CompanionProvider>);
  });
  // A tap is only a greeting until the user selects the animal.
  expect(tree!.root.findAllByType('FarmHudGauge' as React.ElementType)).toHaveLength(0);
  const touch=tree!.root.findAllByType('Pressable' as React.ElementType)[0]!;
  await act(async()=>touch.props.onPress());
  expect(tree!.root.findAllByType('FarmHudGauge' as React.ElementType)).toHaveLength(5);
  expect(tree!.root.findByType('FarmSprite' as React.ElementType).props.evolutionStage).toBe(1);
  expect(tree!.root.findAllByType('View' as React.ElementType)
    .filter(node=>node.props.testID==='companion-growth-details')).toHaveLength(0);
  const reveal=tree!.root.findAllByType('Button' as React.ElementType)
    .find(node=>node.props.accessibilityLabel==='동물 성장 기록과 진화 조건 펼치기')!;
  await act(async()=>reveal.props.onPress());
  expect(tree!.root.findAllByType('FarmSprite' as React.ElementType)).toHaveLength(2);
  expect(tree!.root.findAllByType('View' as React.ElementType)
    .filter(node=>node.props.testID==='companion-growth-details')).toHaveLength(1);
  const missions=tree!.root.findAllByType('Button' as React.ElementType)
    .find(node=>node.props.accessibilityLabel==='성장 기록에서 경건 미션 보기')!;
  await act(async()=>missions.props.onPress());
  expect(openPage).toHaveBeenCalledWith('missions');
  const feed=tree!.root.findAllByType('FarmCareButton' as React.ElementType)
    .find(item=>item.props.action==='feed')!;
  await act(async()=>feed.props.onPress());
  expect(api.careInstance).toHaveBeenCalledWith(
    selected.instanceId,'FEED',2,expect.stringMatching(/^pet-care-/));
  expect(tree!.root.findAllByType('FarmHudGauge' as React.ElementType)[0]!.props.value)
    .toBe(response.stats.satiety);
});

it('shows a mess only for a server-confirmed low-cleanliness animal and removes it after CLEAN',async()=>{
  const data=snapshot();
  const id='12345678-1234-1234-1234-123456789abc';
  data.garden.placements=[{slot:1,designId:'david-lamb:base',x:.2,y:.2,instanceId:id}];
  const pet={
    instanceId:id,designId:'david-lamb:base' as const,level:1 as const,
    growthXp:0,totalEarnedXp:0,careDays:0,version:0,
    stats:{satiety:80,cleanliness:12,joy:100,affection:100,health:100},
    lastCaredAt:'2026-11-18T01:00:00Z',nextEvolution:null,canEvolve:false,
  };
  const after={...pet,growthXp:15,totalEarnedXp:15,careDays:1,version:1,
    stats:{...pet.stats,cleanliness:57}};
  const api:CompanionServerApi={
    load:vi.fn(async()=>data),garden:vi.fn(),claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
    instances:vi.fn(async()=>[pet]),careInstance:vi.fn(async()=>after),
  };
  await act(async()=>{tree=create(
    <CompanionProvider api={api}><CompanionGarden onOpen={vi.fn()}/></CompanionProvider>
  );});
  const cleaning=tree!.root.findAllByType('Pressable' as React.ElementType)
    .find(node=>String(node.props.accessibilityLabel??'').includes('주변 청소하기'));
  expect(cleaning).toBeDefined();
  expect(tree!.root.findAllByType('View' as React.ElementType)
    .filter(node=>node.props.testID==='companion-attention-banner')).toHaveLength(1);
  await act(async()=>cleaning!.props.onPress());
  expect(api.careInstance).toHaveBeenCalledWith(id,'CLEAN',0,expect.stringMatching(/^pet-care-/));
  expect(tree!.root.findAllByType('Pressable' as React.ElementType)
    .some(node=>String(node.props.accessibilityLabel??'').includes('주변 청소하기'))).toBe(false);
  expect(api.instances).toHaveBeenCalledTimes(1);
  expect(tree!.root.findAllByType('View' as React.ElementType)
    .filter(node=>node.props.testID==='companion-attention-banner')).toHaveLength(0);
});

it('does not show fabricated care stats when the backend has no instance API',async()=>{
  const data=snapshot();
  data.garden.placements=[{slot:1,designId:'david-lamb:base',x:0.2,y:0.2}];
  const api: CompanionServerApi={
    load:vi.fn(async()=>data),garden:vi.fn(),claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
  };
  await act(async()=>{
    tree=create(<CompanionProvider api={api}><CompanionGarden onOpen={vi.fn()}/></CompanionProvider>);
  });
  const touch=tree!.root.findAllByType('Pressable' as React.ElementType)[0]!;
  await act(async()=>touch.props.onPress());
  expect(tree!.root.findAllByType('FarmHudGauge' as React.ElementType)).toHaveLength(0);
  expect(tree!.root.findAllByType('Sprite' as React.ElementType)).toHaveLength(1);
});


function EquipProbe(){
  const {perform,instances}=useCompanions();
  return React.createElement('equipProbe',{perform,instances});
}

it('refreshes only five-pet data once after equipping, not on background-only updates',async()=>{
  const data=snapshot();
  data.inventory={'hope-rabbit:base':1};
  data.backgrounds=['meadow'];
  const pet={
    instanceId:'12345678-1234-1234-1234-123456789abc',
    designId:'hope-rabbit:base' as const,
    level:1 as const,growthXp:0,totalEarnedXp:0,careDays:0,version:0,
    stats:{satiety:100,cleanliness:100,joy:100,affection:100,health:100},
    lastCaredAt:'2026-11-18T01:00:00Z',
    nextEvolution:null,canEvolve:false,
  };
  const api:CompanionServerApi={
    load:vi.fn(async()=>({...data,garden:{...data.garden}})),
    garden:vi.fn(async garden=>{
      data.garden={...garden,version:garden.version+1};
      return data.garden;
    }),
    instances:vi.fn(async()=>data.garden.placements.length?[pet]:[]),
    claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
  };
  await act(async()=>{
    tree=create(<CompanionProvider api={api}>
      <CompanionGarden onOpen={vi.fn()}/><EquipProbe/>
    </CompanionProvider>);
  });
  expect(api.instances).toHaveBeenCalledTimes(1);
  const probe=()=>tree!.root.findByType('equipProbe' as React.ElementType);
  await act(async()=>{await probe().props.perform({type:'equip',designId:'hope-rabbit:base'});});
  await advance(900);
  expect(api.garden).toHaveBeenCalledTimes(1);
  expect(api.instances).toHaveBeenCalledTimes(2);
  expect(api.load).toHaveBeenCalledTimes(1);
  expect(probe().props.instances).toHaveLength(1);
  // The pet exists in the scene, independently of the exact localized label.
  expect(tree!.root.findAllByType('View' as React.ElementType).some(
    n=>n.props.testID==='garden-animal-hope-rabbit:base')).toBe(true);

  await act(async()=>{await probe().props.perform({type:'background',backgroundId:'meadow'});});
  await advance(900);
  expect(api.garden).toHaveBeenCalledTimes(2);
  expect(api.instances).toHaveBeenCalledTimes(2);
  expect(api.load).toHaveBeenCalledTimes(1);
});

it('refreshes equipped instances once after an in-flight equip save is followed by a background save',async()=>{
  const data=snapshot();
  data.inventory={'hope-rabbit:base':1};
  data.backgrounds=['meadow'];
  const pet={
    instanceId:'12345678-1234-1234-1234-123456789abc',
    designId:'hope-rabbit:base' as const,
    level:1 as const,growthXp:0,totalEarnedXp:0,careDays:0,version:0,
    stats:{satiety:100,cleanliness:100,joy:100,affection:100,health:100},
    lastCaredAt:'2026-11-18T01:00:00Z',
    nextEvolution:null,canEvolve:false,
  };
  let finishFirstSave: (() => void) | undefined;
  const firstSave = new Promise<void>(resolve => {finishFirstSave = resolve;});
  const api:CompanionServerApi={
    load:vi.fn(async()=>({...data,garden:{...data.garden}})),
    garden:vi.fn(async garden=>{
      if (garden.version === 0) await firstSave;
      data.garden={...garden,version:garden.version+1};
      return data.garden;
    }),
    instances:vi.fn(async()=>data.garden.placements.length?[pet]:[]),
    claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
  };
  await act(async()=>{
    tree=create(<CompanionProvider api={api}>
      <CompanionGarden onOpen={vi.fn()}/><EquipProbe/>
    </CompanionProvider>);
  });
  expect(api.instances).toHaveBeenCalledTimes(1);
  const probe=()=>tree!.root.findByType('equipProbe' as React.ElementType);
  await act(async()=>{await probe().props.perform({type:'equip',designId:'hope-rabbit:base'});});
  await advance(900);
  expect(api.garden).toHaveBeenCalledTimes(1);
  expect(api.instances).toHaveBeenCalledTimes(1);
  await act(async()=>{await probe().props.perform({type:'background',backgroundId:'meadow'});});
  await act(async()=>{finishFirstSave?.();});
  expect(api.instances).toHaveBeenCalledTimes(1);
  await advance(900);
  expect(api.garden).toHaveBeenCalledTimes(2);
  expect(api.instances).toHaveBeenCalledTimes(2);
  expect(api.load).toHaveBeenCalledTimes(1);
  expect(probe().props.instances).toEqual([pet]);
});


it('separates two same-design pets by UUID for movement, care and evolution HUD', async()=>{
  const data=snapshot();
  const idA='12345678-1234-1234-1234-123456789abc';
  const idB='12345678-1234-1234-1234-123456789abd';
  data.inventory={'david-lamb:base':2};
  data.garden.placements=[
    {slot:1,designId:'david-lamb:base',x:.2,y:.2,instanceId:idA},
    {slot:2,designId:'david-lamb:base',x:.7,y:.7,instanceId:idB},
  ];
  const base={
    designId:'david-lamb:base' as const,
    totalEarnedXp:1000,careDays:11,
    stats:{satiety:80,cleanliness:90,joy:95,affection:70,health:100},
    lastCaredAt:'2026-11-18T01:00:00Z',version:0,
    nextEvolution:null,canEvolve:false,
  };
  const api:CompanionServerApi={
    load:vi.fn(async()=>data),garden:vi.fn(),claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
    instances:vi.fn(async()=>[
      {...base,instanceId:idA,level:1 as const,growthXp:100,totalEarnedXp:100},
      {...base,instanceId:idB,level:3 as const,growthXp:1000},
    ]),
    careInstance:vi.fn(),
  };
  await act(async()=>{
    tree=create(<CompanionProvider api={api}><CompanionGarden onOpen={vi.fn()}/></CompanionProvider>);
  });
  const scenes=tree!.root.findAllByType('View' as React.ElementType)
    .filter(node=>String(node.props.testID??'').startsWith('garden-animal-'));
  expect(scenes.map(x=>x.props.testID)).toEqual(['garden-animal-'+idA,'garden-animal-'+idB]);
  expect(tree!.root.findAllByType('FarmSprite' as React.ElementType)).toHaveLength(1);
  const touches=tree!.root.findAllByType('Pressable' as React.ElementType);
  await act(async()=>touches[1]?.props.onPress());
  expect(tree!.root.findAllByType('FarmHudGauge' as React.ElementType)).toHaveLength(5);
  const label=tree!.root.findAllByType('Text' as React.ElementType)
    .map(n=>n.props.children).flat().filter(Boolean).map(String).join(' ');
  expect(label).toMatch(/1,000\s+XP/);
  await act(async()=>touches[0]?.props.onPress());
  const updatedLabel=tree!.root.findAllByType('Text' as React.ElementType)
    .map(n=>n.props.children).flat().filter(Boolean).map(String).join(' ');
  expect(updatedLabel).toMatch(/100\s+XP/);
  expect(api.garden).not.toHaveBeenCalled();
});


it('plays successful care and sleep/wake only on the matching garden UUID without extra reads',async()=>{
 const a='12345678-1234-1234-1234-123456789abc';
 const b='12345678-1234-1234-1234-123456789abd';
 const data=snapshot();
 data.garden.placements=[
  {slot:1,designId:'david-lamb:base',x:.2,y:.2,instanceId:a},
  {slot:2,designId:'david-lamb:base',x:.7,y:.7,instanceId:b},
 ];
 const first={
  instanceId:a,designId:'david-lamb:base' as const,level:2 as const,
  growthXp:500,totalEarnedXp:500,careDays:5,version:0,
  stats:{satiety:85,cleanliness:90,joy:90,affection:90,health:100},
  lastCaredAt:'2026-11-18T01:00:00Z',nextEvolution:null,canEvolve:false,
 };
 let updated={...first};
 const second={...first,instanceId:b};
 const api:CompanionServerApi={
  load:vi.fn(async()=>data),garden:vi.fn(),claim:vi.fn(),draw:vi.fn(),sell:vi.fn(),
  instances:vi.fn(async()=>[first,second]),
  careInstance:vi.fn(async (_id,_action,version)=>{
   updated={...updated,version:version+1};
   return updated;
  }),
 };
 const renderGarden=(visible:boolean, key='account-one')=>(
  <CompanionProvider api={api} key={key}>
   {visible?<CompanionGarden onOpen={vi.fn()}/>:null}
  </CompanionProvider>
 );
 await act(async()=>{tree=create(renderGarden(true));});
 const sprite=(id:string)=>tree!.root.findAllByType('View' as React.ElementType)
  .find(n=>n.props.testID===`garden-animal-${id}`)!
  .findByType('FarmSprite' as React.ElementType);
 const animal=tree!.root.findAllByType('View' as React.ElementType)
  .find(n=>n.props.testID===`garden-animal-${a}`)!;
 await act(async()=>animal.findByType('Pressable' as React.ElementType).props.onPress());
 const button=(action:string)=>tree!.root.findAllByType('FarmCareButton' as React.ElementType)
  .find(n=>n.props.action===action)!;
 await act(async()=>button('feed').props.onPress());
 expect(sprite(a).props.farmAction).toBe('feed');
 expect(sprite(b).props.farmAction).toBeUndefined();
 await advance(1200);
 expect(sprite(a).props.farmAction).toBeUndefined();
 await act(async()=>button('sleep').props.onPress());
 expect(sprite(a).props.farmAction).toBe('sleep');
 await advance(2640);
 expect(sprite(a).props.farmAction).toBe('wake');
 await advance(800);
 expect(sprite(a).props.farmAction).toBeUndefined();
 expect(api.instances).toHaveBeenCalledTimes(1);
 expect(api.load).toHaveBeenCalledTimes(1);
 expect(api.careInstance).toHaveBeenCalledTimes(2);
 const appearanceButton=(label:string)=>tree!.root.findAllByType('Button' as React.ElementType)
  .find(n=>n.props.children===label)!;
 await act(async()=>appearanceButton('기본 외형으로 보기').props.onPress());
 expect(animal.findByType('Sprite' as React.ElementType).props.designId).toBe('david-lamb:base');
 expect(sprite(b).props.evolutionStage).toBe(1);
 await act(async()=>appearanceButton('진화 외형으로 보기').props.onPress());
 expect(sprite(a).props.evolutionStage).toBe(1);
 expect(api.instances).toHaveBeenCalledTimes(1);
 await act(async()=>appearanceButton('기본 외형으로 보기').props.onPress());
 await act(async()=>tree!.update(renderGarden(false)));
 await act(async()=>tree!.update(renderGarden(true)));
 const reopenedAnimal=tree!.root.findAllByType('View' as React.ElementType)
  .find(n=>n.props.testID===`garden-animal-${a}`)!;
 expect(reopenedAnimal.findByType('Sprite' as React.ElementType).props.designId).toBe('david-lamb:base');
 expect(sprite(b).props.evolutionStage).toBe(1);
 expect(api.instances).toHaveBeenCalledTimes(1);
 expect(api.garden).not.toHaveBeenCalled();
 await act(async()=>tree!.update(renderGarden(true,'account-two')));
 expect(sprite(a).props.evolutionStage).toBe(1);
});
