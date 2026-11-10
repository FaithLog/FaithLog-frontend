import {describe, expect, it} from 'vitest';
import {BIBLE_FRIEND_DESIGN_CATALOG} from '../characters/bibleFriendDesignCatalog';
import {companionReducer, createCompanionDemoState, getMissionPeriodKeys, getSellQuote, MISSIONS} from './companionModel';
import {drawTimings, getDrawFrame} from './companionDrawMotion';

describe('companion preview economy', () => {
  it('keeps agreed mission rewards at 100/200/500 and 100 points per draw', () => {
    for (const [period, total] of [['daily', 100], ['weekly', 200], ['monthly', 500]] as const) {
      expect(MISSIONS.filter(m => m.period === period).reduce((sum, m) => sum + m.points, 0)).toBe(total);
    }
    const state = createCompanionDemoState();
    const next = companionReducer(state, {type: 'draw', results: ['noah-bear:base'], transactionId: 'draw-1'});
    expect(next.points).toBe(state.points - 100);
    expect(next.inventory['noah-bear:base']).toBe(2);
    expect(companionReducer(next, {type: 'draw', results: ['noah-bear:base'], transactionId: 'draw-1'})).toBe(next);
  });
  it('atomically charges 1000 points for 10 results, including duplicates', () => {
    const state = createCompanionDemoState();
    const action = {type: 'draw', results: Array.from({length: 10}, () => 'noah-bear:base' as const), transactionId: 'draw-10'} as const;
    const next = companionReducer(state, action);
    expect(next.points).toBe(200);
    expect(next.inventory['noah-bear:base']).toBe(11);
    expect(companionReducer(next, {...action, transactionId: 'insufficient'})).toBe(next);
    expect(companionReducer(state, {...action, results: action.results.slice(0, 2)})).toBe(state);
  });
  it('claims each mission only once per period and never claims incomplete or settling missions', () => {
    const state = createCompanionDemoState();
    const action = {type: 'claim', missionId: 'attendance', periodKey: '2026-11-10', status: 'ready'} as const;
    const next = companionReducer(state, action);
    expect(next.points).toBe(state.points + 10);
    expect(companionReducer(next, action)).toBe(next);
    expect(companionReducer(next, {...action, status: 'incomplete', periodKey: 'next'})).toBe(next);
    expect(companionReducer(next, {...action, status: 'settling', periodKey: 'next'})).toBe(next);
    expect(companionReducer(next, {...action, periodKey: '2026-11-11'}).points).toBe(next.points + 10);
  });
  it('caps garden at five, rejects unowned designs and allows removing and replacing a friend', () => {
    const state = createCompanionDemoState();
    expect(companionReducer(state, {type: 'equip', designId: 'daniel-lion:unique'})).toBe(state);
    const freed = companionReducer(state, {type: 'equip', designId: 'david-lamb:base'});
    expect(freed.equipped).toHaveLength(4);
    expect(companionReducer(freed, {type: 'equip', designId: 'word-fox:unique'})).toBe(freed);
    expect(companionReducer(freed, {type: 'equip', designId: 'daniel-lion:unique'}).equipped).toHaveLength(5);
  });
  it('sells duplicates while preserving the equipped last copy and credits once per transaction', () => {
    const state = createCompanionDemoState();
    const action = {type: 'sell', designId: 'david-lamb:base', quantity: 2, transactionId: 'sale-1'} as const;
    const next = companionReducer(state, action);
    expect(next.inventory['david-lamb:base']).toBe(1);
    expect(next.equipped).toEqual(state.equipped);
    expect(next.points).toBe(state.points + 20);
    expect(companionReducer(next, action)).toBe(next);
    for (const quantity of [0, -1, 1.5, NaN, Infinity, 3, 100]) {
      expect(getSellQuote(state, 'david-lamb:base', quantity)).toBeNull();
      expect(companionReducer(state, {...action, quantity})).toBe(state);
    }
    expect(getSellQuote(state, 'daniel-lion:unique', 1)).toBeNull();
  });
  it('uses Korea midnight, Monday and month boundaries independent of host timezone', () => {
    expect(getMissionPeriodKeys(new Date('2026-11-01T14:59:59Z'))).toEqual({daily: '2026-11-01', weekly: '2026-10-26', monthly: '2026-11'});
    expect(getMissionPeriodKeys(new Date('2026-11-01T15:00:00Z'))).toEqual({daily: '2026-11-02', weekly: '2026-11-02', monthly: '2026-11'});
  });
});
describe('approved draw timeline', () => {
  it('replays every rarity and finishes without overrunning the result list', () => {
    for (const rarity of ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'UNIQUE'] as const) {
      const timings = drawTimings(rarity, false);
      expect(getDrawFrame([rarity], 0).phase).toBe('anticipation');
      expect(getDrawFrame([rarity], timings.anticipation).phase).toBe('gather');
      expect(getDrawFrame([rarity], timings.anticipation + timings.gather).phase).toBe('reveal');
      expect(getDrawFrame([rarity], timings.total)).toMatchObject({done: true, index: 0});
    }
    const rarities = BIBLE_FRIEND_DESIGN_CATALOG.slice(0, 10).map(d => d.rarity);
    const total = 1000 + rarities.reduce((sum, rarity) => sum + drawTimings(rarity, true).total, 0);
    expect(getDrawFrame(rarities, 0).phase).toBe('collection');
    expect(getDrawFrame(rarities, 1000).index).toBe(0);
    expect(getDrawFrame(rarities, total - 1)).toMatchObject({index: 9, done: false});
    expect(getDrawFrame(rarities, total + 10_000)).toMatchObject({index: 9, done: true});
  });
});
