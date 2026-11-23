import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {Image, Pressable} from 'react-native';
import {describe, expect, it, vi} from 'vitest';
import {Button} from '../components/ui';
import {GardenDecorationShop} from './GardenDecorationShop';

vi.mock('react-native', () => ({
  Image: () => null, Pressable: ({children}: {children: unknown}) => children,
  Text: 'Text', View: 'View', StyleSheet: {create: (value: unknown) => value},
}));
vi.mock('../components/IconexIcon', () => ({IconexIcon: () => null}));
vi.mock('../components/ui', () => ({Button: () => null}));
vi.mock('./gardenDecorationCatalog', async importOriginal => {
  const catalog = await importOriginal<typeof import('./gardenDecorationCatalog')>();
  return {...catalog, gardenShopDecorations: catalog.gardenShopDecorations.map(item => ({...item, source: () => 1}))};
});

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

describe('garden decoration shop', () => {
  it('browses categories and pages and previews one item in the selected position', async () => {
    let tree!: ReactTestRenderer;
    const preview = vi.fn();
    const close = vi.fn();
    await act(async () => {
      tree = create(<GardenDecorationShop points={250} onPreview={preview} onClose={close} />);
    });
    const pressButton = async (label: string) => {
      const button = tree.root.findAllByType(Button).find(node => node.props.accessibilityLabel === label);
      expect(button?.props.disabled).not.toBe(true);
      await act(async () => button!.props.onPress());
    };
    try {
      expect(tree.root.findAllByType(Image)).toHaveLength(6);
      await pressButton('다음 소품');
      expect(tree.root.findAllByType(Pressable)[0]?.props.accessibilityLabel).toBe('조개 목욕통 미리보기');
      await pressButton('식물 소품 보기');
      await pressButton('미리보기 오른쪽 위치');
      await act(async () => tree.root.findAllByType(Pressable)[0]!.props.onPress());
      expect(preview).toHaveBeenLastCalledWith('olive-sapling', 2);
      await pressButton('미리보기 왼쪽 위치');
      expect(preview).toHaveBeenLastCalledWith('olive-sapling', 0);
      await pressButton('정원 상점 닫기');
      expect(close).toHaveBeenCalledOnce();
    } finally {
      await act(async () => tree.unmount());
    }
  });
});
