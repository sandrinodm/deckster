import { describe, expect, it } from 'vite-plus/test';

import { createColorResolver } from '#resolve/color-resolver.ts';

/**
 * Names every plain object inherits, which a palette lookup must not find.
 */
const INHERITED = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'];

describe('createColorResolver', () => {
  it('reports a reference to an inherited name as a missing palette or step, without throwing', () => {
    const colors = createColorResolver({ blue: { 600: '#2f4fd8' } });
    for (const name of INHERITED) {
      expect(colors.hex(`${name}.length`, 'a'), name).toBe('#ff00ff');
      expect(colors.hex(`blue.${name}`, 'b'), name).toBe('#ff00ff');
    }

    expect(colors.hex('constructor.name', 'c')).toBe('#ff00ff');
    expect(colors.problems.length).toBe(INHERITED.length * 2 + 1);
    expect(colors.problems[0]?.message).toContain('does not exist');
  });
});
