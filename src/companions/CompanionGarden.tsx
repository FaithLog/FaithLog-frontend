import {GardenBackground} from './GardenBackground';
import {useEffect, useRef, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {FarmCareButton,FarmHudGauge,FarmHudIcon} from './FarmHudAssets';
import type {CompanionCareAction} from './companionServerContract';
import {BIBLE_FRIEND_DESIGN_CATALOG, type BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {type CompanionPage} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {GardenAnimal} from './GardenAnimal';
import {advanceGardenAgent, chooseGardenTarget, constrainGardenPoint, createGardenAgent, GARDEN_HEIGHT, normalizeGardenPoint, reactGardenAgent, releaseGardenAgent, restoreGardenPoint, type GardenAgent, type GardenBounds, type GardenPoint} from './gardenMotion';
import {useCompanionMotion} from './useCompanionMotion';

export function CompanionGarden({onOpen, onDragStateChange}: {onOpen: (page: CompanionPage) => void; onDragStateChange?: (dragging: boolean) => void}) {
  const {state,server,busy,error,refresh:reloadServer,instances,careError,careInstance,evolveInstance} = useCompanions();
  const [selectedDesign,setSelectedDesign] = useState<BibleFriendDesignId|null>(null);
  const selected = selectedDesign&&state.equipped.includes(selectedDesign)
    ? instances?.find(item=>item.designId===selectedDesign):null;
  const activeDesign = selectedDesign ? BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===selectedDesign) : null;
  const xpFloor=selected?.level===3?1000:selected?.level===2?300:0;
  const nextTarget=selected?.nextEvolution?.threshold?.growthXp ?? xpFloor;
  const xpPct=nextTarget>xpFloor?Math.max(0,Math.min(100,((selected?.growthXp??0)-xpFloor)/(nextTarget-xpFloor)*100)):100;
  const conditionText:Record<string,string>={EXPERIENCE:'경험치',CARE_DAYS:'돌봄 날짜',HEALTH:'건강',SATIETY:'배부름',CLEANLINESS:'청결도',MAX_LEVEL:'최종 진화'};
  const {elapsed, reduceMotion, foreground} = useCompanionMotion(true, 40);
  const [bounds, setBounds] = useState<GardenBounds>({width: 300,height:GARDEN_HEIGHT});
  const agents = useRef(new Map<BibleFriendDesignId,GardenAgent>());
  const previous = useRef(elapsed);
  const dragCallback = useRef(onDragStateChange); dragCallback.current = onDragStateChange;
  const [, repaint] = useState(0);
  // Positions and motion belong to this screen, independently of server snapshots.
  const refresh = () => repaint(value => value + 1);
  useEffect(() => () => {dragCallback.current?.(false);}, []);
  const delta = elapsed - previous.current; previous.current = elapsed;
  for (const id of [...agents.current.keys()]) if (!state.equipped.includes(id)) agents.current.delete(id);
  for (const id of state.equipped) {
    if (!agents.current.has(id)) {
      const saved = state.gardenPositions[id];
      const position = saved ? restoreGardenPoint(saved,bounds) : chooseGardenTarget(bounds,[...agents.current.values()].map(a=>a.position));
      agents.current.set(id,createGardenAgent(position,elapsed,bounds));
    }
  }
  if (!reduceMotion && delta > 0) {
    const snapshot = [...agents.current.entries()];
    for (const [id,agent] of snapshot) agents.current.set(id,advanceGardenAgent(agent,elapsed,delta,bounds,snapshot.filter(([other])=>other!==id).map(([,a])=>a.position)));
  }
  const update = (id: BibleFriendDesignId, next: (agent: GardenAgent) => GardenAgent) => {
    const current = agents.current.get(id); if (!current) return;
    agents.current.set(id,next(current)); refresh();
  };
  useEffect(() => {
    if (foreground) return;
    for (const [id,agent] of agents.current) if (agent.motion === 'held') agents.current.set(id,releaseGardenAgent(agent,previous.current,true));
    dragCallback.current?.(false);
  }, [foreground]);
  return <View style={styles.section}>
    <View onLayout={event => {
      const width = event.nativeEvent.layout.width;
      if (width <= 0 || width === bounds.width) return;
      const next = {...bounds,width};
      for (const [id,agent] of agents.current) {
        const position = restoreGardenPoint(normalizeGardenPoint(agent.position,bounds),next);
        agents.current.set(id,{...agent,position,target:constrainGardenPoint(agent.target,next)});
      }
      setBounds(next);
    }} style={styles.space} testID="companion-garden-space">
      <GardenBackground id={state.backgroundId} />
      {state.equipped.map(id => {
        const agent = agents.current.get(id)!;
        const name = BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===id)?.name ?? '동물';
        const animal=instances?.find(item=>item.designId===id);
        return <GardenAnimal key={id} designId={id} name={name} agent={agent} elapsed={elapsed} reduceMotion={reduceMotion}
          evolutionStage={animal ? (animal.level-1) as 0|1|2 : 0} selected={selectedDesign===id && !!selected}
          onGrab={() => {dragCallback.current?.(true);update(id,a=>({...a,motion:'held',motionSince:elapsed}));}}
          onMove={(point:GardenPoint) => update(id,a=>({...a,position:constrainGardenPoint(point,bounds)}))}
          onRelease={dragged => {
            dragCallback.current?.(false);
            if (dragged) {
              update(id,a=>releaseGardenAgent(a,elapsed,reduceMotion));
            } else update(id,a=>reactGardenAgent(a,elapsed,reduceMotion));
          }}
          onReact={() => {setSelectedDesign(id);update(id,a=>reactGardenAgent(a,elapsed,reduceMotion));}} />;
      })}
      {state.equipped.length === 0 ? <View style={styles.empty}><Text style={styles.helper}>동물 관리에서 함께할 친구를 골라주세요</Text></View> : null}
    </View>
    {selected && <View style={styles.careCard} testID="selected-companion-care-panel">
      <View style={styles.careTitle}>
        <FarmHudIcon name={selected.level===1?'badge-lv1':selected.level===2?'badge-lv2':'badge-lv3'} size={34}/>
        <View style={styles.careTitleCopy}>
          <Text style={styles.careName}>{activeDesign?.name ?? '나의 동물'} · Lv.{selected.level}</Text>
          <Text style={styles.helper}>내 동물의 상태 · 누적 {selected.totalEarnedXp.toLocaleString()} XP</Text>
        </View>
        <Button variant="ghost" size="compact" accessibilityLabel="동물 돌봄 패널 닫기" onPress={()=>setSelectedDesign(null)}>닫기</Button>
      </View>
      <View style={styles.meters}>
        <View style={styles.meter}><FarmHudGauge kind="hunger" label="배부름" value={selected.stats.satiety}/></View>
        <View style={styles.meter}><FarmHudGauge kind="cleanliness" label="청결도" value={selected.stats.cleanliness}/></View>
        <View style={styles.meter}><FarmHudGauge kind="affection" label="친밀도" value={selected.stats.affection}/></View>
        <View style={styles.meter}><FarmHudGauge kind="joy" label="행복도" value={selected.stats.joy}/></View>
        <View style={styles.meter}><FarmHudGauge kind="health" label="건강" value={selected.stats.health}/></View>
      </View>
      <View style={styles.xpBox}>
        <View style={styles.xpHeader}>
          <Text style={styles.careName}>성장 경험치</Text>
          <Text style={styles.helper}>{selected.growthXp.toLocaleString()} XP{nextTarget>xpFloor ? ` / ${nextTarget.toLocaleString()} XP`:''}</Text>
        </View>
        <View style={styles.xpTrack}><View style={[styles.xpFill,{width:`${xpPct}%` as `${number}%`}]} /></View>
        <Text style={styles.helper}>
          {selected.level===3?'최종 진화 완료':selected.canEvolve?'진화 조건을 모두 충족했어요.':`진화까지 필요한 조건: ${selected.nextEvolution?.blockers.map(item=>conditionText[item]??item).join(' · ') || '확인 중'}`}
        </Text>
      </View>
      {selected.stats.health===0?<Text style={styles.warning}>기절 상태예요. 먹이·청소·수면으로 회복시켜 주세요.</Text>:null}
      <View style={styles.careActions}>
        {(['feed','pet','play','clean','sleep'] as const).map(action=><FarmCareButton
          key={action} action={action}
          disabled={busy||!careInstance||(selected.stats.health===0&&(action==='pet'||action==='play'))}
          onPress={()=>void careInstance?.(selected.instanceId,action.toUpperCase() as CompanionCareAction)}/>)}
        <FarmCareButton action="evolve" disabled={busy||!selected.canEvolve||!evolveInstance}
          onPress={() => Alert.alert('진화하기',`${activeDesign?.name??'동물'}을(를) 다음 단계로 진화시킬까요?`,
            [{text:'취소',style:'cancel'},{text:'진화',onPress:()=>void evolveInstance?.(selected.instanceId)}])}/>
      </View>
      {careError?<Text accessibilityRole="alert" style={styles.warning}>{careError}</Text>:null}
    </View>}
    <View style={styles.menu}>
      <Text style={styles.balance}>{state.points.toLocaleString()} P</Text>
      <View style={styles.actions}>{([['manage','동물 관리'],['missions','미션'],['draw','뽑기']] as const).map(([page,label]) => <View key={page} style={styles.action}><Button fullWidth size="compact" variant="ghost" accessibilityLabel={`${label} 페이지 열기`} onPress={()=>onOpen(page)}>{label}</Button></View>)}</View>
    </View>
    {server&&error?<Button size="compact" accessibilityLabel="정원 서버 정보 새로 확인" disabled={busy} onPress={()=>void reloadServer()}>정원 새로 확인</Button>:null}
    <Text style={styles.helper}>{server ? '친구들을 끌어서 옮겨보세요' : '끌어서 옮겨보세요 · 체험 모드'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  section:{gap:8},
  space:{height:GARDEN_HEIGHT,overflow:'hidden',borderRadius:12},
  menu:{gap:8},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  action:{flexGrow:1,flexBasis:80,minWidth:80},
  helper:{...typography.caption,color:colors.textSecondary},
  balance:{...typography.caption,color:colors.primary,fontWeight:'600'},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:12},
  careCard:{backgroundColor:colors.surface,borderColor:colors.borderSoft,borderWidth:1,borderRadius:18,padding:12,gap:12},
  careTitle:{flexDirection:'row',alignItems:'center',gap:8},
  careTitleCopy:{flex:1,minWidth:0,gap:2},
  careName:{...typography.body,fontWeight:'700',color:colors.textPrimary},
  meters:{flexDirection:'row',flexWrap:'wrap',gap:6},
  meter:{flexBasis:'46%',flexGrow:1,minWidth:134},
  xpBox:{gap:6},
  xpHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  xpTrack:{height:8,borderRadius:8,backgroundColor:colors.borderSoft,overflow:'hidden'},
  xpFill:{height:8,borderRadius:8,backgroundColor:colors.primary},
  careActions:{flexDirection:'row',flexWrap:'wrap',gap:6},
  warning:{...typography.caption,color:colors.danger},
});
