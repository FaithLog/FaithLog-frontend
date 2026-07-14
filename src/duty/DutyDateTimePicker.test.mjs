import React from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) =>
    ReactModule.createElement(name, props, children);
  return {
    Modal: ({children, visible, ...props}) => visible
      ? ReactModule.createElement('Modal', props, children)
      : null,
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles) => styles},
    Text: host('Text'),
    View: host('View'),
  };
});

import {DutyDateTimePickerModal} from './DutyDateTimePicker';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DutyDateTimePickerModal', () => {
  it('selects a calendar date and time, then applies one local Date', async () => {
    const onApply = vi.fn();
    const value = new Date(2026, 6, 15, 12, 0);
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(DutyDateTimePickerModal, {
        minimumDate: new Date(2026, 6, 14, 10, 0),
        onApply,
        onClose: vi.fn(),
        value,
        visible: true,
      }));
    });

    await press(renderer, '2026년 7월 16일 선택');
    await press(renderer, '시 늘리기');
    await press(renderer, '분 늘리기');
    await press(renderer, '마감 일시 적용');

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual(new Date(2026, 6, 16, 13, 5));
  });

  it('keeps the committed value on cancel and blocks past dates and times', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(DutyDateTimePickerModal, {
        minimumDate: new Date(2026, 6, 14, 12, 0),
        onApply,
        onClose,
        value: new Date(2026, 6, 14, 13, 0),
        visible: true,
      }));
    });

    const pastDay = findByLabel(renderer, '2026년 7월 13일 선택');
    expect(pastDay.props.disabled).toBe(true);
    expect(pastDay.props.accessibilityState).toEqual(expect.objectContaining({disabled: true}));

    await press(renderer, '시 줄이기');
    await press(renderer, '시 줄이기');
    const apply = findByLabel(renderer, '마감 일시 적용');
    expect(apply.props.disabled).toBe(true);
    expect(apply.props.accessibilityState).toEqual({disabled: true});
    await press(renderer, '마감 일시 선택 취소');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('keeps compact visual controls with at least 48-point effective touch targets', async () => {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(DutyDateTimePickerModal, {
        minimumDate: new Date(2026, 6, 14, 12, 0),
        onApply: vi.fn(),
        onClose: vi.fn(),
        value: new Date(2026, 6, 15, 13, 0),
        visible: true,
      }));
    });

    for (const label of [
      '마감 일시 선택 닫기',
      '이전 달',
      '다음 달',
      '시 줄이기',
      '시 늘리기',
      '분 줄이기',
      '분 늘리기',
    ]) {
      const control = findByLabel(renderer, label);
      const visualHeight = flattenStyle(control.props.style({pressed: false})).minHeight;
      expect(visualHeight).toBe(40);
      expect(visualHeight + verticalHitSlop(control.props.hitSlop)).toBeGreaterThanOrEqual(48);
    }

    for (const label of [
      '2026년 7월 15일 선택',
      '마감 일시 선택 취소',
      '마감 일시 적용',
    ]) {
      const control = findByLabel(renderer, label);
      const visualHeight = flattenStyle(control.props.style({pressed: false})).minHeight;
      expect(visualHeight).toBe(44);
      expect(visualHeight + verticalHitSlop(control.props.hitSlop)).toBeGreaterThanOrEqual(48);
    }
  });
});

function findByLabel(renderer, accessibilityLabel) {
  return renderer.root.find((node) => node.props.accessibilityLabel === accessibilityLabel);
}

async function press(renderer, accessibilityLabel) {
  await act(async () => {
    const node = findByLabel(renderer, accessibilityLabel);
    if (!node.props.disabled) node.props.onPress();
    await Promise.resolve();
  });
}

function flattenStyle(style) {
  return (Array.isArray(style) ? style : [style])
    .filter(Boolean)
    .reduce((result, entry) => ({...result, ...entry}), {});
}

function verticalHitSlop(hitSlop) {
  if (typeof hitSlop === 'number') return hitSlop * 2;
  return (hitSlop?.top ?? 0) + (hitSlop?.bottom ?? 0);
}
