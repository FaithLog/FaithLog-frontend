import {describe, expect, it} from 'vitest';
import {colors} from './theme';

function luminance(hex: string) {
  const channel = (index: number) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}

describe('small action and status text contrast', () => {
  it.each([
    ['primary action', colors.surface, colors.primary],
    ['danger action', colors.surface, colors.danger],
    ['community badge', colors.faith, colors.faithSoft],
    ['community text', colors.faith, colors.surface],
    ['info badge', colors.primary, colors.primarySoft],
    ['success badge', colors.success, colors.successSoft],
    ['warning badge', colors.warning, colors.warningSoft],
    ['danger badge', colors.danger, colors.dangerSoft],
  ])('%s meets a 4.5:1 contrast ratio', (_name, foreground, background) => {
    const first = luminance(foreground);
    const second = luminance(background);
    const dark = Math.min(first, second);
    const light = Math.max(first, second);
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
