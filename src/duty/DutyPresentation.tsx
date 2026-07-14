import type {PropsWithChildren, ReactNode} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';

type DutyTone = 'default' | 'info' | 'success' | 'warning' | 'danger';
type DutyActionVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function DutyPageScaffold({
  backAccessibilityLabel,
  campusName,
  children,
  contextLabel,
  domainLabel,
  navigation,
  onBack,
  title,
}: PropsWithChildren<{
  backAccessibilityLabel: string;
  campusName: string;
  contextLabel: string;
  domainLabel: string;
  navigation?: ReactNode;
  onBack: () => void;
  title: string;
}>) {
  return (
    <KeyboardAvoidingView
      behavior="padding"
      enabled={Platform.OS === 'ios'}
      keyboardVerticalOffset={16}
      style={dutyStyles.frame}>
      <View style={dutyStyles.header}>
        <View style={dutyStyles.topRow}>
          <View style={dutyStyles.campusContext}>
            <View style={dutyStyles.campusChip}>
              <Text ellipsizeMode="tail" numberOfLines={1} style={dutyStyles.campusText}>
                {campusName}
              </Text>
            </View>
            <Text ellipsizeMode="tail" numberOfLines={1} style={dutyStyles.contextText}>
              {contextLabel}
            </Text>
          </View>
          <DutyActionButton
            accessibilityLabel={backAccessibilityLabel}
            compact
            label="뒤로"
            onPress={onBack}
            variant="ghost"
          />
        </View>
        <View style={dutyStyles.headerText}>
          <Text style={dutyStyles.kicker}>{`${domainLabel} 담당자`}</Text>
          <Text style={dutyStyles.screenTitle}>{title}</Text>
        </View>
      </View>
      <View style={dutyStyles.content}>
        {navigation}
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

export function DutyPageSection({children}: PropsWithChildren) {
  return <View style={dutyStyles.pageSection}>{children}</View>;
}

export function DutyFormSection({children}: PropsWithChildren) {
  return <View style={dutyStyles.surface}>{children}</View>;
}

export function DutySectionHeader({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <View style={dutyStyles.sectionHeader}>
      <View style={dutyStyles.sectionHeaderText}>
        <Text style={dutyStyles.eyebrow}>{eyebrow}</Text>
        <Text style={dutyStyles.sectionTitle}>{title}</Text>
        {description ? <Text style={dutyStyles.body}>{description}</Text> : null}
      </View>
      {action ? <View style={dutyStyles.sectionAction}>{action}</View> : null}
    </View>
  );
}

export function DutyEntityCard({
  children,
  statusLabel,
  statusTone = 'default',
  subtitle,
  subtitleSelectable,
  title,
}: PropsWithChildren<{
  statusLabel?: string;
  statusTone?: DutyTone;
  subtitle?: string;
  subtitleSelectable?: boolean;
  title: string;
}>) {
  return (
    <View style={dutyStyles.surface}>
      <View style={dutyStyles.entityHeader}>
        <View style={dutyStyles.entityText}>
          <Text style={dutyStyles.entityTitle}>{title}</Text>
          {subtitle ? (
            <Text selectable={subtitleSelectable} style={dutyStyles.meta}>{subtitle}</Text>
          ) : null}
        </View>
        {statusLabel ? (
          <Text style={[dutyStyles.statusChip, dutyStyles[`${statusTone}Chip`]]}>
            {statusLabel}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function DutyMetricSurface({
  children,
  label,
  value,
}: PropsWithChildren<{label: string; value: string}>) {
  return (
    <View style={dutyStyles.surface}>
      <Text style={dutyStyles.eyebrow}>{label}</Text>
      <Text style={dutyStyles.metricValue}>{value}</Text>
      {children}
    </View>
  );
}

export function DutyActionRow({children}: PropsWithChildren) {
  return <View style={dutyStyles.actionRow}>{children}</View>;
}

export function DutyActionButton({
  accessibilityLabel,
  busy = false,
  compact = false,
  disabled = false,
  label,
  onPress,
  selected = false,
  variant = 'secondary',
}: {
  accessibilityLabel: string;
  busy?: boolean;
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected?: boolean;
  variant?: DutyActionVariant;
}) {
  const unavailable = disabled || busy;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{busy, disabled: unavailable, selected}}
      disabled={unavailable}
      onPress={onPress}
      style={({pressed}) => [
        dutyStyles.actionButton,
        compact ? dutyStyles.compactActionButton : dutyStyles.wideActionButton,
        dutyStyles[`${variant}ActionButton`],
        selected ? dutyStyles.selectedActionButton : null,
        unavailable ? dutyStyles.disabled : null,
        pressed ? dutyStyles.pressed : null,
      ]}>
      <Text style={[dutyStyles.actionButtonText, dutyStyles[`${variant}ActionText`]]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function DutyAsyncState({
  actionAccessibilityLabel,
  actionLabel,
  message,
  onAction,
  status,
  title,
}: {
  actionAccessibilityLabel?: string;
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  status: 'loading' | 'empty' | 'error';
  title?: string;
}) {
  if (status === 'loading') {
    return (
      <View accessibilityLabel={message} accessibilityRole="progressbar" style={dutyStyles.asyncSurface}>
        <ActivityIndicator color={colors.primary} />
        <Text style={dutyStyles.body}>{message}</Text>
      </View>
    );
  }
  return (
    <View style={dutyStyles.asyncSurface}>
      <Text style={dutyStyles.sectionTitle}>{title ?? (status === 'error' ? '다시 확인해 주세요' : '아직 항목이 없습니다')}</Text>
      <Text style={dutyStyles.body}>{message}</Text>
      {actionLabel && onAction ? (
        <DutyActionButton
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          label={actionLabel}
          onPress={onAction}
          variant={status === 'error' ? 'primary' : 'secondary'}
        />
      ) : null}
    </View>
  );
}

export function DutyConfirmSheet({
  busy = false,
  cancelAccessibilityLabel,
  cancelLabel = '취소',
  children,
  confirmAccessibilityLabel,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
  visible,
}: PropsWithChildren<{
  busy?: boolean;
  cancelAccessibilityLabel?: string;
  cancelLabel?: string;
  confirmAccessibilityLabel: string;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
}>) {
  return (
    <Modal animationType="slide" onRequestClose={onCancel} transparent visible={visible}>
      <View style={dutyStyles.sheetBackdrop}>
        <View style={dutyStyles.sheet}>
          <DutySectionHeader description={message} eyebrow="확인" title={title} />
          {children}
          <DutyActionRow>
            <DutyActionButton
              accessibilityLabel={cancelAccessibilityLabel ?? `${title} ${cancelLabel}`}
              disabled={busy}
              label={cancelLabel}
              onPress={onCancel}
              variant="secondary"
            />
            <DutyActionButton
              accessibilityLabel={confirmAccessibilityLabel}
              busy={busy}
              label={busy ? '처리 중...' : confirmLabel}
              onPress={onConfirm}
              variant="danger"
            />
          </DutyActionRow>
        </View>
      </View>
    </Modal>
  );
}

export const dutyStyles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: radius.control,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  actionButtonText: {fontSize: 14, fontWeight: '800', lineHeight: 20, textAlign: 'center'},
  actionRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap},
  asyncSurface: {
    alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.card,
    gap: spacing.gap, padding: spacing.card,
  },
  body: {...typography.body, color: colors.textSecondary, flexShrink: 1},
  campusChip: {
    backgroundColor: colors.borderSoft, borderRadius: radius.pill, maxWidth: 180,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  campusContext: {alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minWidth: 0},
  campusText: {color: colors.textSecondary, fontSize: 13, fontWeight: '700', lineHeight: 18},
  compactActionButton: {flexShrink: 0},
  content: {gap: spacing.card, paddingBottom: 130},
  contextText: {color: colors.textSecondary, flexShrink: 1, fontSize: 13, fontWeight: '600'},
  dangerActionButton: {backgroundColor: colors.danger},
  dangerActionText: {color: colors.surface},
  dangerChip: {backgroundColor: colors.dangerSoft, color: colors.danger},
  defaultChip: {backgroundColor: colors.neutralSoft, color: colors.textSecondary},
  disabled: {opacity: 0.48},
  entityHeader: {
    alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap,
    justifyContent: 'space-between',
  },
  entityText: {flex: 1, gap: 4, minWidth: 0},
  entityTitle: {...typography.cardTitle, color: colors.textPrimary, flexShrink: 1},
  eyebrow: {...typography.label, color: colors.primary},
  frame: {backgroundColor: colors.background, flex: 1},
  ghostActionButton: {backgroundColor: colors.borderSoft},
  ghostActionText: {color: colors.primary},
  header: {gap: spacing.gap, marginBottom: spacing.gap},
  headerText: {gap: 6},
  infoChip: {backgroundColor: colors.primarySoft, color: colors.primary},
  kicker: {...typography.label, color: colors.primary},
  meta: {...typography.caption, color: colors.textMuted, flexShrink: 1},
  metricValue: {...typography.screenTitle, color: colors.textPrimary},
  pageSection: {gap: spacing.gap},
  pressed: {opacity: 0.75},
  primaryActionButton: {backgroundColor: colors.primary},
  primaryActionText: {color: colors.surface},
  screenTitle: {...typography.screenTitle, color: colors.textPrimary},
  secondaryActionButton: {backgroundColor: colors.borderSoft},
  secondaryActionText: {color: colors.textSecondary},
  sectionAction: {alignItems: 'flex-end', flexShrink: 0},
  sectionHeader: {
    alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap,
    justifyContent: 'space-between',
  },
  sectionHeaderText: {flex: 1, gap: 4, minWidth: 0},
  sectionTitle: {...typography.cardTitle, color: colors.textPrimary, flexShrink: 1},
  selectedActionButton: {borderColor: colors.primary, borderWidth: 2},
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    gap: spacing.card, maxHeight: '90%', padding: spacing.card,
  },
  sheetBackdrop: {backgroundColor: 'rgba(25, 31, 40, 0.32)', flex: 1, justifyContent: 'flex-end'},
  statusChip: {
    alignSelf: 'flex-start', borderRadius: radius.pill, fontSize: 13, fontWeight: '800',
    lineHeight: 18, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7,
  },
  successChip: {backgroundColor: colors.successSoft, color: colors.success},
  surface: {
    backgroundColor: colors.surface, borderRadius: radius.card, elevation: 2, gap: spacing.gap,
    padding: spacing.card, shadowColor: colors.shadow, shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.03, shadowRadius: 14,
  },
  topRow: {
    alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 48,
  },
  warningChip: {backgroundColor: colors.warningSoft, color: colors.warning},
  wideActionButton: {flexGrow: 1},
});
