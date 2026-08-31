import React from 'react';
import {Modal, View} from 'react-native';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Modal: ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
      ReactModule.createElement('Modal', props, children),
    Platform: {OS: 'android'},
    StyleSheet: {create: (styles: unknown) => styles},
    View: host('View'),
  };
});

import {AppModal, AppModalInsetProvider} from './AppModal';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('AppModal', () => {
  it('keeps modal content above the Android system navigation bar', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <AppModalInsetProvider bottomInset={64}>
          <AppModal visible>
            <View style={{backgroundColor: 'rgba(25, 31, 40, 0.32)', flex: 1}} testID="content" />
          </AppModal>
        </AppModalInsetProvider>,
      );
    });

    expect(renderer!.root.findByType(Modal).props.visible).toBe(true);
    expect(renderer!.root.findByProps({testID: 'content'}).props.style).toEqual([
      {backgroundColor: 'rgba(25, 31, 40, 0.32)', flex: 1},
      {paddingBottom: 64},
    ]);
  });

  it('does not add a second wrapper that can expose a blank strip below the backdrop', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <AppModalInsetProvider bottomInset={56}>
          <AppModal visible>
            <View style={{backgroundColor: 'rgba(25, 31, 40, 0.32)', flex: 1}} testID="backdrop" />
          </AppModal>
        </AppModalInsetProvider>,
      );
    });

    const modal = renderer!.root.findByType(Modal);
    expect(modal.findAllByType(View)).toHaveLength(1);
    expect(modal.findByProps({testID: 'backdrop'}).props.style).toContainEqual({paddingBottom: 56});
  });
});
