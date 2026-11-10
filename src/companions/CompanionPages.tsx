import {useEffect, useState} from 'react';
import {BackHandler, Text, View} from 'react-native';
import {Button, Chip} from '../components/ui';
import {CompanionDrawPage} from './CompanionDrawPage';
import {CompanionManagePage} from './CompanionManagePage';
import {CompanionMissionsPage} from './CompanionMissionsPage';
import {type CompanionPage} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

export function CompanionPages({initialPage, onBack, onActivity, onScrollTop = () => {}}: {
  onScrollTop?: () => void;
  initialPage: CompanionPage; onBack: () => void;
  onActivity: (route: 'devotion' | 'polls') => void;
}) {
  const [page, setPage] = useState(initialPage);
  const {state} = useCompanions();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {onBack(); return true;});
    return () => sub.remove();
  }, [onBack]);
  return <View style={s.page}>
    <View style={s.between}><Button accessibilityLabel="친구 페이지에서 홈으로 돌아가기" variant="ghost" onPress={onBack}>홈으로</Button><Chip label="체험 모드" tone="info" /></View>
    <View style={s.between}><Text style={s.title}>{page === 'manage' ? '동물 관리' : page === 'missions' ? '미션' : '친구 뽑기'}</Text><Text style={s.name}>{state.points.toLocaleString()} P</Text></View>
    <View style={s.tabs}>{([['manage', '동물 관리'], ['missions', '미션'], ['draw', '뽑기']] as const).map(([key, title]) => <Button key={key} accessibilityLabel={`${title} 화면 이동`} size="compact" variant={key === page ? 'primary' : 'secondary'} onPress={() => {setPage(key); onScrollTop();}}>{title}</Button>)}</View>
    {page === 'manage' ? <CompanionManagePage onRevealDetails={onScrollTop} /> : page === 'missions' ? <CompanionMissionsPage onActivity={onActivity} /> : <CompanionDrawPage onManage={() => {setPage('manage'); onScrollTop();}} onMissions={() => {setPage('missions'); onScrollTop();}} />}
  </View>;
}
