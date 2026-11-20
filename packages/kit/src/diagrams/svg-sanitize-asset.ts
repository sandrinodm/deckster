import { SaxesParser, type SaxesAttributeNS } from 'saxes';

import {
  sanitizeSvgAssetTree,
  SVG_NAMESPACE,
  XLINK_NAMESPACE,
  type SanitizedSvg,
  type SvgNode,
} from '#diagrams/svg-sanitize.ts';

/**
 * The namespace URI for attributes such as `xml:lang` and `xml:space`.
 */
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/**
 * The namespace URI of the declarations removed when producing standalone SVG.
 */
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

/**
 * Parses standalone SVG as XML and applies the same drawing allowlist as for inline SVG. Preserves
 * dimensions and resolves SVG and XLink names by URI, regardless of prefix spelling.
 *
 * @param input - The source XML.
 * @returns The cleaned artwork and what was removed, or `undefined` if it is not well-formed XML
 *   with an SVG root.
 */
export function sanitizeSvgAsset(input: string): SanitizedSvg | undefined {
  const nodes = parseSvgXml(input);
  return nodes === undefined ? undefined : sanitizeSvgAssetTree(nodes);
}

/**
 * Reads well-formed XML as an SVG tree. Saxes checks the format without loading DTDs or resolving
 * custom entities. Its default error handler stops at the first malformed construct.
 *
 * @param input - The source XML.
 * @returns Parsed elements and text, or `undefined` for malformed XML.
 */
function parseSvgXml(input: string): SvgNode[] | undefined {
  const roots: SvgNode[] = [];
  const stack: SvgNode[][] = [roots];
  let namespaceFreeSvg = false;
  const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true });
  parser.on('opentag', (tag) => {
    if (stack.length === 1) {
      // Older brand assets may omit the SVG namespace altogether.
      namespaceFreeSvg = tag.uri === '' && tag.local.toLowerCase() === 'svg';
    }

    const children: SvgNode[] = [];
    stack.at(-1)?.push({
      type: 'element',
      name: tag.local,
      svg: tag.uri === SVG_NAMESPACE || (namespaceFreeSvg && tag.uri === ''),
      attributes: Object.values(tag.attributes).map((attribute) => ({
        name: xmlAttributeName(attribute),
        value: attribute.value,
      })),
      children,
    });
    stack.push(children);
  });
  parser.on('closetag', () => stack.pop());
  parser.on('text', (value) => stack.at(-1)?.push({ type: 'text', value }));
  parser.on('cdata', (value) => stack.at(-1)?.push({ type: 'text', value }));

  try {
    parser.write(input).close();
  } catch {
    return undefined;
  }

  return roots;
}

/**
 * Maps supported namespace URIs to the allowlist's names. A foreign URI stays distinct even when
 * its attribute uses a familiar prefix.
 *
 * @param attribute - The attribute with its namespace resolved by the XML parser.
 */
function xmlAttributeName(attribute: SaxesAttributeNS): string {
  switch (attribute.uri) {
    case '':
    case XMLNS_NAMESPACE:
      return attribute.name;
    case XML_NAMESPACE:
      return `xml:${attribute.local}`;
    case XLINK_NAMESPACE:
      return `xlink:${attribute.local}`;
    default:
      return `{${attribute.uri}}${attribute.local}`;
  }
}
