import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const rn = vi.hoisted(() => ({width: 390}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    useWindowDimensions: () => ({fontScale: 1, height: 844, scale: 3, width: rn.width}),
    View: host('View'),
  };
});
vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000000'}),
  radius: {control: 14, item: 18, pill: 999},
  spacing: {card: 20, control: 16, gap: 12, screenX: 24},
  typography: {body: {}, caption: {}, cardTitle: {}, sectionTitle: {}},
}));
vi.mock('../auth/accessTokenResolver', () => ({
  resolveCurrentAccessToken: vi.fn(async () => 'access'),
}));
vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  toPositiveIntegerPathSegment: (value: number) => String(value),
}));
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));

import type {WeeklyMaterialApi} from './weeklyMaterialApi';
import type {WeeklyMaterial} from './weeklyMaterialTypes';
import {WeeklyMaterialsScreen} from './WeeklyMaterialsScreen';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const guide = {
  materialType: 'SHEPHERD_GUIDE' as const,
  mediaAssetId: 31,
  fileName: '8월 목자지침 아주 긴 파일 이름.pdf',
  byteSize: 2048,
  sha256: 'a'.repeat(64),
  updatedAt: '2026-08-03T01:00:00Z',
};

describe('WeeklyMaterialsScreen', () => {
  const getWeek = vi.fn();
  const openMaterial = vi.fn();
  const api = {getWeek} as unknown as WeeklyMaterialApi;

  beforeEach(() => {
    vi.clearAllMocks();
    getWeek.mockImplementation(async (_token: string, campusId: number, week: string) => ({
      campusId,
      weekStartDate: week,
      materials: week === '2026-08-03' ? [guide] : [],
    }));
  });

  it('shows the two independent rows and does not download a PDF during adjacent prefetch', async () => {
    const tree = await render(api, openMaterial);

    expect(text(tree)).toContain('목자지침');
    expect(text(tree)).toContain('8월 목자지침 아주 긴 파일 이름.pdf');
    expect(text(tree)).toContain('이번 주 나눔지가 아직 등록되지 않았어요');
    expect(getWeek.mock.calls.map((call) => call[2]).sort()).toEqual([
      '2026-07-27',
      '2026-08-03',
      '2026-08-10',
    ]);
    expect(openMaterial).not.toHaveBeenCalled();

    await act(async () => {
      tree.root.findByProps({accessibilityLabel: '목자지침 PDF 열기'}).props.onPress();
    });
    expect(openMaterial).toHaveBeenCalledOnce();
    expect(openMaterial).toHaveBeenCalledWith(guide);
  });

  it('keeps another week navigable when the selected week fails and retries only that week', async () => {
    getWeek.mockImplementation(async (_token: string, campusId: number, week: string) => {
      if (week === '2026-08-03') throw new Error('offline secret response');
      return {campusId, weekStartDate: week, materials: []};
    });
    const tree = await render(api, openMaterial);
    expect(text(tree)).toContain('이 주차 자료를 불러오지 못했습니다');
    expect(text(tree)).not.toContain('offline secret response');
    await act(async () => {
      tree.root.findByProps({accessibilityLabel: '다음 주'}).props.onPress();
    });
    await flush();
    expect(text(tree)).toContain('선택한 주차의 목자지침이 아직 등록되지 않았어요');
  });

  it('prevents duplicate PDF opens and exposes a safe retry state on failure', async () => {
    let reject!: (error: Error) => void;
    openMaterial.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const tree = await render(api, openMaterial);
    const control = tree.root.findByProps({accessibilityLabel: '목자지침 PDF 열기'});
    await act(async () => {
      control.props.onPress();
      control.props.onPress();
    });
    expect(openMaterial).toHaveBeenCalledOnce();
    expect(text(tree)).toContain('여는 중');
    reject(new Error('signed URL with secret'));
    await flush();
    expect(text(tree)).toContain('다시 시도');
    expect(text(tree)).not.toContain('signed URL with secret');
  });
});

async function render(api: WeeklyMaterialApi, openMaterial: (material: WeeklyMaterial) => Promise<void> | void) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <WeeklyMaterialsScreen
        accessTokenProvider={async () => 'access'}
        api={api}
        campusId={7}
        currentWeekStartDate="2026-08-03"
        onBack={vi.fn()}
        openMaterial={openMaterial}
      />,
    );
  });
  await flush();
  return tree;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function text(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join('')).join(' ');
}
