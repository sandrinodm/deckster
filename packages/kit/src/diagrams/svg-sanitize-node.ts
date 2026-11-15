import type { DefaultTreeAdapterTypes } from 'parse5';

import { parseFragment } from 'parse5';

import {
  sanitizeSvgTree,
  type SanitizedSvg,
  type SvgElementNode,
  type SvgNode,
} from '#diagrams/svg-sanitize.ts';

/**
 * The SVG namespace, which the HTML parser gives the elements of an inline drawing.
 */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Makes SVG markup safe to inline in a slide, at build time: parses it with parse5, the WHATWG HTML
 * parser, as a fragment (so it is read exactly as the browser reads inline SVG in a page), then
 * keeps only what {@link sanitizeSvgTree}'s allowlist allows and serialises the result from the
 * tree. The browser's version is `sanitizeSvgInBrowser`, which shares the allowlist.
 *
 * @param input - The SVG source.
 * @returns The cleaned markup and what was dropped.
 */
export function sanitizeSvg(input: string): SanitizedSvg {
  return sanitizeSvgTree(parseSvg(input));
}

/**
 * The top-level nodes of SVG markup, as the HTML fragment parser reads them.
 *
 * @param input - The SVG source.
 */
export function parseSvg(input: string): SvgNode[] {
  return fromParse5(parseFragment(input).childNodes);
}

/**
 * Parse5 nodes as {@link SvgNode}s: elements and text (CDATA in SVG arrives as text); comments and
 * doctypes are left out.
 *
 * @param nodes - Parse5 child nodes.
 */
function fromParse5(nodes: readonly DefaultTreeAdapterTypes.ChildNode[]): SvgNode[] {
  const converted: SvgNode[] = [];
  for (const node of nodes) {
    if (node.nodeName === '#text' && 'value' in node) {
      converted.push({ type: 'text', value: node.value });
    } else if ('tagName' in node) {
      converted.push(fromElement(node));
    }
  }

  return converted;
}

/**
 * A parse5 element as an {@link SvgElementNode}.
 *
 * @param element - The element.
 */
function fromElement(element: DefaultTreeAdapterTypes.Element): SvgElementNode {
  return {
    type: 'element',
    name: element.tagName,
    svg: element.namespaceURI === SVG_NAMESPACE,
    attributes: element.attrs.map((attribute) => ({
      name:
        attribute.prefix === undefined || attribute.prefix === ''
          ? attribute.name
          : `${attribute.prefix}:${attribute.name}`,
      value: attribute.value,
    })),
    children: fromParse5(element.childNodes),
  };
}
