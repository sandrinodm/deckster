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
 * Makes SVG markup safe to inline in a slide, in the browser (TSX slides pass markup at runtime):
 * parses it as an HTML fragment inside a `<template>` of a `DOMParser` document, which is inert (no
 * script runs, no image loads, no handler fires), then keeps only what {@link sanitizeSvgTree}'s
 * allowlist allows and serialises the result from the tree, the same way the build does with
 * parse5.
 *
 * @param input - The SVG source.
 * @returns The cleaned markup and what was dropped.
 * @throws Error when there is no `DOMParser` (outside a browser).
 */
export function sanitizeSvgInBrowser(input: string): SanitizedSvg {
  return sanitizeSvgTree(parseSvgInBrowser(input));
}

/**
 * The top-level nodes of SVG markup, as the browser's HTML fragment parser reads them.
 *
 * @param input - The SVG source.
 * @throws Error when there is no `DOMParser` (outside a browser).
 */
export function parseSvgInBrowser(input: string): SvgNode[] {
  if (typeof DOMParser === 'undefined') {
    throw new TypeError(
      'An <Svg> with markup is sanitised with DOMParser, which this environment does not have.',
    );
  }

  const document = new DOMParser().parseFromString('<template></template>', 'text/html');
  const template = document.querySelector('template');
  if (template === null) {
    return [];
  }

  template.innerHTML = input;
  return fromDom(template.content.childNodes);
}

/**
 * DOM nodes as {@link SvgNode}s: elements, text and CDATA; comments and the rest are left out.
 *
 * @param nodes - Child nodes.
 */
function fromDom(nodes: NodeListOf<ChildNode>): SvgNode[] {
  const converted: SvgNode[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      converted.push({ type: 'text', value: node.nodeValue ?? '' });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      converted.push(fromElement(node as Element));
    }
  }

  return converted;
}

/**
 * A DOM element as an {@link SvgElementNode}.
 *
 * @param element - The element.
 */
function fromElement(element: Element): SvgElementNode {
  return {
    type: 'element',
    name: element.namespaceURI === SVG_NAMESPACE ? element.tagName : element.localName,
    svg: element.namespaceURI === SVG_NAMESPACE,
    attributes: Array.from(element.attributes, (attribute) => ({
      name: attribute.name,
      value: attribute.value,
    })),
    children: fromDom(element.childNodes),
  };
}
