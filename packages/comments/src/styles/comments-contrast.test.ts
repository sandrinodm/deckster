import { contrastRatio, parseColorLiteral, TEXT_CONTRAST } from '@deckster/brand';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

/**
 * The overlay's stylesheet.
 */
const CSS = readFileSync(new URL('comments.css', import.meta.url), 'utf8');

/**
 * The value of a custom property the stylesheet defines, as a color.
 *
 * @param name - The property, such as `--dc-pin-open`.
 */
function token(name: string) {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(CSS)?.[1];
  const color = parseColorLiteral(value ?? '');
  if (color === undefined) {
    throw new Error(`${name} is not a color in comments.css`);
  }

  return color;
}

describe('what the overlay draws over slides', () => {
  it.each(['--dc-pin-open', '--dc-pin-resolved', '--dc-pin-guessed', '--dc-pin-lost'])(
    'gives the pin number on %s at least the WCAG text contrast',
    (name) => {
      expect(contrastRatio(token('--dc-paper'), token(name))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    },
  );

  it('outlines in a light line between dark ones, which stand apart on any surface', () => {
    expect(contrastRatio(token('--dc-paper'), token('--dc-ink'))).toBeGreaterThanOrEqual(15);
  });
});
