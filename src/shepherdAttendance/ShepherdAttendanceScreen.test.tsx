import React from 'react';
import TestRenderer from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  dismissKeyboard: vi.fn(),
  focusedInputs: [] as string[],
  platform: {OS: 'ios'},
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const component = (name: string) => ({children, ...props}: Record<string, unknown> & {children?: React.ReactNode}) => ReactModule.createElement(name, props, children);
  const TextInput = ReactModule.forwardRef<{focus: () => void}, Record<string, unknown> & {children?: React.ReactNode}>(({children, ...props}, ref) => {
    ReactModule.useImperativeHandle(ref, () => ({
      focus: () => nativeMocks.focusedInputs.push(String(props.accessibilityLabel ?? '')),
    }));
    return ReactModule.createElement('TextInput', props, children as React.ReactNode);
  });
  return {
    InputAccessoryView: component('InputAccessoryView'),
    Keyboard: {dismiss: nativeMocks.dismissKeyboard},
    Platform: nativeMocks.platform,
    Pressable: component('Pressable'),
    ScrollView: component('ScrollView'),
    StyleSheet: {create: (value: unknown) => value},
    Text: component('Text'),
    TextInput,
    View: component('View'),
  };
});
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
import {ShepherdAttendanceScreen} from './ShepherdAttendanceScreen';
import type {ShepherdAttendanceApi} from './shepherdAttendanceApi';
import {FaithLogApiError} from '../api/apiError';

const home = {visible: true, title: '이번 주 목홀타를 입력해 주세요', serviceDate: '2026-08-16', assignedGroupCount: 2, submittedGroupCount: 0, groups: [
  {groupId: 10, groupName: '사랑목장', report: null}, {groupId: 11, groupName: '소망목장', report: null},
]} as const;
const report = {reportId: 1, campusId: 1, groupId: 10, serviceDate: '2026-08-16', smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0, note: null, status: 'SUBMITTED' as const, version: 1, lastModifiedByUserId: 2, lastModifiedByName: '홍길동', lastModifiedAt: '2026-08-16T00:00:00Z'};
function api(): ShepherdAttendanceApi { return {getHome: vi.fn().mockResolvedValue(home), getMyGroups: vi.fn(), getMyReport: vi.fn(), saveMyReport: vi.fn().mockResolvedValue(report), createGroup: vi.fn(), getAdminGroups: vi.fn(), updateGroup: vi.fn(), getAdminPage: vi.fn(), saveAdminReport: vi.fn(), updateAssignees: vi.fn()}; }
function node(renderer: TestRenderer.ReactTestRenderer, label: string) { return renderer.root.find((item) => item.props.accessibilityLabel === label); }
async function flush() { await TestRenderer.act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
describe('ShepherdAttendanceScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMocks.focusedInputs.length = 0;
    nativeMocks.platform.OS = 'ios';
  });
  it('switches assigned groups and submits zero values exactly once', async () => {
    const client = api(); let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<ShepherdAttendanceScreen api={client} campusId={1} getAccessToken={async () => 'token'} initialData={home as never} onBack={vi.fn()} />); });
    expect(node(renderer!, '목홀타 입력값')).toBeTruthy();
    expect(node(renderer!, '목홀타 저장 명령').props.style).toMatchObject({flexDirection: 'row', justifyContent: 'flex-end'});
    expect(renderer!.root.findAll((item) => item.props.accessibilityLabel === '목홀타 임시 저장')).toHaveLength(0);
    for (const label of ['목장모임 참여 인원', '홀리웨이브 참여 인원', '타예배 참여 인원']) expect(node(renderer!, label).props.keyboardType).toBe('number-pad');
    expect(renderer!.root.findAll((item) => String(item.props.accessibilityLabel ?? '').includes('1 늘리기'))).toHaveLength(0);
    TestRenderer.act(() => node(renderer!, '소망목장 선택').props.onPress());
    for (const label of ['목장모임 참여 인원','홀리웨이브 참여 인원','타예배 참여 인원']) TestRenderer.act(() => node(renderer!, label).props.onChangeText('0'));
    TestRenderer.act(() => { node(renderer!, '목홀타 제출 완료').props.onPress(); node(renderer!, '목홀타 제출 완료').props.onPress(); });
    await flush();
    expect(client.saveMyReport).toHaveBeenCalledTimes(1);
    expect(client.saveMyReport).toHaveBeenCalledWith('token', 1, 11, '2026-08-16', expect.objectContaining({smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0, status: 'SUBMITTED', version: 0}));
  });

  it('refetches on a stale version conflict without erasing by success', async () => {
    const client = api(); (client.saveMyReport as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new FaithLogApiError({kind: 'conflict', status: 409, code: 'SHEPHERD_ATTENDANCE_CONFLICT', message: 'stale'}));
    let renderer: TestRenderer.ReactTestRenderer; await TestRenderer.act(async () => { renderer = TestRenderer.create(<ShepherdAttendanceScreen api={client} campusId={1} getAccessToken={async () => 'token'} initialData={home as never} onBack={vi.fn()} />); });
    for (const label of ['목장모임 참여 인원','홀리웨이브 참여 인원','타예배 참여 인원']) TestRenderer.act(() => node(renderer!, label).props.onChangeText('1'));
    TestRenderer.act(() => node(renderer!, '목홀타 제출 완료').props.onPress()); await flush();
    expect(client.getHome).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer!.toJSON())).toContain('다른 사용자가 먼저 수정했습니다. 최신 내용을 불러왔습니다.');
  });

  it('keeps the member list scoped to assigned groups without exposing group creation', async () => {
    const client = api();
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<ShepherdAttendanceScreen api={client} campusId={1} getAccessToken={async () => 'token'} initialData={home as never} onBack={vi.fn()} />); });

    expect(JSON.stringify(renderer!.toJSON())).toContain('사랑목장');
    expect(JSON.stringify(renderer!.toJSON())).toContain('소망목장');
    expect(renderer!.root.findAll((item) => item.props.accessibilityLabel === '내 목장 추가 화면 열기')).toHaveLength(0);
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('새 목장 추가');
    expect(client.getAdminGroups).not.toHaveBeenCalled();
    expect(client.createGroup).not.toHaveBeenCalled();
  });

  it('shows submitted values as read-only numbers until the user chooses to edit', async () => {
    const submittedHome = {...home, submittedGroupCount: 1, groups: [{groupId: 10, groupName: '사랑목장', report}]};
    const client = api();
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<ShepherdAttendanceScreen api={client} campusId={1} getAccessToken={async () => 'token'} initialData={submittedHome as never} onBack={vi.fn()} />); });

    const submittedValues = node(renderer!, '제출한 목홀타 값');
    expect(submittedValues.findAll((item) => item.props.children === '목장모임').length).toBeGreaterThan(0);
    expect(submittedValues.findAll((item) => Array.isArray(item.props.children) && item.props.children[0] === 0 && item.props.children[1] === '명').length).toBeGreaterThanOrEqual(3);
    expect(renderer!.root.findAll((item) => item.props.accessibilityLabel === '목장모임 참여 인원')).toHaveLength(0);
    TestRenderer.act(() => node(renderer!, '제출한 목홀타 수정').props.onPress());
    expect(node(renderer!, '목장모임 참여 인원').props.value).toBe('0');
    expect(node(renderer!, '목홀타 제출 완료')).toBeTruthy();
  });

  it('moves through count inputs and provides an iOS numeric keyboard accessory', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(<ShepherdAttendanceScreen api={api()} campusId={1} getAccessToken={async () => 'token'} initialData={home as never} onBack={vi.fn()} />);
    });

    const meeting = node(renderer!, '목장모임 참여 인원');
    const holyWave = node(renderer!, '홀리웨이브 참여 인원');
    const otherWorship = node(renderer!, '타예배 참여 인원');
    expect(meeting.props.returnKeyType).toBe('next');
    expect(holyWave.props.returnKeyType).toBe('next');
    expect(otherWorship.props.returnKeyType).toBe('done');

    TestRenderer.act(() => meeting.props.onSubmitEditing());
    TestRenderer.act(() => holyWave.props.onSubmitEditing());
    expect(nativeMocks.focusedInputs).toEqual(['홀리웨이브 참여 인원', '타예배 참여 인원']);
    TestRenderer.act(() => otherWorship.props.onSubmitEditing());
    expect(nativeMocks.dismissKeyboard).toHaveBeenCalledTimes(1);

    for (const label of ['홀리웨이브 입력으로 이동', '타예배 입력으로 이동', '숫자 키보드 닫기']) {
      expect(renderer!.root.findAll((item) => String(item.type) === 'Pressable' && item.props.accessibilityLabel === label && item.props.accessibilityRole === 'button')).toHaveLength(1);
    }
  });

  it('uses Android keyboard next actions without rendering the iOS accessory', async () => {
    nativeMocks.platform.OS = 'android';
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(<ShepherdAttendanceScreen api={api()} campusId={1} getAccessToken={async () => 'token'} initialData={home as never} onBack={vi.fn()} />);
    });

    expect(node(renderer!, '목장모임 참여 인원').props.returnKeyType).toBe('next');
    expect(node(renderer!, '홀리웨이브 참여 인원').props.returnKeyType).toBe('next');
    expect(node(renderer!, '타예배 참여 인원').props.returnKeyType).toBe('done');
    expect(renderer!.root.findAllByType('InputAccessoryView' as never)).toHaveLength(0);
  });
});
