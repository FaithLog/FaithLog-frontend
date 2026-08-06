import React from 'react';
import {Pressable, Text} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    useWindowDimensions: () => ({height: 844, scale: 3, fontScale: 1, width: 390}),
    View: host('View'),
  };
});
vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000000'}),
  radius: {control: 14, pill: 999},
  spacing: {control: 16, gap: 12},
  typography: {caption: {}, cardTitle: {}, sectionTitle: {}},
}));

import {WeeklyMaterialPager} from './WeeklyMaterialPager';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('WeeklyMaterialPager', () => {
  it('remounts the current week page when its opaque content revision changes', async () => {
    let tree!: ReactTestRenderer;
    const renderPager = (contentRevision: string) => (
      <WeeklyMaterialPager
        contentRevision={contentRevision}
        currentWeekStartDate="2026-08-03"
        onSelectWeek={vi.fn()}
        renderWeek={(week) => <StatefulWeek label={week} />}
        selectedWeekStartDate="2026-08-03"
      />
    );
    await act(async () => { tree = create(renderPager('draft-0')); });
    act(() => tree.root.findByProps({accessibilityLabel: '2026-08-03 counter'}).props.onPress());
    expect(readText(tree)).toContain('2026-08-03:1');

    await act(async () => { tree.update(renderPager('draft-1')); });

    expect(readText(tree)).toContain('2026-08-03:0');
  });

  it('keeps arrow and swipe movement on the same week calculation', async () => {
    const onSelectWeek = vi.fn();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <WeeklyMaterialPager
          currentWeekStartDate="2026-08-03"
          onSelectWeek={onSelectWeek}
          renderWeek={() => null}
          selectedWeekStartDate="2026-08-03"
        />,
      );
    });
    const previous = tree.root.findByProps({accessibilityLabel: '이전 주'});
    const next = tree.root.findByProps({accessibilityLabel: '다음 주'});
    act(() => previous.props.onPress());
    act(() => next.props.onPress());
    expect(onSelectWeek.mock.calls.map(([week]) => week)).toEqual([
      '2026-07-27',
      '2026-08-10',
    ]);
  });

  it('offers an accessible current-week return only for a past week', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <WeeklyMaterialPager
          currentWeekStartDate="2026-08-03"
          onSelectWeek={vi.fn()}
          renderWeek={() => null}
          selectedWeekStartDate="2026-07-27"
        />,
      );
    });
    expect(tree.root.findByProps({accessibilityLabel: '이번 주로 이동'})).toBeTruthy();
  });
});

function StatefulWeek({label}: {label: string}) {
  const [count, setCount] = React.useState(0);
  return (
    <Pressable accessibilityLabel={`${label} counter`} onPress={() => setCount((value) => value + 1)}>
      <Text>{label}:{count}</Text>
    </Pressable>
  );
}

function readText(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => String(node.type) === 'Text')
    .map((node) => node.children.join(''))
    .join(' ');
}
