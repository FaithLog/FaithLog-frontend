import {act, create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Button} from '../components/ui';
import {GardenDecorationEditor, parseGardenDecorations, useGardenDecorations} from './GardenDecorations';

const storage = vi.hoisted(() => ({
  getItemAsync: vi.fn(async (_key: string): Promise<string | null> => null),
  setItemAsync: vi.fn(async (_key: string, _value: string) => undefined),
}));
vi.mock('expo-secure-store', () => storage);
vi.mock('react-native', () => ({View:'View', Text:'Text', StyleSheet:{create:(value: unknown)=>value}}));
vi.mock('../components/ui', () => ({Button: () => null, Chip: () => null}));

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  if (tree) await act(async () => {tree?.unmount();});
  tree = undefined;
  vi.clearAllMocks();
});

describe('garden decorations', () => {
  it('recovers valid slots and handles corrupt values', () => {
    expect(parseGardenDecorations('["flower","unknown","fountain"]')).toEqual(['flower',null,'fountain']);
    expect(parseGardenDecorations('broken')).toEqual([null,null,null]);
  });

  it('previews a slot change and leaves saved decorations alone on cancel', async () => {
    const preview = vi.fn();
    const save = vi.fn(async () => undefined);
    const close = vi.fn();
    await act(async () => {tree = create(<GardenDecorationEditor layout={['flower',null,null]}
      onPreview={preview} onSave={save} onClose={close}/>);});
    const press = async (label: string) => {
      const button = tree!.root.findAllByType(Button).find(button => button.props.accessibilityLabel === label);
      await act(async () => {button!.props.onPress();});
    };
    await press('장식 오른쪽 위치 선택');
    await press('오른쪽에 등불 배치');
    expect(preview).toHaveBeenLastCalledWith(['flower',null,'lantern']);
    await press('정원 꾸미기 취소');
    expect(close).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it('moves into an empty slot, swaps occupied slots, and saves the previewed layout', async () => {
    const preview = vi.fn();
    const save = vi.fn(async () => undefined);
    const close = vi.fn();
    await act(async () => {tree = create(<GardenDecorationEditor layout={['flower',null,'lantern']}
      onPreview={preview} onSave={save} onClose={close}/>);});
    const press = async (label: string) => {
      const button = tree!.root.findAllByType(Button).find(button => button.props.accessibilityLabel === label);
      expect(button).toBeDefined();
      await act(async () => {button!.props.onPress();});
    };
    await press('장식을 가운데 위치로 옮기기');
    expect(preview).toHaveBeenLastCalledWith([null,'flower','lantern']);
    await press('가운데·오른쪽 장식 맞바꾸기');
    expect(preview).toHaveBeenLastCalledWith([null,'lantern','flower']);
    expect(save).not.toHaveBeenCalled();
    await press('정원 장식 저장');
    expect(save).toHaveBeenCalledExactlyOnceWith([null,'lantern','flower']);
    expect(close).toHaveBeenCalledOnce();
  });

  it('updates both mounted gardens after saving and ignores a stale storage read', async () => {
    const scope = 'faithlog.garden.decorations.7.8';
    let finishRead!: (value: string) => void;
    storage.getItemAsync.mockImplementationOnce(() => new Promise(resolve => {finishRead = resolve;}));
    const states = new Map<string, ReturnType<typeof useGardenDecorations>>();
    function Probe({name, storageKey}: {name: string; storageKey: string}) {
      states.set(name, useGardenDecorations(storageKey));
      return null;
    }
    await act(async () => {tree = create(<>
      <Probe name="home" storageKey={scope}/>
      <Probe name="manage" storageKey={scope}/>
      <Probe name="other" storageKey="faithlog.garden.decorations.7.9"/>
    </>);});
    await act(async () => {await states.get('manage')!.save(['flower',null,'lantern']);});
    await act(async () => {finishRead('[null,null,null]');});
    expect(states.get('home')!.layout).toEqual(['flower',null,'lantern']);
    expect(states.get('manage')!.layout).toEqual(['flower',null,'lantern']);
    expect(states.get('other')!.layout).toEqual([null,null,null]);
  });

  it('writes and restores the layout for the current account and campus', async () => {
    const scope = 'faithlog.garden.decorations.7.8';
    let state: ReturnType<typeof useGardenDecorations> | undefined;
    function Probe() {
      state = useGardenDecorations(scope);
      return null;
    }
    await act(async () => {tree = create(<Probe/>);});
    await act(async () => {await state!.save(['flower',null,'lantern']);});
    expect(storage.setItemAsync).toHaveBeenCalledWith(scope,'["flower",null,"lantern"]');
    storage.getItemAsync.mockResolvedValueOnce('["flower",null,"lantern"]');
    await act(async () => {tree!.unmount();});
    await act(async () => {tree = create(<Probe/>);});
    expect(state!.layout).toEqual(['flower',null,'lantern']);
    expect(storage.getItemAsync).toHaveBeenLastCalledWith(scope);
  });
});
