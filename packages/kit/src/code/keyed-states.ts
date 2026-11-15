import type { KeyedToken, KeyedTokensInfo } from '@shikijs/magic-move/types';

import { codeTheme } from '#code/code-theme.ts';
import { kindAt, kindColor, kindIndex, kindOfColor } from '#code/token-kind.ts';

/**
 * One animated token in compact form: its text, its offset in the code, the key that lets the
 * animation pair it with the same token in the next state, and its color kind.
 */
export type CompactKeyedToken = readonly [
  content: string,
  offset: number,
  key: string,
  kind: number,
];

/**
 * One state of a `CodeMove` after highlighting, small enough to serialize into the slide.
 */
export type CompactKeyedState = {
  /**
   * The state's source.
   */
  code: string;

  /**
   * Magic Move's hash of the source.
   */
  hash: string;

  /**
   * The language the state was highlighted as.
   */
  lang: string;

  /**
   * The tokens, with colors as kinds.
   */
  tokens: CompactKeyedToken[];
};

/**
 * Reduces a Magic Move state to the parts the browser needs, with colors as kind indexes.
 *
 * @param info - A state from `codeToKeyedTokens`, highlighted with the kit's theme.
 */
export function compactKeyed(info: KeyedTokensInfo): CompactKeyedState {
  return {
    code: info.code,
    hash: info.hash,
    lang: info.lang ?? '',
    tokens: info.tokens.map((token): CompactKeyedToken => [
      token.content,
      token.offset,
      token.key,
      kindIndex(kindOfColor(token.color)),
    ]),
  };
}

/**
 * Rebuilds the full Magic Move state from its compact form. Container colors come from the CSS
 * variables, and the renderer is told not to paint the container, so the frame's own styling wins.
 *
 * @param state - A state from {@link compactKeyed}.
 */
export function expandKeyed(state: CompactKeyedState): KeyedTokensInfo {
  return {
    code: state.code,
    hash: state.hash,
    lang: state.lang,
    lineNumbers: false,
    themeName: codeTheme.name ?? '',
    bg: 'var(--brand-code-background)',
    fg: kindColor('plain'),
    tokens: state.tokens.map(([content, offset, key, kind]): KeyedToken => ({
      content,
      offset,
      key,
      color: kindColor(kindAt(kind)),
    })),
  };
}
