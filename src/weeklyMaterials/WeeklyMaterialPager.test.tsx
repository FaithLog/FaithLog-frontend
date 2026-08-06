import React from 'react';
import {Pressable, Text} from 'react-native';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

const {scrollMountSpy, scrollToSpy} = vi.hoisted(() => ({
  scrollMountSpy: vi.fn(),
  scrollToSpy: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  const ScrollView = ReactModule.forwardRef(function MockScrollView(
    {children, ...props}: React.PropsWithChildren<Record<string, unknown>>,
    ref,
  ) {
    ReactModule.useImperativeHandle(ref, () => ({scrollTo: scrollToSpy}));
    ReactModule.useEffect(() => {
      scrollMountSpy();
    }, []);
    return ReactModule.createElement('ScrollView', props, children);
  });
  return {
    Pressable: host('Pressable'),
    ScrollView,
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
  it('ignores the iOS zero-offset momentum event before the current page is ready', async () => {
    const onSelectWeek = vi.fn();
    scrollToSpy.mockClear();
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

    const scrollView = tree.root.find((node) => String(node.type) === 'ScrollView');
    act(() => scrollView.props.onContentSizeChange(3, 270));
    act(() => scrollView.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {x: 0}}}));

    expect(onSelectWeek).not.toHaveBeenCalled();
    expect(scrollToSpy).toHaveBeenLastCalledWith({animated: false, x: 1});
  });

  it('recenters the current week after iOS reports horizontal content readiness', async () => {
    scrollToSpy.mockClear();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <WeeklyMaterialPager
          currentWeekStartDate="2026-08-03"
          onSelectWeek={vi.fn()}
          renderWeek={() => null}
          selectedWeekStartDate="2026-08-03"
        />,
      );
    });

    const viewport = tree.root.find((node) => typeof node.props.onLayout === 'function');
    await act(async () => {
      viewport.props.onLayout({nativeEvent: {layout: {width: 390}}});
    });
    scrollToSpy.mockClear();

    const scrollView = tree.root.find((node) => String(node.type) === 'ScrollView');
    act(() => scrollView.props.onContentSizeChange(1_170, 270));

    expect(scrollToSpy).toHaveBeenCalledExactlyOnceWith({animated: false, x: 390});
  });

  it('does not remount the horizontal pager when user-visible content refreshes', async () => {
    scrollMountSpy.mockClear();
    let tree!: ReactTestRenderer;
    const renderPager = (contentRevision: string) => (
      <WeeklyMaterialPager
        contentRevision={contentRevision}
        currentWeekStartDate="2026-08-03"
        onSelectWeek={vi.fn()}
        renderWeek={() => null}
        selectedWeekStartDate="2026-08-03"
      />
    );
    await act(async () => { tree = create(renderPager('loading')); });
    await act(async () => { tree.update(renderPager('ready')); });

    expect(scrollMountSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts the first swipe after a week change even when content size is unchanged', async () => {
    const onSelectWeek = vi.fn();
    let tree!: ReactTestRenderer;
    const renderPager = (selectedWeekStartDate: string) => (
      <WeeklyMaterialPager
        currentWeekStartDate="2026-08-03"
        onSelectWeek={onSelectWeek}
        renderWeek={() => null}
        selectedWeekStartDate={selectedWeekStartDate}
      />
    );
    await act(async () => { tree = create(renderPager('2026-08-03')); });

    const initialScrollView = tree.root.find((node) => String(node.type) === 'ScrollView');
    act(() => initialScrollView.props.onContentSizeChange(3, 270));
    await act(async () => { tree.update(renderPager('2026-08-10')); });

    const updatedScrollView = tree.root.find((node) => String(node.type) === 'ScrollView');
    act(() => updatedScrollView.props.onScrollBeginDrag());
    act(() => updatedScrollView.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {x: 0}}}));

    expect(onSelectWeek).toHaveBeenCalledExactlyOnceWith('2026-08-03');
  });

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
    const scrollView = tree.root.find((node) => String(node.type) === 'ScrollView');
    act(() => scrollView.props.onContentSizeChange(3, 270));
    act(() => scrollView.props.onScrollBeginDrag());
    act(() => scrollView.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {x: 0}}}));
    expect(onSelectWeek.mock.calls.map(([week]) => week)).toEqual([
      '2026-07-27',
      '2026-08-10',
      '2026-07-27',
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
