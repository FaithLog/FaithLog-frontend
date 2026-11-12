import {AppModal} from '../components/AppModal';
import {GardenBackground} from './GardenBackground';
import {GARDEN_BACKGROUNDS} from './gardenBackgrounds';
import {useMemo, useRef, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import {BIBLE_FRIEND_DESIGN_CATALOG, BIBLE_FRIEND_DESIGN_SPECIES, BIBLE_FRIEND_RARITIES, type BibleFriendRarity, type BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {Button, Chip, DangerConfirmSheet, TextField} from '../components/ui';
import {DEMO_SELL_PRICES, getSellQuote, MAX_GARDEN_FRIENDS, RARITY_LABELS} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

function CompanionCardName({name, compact = false}: {name: string; compact?: boolean}) {
  let lines = name.split(' · ');
  if (lines.length === 1) {
    const words = name.split(' ');
    let split = 0;
    let difference = Infinity;
    for (let i = 1; i < words.length; i++) {
      const next = Math.abs(words.slice(0,i).join(' ').length - words.slice(i).join(' ').length);
      if (next < difference) {difference = next; split = i;}
    }
    lines = split ? [words.slice(0,split).join(' '),words.slice(split).join(' ')] : [name,''];
  }
  return <View style={s.cardName}>
    {lines.map((line,index) => <Text key={index} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
      style={[compact ? s.rosterName : s.name,s.cardNameLine,{minHeight:compact ? 18 : 22}]}>{line || ' '}</Text>)}
  </View>;
}

export function CompanionManagePage({onRevealDetails = () => {}}: {onRevealDetails?: () => void}) {
  const {state, dispatch, nextTransactionId,server,error,serverSnapshot,perform} = useCompanions();
  const [page, setPage] = useState(0);
  const [section, setSection] = useState<'friends' | 'backgrounds'>('friends');
  const [filter, setFilter] = useState<'owned' | 'duplicates' | 'all' | 'unequipped'>('owned');
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<BibleFriendRarity | 'all'>('all');
  const [sort, setSort] = useState<'catalog' | 'rarity' | 'count'>('catalog');
  const [selected, setSelected] = useState<BibleFriendDesignId | null>(null);
  const [replacementId, setReplacementId] = useState<BibleFriendDesignId | null>(null);
  const replacement = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === replacementId);
  const [quantity, setQuantity] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const saleLock = useRef(false);
  const design = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === selected);
  const count = selected ? state.inventory[selected] ?? 0 : 0;
  const quote = selected ? getSellQuote(state, selected, quantity, serverSnapshot?.prices ?? DEMO_SELL_PRICES) : null;
  const ownedCount = Object.values(state.inventory).filter(n => n && n > 0).length;
  const duplicateCount = Object.values(state.inventory).reduce<number>((sum, n) => sum + Math.max(0, (n ?? 0) - 1), 0);
  const entries = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const items = BIBLE_FRIEND_DESIGN_CATALOG.filter(d => {
      if(server && !serverSnapshot?.catalog.includes(d.id) && !(state.inventory[d.id]??0))return false;
      const species = BIBLE_FRIEND_DESIGN_SPECIES.find(item => item.id === d.friendId)?.name ?? '';
      return (filter === 'all' || ((state.inventory[d.id] ?? 0) >= (filter === 'duplicates' ? 2 : 1) && (filter !== 'unequipped' || !state.equipped.includes(d.id))))
        && (rarity === 'all' || rarity === d.rarity)
        && (!search || `${d.name} ${species} ${RARITY_LABELS[d.rarity]}`.toLocaleLowerCase().includes(search));
    });
    if (sort === 'rarity') items.sort((a,b) => BIBLE_FRIEND_RARITIES.indexOf(b.rarity) - BIBLE_FRIEND_RARITIES.indexOf(a.rarity));
    if (sort === 'count') items.sort((a,b) => (state.inventory[b.id] ?? 0) - (state.inventory[a.id] ?? 0));
    // Stable grouping keeps deployed friends first within the chosen sort.
    items.sort((a,b) => Number(state.equipped.includes(b.id)) - Number(state.equipped.includes(a.id)));
    return items;
  }, [filter, state.inventory, state.equipped, query, rarity, sort,server,serverSnapshot]);
  const pageCount = Math.max(1, Math.ceil(entries.length / 12));
  const visiblePage = Math.min(page, pageCount - 1);
  return <View style={s.page}>
    <View style={s.row}>{([['friends', '친구'], ['backgrounds', '배경']] as const).map(([key,label]) => <Button key={key} size="compact" accessibilityLabel={`${label} 관리 보기`} variant={section === key ? 'primary' : 'ghost'} onPress={() => {setSection(key); setSelected(null); setConfirming(false);}}>{label}</Button>)}</View>
    {section === 'backgrounds' ? <View style={s.section}>
      <Text style={s.caption}>{server ? '홈의 캐릭터 공간에 적용돼요. 보유한 배경만 선택할 수 있어요.' : '홈의 캐릭터 공간에만 적용돼요. 지금은 모든 배경을 체험할 수 있어요.'}</Text>
      <View style={s.grid}>{GARDEN_BACKGROUNDS.map(background => <Pressable key={background.id}
        disabled={server && (Boolean(error) || background.id!=='default' && !serverSnapshot?.backgrounds.includes(background.id))} accessibilityRole="button" accessibilityLabel={`${background.name} 배경 적용`} accessibilityState={{selected: state.backgroundId === background.id}}
        onPress={() => dispatch({type: 'background', backgroundId: background.id})}
        style={[s.collectionTile, state.backgroundId === background.id ? s.selectedBorder : null]}>
        <View style={{width: '100%', height: 82, overflow: 'hidden', borderRadius: 8}}><GardenBackground id={background.id} /></View>
        <Text style={s.name}>{background.name}</Text>
        <Text style={state.backgroundId === background.id ? s.eyebrow : s.caption}>{state.backgroundId === background.id ? '✓ 적용 중' : server && background.id!=='default' && !serverSnapshot?.backgrounds.includes(background.id) ? '미보유' : '눌러서 적용'}</Text>
      </Pressable>)}</View>
    </View> : <>

    <View style={s.card}>
      <View style={s.between}><Text style={s.name}>정원에 배치한 친구</Text><Chip label={`${state.equipped.length}/${MAX_GARDEN_FRIENDS}`} tone="info" /></View>
      <Text style={s.caption}>친구를 눌러 상세를 보고, 해제 버튼으로 정원에서 뺄 수 있어요.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rosterGrid} accessibilityLabel="배치 중인 친구 목록">{state.equipped.map(id => {
        const friend = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === id)!;
        return <View key={id} style={s.rosterTile}>
          <Pressable style={s.detail} accessibilityRole="button" accessibilityLabel={`${friend.name} 배치 친구 상세`} onPress={() => {setSelected(id);setQuantity(1);setConfirming(false);}}>
            <BibleFriendDesignSprite designId={id} size={58} /><CompanionCardName name={friend.name} compact />
          </Pressable>
          <Button size="compact" fullWidth variant="secondary" accessibilityLabel={`${friend.name} 배치 해제`} onPress={() => {dispatch({type:'equip',designId:id});if(!server)setMessage('정원에서 친구를 뺐어요.');}}>해제</Button>
        </View>;
      })}{Array.from({length:Math.max(0,MAX_GARDEN_FRIENDS-state.equipped.length)},(_,i)=><View key={`empty-${i}`} style={[s.rosterTile,s.emptySlot]}><Text style={s.title}>＋</Text><Text style={s.caption}>빈자리</Text></View>)}</ScrollView>
      <Text style={s.caption}>{state.equipped.length >= MAX_GARDEN_FRIENDS ? '다른 친구의 교체하기를 누르면 교체할 친구를 고를 수 있어요.' : `아래 목록에서 ${MAX_GARDEN_FRIENDS-state.equipped.length}마리 더 배치할 수 있어요.`}</Text>
      <View style={s.between}><Text style={s.eyebrow}>수집 {ownedCount}/{BIBLE_FRIEND_DESIGN_CATALOG.length}</Text><Text style={s.caption}>중복 {duplicateCount}마리</Text></View>
      <View style={s.progressTrack}><View style={[s.progressFill, {width:`${ownedCount / BIBLE_FRIEND_DESIGN_CATALOG.length * 100}%`}]} /></View>
    </View>
    {design ? <View style={s.card}>
      <View style={s.between}><Text style={s.name}>친구 상세</Text><Button size="compact" accessibilityLabel="선택한 동물 상세 닫기" variant="ghost" onPress={() => setSelected(null)}>닫기</Button></View>
      <View style={[s.row, {flexWrap:'nowrap'}]}><BibleFriendDesignSprite designId={design.id} silhouette={count < 1} motion="happy" size={88} /><View style={{flex:1,gap:8}}><Text style={s.title}>{design.name}</Text><Text style={s.body}>{RARITY_LABELS[design.rarity]} · {count}마리 보유</Text></View></View>
      <Button fullWidth accessibilityLabel={state.equipped.includes(design.id) ? '정원에서 빼기' : '정원에 배치하기'}
        disabled={count < 1}
        onPress={() => {if (!state.equipped.includes(design.id) && state.equipped.length >= MAX_GARDEN_FRIENDS) setReplacementId(design.id); else dispatch({type:'equip',designId:design.id});}}>
        {state.equipped.includes(design.id) ? '정원에서 빼기' : state.equipped.length >= MAX_GARDEN_FRIENDS ? '배치한 친구와 교체하기' : '정원에 배치하기'}
      </Button>
      <Text style={s.name}>중복 친구 정리</Text><Text style={s.caption}>마지막 한 마리는 남겨두고 판매해요.</Text>
      <Text style={s.caption}>{server ? '판매가' : '체험 판매가'} · {RARITY_LABELS[design.rarity]} 1마리 {(serverSnapshot?.prices ?? DEMO_SELL_PRICES)[design.rarity]}P</Text>
      {count > 1 ? <View style={s.row}><View style={[s.between, {flexGrow:1}]}><Button accessibilityLabel="판매 수량 줄이기" disabled={quantity <= 1} onPress={() => setQuantity(n => n - 1)} variant="secondary">−</Button><Text style={s.name}>{quantity}마리</Text><Button accessibilityLabel="판매 수량 늘리기" disabled={quantity >= count - 1} onPress={() => setQuantity(n => n + 1)} variant="secondary">+</Button></View><Button size="compact" variant="ghost" accessibilityLabel="판매 가능한 중복 모두 선택" disabled={count <= 1} onPress={() => setQuantity(count - 1)}>최대</Button></View> : null}
      <Button fullWidth accessibilityLabel="중복 동물 판매 확인" variant="secondary" disabled={!quote} onPress={() => {saleLock.current = false; setConfirming(true);}}>{quote ? `${quantity}마리 판매 · ${quote.points}P` : '판매할 중복이 없어요'}</Button>
    </View> : null}
    <View style={s.tabBar}>{([['owned', '보유'], ['duplicates', '중복'], ['unequipped', '미배치'], ['all', '도감']] as const).map(([key, text]) => <View key={key} style={s.tab}><Button fullWidth accessibilityLabel={`${key === 'all' ? '전체 도감' : text} 보기`} onPress={() => {setFilter(key); setPage(0); setSelected(null); setConfirming(false);}} variant={key === filter ? 'primary' : 'secondary'} size="compact">{text}</Button></View>)}</View>
    <TextField label="친구 찾기" accessibilityLabel="동물 이름 또는 의상 검색" placeholder="예: 토끼, 별빛, 유니크" value={query} onChangeText={value => {setQuery(value); setPage(0);}} />
    <View style={s.filterPanel}>
      <View style={s.between}><Text style={s.name}>희귀도</Text>{query.trim() || rarity !== 'all' || sort !== 'catalog' ? <Button size="compact" variant="ghost" accessibilityLabel="동물 검색과 등급 필터 초기화" onPress={() => {setQuery('');setRarity('all');setSort('catalog');setPage(0);}}>초기화</Button> : null}</View>
      <View style={s.row}>{(['all', ...BIBLE_FRIEND_RARITIES] as const).map(value => {
        const total = BIBLE_FRIEND_DESIGN_CATALOG.filter(d => (value === 'all' || d.rarity === value) && (filter === 'all' || ((state.inventory[d.id] ?? 0) >= (filter === 'duplicates' ? 2 : 1) && (filter !== 'unequipped' || !state.equipped.includes(d.id))))).length;
        return <Button key={value} size="compact" variant={value === rarity ? 'primary' : 'secondary'} accessibilityLabel={`${value === 'all' ? '전체 등급' : RARITY_LABELS[value]} 필터`} onPress={() => {setRarity(value);setPage(0);}}>{value === 'all' ? '전체' : RARITY_LABELS[value]} {total}</Button>;
      })}</View>
      <Text style={s.caption}>정렬 · 배치 중인 친구가 먼저 표시돼요</Text>
      <View style={s.row}>{([['catalog','기본순'],['rarity','희귀순'],['count','보유 많은 순']] as const).map(([value,label])=><Button key={value} size="compact" variant={value === sort ? 'primary' : 'ghost'} accessibilityLabel={`동물 ${label} 정렬`} onPress={()=>{setSort(value);setPage(0);}}>{label}</Button>)}</View>
    </View>
    <Text accessibilityLiveRegion="polite" style={s.caption}>{entries.length}종 · 이름을 누르면 상세를 볼 수 있어요.</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text> : null}
    {entries.length === 0 ? <View style={s.card}><Text style={s.body}>{query.trim() || rarity !== 'all' ? '조건에 맞는 친구가 없어요' : filter === 'duplicates' ? '정리할 중복 친구가 없어요' : '아직 보유한 친구가 없어요'}</Text></View> : null}
    <View style={s.grid}>{entries.slice(visiblePage * 12, (visiblePage + 1) * 12).map(item => {
      const owned = state.inventory[item.id] ?? 0;
      const equipped = state.equipped.includes(item.id);
      return <View key={item.id} style={[s.collectionTile, selected === item.id ? s.selectedBorder : null]}><Pressable style={s.detail} accessibilityRole="button" accessibilityLabel={`${item.name}, ${owned}마리 보유${equipped ? ', 배치 중' : ''}, 상세 보기`}
        onPress={() => {setSelected(item.id); setQuantity(1); setConfirming(false); setMessage(''); onRevealDetails();}}
>
        <BibleFriendDesignSprite designId={item.id} silhouette={owned < 1} size={80} />
        <CompanionCardName name={item.name} /><Chip label={RARITY_LABELS[item.rarity]} />
        <Text style={s.caption}>{owned ? `${owned}마리${equipped ? ' · 배치 중' : ''}` : '아직 만나지 못했어요'}</Text>
      </Pressable>
      {owned > 0 ? <Button fullWidth size="compact" variant={equipped ? 'secondary' : 'ghost'} accessibilityLabel={`${item.name} ${equipped ? '바로 배치 해제' : '바로 배치'}`} onPress={() => {
        if (!equipped && state.equipped.length >= MAX_GARDEN_FRIENDS) {setReplacementId(item.id);}
        else {dispatch({type:'equip',designId:item.id}); if(!server)setMessage(equipped ? '정원에서 친구를 뺐어요.' : '정원에 친구를 배치했어요.');}
      }}>{equipped ? '배치 해제' : state.equipped.length >= MAX_GARDEN_FRIENDS ? '교체하기' : '배치하기'}</Button> : <Text style={s.caption}>미보유</Text>}
      </View>;
    })}</View>
    {entries.length > 12 ? <View style={s.between}><Button accessibilityLabel="이전 동물 목록" variant="secondary" disabled={visiblePage === 0} onPress={() => setPage(visiblePage - 1)}>이전</Button><Text style={s.caption}>{visiblePage + 1} / {pageCount}</Text><Button accessibilityLabel="다음 동물 목록" variant="secondary" disabled={visiblePage + 1 >= pageCount} onPress={() => setPage(visiblePage + 1)}>다음</Button></View> : null}
    </>}
    <AppModal visible={Boolean(replacement)} transparent animationType="fade" onRequestClose={() => setReplacementId(null)}>
      <View style={s.replacementOverlay}>
        <View style={s.replacementSheet} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={s.title}>누구와 교체할까요?</Text>
          <Text style={s.body}>{replacement?.name}와 자리를 바꿀 친구를 골라주세요. 친구는 보유 목록에 그대로 남아요.</Text>
          <ScrollView style={{maxHeight:360}} contentContainerStyle={s.stack}>
            {replacement ? state.equipped.map(id => {
              const outgoing = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === id)!;
              return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${outgoing.name} 대신 ${replacement.name} 배치`} style={s.replacementRow} onPress={async () => {
                const action={type:'replace' as const,outgoingId:id,incomingId:replacement.id};
                if(server){if(!await perform!(action))return;}else dispatch(action);
                setMessage(`${outgoing.name} 대신 ${replacement.name}를 배치했어요.`);
                setReplacementId(null);
              }}><BibleFriendDesignSprite designId={id} size={48} /><View style={{flex:1,gap:4}}><Text style={s.name}>{outgoing.name}</Text><Text style={s.caption}>{RARITY_LABELS[outgoing.rarity]}</Text></View><Text style={s.eyebrow}>교체</Text></Pressable>;
            }) : null}
          </ScrollView>
          <Button fullWidth variant="secondary" accessibilityLabel="친구 교체 취소" onPress={() => setReplacementId(null)}>취소</Button>
        </View>
      </View>
    </AppModal>
    <DangerConfirmSheet visible={confirming && Boolean(design)} title="중복 친구를 판매할까요?" message={`${design?.name ?? ''} ${quantity}마리를 판매하고 ${server ? '포인트' : '체험 포인트'} ${quote?.points ?? 0}P를 받아요.`}
      dangerSummary="판매한 수량은 되돌릴 수 없어요. 마지막 한 마리는 유지돼요." confirmLabel="판매하기" onCancel={() => setConfirming(false)}
      onConfirm={async () => {
        if (saleLock.current || !selected || !quote) return;
        saleLock.current = true;
        const action={type:'sell' as const,designId:selected,quantity,transactionId:nextTransactionId('sale')};
        if(server){if(!await perform!(action)){saleLock.current=false;return;}}else dispatch(action);
        setMessage(`${quantity}마리 판매 · ${quote.points}P를 받았어요${server ? '' : ' (체험)'}`); setConfirming(false); setQuantity(1); setPage(0);
      }} />
  </View>;
}
