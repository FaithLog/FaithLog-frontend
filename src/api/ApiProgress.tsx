import {useSyncExternalStore} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

const listeners = new Set<() => void>();
let visibleRequests = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function isPending() {
  return visibleRequests > 0;
}

/** Track the full request, including authentication refresh and retry. */
export async function withApiProgress<T>(request: () => Promise<T>): Promise<T> {
  let visible = false;
  const timer = setTimeout(() => {
    visible = true;
    visibleRequests++;
    if (visibleRequests === 1) listeners.forEach(listener => listener());
  }, 400);
  try {
    return await request();
  } finally {
    clearTimeout(timer);
    if (visible) {
      visibleRequests--;
      if (visibleRequests === 0) listeners.forEach(listener => listener());
    }
  }
}

export function ApiProgress() {
  const pending = useSyncExternalStore(subscribe, isPending, isPending);
  if (!pending) return null;

  return (
    <View pointerEvents="none" style={styles.position}>
      <View accessibilityRole="progressbar" accessibilityLabel="요청 처리 중"
        accessibilityLiveRegion="polite" style={styles.badge}>
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={styles.label}>요청 처리 중</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  position: {position:'absolute', top:'12%', left:0, right:0, alignItems:'center', zIndex:100},
  badge: {flexDirection:'row', alignItems:'center', gap:8, paddingVertical:8,
    paddingHorizontal:14, borderRadius:20, backgroundColor:'#25344A', elevation:4},
  label: {color:'#FFFFFF', fontSize:13, fontWeight:'600'},
});
