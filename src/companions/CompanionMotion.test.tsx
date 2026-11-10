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
  return {View: host('View'), Text: host('Text'), Pressable: host('Pressable'), StyleSheet: {create: (s: unknown) => s},
    AppState: {currentState: 'active', addEventListener: (_key: string, cb: (v: string) => void) => {native.appListener = cb; return {remove: () => {native.removals++;}};}},
    AccessibilityInfo: {isReduceMotionEnabled: async () => native.reduce, addEventListener: (_key: string, cb: (v: boolean) => void) => {native.motionListener = cb; return {remove: () => {native.removals++;}};}}};
});
vi.mock('react-native-svg', async () => {
  const {createElement} = await import('react');
  return Object.fromEntries(['default', 'Circle', 'Defs', 'Ellipse', 'G', 'LinearGradient', 'Path', 'RadialGradient', 'Rect', 'Stop'].map(name => [name, ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => createElement(`svg-${name}`, props, children)]));
});
vi.mock('../characters/BibleFriendDesignSprite', () => ({BibleFriendDesignSprite: (props: Record<string, unknown>) => React.createElement('Sprite', props)}));
vi.mock('../components/ui', () => ({Button: (props: Record<string, unknown>) => React.createElement('Button', props), Chip: (props: Record<string, unknown>) => React.createElement('Chip', props)}));
import {BIBLE_FRIEND_DESIGN_CATALOG} from '../characters/bibleFriendDesignCatalog';
import {CompanionDrawScene} from './CompanionDrawScene';
import {CompanionGarden} from './CompanionGarden';
import {CompanionProvider} from './CompanionProvider';
import {useCompanionMotion} from './useCompanionMotion';
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer | undefined;
beforeEach(() => {vi.useFakeTimers(); native.reduce = false; native.removals = 0;});
afterEach(async () => {if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.useRealTimers();});
async function advance(ms: number) {await act(async () => {vi.advanceTimersByTime(ms);});}
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
  it('renders five selected friends and applies a touch reaction', async () => {
    await act(async () => {tree = create(<CompanionProvider><CompanionGarden onOpen={vi.fn()} /></CompanionProvider>);});
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)).toHaveLength(5);
    await act(async () => tree!.root.findAllByType('Pressable' as React.ElementType)[0]!.props.onPress());
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)[0]!.props.motion).toBe('happy');
    await advance(900);
    expect(tree!.root.findAllByType('Sprite' as React.ElementType)[0]!.props.motion).not.toBe('happy');
  });
});
