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

    expect(JSON.stringify(renderer!.toJSON())).toContain('목장 정보 수정');
    expect(JSON.stringify(renderer!.toJSON())).toContain('목홀타 입력');
    await TestRenderer.act(async () => { renderer!.root.findByProps({accessibilityLabel: '사랑목장 목홀타 입력'}).props.onPress(); });
    const card = renderer!.root.findByProps({accessibilityLabel: '사랑목장 목홀타 현황'});
    const inputRow = card.findByProps({accessibilityLabel: '사랑목장 목홀타 입력값'});
    expect(inputRow.props.style).toEqual(expect.objectContaining({flexDirection: 'row'}));
    expect(card.findByProps({accessibilityLabel: '목장모임 참여 인원'})).toBeTruthy();
    expect(card.findByProps({accessibilityLabel: '홀리웨이브 참여 인원'})).toBeTruthy();
    expect(card.findByProps({accessibilityLabel: '타예배 참여 인원'})).toBeTruthy();
  });

  it('opens a dedicated group creation page from the top-right action', async () => {
    const api = {getAdminPage: vi.fn().mockResolvedValue({
      campusId: 1, serviceDate: '2026-08-09', content: [],
      totals: {smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0}, totalSubmittedCount: 0, totalMissingCount: 0, page: 0, size: 50, totalElements: 0, totalPages: 0,
    }), getMyGroups: vi.fn(), getMyReport: vi.fn(), saveMyReport: vi.fn(), createGroup: vi.fn().mockResolvedValue({}), getHome: vi.fn(), getAdminGroups: vi.fn(), updateGroup: vi.fn(), saveAdminReport: vi.fn(), updateAssignees: vi.fn()} as ShepherdAttendanceApi;
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<AdminShepherdAttendanceScreen api={api} campusId={1} getAccessToken={async () => 'token'} members={[{userId: 2, name: '홍길동'}, {userId: 3, name: '김사랑'}]} onBack={vi.fn()} />); await Promise.resolve(); await Promise.resolve(); });

    expect(renderer!.root.findAllByProps({accessibilityLabel: '관리자 새 목장 이름'})).toHaveLength(0);
    await TestRenderer.act(async () => { renderer!.root.findByProps({accessibilityLabel: '목장 추가 페이지 열기'}).props.onPress(); });

    expect(renderer!.root.findByProps({accessibilityLabel: '관리자 새 목장 이름'})).toBeTruthy();
    expect(renderer!.root.findByProps({accessibilityLabel: '목장 담당자 이름 검색'})).toBeTruthy();
    expect(renderer!.root.findByProps({accessibilityLabel: '새 목장 홍길동 담당자 선택'})).toBeTruthy();
    expect(renderer!.root.findByProps({accessibilityLabel: '새 목장 김사랑 담당자 선택'})).toBeTruthy();
    expect(JSON.stringify(renderer!.toJSON())).not.toContain('목홀타 전체 합계');

    await TestRenderer.act(async () => { renderer!.root.findByProps({accessibilityLabel: '목장 담당자 이름 검색'}).props.onChangeText('사랑'); });
    expect(renderer!.root.findAllByProps({accessibilityLabel: '새 목장 홍길동 담당자 선택'})).toHaveLength(0);
    expect(renderer!.root.findByProps({accessibilityLabel: '새 목장 김사랑 담당자 선택'})).toBeTruthy();
  });

  it('creates with selected campus members and returns to the group list', async () => {
    const createGroup = vi.fn().mockResolvedValue({});
    const api = {getAdminPage: vi.fn().mockResolvedValue({
      campusId: 1, serviceDate: '2026-08-09', content: [],
      totals: {smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0}, totalSubmittedCount: 0, totalMissingCount: 0, page: 0, size: 50, totalElements: 0, totalPages: 0,
    }), getMyGroups: vi.fn(), getMyReport: vi.fn(), saveMyReport: vi.fn(), createGroup, getHome: vi.fn(), getAdminGroups: vi.fn(), updateGroup: vi.fn(), saveAdminReport: vi.fn(), updateAssignees: vi.fn()} as ShepherdAttendanceApi;
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<AdminShepherdAttendanceScreen api={api} campusId={1} getAccessToken={async () => 'token'} members={[{userId: 2, name: '홍길동'}, {userId: 3, name: '김사랑'}]} onBack={vi.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    await TestRenderer.act(async () => { renderer!.root.findByProps({accessibilityLabel: '목장 추가 페이지 열기'}).props.onPress(); });
    await TestRenderer.act(async () => {
      renderer!.root.findByProps({accessibilityLabel: '관리자 새 목장 이름'}).props.onChangeText(' 새봄 목장 ');
      renderer!.root.findByProps({accessibilityLabel: '새 목장 홍길동 담당자 선택'}).props.onPress();
      renderer!.root.findByProps({accessibilityLabel: '새 목장 김사랑 담당자 선택'}).props.onPress();
    });
    await TestRenderer.act(async () => { await renderer!.root.findByProps({accessibilityLabel: '관리자 목장 생성'}).props.onPress(); });

    expect(createGroup).toHaveBeenCalledWith('token', 1, {name: '새봄 목장', assigneeUserIds: [2, 3]});
    expect(renderer!.root.findAllByProps({accessibilityLabel: '관리자 새 목장 이름'})).toHaveLength(0);
    expect(renderer!.root.findByProps({accessibilityLabel: '목장 추가 페이지 열기'})).toBeTruthy();
  });

  it('edits a group name and assignees on a dedicated page', async () => {
    const updateGroup = vi.fn().mockResolvedValue({});
    const updateAssignees = vi.fn().mockResolvedValue({});
    const api = {getAdminPage: vi.fn().mockResolvedValue({
      campusId: 1, serviceDate: '2026-08-09', content: [{groupId: 1, groupName: '사랑목장', groupVersion: 4, assignees: [{userId: 2, name: '홍길동', email: 'qa@example.com'}], report: null}],
      totals: {smallGroupMeetingCount: 0, holyWaveCount: 0, otherWorshipCount: 0}, totalSubmittedCount: 0, totalMissingCount: 1, page: 0, size: 50, totalElements: 1, totalPages: 1,
    }), getMyGroups: vi.fn(), getMyReport: vi.fn(), saveMyReport: vi.fn(), createGroup: vi.fn(), getHome: vi.fn(), getAdminGroups: vi.fn(), updateGroup, saveAdminReport: vi.fn(), updateAssignees} as ShepherdAttendanceApi;
    let renderer: TestRenderer.ReactTestRenderer;
    await TestRenderer.act(async () => { renderer = TestRenderer.create(<AdminShepherdAttendanceScreen api={api} campusId={1} getAccessToken={async () => 'token'} members={[{userId: 2, name: '홍길동'}, {userId: 3, name: '김사랑'}]} onBack={vi.fn()} />); await Promise.resolve(); await Promise.resolve(); });
    await TestRenderer.act(async () => { renderer!.root.findByProps({accessibilityLabel: '사랑목장 목장 정보 수정'}).props.onPress(); });
    expect(renderer!.root.findByProps({accessibilityLabel: '수정할 목장 이름'}).props.value).toBe('사랑목장');
    expect(renderer!.root.findByProps({accessibilityLabel: '목장 수정 담당자 이름 검색'})).toBeTruthy();
    await TestRenderer.act(async () => {
      renderer!.root.findByProps({accessibilityLabel: '수정할 목장 이름'}).props.onChangeText('사랑 공동체');
      renderer!.root.findByProps({accessibilityLabel: '목장 수정 김사랑 담당자 선택'}).props.onPress();
    });
    await TestRenderer.act(async () => { await renderer!.root.findByProps({accessibilityLabel: '목장 수정 저장'}).props.onPress(); });
    expect(updateGroup).toHaveBeenCalledWith('token', 1, 1, {name: '사랑 공동체', version: 4});
    expect(updateAssignees).toHaveBeenCalledWith('token', 1, 1, [2, 3]);
    expect(renderer!.root.findByProps({accessibilityLabel: '목장 추가 페이지 열기'})).toBeTruthy();
  });
});
