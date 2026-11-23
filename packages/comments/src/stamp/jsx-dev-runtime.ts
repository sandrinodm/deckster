import type { ElementType, Key, ReactElement } from 'react';
import type { JSXSource } from 'react/jsx-dev-runtime';

import { readStaticMode } from '@deckster/engine';
import { Fragment, jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';

import { stampProps } from '#stamp/stamp-props.ts';

export { Fragment };

/**
 * Whether this page stamps elements: every dev page except one in `?static` mode, which `deck
 * shot`, `deckster lint` and export read and which must match a production build. Static mode is
 * read once, as the engine reads it.
 */
const STAMPING = typeof window === 'undefined' ? true : !readStaticMode(window.location.search);

/**
 * React's development `jsxDEV`, with each element of a deck file stamped with its source location.
 * The comments Vite plugin points the deck's own MDX and TSX modules at this module instead of
 * `react/jsx-dev-runtime`, and only in dev; React 19 ignores the `source` argument the compilers
 * still pass, so the location becomes the `data-deck-source` prop instead.
 *
 * @param type - The element type.
 * @param props - The element's props.
 * @param key - The element's key.
 * @param isStatic - Whether the children are a static array.
 * @param source - The compiler's source location, with the file relative to the deck folder.
 * @param self - The compiler's `this`.
 * @returns The element React's own `jsxDEV` creates.
 */
export function jsxDEV(
  type: ElementType,
  props: unknown,
  key: Key | undefined,
  isStatic: boolean,
  source?: JSXSource,
  self?: unknown,
): ReactElement {
  const stamped = STAMPING ? stampProps(type, props, source) : props;
  return reactJsxDEV(type, stamped, key, isStatic, source, self);
}
