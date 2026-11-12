import {useCallback, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import {BIBLE_FRIEND_DESIGN_CATALOG, type BibleFriendDesign} from '../characters/bibleFriendDesignCatalog';
import {BIBLE_FRIEND_DEFAULT_DRAW_POOL, pickBibleFriendDesign} from '../characters/bibleFriendDesignDraw';
import {Button, Chip} from '../components/ui';
import {CompanionDrawScene} from './CompanionDrawScene';
import {DRAW_COST, RARITY_LABELS} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

export function CompanionDrawPage({onManage, onMissions}: {onManage: () => void; onMissions: () => void}) {
  const {state, dispatch, nextTransactionId,server,busy,error,serverSnapshot,executeDraw} = useCompanions();
  const unitCost=serverSnapshot?.pool?.unitCost??DRAW_COST;
  const [results, setResults] = useState<readonly BibleFriendDesign[]>([]);
  const [playing, setPlaying] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const complete = useCallback(() => {setPlaying(false); locked.current = false;}, []);
  const draw = async (count: 1 | 10) => {
    if (locked.current) return;
    if (state.points < count * unitCost) {setMessage('포인트가 부족해요. 미션에서 포인트를 모아보세요.'); return;}
    locked.current = true;
    if(server) {
      try {const ids=await executeDraw!(count);setResults(ids.map(id=>BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===id)!));setMessage('');setPlaying(true);}
      catch {setMessage('뽑기 결과를 새로 확인해주세요. 이미 처리된 거래는 중복 차감되지 않아요.');locked.current=false;}
      return;
    }
    // Preview only. The real server response replaces this selection and debit together.
    const selected = Array.from({length: count}, () => pickBibleFriendDesign(BIBLE_FRIEND_DEFAULT_DRAW_POOL, Math.random()));
    dispatch({type: 'draw', results: selected.map(d => d.id), transactionId: nextTransactionId('draw')});
    setResults(selected); setMessage(''); setPlaying(true);
  };
  return <View style={s.page}>
    {playing ? <CompanionDrawScene designs={results} onComplete={complete} /> : results.length ? <View style={s.stack}>
      <Text accessibilityLiveRegion="polite" style={s.title}>친구 {results.length}마리를 만났어요!</Text>
      <View style={s.grid}>{results.map((design, index) => {
        const inBatch = results.slice(0, index + 1).filter(d => d.id === design.id).length;
        const previousCount = (state.inventory[design.id] ?? 0) - results.filter(d => d.id === design.id).length;
        const fresh = previousCount === 0 && inBatch === 1;
        return <View style={s.tile} key={`${index}-${design.id}`}><BibleFriendDesignSprite designId={design.id} motion="happy" elapsedMs={240} size={112} /><Text style={s.name}>{design.name}</Text><Chip label={`${RARITY_LABELS[design.rarity]} · ${fresh ? '새 친구' : '중복'}`} tone={fresh ? 'success' : 'default'} /><Text style={s.caption}>총 {state.inventory[design.id] ?? 0}마리 보유</Text></View>;
      })}</View>
      <View style={s.row}><View style={s.action}><Button accessibilityLabel="뽑은 동물 관리하기" onPress={onManage} variant="secondary" fullWidth>동물 관리</Button></View><View style={s.action}><Button accessibilityLabel="뽑기 결과 닫기" onPress={() => setResults([])} fullWidth>확인</Button></View></View>
    </View> : <View style={s.hero}><Chip label="13종 · 130가지 모습" tone="info" /><Text style={[s.title, s.centerText]}>작은 정원에 찾아올{'\n'}새로운 친구</Text><View style={[s.row, {justifyContent: 'center'}]}>{(['david-lamb:base', 'hope-rabbit:starlight', 'daniel-lion:unique'] as const).map(id => <BibleFriendDesignSprite key={id} designId={id} size={80} />)}</View><Text style={[s.body, s.centerText]}>작은 실천으로 모은 포인트로{'\n'}나만의 친구를 만나보세요.</Text><Text style={s.eyebrow}>한 번의 만남 · {unitCost}P</Text></View>}
    {!playing ? <>
      {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
      <View style={s.row}>{([1, 10] as const).map(count => <View key={count} style={s.action}><Button accessibilityLabel={`${count}개 뽑기 ${count * unitCost}포인트`} fullWidth disabled={busy || Boolean(error) || server && !serverSnapshot?.pool || state.points < count * unitCost} onPress={() => void draw(count)} variant={count === 10 ? 'primary' : 'secondary'}>{count}개 뽑기{'\n'}{(count * unitCost).toLocaleString()} P</Button></View>)}</View>
      {state.points < unitCost ? <Button accessibilityLabel="포인트를 모으러 미션으로 이동" onPress={onMissions}>미션으로 포인트 모으기</Button> : null}
      <Button fullWidth size="compact" accessibilityLabel="등장 확률 안내 펼치기" onPress={() => setShowOdds(value => !value)} variant="ghost">{showOdds ? '등장 확률 닫기' : '등장 확률 보기'}</Button>
      {showOdds ? <View style={s.card}>{Object.entries(server && serverSnapshot?.pool ? serverSnapshot.pool.entries.reduce<Record<string,number>>((totals,e)=>{const r=BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===e.designId)!.rarity;totals[r]=(totals[r]??0)+e.weight;return totals;},{}) : BIBLE_FRIEND_DEFAULT_DRAW_POOL.rarityWeights).map(([rarity, weight]) => <View key={rarity} style={s.between}><Text style={s.body}>{RARITY_LABELS[rarity as keyof typeof RARITY_LABELS]}</Text><Text style={s.body}>{(weight / (serverSnapshot?.pool?.totalWeight ?? BIBLE_FRIEND_DEFAULT_DRAW_POOL.totalWeight) * 100).toFixed(0)}%</Text></View>)}<Text style={s.caption}>유니크 1%는 13종 합산이에요. 10개도 개별 추첨이며 등급 보장은 없어요. {server ? '서버의 현재 뽑기 확률이에요.' : '현재는 에셋 설정을 사용하는 체험 확률이에요.'}</Text></View> : null}
    </> : null}
    {server ? <><Button size="compact" variant="ghost" accessibilityLabel="최근 뽑기 기록 보기" onPress={()=>setShowHistory(v=>!v)}>최근 뽑기 기록</Button>{showHistory?<View style={s.card}>{serverSnapshot?.history.length?serverSnapshot.history.map(h=><Text style={s.caption} key={h.result.operationId}>{new Date(h.createdAt).toLocaleString()} · {h.result.designIds.map(id=>BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===id)?.name).join(', ')} · {h.result.pointDelta}P</Text>):<Text style={s.caption}>아직 뽑기 기록이 없어요.</Text>}</View>:null}</>:null}
    <Text style={[s.caption, s.centerText]}>중복 친구는 동물 관리에서 판매할 수 있어요.{'\n'}10개 뽑기도 각각 추첨하며 등급 보장은 없어요.</Text>
  </View>;
}
