import {useEffect, useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing} from '../theme';

type DutyDateTimePickerModalProps = {
  minimumDate: Date;
  onApply: (value: Date) => void;
  onClose: () => void;
  value: Date;
  visible: boolean;
};

export function DutyDateTimePickerModal({
  minimumDate,
  onApply,
  onClose,
  value,
  visible,
}: DutyDateTimePickerModalProps) {
  const [draftDate, setDraftDate] = useState(value);
  const [monthCursor, setMonthCursor] = useState(
    new Date(value.getFullYear(), value.getMonth(), 1),
  );

  useEffect(() => {
    if (!visible) return;
    setDraftDate(value);
    setMonthCursor(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value, visible]);

  const calendarDays = getDutyCalendarDays(monthCursor);
  const canApply = draftDate.getTime() > minimumDate.getTime();
  const selectDate = (date: Date) => {
    if (isCalendarDateBefore(date, minimumDate)) return;
    setDraftDate(new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      draftDate.getHours(),
      draftDate.getMinutes(),
      0,
      0,
    ));
  };
  const updateTime = (hours: number, minutes: number) => {
    setDraftDate(new Date(
      draftDate.getFullYear(),
      draftDate.getMonth(),
      draftDate.getDate(),
      normalizeTimePart(hours, 24),
      normalizeTimePart(minutes, 60),
      0,
      0,
    ));
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent={true}
      visible={visible}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>마감 일시 선택</Text>
              <Text style={styles.description}>달력에서 날짜를 고르고 시간을 조정하세요.</Text>
            </View>
            <Pressable
              accessibilityLabel="마감 일시 선택 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={({pressed}) => [styles.iconButton, pressed ? styles.pressed : null]}>
              <Text style={styles.iconButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.calendarHeader}>
              <Pressable
                accessibilityLabel="이전 달"
                accessibilityRole="button"
                onPress={() => setMonthCursor(addMonths(monthCursor, -1))}
                style={({pressed}) => [styles.iconButton, pressed ? styles.pressed : null]}>
                <Text style={styles.calendarNavText}>‹</Text>
              </Pressable>
              <Text style={styles.calendarTitle}>
                {monthCursor.getFullYear()}년 {monthCursor.getMonth() + 1}월
              </Text>
              <Pressable
                accessibilityLabel="다음 달"
                accessibilityRole="button"
                onPress={() => setMonthCursor(addMonths(monthCursor, 1))}
                style={({pressed}) => [styles.iconButton, pressed ? styles.pressed : null]}>
                <Text style={styles.calendarNavText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.calendarGrid}>
              {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                <Text key={day} style={styles.calendarWeekday}>{day}</Text>
              ))}
              {calendarDays.map((date, index) => {
                if (!date) return <View key={`empty-${index}`} style={styles.calendarDayEmpty} />;
                const disabled = isCalendarDateBefore(date, minimumDate);
                const selected = isSameCalendarDate(date, draftDate);
                return (
                  <Pressable
                    accessibilityLabel={formatCalendarDateAccessibilityLabel(date)}
                    accessibilityRole="button"
                    accessibilityState={{disabled, selected}}
                    disabled={disabled}
                    key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                    onPress={() => selectDate(date)}
                    style={({pressed}) => [
                      styles.calendarDay,
                      selected ? styles.calendarDaySelected : null,
                      disabled ? styles.disabled : null,
                      pressed ? styles.pressed : null,
                    ]}>
                    <Text style={[
                      styles.calendarDayText,
                      selected ? styles.calendarDayTextSelected : null,
                    ]}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timePickerRow}>
              <TimeStepper
                label="시"
                onDecrement={() => updateTime(draftDate.getHours() - 1, draftDate.getMinutes())}
                onIncrement={() => updateTime(draftDate.getHours() + 1, draftDate.getMinutes())}
                value={String(draftDate.getHours()).padStart(2, '0')}
              />
              <TimeStepper
                label="분"
                onDecrement={() => updateTime(draftDate.getHours(), draftDate.getMinutes() - 5)}
                onIncrement={() => updateTime(draftDate.getHours(), draftDate.getMinutes() + 5)}
                value={String(draftDate.getMinutes()).padStart(2, '0')}
              />
            </View>
            {!canApply ? (
              <Text accessibilityRole="alert" style={styles.validationText}>
                마감 일시는 현재 시각 이후여야 합니다.
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="마감 일시 선택 취소"
              accessibilityRole="button"
              onPress={onClose}
              style={({pressed}) => [styles.secondaryAction, pressed ? styles.pressed : null]}>
              <Text style={styles.secondaryActionText}>취소</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="마감 일시 적용"
              accessibilityRole="button"
              accessibilityState={{disabled: !canApply}}
              disabled={!canApply}
              onPress={() => onApply(new Date(draftDate))}
              style={({pressed}) => [
                styles.primaryAction,
                !canApply ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.primaryActionText}>적용</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function formatDutyDateTimeLabel(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function TimeStepper({
  label,
  onDecrement,
  onIncrement,
  value,
}: {
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  value: string;
}) {
  return (
    <View style={styles.timeStepper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.timeStepperControls}>
        <Pressable
          accessibilityLabel={`${label} 줄이기`}
          accessibilityRole="button"
          onPress={onDecrement}
          style={({pressed}) => [styles.timeStepperButton, pressed ? styles.pressed : null]}>
          <Text style={styles.timeStepperButtonText}>−</Text>
        </Pressable>
        <Text accessibilityLabel={`${label} ${value}`} style={styles.timeStepperValue}>{value}</Text>
        <Pressable
          accessibilityLabel={`${label} 늘리기`}
          accessibilityRole="button"
          onPress={onIncrement}
          style={({pressed}) => [styles.timeStepperButton, pressed ? styles.pressed : null]}>
          <Text style={styles.timeStepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getDutyCalendarDays(monthCursor: Date) {
  const firstDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const lastDate = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = [];
  for (let index = 0; index < firstDay.getDay(); index += 1) days.push(null);
  for (let day = 1; day <= lastDate; day += 1) {
    days.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function isCalendarDateBefore(left: Date, right: Date) {
  return new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime()
    < new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
}

function isSameCalendarDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function normalizeTimePart(value: number, max: number) {
  return ((value % max) + max) % max;
}

function formatCalendarDateAccessibilityLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 선택`;
}

const styles = StyleSheet.create({
  actions: {flexDirection: 'row', gap: 10},
  calendarDay: {
    alignItems: 'center', borderRadius: radius.control, justifyContent: 'center',
    minHeight: 48, width: '14.285%',
  },
  calendarDayEmpty: {minHeight: 48, width: '14.285%'},
  calendarDaySelected: {backgroundColor: colors.primary},
  calendarDayText: {color: colors.textPrimary, fontSize: 15, fontWeight: '800'},
  calendarDayTextSelected: {color: colors.surface},
  calendarGrid: {flexDirection: 'row', flexWrap: 'wrap', rowGap: 4},
  calendarHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  calendarNavText: {color: colors.textPrimary, fontSize: 26, fontWeight: '800', lineHeight: 28},
  calendarTitle: {color: colors.textPrimary, fontSize: 18, fontWeight: '900'},
  calendarWeekday: {
    color: colors.textMuted, fontSize: 12, fontWeight: '900', lineHeight: 18,
    textAlign: 'center', width: '14.285%',
  },
  description: {color: colors.textSecondary, fontSize: 15, lineHeight: 22},
  disabled: {opacity: 0.42},
  header: {
    alignItems: 'flex-start', flexDirection: 'row', gap: spacing.gap,
    justifyContent: 'space-between',
  },
  headerText: {flex: 1, gap: 6, minWidth: 0},
  iconButton: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: radius.item,
    justifyContent: 'center', minHeight: 48, minWidth: 48,
  },
  iconButtonText: {color: colors.textPrimary, fontSize: 22, fontWeight: '700'},
  label: {color: colors.textMuted, fontSize: 13, fontWeight: '800', lineHeight: 18},
  pressed: {opacity: 0.75},
  primaryAction: {
    alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.item,
    flex: 1, justifyContent: 'center', minHeight: 54,
  },
  primaryActionText: {color: colors.surface, fontSize: 16, fontWeight: '800'},
  scrim: {backgroundColor: 'rgba(25, 31, 40, 0.32)', flex: 1, justifyContent: 'flex-end'},
  scrollContent: {gap: spacing.card, paddingBottom: 4},
  secondaryAction: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: radius.item,
    flex: 1, justifyContent: 'center', minHeight: 54,
  },
  secondaryActionText: {color: colors.textSecondary, fontSize: 16, fontWeight: '800'},
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    gap: spacing.card, maxHeight: '90%', padding: spacing.screenX,
  },
  timePickerRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.gap},
  timeStepper: {flex: 1, gap: 8, minWidth: 126},
  timeStepperButton: {
    alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.control,
    justifyContent: 'center', minHeight: 48, minWidth: 48,
  },
  timeStepperButtonText: {color: colors.primary, fontSize: 20, fontWeight: '900', lineHeight: 22},
  timeStepperControls: {
    alignItems: 'center', backgroundColor: colors.borderSoft, borderRadius: radius.item,
    flexDirection: 'row', gap: 8, padding: 6,
  },
  timeStepperValue: {
    color: colors.textPrimary, flex: 1, fontSize: 21, fontWeight: '900',
    lineHeight: 28, minWidth: 40, textAlign: 'center',
  },
  title: {color: colors.textPrimary, fontSize: 22, fontWeight: '800', lineHeight: 30},
  validationText: {color: colors.danger, fontSize: 13, fontWeight: '700', lineHeight: 19},
});
