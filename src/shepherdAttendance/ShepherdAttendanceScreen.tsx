import {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {FaithLogApiError} from '../api/apiError';
import {Button, Loading, ScreenHeader} from '../components/ui';
import {colors, radius, spacing} from '../theme';
import type {ShepherdAttendanceApi} from './shepherdAttendanceApi';
import {validateAttendanceInput} from './shepherdAttendanceDomain';
import {getRecentShepherdGroup, setRecentShepherdGroup} from './recentShepherdGroup';
import type {AttendanceInput, ShepherdAttendanceHome, ShepherdAttendanceStatus} from './shepherdAttendanceTypes';

type Props = {api: ShepherdAttendanceApi; campusId: number; getAccessToken: () => Promise<string>; initialData?: ShepherdAttendanceHome; onBack: () => void; onChanged?: (data: ShepherdAttendanceHome) => void};
const emptyInput: AttendanceInput = {smallGroupMeetingCount: '', holyWaveCount: '', otherWorshipCount: '', note: ''};

export function ShepherdAttendanceScreen({api, campusId, getAccessToken, initialData, onBack, onChanged}: Props) {
  const [data, setData] = useState<ShepherdAttendanceHome | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [input, setInput] = useState<AttendanceInput>(emptyInput);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const mounted = useRef(true);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const next = await api.getHome(await getAccessToken(), campusId);
      if (!mounted.current) return;
      setData(next); onChanged?.(next);
    } catch { if (mounted.current) setError('목홀타 내용을 불러오지 못했습니다.'); }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => { mounted.current = true; if (!initialData) void load(); return () => { mounted.current = false; }; }, [campusId]);
  useEffect(() => {
    if (!data?.groups.length) return;
    const recent = getRecentShepherdGroup(campusId);
    const group = data.groups.find((item) => item.groupId === recent) ?? data.groups[0]!;
    setSelectedGroupId(group.groupId); setInput(fromReport(group.report));
  }, [campusId, data]);
  const selected = data?.groups.find((group) => group.groupId === selectedGroupId) ?? null;
  const selectGroup = (groupId: number) => { const group = data?.groups.find((item) => item.groupId === groupId); if (!group) return; setSelectedGroupId(groupId); setRecentShepherdGroup(campusId, groupId); setInput(fromReport(group.report)); setError(null); };
  const save = async (status: ShepherdAttendanceStatus) => {
    if (savingRef.current || !selected || !data) return;
    const validated = validateAttendanceInput(input); if (!validated.ok) { setError(validated.message); return; }
    savingRef.current = true; setSaving(true); setError(null);
    try {
      const report = await api.saveMyReport(await getAccessToken(), campusId, selected.groupId, data.serviceDate, {...validated.value, status, version: selected.report?.version ?? 0});
      const groups = data.groups.map((group) => group.groupId === selected.groupId ? {...group, report} : group);
      const next = {...data, groups, submittedGroupCount: groups.filter((group) => group.report?.status === 'SUBMITTED').length};
      setData(next); onChanged?.(next); setInput(fromReport(report));
      if (status === 'SUBMITTED') { const nextGroup = groups.find((group) => group.report?.status !== 'SUBMITTED'); if (nextGroup) selectGroup(nextGroup.groupId); }
    } catch (reason) {
      if (reason instanceof FaithLogApiError && reason.detail.status === 409) { await load(); if (mounted.current) setError('다른 사용자가 먼저 수정했습니다. 최신 내용을 불러왔습니다.'); }
      else setError('저장하지 못했습니다. 입력한 내용을 유지했습니다.');
    } finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  };
  const create = async () => { if (creating || !createName.trim()) return; setCreating(true); setError(null); try { await api.createGroup(await getAccessToken(), campusId, {name: createName.trim()}); setCreateName(''); await load(); } catch (reason) { setError(reason instanceof FaithLogApiError && reason.detail.status === 409 ? '이미 사용 중인 목장 이름입니다.' : '목장을 만들지 못했습니다.'); } finally { if (mounted.current) setCreating(false); } };
  if (loading && !data) return <Loading message="목홀타 입력란을 불러오고 있어요." />;
  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled"><ScreenHeader eyebrow="주간 보고" title="목홀타 입력" subtitle={data ? `${data.serviceDate} 주일` : '담당 목장의 인원을 입력해 주세요.'} action={<Pressable accessibilityLabel="목홀타 입력 닫기" onPress={onBack}><Text style={styles.back}>닫기</Text></Pressable>} />
    {data && data.groups.length > 1 ? <View accessibilityRole="tablist" style={styles.tabs}>{data.groups.map((group) => <Pressable accessibilityLabel={`${group.groupName} 선택`} accessibilityRole="tab" key={group.groupId} onPress={() => selectGroup(group.groupId)} style={[styles.tab, group.groupId === selectedGroupId ? styles.tabSelected : null]}><Text style={[styles.tabText, group.groupId === selectedGroupId ? styles.tabTextSelected : null]}>{group.groupName}</Text></Pressable>)}</View> : null}
    {selected ? <View style={styles.form}><Text style={styles.groupTitle}>{selected.groupName}</Text><Text style={styles.status}>{selected.report?.status === 'SUBMITTED' ? '제출 완료' : selected.report ? '임시 저장' : '미입력'}</Text>
      <CountField label="목장모임 참여 인원" value={input.smallGroupMeetingCount} onChange={(value) => setInput((current) => ({...current, smallGroupMeetingCount: value}))} />
      <CountField label="홀리웨이브 참여 인원" value={input.holyWaveCount} onChange={(value) => setInput((current) => ({...current, holyWaveCount: value}))} />
      <CountField label="타예배 참여 인원" value={input.otherWorshipCount} onChange={(value) => setInput((current) => ({...current, otherWorshipCount: value}))} />
      <Text style={styles.label}>메모 (선택)</Text><TextInput accessibilityLabel="목홀타 메모" multiline onChangeText={(note) => setInput((current) => ({...current, note}))} placeholder="특이사항이 있으면 입력해 주세요" style={[styles.input, styles.note]} value={input.note} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<View style={styles.actions}><Button accessibilityLabel="목홀타 임시 저장" disabled={saving} onPress={() => void save('DRAFT')} variant="secondary">{saving ? '저장 중' : '임시 저장'}</Button><Button accessibilityLabel="목홀타 제출 완료" disabled={saving} onPress={() => void save('SUBMITTED')}>{saving ? '제출 중' : '제출 완료'}</Button></View>
    </View> : <Text style={styles.empty}>현재 담당하는 목장이 없습니다.</Text>}
    <View style={styles.create}><Text style={styles.groupTitle}>새 목장 만들기</Text><TextInput accessibilityLabel="새 목장 이름" onChangeText={setCreateName} placeholder="목장 이름" style={styles.input} value={createName} /><Button accessibilityLabel="목장 생성" disabled={creating || !createName.trim()} onPress={() => void create()} variant="secondary">목장 생성</Button></View>
  </ScrollView>;
}

function CountField({label, onChange, value}: {label: string; onChange: (value: string) => void; value: string}) { const number = /^\d+$/.test(value) ? Number(value) : 0; return <View><Text style={styles.label}>{label}</Text><View style={styles.countRow}><Pressable accessibilityLabel={`${label} 1 줄이기`} onPress={() => onChange(String(Math.max(0, number - 1)))} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable><TextInput accessibilityLabel={label} keyboardType="number-pad" maxLength={7} onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))} style={[styles.input, styles.countInput]} value={value} /><Pressable accessibilityLabel={`${label} 1 늘리기`} onPress={() => onChange(String(number + 1))} style={styles.step}><Text style={styles.stepText}>+</Text></Pressable></View></View>; }
function fromReport(report: ShepherdAttendanceHome['groups'][number]['report']): AttendanceInput { return report ? {smallGroupMeetingCount: String(report.smallGroupMeetingCount), holyWaveCount: String(report.holyWaveCount), otherWorshipCount: String(report.otherWorshipCount), note: report.note ?? ''} : emptyInput; }
const styles = StyleSheet.create({screen: {backgroundColor: colors.background, gap: spacing.gap, padding: spacing.card, paddingBottom: 60}, back: {color: colors.primary, fontWeight: '800'}, tabs: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, tab: {backgroundColor: colors.neutralSoft, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9}, tabSelected: {backgroundColor: colors.primary}, tabText: {color: colors.mutedText, fontWeight: '700'}, tabTextSelected: {color: '#fff'}, form: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: 10, padding: spacing.card}, groupTitle: {color: colors.text, fontSize: 19, fontWeight: '900'}, status: {alignSelf: 'flex-start', color: colors.primary, fontSize: 13, fontWeight: '800'}, label: {color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4}, input: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 48, paddingHorizontal: 14}, note: {minHeight: 92, paddingTop: 12, textAlignVertical: 'top'}, countRow: {alignItems: 'center', flexDirection: 'row', gap: 8}, countInput: {flex: 1, textAlign: 'center'}, step: {alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 12, height: 46, justifyContent: 'center', width: 46}, stepText: {color: colors.primary, fontSize: 24, fontWeight: '800'}, actions: {gap: 8}, error: {color: colors.danger, fontSize: 13}, empty: {color: colors.mutedText, paddingVertical: 30, textAlign: 'center'}, create: {backgroundColor: colors.surface, borderRadius: radius.card, gap: 10, padding: spacing.card}});
