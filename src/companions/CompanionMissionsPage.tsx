import {useEffect, useState} from 'react';
import {AppState, Text, View} from 'react-native';
import {Button} from '../components/ui';
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
  const ready = missions.filter(m => getDemoMissionStatus(m.id) === 'ready' && !state.claimed.includes(`${keys[period]}:${m.id}`));
  const readyPoints = ready.reduce((sum, mission) => sum + mission.points, 0);
  return <View style={s.page}>
    <View style={s.tabBar}>{([['daily', '일간'], ['weekly', '주간'], ['monthly', '월간']] as const).map(([key, label]) => <View key={key} style={s.tab}><Button fullWidth size="compact" accessibilityLabel={`${label} 미션 보기`} onPress={() => setPeriod(key)} variant={key === period ? 'primary' : 'secondary'}>{label}</Button></View>)}</View>
    <View style={s.card}>
      <View style={s.between}><Text style={s.eyebrow}>{period === 'daily' ? '오늘 모은 포인트' : period === 'weekly' ? '이번 주 모은 포인트' : '이번 달 모은 포인트'}</Text><Text style={s.caption}>{earned} / {total}P</Text></View>
      <Text style={s.points}>{earned.toLocaleString()} P</Text>
      <View style={s.progressTrack} accessibilityRole="progressbar" accessibilityLabel="미션 포인트 수령 진행률" accessibilityValue={{min: 0, max: total, now: earned}}><View style={[s.progressFill, {width: `${earned / total * 100}%`}]} /></View>
      <Button fullWidth accessibilityLabel="완료한 미션 보상 모두 받기" disabled={ready.length === 0} onPress={() => ready.forEach(mission => dispatch({type:'claim', missionId:mission.id, periodKey:keys[period], status:'ready'}))}>{ready.length ? `보상 모두 받기 · ${readyPoints}P` : '지금 받을 보상이 없어요'}</Button>
    </View>
    <View style={s.card}>
      <View style={s.between}><Text style={s.name}>{period === 'daily' ? '오늘의 미션' : period === 'weekly' ? '이번 주 미션' : '이번 달 미션'}</Text><Text style={s.caption}>{keys[period]} 기준</Text></View>
      {missions.map(mission => {
        const status = getDemoMissionStatus(mission.id);
        const claimed = state.claimed.includes(`${keys[period]}:${mission.id}`);
        return <View key={mission.id} style={s.missionRow}>
          <View style={s.missionCopy}><Text style={s.name}>{claimed ? '✓ ' : ''}{mission.label}</Text><Text style={s.eyebrow}>+{mission.points}P</Text><Text style={s.caption}>{claimed ? '수령 완료' : status === 'settling' ? '기간 종료 후 집계해요' : status === 'ready' ? '완료했어요! 보상을 받아보세요' : '실천하고 포인트를 모아요'}</Text></View>
          <View style={s.missionAction}>{status === 'incomplete' && mission.destination ? <Button size="compact" fullWidth accessibilityLabel={`${mission.label} 하러 가기`} variant="secondary" onPress={() => onActivity(mission.destination!)}>하러 가기</Button> : <Button size="compact" fullWidth accessibilityLabel={`${mission.label} ${claimed ? '수령 완료' : '보상 받기'}`} disabled={claimed || status !== 'ready'} variant={claimed || status !== 'ready' ? 'secondary' : 'primary'} onPress={() => dispatch({type: 'claim', missionId: mission.id, periodKey: keys[period], status})}>{claimed ? '완료' : status === 'settling' ? '집계 대기' : '받기'}</Button>}</View>
        </View>;
      })}
    </View>
    <Text style={s.caption}>일간 최대 100P · 주간 최대 200P · 월간 최대 500P{ '\n' }한국 시간 00시, 매주 월요일에 새로 시작해요. 현재 미션 상태는 체험용 예시예요.</Text>
  </View>;
}
