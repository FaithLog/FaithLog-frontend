import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, StyleSheet, Text, View} from 'react-native';
import {BIBLE_FRIEND_DESIGN_CATALOG} from '../characters/bibleFriendDesignCatalog';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import type {GardenExpedition, GardenExpeditionApi} from './gardenExpeditionContract';

export function GardenExpeditionCard({api, instanceId, onClaimed}: {
  api: GardenExpeditionApi;
  instanceId: string;
  onClaimed: () => void;
}) {
  const [status, setStatus] = useState<GardenExpedition | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const sequence = useRef(0);
  const lock = useRef(false);

  const run = useCallback(async (request: () => Promise<GardenExpedition>, onSuccess?: () => void) => {
    if (lock.current) return;
    lock.current = true;
    const ticket = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const result = await request();
      if (ticket === sequence.current) {
        setStatus(result);
        onSuccess?.();
      }
    } catch {
      if (ticket === sequence.current) setError('탐험 상태를 확인하지 못했어요. 새로고침해 주세요.');
    } finally {
      if (ticket === sequence.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    void run(api.load);
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state === 'active') void run(api.load);
    });
    return () => {
      subscription.remove();
      sequence.current++;
      lock.current = false;
    };
  }, [api, run]);

  useEffect(() => {
    if (!foreground || busy || error || status?.state !== 'EXPLORING' || !status.readyAt) return;
    const remaining = Date.parse(status.readyAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    // A device clock ahead of the server can reach the return time early.
    const delay = remaining > 0 ? Math.min(2_147_483_647, remaining + 500) : 30_000;
    const timer = setTimeout(() => void run(api.load), delay);
    return () => clearTimeout(timer);
  }, [api, busy, error, foreground, run, status]);

  const name = BIBLE_FRIEND_DESIGN_CATALOG.find(design => design.id === status?.designId)?.name ?? '동물';
  const expeditionId = status?.id;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>정원 탐험</Text>
    {status?.state === 'AVAILABLE' && <>
      <Text style={styles.caption}>30분 탐험을 마치면 성장 조각 {status.reward}개를 받을 수 있어요.</Text>
      <Button size="compact" disabled={busy || !!error} accessibilityLabel="선택한 동물 탐험 보내기"
        onPress={() => void run(() => api.start(instanceId))}>탐험 보내기</Button>
    </>}
    {status?.state === 'EXPLORING' && <Text style={styles.caption}>{name} 탐험 중 · {status.readyAt &&
      new Date(status.readyAt).toLocaleTimeString('ko-KR', {timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit'})} 돌아와요</Text>}
    {status?.state === 'READY' && expeditionId && <Button size="compact" disabled={busy || !!error}
      accessibilityLabel="탐험 보상 받기" onPress={() => void run(() => api.claim(expeditionId), onClaimed)}>
      {`성장 조각 ${status.reward}개 받기`}
    </Button>}
    {status?.state === 'CLAIMED' && <Text style={styles.caption}>오늘 시작한 탐험의 보상을 받았어요.</Text>}
    {busy && <Text accessibilityLiveRegion="polite" style={styles.caption}>탐험 정보를 확인하고 있어요…</Text>}
    {error !== '' && <Text accessibilityRole="alert" style={styles.caption}>{error}</Text>}
    {(error || status?.state === 'EXPLORING' || status?.state === 'CLAIMED') && <Button size="compact" variant="ghost" disabled={busy}
      accessibilityLabel="탐험 상태 새로고침" onPress={() => void run(api.load)}>새로고침</Button>}
  </View>;
}

const styles = StyleSheet.create({
  card: {gap: 6, padding: 10, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10},
  title: {...typography.body, color: colors.textPrimary, fontWeight: '700'},
  caption: {...typography.caption, color: colors.textSecondary},
});
