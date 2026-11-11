import {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop} from 'react-native-svg';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import {type BibleFriendDesign} from '../characters/bibleFriendDesignCatalog';
import {Button} from '../components/ui';
import {colors, radius, typography} from '../theme';
import {clamp, ease, getDrawFrame, MOTION_TONES} from './companionDrawMotion';
import {RARITY_LABELS} from './companionModel';
import {useCompanionMotion} from './useCompanionMotion';
const crack = 'M-44 7 L-29 0 L-17 10 L-4 -2 L9 8 L21 -3 L33 7 L44 1';
const eggPath = 'M0 -56 C28 -56 49 4 44 29 C40 58 -40 58 -44 29 C-49 4 -28 -56 0 -56Z';
function Egg({x, y, scale = 1, angle = 0, split = 0, glow = 0, ink}: {x: number; y: number; scale?: number; angle?: number; split?: number; glow?: number; ink: string}) {
  const k = ease(split);
  return <G transform={`translate(${x},${y}) scale(${scale}) rotate(${angle})`}>
    {split <= 0 ? <G><Path d={eggPath} fill="url(#companion-shell)" stroke={colors.mint} strokeWidth={1.3} />
      <Ellipse cx={-15} cy={-13} rx={6} ry={5} fill={colors.mint} /><Ellipse cx={15} cy={13} rx={8} ry={6} fill={colors.mint} /><Circle cx={7} cy={-36} r={4} fill={colors.mint} />
      <Ellipse cx={-23} cy={-22} rx={5} ry={20} fill={colors.surface} opacity={0.65} transform="rotate(20)" />
      {glow > 0 ? <G opacity={glow}><Path d={crack} fill="none" stroke={ink} strokeWidth={4} opacity={0.3} /><Path d={crack} fill="none" stroke={colors.surface} strokeWidth={1.5} /></G> : null}
    </G> : <G opacity={1 - clamp((split - 0.55) / 0.45)}>
      <G transform={`translate(${-k * 53},${-k * 78}) rotate(${-k * 32})`}><Path d="M-44 7 C-48 -4 -28 -56 0 -56 C28 -56 47 -2 44 1 L33 7 L21 -3 L9 8 L-4 -2 L-17 10 L-29 0Z" fill="url(#companion-shell)" stroke={colors.mint} strokeWidth={1.3} /><Circle cx={-15} cy={-13} r={6} fill={colors.mint} /></G>
      <G transform={`translate(${k * 53},${k * 35}) rotate(${k * 32})`}><Path d="M-44 7 L-29 0 L-17 10 L-4 -2 L9 8 L21 -3 L33 7 L44 1 C48 75 -48 75 -44 7Z" fill="url(#companion-shell)" stroke={colors.mint} strokeWidth={1.3} /><Ellipse cx={15} cy={20} rx={8} ry={6} fill={colors.mint} /></G>
    </G>}
  </G>;
}
function Spark({x, y, size, opacity, color, rotation = 0}: {x: number; y: number; size: number; opacity: number; color: string; rotation?: number}) {
  return <Path d={`M0 ${-size} Q${size * .2} ${-size * .2} ${size} 0 Q${size * .2} ${size * .2} 0 ${size} Q${-size * .2} ${size * .2} ${-size} 0 Q${-size * .2} ${-size * .2} 0 ${-size}`} transform={`translate(${x},${y}) rotate(${rotation})`} fill={color} opacity={clamp(opacity)} />;
}
export function CompanionDrawScene({designs, onComplete}: {designs: readonly BibleFriendDesign[]; onComplete: () => void}) {
  const {elapsed, reduceMotion, motionReady} = useCompanionMotion(true, 40);
  const completed = useRef(false);
  const [sceneWidth, setSceneWidth] = useState(300);
  const scale = sceneWidth / 350;
  const frame = getDrawFrame(designs.map(d => d.rarity), elapsed);
  const design = designs[frame.index];
  useEffect(() => {
    if (completed.current || !motionReady || (!frame.done && !reduceMotion)) return;
    completed.current = true; onComplete();
  }, [frame.done, motionReady, onComplete, reduceMotion]);
  if (!design) return null;
  const p = frame.progress, reveal = frame.phase === 'reveal', gather = frame.phase === 'gather';
  const tone = MOTION_TONES[design.rarity], special = ['RARE', 'EPIC', 'UNIQUE'].includes(design.rarity);
  const v = clamp((p - .17) / .48), land = clamp((v - .72) / .28);
  const charY = 205 - Math.sin(v * Math.PI) * 52 - Math.sin(land * Math.PI) * 6;
  const squash = 1 - Math.sin(land * Math.PI) * .1;
  return <View style={styles.scene} onLayout={event => setSceneWidth(event.nativeEvent.layout.width)}>
    <View style={styles.label} accessibilityLiveRegion="polite"><Text style={[styles.eyebrow, {color: tone.deep}]}>{reveal ? RARITY_LABELS[design.rarity] : frame.phase === 'collection' ? '열 번의 설레는 만남' : gather && special ? '조금 특별한 빛이 보여요' : '두근두근, 누가 있을까요?'}</Text><Text style={styles.name}>{reveal ? design.name : '작은 알에 담긴 설렘'}</Text></View>
    <Svg width="100%" height={300 * scale} viewBox="0 0 350 300">
      <Defs><LinearGradient id="companion-shell" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={colors.surface} /><Stop offset="0.5" stopColor="#FFFDF8" /><Stop offset="1" stopColor="#DCEBED" /></LinearGradient><RadialGradient id="companion-aura"><Stop offset="0" stopColor={tone.soft} /><Stop offset="1" stopColor={colors.surface} stopOpacity={0} /></RadialGradient></Defs>
      <Rect width={350} height={300} fill="url(#companion-aura)" />
      <Ellipse cx={175} cy={242} rx={78} ry={14} fill={tone.ink} opacity={.08} /><Ellipse cx={175} cy={242} rx={78} ry={14} fill="none" stroke={tone.ink} opacity={.25} />
      {reveal && special ? Array.from({length: 12}, (_, i) => <Path key={`ray-${i}`} d="M0 0 L-11 -155 L11 -155Z" fill={tone.ink} opacity={(1 - p) * (design.rarity === 'UNIQUE' ? .15 : .07)} transform={`translate(175,165) rotate(${i * 30 + p * 12})`} />) : null}
      {reveal ? [0, 1].map(i => <Circle key={i} cx={175} cy={165} r={20 + ease(clamp((p - i * .12) / .8)) * 108} fill="none" stroke={tone.ink} strokeWidth={1.5 - i * .4} opacity={(1 - p) * .5} />) : null}
      {(gather || reveal) ? Array.from({length: design.rarity === 'UNIQUE' ? 32 : 20}, (_, i) => {
        const a = i * 2.399 + (gather ? p * 1.7 : p * .3), r = gather ? 105 * (1 - p) + 10 : 18 + ease(p) * (50 + i % 7 * 10);
        return <Spark key={i} x={175 + Math.cos(a) * r} y={165 + Math.sin(a) * r * .8 + (reveal ? p * p * 18 : 0)} size={1.5 + i % 4} opacity={gather ? Math.sin(p * Math.PI) * .8 : Math.sin(p * Math.PI) * .8} color={tone.ink} rotation={a * 30 + p * 60} />;
      }) : null}
      {reveal && p < .65 ? Array.from({length: 8}, (_, i) => <Path key={`shard-${i}`} d="M-4 -3 L5 -1 L1 4Z" fill={colors.surface} stroke={colors.mint} strokeWidth={.6} opacity={1 - clamp(p * 1.6)} transform={`translate(${175 + Math.cos(i * Math.PI / 4) * (32 + p * 125)},${165 + Math.sin(i * Math.PI / 4) * p * 95 + p * p * 90}) rotate(${i * 40 + p * 130})`} />) : null}
      {frame.phase === 'collection' ? Array.from({length: 10}, (_, i) => <Egg key={i} x={65 + i % 5 * 55} y={126 + Math.floor(i / 5) * 78} scale={ease(clamp((p - i * .035) / .5)) * .4} ink={tone.ink} />) : !reveal || p < .6 ? <Egg x={175} y={reveal ? 165 : 170 - (gather ? ease(p) * 7 : Math.sin(p * Math.PI) * 5)} angle={reveal ? 0 : gather ? p > .82 ? 0 : Math.sin(p * 29) * 4 : Math.sin(p * Math.PI * 4) * 3} split={reveal ? Math.max(.001, clamp(p / .6)) : 0} glow={gather ? clamp((p - .35) / .5) : 0} ink={tone.ink} /> : null}
    </Svg>
    {reveal && p > .17 ? <View pointerEvents="none" style={[styles.character, {top: (charY - 68) * scale, marginLeft: -68 * scale, width: 136 * scale, height: 136 * scale, opacity: ease(v * 4), transform: [{scaleX: (0.85 + ease(v) * .15) / squash}, {scaleY: (0.85 + ease(v) * .15) * squash}]}]}><BibleFriendDesignSprite designId={design.id} size={136 * scale} motion={v < .72 ? 'happy' : 'land'} elapsedMs={Math.max(0, (v < .72 ? v : land) * 500)} /></View> : null}
    <View style={styles.footer}><Text style={styles.caption}>{frame.index + 1} / {designs.length}</Text><Button accessibilityLabel="등장 연출 건너뛰고 전체 결과 보기" variant="ghost" size="compact" onPress={() => {if (!completed.current) {completed.current = true; onComplete();}}}>건너뛰기</Button></View>
  </View>;
}
const styles = StyleSheet.create({
  scene: {backgroundColor: colors.surface, borderRadius: radius.card, overflow: 'hidden', minHeight: 350},
  label: {position: 'absolute', top: 16, left: 16, right: 16, zIndex: 2, alignItems: 'center', gap: 4},
  eyebrow: {...typography.caption, fontWeight: '600'},
  name: {...typography.cardTitle, color: colors.textPrimary, textAlign: 'center'},
  character: {position: 'absolute', left: '50%', marginLeft: -68, width: 136, height: 136},
  footer: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10},
  caption: {...typography.caption, color: colors.textSecondary},
});
