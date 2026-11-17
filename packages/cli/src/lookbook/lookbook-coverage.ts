import { REQUIRED_SURFACES } from '@deckster/brand';
import { DEFAULT_LAYOUT, DEFAULT_SURFACE, TRANSITION_KINDS } from '@deckster/engine/frontmatter';
import { chartCatalog } from '@deckster/kit/chart-catalog';
import { componentCatalog } from '@deckster/kit/component-catalog';
import { DIAGRAM_CATALOG } from '@deckster/kit/diagram-catalog';
import { createProcessor } from '@mdx-js/mdx';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAst } from 'vite';
import { parse as parseYaml } from 'yaml';

import type { LayoutInfo } from '#layouts/list-layouts.ts';

/**
 * The line that opens and closes an MDX slide's frontmatter block.
 */
const FENCE = '---';

/**
 * A line break, Unix or Windows.
 */
const LINE_BREAK_PATTERN = /\r?\n/;

/**
 * A slide file the build reads: MDX or TSX.
 */
const SLIDE_FILE_PATTERN = /\.(mdx|tsx)$/;

/**
 * A quoted name in a TypeScript union type, such as `'wipe'` in the `<Step>` effect type.
 */
const QUOTED_NAME_PATTERN = /'([a-z]+)'/g;

/**
 * Quotes around a string written as an MDX attribute expression (`effect={'wipe'}`).
 */
const QUOTES_PATTERN = /^['"`]|['"`]$/g;

/**
 * The element whose text is speaker notes: whatever it mentions is not on the slide.
 */
const NOTES_ELEMENT = 'Notes';

/**
 * The element that reveals content at a step, with its `effect` and `focus`.
 */
const STEP_ELEMENT = 'Step';

/**
 * The element that carries content to the neighbouring slide, matched by its `id`.
 */
const MORPH_ELEMENT = 'Morph';

/**
 * The component a fenced code block compiles to.
 */
const CODE_ELEMENT = 'Code';

/**
 * The component a Markdown image alone in its paragraph compiles to.
 */
const IMAGE_ELEMENT = 'Image';

/**
 * The step effect a `<Step>` without `effect` uses, which the component catalog lists as the
 * default of the prop.
 */
const EFFECT_PROP = 'effect';

/**
 * The layout field that reveals a layout's items one per step; the only boolean field the coverage
 * asks for, and only its `true`.
 */
const REVEAL_FIELD = 'reveal';

/**
 * TypeScript wrappers around a literal that change only its type, which the TSX reader looks
 * through as the build does.
 */
const WRAPPER_EXPRESSIONS = new Set([
  'TSSatisfiesExpression',
  'TSAsExpression',
  'ParenthesizedExpression',
]);

/**
 * Everything the kit offers that the lookbook must show at least once, read from the same catalogs
 * the CLI prints, so a layout, chart or component added to the kit later is asked for without
 * editing the test.
 */
export type CoverageCatalog = {
  /**
   * Every layout with its fields, as `deck layouts --json` prints them.
   */
  layouts: readonly LayoutInfo[];

  /**
   * The surfaces every brand has.
   */
  surfaces: readonly string[];

  /**
   * The slide transitions a `transition:` field takes.
   */
  transitions: readonly string[];

  /**
   * The effects a `<Step>` takes, with the default first.
   */
  effects: readonly string[];

  /**
   * The effect a `<Step>` without `effect` uses.
   */
  defaultEffect: string;

  /**
   * The tag of every chart, diagram component and slide component, in catalog order.
   */
  tags: readonly string[];
};

/**
 * What one slide file shows, read without rendering it: its frontmatter, the elements it uses
 * (nothing its speaker notes only mention), its step effects, and its morph ids. A file that cannot
 * be parsed (a slide another author is still writing) is `unreadable` with the parser's message.
 */
export type SlideFacts =
  | {
      /**
       * The file parsed.
       */
      kind: 'read';

      /**
       * The file name inside `slides/`.
       */
      file: string;

      /**
       * The frontmatter as written, before defaults; `{}` when the slide has none.
       */
      frontmatter: Readonly<Record<string, unknown>>;

      /**
       * The element names used on the slide (`<Notes>` itself, but nothing inside it), with a
       * fenced block counted as `Code` and a Markdown image as `Image`.
       */
      tags: ReadonlySet<string>;

      /**
       * The effect of each `<Step>`, the default for a step that names none.
       */
      effects: ReadonlySet<string>;

      /**
       * Whether a `<Step>` sets `focus`.
       */
      focus: boolean;

      /**
       * The ids of its `<Morph>` elements.
       */
      morphs: ReadonlySet<string>;
    }
  | {
      /**
       * The file did not parse.
       */
      kind: 'unreadable';

      /**
       * The file name inside `slides/`.
       */
      file: string;

      /**
       * What the parser said.
       */
      problem: string;
    };

/**
 * A slide that parsed.
 */
type ReadSlide = Extract<SlideFacts, { kind: 'read' }>;

/**
 * A syntax tree node of either parser (mdast for MDX, ESTree for TSX), read structurally.
 */
type TreeNode = {
  /**
   * The node type, such as `mdxJsxFlowElement` or `JSXElement`.
   */
  type: string;
  [key: string]: unknown;
};

/**
 * One element found in a slide's tree: its name and its attributes as plain values (`true` for an
 * attribute written without a value).
 */
type FoundElement = {
  /**
   * The tag name, such as `Step`.
   */
  name: string;

  /**
   * Each attribute whose value is a literal, by name.
   */
  attributes: ReadonlyMap<string, unknown>;
};

/**
 * Collects the kit's catalogs into what the lookbook must cover. The step effects come from the
 * `<Step>` entry of the component catalog (its `effect` type), so a new effect is asked for once
 * the catalog documents it.
 *
 * @param layouts - The layouts the deck can use, from the layout catalog.
 * @returns The catalog to measure the deck against.
 * @throws Error when the component catalog has no `<Step>` or its `effect` prop names no effect,
 *   since the coverage could not ask for any.
 */
export function kitCatalog(layouts: readonly LayoutInfo[]): CoverageCatalog {
  const components = componentCatalog().components;
  const effect = components.find((entry) => entry.name === STEP_ELEMENT)?.props[EFFECT_PROP];
  const effects = [...(effect?.type ?? '').matchAll(QUOTED_NAME_PATTERN)].map((match) => match[1]);
  const defaultEffect = typeof effect?.default === 'string' ? effect.default : effects[0];
  if (defaultEffect === undefined) {
    throw new Error('The component catalog lists no effects for <Step>.');
  }

  return {
    layouts,
    surfaces: REQUIRED_SURFACES,
    transitions: TRANSITION_KINDS,
    effects: effects.filter((name) => name !== undefined),
    defaultEffect,
    tags: [
      ...chartCatalog().charts.map((entry) => entry.name),
      ...DIAGRAM_CATALOG.components.map((entry) => entry.name),
      ...components.map((entry) => entry.name),
    ],
  };
}

/**
 * Reads every MDX and TSX file in a deck's `slides/` folder, listed in the deck config or not, in
 * file name order.
 *
 * @param slidesDir - The absolute path of the folder.
 * @param defaultEffect - The effect a `<Step>` without `effect` uses.
 * @returns One entry per file; a file that does not parse is `unreadable`, never thrown.
 * @throws Error when the folder cannot be read.
 */
export function readSlides(slidesDir: string, defaultEffect: string): SlideFacts[] {
  return readdirSync(slidesDir)
    .filter((name) => SLIDE_FILE_PATTERN.test(name))
    .toSorted()
    .map((name) =>
      readSlide(name, readFileSync(path.join(slidesDir, name), 'utf8'), defaultEffect),
    );
}

/**
 * Reads one slide's source: YAML frontmatter and the MDX tree for an `.mdx` file, the `export const
 * frontmatter` literal and the JSX tree for a `.tsx` file.
 *
 * @param file - The file name, whose extension picks the parser.
 * @param source - The file's text.
 * @param defaultEffect - The effect a `<Step>` without `effect` uses.
 * @returns What the slide shows, or `unreadable` with the parser's message.
 */
export function readSlide(file: string, source: string, defaultEffect: string): SlideFacts {
  try {
    const { frontmatter, elements } = file.endsWith('.tsx') ? readTsx(source) : readMdx(source);
    return { kind: 'read', file, frontmatter, ...summarizeElements(elements, defaultEffect) };
  } catch (error) {
    return {
      kind: 'unreadable',
      file,
      problem: error instanceof Error ? error.message : 'The parser failed without a message.',
    };
  }
}

/**
 * Everything the catalog offers that no slide shows, one readable line each, grouped as the catalog
 * lists them: unreadable files, layouts and their option values, surfaces, transitions, step
 * effects, `focus`, a `<Morph>` pair, then charts, diagram components and slide components. An
 * option value counts when a slide of that layout sets it, or leaves the field out and the value is
 * its default; of a boolean field only `reveal: true` is asked for. A surface counts when a slide
 * sets it or its layout defaults to it.
 *
 * @param catalog - What the kit offers.
 * @param slides - What the deck's slide files show.
 * @returns The gaps; empty when the deck shows everything.
 */
export function coverageGaps(catalog: CoverageCatalog, slides: readonly SlideFacts[]): string[] {
  const read = slides.filter((slide): slide is ReadSlide => slide.kind === 'read');
  return [
    ...slides.flatMap((slide) =>
      slide.kind === 'unreadable' ? [`slides/${slide.file} cannot be read: ${slide.problem}`] : [],
    ),
    ...catalog.layouts.flatMap((layout) => layoutGaps(layout, slidesOf(layout.name, read))),
    ...surfaceGaps(catalog, read),
    ...missing(catalog.transitions, (kind) =>
      read.some((slide) => slide.frontmatter['transition'] === kind),
    ).map((kind) => `transition: ${kind}`),
    ...missing(catalog.effects, (effect) => read.some((slide) => slide.effects.has(effect))).map(
      (effect) => `<Step effect="${effect}">`,
    ),
    ...(read.some((slide) => slide.focus) ? [] : ['<Step focus>']),
    ...(hasMorphPair(read) ? [] : ['a <Morph> pair (one id on two slides)']),
    ...missing(catalog.tags, (tag) => read.some((slide) => slide.tags.has(tag))).map(
      (tag) => `<${tag}>`,
    ),
  ];
}

/**
 * The slides of one layout; a slide that names none uses the default layout.
 *
 * @param name - The layout name.
 * @param slides - The slides that parsed.
 */
function slidesOf(name: string, slides: readonly ReadSlide[]): ReadSlide[] {
  return slides.filter((slide) => layoutName(slide) === name);
}

/**
 * The layout a slide names, or the default layout.
 *
 * @param slide - A slide that parsed.
 */
function layoutName(slide: ReadSlide): string {
  const layout = slide.frontmatter['layout'];
  return typeof layout === 'string' ? layout : DEFAULT_LAYOUT;
}

/**
 * What one layout lacks: any slide at all, then each string value of each choice field, then
 * `reveal: true` when it has `reveal`. A layout no slide uses lacks all of them, so the list shows
 * the whole of what its slides must cover from the start.
 *
 * @param layout - The layout.
 * @param slides - The slides that use it.
 */
function layoutGaps(layout: LayoutInfo, slides: readonly ReadSlide[]): string[] {
  const unused = slides.length === 0 ? [`layout: ${layout.name}`] : [];
  const options = Object.entries(layout.fields).flatMap(([field, info]) => {
    const values = (info.allowed ?? []).filter((value) => typeof value === 'string');
    const wanted = field === REVEAL_FIELD ? [...values, true] : values;
    return missing(wanted, (value) =>
      slides.some((slide) => {
        const set = slide.frontmatter[field];
        return set === value || (set === undefined && info.default === value);
      }),
    ).map((value) => `layout ${layout.name}, ${field}: ${String(value)}`);
  });
  return [...unused, ...options];
}

/**
 * The surfaces no slide is drawn on, counting a layout's default surface for a slide that names
 * none.
 *
 * @param catalog - What the kit offers.
 * @param slides - The slides that parsed.
 */
function surfaceGaps(catalog: CoverageCatalog, slides: readonly ReadSlide[]): string[] {
  const defaults = new Map(catalog.layouts.map((layout) => [layout.name, layout.surface]));
  const drawn = new Set(
    slides.map((slide) => {
      const surface = slide.frontmatter['surface'];
      return typeof surface === 'string'
        ? surface
        : (defaults.get(layoutName(slide)) ?? DEFAULT_SURFACE);
    }),
  );
  return missing(catalog.surfaces, (surface) => drawn.has(surface)).map(
    (surface) => `surface: ${surface}`,
  );
}

/**
 * Whether one `<Morph>` id appears on two slides or more.
 *
 * @param slides - The slides that parsed.
 */
function hasMorphPair(slides: readonly ReadSlide[]): boolean {
  const seen = new Set<string>();
  for (const slide of slides) {
    for (const id of slide.morphs) {
      if (seen.has(id)) {
        return true;
      }

      seen.add(id);
    }
  }

  return false;
}

/**
 * The items no slide shows.
 *
 * @param items - What is asked for.
 * @param shown - Whether the deck shows one.
 */
function missing<Item>(items: readonly Item[], shown: (item: Item) => boolean): Item[] {
  return items.filter((item) => !shown(item));
}

/**
 * The element facts the coverage reads: tags, step effects, `focus` and morph ids.
 *
 * @param elements - Every element on the slide, none from inside `<Notes>`.
 * @param defaultEffect - The effect of a `<Step>` that names none.
 */
function summarizeElements(
  elements: readonly FoundElement[],
  defaultEffect: string,
): Pick<ReadSlide, 'tags' | 'effects' | 'focus' | 'morphs'> {
  const steps = elements.filter((element) => element.name === STEP_ELEMENT);
  const morphs = elements.filter((element) => element.name === MORPH_ELEMENT);
  return {
    tags: new Set(elements.map((element) => element.name)),
    effects: new Set(steps.map((step) => textAttribute(step, EFFECT_PROP) ?? defaultEffect)),
    focus: steps.some((step) => step.attributes.get('focus') === true),
    morphs: new Set(morphs.flatMap((morph) => textAttribute(morph, 'id') ?? [])),
  };
}

/**
 * An attribute written as a string, or `undefined` when it is missing or not a string.
 *
 * @param element - The element.
 * @param name - The attribute name.
 */
function textAttribute(element: FoundElement, name: string): string | undefined {
  const value = element.attributes.get(name);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Reads an MDX slide: the YAML between the `---` lines (parsed with the same `yaml` package the
 * build uses) and the elements of the MDX tree after it.
 *
 * @param source - The file's text.
 * @throws Error for an unclosed frontmatter block, invalid YAML or MDX that does not parse.
 */
function readMdx(source: string): {
  frontmatter: Record<string, unknown>;
  elements: FoundElement[];
} {
  const lines = source.split(LINE_BREAK_PATTERN);
  const hasFrontmatter = lines[0]?.trim() === FENCE;
  const end = hasFrontmatter
    ? lines.findIndex((line, index) => index > 0 && line.trim() === FENCE)
    : 0;
  if (end === -1) {
    throw new Error('The frontmatter opened with --- on line 1 is never closed.');
  }

  const data: unknown = hasFrontmatter ? parseYaml(lines.slice(1, end).join('\n')) : {};
  const body = lines.slice(hasFrontmatter ? end + 1 : 0).join('\n');
  const tree: unknown = createProcessor().parse(body);
  return { frontmatter: asRecord(data), elements: collectElements(tree, mdxElement) };
}

/**
 * Reads a TSX slide: the `export const frontmatter` object literal and the JSX elements.
 *
 * @param source - The file's text.
 * @throws Error for code that does not parse.
 */
function readTsx(source: string): {
  frontmatter: Record<string, unknown>;
  elements: FoundElement[];
} {
  // The build reads TSX slides with this parser (see the vite plugin's tsx-meta), so the
  // coverage reads the same tree.
  // oxlint-disable-next-line typescript/no-deprecated
  const program: unknown = parseAst(source, { lang: 'tsx' });
  let frontmatter: Record<string, unknown> = {};
  visit(program, (node) => {
    const literal = frontmatterLiteral(node);
    if (literal !== undefined) {
      frontmatter = asRecord(literalValue(literal));
    }

    return true;
  });
  return { frontmatter, elements: collectElements(program, jsxElement) };
}

/**
 * Every element in a tree; `<Notes>` itself counts, but nothing inside it, since the notes only
 * mention what the slide shows.
 *
 * @param tree - The root node.
 * @param element - Reads a node as an element, or `undefined` when it is not one.
 */
function collectElements(
  tree: unknown,
  element: (node: TreeNode) => FoundElement | undefined,
): FoundElement[] {
  const found: FoundElement[] = [];
  visit(tree, (node) => {
    const current = element(node);
    if (current !== undefined) {
      found.push(current);
    }

    return current?.name !== NOTES_ELEMENT;
  });
  return found;
}

/**
 * Walks a tree depth first, calling `enter` on every node; `enter` returns `false` to skip the
 * node's children.
 *
 * @param value - A node, a list of nodes, or any other value (ignored).
 * @param enter - Called for each node.
 */
function visit(value: unknown, enter: (node: TreeNode) => boolean): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, enter);
    }

    return;
  }

  if (!isNode(value) || !enter(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key !== 'position' && typeof child === 'object' && child !== null) {
      visit(child, enter);
    }
  }
}

/**
 * Reads an mdast node as an element: an MDX JSX element, a fenced code block (`Code`) or a Markdown
 * image (`Image`).
 *
 * @param node - An mdast node.
 */
function mdxElement(node: TreeNode): FoundElement | undefined {
  if (node.type === 'code') {
    return { name: CODE_ELEMENT, attributes: new Map() };
  }

  if (node.type === 'image') {
    return { name: IMAGE_ELEMENT, attributes: new Map() };
  }

  const isElement = node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
  if (!isElement || typeof node['name'] !== 'string') {
    return undefined;
  }

  const attributes = new Map<string, unknown>();
  for (const attribute of asNodes(node['attributes'])) {
    if (attribute.type === 'mdxJsxAttribute' && typeof attribute['name'] === 'string') {
      attributes.set(attribute['name'], mdxAttributeValue(attribute['value']));
    }
  }

  return { name: node['name'], attributes };
}

/**
 * An MDX attribute's value: a string as written, `true` for a bare attribute, and a written
 * expression as its literal text without quotes (`{'wipe'}` is `wipe`, `{true}` is `true`).
 *
 * @param value - The attribute's mdast value.
 */
function mdxAttributeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value;
  }

  const expression =
    isNode(value) && typeof value['value'] === 'string' ? value['value'].trim() : '';
  if (expression === 'true' || expression === 'false') {
    return expression === 'true';
  }

  return expression.replaceAll(QUOTES_PATTERN, '');
}

/**
 * Reads an ESTree node as an element when it is a JSX element with a plain name.
 *
 * @param node - An ESTree node.
 */
function jsxElement(node: TreeNode): FoundElement | undefined {
  const opening =
    node.type === 'JSXElement' && isNode(node['openingElement'])
      ? node['openingElement']
      : undefined;
  const name = isNode(opening?.['name']) ? opening['name']['name'] : undefined;
  if (opening === undefined || typeof name !== 'string') {
    return undefined;
  }

  const attributes = new Map<string, unknown>();
  for (const attribute of asNodes(opening['attributes'])) {
    const key = isNode(attribute['name']) ? attribute['name']['name'] : undefined;
    if (attribute.type === 'JSXAttribute' && typeof key === 'string') {
      attributes.set(key, jsxAttributeValue(attribute['value']));
    }
  }

  return { name, attributes };
}

/**
 * A JSX attribute's value: `true` when written bare, a literal's value, and `undefined` for any
 * other expression.
 *
 * @param value - The attribute's ESTree value.
 */
function jsxAttributeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return true;
  }

  const expression =
    isNode(value) && value.type === 'JSXExpressionContainer' ? value['expression'] : value;
  return isNode(expression) && expression.type === 'Literal' ? expression['value'] : undefined;
}

/**
 * The object literal of `export const frontmatter = { ... }`, looking through `satisfies` and `as`,
 * or `undefined` when the node is not that export.
 *
 * @param node - An ESTree node.
 */
function frontmatterLiteral(node: TreeNode): TreeNode | undefined {
  const declaration = node.type === 'ExportNamedDeclaration' ? node['declaration'] : undefined;
  if (!isNode(declaration) || declaration.type !== 'VariableDeclaration') {
    return undefined;
  }

  for (const declarator of asNodes(declaration['declarations'])) {
    const id = declarator['id'];
    if (isNode(id) && id['name'] === 'frontmatter' && isNode(declarator['init'])) {
      return unwrap(declarator['init']);
    }
  }

  return undefined;
}

/**
 * The expression inside type-only wrappers such as `satisfies`.
 *
 * @param node - An expression.
 */
function unwrap(node: TreeNode): TreeNode {
  const inner = node['expression'];
  return WRAPPER_EXPRESSIONS.has(node.type) && isNode(inner) ? unwrap(inner) : node;
}

/**
 * The value of a literal expression: objects, arrays, strings, numbers, booleans, `null`, negative
 * numbers and template strings without expressions; anything else is `undefined`.
 *
 * @param node - An ESTree expression.
 */
function literalValue(node: TreeNode): unknown {
  switch (node.type) {
    case 'Literal': {
      return node['value'];
    }

    case 'ArrayExpression': {
      return asNodes(node['elements']).map((element) => literalValue(unwrap(element)));
    }

    case 'ObjectExpression': {
      return Object.fromEntries(asNodes(node['properties']).flatMap(propertyEntry));
    }

    case 'UnaryExpression': {
      const argument = isNode(node['argument']) ? literalValue(node['argument']) : undefined;
      return node['operator'] === '-' && typeof argument === 'number' ? -argument : undefined;
    }

    case 'TemplateLiteral': {
      const quasis = asNodes(node['quasis']);
      const cooked = isNode(quasis[0]?.['value']) ? quasis[0]['value']['cooked'] : undefined;
      return quasis.length === 1 ? cooked : undefined;
    }

    default: {
      return WRAPPER_EXPRESSIONS.has(node.type) ? literalValue(unwrap(node)) : undefined;
    }
  }
}

/**
 * One property of an object literal as a `[key, value]` entry, or none for a spread or a computed
 * key.
 *
 * @param property - An ESTree property.
 */
function propertyEntry(property: TreeNode): [string, unknown][] {
  const key = isNode(property['key'])
    ? (property['key']['name'] ?? property['key']['value'])
    : undefined;
  const value = property['value'];
  if (property.type !== 'Property' || typeof key !== 'string' || !isNode(value)) {
    return [];
  }

  return [[key, literalValue(unwrap(value))]];
}

/**
 * A parsed value as a record of fields, or `{}` when it is not an object.
 *
 * @param value - Parsed frontmatter.
 */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/**
 * The nodes in a list, skipping holes and anything that is not a node.
 *
 * @param value - A list from a tree, or anything else (read as empty).
 */
function asNodes(value: unknown): TreeNode[] {
  return Array.isArray(value) ? value.filter(isNode) : [];
}

/**
 * Whether a value is a syntax tree node: an object with a string `type`.
 *
 * @param value - Any value.
 */
function isNode(value: unknown): value is TreeNode {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  );
}
