import React from 'react';
import TestRenderer from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';
vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const component = (name: string) => ({children, ...props}: Record<string, unknown> & {children?: React.ReactNode}) => ReactModule.createElement(name, props, children);
  return {Pressable: component('Pressable'), ScrollView: component('ScrollView'), StyleSheet: {create: (value: unknown) => value}, Text: component('Text'), TextInput: component('TextInput'), View: component('View')};
});
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
import {ShepherdAttendanceScreen} from './ShepherdAttendanceScreen';
import type {ShepherdAttendanceApi} from './shepherdAttendanceApi';
import {FaithLogApiError} from '../api/apiError';

const home = {visible: true, serviceDate: '2026-08-16', assignedGroupCount: 2, submittedGroupCount: 0, groups: [
  {groupId: 10, groupName: '사랑목장', report: null}, {groupId: 11, groupName: '소망목장', report: null},
]} as const;
const report = {reportId: 1, smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0, note: null, status: 'SUBMITTED' as const, version: 1, lastModifiedAt: '2026-08-16T00:00:00Z'};
function api(): ShepherdAttendanceApi { return {getHome: vi.fn().mockResolvedValue(home), saveMyReport: vi.fn().mockResolvedValue(report), createGroup: vi.fn(), getAdminPage: vi.fn(), saveAdminReport: vi.fn(), updateAssignees: vi.fn()}; }
function node(renderer: TestRenderer.ReactTestRenderer, label: string) { return renderer.root.find((item) => item.props.accessibilityLabel === label); }
async function flush() { await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
describe('ShepherdAttendanceScreen', () => {
  beforeEach(() => vi.clearAllMocks());
  it('switches assigned groups and submits zero values exactly once', async () => {
    const client = api(); let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<ShepherdAttendanceScreen api={client} campusId={1} getAccessToken={async () => 'token'} initialData={home as never} onBack={vi.fn()} />); });
    TestRenderer.act(() => node(renderer!, '소망목장 선택').props.onPress());
    for (const label of ['목장모임 참여 인원','홀리웨이브 참여 인원','타예배 참여 인원']) TestRenderer.act(() => node(renderer!, label).props.onChangeText('0'));
    TestRenderer.act(() => { node(renderer!, '목홀타 제출 완료').props.onPress(); node(renderer!, '목홀타 제출 완료').props.onPress(); });
    await flush();
    expect(client.saveMyReport).toHaveBeenCalledTimes(1);
    expect(client.saveMyReport).toHaveBeenCalledWith('token', 1, 11, '2026-08-16', expect.objectContaining({smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0, status: 'SUBMITTED', version: 0}));
  });

  it('refetches on a stale version conflict without erasing by success', async () => {
    const client = api(); (client.saveMyReport as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new FaithLogApiError({kind: 'conflict', status: 409, message: 'stale'}));
    let renderer: TestRenderer.ReactTestRenderer; await TestRenderer.act(async () => { renderer = TestRenderer.create(<ShepherdAttendanceScreen api={client} campusId={1} getAccessToken={async () => 'token'} initialData={home as never} onBack={vi.fn()} />); });
    for (const label of ['목장모임 참여 인원','홀리웨이브 참여 인원','타예배 참여 인원']) TestRenderer.act(() => node(renderer!, label).props.onChangeText('1'));
    TestRenderer.act(() => node(renderer!, '목홀타 임시 저장').props.onPress()); await flush();
    expect(client.getHome).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer!.toJSON())).toContain('다른 사용자가 먼저 수정했습니다. 최신 내용을 불러왔습니다.');
  });
});
