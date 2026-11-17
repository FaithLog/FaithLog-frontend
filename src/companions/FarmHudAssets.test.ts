import {describe,expect,it} from 'vitest';
import {colors} from '../theme';

describe('farm HUD styling',()=>{
 it('uses current FaithLog theme instead of beige experimental palette',()=>{
  expect(colors.background).toBe('#F7F8FA');
  expect(colors.surface).toBe('#FFFFFF');
  expect(colors.primary).toBe('#2368D3');
  expect(colors.faith).toBe('#2E7078');
 });
});
