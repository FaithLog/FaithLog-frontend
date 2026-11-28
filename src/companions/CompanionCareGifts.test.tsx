import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {Text} from 'react-native';
import {expect, it, vi} from 'vitest';
import {CompanionCareGifts} from './CompanionCareGifts';
import {Button} from '../components/ui';
import type {CompanionCareGift} from './companionServerContract';

vi.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  StyleSheet: {create: (value: unknown) => value},
  AppState: {addEventListener: () => ({remove: () => {}})},
}));
vi.mock('./FarmHudAssets', () => ({FarmHudIcon: () => null}));
vi.mock('../components/ui', () => ({Button: () => null}));

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

it('shows remaining care days for locked gifts and refreshes the next eligible gift', async () => {
  const load = vi.fn<() => Promise<CompanionCareGift[]>>()
    .mockResolvedValueOnce([{milestone: 3, shards: 1, status: 'LOCKED'}])
    .mockResolvedValue([{milestone: 3, shards: 1, status: 'READY'}]);
  const claim = vi.fn(async () => [] as CompanionCareGift[]);
  const render = (days: number) => <CompanionCareGifts id="animal" careDays={days} load={load} claim={claim} />;
  let tree!: ReactTestRenderer;
  await act(async () => {tree = create(render(1));});
  try {
    expect(tree.root.findAllByType(Text).some(node => node.props.children === '2일 더 돌보면 받을 수 있어요')).toBe(true);
    expect(tree.root.findAllByType(Button)).toHaveLength(0);
    await act(async () => {tree.update(render(3));});
    expect(tree.root.findAllByType(Button).some(node => node.props.accessibilityLabel === '3일 돌봄 선물 받기')).toBe(true);
    expect(claim).not.toHaveBeenCalled();
  } finally {
    await act(async () => tree.unmount());
  }
});
