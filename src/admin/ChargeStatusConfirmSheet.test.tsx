import React from 'react';
import {Modal, ScrollView, View} from 'react-native';
import {act, create} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const native = vi.hoisted(() => ({focus: vi.fn(), findNodeHandle: vi.fn(() => 91)}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    AccessibilityInfo: {setAccessibilityFocus: native.focus},
    findNodeHandle: native.findNodeHandle,
    Modal: ({children, visible, ...props}: React.PropsWithChildren<{visible: boolean}>) =>
      visible ? ReactModule.createElement('Modal', props, children) : null,
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});

vi.mock('../components/ui', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {Body: host('Body'), Button: host('Button'), ListRow: host('ListRow'), Title: host('Title')};
});

vi.mock('../api/client', () => ({
  getAdminChargeContractCapabilities: () => ({
    devotionPenaltyReopenEnabled: true,
    paidStatusEnabled: true,
  }),
}));

import {ChargeStatusConfirmSheet} from './ChargeStatusConfirmSheet';
import {Button} from '../components/ui';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChargeStatusConfirmSheet', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps large content scrollable while actions stay fixed and focuses the title', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<ChargeStatusConfirmSheet
        error={{kind: 'conflict', message: '최신 상태를 다시 확인해 주세요.'}}
        loading={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        target={{
          charge: {
            id: 501,
            paymentCategory: 'PENALTY',
            title: '주간 경건 벌금',
            amount: 10_000,
            status: 'UNPAID',
            source: {sourceType: 'DEVOTION_RECORD', sourceId: 11},
          },
          status: 'CANCELED',
        }} />, {createNodeMock: () => ({})});
    });
    await act(async () => {
      vi.runAllTimers();
    });

    const scroll = renderer!.root.findByType(ScrollView);
    expect(scroll.findAllByType(Button)).toHaveLength(0);
    expect(renderer!.root.findAllByType(Button)).toHaveLength(2);
    expect(renderer!.root.findAll((node) => node.type === View && node.props.style?.maxHeight === '90%')).toHaveLength(1);
    expect(renderer!.root.findByType(Modal).props.accessibilityViewIsModal).toBe(true);
    expect(native.focus).toHaveBeenCalledWith(91);
  });
});
