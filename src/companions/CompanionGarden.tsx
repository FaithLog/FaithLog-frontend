import {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Ellipse, Path} from 'react-native-svg';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import {BIBLE_FRIEND_DESIGN_CATALOG} from '../characters/bibleFriendDesignCatalog';
import {Button, Chip} from '../components/ui';
import {colors, radius, typography} from '../theme';
import {type CompanionPage} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';
import {useCompanionMotion} from './useCompanionMotion';

export function CompanionGarden({onOpen}: {onOpen: (page: CompanionPage) => void}) {
  const {state} = useCompanions();
  const {elapsed, reduceMotion} = useCompanionMotion();
  const [width, setWidth] = useState(260);
  const [reaction, setReaction] = useState<{id: string; started: number} | null>(null);
  return <View style={s.card}>
    <View style={s.between}><Text style={s.name}>함께 걷는 친구들</Text><Chip label={`${state.equipped.length}/5마리`} tone="info" /></View>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={styles.garden}>
      <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 300 200" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Path d="M0 110 Q70 65 150 110 T300 100 L300 200 L0 200Z" fill={colors.faithSoft} />
        <Path d="M0 155 Q100 95 200 146 T300 140 L300 200 L0 200Z" fill={colors.mint} opacity={0.16} />
        <Ellipse cx={150} cy={189} rx={120} ry={8} fill={colors.mint} opacity={0.12} />
      </Svg>
      {state.equipped.map((id, index) => {
        const phase = (elapsed + index * 1300) % 6400;
        const walking = !reduceMotion && phase < 4000;
        const reacting = !reduceMotion && reaction?.id === id && elapsed - reaction.started < 780;
        const column = index < 3 ? index : index - 2.5;
        const base = column * Math.max(0, width - 72) / 2;
        const left = Math.max(0, Math.min(width - 72, base + (walking ? Math.sin(phase / 4000 * Math.PI * 2) * 10 : 0)));
        const design = BIBLE_FRIEND_DESIGN_CATALOG.find(d => d.id === id);
        return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${design?.name ?? '동물'} 인사하기`}
          onPress={() => setReaction({id, started: elapsed})}
          style={[styles.friend, {left, top: index < 3 ? 15 : 102, transform: [{scaleX: walking && Math.cos(phase / 4000 * Math.PI * 2) < 0 ? -1 : 1}]}]}>
          <BibleFriendDesignSprite designId={id} motion={reacting ? 'happy' : walking ? 'walk' : 'idle'} elapsedMs={reduceMotion ? 0 : reacting ? elapsed - (reaction?.started ?? 0) : phase} size={72} />
        </Pressable>;
      })}
      {state.equipped.length === 0 ? <View style={styles.empty}><Text style={s.body}>정원에서 함께할 친구를 골라주세요</Text></View> : null}
    </View>
    <View style={s.between}><Text style={s.caption}>친구를 누르면 인사해요</Text><Text style={styles.balance}>{state.points.toLocaleString()} P</Text></View>
    <View style={s.row}>
      {([['manage', '동물 관리'], ['missions', '미션'], ['draw', '뽑기']] as const).map(([page, label]) => <View style={s.action} key={page}><Button accessibilityLabel={`${label} 페이지 열기`} onPress={() => onOpen(page)} variant={page === 'draw' ? 'primary' : 'secondary'} fullWidth>{label}</Button></View>)}
    </View>
    <Text style={s.caption}>체험 모드 · 포인트와 보유 동물은 실제 계정에 반영되지 않아요</Text>
  </View>;
}
const styles = StyleSheet.create({
  garden: {height: 208, borderRadius: radius.item, backgroundColor: colors.neutralSoft, overflow: 'hidden'},
  friend: {position: 'absolute', width: 72, height: 72},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16},
  balance: {...typography.cardTitle, color: colors.primary},
});
