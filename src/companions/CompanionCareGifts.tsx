import {useEffect, useRef, useState} from 'react';
import {AppState, Text, View} from 'react-native';
import {FarmHudIcon} from './FarmHudAssets';
import {Button} from '../components/ui';
import {companionStyles as styles} from './companionStyles';
import type {CompanionCareGift} from './companionServerContract';

type Props = {
  id: string;
  careDays: number;
  load: (id: string) => Promise<CompanionCareGift[]>;
  claim: (id: string, milestone: number) => Promise<CompanionCareGift[]>;
};

export function CompanionCareGifts({id, careDays, load, claim}: Props) {
  const [gifts, setGifts] = useState<CompanionCareGift[]>([]);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  const claimLock = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false;};
  }, []);

  useEffect(() => {
    const refresh = async () => {
      if (claimLock.current) return;
      const sequence = ++request.current;
      setError('');
      try {
        const result = await load(id);
        if (sequence === request.current) setGifts(result);
      } catch {
        if (sequence === request.current) setError('선물 정보를 불러오지 못했어요.');
      }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    return () => {
      subscription.remove();
      request.current++;
    };
  }, [id, careDays, load, reload]);

  async function receive(milestone: number) {
    if (claimLock.current) return;
    claimLock.current = true;
    request.current++;
    setClaiming(true);
    setError('');
    try {
      const result = await claim(id, milestone);
      if (mounted.current) setGifts(result);
    } catch {
      if (mounted.current) {
        setError('선물 수령 결과를 확인하지 못했어요. 다시 확인해 주세요.');
      }
    } finally {
      claimLock.current = false;
      if (mounted.current) setClaiming(false);
    }
  }

  return <View style={styles.card}>
    <View style={styles.row}>
      <FarmHudIcon name="care-gift" size={28}/>
      <Text style={styles.name}>돌봄 선물</Text>
    </View>
    {gifts.map(gift => <View key={gift.milestone} style={styles.between}>
      <View style={styles.row}>
        <FarmHudIcon name="growth-shard" size={20}/>
        <Text style={styles.caption}>{gift.milestone}일 · 성장 조각 {gift.shards}개</Text>
      </View>
      {gift.status === 'READY'
        ? <Button size="compact" disabled={claiming} onPress={() => void receive(gift.milestone)}
            accessibilityLabel={`${gift.milestone}일 돌봄 선물 받기`}>받기</Button>
        : <Text style={styles.caption}>{gift.status === 'CLAIMED' ? '수령 완료'
          : gift.status === 'TOMORROW' ? '내일 받기' : '돌봄 일수 필요'}</Text>}
    </View>)}
    {error ? <Text accessibilityRole="alert" style={styles.caption}>{error}</Text> : null}
    {error || gifts.some(gift => gift.status === 'TOMORROW')
      ? <Button size="compact" variant="ghost" accessibilityLabel="선물 상태 다시 확인" onPress={() => setReload(value => value + 1)}>선물 상태 다시 확인</Button>
      : null}
    {!error && !gifts.length && <Text style={styles.caption}>선물 확인 중…</Text>}
  </View>;
}
