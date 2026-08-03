import {memo} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors} from '../../theme';
import type {YearlyRecapChapter} from '../yearlyRecapPresentation';

export const RecapChapterPage = memo(function RecapChapterPage({
  chapter,
}: {
  chapter: YearlyRecapChapter;
}) {
  return (
    <View accessibilityRole="summary" style={styles.page}>
      <Text style={styles.eyebrow}>{chapter.eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>{chapter.title}</Text>
      {chapter.description ? <Text style={styles.description}>{chapter.description}</Text> : null}
      {chapter.lines ? (
        <View style={styles.lines}>
          {chapter.lines.map((line) => <Text key={line} style={styles.line}>{line}</Text>)}
        </View>
      ) : null}
      {chapter.metrics ? (
        <View style={styles.metrics}>
          {chapter.metrics.map((metric) => (
            <View key={metric.label} style={styles.metric}>
              <Text style={styles.metricValue}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  description: {color: colors.textSecondary, fontSize: 17, lineHeight: 26},
  eyebrow: {color: colors.primary, fontSize: 14, fontWeight: '800', letterSpacing: 1.1},
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
  metricValue: {color: colors.textPrimary, fontSize: 25, fontWeight: '800', lineHeight: 32},
  metrics: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  page: {gap: 22, minHeight: 420, paddingBottom: 24, paddingTop: 28},
  title: {color: colors.textPrimary, fontSize: 32, fontWeight: '800', lineHeight: 41},
});
