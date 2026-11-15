import type { ThemeRegistration } from 'shiki/core';

import { kindColor, type TokenKind } from '#code/token-kind.ts';

/**
 * The name of the theme every code block is highlighted with.
 */
export const CODE_THEME_NAME = 'deck-code';

/**
 * Which TextMate scopes take which color kind. The same grouping the brand compiler uses for its
 * per-surface Shiki themes, so a block reads the same either way.
 */
const SCOPES: readonly { kind: TokenKind; scope: readonly string[] }[] = [
  { kind: 'comment', scope: ['comment', 'punctuation.definition.comment'] },
  {
    kind: 'keyword',
    scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'],
  },
  { kind: 'punctuation', scope: ['punctuation', 'meta.brace', 'keyword.operator'] },
  {
    kind: 'string',
    scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
  },
  {
    kind: 'number',
    scope: ['constant.numeric', 'constant.language', 'constant.character', 'support.constant'],
  },
  {
    kind: 'function',
    scope: [
      'entity.name.function',
      'support.function',
      'meta.function-call',
      'variable.function',
      'entity.other.attribute-name',
    ],
  },
  {
    kind: 'type',
    scope: [
      'entity.name.type',
      'entity.name.class',
      'support.type',
      'support.class',
      'entity.other.inherited-class',
      'entity.name.tag',
    ],
  },
  {
    kind: 'plain',
    scope: ['variable', 'variable.other', 'variable.parameter', 'meta.object-literal.key'],
  },
];

/**
 * The Shiki theme for code blocks. Its colors are `var(--brand-code-*)` references, not hex values,
 * so one highlight serves every surface and every brand: the surface that renders the block decides
 * the colors. That is also why a block can be highlighted once, at build time.
 */
export const codeTheme: ThemeRegistration = {
  /**
   * The id blocks name the theme by.
   */
  name: CODE_THEME_NAME,

  /**
   * The scheme only matters to Shiki's own defaults.
   */
  type: 'dark',

  /**
   * The default text color.
   */
  fg: kindColor('plain'),

  /**
   * The code background.
   */
  bg: 'var(--brand-code-background)',

  /**
   * The scope rules that color the tokens.
   */
  settings: SCOPES.map(({ kind, scope }) => ({
    scope: [...scope],
    settings: { foreground: kindColor(kind) },
  })),
};
