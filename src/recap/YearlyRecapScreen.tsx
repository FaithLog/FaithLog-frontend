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
import {
  buildYearlyRecapChapters,
  getYearlyRecapChapterAnnouncement,
} from './yearlyRecapPresentation';
import {YEARLY_RECAP_ACCENT} from './yearlyRecapTheme';
import type {YearlyRecap} from './yearlyRecapTypes';

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
  const [scene, setScene] = useState<{animationIndex: number | null; index: number}>({
    animationIndex: 0,
    index: 0,
  });
  const {index} = scene;
  const [accessibilityPreferencesReady, setAccessibilityPreferencesReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [modalShown, setModalShown] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const contentHeightRef = useRef(0);
  const firstFrameReported = useRef(false);
  const layoutReadyRef = useRef(false);
  const modalShownRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeightRef = useRef(0);
  const modalVisible = visible && accessibilityPreferencesReady;
  const motionDisabled =
    !accessibilityPreferencesReady || reduceMotion || screenReaderEnabled || !appActive;
  const reportFirstFrameIfReady = useCallback(() => {
    if (
      !modalVisible ||
      !modalShownRef.current ||
      !layoutReadyRef.current ||
      firstFrameReported.current
    ) return;
    firstFrameReported.current = true;
    onFirstFrame();
  }, [modalVisible, onFirstFrame]);

  const goNext = useCallback(
    () => setScene((current) => {
      const nextIndex = Math.min(current.index + 1, chapters.length - 1);
      return nextIndex === current.index ? current : {
        animationIndex: motionDisabled ? null : nextIndex,
        index: nextIndex,
      };
    }),
    [chapters.length, motionDisabled],
  );
  const goPrevious = useCallback(
    () => setScene((current) => {
      const nextIndex = Math.max(current.index - 1, 0);
      return nextIndex === current.index ? current : {
        animationIndex: motionDisabled ? null : nextIndex,
        index: nextIndex,
      };
    }),
    [motionDisabled],
  );
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      !screenReaderEnabled &&
      contentHeightRef.current <= viewportHeightRef.current + 1 &&
      Math.abs(gesture.dy) > 18 &&
      Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      if (screenReaderEnabled || Math.abs(gesture.dy) <= Math.abs(gesture.dx)) return;
      if (gesture.dy < -54) goNext();
      if (gesture.dy > 54) goPrevious();
    },
  }), [goNext, goPrevious, screenReaderEnabled]);

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
    }).catch(() => {
      if (!active) return;
      setReduceMotion(true);
      setScreenReaderEnabled(true);
      setAccessibilityPreferencesReady(true);
    });
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
    if (!visible) {
      firstFrameReported.current = false;
      layoutReadyRef.current = false;
      modalShownRef.current = false;
      setModalShown(false);
      setScene((current) =>
        current.index === 0 && current.animationIndex === 0
          ? current
          : {animationIndex: 0, index: 0});
      return;
    }
    if (accessibilityPreferencesReady && motionDisabled) {
      setScene((current) => current.animationIndex === null
        ? current
        : {...current, animationIndex: null});
    }
  }, [accessibilityPreferencesReady, motionDisabled, visible]);

  useEffect(() => {
    setAppActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const shouldAnimateChapter =
    modalVisible && !motionDisabled && scene.animationIndex === index;

  useEffect(() => {
    if (!modalVisible) return;
    scrollRef.current?.scrollTo({animated: false, y: 0});
  }, [index, modalVisible]);

  useEffect(() => {
    fade.stopAnimation();
    if (!shouldAnimateChapter) {
      fade.setValue(1);
      return undefined;
    }
    fade.setValue(0);
    const animation = Animated.timing(fade, {
      duration: 360,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      fade.stopAnimation();
    };
  }, [fade, index, shouldAnimateChapter]);

  useEffect(() => {
    if (!modalVisible || !modalShown || !screenReaderEnabled) return;
    const chapter = chapters[index];
    if (chapter) {
      AccessibilityInfo.announceForAccessibility(getYearlyRecapChapterAnnouncement(chapter));
    }
  }, [chapters, index, modalShown, modalVisible, screenReaderEnabled]);

  const currentChapter = chapters[index]!;
  return (
    <Modal
      animationType={motionDisabled ? 'none' : 'fade'}
      onRequestClose={onClose}
      onShow={() => {
        modalShownRef.current = true;
        setModalShown(true);
        reportFirstFrameIfReady();
      }}
      presentationStyle="fullScreen"
      visible={modalVisible}>
      <SafeAreaView style={styles.safeArea}>
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={styles.root}
          {...panResponder.panHandlers}>
          <View style={styles.topBar}>
            <View
              accessible
              accessibilityLabel="연간 회고 진행"
              accessibilityRole="progressbar"
              accessibilityValue={{
                max: chapters.length,
                min: 1,
                now: index + 1,
                text: `${index + 1} / ${chapters.length}`,
              }}
              style={styles.progress}>
              {chapters.map((chapter, chapterIndex) => (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no"
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
              layoutReadyRef.current = true;
              reportFirstFrameIfReady();
            }}
            ref={scrollRef}
            style={styles.scroll}
            showsVerticalScrollIndicator={false}>
            <Animated.View style={{opacity: fade, transform: [{translateY: fade.interpolate({
              inputRange: [0, 1],
              outputRange: motionDisabled ? [0, 0] : [16, 0],
            })}]}}>
              <RecapChapterPage
                animationsEnabled={shouldAnimateChapter}
                chapter={currentChapter}
                key={`${currentChapter.kind}:${shouldAnimateChapter ? 'animated' : 'static'}`}
              />
            </Animated.View>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="이전 회고 장면"
              accessibilityRole="button"
              accessibilityState={{disabled: index === 0}}
              disabled={index === 0}
              onPress={goPrevious}
              style={({pressed}) => [
                styles.secondaryAction,
                index === 0 ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.secondaryActionText}>이전</Text>
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
  actions: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 10,
    paddingHorizontal: spacing.screenX,
    paddingVertical: 14,
  },
  close: {alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8},
  closeText: {color: colors.textSecondary, fontSize: 15, fontWeight: '700'},
  disabled: {opacity: 0.35},
  pressed: {opacity: 0.76},
  primaryAction: {
    alignItems: 'center',
    backgroundColor: YEARLY_RECAP_ACCENT,
    borderRadius: 14,
    flex: 1.4,
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryActionText: {color: colors.surface, fontSize: 16, fontWeight: '700'},
  progress: {flex: 1, flexDirection: 'row', gap: 5},
  progressActive: {backgroundColor: YEARLY_RECAP_ACCENT},
  progressTrack: {backgroundColor: '#D7E1EE', borderRadius: 3, flex: 1, height: 4},
  root: {backgroundColor: '#F1F7FF', flex: 1},
  safeArea: {backgroundColor: '#F1F7FF', flex: 1},
  scroll: {flex: 1, minHeight: 0},
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 8,
  },
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
