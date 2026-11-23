import {useEffect, useRef, useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {freeDecorations, gardenDecorations, type DecorationId} from './gardenDecorationCatalog';
import {Button, Chip} from '../components/ui';
import {colors, typography} from '../theme';

export type GardenDecorationLayout = [DecorationId | null, DecorationId | null, DecorationId | null];
type Layout = GardenDecorationLayout;
const positions = ['왼쪽', '가운데', '오른쪽'] as const;
const emptyLayout: Layout = [null, null, null];

export function parseGardenDecorations(value: string | null): Layout {
  let parsed: unknown;
  try {parsed = value === null ? null : JSON.parse(value);} catch {return emptyLayout;}
  if (!Array.isArray(parsed) || parsed.length !== positions.length) return emptyLayout;
  const read = (index: number) => freeDecorations.find(item => item.id === parsed[index])?.id ?? null;
  return [read(0), read(1), read(2)];
}

export function useGardenDecorations(scope?: string) {
  const [stored, setStored] = useState<{scope: string | undefined; layout: Layout} | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    if (!scope) return;
    const load = async () => {
      try {
        const storage = await import('expo-secure-store');
        const value = await storage.getItemAsync(scope);
        if (current === generation.current) setStored({scope, layout: parseGardenDecorations(value)});
      } catch {
        if (current === generation.current) setError('장식 배치를 불러오지 못했어요.');
      }
    };
    void load();
    return () => {generation.current++;};
  }, [scope, retry]);

  async function save(layout: Layout) {
    if (!scope) return;
    const current = generation.current;
    const storage = await import('expo-secure-store');
    await storage.setItemAsync(scope, JSON.stringify(layout));
    if (current === generation.current) setStored({scope, layout});
  }

  return {
    layout: stored && stored.scope === scope ? stored.layout : null,
    error,
    reload: () => {setError(''); setRetry(value => value + 1);},
    save,
  };
}

/** The foreground stays available to animals and their existing gesture handlers. */
export function GardenDecorationLayer({layout}: {layout: Layout | null}) {
  if (!layout) return null;
  return <View pointerEvents="none" accessible={false} style={styles.layer}>
    {layout.map((id, index) => {
      const decoration = gardenDecorations.find(item => item.id === id);
      return <View key={positions[index]} style={styles.slot}>
        {decoration && <>
          <View style={styles.contactShadow} />
          <Image accessible={false} source={decoration.source()} style={styles.sprite} resizeMode="contain" />
        </>}
      </View>;
    })}
  </View>;
}

export function GardenDecorationEditor({layout, onPreview, onSave, onClose}: {
  layout: Layout;
  onPreview: (layout: Layout) => void;
  onSave: (layout: Layout) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(layout);
  const [slot, setSlot] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState(false);
  const locked = useRef(false);
  const select = (id: DecorationId | null) => {
    const result: Layout = [...draft];
    result[slot] = id;
    setDraft(result);
    onPreview(result);
  };

  async function save() {
    if (locked.current) return;
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

  return <View style={styles.editor}>
    <Text style={styles.heading}>장식 위치</Text>
    <View style={styles.actions}>
      {positions.map((position, index) => <Button key={position} size="compact"
        variant={index === slot ? 'primary' : 'secondary'} disabled={saving}
        accessibilityLabel={`장식 ${position} 위치 선택`} onPress={() => setSlot(index)}>{position}</Button>)}
    </View>
    <View style={styles.actions}>
      {freeDecorations.map(item => <Button key={item.id} size="compact"
        variant={draft[slot] === item.id ? 'primary' : 'secondary'} disabled={saving}
        accessibilityLabel={`${positions[slot]}에 ${item.name} 배치`} onPress={() => select(item.id)}>{item.name}</Button>)}
      <Button size="compact" variant="ghost" disabled={saving || draft[slot] === null}
        accessibilityLabel="선택한 장식 지우기" onPress={() => select(null)}>비우기</Button>
    </View>
    {failure && <Chip label="장식을 저장하지 못했어요. 다시 시도해 주세요." tone="danger"/>}
    <View style={styles.actions}>
      <Button size="compact" variant="ghost" disabled={saving}
        accessibilityLabel="정원 꾸미기 취소" onPress={onClose}>취소</Button>
      <Button size="compact" disabled={saving}
        accessibilityLabel="정원 장식 저장" onPress={() => void save()}>{saving ? '저장 중…' : '저장'}</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: {position:'absolute', top:'26%', left:12, right:12, flexDirection:'row'},
  slot: {flex:1, alignItems:'center'},
  sprite: {width:42, height:42},
  contactShadow: {position:'absolute', bottom:1, width:30, height:7, borderRadius:8, backgroundColor:'rgba(38, 45, 29, 0.14)'},
  editor: {padding:10, gap:8, borderRadius:12, borderWidth:1, borderColor:colors.borderSoft},
  heading: {...typography.body, color:colors.textPrimary, fontWeight:'600'},
  actions: {flexDirection:'row', flexWrap:'wrap', gap:6},
});
