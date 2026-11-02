// Avatar initials must keep emoji sequences intact, including on native engines
// without Intl.Segmenter. Never truncate UTF-16 code units with slice(0, 1).
export function getNameInitial(name: string): string {
  const text = name.trim().normalize('NFC');
  if (!text) return '?';
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: {granularity: string}) => {
      segment: (value: string) => Iterable<{segment: string}>;
    };
  }).Segmenter;
  if (Segmenter) {
    return new Segmenter(undefined, {granularity: 'grapheme'})
      .segment(text)[Symbol.iterator]().next().value?.segment ?? '?';
  }

  const points = Array.from(text);
  let initial = points[0]!;
  let index = 1;
  // A flag consists of two regional indicator code points.
  if (/\p{Regional_Indicator}/u.test(initial) && /\p{Regional_Indicator}/u.test(points[index] ?? '')) {
    initial += points[index++];
  }
  while (index < points.length) {
    const point = points[index]!;
    if (/[\p{Mark}\p{Emoji_Modifier}\u{E0020}-\u{E007F}]/u.test(point)) {
      initial += point;
      index += 1;
    } else if (point === '\u200D' && points[index + 1]) {
      initial += point + points[index + 1];
      index += 2;
    } else {
      break;
    }
  }
  return initial;
}
