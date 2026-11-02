import {describe, expect, it, vi} from 'vitest';
import {getNameInitial} from './nameInitial';

const cases = [
  ['이승욱', '이'],
  ['  Joseph ', 'J'],
  ['😀승욱', '😀'],
  ['👍🏽 친구', '👍🏽'],
  ['👨‍👩‍👧‍👦가족', '👨‍👩‍👧‍👦'],
  ['🏳️‍🌈친구', '🏳️‍🌈'],
  ['🇰🇷친구', '🇰🇷'],
  ['1️⃣친구', '1️⃣'],
  ['e\u0301milie', 'é'],
  ['이승욱', '이'],
  ['', '?'],
  ['   ', '?'],
] as const;

describe('getNameInitial', () => {
  it.each(cases)('keeps the first visible character in %s', (name, expected) => {
    expect(getNameInitial(name)).toBe(expected);
  });

  it.each(cases)('supports native engines without Segmenter: %s', (name, expected) => {
    vi.stubGlobal('Intl', {...Intl, Segmenter: undefined});
    try {
      expect(getNameInitial(name)).toBe(expected);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
