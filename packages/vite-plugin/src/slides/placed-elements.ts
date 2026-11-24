import type { LayoutBox, SpacingTokens } from '@deckster/brand';
import type {
  PlacedKind,
  PlacedMeta,
  PlacedName,
  PlacedWidth,
  PlacedZone,
} from '@deckster/engine/manifest';
import type { PlacedInput, ShapeGeometry } from '@deckster/kit/place-resolve';

import { contrastRatio, parseColorLiteral, ROLE_NAMES, TEXT_CONTRAST } from '@deckster/brand';
import {
  isSquareShape,
  PLACED_NAMES,
  PLACED_SIZE_WORDS,
  PLACED_ZONES,
  SHAPE_GEOMETRIES,
  validatePlacementInput,
} from '@deckster/kit/place-resolve';
import { Predicate } from 'effect';

import type { SlideBrand } from '#slides/check-surface.ts';

/**
 * Fallback brand spacing used when compiling a slide in isolation without brand tokens (for example
 * in unit tests). Matches the default brand's 12x6 grid and spacing scale.
 */
export const DEFAULT_PLACED_SPACING: SpacingTokens = {
  /**
   * Default brand spacing scale in canvas pixels.
   */
  scale: { '2xs': 4, xs: 8, sm: 16, md: 24, lg: 32, xl: 48, '2xl': 64, '3xl': 96 },

  /**
   * Default slide margins in canvas pixels.
   */
  margin: { x: 80, y: 64 },

  /**
   * Default 12-column by 6-row grid with 32px gutters.
   */
  grid: { columns: 12, rows: 6, gutter: 32 },
};

/**
 * The mdast node types of JSX elements, in a block of their own or inside a paragraph.
 */
const JSX_ELEMENT_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

/**
 * The mdast node type of a JSX element in a block of its own.
 */
const FLOW_ELEMENT_TYPE = 'mdxJsxFlowElement';

/**
 * The mdast node type of an `import` or `export` block.
 */
const ESM_TYPE = 'mdxjsEsm';

/**
 * Speaker notes element; its subtree is never inspected for placed elements.
 */
const NOTES_ELEMENT = 'Notes';

/**
 * Step reveal element; a top-level `<Step>` containing only placed elements is unwrapped.
 */
const STEP_ELEMENT = 'Step';

/**
 * Attributes copied from an unwrapped top-level `<Step>` onto its child placed elements when absent
 * on the child.
 */
const STEP_COPY_ATTRIBUTES = ['at', 'effect'] as const;

/**
 * Placed-capable kit tag names mapped to their {@link PlacedKind}.
 */
const PLACED_TAG_KINDS: Readonly<Record<string, PlacedKind>> = {
  /**
   * Unstyled placement wrapper.
   */
  Place: 'place',

  /**
   * Geometric shape container.
   */
  Shape: 'shape',

  /**
   * Unboxed floating text block.
   */
  Text: 'text',
};

/**
 * Primary placement attributes that establish a placement mode (`place`, `cols`/`rows`, or `box`).
 */
const PRIMARY_PLACEMENT_ATTRS = new Set(['place', 'cols', 'rows', 'box']);

/**
 * Attributes that indicate placement intent on `<Shape>` and `<Text>`, including modifiers.
 */
const PLACEMENT_DETECTION_ATTRS = new Set(['place', 'cols', 'rows', 'box', 'zone', 'inset']);

/**
 * All placement-related attributes that must be static literals in MDX.
 */
const LITERAL_PLACEMENT_ATTRS = [
  'place',
  'cols',
  'rows',
  'box',
  'zone',
  'width',
  'height',
  'inset',
  'name',
  'shape',
] as const;

/**
 * Sentinel returned when an attribute expression cannot be evaluated statically as a literal.
 */
const NON_LITERAL = Symbol('non-literal');

/**
 * Allowed brand color role names, for checking `<Shape fill="...">` contrast.
 */
const ROLE_SET: ReadonlySet<string> = new Set(ROLE_NAMES);

/**
 * Allowed `<Shape>` geometry names.
 */
const SHAPE_GEOMETRY_SET: ReadonlySet<string> = new Set(SHAPE_GEOMETRIES);

/**
 * A JSX attribute node on an mdast JSX element.
 */
export type MdxJsxAttribute = {
  /**
   * `mdxJsxAttribute` for a named attribute, or `mdxJsxExpressionAttribute` for a spread.
   */
  type: string;

  /**
   * The attribute name, when named.
   */
  name?: string;

  /**
   * A string literal, `null` for a bare attribute, or an expression container.
   */
  value?: unknown;
};

/**
 * The parts of an mdast node that slide compilation reads and rewrites.
 */
export type SlideMdastNode = {
  /**
   * The node type, such as `heading` or `mdxJsxFlowElement`.
   */
  type: string;

  /**
   * The element name of a JSX node, such as `Shape`; `null` for a fragment.
   */
  name?: string | null;

  /**
   * The attributes of a JSX node.
   */
  attributes?: unknown[];

  /**
   * The text of a text or inline code node.
   */
  value?: unknown;

  /**
   * The child nodes, in source order.
   */
  children?: SlideMdastNode[];

  /**
   * Extra data; for an ESM or expression node, its program as `estree`.
   */
  data?: { estree?: { body?: unknown[] } };

  /**
   * Where the node is in the source: 1-based lines, columns and offsets in UTF-16 code units, when
   * known.
   */
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
};

/**
 * Options passed to {@link PlacedRemarkFile.fail}.
 */
export type PlacedFailOptions = {
  /**
   * Source span of the offending node.
   */
  place?: SlideMdastNode['position'];

  /**
   * Diagnostic rule identifier.
   */
  ruleId?: string;

  /**
   * Diagnostic origin (`deck` so `compileMdx` uses the attached fix).
   */
  source?: string;
};

/**
 * The subset of a VFile needed to fail the MDX build with a `deck` error and fix.
 */
export type PlacedRemarkFile = {
  /**
   * Throws a VFileMessage bound to a node's source position.
   */
  fail: (reason: string, options?: PlacedFailOptions) => never;
};

/**
 * Context passed into {@link extractPlacedElements} for grid validation and shape contrast checks.
 */
export type ExtractPlacedOptions = {
  /**
   * The slide's validated frontmatter, used to read the active `surface`.
   */
  frontmatter?: Readonly<Record<string, unknown>>;

  /**
   * The deck's brand, providing spacing tokens and per-surface role colors when available.
   */
  brand?: SlideBrand;
};

/**
 * The top-level placed elements lifted from an MDX slide and their compile-time metadata.
 */
export type ExtractedPlaced = {
  /**
   * The lifted mdast nodes, in source order, to route into `<DeckSlot name="__placed">`.
   */
  nodes: SlideMdastNode[];

  /**
   * The extracted {@link PlacedMeta} records, in source order, for `slideMeta.placed`.
   */
  placed: PlacedMeta[];
};

/**
 * Unwraps top-level `<Step>` containers around placed elements, rejects nested placement, validates
 * every top-level placed element's literal props, grid bounds and `<Shape>` fill contrast, and
 * returns the lifted nodes alongside their {@link PlacedMeta} entries.
 *
 * @param tree - The mdast root, modified in place when top-level `<Step>` wrappers are unwrapped.
 * @param file - The VFile used to fail the build with `source: 'deck'` and actionable fixes.
 * @param options - Validated frontmatter and brand tokens.
 */
export function extractPlacedElements(
  tree: SlideMdastNode,
  file: PlacedRemarkFile,
  options: ExtractPlacedOptions,
): ExtractedPlaced {
  const imported = importedNames(tree);
  unwrapPlacedSteps(tree, imported);

  const spacing = options.brand?.spacing ?? DEFAULT_PLACED_SPACING;
  const activeSurface =
    typeof options.frontmatter?.['surface'] === 'string'
      ? options.frontmatter['surface']
      : 'default';
  const surfaceColors = options.brand?.surfaceColors?.[activeSurface];

  const nodes: SlideMdastNode[] = [];
  const placed: PlacedMeta[] = [];

  for (const child of tree.children ?? []) {
    if (child.type === ESM_TYPE || isNotes(child)) {
      continue;
    }

    if (child.type === FLOW_ELEMENT_TYPE && isPlacedElement(child, imported)) {
      assertNoNestedPlaced(child.children ?? [], imported, file);
      const meta = validateAndReadPlaced(child, spacing, surfaceColors, file);
      nodes.push(child);
      placed.push(meta);
    } else {
      assertNoNestedPlaced([child], imported, file);
    }
  }

  return { nodes, placed };
}

/**
 * Unwraps any top-level `<Step>` whose non-whitespace children are exclusively placed elements,
 * copying `at` and `effect` onto each child that does not already define them. `<Step>` elements
 * wrapping non-placed or mixed content are left untouched.
 *
 * @param tree - The mdast root, modified in place.
 * @param imported - Local names shadowed by `import` declarations.
 */
function unwrapPlacedSteps(tree: SlideMdastNode, imported: ReadonlySet<string>): void {
  if (imported.has(STEP_ELEMENT) || tree.children === undefined) {
    return;
  }

  const nextChildren: SlideMdastNode[] = [];
  for (const child of tree.children) {
    if (child.type === FLOW_ELEMENT_TYPE && child.name === STEP_ELEMENT) {
      const placedChildren = onlyPlacedChildren(child, imported);
      if (placedChildren !== undefined) {
        const stepAttrs = stepAttributesToCopy(child);
        for (const placedChild of placedChildren) {
          placedChild.type = FLOW_ELEMENT_TYPE;
          copyMissingAttributes(placedChild, stepAttrs);
          nextChildren.push(placedChild);
        }

        continue;
      }
    }

    nextChildren.push(child);
  }

  tree.children = nextChildren;
}

/**
 * Returns the placed element children of a `<Step>` when it contains at least one placed element
 * and no other significant content; returns `undefined` otherwise. Handles single-line `<Step>`
 * forms where MDX wraps inline JSX elements inside a `paragraph`.
 *
 * @param step - A top-level `<Step>` node.
 * @param imported - Shadowed import names.
 */
function onlyPlacedChildren(
  step: SlideMdastNode,
  imported: ReadonlySet<string>,
): SlideMdastNode[] | undefined {
  const result: SlideMdastNode[] = [];
  for (const child of step.children ?? []) {
    if (isIgnorableWhitespace(child)) {
      continue;
    }

    if (child.type === 'paragraph') {
      const inner = onlyPlacedChildren(child, imported);
      if (inner === undefined) {
        return undefined;
      }

      result.push(...inner);
      continue;
    }

    if (isPlacedElement(child, imported)) {
      result.push(child);
      continue;
    }

    return undefined;
  }

  return result.length > 0 ? result : undefined;
}

/**
 * Whether a node is whitespace-only text that carries no slide content.
 *
 * @param node - Any mdast node.
 */
function isIgnorableWhitespace(node: SlideMdastNode): boolean {
  return node.type === 'text' && typeof node.value === 'string' && node.value.trim() === '';
}

/**
 * Extracts `at` and `effect` attributes from a `<Step>` node to copy onto unwrapped children.
 *
 * @param step - The `<Step>` node.
 */
function stepAttributesToCopy(step: SlideMdastNode): MdxJsxAttribute[] {
  const attributes: MdxJsxAttribute[] = [];
  for (const name of STEP_COPY_ATTRIBUTES) {
    const attr = findAttribute(step, name);
    if (attr !== undefined) {
      attributes.push(attr);
    }
  }

  return attributes;
}

/**
 * Copies attributes onto a JSX node without overwriting attributes the node already specifies.
 *
 * @param target - The unwrapped placed element.
 * @param attrs - Attributes inherited from the enclosing `<Step>`.
 */
function copyMissingAttributes(target: SlideMdastNode, attrs: readonly MdxJsxAttribute[]): void {
  if (attrs.length === 0) {
    return;
  }

  target.attributes ??= [];
  for (const attr of attrs) {
    if (attr.name !== undefined && findAttribute(target, attr.name) === undefined) {
      target.attributes.push({ ...attr });
    }
  }
}

/**
 * Walks a list of nested subtrees and fails the build if any placed element appears inside them.
 * `<Notes>` subtrees are skipped.
 *
 * @param nodes - Subtree roots to walk.
 * @param imported - Shadowed import names.
 * @param file - The VFile to report failures on.
 */
function assertNoNestedPlaced(
  nodes: readonly SlideMdastNode[],
  imported: ReadonlySet<string>,
  file: PlacedRemarkFile,
): void {
  for (const node of nodes) {
    if (isNotes(node)) {
      continue;
    }

    if (isPlacedElement(node, imported)) {
      const tag = node.name ?? 'Place';
      failPlaced(
        file,
        node,
        `<${tag}> cannot be placed inside another element.`,
        `Move <${tag}> to the top level of the slide; placement is relative to the slide canvas.`,
      );
    }

    if (node.children !== undefined && node.children.length > 0) {
      assertNoNestedPlaced(node.children, imported, file);
    }
  }
}

/**
 * Validates all placement props and (for `<Shape>`) fill contrast on a top-level placed element and
 * returns its {@link PlacedMeta}.
 *
 * @param node - A top-level placed element.
 * @param spacing - Brand spacing tokens for grid and inset validation.
 * @param surfaceColors - Resolved role hex colors for the slide's active surface, if available.
 * @param file - The VFile to report failures on.
 */
function validateAndReadPlaced(
  node: SlideMdastNode,
  spacing: SpacingTokens,
  surfaceColors: Readonly<Record<string, string>> | undefined,
  file: PlacedRemarkFile,
): PlacedMeta {
  const tag = node.name ?? 'Place';
  const kind: PlacedKind = PLACED_TAG_KINDS[tag] ?? 'place';

  if (!hasAnyNamedAttribute(node, PRIMARY_PLACEMENT_ATTRS)) {
    const reason =
      tag === 'Place'
        ? '<Place> requires a placement prop.'
        : `<${tag}> uses placement modifiers without a placement prop.`;
    failPlaced(
      file,
      node,
      reason,
      `Add place="top-right", cols/rows, or box={[x, y, w, h]} to <${tag}>.`,
    );
  }

  const literals: Partial<Record<(typeof LITERAL_PLACEMENT_ATTRS)[number], unknown>> = {};
  for (const propName of LITERAL_PLACEMENT_ATTRS) {
    const attr = findAttribute(node, propName);
    if (attr === undefined) {
      continue;
    }

    const value = readAttributeLiteral(attr);
    if (value === NON_LITERAL) {
      failPlaced(
        file,
        node,
        `<${tag}> prop "${propName}" must be a static literal in MDX.`,
        'Write placement props as literals in MDX, or use a TSX slide.',
      );
    }

    literals[propName] = value;
  }

  const place = readStringProp(literals.place, 'place', tag, PLACED_NAMES.join(', '), node, file);
  const cols = readRangeProp(literals.cols, 'cols', tag, spacing.grid.columns, node, file);
  const rows = readRangeProp(literals.rows, 'rows', tag, spacing.grid.rows, node, file);
  const zone = readStringProp(literals.zone, 'zone', tag, PLACED_ZONES.join(', '), node, file);
  const inset = readStringProp(literals.inset, 'inset', tag, 'a brand spacing token', node, file);
  const name = readNameProp(literals.name, tag, node, file);
  const width = readWidthProp(literals.width, tag, spacing.grid.columns, node, file);
  const height = readHeightProp(literals.height, tag, spacing.grid.rows, node, file);
  const box = readBoxProp(literals.box, tag, node, file);
  const shape = kind === 'shape' ? readShapeProp(literals.shape, node, file) : undefined;
  const aspect: 'square' | undefined =
    kind === 'shape' && isSquareShape(shape) ? 'square' : undefined;

  const input: PlacedInput = {
    place: place as PlacedName | undefined,
    cols,
    rows,
    box,
    zone: zone as PlacedZone | undefined,
    width,
    height,
    inset,
    aspect,
  };
  const problems = validatePlacementInput(input, spacing);
  const firstProblem = problems[0];
  if (firstProblem !== undefined) {
    failPlaced(file, node, `<${tag}>: ${firstProblem.message}`, firstProblem.fix);
  }

  if (kind === 'shape') {
    checkShapeFillContrast(node, surfaceColors, file);
  }

  return {
    kind,
    ...(name === undefined ? {} : { name }),
    ...(place === undefined ? {} : { place: place as PlacedName }),
    ...(cols === undefined ? {} : { cols }),
    ...(rows === undefined ? {} : { rows }),
    ...(box === undefined ? {} : { box }),
    ...(zone === undefined ? {} : { zone: zone as PlacedZone }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(inset === undefined ? {} : { inset }),
    ...(aspect === undefined ? {} : { aspect }),
  };
}

/**
 * Checks text contrast on a `<Shape>` that uses a brand role `fill` without a `surface` override.
 * Fails the build when the contrast between `color` (defaulting to `fg`) and `fill` is below
 * {@link TEXT_CONTRAST}.
 *
 * @param node - The `<Shape>` node.
 * @param surfaceColors - Role hex colors of the slide's active surface, when available.
 * @param file - The VFile to report failures on.
 */
function checkShapeFillContrast(
  node: SlideMdastNode,
  surfaceColors: Readonly<Record<string, string>> | undefined,
  file: PlacedRemarkFile,
): void {
  if (surfaceColors === undefined || findAttribute(node, 'surface') !== undefined) {
    return;
  }

  const fillAttr = findAttribute(node, 'fill');
  if (fillAttr === undefined) {
    return;
  }

  const fill = readAttributeLiteral(fillAttr);
  if (typeof fill !== 'string' || fill === 'none' || !ROLE_SET.has(fill)) {
    return;
  }

  const colorAttr = findAttribute(node, 'color');
  const rawColor = colorAttr === undefined ? undefined : readAttributeLiteral(colorAttr);
  const fgRole = typeof rawColor === 'string' && ROLE_SET.has(rawColor) ? rawColor : 'fg';

  const bgHex = surfaceColors[fill];
  const fgHex = surfaceColors[fgRole];
  if (bgHex === undefined || fgHex === undefined) {
    return;
  }

  const bgColor = parseColorLiteral(bgHex);
  const fgColor = parseColorLiteral(fgHex);
  if (bgColor === undefined || fgColor === undefined) {
    return;
  }

  const ratio = contrastRatio(fgColor, bgColor);
  if (ratio < TEXT_CONTRAST) {
    failPlaced(
      file,
      node,
      `<Shape> text role "${fgRole}" (${fgHex}) on fill="${fill}" (${bgHex}) has contrast ` +
        `${ratio.toFixed(2)}:1; text needs ${TEXT_CONTRAST}:1.`,
      `Use surface="accent" (or a contrasting color role) so text on fill="${fill}" meets ` +
        `${TEXT_CONTRAST}:1 contrast.`,
    );
  }
}

/**
 * Validates that an optional string placement prop (`place`, `zone`, `inset`) is a string literal.
 *
 * @param value - The static attribute value.
 * @param propName - Attribute name.
 * @param tag - Element tag name.
 * @param allowed - Description of allowed values for the fix.
 * @param node - The JSX element node.
 * @param file - The VFile to report failures on.
 */
function readStringProp(
  value: unknown,
  propName: string,
  tag: string,
  allowed: string,
  node: SlideMdastNode,
  file: PlacedRemarkFile,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    failPlaced(
      file,
      node,
      `<${tag}> prop "${propName}" must be a string.`,
      `Use one of: ${allowed}.`,
    );
  }

  return value;
}

/**
 * Validates that an optional `cols` or `rows` prop is a string literal.
 *
 * @param value - The static attribute value.
 * @param propName - `cols` or `rows`.
 * @param tag - Element tag name.
 * @param max - Grid track count for the fix message.
 * @param node - The JSX element node.
 * @param file - The VFile to report failures on.
 */
function readRangeProp(
  value: unknown,
  propName: 'cols' | 'rows',
  tag: string,
  max: number,
  node: SlideMdastNode,
  file: PlacedRemarkFile,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    const example = propName === 'cols' ? '"9-12"' : '"1-2"';
    failPlaced(
      file,
      node,
      `<${tag}> prop "${propName}" must be a string range.`,
      `Use a 1-based range within 1–${max}, such as ${example}.`,
    );
  }

  return value;
}

/**
 * Validates that an optional `name` prop is a string literal.
 *
 * @param value - The static attribute value.
 * @param tag - Element tag name.
 * @param node - The JSX element node.
 * @param file - The VFile to report failures on.
 */
function readNameProp(
  value: unknown,
  tag: string,
  node: SlideMdastNode,
  file: PlacedRemarkFile,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    failPlaced(
      file,
      node,
      `<${tag}> prop "name" must be a string.`,
      'Write name as a string literal, such as name="Callout 1".',
    );
  }

  return value;
}

/**
 * Validates that an optional `width` prop is a number or size word string literal.
 *
 * @param value - The static attribute value.
 * @param tag - Element tag name.
 * @param maxColumns - Maximum grid columns.
 * @param node - The JSX element node.
 * @param file - The VFile to report failures on.
 */
function readWidthProp(
  value: unknown,
  tag: string,
  maxColumns: number,
  node: SlideMdastNode,
  file: PlacedRemarkFile,
): PlacedWidth | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return value as PlacedWidth;
  }

  failPlaced(
    file,
    node,
    `<${tag}> prop "width" must be a column count or size word.`,
    `Use a number (1–${maxColumns}) or one of: ${Object.keys(PLACED_SIZE_WORDS).join(', ')}.`,
  );
}

/**
 * Validates that an optional `height` prop is a number literal.
 *
 * @param value - The static attribute value.
 * @param tag - Element tag name.
 * @param maxRows - Maximum grid rows.
 * @param node - The JSX element node.
 * @param file - The VFile to report failures on.
 */
function readHeightProp(
  value: unknown,
  tag: string,
  maxRows: number,
  node: SlideMdastNode,
  file: PlacedRemarkFile,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number') {
    failPlaced(
      file,
      node,
      `<${tag}> prop "height" must be a number of grid rows.`,
      `Use a number greater than 0 and at most ${maxRows}.`,
    );
  }

  return value;
}

/**
 * Validates that an optional `box` prop is a 4-number tuple `[x, y, width, height]` of finite
 * numbers.
 *
 * @param value - The static attribute value.
 * @param tag - Element tag name.
 * @param node - The JSX element node.
 * @param file - The VFile to report failures on.
 */
function readBoxProp(
  value: unknown,
  tag: string,
  node: SlideMdastNode,
  file: PlacedRemarkFile,
): LayoutBox | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    failPlaced(
      file,
      node,
      `<${tag}>: Expected \`box\` to be a 4-number tuple \`[x, y, width, height]\`.`,
      'Write `box={[x, y, width, height]}` in canvas pixels.',
    );
  }

  const [x, y, width, height] = value;
  return [x!, y!, width!, height!];
}

/**
 * Validates that an optional `shape` prop on `<Shape>` is a known {@link ShapeGeometry}.
 *
 * @param value - The static attribute value.
 * @param node - The `<Shape>` node.
 * @param file - The VFile to report failures on.
 */
function readShapeProp(
  value: unknown,
  node: SlideMdastNode,
  file: PlacedRemarkFile,
): ShapeGeometry | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !SHAPE_GEOMETRY_SET.has(value)) {
    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    failPlaced(
      file,
      node,
      `"${rendered}" is not a geometry of <Shape>.`,
      `Use one of: ${SHAPE_GEOMETRIES.join(', ')}.`,
    );
  }

  return value as ShapeGeometry;
}

/**
 * Whether a node is a placed element: an unimported `<Place>`, or an unimported `<Shape>`/`<Text>`
 * carrying any placement attribute (`place`, `cols`, `rows`, `box`, `zone`, `inset`).
 *
 * @param node - Any mdast node.
 * @param imported - Local names shadowed by `import` declarations.
 */
function isPlacedElement(node: SlideMdastNode, imported: ReadonlySet<string>): boolean {
  if (!JSX_ELEMENT_TYPES.has(node.type) || typeof node.name !== 'string') {
    return false;
  }

  if (imported.has(node.name) || !(node.name in PLACED_TAG_KINDS)) {
    return false;
  }

  if (node.name === 'Place') {
    return true;
  }

  return hasAnyNamedAttribute(node, PLACEMENT_DETECTION_ATTRS);
}

/**
 * Whether a node is a `<Notes>` element.
 *
 * @param node - Any mdast node.
 */
function isNotes(node: SlideMdastNode): boolean {
  return JSX_ELEMENT_TYPES.has(node.type) && node.name === NOTES_ELEMENT;
}

/**
 * Whether a JSX node carries at least one named attribute from `names`.
 *
 * @param node - A JSX element node.
 * @param names - Attribute names to look for.
 */
function hasAnyNamedAttribute(node: SlideMdastNode, names: ReadonlySet<string>): boolean {
  for (const raw of node.attributes ?? []) {
    const attr = asJsxAttribute(raw);
    if (attr !== undefined && attr.name !== undefined && names.has(attr.name)) {
      return true;
    }
  }

  return false;
}

/**
 * Finds a named JSX attribute on a node.
 *
 * @param node - A JSX element node.
 * @param name - The attribute name.
 */
function findAttribute(node: SlideMdastNode, name: string): MdxJsxAttribute | undefined {
  for (const raw of node.attributes ?? []) {
    const attr = asJsxAttribute(raw);
    if (attr !== undefined && attr.name === name) {
      return attr;
    }
  }

  return undefined;
}

/**
 * Narrows an unknown entry in `node.attributes` to a named {@link MdxJsxAttribute}.
 *
 * @param raw - One item from `node.attributes`.
 */
function asJsxAttribute(raw: unknown): MdxJsxAttribute | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }

  const type = Reflect.get(raw, 'type');
  if (type !== 'mdxJsxAttribute') {
    return undefined;
  }

  return raw as MdxJsxAttribute;
}

/**
 * Evaluates a JSX attribute's value as a static literal, or returns {@link NON_LITERAL} if it
 * contains a runtime expression (such as an identifier or function call).
 *
 * @param attr - A named JSX attribute.
 */
function readAttributeLiteral(attr: MdxJsxAttribute): unknown {
  const { value } = attr;
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'object' &&
    Reflect.get(value, 'type') === 'mdxJsxAttributeValueExpression'
  ) {
    const data = Reflect.get(value, 'data');
    const estree = typeof data === 'object' && data !== null ? Reflect.get(data, 'estree') : null;
    const expression = firstExpression(estree);
    return expression === undefined ? NON_LITERAL : evalStaticExpression(expression);
  }

  return NON_LITERAL;
}

/**
 * Extracts the single expression from an estree Program wrapping an expression attribute.
 *
 * @param program - The estree program node.
 */
function firstExpression(program: unknown): object | undefined {
  if (typeof program !== 'object' || program === null) {
    return undefined;
  }

  const body = Reflect.get(program, 'body');
  if (!Array.isArray(body) || body.length !== 1) {
    return undefined;
  }

  const statement: unknown = body[0];
  if (
    typeof statement !== 'object' ||
    statement === null ||
    Reflect.get(statement, 'type') !== 'ExpressionStatement'
  ) {
    return undefined;
  }

  const expression: unknown = Reflect.get(statement, 'expression');
  return typeof expression === 'object' && expression !== null ? expression : undefined;
}

/**
 * Evaluates an estree expression composed strictly of literals, unary `+/-` numbers, static
 * template literals, or arrays thereof. Returns {@link NON_LITERAL} for anything else.
 *
 * @param node - An estree expression node.
 */
function evalStaticExpression(node: object): unknown {
  const type = Reflect.get(node, 'type');
  switch (type) {
    case 'Literal': {
      return Reflect.get(node, 'value');
    }

    case 'TemplateLiteral': {
      const expressions = Reflect.get(node, 'expressions');
      const quasis = Reflect.get(node, 'quasis');
      if (
        Array.isArray(expressions) &&
        expressions.length === 0 &&
        Array.isArray(quasis) &&
        quasis.length === 1
      ) {
        const quasi: unknown = quasis[0];
        const quasiValue: unknown =
          typeof quasi === 'object' && quasi !== null ? Reflect.get(quasi, 'value') : undefined;
        const cooked: unknown =
          typeof quasiValue === 'object' && quasiValue !== null
            ? Reflect.get(quasiValue, 'cooked')
            : undefined;
        return typeof cooked === 'string' ? cooked : NON_LITERAL;
      }

      return NON_LITERAL;
    }

    case 'UnaryExpression': {
      const operator = Reflect.get(node, 'operator');
      const arg: unknown = Reflect.get(node, 'argument');
      if ((operator === '-' || operator === '+') && typeof arg === 'object' && arg !== null) {
        const evaluated = evalStaticExpression(arg);
        if (typeof evaluated === 'number') {
          return operator === '-' ? -evaluated : +evaluated;
        }
      }

      return NON_LITERAL;
    }

    case 'ArrayExpression': {
      const elements = Reflect.get(node, 'elements');
      if (!Array.isArray(elements)) {
        return NON_LITERAL;
      }

      const values: unknown[] = [];
      for (const element of elements) {
        if (typeof element !== 'object' || element === null) {
          return NON_LITERAL;
        }

        const evaluated = evalStaticExpression(element);
        if (evaluated === NON_LITERAL) {
          return NON_LITERAL;
        }

        values.push(evaluated);
      }

      return values;
    }

    default: {
      return NON_LITERAL;
    }
  }
}

/**
 * Collects local identifier names bound by top-level `import` declarations in the MDX file, so
 * shadowed component names are skipped.
 *
 * @param tree - The mdast root.
 */
function importedNames(tree: SlideMdastNode): Set<string> {
  const names = new Set<string>();
  for (const node of tree.children ?? []) {
    if (node.type !== ESM_TYPE) {
      continue;
    }

    for (const statement of node.data?.estree?.body ?? []) {
      if (
        typeof statement !== 'object' ||
        statement === null ||
        Reflect.get(statement, 'type') !== 'ImportDeclaration'
      ) {
        continue;
      }

      const specifiers = Reflect.get(statement, 'specifiers');
      if (!Array.isArray(specifiers)) {
        continue;
      }

      for (const specifier of specifiers) {
        const local: unknown =
          typeof specifier === 'object' && specifier !== null
            ? Reflect.get(specifier, 'local')
            : undefined;
        const name: unknown =
          typeof local === 'object' && local !== null ? Reflect.get(local, 'name') : undefined;
        if (typeof name === 'string') {
          names.add(name);
        }
      }
    }
  }

  return names;
}

/**
 * Fails the MDX build via `file.fail` with `source: 'deck'`, the offending node's position, and a
 * dedicated `note` fix so `compileMdx` displays the placement fix rather than the generic JSX
 * syntax fix.
 *
 * @param file - The VFile.
 * @param node - The offending mdast node.
 * @param reason - What is wrong.
 * @param fix - How to fix it.
 */
function failPlaced(
  file: PlacedRemarkFile,
  node: SlideMdastNode,
  reason: string,
  fix: string,
): never {
  try {
    return file.fail(reason, {
      ...(node.position === undefined ? {} : { place: node.position }),
      ruleId: 'placed',
      source: 'deck',
    });
  } catch (error) {
    if (Predicate.isObject(error)) {
      Object.assign(error, { note: fix });
    }

    throw error;
  }
}
