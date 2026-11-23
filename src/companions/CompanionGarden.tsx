import {GardenDecorationShop} from './GardenDecorationShop';
import {GardenDecorationEditor, GardenDecorationLayer, useGardenDecorations} from './GardenDecorations';
import {GardenBackground} from './GardenBackground';
import {Fragment, useEffect, useRef, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {FarmCareButton,FarmHudGauge,FarmHudIcon} from './FarmHudAssets';
import type {CompanionCareAction} from './companionServerContract';
import {BIBLE_FRIEND_DESIGN_CATALOG} from '../characters/bibleFriendDesignCatalog';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {companionGardenSlots, type CompanionPage} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {GardenAnimal} from './GardenAnimal';
import {BibleFriendFarmSprite} from '../characters/BibleFriendFarmSprite';
import {FarmMessMarker} from './FarmMessMarker';
import {resolveFarmSpriteVisual, type RunningFarmAnimation} from './companionFarmVisual';
import {advanceGardenAgent, constrainGardenPoint, createGardenAgent, GARDEN_HEIGHT, normalizeGardenPoint, reactGardenAgent, releaseGardenAgent, restoreGardenPoint, type GardenAgent, type GardenBounds, type GardenPoint} from './gardenMotion';
import {useCompanionMotion} from './useCompanionMotion';
import {CompanionCareGifts} from './CompanionCareGifts';
import {getCompanionCareBadges} from './companionCareBadges';

export function CompanionGarden({onOpen, onDragStateChange, decorationScope}: {
  onOpen: (page: CompanionPage) => void;
  onDragStateChange?: (dragging: boolean) => void;
  decorationScope?: string;
}) {
  const decorations = useGardenDecorations(decorationScope);
  const [decorationPreview, setDecorationPreview] = useState<typeof decorations.layout>(null);
  const [decorationPanel, setDecorationPanel] = useState<'edit' | 'shop' | null>(null);
  function closeDecorations() {
    setDecorationPreview(null);
    setDecorationPanel(null);
  }
  const {state,server,busy,error,refresh:reloadServer,instances,farmAnimation,careError,careInstance,evolveInstance,baseAppearance,toggleAppearance,wakeInstance,shardBalance,loadShards,boostWithShards,careGifts,claimCareGift} = useCompanions();
  const slots=companionGardenSlots(state);
  // Group alerts across the <=5 visible pets. No per-animal notifications,
  // polling, push permission or scheduled server work on the home scene.
  const needsAttention=(instances??[]).filter(item=>item.stats.health<25
    ||item.stats.satiety<25||item.stats.cleanliness<25);
  const [selectedKey,setSelectedKey] = useState<string|null>(null);
  const [growthExpanded,setGrowthExpanded]=useState(false);
  const selectedSlot=slots.find(p=>(p.instanceId??p.designId)===selectedKey);
  const selected=selectedSlot
    ? instances?.find(item=>selectedSlot.instanceId
      ? item.instanceId===selectedSlot.instanceId : item.designId===selectedSlot.designId)
    : null;
  useEffect(()=>{
    if(selectedKey)void loadShards?.();
  },[selectedKey,loadShards]);
  const appearanceLabel=selected && baseAppearance?.has(selected.instanceId)
    ? '진화 외형으로 보기' : '기본 외형으로 보기';
  const activeDesign=selectedSlot
    ? BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===selectedSlot.designId):null;
  const careBadges = selected && !selected.designId.startsWith('jesus:')
    ? getCompanionCareBadges(selected.careDays) : null;
  const xpFloor=selected?.level===3?1000:selected?.level===2?300:0;
  const nextTarget=selected?.nextEvolution?.threshold?.growthXp ?? xpFloor;
  const xpPct=nextTarget>xpFloor?Math.max(0,Math.min(100,((selected?.growthXp??0)-xpFloor)/(nextTarget-xpFloor)*100)):100;
  const threshold=selected?.nextEvolution?.threshold;
  const growthRequirements=threshold?[
   {name:'경험치',current:selected?.growthXp??0,need:threshold.growthXp,unit:'XP'},
   {name:'돌봄 일수',current:selected?.careDays??0,need:threshold.distinctCareDays,unit:'일'},
   {name:'건강',current:selected?.stats.health??0,need:threshold.health,unit:''},
   {name:'배부름',current:selected?.stats.satiety??0,need:threshold.satiety,unit:''},
   {name:'청결도',current:selected?.stats.cleanliness??0,need:threshold.cleanliness,unit:''},
  ]:[];
  const conditionText:Record<string,string>={EXPERIENCE:'경험치',CARE_DAYS:'돌봄 날짜',HEALTH:'건강',SATIETY:'배부름',CLEANLINESS:'청결도',MAX_LEVEL:'최종 진화'};
  const {elapsed, reduceMotion, foreground} = useCompanionMotion(true, 40);
  const observedAnimation = useRef(farmAnimation);
  const [runningAnimation,setRunningAnimation]=useState<RunningFarmAnimation|null>(null);
  useEffect(()=>{
    if(observedAnimation.current===farmAnimation)return;
    observedAnimation.current=farmAnimation;
    setRunningAnimation(farmAnimation&&!reduceMotion?{...farmAnimation,startedAt:elapsed}:null);
  },[farmAnimation,elapsed,reduceMotion]);
  const [bounds, setBounds] = useState<GardenBounds>({width: 300,height:GARDEN_HEIGHT});
  const agents = useRef(new Map<string,GardenAgent>());
  const previous = useRef(elapsed);
  const dragCallback = useRef(onDragStateChange); dragCallback.current = onDragStateChange;
  const [, repaint] = useState(0);
  // Positions and motion belong to this screen, independently of server snapshots.
  const refresh = () => repaint(value => value + 1);
  useEffect(() => () => {dragCallback.current?.(false);}, []);
  const delta = elapsed - previous.current; previous.current = elapsed;
  const keys=new Set(slots.map(p=>p.instanceId??p.designId));
  for (const key of [...agents.current.keys()]) if (!keys.has(key)) agents.current.delete(key);
  for (const slot of slots) {
    const key=slot.instanceId??slot.designId;
    if (!agents.current.has(key)) {
      const saved={x:slot.x,y:slot.y};
      const position=restoreGardenPoint(saved,bounds);
      agents.current.set(key,createGardenAgent(position,elapsed,bounds));
    }
  }
  if (!reduceMotion && delta > 0) {
    const snapshot = [...agents.current.entries()];
    for (const [id,agent] of snapshot) {
      const slot=slots.find(item=>(item.instanceId??item.designId)===id);
      const animal=instances?.find(item=>slot?.instanceId
        ? item.instanceId===slot.instanceId : item.designId===slot?.designId);
      const visual=resolveFarmSpriteVisual(animal,reduceMotion?null:runningAnimation,elapsed);
      if(visual.pauseMovement&&agent.motion!=='held')continue;
      agents.current.set(id,advanceGardenAgent(agent,elapsed,delta,bounds,
        snapshot.filter(([other])=>other!==id).map(([,a])=>a.position)));
    }
  }
  const update = (id: string, next: (agent: GardenAgent) => GardenAgent) => {
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
      <GardenDecorationLayer layout={decorationPreview ?? decorations.layout} />
      {slots.map(slot => {
        const id=slot.designId;
        const key=slot.instanceId??id;
        const agent=agents.current.get(key)!;
        const name = BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===id)?.name ?? '동물';
        const animal=instances?.find(item=>slot.instanceId
          ? item.instanceId===slot.instanceId:item.designId===id);
        const visual=resolveFarmSpriteVisual(animal,reduceMotion?null:runningAnimation,elapsed);
        const farmAction=agent.motion==='held'||(agent.motion==='walk'&&!visual.pauseMovement)
          ? undefined : visual.action;
        return <Fragment key={key}><GardenAnimal {...(slot.instanceId?{instanceId:slot.instanceId}:{})} designId={id} name={name} agent={agent} elapsed={elapsed} reduceMotion={reduceMotion}
          evolutionStage={animal && (!baseAppearance?.has(animal.instanceId) || farmAction==='evolve')
            ? (animal.level-1) as 0|1|2 : 0} selected={selectedKey===key && !!selected}
          {...(farmAction ? {farmAction} : {})} farmActionElapsedMs={visual.elapsedMs}
          onGrab={() => {dragCallback.current?.(true);update(key,a=>({...a,motion:'held',motionSince:elapsed}));}}
          onMove={(point:GardenPoint) => update(key,a=>({...a,position:constrainGardenPoint(point,bounds)}))}
          onRelease={dragged => {
            dragCallback.current?.(false);
            if (dragged) {
              update(key,a=>releaseGardenAgent(a,elapsed,reduceMotion));
            } else update(key,a=>reactGardenAgent(a,elapsed,reduceMotion));
          }}
          onReact={() => {setSelectedKey(key);if(animal?.dormant)void wakeInstance?.(animal.instanceId);update(key,a=>reactGardenAgent(a,elapsed,reduceMotion));}} />
        {animal && !animal.dormant && animal.stats.cleanliness<35 && <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} 주변 청소하기`}
          accessibilityHint="청소가 필요한 흔적을 치웁니다. 청소 쿨타임이 적용돼요."
          disabled={busy||!careInstance||!!error}
          onPress={()=>{setSelectedKey(key);void careInstance?.(animal.instanceId,'CLEAN');}}
          style={[styles.messSpot,{
            left:Math.max(0,Math.min(bounds.width-40,agent.position.x+24)),
            top:Math.max(0,Math.min(bounds.height-40,agent.position.y+65)),
            zIndex:1001,
          }]}>
          <FarmMessMarker/>
        </Pressable>}
        </Fragment>;
      })}
      {slots.length === 0 ? <View style={styles.empty}><Text style={styles.helper}>동물 관리에서 함께할 친구를 골라주세요</Text></View> : null}
    </View>
    {decorationPanel === 'edit' && decorations.layout
      ? <GardenDecorationEditor layout={decorations.layout} onPreview={setDecorationPreview}
          onSave={decorations.save} onClose={closeDecorations} />
      : decorationPanel === 'shop'
        ? <GardenDecorationShop points={state.points} onClose={closeDecorations}
            onPreview={(id, slot) => {
              const preview: NonNullable<typeof decorations.layout> = [...(decorations.layout ?? [null, null, null])];
              preview[slot] = id;
              setDecorationPreview(preview);
            }} />
        : <View style={styles.actions}>
          {decorations.layout && <Button size="compact" variant="secondary" accessibilityLabel="정원 꾸미기" onPress={() => setDecorationPanel('edit')}>정원 꾸미기</Button>}
          <Button size="compact" variant="primary" accessibilityLabel="정원 상점 열기" onPress={() => setDecorationPanel('shop')}>정원 상점</Button>
        </View>}
    {decorations.error && <Button size="compact" variant="secondary" accessibilityLabel="장식 배치 다시 불러오기"
      onPress={decorations.reload}>{decorations.error} 다시 시도</Button>}
    {needsAttention.length>0?<View style={styles.attentionRow} testID="companion-attention-banner">
      <Text style={styles.helper}>돌봄이 필요한 동물 {needsAttention.length}마리 · 건강과 배부름·청결도를 확인해주세요.</Text>
      <Button variant="secondary" size="compact" accessibilityLabel="돌봄 필요한 동물 보기"
        onPress={()=>{
          const target=needsAttention[0];
          const slot=slots.find(p=>p.instanceId===target?.instanceId);
          if(slot)setSelectedKey(slot.instanceId??slot.designId);
        }}>돌보기</Button>
    </View>:null}
    {selected && <View style={styles.careCard} testID="selected-companion-care-panel">
      <View style={styles.careTitle}>
        <FarmHudIcon name={selected.level===1?'badge-lv1':selected.level===2?'badge-lv2':'badge-lv3'} size={34}/>
        <View style={styles.careTitleCopy}>
          <Text style={styles.careName}>{activeDesign?.name ?? '나의 동물'} · Lv.{selected.level}</Text>
          <Text style={styles.helper}>내 동물의 상태 · 누적 {selected.totalEarnedXp.toLocaleString()} XP</Text>
        </View>
        <Button variant="ghost" size="compact" accessibilityLabel="동물 돌봄 패널 닫기" onPress={()=>setSelectedKey(null)}>닫기</Button>
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
      <Button variant="ghost" size="compact" accessibilityLabel="동물 성장 기록과 진화 조건 펼치기"
        onPress={()=>setGrowthExpanded(value=>!value)}>
        {growthExpanded?'성장 정보 접기':'성장 기록·진화 미리보기'}
      </Button>
      {growthExpanded?<View style={styles.growthDetails} testID="companion-growth-details">
        <Text style={styles.careName}>성장 기록</Text>
        <Text style={styles.helper}>누적 획득 {selected.totalEarnedXp.toLocaleString()} XP · 돌봄한 날짜 {selected.careDays}일</Text>
        {careBadges && <View style={styles.badgeProgress}>
          <Text style={styles.careName}>돌봄 배지</Text>
          {careBadges.earned && <View style={styles.rewardIconRow}>
            <FarmHudIcon name={`care-badge-${careBadges.earned.careDays}`} size={28}/>
            <Text style={styles.badgeLabel}>{careBadges.earned.label}</Text>
          </View>}
          {careBadges.next
            ? <View style={styles.rewardIconRow}>
                <FarmHudIcon name={`care-badge-${careBadges.next.careDays}`} size={24}/>
                <Text style={[styles.helper, styles.rewardCopy]}>
                  다음 배지 · {careBadges.next.label} ({selected.careDays}/{careBadges.next.careDays}일)
                </Text>
              </View>
            : <Text style={styles.helper}>모든 돌봄 배지를 모았어요.</Text>}
        </View>}
        {careBadges && careGifts && claimCareGift &&
          <CompanionCareGifts key={selected.instanceId} id={selected.instanceId}
            careDays={selected.careDays} load={careGifts} claim={claimCareGift}/>}
        {threshold?<>
          <View style={styles.previewRow}>
            <BibleFriendFarmSprite designId={selected.designId}
              evolutionStage={selected.level===1?1:2}
              motion="idle" elapsedMs={0} reduceMotion size={68}/>
            <View style={styles.careTitleCopy}>
              <Text style={styles.careName}>다음 진화 · Lv.{selected.level+1}</Text>
              <Text style={styles.helper}>아래 조건을 모두 충족하면 진화할 수 있어요.</Text>
            </View>
          </View>
          {growthRequirements.map(req=><View key={req.name} style={styles.requirementRow}>
            <Text style={styles.helper}>{req.name}</Text>
            <Text style={styles.helper}>{req.current.toLocaleString()} / {req.need.toLocaleString()} {req.unit}
              {req.current>=req.need?' ✓':''}</Text>
          </View>)}
        </>:<Text style={styles.helper}>
          {selected.level===3?'최종 진화까지 완료했어요.':'이 캐릭터는 추가 진화 단계가 없어요.'}
        </Text>}
        <Button size="compact" variant="secondary" accessibilityLabel="성장 기록에서 경건 미션 보기"
          onPress={() => onOpen('missions')}>경건 미션 보기</Button>
      </View>:null}
      {selected.level>1 && toggleAppearance && <Button size="compact" accessibilityLabel={appearanceLabel}
        onPress={() => toggleAppearance(selected.instanceId)}>
        {appearanceLabel}
      </Button>}
      {selected.dormant?<Text style={styles.helper}>휴면 중 · 동물을 누르거나 밥을 주면 깨어나요.</Text>:null}
      {shardBalance!==null&&shardBalance!==undefined&&selected.designId!=='jesus:miracle'&&boostWithShards?
        <View style={styles.rewardIconRow}>
          <FarmHudIcon name="growth-shard" size={24}/>
          <View style={styles.rewardCopy}>
            <Button size="compact" variant="secondary" accessibilityLabel="성장 조각으로 XP 올리기" disabled={busy||!!selected.dormant||shardBalance<10}
              onPress={()=>void boostWithShards(selected.instanceId)}>
              성장 XP +20 · 조각 10개 사용 ({shardBalance}개 보유)
            </Button>
          </View>
        </View>:null}
      {selected.stats.health===0?<Text style={styles.warning}>기절 상태예요. 먹이·청소·수면으로 회복시켜 주세요.</Text>:null}
      <View style={styles.careActions}>
        {(['feed','pet','play','clean','sleep'] as const).filter(action=>!selected.dormant||action==='feed').map(action=><FarmCareButton
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
  attentionRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap',
    borderWidth:1,borderColor:colors.borderSoft,borderRadius:12,padding:10},
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
  rewardIconRow:{flexDirection:'row',alignItems:'center',gap:6},
  rewardCopy:{flex:1,minWidth:0},
  badgeProgress:{gap:4},
  badgeLabel:{...typography.caption,color:colors.primary,fontWeight:'700'},
  growthDetails:{borderColor:colors.borderSoft,borderWidth:1,borderRadius:12,padding:10,gap:8},
  messSpot:{position:'absolute',width:40,height:40,alignItems:'center',justifyContent:'center'},
  previewRow:{flexDirection:'row',alignItems:'center',gap:8},
  requirementRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  warning:{...typography.caption,color:colors.danger},
});
