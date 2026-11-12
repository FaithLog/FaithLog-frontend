import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, AppState} from 'react-native';

/** One clock per scene; paused time is excluded and background timers are removed. */
export function useCompanionMotion(running = true, frameMs = 80) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(true);
  const [motionReady, setMotionReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const total = useRef(0);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {if (mounted) setReduceMotion(value);}).catch(() => {}).finally(() => {if (mounted) setMotionReady(true);});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => {mounted = false; motion.remove(); app.remove();};
  }, []);
  useEffect(() => {
    if (!running || !foreground || reduceMotion) return;
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      total.current += Math.min(now - previous, 200);
      previous = now;
      setElapsed(total.current);
    }, frameMs);
    return () => clearInterval(timer);
  }, [foreground, frameMs, reduceMotion, running]);
  return {elapsed, reduceMotion, foreground, motionReady};
}
