import {useEffect, useState} from 'react';
import {AppState, Text, View} from 'react-native';
import {Button, Chip} from '../components/ui';
import {getDemoMissionStatus, getMissionPeriodKeys, MISSIONS, type MissionPeriod} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

export function CompanionMissionsPage({onActivity}: {onActivity: (route: 'devotion' | 'polls') => void}) {
  const {state, dispatch} = useCompanions();
  const [period, setPeriod] = useState<MissionPeriod>('daily');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {if (timer !== undefined) clearInterval(timer); timer = undefined;};
    const start = () => {stop(); refresh(); timer = setInterval(refresh, 60_000);};
    const sub = AppState.addEventListener('change', value => {if (value === 'active') start(); else stop();});
    if (AppState.currentState === 'active') start();
    return () => {stop(); sub.remove();};
  }, []);
  const keys = getMissionPeriodKeys(now);
  const missions = MISSIONS.filter(m => m.period === period);
  const total = missions.reduce((sum, m) => sum + m.points, 0);
  const earned = missions.filter(m => state.claimed.includes(`${keys[period]}:${m.id}`)).reduce((sum, m) => sum + m.points, 0);
  return <View style={s.page}>
    <View style={s.card}><View style={s.between}><Text style={s.name}>작은 실천이 새로운 만남으로</Text><Chip label="체험 모드" tone="info" /></View><Text style={s.body}>꾸준히 실천하고 친구를 만날 포인트를 모아요.</Text><Text style={s.caption}>현재 완료 상태는 예시예요. 실제 경건 기록·투표와 보상 검증은 서버 연결 후 적용돼요.</Text></View>
    <View style={s.tabs}>{([['daily', '일간'], ['weekly', '주간'], ['monthly', '월간']] as const).map(([key, label]) => <Button accessibilityLabel={`${label} 미션 보기`} key={key} onPress={() => setPeriod(key)} variant={key === period ? 'primary' : 'secondary'}>{label}</Button>)}</View>
    <View style={s.between}><Text style={s.name}>{keys[period]} 기준</Text><Text style={s.caption}>수령 {earned} / {total}P</Text></View>
    {missions.map(mission => {
      const status = getDemoMissionStatus(mission.id);
      const claimed = state.claimed.includes(`${keys[period]}:${mission.id}`);
      return <View key={mission.id} style={s.card}>
        <View style={s.between}><Text style={s.name}>{mission.label}</Text><Text style={s.name}>+{mission.points}P</Text></View>
        <Text style={s.caption}>{claimed ? '보상을 받았어요' : status === 'settling' ? '기간 종료 및 집계 확정 후 확인해요' : status === 'ready' ? '보상을 받을 수 있어요 (예시)' : '아직 완료하지 않았어요 (예시)'}</Text>
        {status === 'incomplete' && mission.destination ? <Button accessibilityLabel={`${mission.label} 하러 가기`} variant="secondary" onPress={() => onActivity(mission.destination!)}>하러 가기</Button> : <Button accessibilityLabel={`${mission.label} ${claimed ? '수령 완료' : '보상 받기'}`} disabled={claimed || status !== 'ready'} variant={claimed || status !== 'ready' ? 'secondary' : 'primary'} onPress={() => dispatch({type: 'claim', missionId: mission.id, periodKey: keys[period], status})}>{claimed ? '수령 완료' : status === 'settling' ? '집계 대기' : '보상 받기'}</Button>}
      </View>;
    })}
    <View style={s.notice}><Text style={s.caption}>일간 최대 100P · 주간 최대 200P · 월간 최대 500P</Text><Text style={s.caption}>하루는 한국 시간 00시, 주간은 월요일 기준이에요. 벌금 없음은 납부 여부가 아닌 확정된 벌금 발생 여부로 판단해요. 가입 전 기간과 투표가 없는 주의 처리 기준은 서버 연결 시 적용해요.</Text></View>
  </View>;
}
