import type {PropsWithChildren, ReactNode} from 'react';
import {
  ActivityIndicator,
  type KeyboardTypeOptions,
  Pressable,
  type ReturnKeyTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  type TextInputSubmitEditingEventData,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

import {colors, radius, spacing} from '../theme';

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

export function Screen({children}: PropsWithChildren) {
  return <View style={styles.screen}>{children}</View>;
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
      <Text style={[styles.buttonText, styles[`${variant}ButtonText`]]}>{children}</Text>
    </Pressable>
  );
}

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({pressed}) => [styles.iconButton, pressed ? styles.pressed : null]}>
      <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.iconText}>
        {icon}
      </Text>
    </Pressable>
  );
}

export function TextField({
  accessibilityLabel,
  autoCapitalize = 'none',
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
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.subtleText}
        returnKeyType={returnKeyType}
        secureTextEntry={secureTextEntry}
        style={[styles.textField, error ? styles.textFieldError : null]}
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
                style={[styles.navIcon, active ? styles.navIconActive : null]}>
                {item.icon}
              </Text>
            ) : null}
            <Text style={[styles.bottomNavLabel, active ? styles.bottomNavLabelActive : null]}>
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
    <Card>
      <Chip label={getStateToneLabel(tone)} tone={tone} />
      <Title>{title}</Title>
      <Body>{message}</Body>
      {actionLabel && onActionPress ? (
        <Button
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          onPress={onActionPress}
          variant={tone === 'danger' ? 'danger' : 'secondary'}>
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
    </Card>
  );
}

function getStateToneLabel(tone: Tone) {
  switch (tone) {
    case 'danger':
      return '오류';
    case 'info':
      return '안내';
    case 'success':
      return '완료';
    case 'warning':
      return '확인 필요';
    case 'default':
      return '상태';
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
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  headerSubtitle: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 14,
    lineHeight: 20,
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
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    gap: spacing.gap,
  },
  eyebrow: {
    color: colors.primary,
    flexWrap: 'wrap',
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
  },
  body: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    lineHeight: 22,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    fontSize: 13,
    fontWeight: '800',
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
    borderRadius: radius.control,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.primarySoft,
  },
  dangerButton: {
    backgroundColor: colors.danger,
  },
  ghostButton: {
    backgroundColor: colors.neutralSoft,
  },
  buttonText: {
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryButtonText: {
    color: colors.surface,
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  dangerButtonText: {
    color: colors.surface,
  },
  ghostButtonText: {
    color: colors.text,
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
    fontSize: 18,
    fontWeight: '900',
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  textField: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textFieldError: {
    borderColor: colors.danger,
  },
  fieldHelper: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
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
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  listRowSupporting: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 13,
    lineHeight: 18,
  },
  listRowValue: {
    color: colors.primary,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 80,
    marginHorizontal: -24,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  bottomNavItem: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  bottomNavItemActive: {
    backgroundColor: '#494949',
  },
  navIcon: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '900',
  },
  navIconActive: {
    color: colors.surface,
  },
  bottomNavLabel: {
    color: colors.mutedText,
    flexShrink: 1,
    flexWrap: 'wrap',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
    textAlign: 'center',
  },
  bottomNavLabelActive: {
    color: colors.surface,
  },
  pressed: {
    opacity: 0.78,
  },
});
