import {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {BibleFriendFarmSprite} from '../characters/BibleFriendFarmSprite';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {GardenBackground} from './GardenBackground';
import type {FriendGardenApi, FriendGardenPage, FriendGardenVisit} from './friendGardenContract';

export function FriendGardenPanel({api, onClose}: {api: FriendGardenApi; onClose: () => void}) {
  const [page, setPage] = useState<FriendGardenPage | null>(null);
  const [visit, setVisit] = useState<FriendGardenVisit | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const locked = useRef(false);



  async function perform<T>(work: () => Promise<T>, apply: (result: T) => void, failure: string) {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++request.current;
    setBusy(true);
    setError('');
    try {
      const value = await work();
      if (ticket === request.current) apply(value);
    } catch {
      if (ticket === request.current) setError(failure);
    } finally {
      if (ticket === request.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    void perform(() => api.list(), setPage, '농장 목록을 불러오지 못했어요.');
    return () => {request.current++; locked.current = false;};
  }, [api]);

  const load = (after = 0) => perform(() => api.list(after), setPage, '농장 목록을 불러오지 못했어요.');

  return <View style={styles.panel}>
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>{visit ? visit.name + '님의 농장' : '친구 농장'}</Text>
      <Button size="compact" variant="ghost" accessibilityLabel="친구 농장 닫기" onPress={onClose}>닫기</Button>
    </View>
    {busy && <Text accessibilityLiveRegion="polite" style={styles.caption}>불러오는 중…</Text>}
    {error !== '' && <Text accessibilityRole="alert" style={styles.caption}>{error}</Text>}
    {visit ? <>
      <View style={styles.scene}>
        <GardenBackground id={visit.backgroundId} />
        <View style={styles.animalBounds}>{visit.animals.map((animal, index) => <View key={index} pointerEvents="none" style={[
          styles.animal, {left: `${animal.x * 100}%`, top: `${animal.y * 100}%`},
        ]}>
          <BibleFriendFarmSprite designId={animal.designId} evolutionStage={animal.stage} size={56} reduceMotion />
        </View>)}</View>
      </View>
      <Button size="compact" variant="secondary" accessibilityLabel="친구 농장 목록으로" onPress={() => setVisit(null)}>목록으로</Button>
    </> : page ? <>
      <View style={styles.row}>
        <Text style={styles.caption}>{page.visible ? '같은 캠퍼스에 공개 중' : '내 농장은 비공개예요'}</Text>
        <Button size="compact" variant="secondary" disabled={busy} accessibilityLabel="내 농장 공개 설정"
          onPress={() => void perform(() => api.setVisibility(!page.visible),
            visible => setPage({...page, visible}), '공개 설정을 저장하지 못했어요.')}>
          {page.visible ? '비공개로 바꾸기' : '같은 캠퍼스에 공개'}
        </Button>
      </View>
      {page.items.length === 0 && <Text style={styles.caption}>공개한 친구 농장이 아직 없어요.</Text>}
      {page.items.map(friend => <View key={friend.userId} style={[styles.row, styles.friend]}>
        <Text style={styles.name}>{friend.name}</Text>
        <Button size="compact" variant="secondary" disabled={busy}
          accessibilityLabel={friend.name + '님 농장 방문'}
          onPress={() => void perform(() => api.visit(friend.userId), setVisit, '지금은 이 농장을 방문할 수 없어요.')}>방문</Button>
      </View>)}
      <View style={styles.row}>
        <Button size="compact" variant="ghost" disabled={busy} accessibilityLabel="친구 농장 새로고침"
          onPress={() => void load()}>새로고침</Button>
        {page.nextCursor !== null && <Button size="compact" variant="secondary" disabled={busy}
          accessibilityLabel="다음 친구 농장 목록" onPress={() => void load(page.nextCursor ?? 0)}>다음 목록</Button>}
      </View>
    </> : !busy && <Button size="compact" variant="secondary" accessibilityLabel="친구 농장 다시 불러오기"
      onPress={() => void load()}>다시 시도</Button>}
  </View>;
}

const styles = StyleSheet.create({
  panel: {padding:12, gap:8, borderRadius:16, borderWidth:1, borderColor:colors.borderSoft, backgroundColor:colors.surface},
  row: {flexDirection:'row', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8},
  title: {...typography.body, color:colors.textPrimary, fontWeight:'700', flexShrink:1},
  caption: {...typography.caption, color:colors.textSecondary},
  name: {...typography.body, color:colors.textPrimary, flexShrink:1},
  friend: {borderTopWidth:1, borderColor:colors.borderSoft, paddingTop:6},
  scene: {height:144, overflow:'hidden', borderRadius:10},
  animalBounds: {position:'absolute', left:0, top:0, right:56, bottom:56},
  animal: {position:'absolute'},
});
