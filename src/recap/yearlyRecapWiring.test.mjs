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
const productionRecapSource = [
  'yearlyRecapTypes.ts',
  'yearlyRecapRuntimeValidation.ts',
  'yearlyRecapMock.ts',
  'yearlyRecapPresentation.ts',
  'yearlyRecapApi.ts',
  'yearlyRecapTheme.ts',
  'YearlyRecapScreen.tsx',
  'YearlyRecapHomeCard.tsx',
  'components/RecapChapterPage.tsx',
  'useYearlyRecapExperience.ts',
].map((path) => readFileSync(resolve(here, path), 'utf8')).join('\n');

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
    expect(screenSource).toContain('modalShownRef.current');
    expect(screenSource).toContain('layoutReadyRef.current');
    expect(screenSource).toContain('reportFirstFrameIfReady();');
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

  it('contains no annual-recap poll contract, type, fixture, copy, or scene', () => {
    expect(productionRecapSource).not.toMatch(
      /pollActivity|YearlyRecapPollActivity|participatedPoll|참여한 투표|예배 투표|리더 투표|커피 투표|밥 투표|일반 투표/,
    );
  });

  it('reuses the exact launch logo asset and keeps large-text card copy untruncated', () => {
    const assetsPath = resolve(here, 'yearlyRecapAssets.ts');
    expect(existsSync(assetsPath)).toBe(true);
    const assetsSource = existsSync(assetsPath) ? readFileSync(assetsPath, 'utf8') : '';
    expect(assetsSource).toContain("require('../../assets/launch-logo.png')");
    expect(assetsSource).not.toMatch(/icon-ios\.png|icon\.png/);
    expect(homeCardSource).not.toContain('numberOfLines={1}');
  });

  it('uses an AA text accent on recap surfaces', () => {
    const themeSource = readFileSync(resolve(here, 'yearlyRecapTheme.ts'), 'utf8');
    const accent = themeSource.match(/YEARLY_RECAP_ACCENT = '(#[0-9A-F]{6})'/)?.[1];

    expect(accent).toBeDefined();
    expect(contrastRatio(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accent, '#F1F7FF')).toBeGreaterThanOrEqual(4.5);
    expect(screenSource).toContain('backgroundColor: YEARLY_RECAP_ACCENT');
    expect(homeCardSource).toContain('backgroundColor: YEARLY_RECAP_ACCENT');
  });

  it('does not log or report recap payloads or sensitive content', () => {
    expect(productionRecapSource).not.toMatch(
      /console\.|trackEvent|logEvent|crashlytics|recordError/,
    );
    expect(productionRecapSource).not.toMatch(
      /prayerContent|choiceContent|voteChoice|commentContent|memoContent|memoText|memoBody|accountNumber|accountId|chargeId|email/,
    );
  });
});

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
