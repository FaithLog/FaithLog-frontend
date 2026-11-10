import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const {createElement} = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(name, props, children);
  return {View: host('View'), Text: host('Text'), Pressable: host('Pressable'), StyleSheet: {create: (s: unknown) => s, absoluteFill: {}},
    AppState: {currentState: 'active', addEventListener: () => ({remove: vi.fn()})},
    BackHandler: {addEventListener: () => ({remove: vi.fn()})}};
});
vi.mock('../components/ui', async () => {
  const {createElement} = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(name, props, children);
  const Button = host('Button');
  return {Button, Chip: host('Chip'), DangerConfirmSheet: (props: {visible: boolean; onConfirm: () => void; onCancel: () => void}) => props.visible ? createElement('ConfirmSheet', props) : null};
});
vi.mock('../characters/BibleFriendDesignSprite', async () => ({BibleFriendDesignSprite: (props: Record<string, unknown>) => React.createElement('Sprite', props)}));
vi.mock('./CompanionDrawScene', () => ({CompanionDrawScene: (props: {onComplete: () => void}) => React.createElement('DrawScene', props)}));

import {CompanionProvider} from './CompanionProvider';
import {CompanionPages} from './CompanionPages';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer | undefined;
afterEach(async () => {if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.restoreAllMocks();});
async function render(page: 'manage' | 'missions' | 'draw', onActivity = vi.fn()) {
  await act(async () => {tree = create(<CompanionProvider><CompanionPages initialPage={page} onBack={vi.fn()} onActivity={onActivity} /></CompanionProvider>);});
  return tree!;
}
function button(label: string) {return tree!.root.findAllByType('Button' as React.ElementType).find(n => n.props.accessibilityLabel === label)!;}
async function press(label: string) {const target = button(label); expect(target).toBeDefined(); expect(target.props.disabled).not.toBe(true); await act(async () => target.props.onPress());}
function text() {return JSON.stringify(tree!.toJSON()) + tree!.root.findAllByType('Text' as React.ElementType).map(node => node.children.filter(child => typeof child === 'string').join('')).join('\n');}
describe('companion page flows', () => {
  it('collects a ready reward once, keeps the wallet between pages and opens existing activity routes', async () => {
    const activity = vi.fn();
    await render('missions', activity);
    await press('출석 보상 받기');
    expect(text()).toContain('1,210');
    expect(button('출석 수령 완료').props.disabled).toBe(true);
    await press('기도 하러 가기'); expect(activity).toHaveBeenCalledWith('devotion');
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
  it('pages the catalog instead of mounting all 130 sprite atlases', async () => {
    await render('manage'); await press('전체 도감 보기');
    const sprites = tree!.root.findAllByType('Sprite' as React.ElementType);
    expect(sprites).toHaveLength(17); // 5 equipped + 12 catalog entries
    await press('다음 동물 목록'); expect(text()).toContain('2');
  });
});
