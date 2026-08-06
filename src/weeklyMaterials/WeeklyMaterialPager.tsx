import {type ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';
import {formatWeeklyMaterialHeader, moveWeekStartDate} from './weeklyMaterialDate';

export function WeeklyMaterialPager({
  contentRevision = 'initial',
  currentWeekStartDate,
  navigationDisabled = false,
  onBlockedNavigation,
  onSelectWeek,
  renderWeek,
  selectedWeekStartDate,
}: {
  contentRevision?: string;
  currentWeekStartDate: string;
  navigationDisabled?: boolean;
  onBlockedNavigation?: () => void;
  onSelectWeek: (weekStartDate: string) => boolean | void;
  renderWeek: (weekStartDate: string) => ReactNode;
  selectedWeekStartDate: string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const contentReadyCenterPendingRef = useRef(true);
  const userDragInProgressRef = useRef(false);
  const [pageWidth, setPageWidth] = useState(1);
  const pages = useMemo(
    () => [
      moveWeekStartDate(selectedWeekStartDate, -1),
      selectedWeekStartDate,
      moveWeekStartDate(selectedWeekStartDate, 1),
    ],
    [selectedWeekStartDate],
  );
  const header = formatWeeklyMaterialHeader(selectedWeekStartDate);
  const isCurrent = selectedWeekStartDate === currentWeekStartDate;

  useEffect(() => {
    contentReadyCenterPendingRef.current = true;
  }, [pageWidth]);

  useEffect(() => {
    scrollRef.current?.scrollTo({animated: false, x: pageWidth});
  }, [pageWidth, selectedWeekStartDate]);

  const onContentSizeChange = (contentWidth: number) => {
    if (
      !contentReadyCenterPendingRef.current ||
      contentWidth < pageWidth * pages.length
    ) return;
    contentReadyCenterPendingRef.current = false;
    scrollRef.current?.scrollTo({animated: false, x: pageWidth});
  };

  const selectRelativeWeek = (distance: -1 | 1) => {
    if (navigationDisabled) {
      onBlockedNavigation?.();
      return false;
    }
    return onSelectWeek(moveWeekStartDate(selectedWeekStartDate, distance)) !== false;
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const width = Math.max(1, Math.round(event.nativeEvent.layout.width));
    setPageWidth(width);
  };

  const onMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (
      contentReadyCenterPendingRef.current ||
      !userDragInProgressRef.current
    ) {
      userDragInProgressRef.current = false;
      scrollRef.current?.scrollTo({animated: false, x: pageWidth});
      return;
    }
    userDragInProgressRef.current = false;
    const page = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    const accepted = page === 0
      ? selectRelativeWeek(-1)
      : page === 2
        ? selectRelativeWeek(1)
        : true;
    if (page === 1 || navigationDisabled || accepted === false) {
      scrollRef.current?.scrollTo({animated: true, x: pageWidth});
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <WeekArrow
          accessibilityLabel="이전 주"
          disabled={navigationDisabled}
          label="‹"
          onPress={() => selectRelativeWeek(-1)}
        />
        <View accessibilityRole="header" style={styles.headerCopy}>
          <View style={styles.weekLabelRow}>
            <Text style={styles.weekLabel}>{header.weekLabel}</Text>
            {isCurrent ? <Text style={styles.currentBadge}>이번 주</Text> : null}
          </View>
          <Text style={styles.rangeLabel}>{header.rangeLabel}</Text>
        </View>
        <WeekArrow
          accessibilityLabel="다음 주"
          disabled={navigationDisabled}
          label="›"
          onPress={() => selectRelativeWeek(1)}
        />
      </View>
      {!isCurrent ? (
        <Pressable
          accessibilityLabel="이번 주로 이동"
          accessibilityRole="button"
          disabled={navigationDisabled}
          onPress={() => {
            if (navigationDisabled) onBlockedNavigation?.();
            else onSelectWeek(currentWeekStartDate);
          }}
          style={styles.todayButton}>
          <Text style={styles.todayButtonText}>이번 주로 이동</Text>
        </Pressable>
      ) : null}
      <View onLayout={onLayout} style={styles.viewport}>
        <ScrollView
          bounces={false}
          contentOffset={{x: pageWidth, y: 0}}
          decelerationRate="fast"
          horizontal
          onContentSizeChange={onContentSizeChange}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollBeginDrag={() => {
            userDragInProgressRef.current = true;
          }}
          pagingEnabled
          ref={scrollRef}
          scrollEnabled={!navigationDisabled}
          showsHorizontalScrollIndicator={false}
          snapToInterval={pageWidth}>
          {pages.map((week) => (
            <View
              accessibilityElementsHidden={week !== selectedWeekStartDate}
              importantForAccessibility={week === selectedWeekStartDate ? 'auto' : 'no-hide-descendants'}
              key={`${week}:${contentRevision}`}
              style={[styles.page, {width: pageWidth}]}>
              {renderWeek(week)}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function WeekArrow({
  accessibilityLabel,
  disabled,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      onPress={onPress}
      style={[styles.arrow, disabled ? styles.disabled : null]}>
      <Text style={styles.arrowText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  arrow: {
    alignItems: 'center',
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.control,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  arrowText: {...typography.cardTitle, color: colors.textPrimary, fontSize: 28, lineHeight: 28},
  currentBadge: {
    ...typography.caption,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    color: colors.primary,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  disabled: {opacity: 0.45},
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.gap,
    justifyContent: 'space-between',
  },
  headerCopy: {alignItems: 'center', flex: 1, gap: 2},
  page: {minHeight: 220},
  rangeLabel: {...typography.caption, color: colors.textMuted},
  root: {gap: spacing.gap},
  todayButton: {alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.gap},
  todayButtonText: {...typography.caption, color: colors.primary, fontWeight: '700'},
  viewport: {minHeight: 220, overflow: 'hidden'},
  weekLabel: {...typography.cardTitle, color: colors.textPrimary},
  weekLabelRow: {alignItems: 'center', flexDirection: 'row', gap: 8},
});
