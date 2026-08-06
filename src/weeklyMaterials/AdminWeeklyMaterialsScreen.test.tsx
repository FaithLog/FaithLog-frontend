import React from 'react';
import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
    ReactModule.createElement(name, props, children);
  return {
    ActivityIndicator: host('ActivityIndicator'),
    Modal: host('Modal'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: {create: (styles: unknown) => styles},
    Text: host('Text'),
    useWindowDimensions: () => ({fontScale: 1, height: 844, scale: 3, width: 390}),
    View: host('View'),
  };
});
vi.mock('../api/client', () => ({
  apiRequest: vi.fn(),
  toPositiveIntegerPathSegment: (value: number) => String(value),
}));
vi.mock('../auth/accessTokenResolver', () => ({resolveCurrentAccessToken: vi.fn(async () => 'access')}));
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000000'}),
  radius: {card: 24, control: 14, item: 18, pill: 999},
  spacing: {card: 20, control: 16, gap: 12, screenX: 24},
  typography: {body: {}, caption: {}, cardTitle: {}, label: {}, sectionTitle: {}},
}));

import type {PdfUploadCandidate, ReadyDocumentAsset} from '../media/documentMediaTypes';
import type {WeeklyMaterialApi} from './weeklyMaterialApi';
import {AdminWeeklyMaterialsScreen} from './AdminWeeklyMaterialsScreen';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const sheet = {
  materialType: 'SUNDAY_SHARING_SHEET' as const,
  mediaAssetId: 42,
  fileName: '기존 주일 나눔지.pdf',
  byteSize: 1024,
  sha256: 'b'.repeat(64),
  updatedAt: '2026-08-03T01:00:00Z',
};
const guideCandidate: PdfUploadCandidate = {
  byteSize: 2048,
  contentType: 'application/pdf',
  fileName: '새 목자지침.pdf',
  sha256: 'a'.repeat(64),
  uri: 'file:///guide.pdf',
};
const guideReady: ReadyDocumentAsset = {
  assetId: 41,
  assetKind: 'PDF',
  byteSize: 2048,
  contentType: 'application/pdf',
  fileName: '새 목자지침.pdf',
  height: null,
  sha256: 'a'.repeat(64),
  status: 'READY',
  width: null,
};

describe('AdminWeeklyMaterialsScreen', () => {
  const getWeek = vi.fn();
  const putMaterial = vi.fn();
  const deleteMaterial = vi.fn();
  const api = {deleteMaterial, getWeek, putMaterial} as unknown as WeeklyMaterialApi;
  const pickPdf = vi.fn();
  const uploadPdf = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getWeek.mockImplementation(async (_token: string, campusId: number, week: string) => ({
      campusId,
      weekStartDate: week,
      materials: week === '2026-08-03' ? [sheet] : [],
    }));
    pickPdf.mockResolvedValue(guideCandidate);
    uploadPdf.mockResolvedValue(guideReady);
    putMaterial.mockResolvedValue({
      campusId: 7,
      weekStartDate: '2026-08-03',
      materials: [{
        materialType: 'SHEPHERD_GUIDE',
        mediaAssetId: 41,
        fileName: '새 목자지침.pdf',
        byteSize: 2048,
        sha256: 'a'.repeat(64),
        updatedAt: '2026-08-03T02:00:00Z',
      }, sheet],
    });
    deleteMaterial.mockResolvedValue(undefined);
  });

  it('keeps the three material drafts independent and updates only the uploaded type', async () => {
    const tree = await render();
    expect(rootScrollView(tree).props.contentContainerStyle.paddingHorizontal).toBe(8);
    expect(text(tree)).toContain('기존 주일 나눔지.pdf');
    expect(text(tree)).toContain('토목모 나눔지');

    await press(tree, '목자지침 PDF 선택');
    expect(text(tree)).toContain('새 목자지침.pdf');
    expect(text(tree)).toContain('기존 주일 나눔지.pdf');
    await press(tree, '목자지침 등록');

    expect(uploadPdf).toHaveBeenCalledWith(guideCandidate, expect.any(Function), expect.any(AbortSignal));
    expect(putMaterial).toHaveBeenCalledWith(
      'access', 7, '2026-08-03', 'SHEPHERD_GUIDE', 41,
    );
    expect(text(tree)).toContain('새 목자지침.pdf');
    expect(text(tree)).toContain('기존 주일 나눔지.pdf');
  });

  it('deletes only the confirmed material and preserves the other row', async () => {
    const tree = await render();
    await press(tree, '주일 나눔지 삭제');
    expect(text(tree)).toContain('2026년 8월 3일 주차의 주일 나눔지를 삭제할까요?');
    await press(tree, '주일 나눔지 영구 삭제 확인');
    expect(deleteMaterial).toHaveBeenCalledWith('access', 7, '2026-08-03', 'SUNDAY_SHARING_SHEET');
    expect(text(tree)).toContain('주일 나눔지가 아직 등록되지 않았어요');
  });

  it('suppresses a synchronous double confirmation while deleting', async () => {
    let resolveDelete!: () => void;
    deleteMaterial.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }));
    const tree = await render();
    await press(tree, '주일 나눔지 삭제');
    await act(async () => {
      const confirm = activeControl(tree, '주일 나눔지 영구 삭제 확인');
      confirm.props.onPress();
      confirm.props.onPress();
    });
    expect(deleteMaterial).toHaveBeenCalledTimes(1);
    resolveDelete();
    await flush();
  });

  it('shows a document picker failure safely in the affected material slot', async () => {
    pickPdf.mockRejectedValueOnce(new Error('private local path'));
    const tree = await render();
    await press(tree, '목자지침 PDF 선택');
    expect(text(tree)).toContain('PDF 파일을 선택하지 못했습니다. 다시 시도해 주세요.');
    expect(tree.root.findAll((node) =>
      String(node.type) === 'Text' &&
      node.props.accessibilityLabel === '목자지침 PDF 선택 오류',
    )).toHaveLength(1);
    expect(text(tree)).not.toContain('private local path');
  });

  it('blocks week navigation while an upload is in flight', async () => {
    let resolve!: (value: ReadyDocumentAsset) => void;
    uploadPdf.mockReturnValue(new Promise((done) => { resolve = done; }));
    const tree = await render();
    await press(tree, '목자지침 PDF 선택');
    await act(async () => {
      activeControl(tree, '목자지침 등록').props.onPress();
    });
    await act(async () => {
      tree.root.findByProps({accessibilityLabel: '다음 주'}).props.onPress();
    });
    expect(text(tree)).toContain('업로드가 진행 중입니다. 완료 후 주차를 이동해 주세요.');
    resolve(guideReady);
    await flush();
  });

  it('keeps the selected week when a picked file has not been registered', async () => {
    const tree = await render();
    await press(tree, '목자지침 PDF 선택');
    await act(async () => {
      tree.root.findByProps({accessibilityLabel: '다음 주'}).props.onPress();
    });
    expect(text(tree)).toContain('선택한 파일이 있습니다. 등록하거나 삭제한 뒤 주차를 이동해 주세요.');
    expect(text(tree)).toContain('이번 주');
    await press(tree, '선택한 주간 자료 파일을 삭제하고 주차 이동');
    expect(text(tree)).toContain('8월 2주');
  });

  async function render() {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <AdminWeeklyMaterialsScreen
          accessTokenProvider={async () => 'access'}
          api={api}
          campusId={7}
          currentWeekStartDate="2026-08-03"
          onBack={vi.fn()}
          onOpenMaterial={vi.fn()}
          pickPdf={pickPdf}
          uploadPdf={uploadPdf}
        />,
      );
    });
    await flush();
    return tree;
  }
});

async function press(tree: ReactTestRenderer, label: string) {
  await act(async () => {
    activeControl(tree, label).props.onPress();
  });
  await flush();
}

function activeControl(tree: ReactTestRenderer, label: string) {
  const active = tree.root.findAllByProps({accessibilityLabel: label}).find((node) => {
    let current = node.parent;
    while (current) {
      if (current.props.accessibilityElementsHidden === true) return false;
      current = current.parent;
    }
    return true;
  });
  if (!active) throw new Error(`Missing active control: ${label}`);
  return active;
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

function rootScrollView(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => String(node.type) === 'ScrollView')[0]!;
}
