import {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {BibleFriendFarmSprite} from '../characters/BibleFriendFarmSprite';
import {FaithLogApiError} from '../api/apiError';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {GardenBackground} from './GardenBackground';
import type {CampusGardenGoal, FriendGardenApi, FriendGardenPage, FriendGardenVisit} from './friendGardenContract';

export function FriendGardenPanel({api, onClose}: {api: FriendGardenApi; onClose: () => void}) {
  const [goal, setGoal] = useState<CampusGardenGoal | null>(null);
  const goalRequest = useRef(0);
  const [page, setPage] = useState<FriendGardenPage | null>(null);
  const [visit, setVisit] = useState<FriendGardenVisit | null>(null);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [helped, setHelped] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const locked = useRef(false);

  const refreshGoal = useCallback(async () => {
    const ticket = ++goalRequest.current;
    try {
      const result = await api.weeklyGoal();
      if (ticket === goalRequest.current) setGoal(result);
    } catch {
      if (ticket === goalRequest.current) setGoal(null);
    }
  }, [api]);

  async function perform<T>(work: () => Promise<T>, apply: (result: T) => void, failure: string) {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++request.current;
    setBusy(true);
    setError('');
    try {
      const value = await work();
      if (ticket === request.current) apply(value);
    } catch (cause) {
      if (ticket === request.current) {
        const code = cause instanceof FaithLogApiError ? cause.detail.code : '';
        setError(code === 'COMPANION_FRIEND_HELP_LIMIT' ? '오늘 줄 수 있는 도움을 썼거나, 이 동물이 이미 도움을 받았어요.'
          : code === 'COMPANION_CARE_UNAVAILABLE' ? '이 동물은 지금 그 도움이 필요하지 않아요.' : failure);
      }
    } finally {
      if (ticket === request.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    void perform(() => api.list(), setPage, '농장 목록을 불러오지 못했어요.');
    void refreshGoal();
    return () => {request.current++; goalRequest.current++; locked.current = false;};
  }, [api, refreshGoal]);

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
        <View style={styles.animalBounds}>{visit.animals.map(animal => <View key={animal.slot} pointerEvents="none" style={[
          styles.animal, {left: `${animal.x * 100}%`, top: `${animal.y * 100}%`},
        ]}>
          <BibleFriendFarmSprite designId={animal.designId} evolutionStage={animal.stage} size={56} reduceMotion />
          <Text style={styles.slotNumber}>{animal.slot}</Text>
        </View>)}</View>
      </View>
      {visit.animals.length > 0 && <>
        <Text style={styles.caption}>{helped ? '오늘의 도움을 보냈어요.' : '하루 한 번 친구 동물을 도울 수 있어요.'}</Text>
        <View style={styles.row}>
          {visit.animals.map(animal => <Button key={animal.slot} size="compact"
            variant={slot === animal.slot ? 'primary' : 'secondary'} disabled={busy || helped}
            accessibilityLabel={`${animal.slot}번 동물 선택`} onPress={() => setSlot(animal.slot)}>
            {`${animal.slot}번`}
          </Button>)}
        </View>
        {ownerId !== null && slot !== null && !helped && <View style={styles.row}>
          {(['FEED', 'CLEAN'] as const).map(action => <Button key={action} size="compact" disabled={busy}
            accessibilityLabel={action === 'FEED' ? '먹이 도움 보내기' : '청소 도움 보내기'}
            onPress={() => void perform(() => api.help(ownerId, slot, action), () => {setHelped(true); void refreshGoal();}, '도움 결과를 확인하지 못했어요.')}>
            {action === 'FEED' ? '먹이 주기' : '청소하기'}
          </Button>)}
        </View>}
      </>}
      <Button size="compact" variant="secondary" accessibilityLabel="친구 농장 목록으로" disabled={busy} onPress={() => {setVisit(null); setSlot(null); setError('');}}>목록으로</Button>
    </> : page ? <>
      {goal && <View style={styles.goal}>
        <View style={styles.row}>
          <Text accessibilityRole="header" style={styles.name}>이번 주 캠퍼스 돌봄 목표</Text>
          <Text style={styles.caption}>{goal.participants >= goal.target ? '목표 달성' : `${goal.participants} / ${goal.target}명`}</Text>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel="캠퍼스 돌봄 목표 진행률"
          accessibilityValue={{min: 0, max: goal.target, now: Math.min(goal.participants, goal.target)}}
          style={styles.goalTrack}>
          <View style={[styles.goalFill, {width: `${Math.min(goal.participants / goal.target, 1) * 100}%`}]} />
        </View>
        <Text style={styles.caption}>
          {goal.startsOn.slice(5).replace('-', '/')}–{goal.endsOn.slice(5).replace('-', '/')} · {goal.contributed
            ? '이번 주 목표에 참여했어요.' : '친구 동물을 도우면 한 명으로 집계돼요.'}
        </Text>
      </View>}

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
          onPress={() => void perform(() => api.visit(friend.userId), data => {setOwnerId(friend.userId); setVisit(data);}, '지금은 이 농장을 방문할 수 없어요.')}>방문</Button>
      </View>)}
      <View style={styles.row}>
        <Button size="compact" variant="ghost" disabled={busy} accessibilityLabel="친구 농장 새로고침"
          onPress={() => {void load(); void refreshGoal();}}>새로고침</Button>
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
  goal: {gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft},
  goalTrack: {height: 8, borderRadius: 4, backgroundColor: colors.borderSoft, overflow: 'hidden'},
  goalFill: {height: '100%', backgroundColor: colors.primary},
  name: {...typography.body, color:colors.textPrimary, flexShrink:1},
  friend: {borderTopWidth:1, borderColor:colors.borderSoft, paddingTop:6},
  scene: {height:144, overflow:'hidden', borderRadius:10},
  animalBounds: {position:'absolute', left:0, top:0, right:56, bottom:56},
  animal: {position:'absolute'},
  slotNumber: {...typography.caption, position:'absolute', top:0, right:0, minWidth:18, textAlign:'center', borderRadius:9, color:colors.primary, backgroundColor:colors.surface},
});
