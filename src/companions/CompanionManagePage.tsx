import {GardenBackground} from './GardenBackground';
import {GARDEN_BACKGROUNDS} from './gardenBackgrounds';
import {useMemo, useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import {BIBLE_FRIEND_DESIGN_CATALOG, type BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {Button, Chip, DangerConfirmSheet} from '../components/ui';
import {DEMO_SELL_PRICES, getSellQuote, MAX_GARDEN_FRIENDS, RARITY_LABELS} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

export function CompanionManagePage({onRevealDetails = () => {}}: {onRevealDetails?: () => void}) {
  const {state, dispatch, nextTransactionId} = useCompanions();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'owned' | 'duplicates' | 'all'>('owned');
  const [selected, setSelected] = useState<BibleFriendDesignId | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const saleLock = useRef(false);
  const design = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === selected);
  const count = selected ? state.inventory[selected] ?? 0 : 0;
  const quote = selected ? getSellQuote(state, selected, quantity) : null;
  const entries = useMemo(() => BIBLE_FRIEND_DESIGN_CATALOG.filter(d => filter === 'all' || (state.inventory[d.id] ?? 0) >= (filter === 'duplicates' ? 2 : 1)), [filter, state.inventory]);
  return <View style={s.page}>
    <View style={s.card}>
      <View style={s.between}><Text style={s.name}>정원에 배치한 친구</Text><Chip label={`${state.equipped.length}/${MAX_GARDEN_FRIENDS}`} tone="info" /></View>
      <View style={s.row}>{state.equipped.map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === id)?.name} 배치 해제`} onPress={() => dispatch({type: 'equip', designId: id})}><BibleFriendDesignSprite designId={id} size={48} /></Pressable>)}</View>
      <Text style={s.caption}>위 친구를 누르면 배치를 해제해요. 최대 5마리까지 함께할 수 있어요.</Text>
    </View>
    <View style={s.card}>
      <Text style={s.name}>정원 배경</Text>
      <Text style={s.caption}>배경은 캐릭터 공간에만 적용돼요. 지금은 모두 체험할 수 있어요.</Text>
      <View style={s.grid}>{GARDEN_BACKGROUNDS.map(background => <Pressable key={background.id}
        accessibilityRole="button" accessibilityLabel={`${background.name} 배경 적용`} accessibilityState={{selected: state.backgroundId === background.id}}
        onPress={() => dispatch({type: 'background', backgroundId: background.id})}
        style={[s.tile, state.backgroundId === background.id ? s.selected : null]}>
        <View style={{width: '100%', height: 72, overflow: 'hidden', borderRadius: 8}}><GardenBackground id={background.id} /></View>
        <Text style={s.name}>{background.name}{state.backgroundId === background.id ? ' · 적용 중' : ''}</Text>
        <Text style={s.caption}>{background.description}</Text>
      </Pressable>)}</View>
    </View>
    <View style={s.tabs}>{([['owned', '보유'], ['duplicates', '중복'], ['all', '전체 도감']] as const).map(([key, text]) => <Button key={key} accessibilityLabel={`${text} 보기`} onPress={() => {setFilter(key); setPage(0);}} variant={key === filter ? 'primary' : 'secondary'} size="compact">{text}</Button>)}</View>
    <Text style={s.caption}>보유 {Object.values(state.inventory).filter(n => n && n > 0).length} / {BIBLE_FRIEND_DESIGN_CATALOG.length}종 · 중복은 개수로 표시해요</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
    {entries.length === 0 ? <View style={s.card}><Text style={s.body}>중복된 친구가 없어요</Text></View> : null}
    {design ? <View style={s.card}>
      <View style={s.detail}><BibleFriendDesignSprite designId={design.id} motion="happy" size={144} /><Text style={s.title}>{design.name}</Text><Text style={s.body}>{RARITY_LABELS[design.rarity]} · {count}마리 보유</Text></View>
      <Button accessibilityLabel="선택한 동물 상세 닫기" variant="ghost" onPress={() => setSelected(null)}>상세 닫기</Button>
      <Button accessibilityLabel={state.equipped.includes(design.id) ? '정원에서 빼기' : '정원에 배치하기'}
        disabled={count < 1 || (!state.equipped.includes(design.id) && state.equipped.length >= MAX_GARDEN_FRIENDS)}
        onPress={() => dispatch({type: 'equip', designId: design.id})}>
        {state.equipped.includes(design.id) ? '정원에서 빼기' : state.equipped.length >= MAX_GARDEN_FRIENDS ? '정원이 가득 찼어요' : '정원에 배치하기'}
      </Button>
      <Text style={s.caption}>마지막 한 마리는 남겨두고 중복만 판매해요. 배치 중인 친구도 한 마리가 유지돼요.</Text>
      <Text style={s.caption}>체험 판매가 · {RARITY_LABELS[design.rarity]} 1마리 {DEMO_SELL_PRICES[design.rarity]}P (정식 가격 미확정)</Text>
      <View style={s.between}><Button accessibilityLabel="판매 수량 줄이기" disabled={quantity <= 1} onPress={() => setQuantity(n => n - 1)} variant="secondary">−</Button><Text style={s.name}>{quantity}마리</Text><Button accessibilityLabel="판매 수량 늘리기" disabled={quantity >= count - 1} onPress={() => setQuantity(n => n + 1)} variant="secondary">+</Button></View>
      <Button accessibilityLabel="중복 동물 판매 확인" variant="secondary" disabled={!quote} onPress={() => {saleLock.current = false; setConfirming(true);}}>{quote ? `${quantity}마리 판매 · ${quote.points}P` : '판매할 중복이 없어요'}</Button>
    </View> : null}
    <View style={s.grid}>{entries.slice(page * 12, (page + 1) * 12).map(item => {
      const owned = state.inventory[item.id] ?? 0;
      const equipped = state.equipped.includes(item.id);
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${owned}마리 보유${equipped ? ', 배치 중' : ''}, 상세 보기`}
        onPress={() => {setSelected(item.id); setQuantity(1); setConfirming(false); setMessage(''); onRevealDetails();}}
        style={[s.tile, selected === item.id ? s.selected : null]}>
        <BibleFriendDesignSprite designId={item.id} size={92} />
        <Text style={s.name}>{item.name}</Text><Chip label={RARITY_LABELS[item.rarity]} />
        <Text style={s.caption}>{owned ? `${owned}마리${equipped ? ' · 배치 중' : ''}` : '아직 만나지 못했어요'}</Text>
      </Pressable>;
    })}</View>
    {entries.length > 12 ? <View style={s.between}><Button accessibilityLabel="이전 동물 목록" variant="secondary" disabled={page === 0} onPress={() => setPage(n => n - 1)}>이전</Button><Text style={s.caption}>{page + 1} / {Math.ceil(entries.length / 12)}</Text><Button accessibilityLabel="다음 동물 목록" variant="secondary" disabled={(page + 1) * 12 >= entries.length} onPress={() => setPage(n => n + 1)}>다음</Button></View> : null}
    <DangerConfirmSheet visible={confirming && Boolean(design)} title="중복 친구를 판매할까요?" message={`${design?.name ?? ''} ${quantity}마리를 판매하고 체험 포인트 ${quote?.points ?? 0}P를 받아요.`}
      dangerSummary="판매한 수량은 되돌릴 수 없어요. 마지막 한 마리는 유지돼요." confirmLabel="판매하기" onCancel={() => setConfirming(false)}
      onConfirm={() => {
        if (saleLock.current || !selected || !quote) return;
        saleLock.current = true;
        dispatch({type: 'sell', designId: selected, quantity, transactionId: nextTransactionId('sale')});
        setMessage(`${quantity}마리 판매 · ${quote.points}P를 받았어요 (체험)`); setConfirming(false); setQuantity(1); setPage(0);
      }} />
  </View>;
}
