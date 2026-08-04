import {useCallback, useEffect, useRef} from 'react';
import type {LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, View} from 'react-native';

type Direction = -1 | 0 | 1;

type ScrollableListHandle = {
  scrollToOffset: (options: {animated?: boolean; offset: number}) => void;
};

const AUTO_SCROLL_INTERVAL_MS = 32;
const AUTO_SCROLL_STEP_PX = 12;

export function getHorizontalEdgeDirection(
  pageX: number,
  viewportLeft: number,
  viewportWidth: number,
): Direction {
  if (!Number.isFinite(pageX) || !Number.isFinite(viewportLeft) || viewportWidth <= 0) return 0;
  const threshold = Math.min(64, Math.max(44, viewportWidth * 0.18));
  if (pageX <= viewportLeft + threshold) return -1;
  if (pageX >= viewportLeft + viewportWidth - threshold) return 1;
  return 0;
}

export function useHorizontalDragAutoScroll({
  itemExtent,
  onReorderAtEdge,
}: {
  itemExtent: number;
  onReorderAtEdge: (localId: string, direction: -1 | 1) => void;
}) {
  const listRef = useRef<ScrollableListHandle | null>(null);
  const viewportRef = useRef<View | null>(null);
  const viewportMetricsRef = useRef({left: 0, width: 0});
  const contentWidthRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const directionRef = useRef<Direction>(0);
  const activeLocalIdRef = useRef<string | null>(null);
  const accumulatedDistanceRef = useRef(0);
  const didAutoScrollRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    directionRef.current = 0;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const measureViewport = useCallback(() => {
    viewportRef.current?.measureInWindow((left, _top, width) => {
      viewportMetricsRef.current = {left, width};
    });
  }, []);

  const step = useCallback(() => {
    const direction = directionRef.current;
    const localId = activeLocalIdRef.current;
    if (direction === 0 || localId === null) return;
    const maxOffset = Math.max(0, contentWidthRef.current - viewportMetricsRef.current.width);
    const currentOffset = scrollOffsetRef.current;
    const nextOffset = Math.max(
      0,
      Math.min(maxOffset, currentOffset + direction * AUTO_SCROLL_STEP_PX),
    );
    if (nextOffset === currentOffset) return;
    scrollOffsetRef.current = nextOffset;
    listRef.current?.scrollToOffset({animated: false, offset: nextOffset});
    didAutoScrollRef.current = true;
    accumulatedDistanceRef.current += Math.abs(nextOffset - currentOffset);
    if (accumulatedDistanceRef.current >= itemExtent) {
      accumulatedDistanceRef.current -= itemExtent;
      onReorderAtEdge(localId, direction);
    }
  }, [itemExtent, onReorderAtEdge]);

  const setDirection = useCallback((direction: Direction) => {
    if (directionRef.current === direction) return;
    stopTimer();
    directionRef.current = direction;
    if (direction !== 0) timerRef.current = setInterval(step, AUTO_SCROLL_INTERVAL_MS);
  }, [step, stopTimer]);

  const startDrag = useCallback((localId: string) => {
    stopTimer();
    activeLocalIdRef.current = localId;
    accumulatedDistanceRef.current = 0;
    didAutoScrollRef.current = false;
    measureViewport();
  }, [measureViewport, stopTimer]);

  const updateDragPosition = useCallback((pageX: number) => {
    const {left, width} = viewportMetricsRef.current;
    setDirection(getHorizontalEdgeDirection(pageX, left, width));
  }, [setDirection]);

  const endDrag = useCallback(() => {
    const didAutoScroll = didAutoScrollRef.current;
    stopTimer();
    activeLocalIdRef.current = null;
    accumulatedDistanceRef.current = 0;
    didAutoScrollRef.current = false;
    return didAutoScroll;
  }, [stopTimer]);

  useEffect(() => stopTimer, [stopTimer]);

  return {
    bindList: (list: ScrollableListHandle | null) => {
      listRef.current = list;
    },
    endDrag,
    onContentSizeChange: (width: number) => {
      contentWidthRef.current = width;
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
    },
    onViewportLayout: (_event: LayoutChangeEvent) => measureViewport(),
    startDrag,
    updateDragPosition,
    viewportRef,
  };
}
