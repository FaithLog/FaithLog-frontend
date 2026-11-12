import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement } = await import('react');
  const host = (name: string) => ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    createElement(name, props, children);
  return { Image: host('Image'), View: host('View'), Text: host('Text'), Platform: {OS: 'ios'} };
});
vi.mock('./bibleFriendDesignMotionAssets', () => ({
  BIBLE_FRIEND_DESIGN_MOTION_ATLASES: { 'hope-rabbit:unique': 'rabbit-unique-atlas' },
}));
vi.mock('./bibleFriendMotionAssets', () => ({
  BIBLE_FRIEND_MOTION_FRAMES: {
    'hope-rabbit': { walk: ['walk-0', 'walk-1', 'walk-2', 'walk-3'] },
  },
}));

import {Platform} from 'react-native';
import { BibleFriendDesignSprite } from './BibleFriendDesignSprite';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('BibleFriendDesignSprite', () => {
  it('shows a question mark without any character image for an unowned miracle', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async()=>{renderer=create(<BibleFriendDesignSprite designId="jesus:miracle" silhouette />);});
    expect(renderer!.root.findAllByType('Image' as React.ElementType)).toHaveLength(0);
    expect(renderer!.root.findByType('Text' as React.ElementType).props.children).toBe('?');
    await act(async()=>renderer!.unmount());
  });
  it.each(['ios', 'web'] as const)('tints only the character pixels black on %s and restores owned colors', async platform => {
    const original = Platform.OS;
    Platform.OS = platform;
    let renderer: ReturnType<typeof create>;
    try {
      for (const designId of ['hope-rabbit:base', 'hope-rabbit:unique'] as const) {
        await act(async () => {renderer = create(<BibleFriendDesignSprite designId={designId} motion="walk" silhouette />);});
        const images = () => renderer!.root.findAllByType('Image' as React.ElementType);
        expect(images().every(image => image.props.tintColor === '#000000')).toBe(true);
        await act(async () => {renderer!.update(<BibleFriendDesignSprite designId={designId} motion="walk" />);});
        expect(images().every(image => image.props.tintColor === undefined)).toBe(true);
        await act(async () => renderer!.unmount());
      }
    } finally {Platform.OS = original;}
  });
  it('keeps web frame sources mounted across animation ticks', async () => {
    const original = Platform.OS;
    Platform.OS = 'web';
    let renderer: ReturnType<typeof create>;
    try {
      await act(async () => {renderer = create(<BibleFriendDesignSprite designId="hope-rabbit:base" motion="walk" elapsedMs={0} size={64} />);});
      const images = () => renderer!.root.findAllByType('Image' as React.ElementType);
      const sources = images().map(image => image.props.source);
      expect(sources).toEqual(['walk-0', 'walk-1', 'walk-2', 'walk-3']);
      await act(async () => {renderer!.update(<BibleFriendDesignSprite designId="hope-rabbit:base" motion="walk" elapsedMs={300} size={64} />);});
      expect(images().map(image => image.props.source)).toEqual(sources);
      expect(images().filter(image => image.props.style.opacity === 1).map(image => image.props.source)).toEqual(['walk-2']);
      await act(async () => renderer!.unmount());
    } finally {Platform.OS = original;}
  });
  it('keeps the costume atlas loaded while changing its visible frame and motion', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(
      <BibleFriendDesignSprite designId="hope-rabbit:unique" motion="walk" elapsedMs={150} size={80} />,
    ); });
    const image = () => renderer!.root.findByType('Image' as React.ElementType);
    const view = renderer!.root.findByType('View' as React.ElementType);
    expect(view.props.style).toMatchObject({ width: 80, height: 80, overflow: 'hidden' });
    expect(view.props.accessibilityLabel).toBe('달빛 정원사');
    expect(image().props.source).toBe('rabbit-unique-atlas');
    expect(image().props.style).toMatchObject({ left: -80, top: -80, width: 320, height: 320 });
    await act(async () => { renderer!.update(
      <BibleFriendDesignSprite designId="hope-rabbit:unique" motion="held" elapsedMs={220} size={80} />,
    ); });
    expect(image().props.source).toBe('rabbit-unique-atlas');
    expect(image().props.style).toMatchObject({ left: -80, top: -240 });
    await act(async () => { renderer!.unmount(); });
  });

  it('selects the original basic motion frame with the same timeline', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(
      <BibleFriendDesignSprite designId="hope-rabbit:base" motion="walk" elapsedMs={300} size={64} />,
    ); });
    const image = renderer!.root.findByType('Image' as React.ElementType);
    expect(image.props.source).toBe('walk-2');
    expect(image.props.style).toEqual({ width: 64, height: 64 });
    expect(image.props.fadeDuration).toBe(0);
    await act(async () => { renderer!.unmount(); });
  });
});
