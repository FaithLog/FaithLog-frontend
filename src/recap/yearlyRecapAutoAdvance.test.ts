import {describe, expect, it, vi} from 'vitest';

import {createRecapAutoAdvanceController} from './yearlyRecapAutoAdvance';

describe('recap auto advance lifecycle', () => {
  it('advances once and cancels on background', () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    const controller = createRecapAutoAdvanceController({delayMs: 6000, onAdvance});
    controller.start({reduceMotion: false, screenReaderEnabled: false});
    vi.advanceTimersByTime(5999);
    expect(onAdvance).not.toHaveBeenCalled();
    controller.onAppStateChange('background');
    vi.advanceTimersByTime(1);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('disables timed progression for reduce motion and screen reader users', () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    const controller = createRecapAutoAdvanceController({delayMs: 6000, onAdvance});
    controller.start({reduceMotion: true, screenReaderEnabled: false});
    vi.advanceTimersByTime(6000);
    controller.start({reduceMotion: false, screenReaderEnabled: true});
    vi.advanceTimersByTime(6000);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
