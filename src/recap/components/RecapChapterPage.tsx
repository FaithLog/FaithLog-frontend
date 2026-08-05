import {memo, useEffect, useRef} from 'react';
import {Animated, Image, StyleSheet, Text, useWindowDimensions, View} from 'react-native';

import {colors} from '../../theme';
import {getFaithLogRecapLogo} from '../yearlyRecapAssets';
import type {YearlyRecapChapter} from '../yearlyRecapPresentation';
import {YEARLY_RECAP_ACCENT} from '../yearlyRecapTheme';

export const RecapChapterPage = memo(function RecapChapterPage({
  animationsEnabled,
  chapter,
}: {
  animationsEnabled: boolean;
  chapter: YearlyRecapChapter;
}) {
  const {fontScale} = useWindowDimensions();
  const largeText = fontScale >= 1.5;
  const metricAnimationEnabled = animationsEnabled && chapter.kind === 'intro';
  const metricAnimations = useRef(
    (chapter.metrics ?? []).map(() => new Animated.Value(metricAnimationEnabled ? 0 : 1)),
  ).current;
  const emphasisRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    emphasisRef.current?.stop();
    if (!metricAnimationEnabled) {
      metricAnimations.forEach((value) => value.setValue(1));
      emphasisRef.current = null;
      return undefined;
    }
    metricAnimations.forEach((value) => value.setValue(0));
    const emphasis = Animated.stagger(120, metricAnimations.map((value) =>
      Animated.timing(value, {
        duration: 420,
        toValue: 1,
        useNativeDriver: true,
      })));
    emphasisRef.current = emphasis;
    emphasis.start();
    return () => {
      emphasis.stop();
      if (emphasisRef.current === emphasis) emphasisRef.current = null;
    };
  }, [metricAnimationEnabled, metricAnimations]);

  return (
    <View style={styles.page}>
      {chapter.kind === 'intro' ? (
        <View style={styles.brand}>
          <Image
            accessibilityElementsHidden
            importantForAccessibility="no"
            resizeMode="cover"
            source={getFaithLogRecapLogo()}
            style={styles.logo}
          />
          <Text style={styles.brandName}>FaithLog</Text>
        </View>
      ) : null}
      <Text style={styles.eyebrow}>{chapter.eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>{chapter.title}</Text>
      {chapter.description ? <Text style={styles.description}>{chapter.description}</Text> : null}
      {chapter.lines ? (
        <View style={styles.lines}>
          {chapter.lines.map((line) => <Text key={line} style={styles.line}>{line}</Text>)}
        </View>
      ) : null}
      {chapter.summary ? (
        <View
          accessible
          accessibilityLabel={`내 기록. ${chapter.summary}`}
          style={styles.summaryCard}>
          <Text importantForAccessibility="no" style={styles.summaryText}>
            {chapter.summary}
          </Text>
        </View>
      ) : null}
      {chapter.metrics ? (
        <View style={styles.metrics}>
          {chapter.metrics.map((metric, index) => (
            <Animated.View
              accessible
              accessibilityLabel={`내 기록. ${metric.label} ${metric.value}`}
              key={metric.label}
              style={[
                styles.metric,
                chapter.compact ? styles.metricCompact : null,
                largeText ? styles.metricLargeText : null,
                {
                  opacity: metricAnimations[index],
                  transform: [{scale: metricAnimations[index]!.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  })}],
                },
              ]}>
              {chapter.compact ? (
                <Text importantForAccessibility="no" style={styles.compactMetricText}>
                  {metric.label} {metric.value}
                </Text>
              ) : (
                <>
                  <Text importantForAccessibility="no" style={styles.metricValue}>
                    {metric.value}
                  </Text>
                  <Text importantForAccessibility="no" style={styles.metricLabel}>
                    {metric.label}
                  </Text>
                </>
              )}
            </Animated.View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  brand: {alignItems: 'center', gap: 8},
  brandName: {color: colors.textPrimary, fontSize: 20, fontWeight: '800'},
  compactMetricText: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 28,
  },
  description: {color: colors.textSecondary, fontSize: 17, lineHeight: 26},
  eyebrow: {color: YEARLY_RECAP_ACCENT, fontSize: 14, fontWeight: '800', letterSpacing: 1.1},
  line: {color: colors.textPrimary, fontSize: 18, fontWeight: '600', lineHeight: 27},
  lines: {gap: 14},
  metric: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 18,
    flexBasis: '46%',
    flexGrow: 1,
    gap: 3,
    minHeight: 94,
    padding: 16,
  },
  metricLabel: {color: colors.textSecondary, fontSize: 14, lineHeight: 20},
  metricCompact: {flexBasis: '100%', minHeight: 64, paddingVertical: 14},
  metricLargeText: {flexBasis: '100%'},
  metricValue: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 32,
    minWidth: 0,
  },
  metrics: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  logo: {borderRadius: 22, height: 88, width: 88},
  page: {gap: 22, minHeight: 420, paddingBottom: 24, paddingTop: 28},
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 18,
    minHeight: 64,
    padding: 16,
  },
  summaryText: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 28,
  },
  title: {color: colors.textPrimary, fontSize: 32, fontWeight: '800', lineHeight: 41},
});
