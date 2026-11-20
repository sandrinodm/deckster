import {
  EDITOR_PREFIXES,
  SILENT_ELEMENTS,
  SVG_CSS_FUNCTIONS,
  SVG_DATA_ATTRIBUTE,
  SVG_ELEMENTS,
  SVG_EXTRA_STYLE_PROPERTIES,
  SVG_PLAIN_ATTRIBUTES,
  SVG_PRESENTATION_ATTRIBUTES,
  SVG_RASTER_DATA_URL,
  SVG_URL_ATTRIBUTES,
} from '#diagrams/svg-allowlist.ts';

/**
 * The namespace URI for the elements of a standalone SVG.
 */
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * The namespace URI for legacy SVG links.
 */
export const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

/**
 * An SVG made safe to inline, and what was taken out of it.
 */
export type SanitizedSvg = {
  /**
   * The markup, serialised from the cleaned tree: only allow-listed SVG elements and attributes,
   * with a `viewBox` derived from `width` and `height` when it had none.
   */
  markup: string;

  /**
   * What was taken out, each as a phrase such as `a <script> element` or `the onload attribute on
   * <svg>`, in document order.
   */
  dropped: string[];
};

/**
 * A parsed node of a drawing, as both parsers (parse5 at build time, `DOMParser` in the browser)
 * give it to {@link sanitizeSvgTree}. Comments, processing instructions and doctypes are left out by
 * the parsers; CDATA arrives as text.
 */
export type SvgNode = SvgElementNode | SvgTextNode;

/**
 * An element of a parsed drawing.
 */
export type SvgElementNode = {
  /**
   * Always `element`.
   */
  type: 'element';

  /**
   * The element's name as the HTML parser gives it (SVG names case-adjusted: `clipPath`).
   */
  name: string;

  /**
   * Whether the parser placed it in the SVG namespace; HTML elements (`<p>` breaking out of the
   * drawing, the content of `<foreignObject>`) are not.
   */
  svg: boolean;

  /**
   * Its attributes, with qualified names (`xlink:href`) and decoded values.
   */
  attributes: readonly SvgAttribute[];

  /**
   * Its children.
   */
  children: readonly SvgNode[];
};

/**
 * An attribute of a parsed element.
 */
export type SvgAttribute = {
  /**
   * The qualified name, such as `fill` or `xlink:href`.
   */
  name: string;

  /**
   * The value, entities decoded.
   */
  value: string;
};

/**
 * Text in a parsed drawing (CDATA included).
 */
export type SvgTextNode = {
  /**
   * Always `text`.
   */
  type: 'text';

  /**
   * The text, entities decoded.
   */
  value: string;
};

/**
 * Allowed element names by lowercase name, mapped to their canonical spelling.
 */
const ELEMENTS: ReadonlyMap<string, string> = canonicalNames(SVG_ELEMENTS);

/**
 * Allowed attributes whose values are kept as written, by lowercase name.
 */
const PLAIN_ATTRIBUTES: ReadonlyMap<string, string> = canonicalNames(SVG_PLAIN_ATTRIBUTES);

/**
 * Allowed attributes whose values are CSS, by lowercase name.
 */
const PRESENTATION_ATTRIBUTES: ReadonlyMap<string, string> = canonicalNames(
  SVG_PRESENTATION_ATTRIBUTES,
);

/**
 * Attributes that hold a URL, by lowercase name.
 */
const URL_ATTRIBUTES: ReadonlyMap<string, string> = canonicalNames(SVG_URL_ATTRIBUTES);

/**
 * The properties a `style` attribute may set.
 */
const STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  ...SVG_PRESENTATION_ATTRIBUTES,
  ...SVG_EXTRA_STYLE_PROPERTIES,
]);

/**
 * The CSS functions a value may call.
 */
const CSS_FUNCTIONS: ReadonlySet<string> = new Set(SVG_CSS_FUNCTIONS);

/**
 * Characters that never belong in a CSS value of a drawing: escapes (which can spell any function
 * name), comments, at-rules, blocks, declaration ends and markup.
 */
const UNSAFE_CSS = /[\\<>@{};]|\/\*|\*\//;

/**
 * A function call in a CSS value: the identifier right before `(` (empty for a bare parenthesis).
 */
const CSS_CALL = /([a-z0-9-]*)\(/gi;

/**
 * A `url()` whose target is a same-document `#fragment`, quoted or not.
 */
const LOCAL_CSS_URL = /^url\(\s*(["']?)#[^"'()\s\\]*\1\s*\)/i;

/**
 * A same-document reference: `#` and an id, nothing else.
 */
// eslint-disable-next-line no-control-regex
const FRAGMENT = /^#[^\s\u0000-\u001f]*$/;

/**
 * Whitespace and control characters, which a URL parser skips inside a scheme.
 */
// eslint-disable-next-line no-control-regex
const URL_IGNORED = /[\s\u0000-\u001f]+/g;

/**
 * Schemes that run code or embed documents.
 */
const SCRIPT_SCHEMES = ['javascript:', 'vbscript:', 'data:'] as const;

/**
 * Attribute names that declare namespaces, removed without a warning (inline SVG in HTML takes its
 * namespace from the parser).
 */
const NAMESPACE_DECLARATION = /^xmlns(?::|$)/;

/**
 * A size in user units (`240`, `240px`).
 */
const USER_UNITS = /^\s*(\d+(?:\.\d+)?|\.\d+)(?:px)?\s*$/i;

/**
 * Characters that cannot appear in a standalone XML document, including unpaired surrogates.
 */
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u;

/**
 * Cleans a parsed drawing with an allowlist and serialises it from the tree: keeps only the root
 * `<svg>` elements, the SVG elements of {@link SVG_ELEMENTS} (anything else, HTML elements
 * included, is removed with its content), and their allow-listed attributes: presentation
 * attributes whose CSS value has no escape, comment or unknown function and whose `url()`s name a
 * `#fragment`, a `style` attribute filtered declaration by declaration with the same rules,
 * `href`/`xlink:href` only for a `#fragment` (or a raster `data:` image on `<image>`), `data-*` and
 * `aria-*`. Event handlers, `<style>`, `<script>`, `<foreignObject>`, animation elements and
 * external references never survive. A root `<svg>` with `width` and `height` but no `viewBox` gets
 * `viewBox="0 0 width height"` and loses the fixed size, so it scales to its box. The output is
 * markup an HTML parser reads back into the same tree, so sanitising it again changes nothing.
 *
 * @param nodes - The parsed top-level nodes.
 * @returns The markup and what was dropped.
 */
export function sanitizeSvgTree(nodes: readonly SvgNode[]): SanitizedSvg {
  const dropped: string[] = [];
  const [first, ...rest] = cleanSvgRoots(nodes, dropped);
  const sized = first === undefined ? [] : [withViewBox(first), ...rest];
  return { markup: sized.map(serializeNode).join(''), dropped };
}

/**
 * Serializes a cleaned SVG as a standalone XML file, with fixed namespaces and its original size.
 * Returns `undefined` when the input lacks a single SVG root or the output has invalid characters.
 *
 * @param nodes - The parsed top-level nodes.
 * @returns The standalone SVG and what was dropped, if it can be serialized as XML.
 */
export function sanitizeSvgAssetTree(nodes: readonly SvgNode[]): SanitizedSvg | undefined {
  const dropped: string[] = [];
  const roots = cleanSvgRoots(nodes, dropped);
  const [root] = roots;
  if (root === undefined || roots.length !== 1) {
    return undefined;
  }

  const markup = serializeNode({
    ...root,
    attributes: [
      { name: 'xmlns', value: SVG_NAMESPACE },
      { name: 'xmlns:xlink', value: XLINK_NAMESPACE },
      ...root.attributes,
    ],
  });
  return INVALID_XML_CHARACTER.test(markup) ? undefined : { markup, dropped };
}

/**
 * Keeps the cleaned SVG roots and records any other top-level elements that were removed.
 *
 * @param nodes - The parsed top-level nodes.
 * @param dropped - What was dropped, added to in place.
 */
function cleanSvgRoots(nodes: readonly SvgNode[], dropped: string[]): SvgElementNode[] {
  const roots: SvgElementNode[] = [];
  for (const node of nodes) {
    if (node.type !== 'element') {
      continue;
    }

    if (node.svg && node.name.toLowerCase() === 'svg') {
      roots.push(cleanElement(node, 'svg', dropped));
    } else {
      dropElement(node, dropped);
    }
  }

  return roots;
}

/**
 * Serialises a cleaned node: names as allow-listed, every attribute value double-quoted and every
 * `&`, `<`, `>` and quote escaped, in text as in attributes, and childless elements self-closed.
 *
 * @param node - A node {@link sanitizeSvgTree} kept.
 */
function serializeNode(node: SvgNode): string {
  if (node.type === 'text') {
    return escapeMarkup(node.value);
  }

  const attributes = node.attributes
    .map((attribute) => ` ${attribute.name}="${escapeMarkup(attribute.value)}"`)
    .join('');
  if (node.children.length === 0) {
    return `<${node.name}${attributes} />`;
  }

  return `<${node.name}${attributes}>${node.children.map(serializeNode).join('')}</${node.name}>`;
}

/**
 * Text with the characters that markup or quoting could read escaped.
 *
 * @param text - Any text.
 */
function escapeMarkup(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * An allowed element with its attributes and children cleaned.
 *
 * @param node - The element.
 * @param name - Its canonical name.
 * @param dropped - What was dropped, added to in place.
 */
function cleanElement(node: SvgElementNode, name: string, dropped: string[]): SvgElementNode {
  const attributes = cleanAttributes(name, node.attributes, dropped);
  const children: SvgNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text') {
      children.push(child);
      continue;
    }

    const allowed = child.svg ? ELEMENTS.get(child.name.toLowerCase()) : undefined;
    if (allowed === undefined) {
      dropElement(child, dropped);
    } else {
      children.push(cleanElement(child, allowed, dropped));
    }
  }

  return { type: 'element', name, svg: true, attributes, children };
}

/**
 * Notes an element removed with its content, unless it is editor metadata.
 *
 * @param node - The element.
 * @param dropped - What was dropped, added to in place.
 */
function dropElement(node: SvgElementNode, dropped: string[]): void {
  const lower = node.name.toLowerCase();
  if (SILENT_ELEMENTS.includes(lower) || isEditorName(lower)) {
    return;
  }

  dropped.push(`a <${node.name}> element`);
}

/**
 * Whether a name is in an editor's namespace (`inkscape:label`, `sodipodi:namedview`).
 *
 * @param lower - The name in lowercase.
 */
function isEditorName(lower: string): boolean {
  const colon = lower.indexOf(':');
  return colon > 0 && EDITOR_PREFIXES.includes(lower.slice(0, colon));
}

/**
 * The attributes of an element that are allowed, with canonical names; `style` filtered.
 *
 * @param element - The element's canonical name.
 * @param attributes - The attributes as parsed.
 * @param dropped - What was dropped, added to in place.
 */
function cleanAttributes(
  element: string,
  attributes: readonly SvgAttribute[],
  dropped: string[],
): SvgAttribute[] {
  const kept: SvgAttribute[] = [];
  const seen = new Set<string>();
  for (const { name, value } of attributes) {
    const lower = name.toLowerCase();
    const cleaned = cleanAttribute(element, name, lower, value, dropped);
    if (cleaned !== undefined && !seen.has(cleaned.name)) {
      seen.add(cleaned.name);
      kept.push(cleaned);
    }
  }

  return kept;
}

/**
 * One attribute, cleaned, or `undefined` when it goes.
 *
 * @param element - The element's canonical name.
 * @param name - The attribute's name as parsed.
 * @param lower - The name in lowercase.
 * @param value - Its value.
 * @param dropped - What was dropped, added to in place.
 */
function cleanAttribute(
  element: string,
  name: string,
  lower: string,
  value: string,
  dropped: string[],
): SvgAttribute | undefined {
  if (NAMESPACE_DECLARATION.test(lower) || isEditorName(lower)) {
    return undefined;
  }

  const plain = PLAIN_ATTRIBUTES.get(lower);
  if (plain !== undefined) {
    return { name: plain, value };
  }

  if (SVG_DATA_ATTRIBUTE.test(lower)) {
    return { name: lower, value };
  }

  const url = URL_ATTRIBUTES.get(lower);
  if (url !== undefined) {
    return cleanUrlAttribute(element, url, value, dropped);
  }

  const presentation = PRESENTATION_ATTRIBUTES.get(lower);
  if (presentation !== undefined) {
    const problem = cssValueProblem(value);
    if (problem === undefined) {
      return { name: presentation, value };
    }

    dropped.push(
      problem.url === undefined
        ? `the ${name}="${shorten(value)}" attribute on <${element}>`
        : `the external url(${shorten(problem.url)}) in the ${name} of <${element}>`,
    );
    return undefined;
  }

  if (lower === 'style') {
    const css = cleanStyle(value, `the style of <${element}>`, dropped);
    return css === '' ? undefined : { name: 'style', value: css };
  }

  dropped.push(`the ${name} attribute on <${element}>`);
  return undefined;
}

/**
 * An `href` or `xlink:href`, kept only for a same-document `#fragment`, or a raster `data:` image
 * on `<image>`.
 *
 * @param element - The element's canonical name.
 * @param name - The attribute's canonical name.
 * @param value - Its value.
 * @param dropped - What was dropped, added to in place.
 */
function cleanUrlAttribute(
  element: string,
  name: string,
  value: string,
  dropped: string[],
): SvgAttribute | undefined {
  const trimmed = value.trim();
  if (FRAGMENT.test(trimmed) || (element === 'image' && SVG_RASTER_DATA_URL.test(trimmed))) {
    return { name, value: trimmed };
  }

  dropped.push(
    isScriptUrl(value)
      ? `the ${name}="${shorten(value)}" attribute on <${element}>`
      : `the external ${name}="${shorten(value)}" on <${element}>`,
  );
  return undefined;
}

/**
 * A `style` attribute with only the declarations of allowed properties whose values pass
 * {@link cssValueProblem}, rewritten as `property: value` pairs.
 *
 * @param css - The attribute's value.
 * @param where - Where it sits, for the messages.
 * @param dropped - What was dropped, added to in place.
 */
function cleanStyle(css: string, where: string, dropped: string[]): string {
  const kept: string[] = [];
  for (const declaration of splitDeclarations(css)) {
    const colon = declaration.indexOf(':');
    const property = declaration.slice(0, Math.max(colon, 0)).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (colon <= 0 || !STYLE_PROPERTIES.has(property)) {
      dropped.push(`the declaration "${shorten(declaration.trim())}" in ${where}`);
      continue;
    }

    const problem = cssValueProblem(value);
    if (problem === undefined) {
      kept.push(`${property}: ${value}`);
    } else if (problem.url === undefined) {
      dropped.push(`the declaration "${shorten(declaration.trim())}" in ${where}`);
    } else {
      dropped.push(`the external url(${shorten(problem.url)}) in ${where}`);
    }
  }

  return kept.join('; ');
}

/**
 * The declarations of a `style` attribute: split at `;` outside quotes and parentheses, empty ones
 * left out.
 *
 * @param css - The attribute's value.
 */
function splitDeclarations(css: string): string[] {
  const declarations: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (quote !== undefined) {
      quote = char === quote ? undefined : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth = Math.max(depth - 1, 0);
    } else if (char === ';' && depth === 0) {
      declarations.push(css.slice(start, index));
      start = index + 1;
    }
  }

  declarations.push(css.slice(start));
  return declarations.filter((declaration) => declaration.trim() !== '');
}

/**
 * What is wrong with a CSS value, or `undefined` when it is safe: an escape, comment, at-rule,
 * brace, semicolon or markup character, a function that is not in {@link SVG_CSS_FUNCTIONS}, or a
 * `url()` that does not name a `#fragment` (given back as `url`).
 *
 * @param value - The value.
 */
function cssValueProblem(value: string): { url?: string } | undefined {
  if (UNSAFE_CSS.test(value)) {
    return {};
  }

  for (const match of value.matchAll(CSS_CALL)) {
    const name = (match[1] ?? '').toLowerCase();
    if (name === '') {
      continue;
    }

    if (!CSS_FUNCTIONS.has(name)) {
      return {};
    }

    const call = value.slice(match.index);
    if (name === 'url' && !LOCAL_CSS_URL.test(call)) {
      const end = call.indexOf(')');
      return { url: call.slice(4, end === -1 ? undefined : end).trim() };
    }
  }

  return undefined;
}

/**
 * Whether a value is a `javascript:`, `vbscript:` or `data:` URL, however it is spaced or cased.
 *
 * @param value - An attribute value, entities decoded.
 */
function isScriptUrl(value: string): boolean {
  const compact = value.replace(URL_IGNORED, '').toLowerCase();
  return SCRIPT_SCHEMES.some((scheme) => compact.startsWith(scheme));
}

/**
 * A value cut to a readable length for a message.
 *
 * @param value - Any text.
 */
function shorten(value: string): string {
  return value.length > 60 ? `${value.slice(0, 57)}...` : value;
}

/**
 * The root `<svg>` with a `viewBox` derived from its `width` and `height` when it has none, and
 * without the fixed size, so the drawing scales to the box it is drawn in.
 *
 * @param root - The cleaned root.
 */
function withViewBox(root: SvgElementNode): SvgElementNode {
  if (attributeOf(root, 'viewBox') !== undefined) {
    return root;
  }

  const width = sizeOf(attributeOf(root, 'width'));
  const height = sizeOf(attributeOf(root, 'height'));
  if (width === undefined || height === undefined) {
    return root;
  }

  return {
    ...root,
    attributes: [
      { name: 'viewBox', value: `0 0 ${width} ${height}` },
      ...root.attributes.filter(
        (attribute) => attribute.name !== 'width' && attribute.name !== 'height',
      ),
    ],
  };
}

/**
 * The value of an element's attribute.
 *
 * @param node - The element.
 * @param name - The attribute's name.
 */
function attributeOf(node: SvgElementNode, name: string): string | undefined {
  return node.attributes.find((attribute) => attribute.name === name)?.value;
}

/**
 * A size in user units (`240`, `240px`); `undefined` when it is missing or in a unit that cannot
 * become a viewBox (`%`, `em`).
 *
 * @param value - The attribute's value.
 */
function sizeOf(value: string | undefined): number | undefined {
  const match = value === undefined ? null : USER_UNITS.exec(value);
  const size = match === null ? Number.NaN : Number(match[1]);
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

/**
 * Names keyed by their lowercase form, so a lookup ignores how the parser cased them.
 *
 * @param names - Canonical names.
 */
function canonicalNames(names: readonly string[]): ReadonlyMap<string, string> {
  return new Map(names.map((name) => [name.toLowerCase(), name]));
}
