import {useEffect, useState} from 'react';
import {BackHandler, Text, View} from 'react-native';
import {Button} from '../components/ui';
import {CompanionDrawPage} from './CompanionDrawPage';
import {CompanionManagePage} from './CompanionManagePage';
import {CompanionMissionsPage} from './CompanionMissionsPage';
import {type CompanionPage} from './companionModel';
import {useCompanions} from './CompanionProvider';
import {companionStyles as s} from './companionStyles';

export function CompanionPages({initialPage, onBack, onActivity, onScrollTop = () => {}}: {
  onScrollTop?: () => void;
  initialPage: CompanionPage; onBack: () => void;
  onActivity: (route: 'calendar' | 'devotion' | 'polls', recordDate?: string) => void;
}) {
  const [page, setPage] = useState(initialPage);
  const {state,server,busy,error,refresh} = useCompanions();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {onBack(); return true;});
    return () => sub.remove();
  }, [onBack]);
  return <View style={s.page}>
    {server && (busy || error) ? <View style={s.notice}><Text accessibilityLiveRegion="polite" style={s.caption}>{busy?'서버 정보 확인 중…':error}</Text>{error&&!busy?<Button accessibilityLabel="동물 서버 정보 새로 확인" onPress={()=>void refresh()} variant="secondary">새로 확인</Button>:null}</View>:null}
    <View style={s.between}><Button accessibilityLabel="친구 페이지에서 홈으로 돌아가기" size="compact" variant="ghost" onPress={onBack}>‹ 홈으로</Button><View style={s.wallet}><Text accessibilityLiveRegion="polite" style={s.eyebrow}>{state.points.toLocaleString()} P</Text></View></View>
    <View style={s.stack}><Text style={s.title}>{page === 'manage' ? '나의 작은 정원' : page === 'missions' ? '매일 쌓이는 작은 실천' : '새로운 친구 만나기'}</Text><Text style={s.caption}>{page === 'manage' ? '함께할 친구와 정원의 풍경을 골라보세요.' : page === 'missions' ? '미션을 완료하고 뽑기에 쓸 포인트를 모아요.' : '어떤 친구가 기다리고 있을까요?'}</Text></View>
    <View style={s.tabBar}>{([['manage', '동물 관리'], ['missions', '미션'], ['draw', '뽑기']] as const).map(([key, title]) => <View key={key} style={s.tab}><Button fullWidth accessibilityLabel={`${title} 화면 이동`} size="compact" variant={key === page ? 'primary' : 'secondary'} onPress={() => {setPage(key); onScrollTop();}}>{title}</Button></View>)}</View>
    {page === 'manage' ? <CompanionManagePage onRevealDetails={onScrollTop} /> : page === 'missions' ? <CompanionMissionsPage onActivity={onActivity} /> : <CompanionDrawPage onManage={() => {setPage('manage'); onScrollTop();}} onMissions={() => {setPage('missions'); onScrollTop();}} />}
    <Text style={s.caption}>{server ? '포인트와 친구·정원은 계정에 저장돼요.' : '체험 모드 · 포인트와 보유 목록은 현재 로그인 세션에서만 유지돼요.'}</Text>
  </View>;
}
