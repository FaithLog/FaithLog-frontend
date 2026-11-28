import {useRef, useState} from 'react';
import {Image, StyleSheet, Text, TextInput, View} from 'react-native';
import {Button} from '../components/ui';
import {colors, radius} from '../theme';
import {companionStyles as styles} from './companionStyles';
import {rewardBackgrounds, rewardDecorations, rewardIcons} from './gardenRewardAssets';
import type {DecorationId} from './gardenDecorationCatalog';
import type {GardenRewards} from './companionServerContract';

export function GardenRewardBackground({id}: {id?: string | null}) {
  const background = rewardBackgrounds.find(item => item.id === id);
  if (!background) return null;
  return <Image accessible={false} source={background.source()} resizeMode="cover" style={StyleSheet.absoluteFill} />;
}

export function GardenRewardShelf({rewards, selectBackground, refresh, onPlace}: {
  rewards: GardenRewards;
  selectBackground: (id: string | null) => Promise<void>;
  refresh: () => void;
  onPlace?: (id: DecorationId) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const backgrounds = rewardBackgrounds.filter(item => rewards.items.some(owned => owned.kind === 'BACKGROUND' && owned.id === item.id));
  const decorations = rewardDecorations.filter(item =>
    rewards.items.some(owned => owned.kind === 'DECORATION' && owned.id === item.id));

  async function apply(id: string | null) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {await selectBackground(id);} catch {setFailed(true);}
    finally {lock.current = false; setBusy(false);}
  }

  return <View style={styles.card}>
    <View style={styles.between}>
      <Text accessibilityRole="header" style={styles.name}>정원 보상</Text>
      <Button variant="ghost" size="compact" disabled={busy} accessibilityLabel="정원 보상 새로고침" onPress={refresh}>새로 확인</Button>
    </View>
    <View style={styles.row}>
      <View style={rewardShelfStyles.supply}>
        <Image accessible={false} source={rewardIcons.snack()} style={rewardShelfStyles.supplyIcon} />
        <Text style={[styles.caption, rewardShelfStyles.label]}>간식 {rewards.supplies.snacks}개</Text>
      </View>
      <View style={rewardShelfStyles.supply}>
        <Image accessible={false} source={rewardIcons.craftMaterial()} style={rewardShelfStyles.supplyIcon} />
        <Text style={[styles.caption, rewardShelfStyles.label]}>꾸미기 재료 {rewards.supplies.craftMaterials}개</Text>
      </View>
    </View>
    {decorations.length > 0 && <View style={styles.stack}>
      <Text style={styles.name}>해금한 장식</Text>
      {decorations.map(item => <View key={item.id} style={styles.between}>
        <View style={rewardShelfStyles.decoration}>
          <Image accessible={false} source={item.source()} style={rewardShelfStyles.decorationIcon} />
          <Text style={[styles.caption, rewardShelfStyles.label]}>{item.name}</Text>
        </View>
        {onPlace && <Button size="compact" variant="secondary" disabled={busy}
          accessibilityLabel={`${item.name} 배치하기`} onPress={() => onPlace(item.id)}>배치하기</Button>}
      </View>)}
    </View>}
    {backgrounds.length > 0 && <View style={styles.stack}>
      <Text style={styles.name}>해금한 배경</Text>
      {backgrounds.map(item => {
        const selected = rewards.backgroundId === item.id;
        return <View key={item.id} style={styles.stack}>
          <Image accessible={false} source={item.source()} resizeMode="cover" style={rewardShelfStyles.backgroundPreview} />
          <Button size="compact" variant={selected ? 'primary' : 'secondary'}
            accessibilityLabel={selected ? `${item.name} 배경 적용 중` : `${item.name} 배경 적용`}
            disabled={busy || selected} onPress={() => void apply(item.id)}>
            {selected ? `${item.name} · 적용 중` : item.name}
          </Button>
        </View>;
      })}
    </View>}
    {rewards.backgroundId && <Button size="compact" variant="ghost" disabled={busy} accessibilityLabel="보상 배경 해제"
      onPress={() => void apply(null)}>기존 정원 배경으로 돌아가기</Button>}
    {failed && <Text accessibilityRole="alert" style={styles.caption}>배경을 적용하지 못했어요. 다시 시도해 주세요.</Text>}
  </View>;
}

export function CompanionBondPanel({peak, nickname, rename}: {
  peak: number; nickname: string | null; rename: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(nickname ?? '');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  async function save() {
    if (lock.current || draft.trim() === (nickname ?? '')) return;
    lock.current = true;
    setSaving(true);
    setFailed(false);
    try {await rename(draft.trim());} catch {setFailed(true);}
    finally {lock.current = false; setSaving(false);}
  }
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.name}>친밀도 해금 · {peak}/100</Text>
    <Text style={styles.caption}>{peak < 30 ? '친밀도 30에서 별명 해금' : peak < 60 ? '친밀도 60에서 고유 반응 해금'
      : peak < 90 ? '친밀도 90에서 전용 장식 해금' : '전용 장식 해금 완료 · 정원 꾸미기에서 배치할 수 있어요.'}</Text>
    {peak >= 30 && <View style={styles.row}>
      <TextInput accessibilityLabel="동물 별명" placeholder="별명 입력" placeholderTextColor={colors.textSecondary}
        value={draft} onChangeText={setDraft} maxLength={32} editable={!saving}
        style={{borderWidth: 1, borderColor: colors.borderSoft, color: colors.textPrimary, padding: 8, flex: 1}} />
      <Button size="compact" disabled={saving || draft.trim() === (nickname ?? '')} accessibilityLabel="동물 별명 저장"
        onPress={() => void save()}>별명 저장</Button>
    </View>}
    {failed && <Text accessibilityRole="alert" style={styles.caption}>별명을 저장하지 못했어요.</Text>}
  </View>;
}

const rewardShelfStyles = StyleSheet.create({
  supply: {flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%'},
  supplyIcon: {width: 30, height: 30},
  decoration: {flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexShrink: 1, flexBasis: 144},
  decorationIcon: {width: 32, height: 32},
  label: {flexShrink: 1},
  backgroundPreview: {width: '100%', height: 88, borderRadius: radius.item},
});
