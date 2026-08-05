import React from 'react';
import {act, create} from 'react-test-renderer';
import {describe, expect, it, vi} from 'vitest';

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) => ReactModule.createElement(name, props, children);
  return {Pressable: host('Pressable'), StyleSheet: {create: (styles: unknown) => styles}, Text: host('Text'), View: host('View')};
});

import {AnnouncementDocumentEditor, AnnouncementDocumentList} from './AnnouncementDocumentAttachments';

const items = [
  {assetId: 31, byteSize: 1024, fileName: '안내.pdf', localId: '31', status: 'ready' as const},
  {assetId: 32, byteSize: 2048, fileName: '신청서.pdf', localId: '32', status: 'ready' as const},
];

describe('announcement PDF attachment UI', () => {
  it('offers add, remove, retry and ordered movement without touching image state', async () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<AnnouncementDocumentEditor disabled={false} items={items} onAdd={vi.fn()} onMove={onMove} onRemove={onRemove} onRetry={vi.fn()} />); });
    act(() => renderer.root.findByProps({accessibilityLabel: '안내.pdf 오른쪽으로 이동'}).props.onPress());
    act(() => renderer.root.findByProps({accessibilityLabel: '신청서.pdf 삭제'}).props.onPress());
    expect(onMove).toHaveBeenCalledWith(0, 1);
    expect(onRemove).toHaveBeenCalledWith('32');
  });

  it('renders a compact accessible detail list and opens only the selected PDF', async () => {
    const onOpen = vi.fn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<AnnouncementDocumentList items={items} onOpen={onOpen} />); });
    act(() => renderer.root.findByProps({accessibilityLabel: '안내.pdf PDF 열기'}).props.onPress());
    expect(onOpen).toHaveBeenCalledWith(items[0]);
  });
});
