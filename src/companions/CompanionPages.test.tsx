import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const {createElement} = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(name, props, children);
  return {ScrollView: host('ScrollView'), View: host('View'), Text: host('Text'), Pressable: host('Pressable'), StyleSheet: {create: (s: unknown) => s, absoluteFill: {}},
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

import type {DailyMissionApi, DailyMissionSnapshot} from './dailyMissionContract';
import {getMissionPeriodKeys} from './companionModel';
import {CompanionProvider} from './CompanionProvider';
import {CompanionPages} from './CompanionPages';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer | undefined;
afterEach(async () => {if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.restoreAllMocks();});
async function render(page: 'manage' | 'missions' | 'draw', onActivity = vi.fn(), dailyApi?: DailyMissionApi) {
  await act(async () => {tree = create(<CompanionProvider {...(dailyApi ? {dailyApi} : {})}><CompanionPages initialPage={page} onBack={vi.fn()} onActivity={onActivity} /></CompanionProvider>);});
  return tree!;
}
function button(label: string) {return tree!.root.findAllByType('Button' as React.ElementType).find(n => n.props.accessibilityLabel === label)!;}
async function press(label: string) {const target = button(label); expect(target).toBeDefined(); expect(target.props.disabled).not.toBe(true); await act(async () => target.props.onPress());}
function text() {return JSON.stringify(tree!.toJSON()) + tree!.root.findAllByType('Text' as React.ElementType).map(node => node.children.filter(child => typeof child === 'string').join('')).join('\n');}
describe('companion page flows', () => {
  it('only enables daily rewards after server confirms calendar save and credits confirmed claims once', async () => {
    let snapshot: DailyMissionSnapshot = {recordDate:getMissionPeriodKeys(new Date()).daily,serverNow:new Date().toISOString(),totalAwardedPoints:0,missions:[{mission:'QUIET_TIME',status:'INCOMPLETE',points:30},{mission:'PRAYER',status:'INCOMPLETE',points:30},{mission:'BIBLE',status:'INCOMPLETE',points:30}]};
    const api: DailyMissionApi = {load:vi.fn(async () => snapshot),claim:vi.fn(async () => ({...snapshot,totalAwardedPoints:30,missions:snapshot.missions.map(item => item.mission === 'PRAYER' ? {...item,status:'CLAIMED' as const} : item)}))};
    await render('missions',vi.fn(),api);
    expect(button('기도 하러 가기')).toBeDefined();
    expect(button('기도 보상 받기')).toBeUndefined();
    snapshot={...snapshot,missions:snapshot.missions.map(item => item.mission === 'PRAYER' ? {...item,status:'READY'} : item)};
    await press('일간 미션 저장 기록 새로 확인');
    const target=button('기도 보상 받기');
    await act(async () => {target.props.onPress();target.props.onPress();});
    expect(api.claim).toHaveBeenCalledTimes(1);
    expect(api.claim).toHaveBeenCalledWith('prayer');
    expect(text()).toContain('1,230');
    expect(button('기도 수령 완료').props.disabled).toBe(true);
  });
  it('opens the server mission date even when it differs from the device clock', async () => {
    const snapshot: DailyMissionSnapshot = {recordDate:'2026-02-01',serverNow:'2026-02-01T00:00:00Z',totalAwardedPoints:0,missions:[{mission:'QUIET_TIME',status:'INCOMPLETE',points:30},{mission:'PRAYER',status:'INCOMPLETE',points:30},{mission:'BIBLE',status:'INCOMPLETE',points:30}]};
    const activity=vi.fn();
    await render('missions',activity,{load:async () => snapshot,claim:vi.fn()});
    await press('큐티 하러 가기');
    expect(activity).toHaveBeenCalledWith('calendar','2026-02-01');
  });
  it('does not award points when a calendar reward claim fails', async () => {
    const snapshot: DailyMissionSnapshot = {recordDate:getMissionPeriodKeys(new Date()).daily,serverNow:new Date().toISOString(),totalAwardedPoints:0,missions:[{mission:'QUIET_TIME',status:'READY',points:30},{mission:'PRAYER',status:'INCOMPLETE',points:30},{mission:'BIBLE',status:'INCOMPLETE',points:30}]};
    const api={load:vi.fn(async () => snapshot),claim:vi.fn(async () => {throw new Error('network');})};
    await render('missions',vi.fn(),api);
    await press('큐티 보상 받기');
    expect(text()).toContain('1,200');
    expect(button('큐티 보상 받기')).toBeUndefined();
    expect(text()).toContain('보상 수령을 확인하지 못했어요');
  });

  it('searches costumes by species and restores results after clearing a query', async () => {
    await render('manage');
    const search = () => tree!.root.findByType('TextField' as React.ElementType);
    await act(async () => search().props.onChangeText('사자'));
    const cards = () => tree!.root.findAllByType('Pressable' as React.ElementType).filter(node => node.props.accessibilityLabel?.includes('상세 보기'));
    expect(cards()).toHaveLength(1);
    expect(cards()[0]!.props.accessibilityLabel).toContain('새벽의 수호자');
    await act(async () => search().props.onChangeText('없는친구'));
    expect(cards()).toHaveLength(0);
    expect(text()).toContain('조건에 맞는 친구가 없어요');
    await press('동물 검색과 등급 필터 초기화');
    expect(cards()).toHaveLength(7);
  });

  it('collects all ready rewards once and leaves incomplete missions untouched', async () => {
    await render('missions');
    const collect = button('완료한 미션 보상 모두 받기');
    await act(async () => {collect.props.onPress(); collect.props.onPress();});
    expect(text()).toContain('1,210');
    expect(button('출석 수령 완료').props.disabled).toBe(true);
    expect(button('큐티 하러 가기')).toBeDefined();
    expect(button('말씀 읽기 하러 가기')).toBeDefined();
    expect(button('완료한 미션 보상 모두 받기').props.disabled).toBe(true);
    expect(button('기도 하러 가기').props.disabled).not.toBe(true);
  });

  it('collects a ready reward once, keeps the wallet between pages and opens existing activity routes', async () => {
    const activity = vi.fn();
    await render('missions', activity);
    await press('출석 보상 받기');
    expect(text()).toContain('1,210');
    expect(button('출석 수령 완료').props.disabled).toBe(true);
    await press('기도 하러 가기'); expect(activity).toHaveBeenCalledWith('calendar',expect.any(String));
    await press('뽑기 화면 이동'); expect(text()).toContain('1,210');
    await press('미션 화면 이동'); expect(button('출석 수령 완료').props.disabled).toBe(true);
    await press('월간 미션 보기');
    expect(button('월간 벌금 없음 보상 받기').props.disabled).toBe(true);
  });
  it('shows ten full results after skipping and only charges once on a repeated press', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await render('draw');
    const drawButton = button('10개 뽑기 1000포인트');
    await act(async () => {drawButton.props.onPress(); drawButton.props.onPress();});
    expect(text()).toContain('200');
    const scene = tree!.root.findByType('DrawScene' as React.ElementType);
    expect(scene.props.designs).toHaveLength(10);
    await act(async () => scene.props.onComplete());
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)).toHaveLength(10);
    expect(text()).toContain('총 13마리 보유');
    expect(button('10개 뽑기 1000포인트').props.disabled).toBe(true);
  });
  it('allows a new draw after navigating away and back without reusing transaction IDs', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await render('draw');
    await press('1개 뽑기 100포인트');
    await act(async () => tree!.root.findByType('DrawScene' as React.ElementType).props.onComplete());
    await press('동물 관리 화면 이동');
    await press('뽑기 화면 이동');
    await press('1개 뽑기 100포인트');
    await act(async () => tree!.root.findByType('DrawScene' as React.ElementType).props.onComplete());
    expect(text()).toContain('1,000');
    expect(text()).toContain('총 5마리 보유');
  });
  it('requires sale confirmation, supports cancellation and preserves one equipped copy', async () => {
    await render('manage');
    const select = tree!.root.findAllByType('Pressable' as React.ElementType).find(n => n.props.accessibilityLabel?.startsWith('다윗의 양 · 기본, 3마리'))!;
    await act(async () => select.props.onPress());
    await press('판매 수량 늘리기');
    await press('중복 동물 판매 확인');
    let confirm = tree!.root.findByType('ConfirmSheet' as React.ElementType);
    await act(async () => confirm.props.onCancel()); expect(text()).toContain('1,200');
    await press('중복 동물 판매 확인');
    confirm = tree!.root.findByType('ConfirmSheet' as React.ElementType);
    await act(async () => {confirm.props.onConfirm(); confirm.props.onConfirm();});
    expect(text()).toContain('1,220');
    expect(button('중복 동물 판매 확인').props.disabled).toBe(true);
    expect(button('정원에서 빼기').props.disabled).toBe(false);
  });
  it('keeps equipped friends first and filters undeployed friends without unequipping on detail press', async () => {
    await render('manage');
    const cards = () => tree!.root.findAllByType('Pressable' as React.ElementType).filter(n => n.props.accessibilityLabel?.includes('상세 보기'));
    expect(cards().slice(0,5).every(n => n.props.accessibilityLabel.includes('배치 중'))).toBe(true);
    const roster = tree!.root.findAllByType('Pressable' as React.ElementType).find(n => n.props.accessibilityLabel?.includes('배치 친구 상세'))!;
    await act(async () => roster.props.onPress());
    expect(button('정원에서 빼기')).toBeDefined();
    await press('선택한 동물 상세 닫기');
    await press('미배치 보기');
    expect(cards()).toHaveLength(2);
    expect(cards().every(n => !n.props.accessibilityLabel.includes('배치 중'))).toBe(true);
  });
  it('filters rarities without opening a separate filter menu and resets the result', async () => {
    await render('manage');
    await press('유니크 필터');
    const cards = () => tree!.root.findAllByType('Pressable' as React.ElementType).filter(n => n.props.accessibilityLabel?.includes('상세 보기'));
    expect(cards()).toHaveLength(1);
    await press('동물 검색과 등급 필터 초기화');
    expect(cards()).toHaveLength(7);
    await press('동물 보유 많은 순 정렬');
    expect(button('동물 보유 많은 순 정렬').props.variant).toBe('primary');
  });
  it('pages the catalog instead of mounting all 130 sprite atlases', async () => {
    await render('manage'); await press('전체 도감 보기');
    const sprites = tree!.root.findAllByType('Sprite' as React.ElementType);
    expect(sprites).toHaveLength(17); // 5 equipped + 12 catalog entries
    await press('다음 동물 목록'); expect(text()).toContain('2');
  });
});
