import {useCallback, useEffect, useImperativeHandle, type Ref, useRef, useState} from 'react';
import {BackHandler, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {freeDecorations, gardenDecorations, type DecorationId} from './gardenDecorationCatalog';
import type {ReactNode} from 'react';
import {Button, Chip} from '../components/ui';
import {colors, typography} from '../theme';

export type GardenDecorationLayout = [DecorationId | null, DecorationId | null, DecorationId | null];
type Layout = GardenDecorationLayout;
const positions = ['왼쪽', '가운데', '오른쪽'] as const;
const emptyLayout: Layout = [null, null, null];
const layoutListeners = new Map<string, Set<(layout: Layout) => void>>();
const pendingSaves = new Map<string, Promise<void>>();

export function parseGardenDecorations(value: string | null): Layout {
  let parsed: unknown;
  try {parsed = value === null ? null : JSON.parse(value);} catch {return emptyLayout;}
  if (!Array.isArray(parsed) || parsed.length !== positions.length) return emptyLayout;
  const read = (index: number) => gardenDecorations.find(item => item.id === parsed[index])?.id ?? null;
  return [read(0), read(1), read(2)];
}

export function useGardenDecorations(scope?: string) {
  const [stored, setStored] = useState<{scope: string | undefined; layout: Layout} | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!scope) return;
    let active = true;
    let receivedSave = false;
    const listeners = layoutListeners.get(scope) ?? new Set();
    layoutListeners.set(scope, listeners);
    const update = (layout: Layout) => {
      receivedSave = true;
      setStored({scope, layout});
      setError('');
    };
    listeners.add(update);

    const load = async () => {
      try {
        const storage = await import('expo-secure-store');
        const value = await storage.getItemAsync(scope);
        if (active && !receivedSave) setStored({scope, layout: parseGardenDecorations(value)});
      } catch {
        if (active && !receivedSave) setError('장식 배치를 불러오지 못했어요.');
      }
    };
    void load();
    return () => {
      active = false;
      listeners.delete(update);
      if (!listeners.size) layoutListeners.delete(scope);
    };
  }, [scope, retry]);

  async function save(layout: Layout) {
    if (!scope) return;
    const prior = pendingSaves.get(scope) ?? Promise.resolve();
    const write = prior.catch(() => undefined).then(async () => {
      const storage = await import('expo-secure-store');
      await storage.setItemAsync(scope, JSON.stringify(layout));
      layoutListeners.get(scope)?.forEach(listener => listener(layout));
    });
    pendingSaves.set(scope, write);
    try {
      await write;
    } finally {
      if (pendingSaves.get(scope) === write) pendingSaves.delete(scope);
    }
  }

  return {
    layout: stored && stored.scope === scope ? stored.layout : null,
    error,
    reload: () => {setError(''); setRetry(value => value + 1);},
    save,
  };
}

/** The foreground stays available to animals and their existing gesture handlers. */
export function GardenDecorationLayer({layout, activeFacility, facilityControl}: {
  layout: Layout | null;
  activeFacility?: {slot: number; cue: ReactNode};
  facilityControl?: (id: DecorationId, slot: number) => {label: string; press: () => void} | undefined;
}) {
  if (!layout) return null;
  return <View pointerEvents={facilityControl ? "box-none" : "none"} accessible={false} style={styles.layer}>
    {layout.map((id, index) => {
      const decoration = gardenDecorations.find(item => item.id === id);
      const control = decoration && facilityControl?.(decoration.id, index);
      const sprite = decoration && <Image accessible={false} source={decoration.source()} style={styles.sprite} resizeMode="contain" />;
      return <View key={positions[index]} pointerEvents="box-none" style={styles.slot}>
        {decoration && <>
          <View pointerEvents="none" style={styles.contactShadow} />
          {control ? <Pressable accessibilityRole="button" accessibilityLabel={control.label}
            hitSlop={2} onPress={control.press}>{sprite}</Pressable> : sprite}
          {activeFacility?.slot === index && <View pointerEvents="none" style={styles.facilityCue}>
            {activeFacility.cue}
          </View>}
        </>}
      </View>;
    })}
  </View>;
}

export function GardenDecorationEditor({layout, ownedIds, initialSlot = 0, suggestedId, onPreview, onSave, onClose, leaveEditorRef}: {
  layout: Layout;
  ownedIds?: ReadonlySet<string>;
  initialSlot?: number;
  suggestedId?: DecorationId;
  onPreview: (layout: Layout) => void;
  onSave: (layout: Layout) => Promise<void>;
  onClose: () => void;
  leaveEditorRef?: Ref<(navigate: () => void) => void>;
}) {
  const [draft, setDraft] = useState<Layout>(() => {
    const initial: Layout = [...layout];
    if (suggestedId && ownedIds?.has(suggestedId)) initial[initialSlot] = suggestedId;
    return initial;
  });
  const [slot, setSlot] = useState(initialSlot);
  const hasUnsavedChanges = draft.some((id, index) => id !== layout[index]);
  const available = ownedIds
    ? [...freeDecorations, ...gardenDecorations.filter(item => ownedIds.has(item.id))]
    : freeDecorations;
  const [saving, setSaving] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [failure, setFailure] = useState(false);
  const locked = useRef(false);
  const [history, setHistory] = useState<Array<{layout: Layout; slot: number}>>([]);

  const [redoHistory, setRedoHistory] = useState<typeof history>([]);

  function applyEdit(layout: Layout, nextSlot: number) {
    if (layout.every((id, index) => id === draft[index])) return;
    setHistory(previous => [...previous, {layout: draft, slot}]);
    setRedoHistory([]);
    setFailure(false);
    setDraft(layout);
    setSlot(nextSlot);
    onPreview(layout);
  }

  function select(id: DecorationId | null) {
    const result: Layout = [...draft];
    result[slot] = id;
    applyEdit(result, slot);
  }

  function move(target: number) {
    const result: Layout = [...draft];
    [result[slot], result[target]] = [result[target] ?? null, result[slot] ?? null];
    applyEdit(result, target);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setRedoHistory(next => [...next, {layout: draft, slot}]);
    setFailure(false);
    setDraft(previous.layout);
    setSlot(previous.slot);
    onPreview(previous.layout);
  }

  function redo() {
    const next = redoHistory.at(-1);
    if (!next) return;
    setRedoHistory(redoHistory.slice(0, -1));
    setHistory(previous => [...previous, {layout: draft, slot}]);
    setFailure(false);
    setDraft(next.layout);
    setSlot(next.slot);
    onPreview(next.layout);
  }

  async function save() {
    if (locked.current || !hasUnsavedChanges) return;
    locked.current = true;
    setSaving(true);
    setFailure(false);
    try {
      await onSave(draft);
      onClose();
    } catch {
      setFailure(true);
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  const continueEditing = useCallback(() => {
    pendingNavigation.current = null;
    setConfirmDiscard(false);
  }, []);

  const requestLeave = useCallback((navigate: () => void) => {
    if (locked.current) return;
    if (!hasUnsavedChanges) {
      onClose();
      navigate();
      return;
    }
    pendingNavigation.current = navigate;
    setConfirmDiscard(true);
  }, [hasUnsavedChanges, onClose]);

  useImperativeHandle(leaveEditorRef, () => requestLeave, [requestLeave]);

  const requestClose = useCallback(() => {
    if (confirmDiscard) continueEditing();
    else requestLeave(() => {});
  }, [confirmDiscard, continueEditing, requestLeave]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [requestClose]);

  if (confirmDiscard) return <View style={styles.editor}>
    <Text accessibilityRole="header" style={styles.heading}>변경을 버릴까요?</Text>
    <Text style={styles.saveStatus}>저장하지 않은 장식 배치가 사라져요.</Text>
    <View style={styles.actions}>
      <Button size="compact" variant="secondary" accessibilityLabel="정원 꾸미기 계속하기"
        onPress={continueEditing}>편집 계속</Button>
      <Button size="compact" variant="danger" accessibilityLabel="저장하지 않은 장식 변경 버리기"
        onPress={() => {
          const navigate = pendingNavigation.current;
          pendingNavigation.current = null;
          onClose();
          navigate?.();
        }}>변경 버리기</Button>
    </View>
  </View>;

  return <View style={styles.editor}>
    <Text style={styles.heading}>장식 위치</Text>
    <View style={styles.actions}>
      {positions.map((position, index) => {
        const name = gardenDecorations.find(item => item.id === draft[index])?.name ?? '비어 있음';
        return <Button key={position} size="compact"
          variant={index === slot ? 'primary' : 'secondary'} disabled={saving}
          accessibilityLabel={`장식 ${position} 위치 선택, ${name}`} onPress={() => setSlot(index)}>
          {`${position} · ${name}`}
        </Button>;
      })}
    </View>
    {draft[slot] && <View style={styles.actions}>
      {positions.map((position, index) => index === slot ? null : <Button key={position} size="compact"
        variant="secondary" disabled={saving}
        accessibilityLabel={draft[index] ? `${positions[slot]}·${position} 장식 맞바꾸기` : `장식을 ${position} 위치로 옮기기`}
        onPress={() => move(index)}>{draft[index] ? `${position} 장식과 교체` : `${position} 위치로 이동`}</Button>)}
    </View>}
    <View style={styles.actions}>
      {available.map(item => <Button key={item.id} size="compact"
        variant={draft[slot] === item.id ? 'primary' : 'secondary'} disabled={saving}
        accessibilityLabel={`${positions[slot]}에 ${item.name} 배치`} onPress={() => select(item.id)}>{item.name}</Button>)}
      <Button size="compact" variant="ghost" disabled={saving || draft[slot] === null}
        accessibilityLabel="선택한 장식 지우기" onPress={() => select(null)}>비우기</Button>
    </View>
    {hasUnsavedChanges && <Text accessibilityLiveRegion="polite" style={styles.saveStatus}>
      저장하지 않은 변경이 있어요.
    </Text>}
    {failure && hasUnsavedChanges && <Chip label="장식을 저장하지 못했어요. 다시 시도해 주세요." tone="danger"/>}
    <View style={styles.actions}>
      {history.length > 0 && <Button size="compact" variant="ghost" disabled={saving}
        accessibilityLabel="정원 장식 변경 되돌리기" onPress={undo}>되돌리기</Button>}
      {redoHistory.length > 0 && <Button size="compact" variant="ghost" disabled={saving}
        accessibilityLabel="되돌린 정원 장식 변경 다시 적용하기" onPress={redo}>다시 적용</Button>}
      <Button size="compact" variant="ghost" disabled={saving}
        accessibilityLabel="정원 꾸미기 취소" onPress={requestClose}>취소</Button>
      <Button size="compact" disabled={saving || !hasUnsavedChanges}
        accessibilityLabel="정원 장식 저장" onPress={() => void save()}>{saving ? '저장 중…' : failure ? '다시 저장' : '저장'}</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: {position:'absolute', top:'26%', left:12, right:12, flexDirection:'row'},
  slot: {flex:1, alignItems:'center'},
  sprite: {width:42, height:42},
  facilityCue: {position: 'absolute', top: -12, marginLeft: 32},
  contactShadow: {position:'absolute', bottom:1, width:30, height:7, borderRadius:8, backgroundColor:'rgba(38, 45, 29, 0.14)'},
  editor: {padding:10, gap:8, borderRadius:12, borderWidth:1, borderColor:colors.borderSoft},
  heading: {...typography.body, color:colors.textPrimary, fontWeight:'600'},
  saveStatus: {...typography.caption, color:colors.textSecondary},
  actions: {flexDirection:'row', flexWrap:'wrap', gap:6},
});
