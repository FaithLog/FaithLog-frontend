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
  it('confirms the price before charging and lets an owned item be placed', async () => {
    let tree!: ReactTestRenderer;
    const onPurchase = vi.fn(async () => undefined);
    const onPlace = vi.fn();
    const item = {id: 'lamb-shelter', price: 300, owned: false};
    const render = (owned: boolean) => <GardenDecorationShop points={500}
      catalog={{balance: owned ? 200 : 500, items: [{...item, owned}]}}
      onPurchase={onPurchase} onPlace={onPlace} onPreview={vi.fn()} onClose={vi.fn()} />;
    await act(async () => {tree = create(render(false));});
    const press = async (label: string) => {
      const target = tree.root.findAllByType(Button).find(node => node.props.accessibilityLabel === label);
      expect(target?.props.disabled).not.toBe(true);
      await act(async () => target!.props.onPress());
    };
    try {
      await act(async () => tree.root.findAllByType(Pressable)[0]!.props.onPress());
      await press('포인트로 구매하기');
      expect(onPurchase).not.toHaveBeenCalled();
      await press('포인트 구매 확정');
      expect(onPurchase).toHaveBeenCalledExactlyOnceWith('lamb-shelter', 300);
      await act(async () => tree.update(render(true)));
      await press('보유 소품 배치하기');
      expect(onPlace).toHaveBeenCalledExactlyOnceWith('lamb-shelter', 1);
    } finally {
      await act(async () => tree.unmount());
    }
  });

  it('finds owned items across pages and handles categories without owned items', async () => {
    const catalog = {balance: 500, items: [
      {id: 'lamb-shelter', price: 300, owned: false},
      {id: 'olive-sapling', price: 200, owned: true},
    ]};
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<GardenDecorationShop points={500} catalog={catalog} onPreview={vi.fn()} onClose={vi.fn()} />);
    });
    const press = async (label: string) => {
      const button = tree.root.findAllByType(Button).find(node => node.props.accessibilityLabel === label);
      expect(button).toBeDefined();
      await act(async () => {button!.props.onPress();});
    };
    try {
      await press('다음 소품');
      await press('보유한 소품만 보기');
      expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
      await press('식물 소품 보기');
      expect(tree.root.findAllByType(Pressable)).toHaveLength(1);
      await press('전체 소품 보기');
      expect(tree.root.findAllByType(Pressable)).toHaveLength(6);
    } finally {
      await act(async () => tree.unmount());
    }
  });

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
