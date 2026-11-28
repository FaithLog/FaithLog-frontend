import {useRef, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import type {GardenShopSnapshot} from './companionServerContract';
import {FaithLogApiError} from '../api/apiError';
import {IconexIcon} from '../components/IconexIcon';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {gardenShopCategories, gardenShopDecorations, type DecorationId} from './gardenDecorationCatalog';

import {getCareFacilityLabel} from './gardenFacilityCare';

const pageSize = 6;
const positions = ['왼쪽', '가운데', '오른쪽'] as const;

export function GardenDecorationShop({points, catalog, loading, loadFailed, onReload, onPurchase, onPlace, onPreview, onClose}: {
  points: number;
  catalog?: GardenShopSnapshot | null;
  loading?: boolean;
  loadFailed?: boolean;
  onReload?: () => void;
  onPurchase?: (id: string, price: number) => Promise<void>;
  onPlace?: (id: DecorationId, slot: number) => void;
  onPreview: (id: DecorationId, slot: number) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<typeof gardenShopCategories[number]>('돌봄');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [slot, setSlot] = useState(1);
  const [preview, setPreview] = useState<typeof gardenShopDecorations[number] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState('');
  const purchaseLock = useRef(false);
  const offer = catalog?.items.find(item => item.id === preview?.id);
  const facilityLabel = preview && getCareFacilityLabel(preview.id);
  const balance = catalog?.balance ?? points;

  async function purchase() {
    if (!offer || !onPurchase || purchaseLock.current) return;
    purchaseLock.current = true;
    setPurchasing(true);
    setMessage('');
    try {
      await onPurchase(offer.id, offer.price);
      setConfirming(false);
      setMessage('구매했어요. 원하는 위치에 배치해 보세요.');
    } catch (error) {
      const code = error instanceof FaithLogApiError ? error.detail.code : '';
      setConfirming(false);
      setMessage(code === 'COMPANION_INSUFFICIENT_POINTS'
        ? '포인트가 부족해요.'
        : '구매 결과를 확인하지 못했어요. 상품 정보를 다시 확인해 주세요.');
      onReload?.();
    } finally {
      purchaseLock.current = false;
      setPurchasing(false);
    }
  }

  const offersById = new Map(catalog?.items.map(item => [item.id, item]));
  const items = gardenShopDecorations.filter(item =>
    item.category === category && (!ownedOnly || offersById.get(item.id)?.owned));
  const pages = Math.ceil(items.length / pageSize);
  const visiblePage = Math.min(page, Math.max(0, pages - 1));

  return <View style={styles.panel}>
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>정원 상점</Text>
      <View style={styles.wallet}>
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <IconexIcon color={colors.primary} name="coins" size={16} />
        </View>
        <Text style={styles.points}>보유 {balance.toLocaleString()} P</Text>
      </View>
      <Button size="compact" variant="ghost" disabled={purchasing} accessibilityLabel="정원 상점 닫기" onPress={onClose}>닫기</Button>
    </View>
    <Text style={styles.caption}>소품을 눌러 정원에서 미리 보세요.</Text>
    {loading && <Text accessibilityLiveRegion="polite" style={styles.caption}>상품 정보를 확인하고 있어요…</Text>}
    {loadFailed && <Button variant="secondary" size="compact" accessibilityLabel="상품 정보 다시 확인"
      onPress={() => onReload?.()}>상품 정보 다시 확인</Button>}
    <View style={styles.row}>
      {gardenShopCategories.map(value => <View key={value} style={styles.category}>
        <Button size="compact" fullWidth accessibilityLabel={value + ' 소품 보기'}
          variant={category === value ? 'primary' : 'secondary'}
          onPress={() => {setCategory(value); setPage(0);}}>{value}</Button>
      </View>)}
    </View>
    <View style={styles.row}>
      <Button size="compact" variant={ownedOnly ? 'primary' : 'secondary'}
        accessibilityLabel={ownedOnly ? '전체 소품 보기' : '보유한 소품만 보기'}
        disabled={purchasing || (!ownedOnly && !catalog)}
        onPress={() => {setOwnedOnly(value => !value); setPage(0);}}>
        {ownedOnly ? '전체 보기' : '보유한 소품만'}
      </Button>
    </View>
    {ownedOnly && items.length === 0 &&
      <Text accessibilityLiveRegion="polite" style={styles.caption}>이 분류에 보유한 소품이 없어요.</Text>}
    <View style={styles.grid}>
      {items.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map(item => {
        const entry = offersById.get(item.id);
        return <Pressable key={item.id} accessibilityRole="button"
          disabled={purchasing} accessibilityLabel={item.name + ' 미리보기'} accessibilityState={{selected: preview?.id === item.id}}
          style={({pressed}) => [styles.card, preview?.id === item.id && styles.selected, pressed && styles.pressed]}
          onPress={() => {setPreview(item); setConfirming(false); setMessage(''); onPreview(item.id, slot);}}>
          <Image accessible={false} resizeMode="contain" style={styles.image} source={item.source()} />
          <Text style={styles.name}>{item.name}</Text>
          {entry && <Text style={styles.points}>{entry.owned ? '보유 중' : `${entry.price} P`}</Text>}
        </Pressable>;
      })}
    </View>
    {pages > 1 && <View style={[styles.row, styles.pagination]}>
      <Button size="compact" variant="ghost" accessibilityLabel="이전 소품" disabled={visiblePage === 0}
        onPress={() => setPage(visiblePage - 1)}>이전</Button>
      <Text style={styles.caption}>{visiblePage + 1} / {pages}</Text>
      <Button size="compact" variant="ghost" accessibilityLabel="다음 소품" disabled={visiblePage + 1 >= pages}
        onPress={() => setPage(visiblePage + 1)}>다음</Button>
    </View>}
    <View style={styles.preview}>
      {facilityLabel && <Text accessibilityLiveRegion="polite" style={styles.caption}>
        {`${facilityLabel} · 정원에 배치하면 해당 돌봄을 할 때 동물이 찾아가요.`}
      </Text>}
      <Text accessibilityLiveRegion="polite" style={styles.caption}>
        {preview ? `${preview.name} · ${positions[slot]}에 미리 보는 중` : '미리보기 위치'}
      </Text>
      <View style={styles.row}>
        {positions.map((position, index) => <View key={position} style={styles.position}>
          <Button size="compact" fullWidth accessibilityLabel={'미리보기 ' + position + ' 위치'}
            variant={slot === index ? 'primary' : 'secondary'}
            onPress={() => {
              setSlot(index);
              if (preview) onPreview(preview.id, index);
            }}>{position}</Button>
        </View>)}
      </View>
      {preview && offer?.owned && onPlace && <Button size="compact" accessibilityLabel="보유 소품 배치하기"
        onPress={() => onPlace(preview.id, slot)}>배치하기</Button>}
      {offer && !offer.owned && onPurchase && !loadFailed && <>
        {confirming && <Text style={styles.caption}>구매 후 {(balance - offer.price).toLocaleString()} P</Text>}
        <Button size="compact" disabled={loading || purchasing || balance < offer.price}
          accessibilityLabel={confirming ? '포인트 구매 확정' : '포인트로 구매하기'}
          onPress={() => confirming ? void purchase() : setConfirming(true)}>
          {purchasing ? '구매 중…' : balance < offer.price ? '포인트 부족' : confirming ? `${offer.price} P로 구매 확정` : `${offer.price} P로 구매`}
        </Button>
        {confirming && <Button size="compact" variant="ghost" disabled={purchasing} accessibilityLabel="구매 취소"
          onPress={() => setConfirming(false)}>구매 취소</Button>}
      </>}
      {message !== '' && <Text accessibilityLiveRegion="polite" style={styles.caption}>{message}</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: {padding: 12, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface},
  row: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6},
  title: {...typography.body, color: colors.textPrimary, fontWeight: '700', flexGrow: 1},
  wallet: {flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1},
  category: {flexBasis: '21%', flexGrow: 1, minWidth: 48},
  position: {flexBasis: '28%', flexGrow: 1, minWidth: 64},
  pagination: {justifyContent: 'space-between'},
  preview: {gap: 6, paddingTop: 8, borderTopWidth: 1, borderColor: colors.borderSoft},
  points: {...typography.caption, color: colors.primary, fontWeight: '700'},
  caption: {...typography.caption, color: colors.textSecondary},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  card: {width: '31%', minHeight: 84, padding: 6, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: colors.borderSoft},
  selected: {borderColor: colors.primary},
  pressed: {opacity: 0.72},
  image: {width: 46, height: 46},
  name: {...typography.caption, color: colors.textPrimary, textAlign: 'center'},
});
