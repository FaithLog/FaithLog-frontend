import {useEffect, useRef, useState} from 'react';
import {Text} from 'react-native';
import type {ShepherdAttendanceApi} from './shepherdAttendanceApi';
import {ShepherdAttendanceHomeCard} from './ShepherdAttendanceHomeCard';
import type {ShepherdAttendanceHome} from './shepherdAttendanceTypes';

export function HomeShepherdAttendanceSection({api, campusId, getAccessToken, onOpen}: {api: ShepherdAttendanceApi; campusId: number; getAccessToken: () => Promise<string>; onOpen: (data: ShepherdAttendanceHome) => void}) {
  const [data, setData] = useState<ShepherdAttendanceHome | null>(null);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const tokenProvider = useRef(getAccessToken);
  tokenProvider.current = getAccessToken;
  useEffect(() => { const current = ++sequence.current; setData(null); setFailed(false); void (async () => { try { const next = await api.getHome(await tokenProvider.current(), campusId); if (current === sequence.current) setData(next); } catch { if (current === sequence.current) setFailed(true); } })(); return () => { sequence.current += 1; }; }, [api, campusId]);
  if (failed) return <Text accessibilityLabel="목홀타 홈 카드 오류" style={{display: 'none'}} />;
  return data ? <ShepherdAttendanceHomeCard data={data} onPress={() => onOpen(data)} /> : null;
}
