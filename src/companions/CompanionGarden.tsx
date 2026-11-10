import {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {BIBLE_FRIEND_DESIGN_CATALOG, type BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {type CompanionPage} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {GardenAnimal} from './GardenAnimal';
import {advanceGardenAgent, chooseGardenTarget, constrainGardenPoint, createGardenAgent, GARDEN_HEIGHT, normalizeGardenPoint, reactGardenAgent, releaseGardenAgent, restoreGardenPoint, type GardenAgent, type GardenBounds, type GardenPoint} from './gardenMotion';
import {useCompanionMotion} from './useCompanionMotion';

export function CompanionGarden({onOpen, onDragStateChange}: {onOpen: (page: CompanionPage) => void; onDragStateChange?: (dragging: boolean) => void}) {
  const {state, dispatch} = useCompanions();
  const {elapsed, reduceMotion, foreground} = useCompanionMotion(true, 40);
  const [bounds, setBounds] = useState<GardenBounds>({width: 300,height:GARDEN_HEIGHT});
  const agents = useRef(new Map<BibleFriendDesignId,GardenAgent>());
  const previous = useRef(elapsed);
  const dragCallback = useRef(onDragStateChange); dragCallback.current = onDragStateChange;
  const [, repaint] = useState(0);
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
      {state.equipped.map(id => {
        const agent = agents.current.get(id)!;
        const name = BIBLE_FRIEND_DESIGN_CATALOG.find(d=>d.id===id)?.name ?? '동물';
        return <GardenAnimal key={id} designId={id} name={name} agent={agent} elapsed={elapsed} reduceMotion={reduceMotion}
          onGrab={() => {dragCallback.current?.(true);update(id,a=>({...a,motion:'held',motionSince:elapsed}));}}
          onMove={(point:GardenPoint) => update(id,a=>({...a,position:constrainGardenPoint(point,bounds)}))}
          onRelease={dragged => {
            dragCallback.current?.(false);
            if (dragged) {
              const current = agents.current.get(id);
              if (current) dispatch({type:'move',designId:id,position:normalizeGardenPoint(current.position,bounds)});
              update(id,a=>releaseGardenAgent(a,elapsed,reduceMotion));
            } else update(id,a=>reactGardenAgent(a,elapsed,reduceMotion));
          }}
          onReact={() => update(id,a=>reactGardenAgent(a,elapsed,reduceMotion))} />;
      })}
      {state.equipped.length === 0 ? <View style={styles.empty}><Text style={styles.helper}>동물 관리에서 함께할 친구를 골라주세요</Text></View> : null}
    </View>
    <View style={styles.menu}>
      <Text style={styles.balance}>{state.points.toLocaleString()} P</Text>
      <View style={styles.actions}>{([['manage','동물 관리'],['missions','미션'],['draw','뽑기']] as const).map(([page,label]) => <Button key={page} size="compact" variant="ghost" accessibilityLabel={`${label} 페이지 열기`} onPress={()=>onOpen(page)}>{label}</Button>)}</View>
    </View>
    <Text style={styles.helper}>끌어서 옮겨보세요 · 체험 모드</Text>
  </View>;
}
const styles = StyleSheet.create({
  section:{gap:0},
  space:{height:GARDEN_HEIGHT,overflow:'hidden'},
  menu:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:4},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:0},
  helper:{...typography.caption,color:colors.textSecondary},
  balance:{...typography.caption,color:colors.primary,fontWeight:'600'},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:12},
});
