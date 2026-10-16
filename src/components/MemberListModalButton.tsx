import {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {Body, Button, Loading} from './ui';
import {AppModal} from './AppModal';
import {colors, radius, spacing} from '../theme';

export type MemberListEntry = {userId: number; name: string; email: string; reason?: string};

export function MemberListModalButton({label, title, loadMembers, emptyMessage, inline = false}: {
  inline?: boolean;
  emptyMessage?: string;
  label: string;
  title: string;
  loadMembers: () => Promise<MemberListEntry[]>;
}) {
  const [visible, setVisible] = useState(false);
  const [members, setMembers] = useState<MemberListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => () => {request.current += 1;}, []);
  const close = () => {request.current += 1; setVisible(false);};
  const load = async () => {
    const id = ++request.current;
    setVisible(true);
    setLoading(true);
    setError(null);
    setMembers([]);
    try {
      const next = await loadMembers();
      if (request.current === id) setMembers(next);
    } catch {
      if (request.current === id) setError('명단을 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (request.current === id) setLoading(false);
    }
  };
  const content = (
    <View style={inline ? styles.inline : styles.card} accessibilityViewIsModal={!inline}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.title}>{title}</Text>
          {!loading && !error ? <Text style={styles.count}>{members.length}명</Text> : null}
        </View>
        <Button accessibilityLabel={`${title} 닫기`} variant="secondary" onPress={close}>닫기</Button>
      </View>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? <Loading message="명단을 불러오고 있어요." /> : error ? <>
          <Body>{error}</Body>
          <Button accessibilityLabel={`${title} 다시 조회`} onPress={() => void load()}>다시 시도</Button>
        </> : members.length === 0 ? <Body>{emptyMessage ?? '현재 조회된 대상이 없습니다.'}</Body> : members.map((member, index) => (
          <View key={member.userId} style={[styles.member, index > 0 ? styles.separator : null]}>
            <View style={styles.avatar}><Text style={styles.initial}>{member.name.trim().slice(0, 1)}</Text></View>
            <View style={styles.memberInfo}>
              <Text style={styles.name}>{member.name}</Text>
              <Text style={styles.email}>{member.email}</Text>
              {member.reason ? <Text style={styles.reason}>{member.reason}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
  return <>
    <Button accessibilityLabel={`${title} 열기`} variant="secondary" onPress={() => void load()}>{label}</Button>
    {inline ? (visible ? content : null) : (
      <AppModal animationType="fade" transparent visible={visible} onRequestClose={close}>
        <View style={styles.backdrop}>
          <Pressable style={styles.dismissBackdrop} accessibilityLabel={`${title} 배경 눌러 닫기`} onPress={close} />
          {content}
        </View>
      </AppModal>
    )}
  </>;
}

const styles = StyleSheet.create({
  dismissBackdrop: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0},
  backdrop: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(25,31,40,0.32)'},
  card: {width: '100%', maxWidth: 420, maxHeight: '72%', backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.card, gap: 12, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: {width: 0, height: 12}, elevation: 12},
  inline: {maxHeight: 300, gap: spacing.gap},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 8},
  heading: {flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
  title: {fontSize: 18, fontWeight: '700', color: colors.textPrimary},
  count: {fontSize: 13, fontWeight: '600', color: colors.primary, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill},
  list: {flexShrink: 1},
  member: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12},
  separator: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft},
  avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center'},
  initial: {fontSize: 15, fontWeight: '600', color: colors.primary},
  memberInfo: {flex: 1, gap: 4},
  name: {fontSize: 15, fontWeight: '600', color: colors.textPrimary},
  email: {fontSize: 12, lineHeight: 18, color: colors.textMuted},
  reason: {fontSize: 12, lineHeight: 18, color: colors.textSecondary},
});
