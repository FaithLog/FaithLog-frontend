import {GardenBackground} from './GardenBackground';
import {GARDEN_BACKGROUNDS} from './gardenBackgrounds';
import {useMemo, useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import {BIBLE_FRIEND_DESIGN_CATALOG, BIBLE_FRIEND_DESIGN_SPECIES, BIBLE_FRIEND_RARITIES, type BibleFriendRarity, type BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {Button, Chip, DangerConfirmSheet, TextField} from '../components/ui';
import {DEMO_SELL_PRICES, getSellQuote, MAX_GARDEN_FRIENDS, RARITY_LABELS} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

export function CompanionManagePage({onRevealDetails = () => {}}: {onRevealDetails?: () => void}) {
  const {state, dispatch, nextTransactionId} = useCompanions();
  const [page, setPage] = useState(0);
  const [section, setSection] = useState<'friends' | 'backgrounds'>('friends');
  const [filter, setFilter] = useState<'owned' | 'duplicates' | 'all'>('owned');
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<BibleFriendRarity | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<'catalog' | 'rarity' | 'count'>('catalog');
  const [selected, setSelected] = useState<BibleFriendDesignId | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const saleLock = useRef(false);
  const design = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === selected);
  const count = selected ? state.inventory[selected] ?? 0 : 0;
  const quote = selected ? getSellQuote(state, selected, quantity) : null;
  const ownedCount = Object.values(state.inventory).filter(n => n && n > 0).length;
  const duplicateCount = Object.values(state.inventory).reduce<number>((sum, n) => sum + Math.max(0, (n ?? 0) - 1), 0);
  const entries = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const items = BIBLE_FRIEND_DESIGN_CATALOG.filter(d => {
      const species = BIBLE_FRIEND_DESIGN_SPECIES.find(item => item.id === d.friendId)?.name ?? '';
      return (filter === 'all' || (state.inventory[d.id] ?? 0) >= (filter === 'duplicates' ? 2 : 1))
        && (rarity === 'all' || rarity === d.rarity)
        && (!search || `${d.name} ${species} ${RARITY_LABELS[d.rarity]}`.toLocaleLowerCase().includes(search));
    });
    if (sort === 'rarity') items.sort((a,b) => BIBLE_FRIEND_RARITIES.indexOf(b.rarity) - BIBLE_FRIEND_RARITIES.indexOf(a.rarity));
    if (sort === 'count') items.sort((a,b) => (state.inventory[b.id] ?? 0) - (state.inventory[a.id] ?? 0));
    return items;
  }, [filter, state.inventory, query, rarity, sort]);
  const pageCount = Math.max(1, Math.ceil(entries.length / 12));
  const visiblePage = Math.min(page, pageCount - 1);
  return <View style={s.page}>
    <View style={s.row}>{([['friends', '친구'], ['backgrounds', '배경']] as const).map(([key,label]) => <Button key={key} size="compact" accessibilityLabel={`${label} 관리 보기`} variant={section === key ? 'primary' : 'ghost'} onPress={() => {setSection(key); setSelected(null); setConfirming(false);}}>{label}</Button>)}</View>
    {section === 'backgrounds' ? <View style={s.section}>
      <Text style={s.caption}>홈의 캐릭터 공간에만 적용돼요. 지금은 모든 배경을 체험할 수 있어요.</Text>
      <View style={s.grid}>{GARDEN_BACKGROUNDS.map(background => <Pressable key={background.id}
        accessibilityRole="button" accessibilityLabel={`${background.name} 배경 적용`} accessibilityState={{selected: state.backgroundId === background.id}}
        onPress={() => dispatch({type: 'background', backgroundId: background.id})}
        style={[s.collectionTile, state.backgroundId === background.id ? s.selectedBorder : null]}>
        <View style={{width: '100%', height: 82, overflow: 'hidden', borderRadius: 8}}><GardenBackground id={background.id} /></View>
        <Text style={s.name}>{background.name}</Text>
        <Text style={state.backgroundId === background.id ? s.eyebrow : s.caption}>{state.backgroundId === background.id ? '✓ 적용 중' : '눌러서 적용'}</Text>
      </Pressable>)}</View>
    </View> : <>

    {design ? <View style={s.card}>
      <View style={s.between}><Text style={s.name}>친구 상세</Text><Button size="compact" accessibilityLabel="선택한 동물 상세 닫기" variant="ghost" onPress={() => setSelected(null)}>닫기</Button></View>
      <View style={[s.row, {flexWrap:'nowrap'}]}><BibleFriendDesignSprite designId={design.id} motion="happy" size={88} /><View style={{flex:1,gap:8}}><Text style={s.title}>{design.name}</Text><Text style={s.body}>{RARITY_LABELS[design.rarity]} · {count}마리 보유</Text></View></View>
      <Button fullWidth accessibilityLabel={state.equipped.includes(design.id) ? '정원에서 빼기' : '정원에 배치하기'}
        disabled={count < 1 || (!state.equipped.includes(design.id) && state.equipped.length >= MAX_GARDEN_FRIENDS)}
        onPress={() => dispatch({type: 'equip', designId: design.id})}>
        {state.equipped.includes(design.id) ? '정원에서 빼기' : state.equipped.length >= MAX_GARDEN_FRIENDS ? '정원이 가득 찼어요' : '정원에 배치하기'}
      </Button>
      {count > 0 && !state.equipped.includes(design.id) && state.equipped.length >= MAX_GARDEN_FRIENDS ? <View style={s.notice}>
        <Text style={s.name}>누구와 교체할까요?</Text><Text style={s.caption}>아래 친구를 고르면 바로 교체돼요. 보유한 친구는 사라지지 않아요.</Text>
        <View style={[s.row, {gap:4}]}>{state.equipped.map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${BIBLE_FRIEND_DESIGN_CATALOG.find(item => item.id === id)?.name} 대신 ${design.name} 배치`} onPress={() => {dispatch({type:'replace', outgoingId:id, incomingId:design.id}); setMessage('정원의 친구를 교체했어요.');}}><BibleFriendDesignSprite designId={id} size={44} /></Pressable>)}</View>
      </View> : null}
      <Text style={s.name}>중복 친구 정리</Text><Text style={s.caption}>마지막 한 마리는 남겨두고 판매해요.</Text>
      <Text style={s.caption}>체험 판매가 · {RARITY_LABELS[design.rarity]} 1마리 {DEMO_SELL_PRICES[design.rarity]}P (정식 가격 미확정)</Text>
      {count > 1 ? <View style={s.row}><View style={[s.between, {flexGrow:1}]}><Button accessibilityLabel="판매 수량 줄이기" disabled={quantity <= 1} onPress={() => setQuantity(n => n - 1)} variant="secondary">−</Button><Text style={s.name}>{quantity}마리</Text><Button accessibilityLabel="판매 수량 늘리기" disabled={quantity >= count - 1} onPress={() => setQuantity(n => n + 1)} variant="secondary">+</Button></View><Button size="compact" variant="ghost" accessibilityLabel="판매 가능한 중복 모두 선택" disabled={count <= 1} onPress={() => setQuantity(count - 1)}>최대</Button></View> : null}
      <Button fullWidth accessibilityLabel="중복 동물 판매 확인" variant="secondary" disabled={!quote} onPress={() => {saleLock.current = false; setConfirming(true);}}>{quote ? `${quantity}마리 판매 · ${quote.points}P` : '판매할 중복이 없어요'}</Button>
    </View> : null}
    <View style={s.card}>
      <View style={s.between}><Text style={s.name}>정원에 배치한 친구</Text><Chip label={`${state.equipped.length}/${MAX_GARDEN_FRIENDS}`} tone="info" /></View>
      <View style={s.miniScene}><GardenBackground id={state.backgroundId} /><View style={[s.row, {justifyContent: 'center', gap: 2}]}>{state.equipped.map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === id)?.name} 배치 해제`} onPress={() => dispatch({type: 'equip', designId: id})}><BibleFriendDesignSprite designId={id} size={48} /></Pressable>)}</View></View>
      {state.equipped.length === 0 ? <Text style={s.caption}>아래 보유 목록에서 함께할 친구를 골라주세요.</Text> : <Text style={s.caption}>친구를 누르면 정원에서 빼요. 보유 목록은 유지돼요.</Text>}
      <View style={s.between}><Text style={s.eyebrow}>수집 {ownedCount}/{BIBLE_FRIEND_DESIGN_CATALOG.length}</Text><Text style={s.caption}>정리 가능한 중복 {duplicateCount}마리</Text></View>
      <View style={s.progressTrack}><View style={[s.progressFill, {width:`${ownedCount / BIBLE_FRIEND_DESIGN_CATALOG.length * 100}%`}]} /></View>
    </View>
    <View style={s.tabBar}>{([['owned', '보유'], ['duplicates', '중복'], ['all', '전체 도감']] as const).map(([key, text]) => <View key={key} style={s.tab}><Button fullWidth accessibilityLabel={`${text} 보기`} onPress={() => {setFilter(key); setPage(0); setSelected(null); setConfirming(false);}} variant={key === filter ? 'primary' : 'secondary'} size="compact">{text}</Button></View>)}</View>
    <TextField label="친구 찾기" accessibilityLabel="동물 이름 또는 의상 검색" placeholder="예: 토끼, 별빛, 유니크" value={query} onChangeText={value => {setQuery(value); setPage(0);}} />
    <View style={s.between}><Button size="compact" variant="ghost" accessibilityLabel="동물 등급 필터 펼치기" onPress={() => setShowFilters(value => !value)}>{rarity === 'all' ? '등급 필터' : RARITY_LABELS[rarity]}{showFilters ? ' ▴' : ' ▾'}</Button><Button size="compact" variant="ghost" accessibilityLabel="동물 목록 정렬 변경" onPress={() => {setSort(value => value === 'catalog' ? 'rarity' : value === 'rarity' ? 'count' : 'catalog'); setPage(0);}}>{sort === 'catalog' ? '기본순' : sort === 'rarity' ? '희귀순' : '보유 많은 순'} ↕</Button></View>
    {showFilters ? <View style={s.row}>{(['all', ...BIBLE_FRIEND_RARITIES] as const).map(value => <Button key={value} size="compact" variant={value === rarity ? 'primary' : 'secondary'} accessibilityLabel={`${value === 'all' ? '전체 등급' : RARITY_LABELS[value]} 필터`} onPress={() => {setRarity(value); setPage(0);}}>{value === 'all' ? '전체' : RARITY_LABELS[value]}</Button>)}</View> : null}
    <Text accessibilityLiveRegion="polite" style={s.caption}>{entries.length}종 · 이름을 누르면 상세를 볼 수 있어요.</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
    {entries.length === 0 ? <View style={s.card}><Text style={s.body}>{query.trim() || rarity !== 'all' ? '조건에 맞는 친구가 없어요' : filter === 'duplicates' ? '정리할 중복 친구가 없어요' : '아직 보유한 친구가 없어요'}</Text>{query.trim() || rarity !== 'all' ? <Button size="compact" accessibilityLabel="동물 검색과 등급 필터 초기화" variant="ghost" onPress={() => {setQuery(''); setRarity('all'); setPage(0);}}>검색 조건 지우기</Button> : null}</View> : null}
    <View style={s.grid}>{entries.slice(visiblePage * 12, (visiblePage + 1) * 12).map(item => {
      const owned = state.inventory[item.id] ?? 0;
      const equipped = state.equipped.includes(item.id);
      return <View key={item.id} style={[s.collectionTile, selected === item.id ? s.selectedBorder : null]}><Pressable style={s.detail} accessibilityRole="button" accessibilityLabel={`${item.name}, ${owned}마리 보유${equipped ? ', 배치 중' : ''}, 상세 보기`}
        onPress={() => {setSelected(item.id); setQuantity(1); setConfirming(false); setMessage(''); onRevealDetails();}}
>
        <BibleFriendDesignSprite designId={item.id} size={80} />
        <Text style={s.name}>{item.name}</Text><Chip label={RARITY_LABELS[item.rarity]} />
        <Text style={s.caption}>{owned ? `${owned}마리${equipped ? ' · 배치 중' : ''}` : '아직 만나지 못했어요'}</Text>
      </Pressable>
      {owned > 0 ? <Button fullWidth size="compact" variant={equipped ? 'secondary' : 'ghost'} accessibilityLabel={`${item.name} ${equipped ? '바로 배치 해제' : '바로 배치'}`} onPress={() => {
        if (!equipped && state.equipped.length >= MAX_GARDEN_FRIENDS) {setSelected(item.id); setQuantity(1); setConfirming(false); onRevealDetails();}
        else {dispatch({type:'equip',designId:item.id}); setMessage(equipped ? '정원에서 친구를 뺐어요.' : '정원에 친구를 배치했어요.');}
      }}>{equipped ? '배치 해제' : state.equipped.length >= MAX_GARDEN_FRIENDS ? '교체하기' : '배치하기'}</Button> : <Text style={s.caption}>미보유</Text>}
      </View>;
    })}</View>
    {entries.length > 12 ? <View style={s.between}><Button accessibilityLabel="이전 동물 목록" variant="secondary" disabled={visiblePage === 0} onPress={() => setPage(visiblePage - 1)}>이전</Button><Text style={s.caption}>{visiblePage + 1} / {pageCount}</Text><Button accessibilityLabel="다음 동물 목록" variant="secondary" disabled={visiblePage + 1 >= pageCount} onPress={() => setPage(visiblePage + 1)}>다음</Button></View> : null}
    </>}
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
