import React from 'react';
import TestRenderer from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';
vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const component = (name: string) => ({children, ...props}: Record<string, unknown> & {children?: React.ReactNode}) => ReactModule.createElement(name, props, children);
  return {Pressable: component('Pressable'), StyleSheet: {create: (value: unknown) => value}, Text: component('Text'), View: component('View')};
});
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
import {ShepherdAttendanceHomeCard} from './ShepherdAttendanceHomeCard';

describe('ShepherdAttendanceHomeCard', () => {
  it('renders only for visible assigned groups and shows completion', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    TestRenderer.act(() => { renderer = TestRenderer.create(<ShepherdAttendanceHomeCard data={{visible: true, serviceDate: '2026-08-16', assignedGroupCount: 2, submittedGroupCount: 2, groups: []}} onPress={vi.fn()} />); });
    expect(JSON.stringify(renderer!.toJSON())).toContain('이번 주 목홀타 입력 완료');
    TestRenderer.act(() => { renderer!.update(<ShepherdAttendanceHomeCard data={{visible: false, serviceDate: '2026-08-16', assignedGroupCount: 0, submittedGroupCount: 0, groups: []}} onPress={vi.fn()} />); });
    expect(renderer!.toJSON()).toBeNull();
  });
});
