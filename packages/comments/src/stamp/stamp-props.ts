import type { JSXSource } from 'react/jsx-dev-runtime';

import { SOURCE_ATTRIBUTE } from '#model/source-stamp.ts';

/**
 * The `$$typeof` tags of element types that take no props of their own: context providers and
 * consumers. React's other built-ins (`Fragment`, `Suspense`, `StrictMode`, `Profiler`) are
 * symbols, which are never stamped either.
 */
const PROPLESS_TYPES: ReadonlySet<symbol> = new Set([
  Symbol.for('react.context'),
  Symbol.for('react.consumer'),
  Symbol.for('react.provider'),
]);

/**
 * Whether an element of this type can carry a stamp: host elements (`'div'`), function and class
 * components, and `memo`, `forwardRef` and `lazy` wrappers. Fragments and React's other built-ins
 * warn about props they do not know, so they are left alone.
 *
 * @param type - The element type given to `jsxDEV`.
 */
export function isStampable(type: unknown): boolean {
  if (typeof type === 'string' || typeof type === 'function') {
    return true;
  }

  if (typeof type !== 'object' || type === null) {
    return false;
  }

  const tag: unknown = Reflect.get(type, '$$typeof');
  return typeof tag !== 'symbol' || !PROPLESS_TYPES.has(tag);
}

/**
 * Adds the {@link SOURCE_ATTRIBUTE} prop to an element's props from the source location the JSX
 * compiler passed to `jsxDEV`. A host element renders it as an attribute; a component receives it
 * as a prop, where the comment overlay finds it through React's fiber tree even when the component
 * does not pass it on. A stamp the props already carry (spread in from a caller) is kept, so a deck
 * component's root keeps the location it was used at.
 *
 * @param type - The element type.
 * @param props - The props `jsxDEV` received.
 * @param source - The compiler's source location; elements without a line are left alone.
 * @returns The props, stamped, or the same object when nothing was added.
 */
export function stampProps(type: unknown, props: unknown, source: JSXSource | undefined): unknown {
  const line = source?.lineNumber;
  const file = source?.fileName;
  const canStamp = typeof props === 'object' && props !== null && isStampable(type);
  if (line === undefined || file === undefined || !canStamp) {
    return props;
  }

  if (Reflect.get(props, SOURCE_ATTRIBUTE) !== undefined) {
    return props;
  }

  return { ...props, [SOURCE_ATTRIBUTE]: `${file}:${line}:${source?.columnNumber ?? 1}` };
}
