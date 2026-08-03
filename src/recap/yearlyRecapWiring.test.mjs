import {readFileSync} from 'node:fs';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rootSource = readFileSync(resolve(here, '../root/FaithLogApp.tsx'), 'utf8');
const screenSource = readFileSync(resolve(here, 'YearlyRecapScreen.tsx'), 'utf8');
const experienceSource = readFileSync(resolve(here, 'useYearlyRecapExperience.ts'), 'utf8');
const homeCardSource = readFileSync(resolve(here, 'YearlyRecapHomeCard.tsx'), 'utf8');

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
    expect(screenSource).toContain('if (!modalVisible || firstFrameReported.current) return;');
    expect(experienceSource).toContain('markPresentedOnce');
    expect(experienceSource).toContain('expectedIdentityKey');
    expect(experienceSource).toContain('isAuthSessionRequestAllowed(generation)');
    expect(experienceSource.indexOf('getPreviousYearRecap')).toBeLessThan(
      experienceSource.indexOf('markFirstFramePresented'),
    );
  });

  it('supports safe area, manual navigation, background cleanup, and reduced motion', () => {
    expect(screenSource).toContain('<SafeAreaView');
    expect(screenSource).toContain('이전 회고 장면');
    expect(screenSource).toContain('다음 회고 장면');
    expect(screenSource).toContain("AppState.addEventListener('change'");
    expect(screenSource).toContain('AccessibilityInfo.isReduceMotionEnabled()');
    expect(screenSource).toContain('AccessibilityInfo.isScreenReaderEnabled()');
    expect(screenSource).toContain('accessibilityPreferencesReady');
    expect(screenSource).toContain('contentHeightRef.current <= viewportHeightRef.current + 1');
    expect(screenSource).toContain('onContentSizeChange');
  });

  it('contains no timer-based or auto-advance implementation', () => {
    expect(screenSource).not.toMatch(/AUTO_ADVANCE|autoAdvance|setTimeout/);
    expect(existsSync(resolve(here, 'yearlyRecapAutoAdvance.ts'))).toBe(false);
    expect(existsSync(resolve(here, 'yearlyRecapAutoAdvance.test.ts'))).toBe(false);
  });

  it('reuses the exact launch logo asset and keeps large-text card copy untruncated', () => {
    const assetsPath = resolve(here, 'yearlyRecapAssets.ts');
    expect(existsSync(assetsPath)).toBe(true);
    const assetsSource = existsSync(assetsPath) ? readFileSync(assetsPath, 'utf8') : '';
    expect(assetsSource).toContain("require('../../assets/launch-logo.png')");
    expect(assetsSource).not.toMatch(/icon-ios\.png|icon\.png/);
    expect(homeCardSource).not.toContain('numberOfLines={1}');
  });

  it('does not log or report recap payloads or sensitive content', () => {
    const source = `${screenSource}\n${experienceSource}`;
    expect(source).not.toMatch(/console\.|trackEvent|logEvent|crashlytics|recordError/);
    expect(source).not.toMatch(/prayerContent|choiceContent|commentContent|accountNumber|email/);
  });
});
