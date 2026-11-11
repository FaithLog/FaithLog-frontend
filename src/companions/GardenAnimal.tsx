import {useEffect, useMemo, useRef} from 'react';
import {PanResponder, Platform, Pressable, StyleSheet, type ViewStyle, View} from 'react-native';
import {BibleFriendDesignSprite} from '../characters/BibleFriendDesignSprite';
import type {BibleFriendDesignId} from '../characters/bibleFriendDesignCatalog';
import {DRAG_THRESHOLD, GARDEN_ANIMAL_SIZE, type GardenAgent, type GardenPoint} from './gardenMotion';

type Props = {
  designId: BibleFriendDesignId; name: string; agent: GardenAgent; elapsed: number; reduceMotion: boolean;
  onGrab: () => void; onMove: (point: GardenPoint) => void;
  onRelease: (dragged: boolean) => void; onReact: () => void;
};
export function GardenAnimal(props: Props) {
  const latest = useRef(props); latest.current = props;
  const origin = useRef<GardenPoint>({x: 0, y: 0});
  const dragged = useRef(false);
  const clearClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {if (clearClick.current !== null) clearTimeout(clearClick.current);}, []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => true,
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      if (clearClick.current !== null) clearTimeout(clearClick.current);
      dragged.current = false; origin.current = latest.current.agent.position;
      latest.current.onGrab();
    },
    onPanResponderMove: (_event, gesture) => {
      if (Math.hypot(gesture.dx, gesture.dy) >= DRAG_THRESHOLD) dragged.current = true;
      if (dragged.current) latest.current.onMove({x: origin.current.x + gesture.dx, y: origin.current.y + gesture.dy});
    },
    onPanResponderRelease: () => {
      latest.current.onRelease(dragged.current);
      // Ignore a synthetic click following the drag; preserve subsequent keyboard activation.
      clearClick.current = setTimeout(() => {dragged.current = false; clearClick.current = null;}, 100);
    },
    onPanResponderTerminate: () => {latest.current.onRelease(true); dragged.current = true; clearClick.current = setTimeout(() => {dragged.current = false; clearClick.current = null;}, 100);},
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), []);
  const {agent, elapsed, reduceMotion, designId, name, onReact, onMove, onRelease} = props;
  const lifted = agent.motion === 'held';
  return <View {...responder.panHandlers}
    style={[styles.animal, {left:agent.position.x,top:agent.position.y,zIndex:lifted ? 1000 : Math.round(agent.position.y)}, Platform.OS === 'web' ? styles.webTouch : null]}
    testID={`garden-animal-${designId}`}>
    <Pressable
    accessibilityRole="button" accessibilityLabel={`${name} 인사하기`}
    accessibilityHint="누르면 인사하고, 끌어서 위치를 옮길 수 있어요. 접근성 동작으로도 이동할 수 있어요."
    accessibilityActions={[{name:'moveLeft',label:'왼쪽으로 이동'},{name:'moveRight',label:'오른쪽으로 이동'},{name:'moveUp',label:'위로 이동'},{name:'moveDown',label:'아래로 이동'}]}
    onAccessibilityAction={event => {
      const offsets: Record<string, GardenPoint> = {moveLeft:{x:-20,y:0},moveRight:{x:20,y:0},moveUp:{x:0,y:-20},moveDown:{x:0,y:20}};
      const offset = offsets[event.nativeEvent.actionName]; if (!offset) return;
      onMove({x: agent.position.x + offset.x, y: agent.position.y + offset.y}); onRelease(true);
    }}
    onAccessibilityTap={onReact}
    onPress={() => {if (!dragged.current) onReact();}}
    style={styles.touch}>
    <View pointerEvents="none" style={{transform:[{scaleX:agent.facing},{translateY:lifted && !reduceMotion ? -5 : 0},{scale:lifted && !reduceMotion ? 1.04 : 1}]}}>
      <BibleFriendDesignSprite designId={designId} motion={reduceMotion ? 'idle' : agent.motion} elapsedMs={reduceMotion ? 0 : Math.max(0,elapsed-agent.motionSince)} size={GARDEN_ANIMAL_SIZE} />
    </View>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  touch:{width:GARDEN_ANIMAL_SIZE,height:GARDEN_ANIMAL_SIZE},
  animal:{position:'absolute',width:GARDEN_ANIMAL_SIZE,height:GARDEN_ANIMAL_SIZE},
  webTouch:{touchAction:'none',userSelect:'none'} as ViewStyle,
});
