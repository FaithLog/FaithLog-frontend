import {describe,expect,it} from 'vitest';
import {advanceGardenAgent,constrainGardenPoint,createGardenAgent,normalizeGardenPoint,reactGardenAgent,releaseGardenAgent,restoreGardenPoint} from './gardenMotion';
import {companionReducer,createCompanionDemoState} from './companionModel';
const bounds={width:300,height:144};
describe('free roaming and drag geometry',()=>{
  it('chooses independent destinations and walks in both axes instead of fixed lanes',()=>{
    const initial=createGardenAgent({x:30,y:10},0,bounds,()=>.5);
    const walking=advanceGardenAgent(initial,3000,40,bounds,[],()=>.9);
    expect(walking.motion).toBe('walk');
    const next=advanceGardenAgent(walking,3040,40,bounds,[],()=>.1);
    expect(next.position.x).toBeGreaterThan(30);expect(next.position.y).toBeGreaterThan(10);
    expect(Math.hypot(next.position.x-30,next.position.y-10)).toBeLessThan(2);
  });
  it('keeps every position inside narrow and resized scenes, even on a delayed frame',()=>{
    let agent=createGardenAgent({x:999,y:-99},0,bounds,()=>.5);
    for(let i=1;i<500;i++){
      const box=i>250?{width:88,height:75}:bounds;
      agent=advanceGardenAgent(agent,i*80,5000,box,[],()=>.4);
      expect(agent.position.x).toBeGreaterThanOrEqual(0);expect(agent.position.y).toBeGreaterThanOrEqual(0);
      expect(agent.position.x).toBeLessThanOrEqual(box.width-64);expect(agent.position.y).toBeLessThanOrEqual(box.height-64);
    }
    expect(constrainGardenPoint({x:NaN,y:Infinity},{width:40,height:40})).toEqual({x:0,y:0});
  });
  it('yields instead of walking into a nearby friend',()=>{
    const initial={...createGardenAgent({x:50,y:40},0,bounds),target:{x:200,y:40},motion:'walk' as const,decisionAt:7000};
    const next=advanceGardenAgent(initial,100,120,bounds,[{x:89,y:40}],()=>.5);
    expect(next.position).toEqual(initial.position);expect(next.motion).toBe('idle');
  });
  it('holds the dragged animal still, lands on release and pauses before roaming again',()=>{
    const initial=createGardenAgent({x:80,y:30},0,bounds,()=>.5);
    const held={...initial,motion:'held' as const};
    expect(advanceGardenAgent(held,3000,80,bounds,[]).position).toEqual(held.position);
    const dropped=releaseGardenAgent(held,3000,false);
    expect(dropped.motion).toBe('land');
    expect(advanceGardenAgent(dropped,3200,80,bounds,[]).motion).toBe('land');
    expect(advanceGardenAgent(dropped,4000,80,bounds,[]).motion).toBe('idle');
    expect(advanceGardenAgent(dropped,5000,80,bounds,[]).motion).toBe('walk');
    expect(reactGardenAgent(initial,100,true).motion).toBe('idle');
  });
  it('restores dropped positions proportionally when the scene size changes',()=>{
    const relative=normalizeGardenPoint({x:118,y:40},bounds);
    expect(relative).toEqual({x:.5,y:.5});
    expect(restoreGardenPoint(relative,{width:400,height:200})).toEqual({x:168,y:68});
  });
  it('remembers only equipped animal placements and rejects invalid positions',()=>{
    const initial=createCompanionDemoState();
    const moved=companionReducer(initial,{type:'move',designId:'david-lamb:base',position:{x:1.5,y:-1}});
    expect(moved.gardenPositions['david-lamb:base']).toEqual({x:1,y:0});
    expect(moved.points).toBe(initial.points);expect(moved.inventory).toBe(initial.inventory);
    expect(companionReducer(initial,{type:'move',designId:'daniel-lion:unique',position:{x:.5,y:.5}})).toBe(initial);
    expect(companionReducer(initial,{type:'move',designId:'david-lamb:base',position:{x:NaN,y:.5}})).toBe(initial);
  });
});
