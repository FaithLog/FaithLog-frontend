import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GardenExpeditionCard} from './GardenExpeditionCard';
import type {GardenExpedition} from './gardenExpeditionContract';

const app = vi.hoisted(() => ({
  listener: undefined as ((state: string) => void) | undefined,
  remove: vi.fn(),
}));

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      app.listener = listener;
      return {remove: app.remove};
    },
  },
  StyleSheet: {create: (styles: unknown) => styles},
  Text: 'Text',
  View: 'View',
}));
vi.mock('../components/ui', () => ({Button: 'Button'}));

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer | undefined;
const exploring: GardenExpedition = {
  state: 'EXPLORING',
  id: 'expedition',
  designId: 'david-lamb:base',
  readyAt: '2026-11-26T12:00:10Z',
  reward: 3,
};
const ready: GardenExpedition = {...exploring, state: 'READY'};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
  app.listener = undefined;
  app.remove.mockClear();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  vi.useRealTimers();
});

async function mount(load: () => Promise<GardenExpedition>) {
  const api = {load, start: vi.fn(), claim: vi.fn(), claimSeason: vi.fn()};
  await act(async () => {
    tree = create(<GardenExpeditionCard api={api} instanceId="pet" onClaimed={vi.fn()} />);
  });
}
async function advance(milliseconds: number) {
  await act(async () => {await vi.advanceTimersByTimeAsync(milliseconds);});
}
function rewardButton() {
  return tree?.root.findAllByProps({accessibilityLabel: '탐험 보상 받기'})[0];
}

describe('garden expedition status refresh', () => {
  it('checks again when the server still reports the animal is exploring at the local return time', async () => {
    const load = vi.fn<() => Promise<GardenExpedition>>()
      .mockResolvedValueOnce(exploring)
      .mockResolvedValueOnce({...exploring})
      .mockResolvedValue(ready);
    await mount(load);
    await advance(10_500);
    expect(load).toHaveBeenCalledTimes(2);
    expect(rewardButton()).toBeUndefined();

    await advance(30_000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(rewardButton()?.props.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses the timer in the background and refreshes when the app resumes', async () => {
    const load = vi.fn<() => Promise<GardenExpedition>>()
      .mockResolvedValueOnce(exploring)
      .mockResolvedValue(ready);
    await mount(load);
    await act(async () => app.listener?.('background'));
    await advance(30_000);
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => app.listener?.('active'));
    expect(load).toHaveBeenCalledTimes(2);
    expect(rewardButton()?.props.disabled).toBe(false);
    await act(async () => tree?.unmount());
    tree = undefined;
    expect(app.remove).toHaveBeenCalledOnce();
  });
});
