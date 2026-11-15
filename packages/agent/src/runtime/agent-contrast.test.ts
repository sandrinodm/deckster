import {
  contrastRatio,
  GRAPHIC_CONTRAST,
  parseColorLiteral,
  TEXT_CONTRAST,
  type Rgba,
} from '@deckster/brand';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

/**
 * The presenter's tool tokens, which the panel uses for every colour.
 */
const TOKENS = readFileSync(
  fileURLToPath(import.meta.resolve('@deckster/presenter/tokens.css')),
  'utf8',
);

/**
 * The panel's stylesheet.
 */
const PANEL_CSS = readFileSync(new URL('agent.css', import.meta.url), 'utf8');

/**
 * A colour token's value. The tool chrome is light only, so each token is one colour.
 *
 * @param name - The token, such as `--dp-muted`.
 * @param css - Where it is defined.
 */
function token(name: string, css = TOKENS): Rgba {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  const color = parseColorLiteral(value?.[1]?.trim() ?? '');
  if (color === undefined) {
    throw new Error(`${name} is not a colour`);
  }

  return color;
}

/**
 * The text and background pairs the panel draws, by token.
 */
const PAIRS: readonly (readonly [string, string])[] = [
  ['--dp-text', '--dp-bg'],
  ['--dp-muted', '--dp-bg'],
  ['--dp-muted', '--dp-panel'],
  ['--dp-muted', '--dp-raised'],
  ['--dp-text', '--dp-raised'],
  ['--dp-accent', '--dp-accent-soft'],
  ['--dp-accent', '--dp-panel'],
  ['--dp-accent', '--dp-bg'],
  ['--dp-on-accent', '--dp-accent'],
  ['--dp-on-primary', '--dp-primary'],
  ['--dp-ok', '--dp-panel'],
  ['--dp-danger', '--dp-panel'],
  ['--dp-warn', '--dp-panel'],
  ['--dp-text', '--dp-ok-soft'],
  ['--dp-text', '--dp-danger-soft'],
  ['--dp-text', '--dp-warn-soft'],
  ['--dp-warn', '--dp-warn-soft'],
  ['--dp-panel', '--dp-text'],
];

/**
 * The marks and the backgrounds they are drawn on: rings, dots and focus outlines, which need the
 * 3:1 of a user-interface component.
 */
const MARK_PAIRS: readonly (readonly [string, string])[] = [
  ['--dp-mark', '--dp-bg'],
  ['--dp-mark', '--dp-panel'],
];

describe('the panel’s text contrast', () => {
  it.each(MARK_PAIRS)('gives the mark %s on %s at least 3:1', (mark, background) => {
    expect(contrastRatio(token(mark), token(background))).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
  });

  it.each(PAIRS)('gives %s on %s at least 4.5:1', (text, background) => {
    expect(contrastRatio(token(text), token(background))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it('gives the picked-element chip at least 4.5:1', () => {
    const chip = token('--da-pick-text', PANEL_CSS);
    expect(contrastRatio(chip, token('--dp-panel'))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it('has no dark scheme', () => {
    expect(TOKENS).not.toMatch(/light-dark\(|prefers-color-scheme/);
    expect(PANEL_CSS).not.toMatch(/light-dark\(|prefers-color-scheme/);
  });

  it('never reads a brand token', () => {
    expect(PANEL_CSS).not.toMatch(/var\(--brand-/);
  });
});
