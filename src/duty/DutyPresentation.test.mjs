import React from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name) => ({children, ...props}) => ReactModule.createElement(name, props, children);
  return {
    ActivityIndicator: host('ActivityIndicator'),
    KeyboardAvoidingView: host('KeyboardAvoidingView'),
    Modal: ({children, visible, ...props}) => visible
      ? ReactModule.createElement('Modal', props, children)
      : null,
    Platform: {OS: 'ios'},
    Pressable: host('Pressable'),
    StyleSheet: {
      create: (styles) => styles,
      flatten: (styles) => Object.assign({}, ...[].concat(styles).filter(Boolean)),
    },
    Text: host('Text'),
    View: host('View'),
  };
});

vi.mock('../components/IconexIcon', async () => {
  const ReactModule = await import('react');
  return {IconexIcon: (props) => ReactModule.createElement('IconexIcon', props)};
});

import {
  DutyActionButton,
  DutyActionRow,
  DutyAsyncState,
  DutyEntityCard,
  DutyMetricSurface,
  DutyPageScaffold,
  DutyPageSection,
  DutySectionHeader,
} from './DutyPresentation';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('shared duty presentation', () => {
  it('renders a scroll-free page scaffold with the common header and content rhythm', () => {
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(
          DutyPageScaffold,
          {
            backAccessibilityLabel: '내정보로 돌아가기',
            campusName: 'QA 캠퍼스',
            contextLabel: '담당자님',
            domainLabel: '커피',
            onBack: vi.fn(),
            title: '커피 정산 관리',
          },
          React.createElement('Child'),
        ),
      );
    });

    expect(renderer.root.findAllByType('ScrollView')).toHaveLength(0);
    expect(renderer.root.findByProps({accessibilityLabel: '내정보로 돌아가기'})).toBeTruthy();
    expect(rendered(renderer)).toContain('커피');
    expect(rendered(renderer)).toContain('담당자');
    expect(rendered(renderer)).toContain('커피 정산 관리');
    expect(renderer.root.findByType('Child')).toBeTruthy();
  });

  it('uses the same section, entity, metric, and action hierarchy for both domains', () => {
    let renderer;
    act(() => {
      renderer = create(
        React.createElement(
          DutyPageSection,
          null,
          React.createElement(DutySectionHeader, {
            action: React.createElement(DutyActionButton, {
              accessibilityLabel: '목록 새로고침',
              label: '새로고침',
              onPress: vi.fn(),
            }),
            eyebrow: '투표 관리',
            title: '투표 목록',
          }),
          React.createElement(
            DutyMetricSurface,
            {label: '전체 합계', value: '12,000원'},
            React.createElement('MetricDetail'),
          ),
          React.createElement(
            DutyEntityCard,
            {statusLabel: '진행 중', title: '화요일 주문'},
            React.createElement('EntityDetail'),
          ),
          React.createElement(
            DutyActionRow,
            null,
            React.createElement(DutyActionButton, {
              accessibilityLabel: '저장 실행',
              busy: true,
              disabled: true,
              label: '저장',
              onPress: vi.fn(),
            }),
          ),
        ),
      );
    });

    expect(rendered(renderer)).toContain('투표 관리');
    expect(rendered(renderer)).toContain('12,000원');
    expect(rendered(renderer)).toContain('화요일 주문');
    const busy = renderer.root.findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === '저장 실행');
    expect(busy.props.accessibilityState).toEqual({busy: true, disabled: true, selected: false});
  });

  it.each([
    ['loading', '불러오는 중'],
    ['empty', '표시할 항목이 없습니다'],
    ['error', '목록을 불러오지 못했습니다'],
  ])('renders the %s async state through one contract', (status, copy) => {
    const onRetry = vi.fn();
    let renderer;
    act(() => {
      renderer = create(React.createElement(DutyAsyncState, {
        actionLabel: '다시 불러오기',
        message: copy,
        onAction: onRetry,
        status,
        title: status === 'error' ? '오류' : undefined,
      }));
    });
    expect(rendered(renderer)).toContain(copy);
    if (status !== 'loading') {
      act(() => renderer.root.findByProps({accessibilityLabel: '다시 불러오기'}).props.onPress());
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  });

  it('gives every duty action at least a 48 point target and preserves selected/disabled/busy state', () => {
    let renderer;
    act(() => {
      renderer = create(React.createElement(DutyActionButton, {
        accessibilityLabel: '선택 작업',
        busy: true,
        disabled: true,
        label: '선택',
        onPress: vi.fn(),
        selected: true,
      }));
    });
    const button = renderer.root.findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === '선택 작업');
    const style = button.props.style({pressed: false});
    expect(Math.max(...style.filter(Boolean).map((item) => item.minHeight ?? item.height ?? 0))).toBeGreaterThanOrEqual(48);
    expect(button.props.accessibilityState).toEqual({busy: true, disabled: true, selected: true});
  });
});

function rendered(renderer) {
  return JSON.stringify(renderer.toJSON());
}
