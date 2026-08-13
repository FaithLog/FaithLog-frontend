import React from 'react';
import TestRenderer from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';
vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const component = (name: string) => ({children, ...props}: Record<string, unknown> & {children?: React.ReactNode}) => ReactModule.createElement(name, props, children);
  return {ActivityIndicator: component('ActivityIndicator'), Pressable: component('Pressable'), ScrollView: component('ScrollView'), StyleSheet: {create: (value: unknown) => value}, Text: component('Text'), TextInput: component('TextInput'), View: component('View'), useWindowDimensions: () => ({width: 390, height: 844})};
});
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
import {AdminShepherdAttendanceScreen} from './AdminShepherdAttendanceScreen';
import type {ShepherdAttendanceApi} from './shepherdAttendanceApi';

describe('AdminShepherdAttendanceScreen', () => {
  it('renders server totals and mobile group status cards', async () => {
    const api = {getAdminPage: vi.fn().mockResolvedValue({
      campusId: 1, serviceDate: '2026-08-09', content: [{groupId: 1, groupName: '사랑목장', groupVersion: 1, assignees: [{userId: 2, name: '홍길동', email: 'qa@example.com'}], report: null}],
      totals: {smallGroupMeetingCount: 80, holyWaveCount: 50, otherWorshipCount: 20}, totalSubmittedCount: 0, totalMissingCount: 1, page: 0, size: 50, totalElements: 1, totalPages: 1,
    }), getMyGroups: vi.fn(), getMyReport: vi.fn(), saveMyReport: vi.fn(), createGroup: vi.fn(), getHome: vi.fn(), getAdminGroups: vi.fn(), updateGroup: vi.fn(), saveAdminReport: vi.fn(), updateAssignees: vi.fn()} as ShepherdAttendanceApi;
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<AdminShepherdAttendanceScreen api={api} campusId={1} getAccessToken={async () => 'token'} members={[{userId: 2, name: '홍길동'}]} onBack={vi.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    const output = JSON.stringify(renderer!.toJSON());
    expect(output).toContain('"80","\uBA85"'); expect(output).toContain('"50","\uBA85"'); expect(output).toContain('사랑목장'); expect(output).toContain('미제출');
  });
});
