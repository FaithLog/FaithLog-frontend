import React from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) => ReactModule.createElement(name, props, children);
  return {
    Pressable: host('Pressable'),
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});

import {
  DutyDateTimeField,
  DutyPollCreateHeader,
  DutyPollCreateShell,
  DutyPollTypeCard,
  DutyToggleField,
} from './DutyPollCreate';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('shared duty poll create presentation', () => {
  it.each([
    ['커피', '커피 주문', true],
    ['밥', '밥 주문', false],
  ])('renders %s through the common hierarchy', (domain, typeTitle, checked) => {
    const onDatePress = vi.fn();
    const onToggle = vi.fn();
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(
          DutyPollCreateShell,
          null,
          React.createElement(DutyPollCreateHeader, {description: '설명', title: `${domain} 투표 생성`}),
          React.createElement(DutyPollTypeCard, {description: '유형 설명', iconLabel: domain, title: typeTitle}),
          React.createElement(DutyDateTimeField, {
            accessibilityLabel: `${domain} 투표 마감 일시 선택`,
            label: '마감 일시',
            onPress: onDatePress,
            value: '2026. 7. 15. 오후 1:00',
          }),
          React.createElement(DutyToggleField, {
            accessibilityLabel: `${domain} 옵션 전환`,
            checked,
            description: '설정 설명',
            onPress: onToggle,
            title: '사용자 항목 추가',
          }),
        ),
      );
    });
    expect(rendered(renderer)).toContain(`${domain} 투표 생성`);
    expect(rendered(renderer)).toContain(typeTitle);
    const date = renderer.root.findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === `${domain} 투표 마감 일시 선택`);
    expect(date.props.accessibilityRole).toBe('button');
    const toggle = renderer.root.findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === `${domain} 옵션 전환`);
    expect(toggle.props.accessibilityState).toEqual({checked, disabled: false});
  });
});

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}
