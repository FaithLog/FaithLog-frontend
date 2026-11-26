import {useEffect, useRef, useState, type RefObject} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui';
import {colors, typography} from '../theme';
import {gardenPhotoRuntime, type GardenPhotoCapture} from './gardenPhotoFrame';

async function removePhoto(uri: string) {
  try {
    const {File} = await import('expo-file-system');
    new File(uri).delete();
  } catch {
    // Temporary cache files can already have been removed by the OS.
  }
}

export function GardenPhotoPanel({captureRef, onClose}: {
  captureRef: RefObject<GardenPhotoCapture | null>;
  onClose: () => void;
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const currentPhoto = useRef<string | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!locked.current && currentPhoto.current) void removePhoto(currentPhoto.current);
    };
  }, []);

  async function run(action: 'capture' | 'save' | 'share') {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (action === 'capture') {
        if (!captureRef.current) throw new Error('Garden capture unavailable');
        const uri = await captureRef.current.capture();
        const previous = currentPhoto.current;
        currentPhoto.current = uri;
        if (previous) await removePhoto(previous);
        if (mounted.current) {setPhoto(uri); setSaved(false);}
      } else if (photo && action === 'save') {
        await gardenPhotoRuntime?.saveToGallery(photo);
        if (mounted.current) {setSaved(true); setMessage('사진 보관함에 저장했어요.');}
      } else if (photo) {
        const sharing = await import('expo-sharing');
        if (!await sharing.isAvailableAsync()) throw new Error('Sharing unavailable');
        await sharing.shareAsync(photo, {mimeType: 'image/png', UTI: 'public.png', dialogTitle: '정원 단체 사진 공유'});
      }
    } catch {
      if (mounted.current) setMessage(action === 'save'
        ? '사진을 저장하지 못했어요. 사진 보관함 추가 권한을 확인해 주세요.'
        : action === 'share' ? '사진을 공유하지 못했어요.' : '사진을 찍지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
      else if (currentPhoto.current) void removePhoto(currentPhoto.current);
    }
  }

  return <View style={styles.panel}>
    <View style={styles.actions}>
      <Text accessibilityRole="header" style={styles.title}>정원 단체 사진</Text>
      <Button size="compact" variant="ghost" disabled={busy} accessibilityLabel="단체 사진 닫기" onPress={onClose}>닫기</Button>
    </View>
    {photo && <Image source={{uri: photo}} resizeMode="contain" style={styles.preview} accessibilityLabel="촬영한 정원 사진" />}
    <View style={styles.actions}>
      <Button size="compact" disabled={busy} variant={photo ? 'secondary' : 'primary'}
        accessibilityLabel="정원 사진 찍기" onPress={() => void run('capture')}>{photo ? '다시 찍기' : '사진 찍기'}</Button>
      {photo && gardenPhotoRuntime?.canSaveToGallery && <Button size="compact" disabled={busy || saved} variant="secondary"
        accessibilityLabel="정원 사진 저장" onPress={() => void run('save')}>{saved ? '저장 완료' : '저장'}</Button>}
      {photo && <Button size="compact" disabled={busy}
        accessibilityLabel="정원 사진 공유" onPress={() => void run('share')}>공유</Button>}
    </View>
    {busy && <Text accessibilityLiveRegion="polite" style={styles.caption}>사진 처리 중…</Text>}
    {message !== '' && <Text accessibilityLiveRegion="polite" style={styles.caption}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  panel: {gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface},
  actions: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
  title: {...typography.body, color: colors.textPrimary, fontWeight: '700', flexGrow: 1},
  caption: {...typography.caption, color: colors.textSecondary},
  preview: {width: '100%', height: 172},
});
