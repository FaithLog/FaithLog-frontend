import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Modal: ({children, visible, ...props}: React.PropsWithChildren<{visible: boolean}>) =>
      visible ? ReactModule.createElement('Modal', props, children) : null,
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
vi.mock('../components/ui', async () => {
  const ReactModule = await import('react');
  return {
    TextField: (props: Record<string, unknown>) => ReactModule.createElement('TextField', props),
  };
});
vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000'}),
  radius: {pill: 999},
  spacing: {bottomSafe: 24},
}));

import {BankSelectionField} from './BankSelectionField';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('BankSelectionField', () => {
  it('selects one approved bank from the dropdown', () => {
    const onChange = vi.fn();
    const renderer = renderField({domainLabel: '밥', onChange});

    press(renderer, '밥 계좌 은행 선택');
    press(renderer, '카카오뱅크 선택');

    expect(onChange).toHaveBeenCalledWith('카카오뱅크');
  });

  it('shows a free-text input only after 직접 입력 is selected', () => {
    const onChange = vi.fn();
    const renderer = renderField({domainLabel: '커피', onChange});
    expect(byLabel(renderer, '커피 계좌 은행명 직접 입력')).toHaveLength(0);

    press(renderer, '커피 계좌 은행 선택');
    press(renderer, '직접 입력 선택');

    expect(onChange).toHaveBeenCalledWith('');
    expect(byLabel(renderer, '커피 계좌 은행명 직접 입력')).toHaveLength(1);
  });
});

function renderField({domainLabel, onChange}: {domainLabel: string; onChange: (value: string) => void}) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <BankSelectionField bankName="" domainLabel={domainLabel} onChange={onChange} />,
    );
  });
  return renderer;
}

function press(renderer: ReactTestRenderer, label: string) {
  act(() => byLabel(renderer, label)[0]!.props.onPress());
}

function byLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) =>
    typeof node.type === 'string' && node.props.accessibilityLabel === label);
}
