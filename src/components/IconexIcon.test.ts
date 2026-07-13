import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({parse: vi.fn((xml: string) => ({children: [], props: {xml}, tag: 'svg'}))}));

vi.mock('react-native', () => ({
  StyleSheet: {create: <T,>(styles: T) => styles},
  View: () => null,
}));
vi.mock('react-native-svg', () => ({
  parse: mocks.parse,
  SvgAst: () => null,
}));

import {getIconAstRenderProps} from './IconexIcon';

describe('IconexIcon AST rendering', () => {
  beforeEach(() => {
    mocks.parse.mockClear();
  });

  it('passes non-24 icon dimensions through SvgAst override', () => {
    expect(getIconAstRenderProps('bell', '#123456', 1.7, 16).override).toEqual({
      height: 16,
      width: 16,
    });
  });

  it('parses one name/color/stroke variant once across different sizes', () => {
    const first = getIconAstRenderProps('calendar', '#654321', 1.8, 14);
    const second = getIconAstRenderProps('calendar', '#654321', 1.8, 34);

    expect(first.ast).toBe(second.ast);
    expect(first.override).toEqual({height: 14, width: 14});
    expect(second.override).toEqual({height: 34, width: 34});
    expect(mocks.parse).toHaveBeenCalledOnce();
  });
});
