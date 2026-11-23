import {useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {gardenShopCategories, gardenShopDecorations, type DecorationId} from './gardenDecorationCatalog';

const pageSize = 6;
const positions = ['왼쪽', '가운데', '오른쪽'] as const;

export function GardenDecorationShop({points, onPreview, onClose}: {
  points: number;
  onPreview: (id: DecorationId, slot: number) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<typeof gardenShopCategories[number]>('돌봄');
  const [page, setPage] = useState(0);
  const [slot, setSlot] = useState(1);
  const [preview, setPreview] = useState<typeof gardenShopDecorations[number] | null>(null);
  const items = gardenShopDecorations.filter(item => item.category === category);
  const pages = Math.ceil(items.length / pageSize);

  return <View style={styles.panel}>
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>정원 상점</Text>
      <Text style={styles.points}>보유 {points.toLocaleString()} P</Text>
      <Button size="compact" variant="ghost" accessibilityLabel="정원 상점 닫기" onPress={onClose}>닫기</Button>
    </View>
    <Text style={styles.caption}>소품을 눌러 정원에서 미리 보세요. 포인트 구매는 준비 중이에요.</Text>
    <View style={styles.row}>
      {positions.map((position, index) => <Button key={position} size="compact"
        accessibilityLabel={'미리보기 ' + position + ' 위치'}
        variant={slot === index ? 'primary' : 'secondary'}
        onPress={() => {
          setSlot(index);
          if (preview) onPreview(preview.id, index);
        }}>{position}</Button>)}
    </View>
    <View style={styles.row}>
      {gardenShopCategories.map(value => <Button key={value} size="compact" accessibilityLabel={value + " 소품 보기"}
        variant={category === value ? 'primary' : 'secondary'}
        onPress={() => {setCategory(value); setPage(0);}}>{value}</Button>)}
    </View>
    <View style={styles.grid}>
      {items.slice(page * pageSize, (page + 1) * pageSize).map(item =>
        <Pressable key={item.id} accessibilityRole="button"
          accessibilityLabel={item.name + ' 미리보기'} accessibilityState={{selected: preview?.id === item.id}}
          style={({pressed}) => [styles.card, preview?.id === item.id && styles.selected, pressed && styles.pressed]}
          onPress={() => {setPreview(item); onPreview(item.id, slot);}}>
          <Image accessible={false} resizeMode="contain" style={styles.image} source={item.source()} />
          <Text style={styles.name}>{item.name}</Text>
        </Pressable>)}
    </View>
    <View style={styles.row}>
      <Button size="compact" variant="ghost" accessibilityLabel="이전 소품" disabled={page === 0}
        onPress={() => setPage(value => value - 1)}>이전</Button>
      <Text style={styles.caption}>{page + 1} / {pages}</Text>
      <Button size="compact" variant="ghost" accessibilityLabel="다음 소품" disabled={page + 1 === pages}
        onPress={() => setPage(value => value + 1)}>다음</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: {padding: 12, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface},
  row: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6},
  title: {...typography.body, color: colors.textPrimary, fontWeight: '700', flexGrow: 1},
  points: {...typography.caption, color: colors.primary, fontWeight: '700'},
  caption: {...typography.caption, color: colors.textSecondary},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  card: {width: '31%', minHeight: 84, padding: 6, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft},
  selected: {borderColor: colors.primary, borderWidth: 2},
  pressed: {opacity: 0.72},
  image: {width: 46, height: 46},
  name: {...typography.caption, color: colors.textPrimary, textAlign: 'center'},
});
