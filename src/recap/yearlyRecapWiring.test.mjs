import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rootSource = readFileSync(resolve(here, '../root/FaithLogApp.tsx'), 'utf8');
const screenSource = readFileSync(resolve(here, 'YearlyRecapScreen.tsx'), 'utf8');
const experienceSource = readFileSync(resolve(here, 'useYearlyRecapExperience.ts'), 'utf8');

describe('yearly recap production wiring', () => {
  it('keeps the recap UI in dedicated modules and inserts the server-gated home card', () => {
    expect(rootSource).toContain("from '../recap/YearlyRecapHomeCard'");
    expect(rootSource).toContain("from '../recap/YearlyRecapScreen'");
    expect(rootSource).toContain('recapExperience.homeCardVisible');
    expect(rootSource).toContain('<YearlyRecapHomeCard');
    expect(rootSource).toContain('<YearlyRecapScreen');
  });

  it('reports presented only from the first rendered layout rather than after GET', () => {
    expect(screenSource).toContain('onFirstFrame();');
    expect(screenSource).toContain('firstFrameReported.current');
    expect(screenSource).toContain('if (!visible || firstFrameReported.current) return;');
    expect(experienceSource).toContain('markPresentedOnce');
    expect(experienceSource).toContain('expectedContextKey');
    expect(experienceSource).toContain('isAuthSessionRequestAllowed(generation)');
    expect(experienceSource.indexOf('getPreviousYearRecap')).toBeLessThan(
      experienceSource.indexOf('markFirstFramePresented'),
    );
  });

  it('supports safe area, manual navigation, background cleanup, and reduced motion', () => {
    expect(screenSource).toContain('<SafeAreaView');
    expect(screenSource).toContain("'이전 회고 장면'");
    expect(screenSource).toContain('다음 회고 장면');
    expect(screenSource).toContain("AppState.addEventListener('change'");
    expect(screenSource).toContain('AccessibilityInfo.isReduceMotionEnabled()');
    expect(screenSource).toContain('AccessibilityInfo.isScreenReaderEnabled()');
    expect(screenSource).toContain("'처음부터'");
    expect(screenSource).toContain('accessibilityPreferencesReady');
    expect(screenSource).toContain('contentHeightRef.current <= viewportHeightRef.current + 1');
    expect(screenSource).toContain('onContentSizeChange');
  });

  it('does not log or report recap payloads or sensitive content', () => {
    const source = `${screenSource}\n${experienceSource}`;
    expect(source).not.toMatch(/console\.|trackEvent|logEvent|crashlytics|recordError/);
    expect(source).not.toMatch(/prayerContent|choiceContent|commentContent|accountNumber|email/);
  });
});
