import type {PropsWithChildren, ReactNode} from 'react';
import {
  ActivityIndicator,
  type KeyboardTypeOptions,
  Modal,
  Pressable,
  type ReturnKeyTypeOptions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputSubmitEditingEventData,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';
import {IconexIcon, type IconexIconName} from './IconexIcon';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Tone = 'default' | 'info' | 'success' | 'warning' | 'danger';

type ButtonProps = PropsWithChildren<{
  accessibilityLabel: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  onPress: () => void;
}>;

type StateProps = {
  actionLabel?: string;
  actionAccessibilityLabel?: string;
  message: string;
  onActionPress?: () => void;
  onSecondaryActionPress?: () => void;
  secondaryActionAccessibilityLabel?: string;
  secondaryActionLabel?: string;
  title: string;
};

type DangerConfirmSheetProps = PropsWithChildren<{
  accessibilityLabel?: string;
  cancelAccessibilityLabel?: string;
  cancelLabel?: string;
  confirmAccessibilityLabel?: string;
  confirmLabel: string;
  dangerSummary?: string;
  failureMessage?: string | null;
  loading?: boolean;
  loadingLabel?: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
  warningLabel?: string;
}>;

export function Screen({
  children,
  variant = 'default',
}: PropsWithChildren<{variant?: 'default' | 'appShell'}>) {
  return <View style={[styles.screen, variant === 'appShell' ? styles.appShellScreen : null]}>{children}</View>;
}

export function ScreenHeader({
  action,
  eyebrow,
  subtitle,
  title,
}: {
  action?: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderText}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

export function FaithLogHeaderTopRow({
  campusLabel,
  children,
  contextLabel,
}: PropsWithChildren<{
  campusLabel: string;
  contextLabel?: string;
}>) {
  return (
    <View style={styles.faithLogHeaderTopRow}>
      <View style={styles.faithLogHeaderLeft}>
        <View style={styles.faithLogHeaderCampusChip}>
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.faithLogHeaderCampusText}>
            {campusLabel}
          </Text>
        </View>
        {contextLabel ? (
          <Text ellipsizeMode="tail" numberOfLines={1} style={styles.faithLogHeaderContextText}>
            {contextLabel}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.faithLogHeaderActions}>{children}</View> : null}
    </View>
  );
}

export function FaithLogHeaderIconButton({
  accessibilityLabel,
  badge = false,
  iconName,
  onPress,
}: {
  accessibilityLabel: string;
  badge?: boolean;
  iconName: IconexIconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.faithLogHeaderIconButton,
        pressed ? styles.pressed : null,
      ]}>
      <IconexIcon color={colors.textPrimary} name={iconName} size={20} strokeWidth={1.7} />
      {badge ? <View style={styles.faithLogHeaderIconBadge} /> : null}
    </Pressable>
  );
}

export function FaithLogHeaderPillButton({
  accessibilityLabel,
  label,
  onPress,
  showChevron = false,
}: {
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.faithLogHeaderPillButton,
        pressed ? styles.pressed : null,
      ]}>
      <Text ellipsizeMode="tail" numberOfLines={1} style={styles.faithLogHeaderPillText}>
        {label}
      </Text>
      {showChevron ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.faithLogHeaderPillChevron}>
          ▾
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Card({children}: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function Eyebrow({children}: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({children}: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({children}: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Pill({children}: PropsWithChildren) {
  return <Chip label={String(children)} tone="info" />;
}

export function Chip({label, tone = 'default'}: {label: string; tone?: Tone}) {
  return <Text style={[styles.chip, styles[`${tone}Chip`]]}>{label}</Text>;
}

export function Button({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  variant = 'primary',
}: ButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        styles[`${variant}Button`],
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[styles.buttonText, styles[`${variant}ButtonText`]]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function DangerConfirmSheet({
  accessibilityLabel,
  cancelAccessibilityLabel,
  cancelLabel = '취소',
  children,
  confirmAccessibilityLabel,
  confirmLabel,
  dangerSummary,
  failureMessage,
  loading = false,
  loadingLabel,
  message,
  onCancel,
  onConfirm,
  title,
  visible,
  warningLabel = '주의',
}: DangerConfirmSheetProps) {
  const confirmText = loading ? (loadingLabel ?? '처리 중...') : confirmLabel;

  return (
    <Modal
      animationType="slide"
      onRequestClose={loading ? undefined : onCancel}
      transparent
      visible={visible}>
      <View style={styles.dangerSheetBackdrop}>
        <Pressable
          accessibilityElementsHidden
          disabled={loading}
          importantForAccessibility="no-hide-descendants"
          onPress={onCancel}
          style={styles.dangerSheetScrim}
        />
        <View
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={styles.dangerSheet}>
          <View accessibilityElementsHidden importantForAccessibility="no" style={styles.sheetHandle} />
          <ScrollView
            contentContainerStyle={styles.dangerSheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Chip label={warningLabel} tone="danger" />
            <Text style={styles.dangerSheetTitle}>{title}</Text>
            <Text style={styles.dangerSheetMessage}>{message}</Text>
            {children ? <View style={styles.dangerSheetDetails}>{children}</View> : null}
            {dangerSummary ? (
              <View style={styles.dangerSummary}>
                <Text style={styles.dangerSummaryText}>{dangerSummary}</Text>
              </View>
            ) : null}
            {failureMessage ? (
              <View accessibilityRole="alert" style={styles.dangerFailure}>
                <Text style={styles.dangerFailureText}>{failureMessage}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.dangerSheetActions}>
            <Pressable
              accessibilityLabel={cancelAccessibilityLabel ?? cancelLabel}
              accessibilityRole="button"
              accessibilityState={{disabled: loading}}
              disabled={loading}
              onPress={onCancel}
              style={({pressed}) => [
                styles.dangerCancelButton,
                loading ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.dangerCancelButtonText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={confirmAccessibilityLabel ?? confirmLabel}
              accessibilityRole="button"
              accessibilityState={{busy: loading, disabled: loading}}
              disabled={loading}
              onPress={onConfirm}
              style={({pressed}) => [
                styles.dangerConfirmButton,
                loading ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              {loading ? <ActivityIndicator color={colors.surface} /> : null}
              <Text style={styles.dangerConfirmButtonText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: IconexIconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({pressed}) => [styles.iconButton, pressed ? styles.pressed : null]}>
      <IconexIcon name={icon} size={22} />
    </Pressable>
  );
}

export function TextField({
  accessibilityLabel,
  autoCapitalize = 'none',
  editable = true,
  error,
  helper,
  keyboardType = 'default',
  label,
  onChangeText,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  secureTextEntry = false,
  textContentType,
  value,
}: {
  accessibilityLabel?: string | undefined;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  error?: string | undefined;
  helper?: string | undefined;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onChangeText: (value: string) => void;
  onSubmitEditing?:
    | ((event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void)
    | undefined;
  placeholder?: string | undefined;
  returnKeyType?: ReturnKeyTypeOptions;
  secureTextEntry?: boolean;
  textContentType?: 'emailAddress' | 'name' | 'newPassword' | 'password' | 'none' | undefined;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{disabled: !editable}}
        autoCapitalize={autoCapitalize}
        editable={editable}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.subtleText}
        returnKeyType={returnKeyType}
        secureTextEntry={secureTextEntry}
        style={[
          styles.textField,
          error ? styles.textFieldError : null,
          !editable ? styles.disabled : null,
        ]}
        textContentType={textContentType}
        value={value}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {!error && helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

export function ListRow({
  accessibilityLabel,
  action,
  label,
  onPress,
  supportingText,
  value,
}: {
  accessibilityLabel?: string;
  action?: ReactNode;
  label: string;
  onPress?: () => void;
  supportingText?: string;
  value?: string;
}) {
  const content = (
    <>
      <View style={styles.listRowText}>
        <Text style={styles.listRowLabel}>{label}</Text>
        {supportingText ? <Text style={styles.listRowSupporting}>{supportingText}</Text> : null}
      </View>
      {value ? <Text style={styles.listRowValue}>{value}</Text> : null}
      {action}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        onPress={onPress}
        style={({pressed}) => [styles.listRow, pressed ? styles.pressed : null]}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.listRow}>{content}</View>;
}

export function BottomNav<T extends string>({
  activeId,
  items,
  onSelect,
}: {
  activeId: T;
  items: Array<{
    accessibilityLabel: string;
    icon?: string;
    id: T;
    label: string;
  }>;
  onSelect: (id: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.bottomNav}>
      {items.map((item) => {
        const active = item.id === activeId;

        return (
          <Pressable
            accessibilityLabel={item.accessibilityLabel}
            accessibilityRole="tab"
            accessibilityState={{selected: active}}
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={({pressed}) => [
              styles.bottomNavItem,
              active ? styles.bottomNavItemActive : null,
              pressed ? styles.pressed : null,
            ]}>
            {item.icon ? (
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no"
                numberOfLines={1}
                style={[styles.navIcon, active ? styles.navIconActive : null]}>
                {item.icon}
              </Text>
            ) : null}
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[styles.bottomNavLabel, active ? styles.bottomNavLabelActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Loading({message = '잠시만 기다려 주세요.'}: {message?: string}) {
  return (
    <Card>
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.primary} />
        <Body>{message}</Body>
      </View>
    </Card>
  );
}

export function LoadingState({message}: {message: string}) {
  return <Loading message={message} />;
}

export function Empty(props: StateProps) {
  return <StateCard {...props} tone="default" />;
}

export function ErrorState(props: StateProps) {
  return <StateCard {...props} tone="danger" />;
}

export {ErrorState as Error};

export function PermissionDenied(props: StateProps) {
  return <StateCard {...props} tone="warning" />;
}

export function Conflict(props: StateProps) {
  return <StateCard {...props} tone="warning" />;
}

export function Offline(props: StateProps) {
  return <StateCard {...props} tone="info" />;
}

function StateCard({
  actionAccessibilityLabel,
  actionLabel,
  message,
  onActionPress,
  onSecondaryActionPress,
  secondaryActionAccessibilityLabel,
  secondaryActionLabel,
  title,
  tone,
}: StateProps & {tone: Tone}) {
  return (
    <View style={styles.stateCard}>
      <View style={[styles.stateIcon, styles[`${tone}StateIcon`]]}>
        <IconexIcon
          color={getStateToneIconColor(tone)}
          name={getStateToneIcon(tone)}
          size={34}
          strokeWidth={2.2}
        />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {actionLabel && onActionPress ? (
        <Button
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          onPress={onActionPress}
          variant={tone === 'danger' ? 'danger' : 'primary'}>
          {actionLabel}
        </Button>
      ) : null}
      {secondaryActionLabel && onSecondaryActionPress ? (
        <Button
          accessibilityLabel={secondaryActionAccessibilityLabel ?? secondaryActionLabel}
          onPress={onSecondaryActionPress}
          variant="ghost">
          {secondaryActionLabel}
        </Button>
      ) : null}
    </View>
  );
}

function getStateToneIcon(tone: Tone): IconexIconName {
  switch (tone) {
    case 'danger':
      return 'danger';
    case 'info':
      return 'message-circle';
    case 'success':
      return 'check';
    case 'warning':
      return 'danger';
    case 'default':
      return 'document';
    default:
      return tone satisfies never;
  }
}

function getStateToneIconColor(tone: Tone) {
  switch (tone) {
    case 'danger':
      return colors.danger;
    case 'info':
      return colors.primary;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'default':
      return colors.textMuted;
    default:
      return tone satisfies never;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenX,
    paddingTop: 28,
    paddingBottom: spacing.bottomSafe,
  },
  appShellScreen: {
    paddingBottom: 0,
    paddingTop: 6,
  },
  faithLogHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  faithLogHeaderCampusChip: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 12,
    flexShrink: 1,
    height: 28,
    justifyContent: 'center',
    maxWidth: 158,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  faithLogHeaderCampusText: {
    color: colors.faith,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: 138,
  },
  faithLogHeaderContextText: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    maxWidth: 138,
    minWidth: 0,
  },
  faithLogHeaderIconBadge: {
    backgroundColor: colors.danger,
    borderColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1.5,
    height: 8,
    position: 'absolute',
    right: 8,
    top: 8,
    width: 8,
  },
  faithLogHeaderIconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
    shadowColor: colors.textPrimary,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.04,
    shadowRadius: 12,
    width: 36,
  },
  faithLogHeaderLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  faithLogHeaderPillButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 17,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    height: 34,
    justifyContent: 'center',
    maxWidth: 104,
    paddingHorizontal: 13,
  },
  faithLogHeaderPillChevron: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 1,
  },
  faithLogHeaderPillText: {
    color: colors.primary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  faithLogHeaderTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 36,
    width: '100%',
  },
  screenHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.gap,
  },
  screenHeaderText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  headerTitle: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.screenTitle,
  },
  headerSubtitle: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.body,
  },
  headerAction: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.card,
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.03,
    shadowRadius: 14,
    elevation: 2,
    gap: spacing.gap,
  },
  eyebrow: {
    color: colors.primary,
    flexWrap: 'wrap',
    ...typography.label,
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.screenTitle,
  },
  body: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.body,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    ...typography.label,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  defaultChip: {
    backgroundColor: colors.neutralSoft,
    color: colors.mutedText,
  },
  infoChip: {
    backgroundColor: colors.primarySoft,
    color: colors.primary,
  },
  successChip: {
    backgroundColor: colors.successSoft,
    color: colors.success,
  },
  warningChip: {
    backgroundColor: colors.warningSoft,
    color: colors.warning,
  },
  dangerChip: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 34,
    minWidth: 58,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  primaryButton: {
    backgroundColor: colors.borderSoft,
    borderColor: colors.borderSoft,
  },
  secondaryButton: {
    backgroundColor: colors.borderSoft,
    borderColor: colors.borderSoft,
  },
  dangerButton: {
    backgroundColor: colors.borderSoft,
    borderColor: colors.borderSoft,
  },
  ghostButton: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
  },
  buttonText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  primaryButtonText: {
    color: colors.primary,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
  },
  dangerButtonText: {
    color: colors.danger,
  },
  ghostButtonText: {
    color: colors.textSecondary,
  },
  dangerSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dangerSheetScrim: {
    backgroundColor: colors.textMuted,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dangerSheet: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: spacing.gap,
    maxHeight: '86%',
    maxWidth: 420,
    paddingBottom: spacing.bottomSafe,
    paddingHorizontal: 28,
    paddingTop: 16,
    width: '100%',
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 3,
    height: 5,
    marginBottom: 16,
    width: 82,
  },
  dangerSheetContent: {
    gap: spacing.gap,
    paddingBottom: 4,
  },
  dangerSheetTitle: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.screenTitle,
  },
  dangerSheetMessage: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.body,
  },
  dangerSheetDetails: {
    gap: 8,
  },
  dangerSummary: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  dangerSummaryText: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.label,
  },
  dangerFailure: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dangerFailureText: {
    color: colors.danger,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.label,
  },
  dangerSheetActions: {
    flexDirection: 'row',
    gap: spacing.gap,
  },
  dangerCancelButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerCancelButtonText: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  dangerConfirmButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderColor: colors.borderSoft,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1.08,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerConfirmButtonText: {
    color: colors.danger,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.control,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconText: {
    color: colors.text,
    ...typography.cardTitle,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.text,
    ...typography.label,
  },
  textField: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    ...typography.body,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textFieldError: {
    borderColor: colors.danger,
  },
  fieldHelper: {
    color: colors.mutedText,
    ...typography.label,
  },
  fieldError: {
    color: colors.danger,
    ...typography.label,
  },
  listRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.item,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listRowText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  listRowLabel: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.body,
    fontWeight: '600',
  },
  listRowSupporting: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...typography.label,
    fontWeight: '400',
  },
  listRowValue: {
    color: colors.primary,
    flexShrink: 1,
    ...typography.label,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    height: 66,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: 1,
    paddingVertical: 7,
    width: '100%',
  },
  bottomNavItem: {
    alignItems: 'center',
    borderRadius: 16,
    flexBasis: 68,
    flexGrow: 1,
    flexShrink: 1,
    gap: 3,
    height: 52,
    justifyContent: 'center',
    minWidth: 0,
    maxWidth: 68,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  bottomNavItemActive: {
    backgroundColor: '#F2F7FF',
  },
  navIcon: {
    color: colors.mutedText,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
  },
  navIconActive: {
    color: colors.primary,
  },
  bottomNavLabel: {
    color: colors.mutedText,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    maxWidth: '100%',
    textAlign: 'center',
  },
  bottomNavLabelActive: {
    color: colors.primary,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    gap: 18,
    minHeight: 320,
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  stateIcon: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 41,
    height: 82,
    justifyContent: 'center',
    width: 82,
  },
  defaultStateIcon: {
    backgroundColor: colors.borderSoft,
  },
  infoStateIcon: {
    backgroundColor: colors.borderSoft,
  },
  successStateIcon: {
    backgroundColor: colors.borderSoft,
  },
  warningStateIcon: {
    backgroundColor: colors.borderSoft,
  },
  dangerStateIcon: {
    backgroundColor: colors.borderSoft,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
