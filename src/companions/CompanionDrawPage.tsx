import {useCallback, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import {type BibleFriendDesign} from '../characters/bibleFriendDesignCatalog';
import {BIBLE_FRIEND_DEFAULT_DRAW_POOL, pickBibleFriendDesign} from '../characters/bibleFriendDesignDraw';
import {Button, Chip} from '../components/ui';
import {CompanionDrawScene} from './CompanionDrawScene';
import {DRAW_COST, RARITY_LABELS} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

export function CompanionDrawPage({onManage, onMissions}: {onManage: () => void; onMissions: () => void}) {
  const {state, dispatch, nextTransactionId} = useCompanions();
  const [results, setResults] = useState<readonly BibleFriendDesign[]>([]);
  const [playing, setPlaying] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const complete = useCallback(() => {setPlaying(false); locked.current = false;}, []);
  const draw = (count: 1 | 10) => {
    if (locked.current) return;
    if (state.points < count * DRAW_COST) {setMessage('포인트가 부족해요. 미션에서 포인트를 모아보세요.'); return;}
    locked.current = true;
    // Preview only. The real server response replaces this selection and debit together.
    const selected = Array.from({length: count}, () => pickBibleFriendDesign(BIBLE_FRIEND_DEFAULT_DRAW_POOL, Math.random()));
    dispatch({type: 'draw', results: selected.map(d => d.id), transactionId: nextTransactionId('draw')});
    setResults(selected); setMessage(''); setPlaying(true);
  };
  return <View style={s.page}>
    <View style={s.card}><View style={s.between}><Text style={s.name}>친구를 만날 포인트</Text><Chip label="체험" tone="info" /></View><Text accessibilityLiveRegion="polite" style={s.points}>{state.points.toLocaleString()} P</Text><Text style={s.caption}>1개 {DRAW_COST}P · 10개 {DRAW_COST * 10}P</Text></View>
    {playing ? <CompanionDrawScene designs={results} onComplete={complete} /> : results.length ? <View style={s.stack}>
      <Text accessibilityLiveRegion="polite" style={s.title}>친구 {results.length}마리를 만났어요!</Text>
      <View style={s.grid}>{results.map((design, index) => {
        const inBatch = results.slice(0, index + 1).filter(d => d.id === design.id).length;
        const previousCount = (state.inventory[design.id] ?? 0) - results.filter(d => d.id === design.id).length;
        const fresh = previousCount === 0 && inBatch === 1;
        return <View style={s.tile} key={`${index}-${design.id}`}><BibleFriendDesignSprite designId={design.id} motion="happy" elapsedMs={240} size={112} /><Text style={s.name}>{design.name}</Text><Chip label={`${RARITY_LABELS[design.rarity]} · ${fresh ? '새 친구' : '중복'}`} tone={fresh ? 'success' : 'default'} /><Text style={s.caption}>총 {state.inventory[design.id] ?? 0}마리 보유</Text></View>;
      })}</View>
      <View style={s.row}><View style={s.action}><Button accessibilityLabel="뽑은 동물 관리하기" onPress={onManage} variant="secondary" fullWidth>동물 관리</Button></View><View style={s.action}><Button accessibilityLabel="뽑기 결과 닫기" onPress={() => setResults([])} fullWidth>확인</Button></View></View>
    </View> : <View style={s.card}><Text style={s.title}>어떤 친구를 만나게 될까요?</Text><View style={[s.row, {justifyContent: 'center'}]}>{(['david-lamb:base', 'hope-rabbit:starlight', 'daniel-lion:unique'] as const).map(id => <BibleFriendDesignSprite key={id} designId={id} size={76} />)}</View><Text style={s.body}>13종의 동물, 130가지 모습이 기다려요. 중복으로 만난 친구는 관리 화면에서 정리할 수 있어요.</Text></View>}
    {!playing ? <>
      {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
      <View style={s.row}>{([1, 10] as const).map(count => <View key={count} style={s.action}><Button accessibilityLabel={`${count}개 뽑기 ${count * DRAW_COST}포인트`} fullWidth disabled={state.points < count * DRAW_COST} onPress={() => draw(count)} variant={count === 10 ? 'primary' : 'secondary'}>{count}개 뽑기 · {count * DRAW_COST}P</Button></View>)}</View>
      {state.points < DRAW_COST ? <Button accessibilityLabel="포인트를 모으러 미션으로 이동" onPress={onMissions}>미션으로 포인트 모으기</Button> : null}
      <Button accessibilityLabel="등장 확률 안내 펼치기" onPress={() => setShowOdds(value => !value)} variant="ghost">{showOdds ? '등장 확률 닫기' : '등장 확률 보기'}</Button>
      {showOdds ? <View style={s.card}>{Object.entries(BIBLE_FRIEND_DEFAULT_DRAW_POOL.rarityWeights).map(([rarity, weight]) => <View key={rarity} style={s.between}><Text style={s.body}>{RARITY_LABELS[rarity as keyof typeof RARITY_LABELS]}</Text><Text style={s.body}>{(weight / BIBLE_FRIEND_DEFAULT_DRAW_POOL.totalWeight * 100).toFixed(0)}%</Text></View>)}<Text style={s.caption}>유니크 1%는 13종 합산이에요. 10개도 개별 추첨이며 등급 보장은 없어요. 현재는 에셋 설정을 사용하는 체험 확률이에요.</Text></View> : null}
    </> : null}
    <Text style={s.caption}>체험 포인트·보유 목록은 로그인 세션 동안만 유지돼요. 실제 지급과 저장은 서버 연결 후 사용할 수 있어요.</Text>
  </View>;
}
