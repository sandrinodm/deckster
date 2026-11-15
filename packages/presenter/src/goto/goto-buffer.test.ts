import { describe, expect, it } from 'vite-plus/test';

import { stepGoto } from '#goto/goto-buffer.ts';

describe('stepGoto', () => {
  it('appends digits and removes them with Backspace', () => {
    expect(stepGoto('1', '2', 20)).toEqual({ type: 'edit', buffer: '12' });
    expect(stepGoto('12', 'Backspace', 20)).toEqual({ type: 'edit', buffer: '1' });
  });

  it('goes to the typed slide, zero-based, on Enter', () => {
    expect(stepGoto('12', 'Enter', 20)).toEqual({ type: 'go', slide: 11 });
  });

  it('rejects an empty or out-of-range number', () => {
    expect(stepGoto('', 'Enter', 20)).toEqual({ type: 'invalid', buffer: '' });
    expect(stepGoto('21', 'Enter', 20)).toEqual({ type: 'invalid', buffer: '21' });
    expect(stepGoto('0', 'Enter', 20)).toEqual({ type: 'invalid', buffer: '0' });
  });

  it('cancels on Escape and ignores other keys', () => {
    expect(stepGoto('3', 'Escape', 20)).toEqual({ type: 'cancel' });
    expect(stepGoto('3', 'ArrowRight', 20)).toEqual({ type: 'edit', buffer: '3' });
    expect(stepGoto('3', 'x', 20)).toEqual({ type: 'edit', buffer: '3' });
  });

  it('stops taking digits at the limit', () => {
    expect(stepGoto('1234', '5', 99999)).toEqual({ type: 'edit', buffer: '1234' });
  });
});
