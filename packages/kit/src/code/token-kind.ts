/**
 * The syntax colors of a code block, in the order a compiled block refers to them by index. They
 * are the brand's code theme tokens (`--brand-code-*`) without `background` and `highlight`.
 */
export const TOKEN_KINDS = [
  'plain',
  'comment',
  'keyword',
  'string',
  'number',
  'function',
  'type',
  'punctuation',
] as const;

/**
 * One of {@link TOKEN_KINDS}.
 */
export type TokenKind = (typeof TOKEN_KINDS)[number];

/**
 * The brand custom property that holds each kind's color on the current surface.
 */
export const KIND_VARIABLES: Readonly<Record<TokenKind, string>> = {
  /**
   * Text no rule colors.
   */
  plain: '--brand-code-foreground',

  /**
   * Comments.
   */
  comment: '--brand-code-comment',

  /**
   * Keywords and storage modifiers.
   */
  keyword: '--brand-code-keyword',

  /**
   * String and template literals.
   */
  string: '--brand-code-string',

  /**
   * Numbers and language constants.
   */
  number: '--brand-code-number',

  /**
   * Function names, calls and attribute names.
   */
  function: '--brand-code-function',

  /**
   * Types, classes and tags.
   */
  type: '--brand-code-type',

  /**
   * Punctuation and operators.
   */
  punctuation: '--brand-code-punctuation',
};

/**
 * The `var()` reference to a kind's color, which is what the Shiki theme paints tokens with.
 *
 * @param kind - A token kind.
 */
export function kindColor(kind: TokenKind): string {
  return `var(${KIND_VARIABLES[kind]})`;
}

/**
 * The kind a Shiki token color stands for: the inverse of {@link kindColor}. A color the theme did
 * not produce counts as plain.
 *
 * @param color - The token's `color` from Shiki.
 */
export function kindOfColor(color: string | undefined): TokenKind {
  return TOKEN_KINDS.find((kind) => color === kindColor(kind)) ?? 'plain';
}

/**
 * The index of a kind in {@link TOKEN_KINDS}, as a compiled block stores it.
 *
 * @param kind - A token kind.
 */
export function kindIndex(kind: TokenKind): number {
  return TOKEN_KINDS.indexOf(kind);
}

/**
 * The kind at an index of a compiled block; plain for an index out of range.
 *
 * @param index - An index into {@link TOKEN_KINDS}.
 */
export function kindAt(index: number): TokenKind {
  return TOKEN_KINDS[index] ?? 'plain';
}
