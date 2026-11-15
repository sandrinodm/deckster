import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

/**
 * Marks that open a quotation, with any space after them; a closing mark counts too, since typed
 * straight quotes at the start of a text can come out of smart punctuation as either.
 */
const OPENING = /^\s*["“”„«»‘’'‹›]\s*/u;

/**
 * Marks that close a quotation, after any closing punctuation they follow, with space around.
 */
const CLOSING = /\s*["”»’'›]\s*$/u;

/**
 * Which end of the quote a pass strips.
 */
type End = 'start' | 'end';

/**
 * A quote without the quotation marks its author typed around it, so a layout that draws its own
 * hanging marks does not show them twice: when the first text starts with an opening mark and the
 * last text ends with a closing mark, both are removed. A quote with only one of them, or with
 * marks inside it, is left as it is.
 *
 * @param node - The quote as React children, such as an MDX slot's paragraphs.
 * @returns The quote without its outer marks.
 */
export function stripQuoteMarks(node: ReactNode): ReactNode {
  const first = edgeText(node, 'start');
  const last = edgeText(node, 'end');
  if (first === undefined || last === undefined) {
    return node;
  }

  const bothMarked = OPENING.test(first) && CLOSING.test(last);
  return bothMarked ? strip(strip(node, 'start'), 'end') : node;
}

/**
 * The first or last text of a node, depth first.
 *
 * @param node - Any node.
 * @param end - Which end.
 */
function edgeText(node: ReactNode, end: End): string | undefined {
  if (typeof node === 'string') {
    return node.trim() === '' ? undefined : node;
  }

  const children = childrenOf(node);
  const ordered = end === 'start' ? children : children.toReversed();
  for (const child of ordered) {
    const text = edgeText(child, end);
    if (text !== undefined) {
      return text;
    }
  }

  return undefined;
}

/**
 * The children of an element or a fragment list, as an array; none for text.
 *
 * @param node - Any node.
 */
function childrenOf(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) {
    return node as ReactNode[];
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return Children.toArray(node.props.children);
  }

  return [];
}

/**
 * The node with the mark at one end of its first or last text removed.
 *
 * @param node - Any node.
 * @param end - Which end.
 */
function strip(node: ReactNode, end: End): ReactNode {
  if (typeof node === 'string') {
    return node.replace(end === 'start' ? OPENING : CLOSING, '');
  }

  const children = childrenOf(node);
  const indexes = children.map((_, index) => index);
  const edgeIndex = (end === 'start' ? indexes : indexes.toReversed()).find(
    (index) => edgeText(children[index], end) !== undefined,
  );
  if (edgeIndex === undefined) {
    return node;
  }

  const next = children.map((child, index) => (index === edgeIndex ? strip(child, end) : child));
  if (Array.isArray(node)) {
    return next;
  }

  return isValidElement<{ children?: ReactNode }>(node) ? cloneElement(node, {}, ...next) : node;
}
