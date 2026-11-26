import {useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {Button} from '../components/ui';
import type {CompanionServerApi} from './companionServerContract';
import {companionStyles as styles} from './companionStyles';

export function GardenCareReminder({api}: {api: NonNullable<CompanionServerApi['careReminder']>}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const running = useRef(false);

  async function run(request: () => Promise<boolean>) {
    if (running.current) return;
    running.current = true;
    const ticket = ++sequence.current;
    setBusy(true);
    setFailed(false);
    try {
      const value = await request();
      if (sequence.current === ticket) setEnabled(value);
    } catch {
      if (sequence.current === ticket) {
        setEnabled(null);
        setFailed(true);
      }
    } finally {
      if (sequence.current === ticket) {
        running.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    setEnabled(null);
    void run(api.load);
    return () => {sequence.current++; running.current = false;};
  }, [api]);

  return <View style={styles.stack}>
    <Text style={styles.eyebrow}>돌봄 푸시 알림</Text>
    <Text style={styles.caption}>돌봄이 필요한 동물이 있으면 저녁 7시에 알려드려요. 기기에서 앱 알림을 허용해 주세요.</Text>
    {failed && <Text accessibilityRole="alert" style={styles.caption}>알림 설정을 확인하지 못했어요.</Text>}
    {enabled === null
      ? <Button size="compact" variant="secondary" disabled={busy} accessibilityLabel="돌봄 알림 설정 다시 확인"
          onPress={() => void run(api.load)}>
          {busy ? '알림 설정 확인 중…' : '알림 설정 다시 확인'}
        </Button>
      : <Button size="compact" variant="secondary" disabled={busy}
          accessibilityLabel={enabled ? '돌봄 알림 끄기' : '돌봄 알림 켜기'}
          onPress={() => void run(() => api.setEnabled(!enabled))}>
          {enabled ? '돌봄 알림 끄기' : '돌봄 알림 켜기'}
        </Button>}
  </View>;
}
