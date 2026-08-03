import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Modal,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {colors, spacing} from '../theme';
import {RecapChapterPage} from './components/RecapChapterPage';
import {createRecapAutoAdvanceController} from './yearlyRecapAutoAdvance';
import {buildYearlyRecapChapters} from './yearlyRecapPresentation';
import type {YearlyRecap} from './yearlyRecapTypes';

const AUTO_ADVANCE_MS = 6500;

export function YearlyRecapScreen({
  onClose,
  onFirstFrame,
  recap,
  visible,
}: {
  onClose: () => void;
  onFirstFrame: () => void;
  recap: YearlyRecap;
  visible: boolean;
}) {
  const chapters = useMemo(() => buildYearlyRecapChapters(recap), [recap]);
  const [index, setIndex] = useState(0);
  const [accessibilityPreferencesReady, setAccessibilityPreferencesReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const contentHeightRef = useRef(0);
  const firstFrameReported = useRef(false);
  const viewportHeightRef = useRef(0);

  const goNext = useCallback(
    () => setIndex((current) => Math.min(current + 1, chapters.length - 1)),
    [chapters.length],
  );
  const goPrevious = useCallback(
    () => setIndex((current) => Math.max(current - 1, 0)),
    [],
  );
  const goToStart = useCallback(() => setIndex(0), []);
  const autoAdvance = useMemo(() => createRecapAutoAdvanceController({
    delayMs: AUTO_ADVANCE_MS,
    onAdvance: goNext,
  }), [goNext]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      contentHeightRef.current <= viewportHeightRef.current + 1 && Math.abs(gesture.dy) > 18,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy < -54) goNext();
      if (gesture.dy > 54) goPrevious();
    },
  }), [goNext, goPrevious]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      AccessibilityInfo.isReduceMotionEnabled(),
      AccessibilityInfo.isScreenReaderEnabled(),
    ]).then(([nextReduceMotion, nextScreenReader]) => {
      if (!active) return;
      setReduceMotion(nextReduceMotion);
      setScreenReaderEnabled(nextScreenReader);
      setAccessibilityPreferencesReady(true);
    }).catch(() => undefined);
    const reduceMotionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    const screenReaderSubscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReaderEnabled,
    );
    return () => {
      active = false;
      reduceMotionSubscription.remove();
      screenReaderSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || !accessibilityPreferencesReady) {
      autoAdvance.stop();
      if (!visible) {
        firstFrameReported.current = false;
        setIndex(0);
      }
      return undefined;
    }
    autoAdvance.start({reduceMotion, screenReaderEnabled});
    const subscription = AppState.addEventListener('change', (state) => {
      autoAdvance.onAppStateChange(state);
      if (state === 'active') autoAdvance.start({reduceMotion, screenReaderEnabled});
    });
    return () => {
      autoAdvance.stop();
      subscription.remove();
    };
  }, [accessibilityPreferencesReady, autoAdvance, index, reduceMotion, screenReaderEnabled, visible]);

  useEffect(() => {
    fade.stopAnimation();
    if (!accessibilityPreferencesReady || reduceMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, {
      duration: 360,
      toValue: 1,
      useNativeDriver: true,
    }).start();
    return () => fade.stopAnimation();
  }, [accessibilityPreferencesReady, fade, index, reduceMotion]);

  useEffect(() => {
    if (!visible || !screenReaderEnabled) return;
    const chapter = chapters[index];
    if (chapter) AccessibilityInfo.announceForAccessibility(chapter.title);
  }, [chapters, index, screenReaderEnabled, visible]);

  const currentChapter = chapters[index]!;
  return (
    <Modal
      animationType={!accessibilityPreferencesReady || reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.root} {...panResponder.panHandlers}>
          <View style={styles.topBar}>
            <View accessibilityLabel={`${index + 1} / ${chapters.length}`} style={styles.progress}>
              {chapters.map((chapter, chapterIndex) => (
                <View
                  key={chapter.kind}
                  style={[styles.progressTrack, chapterIndex <= index ? styles.progressActive : null]}
                />
              ))}
            </View>
            <Pressable
              accessibilityLabel="연간 회고 닫기"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={({pressed}) => [styles.close, pressed ? styles.pressed : null]}>
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            onContentSizeChange={(_width, height) => {
              contentHeightRef.current = height;
            }}
            onLayout={(event) => {
              viewportHeightRef.current = event.nativeEvent.layout.height;
              if (!visible || firstFrameReported.current) return;
              firstFrameReported.current = true;
              onFirstFrame();
            }}
            showsVerticalScrollIndicator={false}>
            <Animated.View style={{opacity: fade, transform: [{translateY: fade.interpolate({
              inputRange: [0, 1],
              outputRange: reduceMotion ? [0, 0] : [16, 0],
            })}]}}>
              <RecapChapterPage chapter={currentChapter} />
            </Animated.View>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={
                index === chapters.length - 1 ? '연간 회고 처음부터 보기' : '이전 회고 장면'
              }
              accessibilityRole="button"
              accessibilityState={{disabled: index === 0}}
              disabled={index === 0}
              onPress={index === chapters.length - 1 ? goToStart : goPrevious}
              style={({pressed}) => [
                styles.secondaryAction,
                index === 0 ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.secondaryActionText}>
                {index === chapters.length - 1 ? '처음부터' : '이전'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={index === chapters.length - 1 ? '연간 회고 마치기' : '다음 회고 장면'}
              accessibilityRole="button"
              onPress={index === chapters.length - 1 ? onClose : goNext}
              style={({pressed}) => [styles.primaryAction, pressed ? styles.pressed : null]}>
              <Text style={styles.primaryActionText}>
                {index === chapters.length - 1 ? '마치기' : '다음'}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {flexDirection: 'row', gap: 10, paddingHorizontal: spacing.screenX, paddingVertical: 14},
  close: {alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8},
  closeText: {color: colors.textSecondary, fontSize: 15, fontWeight: '700'},
  disabled: {opacity: 0.35},
  pressed: {opacity: 0.76},
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    flex: 1.4,
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryActionText: {color: colors.surface, fontSize: 16, fontWeight: '700'},
  progress: {flex: 1, flexDirection: 'row', gap: 5},
  progressActive: {backgroundColor: colors.primary},
  progressTrack: {backgroundColor: '#D7E1EE', borderRadius: 3, flex: 1, height: 4},
  root: {backgroundColor: '#F1F7FF', flex: 1},
  safeArea: {backgroundColor: '#F1F7FF', flex: 1},
  scrollContent: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.screenX},
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  secondaryActionText: {color: colors.textPrimary, fontSize: 16, fontWeight: '700'},
  topBar: {alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: spacing.screenX},
});
