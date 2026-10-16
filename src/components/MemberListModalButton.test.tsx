import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => ReactModule.createElement(name, props, children);
  return {Pressable: host('Pressable'), Text: host('Text'), Modal: host('Modal'), ScrollView: host('ScrollView'), View: host('View'), StyleSheet: {create: (styles: unknown) => styles}};
});
vi.mock('./ui', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => ReactModule.createElement(name, props, children);
  return {Body: host('Body'), Button: host('Button'), Loading: host('Loading'), Title: host('Title')};
});

import {MemberListModalButton, type MemberListEntry} from './MemberListModalButton';
import {Button} from './ui';
import {Modal, ScrollView} from 'react-native';

vi.stubGlobal('React', React);
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => {if (renderer) await act(async () => renderer.unmount());});
async function mount(loadMembers: () => Promise<MemberListEntry[]>, inline = false) {
  await act(async () => {renderer = create(<MemberListModalButton label="미참여" title="명단" loadMembers={loadMembers} inline={inline} />);});
}
async function press(label: string) {
  await act(async () => {renderer.root.findAllByType(Button).find(button => button.props.accessibilityLabel === label)!.props.onPress();});
}
const member = {userId: 1, name: 'QA 멤버', email: 'qa@example.test', reason: '수신 정보 없음'};

describe('member list modal interactions', () => {
  it('opens a scrollable list with names, emails and exclusion reasons, then closes', async () => {
    await mount(async () => [member]);
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    await press('명단 열기');
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);
    const scroll = renderer.root.findByType(ScrollView);
    expect(scroll.findAllByType(Button)).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain(member.name);
    expect(JSON.stringify(renderer.toJSON())).toContain(member.email);
    expect(JSON.stringify(renderer.toJSON())).toContain(member.reason);
    await press('명단 닫기');
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
  });
  it('offers retry after a failed request', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([member]);
    await mount(load);
    await press('명단 열기');
    expect(JSON.stringify(renderer.toJSON())).toContain('명단을 불러오지 못했습니다');
    await press('명단 다시 조회');
    expect(JSON.stringify(renderer.toJSON())).toContain(member.name);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('ignores an old response after closing and reopening', async () => {
    let finish!: (members: MemberListEntry[]) => void;
    const pending = new Promise<MemberListEntry[]>(resolve => {finish = resolve;});
    const load = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce([{...member, name: '새 명단'}]);
    await mount(load);
    await press('명단 열기');
    await press('명단 닫기');
    await press('명단 열기');
    await act(async () => finish([member]));
    expect(JSON.stringify(renderer.toJSON())).toContain('새 명단');
    expect(JSON.stringify(renderer.toJSON())).not.toContain(member.name);
  });
  it('shows the empty state inside the sent sheet without opening another native modal', async () => {
    await mount(async () => [], true);
    await press('명단 열기');
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain('현재 조회된 대상이 없습니다');
  });
});
