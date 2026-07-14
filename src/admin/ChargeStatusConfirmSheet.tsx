import {useEffect, useRef} from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {getAdminChargeContractCapabilities} from '../api/client';
import type {AdminChargeStatusTarget, ApiError, ChargeItem, ChargeStatus} from '../api/types';
import {Body, Button, ListRow, Title} from '../components/ui';
import {colors, spacing} from '../theme';
import {formatWon} from '../utils/money';
import {
  getAdminChargeStatusConfirmation,
  getAdminChargeStatusErrorMessage,
} from './adminChargeStatus';

export type ChargeStatusConfirmTarget = {
  charge: ChargeItem;
  status: AdminChargeStatusTarget;
} | null;

type ChargeStatusConfirmSheetProps = {
  error: ApiError | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  target: ChargeStatusConfirmTarget;
};

export function ChargeStatusConfirmSheet({
  error,
  loading,
  onCancel,
  onConfirm,
  target,
}: ChargeStatusConfirmSheetProps) {
  const titleRef = useRef<View>(null);
  const visible = target !== null;
  const confirmation = target
    ? getAdminChargeStatusConfirmation(
        target.charge,
        target.status,
        getAdminChargeContractCapabilities(),
      )
    : null;

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => {
      const tag = findNodeHandle(titleRef.current);
      if (tag !== null) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 0);
    return () => clearTimeout(timeout);
  }, [visible]);

  return (
    <Modal
      accessibilityViewIsModal
      animationType="slide"
      onAccessibilityEscape={loading ? undefined : onCancel}
      onRequestClose={loading ? undefined : onCancel}
      transparent
      visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scroll}>
            <View accessible accessibilityRole="header" ref={titleRef}>
              <Title>{confirmation?.title ?? '청구 상태 변경'}</Title>
            </View>
            {confirmation?.messages.map((message) => <Body key={message}>{message}</Body>)}
            {target ? (
              <>
                <ListRow label="현재 상태" value={getChargeStatusLabel(target.charge.status)} />
                <ListRow label="변경 상태" value={getChargeStatusLabel(target.status)} />
                <ListRow label="금액" value={formatWon(target.charge.amount)} />
              </>
            ) : null}
            {error ? (
              <View accessibilityRole="alert" style={styles.error}>
                <Text style={styles.errorText}>{getAdminChargeStatusErrorMessage(error)}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button accessibilityLabel="청구 상태 변경 실행" disabled={loading} onPress={onConfirm} variant={target?.status === 'CANCELED' ? 'danger' : 'primary'}>
              {loading ? '변경 중...' : '변경'}
            </Button>
            <Button accessibilityLabel="청구 상태 변경 취소" disabled={loading} onPress={onCancel} variant="secondary">취소</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getChargeStatusLabel(status: ChargeStatus) {
  if (status === 'UNPAID') return '미납';
  if (status === 'PAID') return '납부';
  if (status === 'WAIVED') return '면제';
  return '취소';
}

const styles = StyleSheet.create({
  actions: {flexShrink: 0, gap: spacing.gap, paddingTop: spacing.gap},
  backdrop: {alignItems: 'stretch', backgroundColor: colors.textMuted, flex: 1, justifyContent: 'flex-end'},
  error: {backgroundColor: colors.dangerSoft, borderRadius: 14, padding: 14},
  errorText: {color: colors.danger, fontSize: 14, lineHeight: 20},
  scroll: {flexShrink: 1},
  scrollContent: {gap: spacing.gap},
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    padding: spacing.card,
  },
});
