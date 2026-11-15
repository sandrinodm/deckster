import { SLIDE_META_EXPORT } from '@deckster/engine/manifest';
import { parseAst } from 'vite';

import type { SlotCandidate } from '#slides/slot-usage.ts';

import { invalidExports, unreadableFile, type FileRef, type Problem } from '#errors.ts';
import { decodeCharacterReferences, normalizeNotes, NOTES_SEPARATOR } from '#slides/notes-text.ts';

/**
 * The export a TSX slide declares its frontmatter in.
 */
const FRONTMATTER_EXPORT = 'frontmatter';

/**
 * The element whose text is the slide's speaker notes.
 */
const NOTES_ELEMENT = 'Notes';

/**
 * The package whose `Notes` a slide may import under another name.
 */
const ENGINE_PACKAGE = '@deckster/engine';

/**
 * Matches a heading element name, `h1` to `h6`.
 */
const HEADING_PATTERN = /^h[1-6]$/;

/**
 * Matches a name that starts with a capital letter, as slot tags do.
 */
const CAPITALIZED_PATTERN = /^[A-Z]/;

/**
 * Expressions around a literal that change only its type, such as `satisfies`, which the reader
 * looks through.
 */
const WRAPPER_EXPRESSIONS = new Set([
  'TSSatisfiesExpression',
  'TSAsExpression',
  'ParenthesizedExpression',
]);

/**
 * A run of whitespace, collapsed to one space in notes, as JSX renders text.
 */
const WHITESPACE_RUN_PATTERN = /\s+/g;

/**
 * An ESTree node as `parseAst` returns it, read structurally.
 */
type AstNode = {
  /**
   * The node type, such as `ObjectExpression`.
   */
  type: string;

  /**
   * The node's offset in the source, in UTF-16 code units.
   */
  start: number;
  [key: string]: unknown;
};

/**
 * What the build reads from a TSX slide without running it.
 */
export type TsxMeta = {
  /**
   * The `export const frontmatter` object literal, or `{}` when the slide has none.
   */
  frontmatter: unknown;

  /**
   * The text of every `<Notes>` element, normalized as MDX notes are, joined by blank lines.
   */
  notes: string;

  /**
   * The text of the first `<h1>` to `<h6>` outside `<Notes>` whose content is literal text.
   */
  heading: string | undefined;

  /**
   * The capitalized named exports, which may fill slots of the slide's layout.
   */
  candidates: SlotCandidate[];
};

/**
 * Reads a TSX slide's frontmatter, speaker notes, first heading and exports from its syntax tree.
 * The frontmatter must be a literal (`export const frontmatter = { title: 'Live demo' } satisfies
 * SlideFrontmatterInput`) because the build does not execute slide code. `<Notes>` is found under
 * any name it is imported as from `@deckster/engine`.
 *
 * @param code - The TSX source.
 * @param ref - The file, for error messages.
 * @throws DeckBuildError when the frontmatter is not a literal, when `<Notes>` holds anything but
 *   text, and, listing every problem, when the slide has no default export, declares the reserved
 *   `slideMeta` export, or exports `frontmatter` in a form the build does not read.
 */
export function readTsxMeta(code: string, ref: FileRef): TsxMeta {
  // parseSync returns a different tree for decks/hello's TSX slide and reports syntax errors
  // instead of throwing them, so swapping it in would change what the build reads.
  // oxlint-disable-next-line typescript/no-deprecated
  const program: unknown = parseAst(code, { lang: 'tsx' });
  const context: Context = { code, ref, notes: notesNames(program) };
  if (!isNode(program)) {
    return { frontmatter: {}, notes: '', heading: undefined, candidates: [] };
  }

  let frontmatter: unknown = {};
  let heading: string | undefined;
  const notes: string[] = [];
  visit(program, context, (node) => {
    const exported = exportedConstant(node);
    if (exported?.name === FRONTMATTER_EXPORT) {
      frontmatter = evaluateLiteral(exported.init, context);
    }

    if (isNotesElement(node, context)) {
      notes.push(notesText(node, context));
    }

    heading ??= headingText(node);
  });
  const slideExports = readExports(program, context);
  if (slideExports.problems.length > 0) {
    throw invalidExports(ref, slideExports.problems);
  }

  return {
    frontmatter,
    notes: notes.filter((text) => text !== '').join(NOTES_SEPARATOR),
    heading,
    candidates: slideExports.candidates,
  };
}

/**
 * The slide being read: its source and file, for error messages, and the names `<Notes>` goes by.
 */
type Context = {
  /**
   * The TSX source.
   */
  code: string;

  /**
   * The slide file.
   */
  ref: FileRef;

  /**
   * The local names of the engine's `Notes` (`Notes` itself, or an alias), and the namespaces it is
   * reachable through (`engine` in `<engine.Notes>`).
   */
  notes: { names: ReadonlySet<string>; namespaces: ReadonlySet<string> };
};

/**
 * What the build finds among a TSX slide's exports.
 */
type SlideExports = {
  /**
   * The capitalized named exports, with their lines.
   */
  candidates: SlotCandidate[];

  /**
   * Exports the build does not accept, and a missing default export.
   */
  problems: Problem[];
};

/**
 * The names the engine's `Notes` is imported under, and the namespaces the engine is imported as.
 * `Notes` always counts, so a slide that defines its own `Notes` keeps working as before.
 *
 * @param program - The parsed program.
 */
function notesNames(program: unknown): Context['notes'] {
  const names = new Set([NOTES_ELEMENT]);
  const namespaces = new Set<string>();
  const body = isNode(program) && Array.isArray(program.body) ? program.body : [];
  for (const statement of body) {
    if (!isNode(statement) || statement.type !== 'ImportDeclaration') {
      continue;
    }

    if (readPath(statement, ['source', 'value']) !== ENGINE_PACKAGE) {
      continue;
    }

    const specifiers = Array.isArray(statement.specifiers) ? statement.specifiers : [];
    for (const specifier of specifiers) {
      const local = readPath(specifier, ['local', 'name']);
      if (typeof local !== 'string') {
        continue;
      }

      if (readPath(specifier, ['type']) === 'ImportNamespaceSpecifier') {
        namespaces.add(local);
      } else if (readPath(specifier, ['imported', 'name']) === NOTES_ELEMENT) {
        names.add(local);
      }
    }
  }

  return { names, namespaces };
}

/**
 * Reads the program's top-level exports: whether it has a default export, the capitalized names
 * that may fill slots, and the problems with `slideMeta` and `frontmatter`.
 *
 * @param program - The parsed program.
 * @param context - The slide.
 */
function readExports(program: AstNode, context: Context): SlideExports {
  const candidates: SlotCandidate[] = [];
  const problems: Problem[] = [];
  let hasDefault = false;
  const body = Array.isArray(program.body) ? program.body : [];
  for (const statement of body) {
    if (!isNode(statement)) {
      continue;
    }

    hasDefault ||= statement.type === 'ExportDefaultDeclaration';
    const line = lineOf(context.code, statement.start);
    for (const { name, declared } of namedExports(statement)) {
      hasDefault ||= name === 'default';
      problems.push(...exportProblems(name, declared, line));
      if (CAPITALIZED_PATTERN.test(name)) {
        candidates.push({ name, line, nested: false });
      }
    }
  }

  if (!hasDefault) {
    problems.push({
      message: 'The slide has no default export.',
      fix:
        'Export the slide as `export default function MySlide() { ... }`; it fills the ' +
        "layout's body.",
    });
  }

  return { candidates, problems };
}

/**
 * The names an `export` statement exports, and whether each is declared in it (`export const x`) or
 * listed (`export { x }`, `export { y as x }`, `export { x } from`).
 *
 * @param statement - A top-level statement.
 */
function namedExports(statement: AstNode): { name: string; declared: boolean }[] {
  if (statement.type !== 'ExportNamedDeclaration') {
    return [];
  }

  const declaration = isNode(statement.declaration) ? statement.declaration : undefined;
  const declarators = Array.isArray(declaration?.declarations) ? declaration.declarations : [];
  const declared = [
    ...declarators.map((declarator) => readPath(declarator, ['id', 'name'])),
    readPath(declaration, ['id', 'name']),
  ];
  const specifiers = Array.isArray(statement.specifiers) ? statement.specifiers : [];
  const listed = specifiers.map(
    (specifier) =>
      readPath(specifier, ['exported', 'name']) ?? readPath(specifier, ['exported', 'value']),
  );
  return [
    ...declared.filter(isString).map((name) => ({ name, declared: true })),
    ...listed.filter(isString).map((name) => ({ name, declared: false })),
  ];
}

/**
 * Problems with one exported name: the reserved `slideMeta`, and a `frontmatter` the build cannot
 * read because it is not declared in the export.
 *
 * @param name - The exported name.
 * @param declared - Whether the export declares it.
 * @param line - The export's line.
 */
function exportProblems(name: string, declared: boolean, line: number): Problem[] {
  if (name === SLIDE_META_EXPORT) {
    return [
      {
        message: `Line ${line} exports "${SLIDE_META_EXPORT}", a name the build reserves.`,
        fix: `Rename the export; the build adds "${SLIDE_META_EXPORT}" to every slide.`,
      },
    ];
  }

  if (name === FRONTMATTER_EXPORT && !declared) {
    return [
      {
        message: `Line ${line} exports "frontmatter" from a list, which the build does not read.`,
        fix: 'Declare it in the export itself: `export const frontmatter = { ... }`.',
      },
    ];
  }

  return [];
}

/**
 * The name and initializer of an `export const` declaration, or `undefined` for any other node.
 *
 * @param node - Any node of the program.
 */
function exportedConstant(node: AstNode): { name: string; init: AstNode } | undefined {
  if (node.type !== 'ExportNamedDeclaration' || !isNode(node.declaration)) {
    return undefined;
  }

  const declarations = node.declaration.declarations;
  if (!Array.isArray(declarations)) {
    return undefined;
  }

  for (const declarator of declarations) {
    const id = isNode(declarator) ? declarator.id : undefined;
    const init = isNode(declarator) ? declarator.init : undefined;
    if (isNode(id) && typeof id.name === 'string' && isNode(init)) {
      return { name: id.name, init };
    }
  }

  return undefined;
}

/**
 * The value of a literal expression: strings, numbers, booleans, `null`, lists and objects, through
 * `satisfies`, `as` and parentheses.
 *
 * @param node - The expression.
 * @param context - The slide, for the error.
 * @throws DeckBuildError naming the line when the expression is not a literal.
 */
function evaluateLiteral(node: AstNode, context: Context): unknown {
  if (WRAPPER_EXPRESSIONS.has(node.type) && isNode(node.expression)) {
    return evaluateLiteral(node.expression, context);
  }

  switch (node.type) {
    case 'Literal':
      return literalValue(node, context);
    case 'TemplateLiteral':
      return templateValue(node, context);
    case 'UnaryExpression':
      return negativeNumber(node, context);
    case 'ArrayExpression':
      return elementsOf(node, context).map((element) => evaluateLiteral(element, context));
    case 'ObjectExpression':
      return objectValue(node, context);
    default:
      throw notLiteral(context, node);
  }
}

/**
 * The value of a string, number, boolean or `null` literal.
 *
 * @param node - A `Literal` node.
 * @param context - The slide, for the error.
 * @throws DeckBuildError for a regular expression or a bigint.
 */
function literalValue(node: AstNode, context: Context): unknown {
  const { value } = node;
  const isPlain = value === null || ['string', 'number', 'boolean'].includes(typeof value);
  if (!isPlain || 'regex' in node) {
    throw notLiteral(context, node);
  }

  return value;
}

/**
 * The text of a template literal without placeholders.
 *
 * @param node - A `TemplateLiteral` node.
 * @param context - The slide, for the error.
 * @throws DeckBuildError for a template with placeholders.
 */
function templateValue(node: AstNode, context: Context): string {
  const quasis = Array.isArray(node.quasis) ? node.quasis : [];
  const expressions = Array.isArray(node.expressions) ? node.expressions : [];
  const quasi: unknown = quasis[0];
  const cooked = isNode(quasi) ? readPath(quasi, ['value', 'cooked']) : undefined;
  if (expressions.length > 0 || typeof cooked !== 'string') {
    throw notLiteral(context, node);
  }

  return cooked;
}

/**
 * The value of a negated number literal, such as `-2`.
 *
 * @param node - A `UnaryExpression` node.
 * @param context - The slide, for the error.
 * @throws DeckBuildError for any other unary expression.
 */
function negativeNumber(node: AstNode, context: Context): number {
  const argument = isNode(node.argument) ? node.argument : undefined;
  if (node.operator !== '-' || typeof argument?.value !== 'number') {
    throw notLiteral(context, node);
  }

  return -argument.value;
}

/**
 * The elements of a list literal.
 *
 * @param node - An `ArrayExpression` node.
 * @param context - The slide, for the error.
 * @throws DeckBuildError for a hole or a spread element.
 */
function elementsOf(node: AstNode, context: Context): AstNode[] {
  const elements = Array.isArray(node.elements) ? node.elements : [];
  return elements.map((element) => {
    if (!isNode(element) || element.type === 'SpreadElement') {
      throw notLiteral(context, node);
    }

    return element;
  });
}

/**
 * The fields of an object literal, each value evaluated as a literal.
 *
 * @param node - An `ObjectExpression` node.
 * @param context - The slide, for the error.
 * @throws DeckBuildError for a spread, a computed key, a method or a non-literal value.
 */
function objectValue(node: AstNode, context: Context): Record<string, unknown> {
  const properties = Array.isArray(node.properties) ? node.properties : [];
  const entries = properties.map((property) => {
    const key = isNode(property) ? propertyKey(property) : undefined;
    if (!isNode(property) || key === undefined || !isNode(property.value)) {
      throw notLiteral(context, isNode(property) ? property : node);
    }

    return [key, evaluateLiteral(property.value, context)] as const;
  });
  return Object.fromEntries(entries);
}

/**
 * The name of a plain object property: an identifier or a string key. Computed keys, spreads and
 * other keys give `undefined`.
 *
 * @param property - A node from an object's `properties`.
 */
function propertyKey(property: AstNode): string | undefined {
  if (property.type !== 'Property' || property.computed === true || !isNode(property.key)) {
    return undefined;
  }

  const { key } = property;
  if (key.type === 'Identifier' && typeof key.name === 'string') {
    return key.name;
  }

  return typeof key.value === 'string' ? key.value : undefined;
}

/**
 * Whether a node is a `<Notes>` element, under any name the slide imports it as.
 *
 * @param node - Any node of the program.
 * @param context - The slide, for the names of `Notes`.
 */
function isNotesElement(node: AstNode, context: Context): boolean {
  const name = elementName(node);
  if (name === undefined) {
    return false;
  }

  if (name.type === 'JSXIdentifier') {
    return typeof name.name === 'string' && context.notes.names.has(name.name);
  }

  const object = readPath(name, ['object', 'name']);
  const property = readPath(name, ['property', 'name']);
  return (
    name.type === 'JSXMemberExpression' &&
    typeof object === 'string' &&
    context.notes.namespaces.has(object) &&
    property === NOTES_ELEMENT
  );
}

/**
 * The name node of a JSX element's opening tag, or `undefined` for any other node.
 *
 * @param node - Any node of the program.
 */
function elementName(node: AstNode): AstNode | undefined {
  if (node.type !== 'JSXElement' || !isNode(node.openingElement)) {
    return undefined;
  }

  const { name } = node.openingElement;
  return isNode(name) ? name : undefined;
}

/**
 * The text of an `<h1>` to `<h6>` element whose content is text, string literals and elements with
 * such content; `undefined` for any other node, or a heading with code in it.
 *
 * @param node - Any node of the program.
 */
function headingText(node: AstNode): string | undefined {
  const name = elementName(node);
  if (name?.type !== 'JSXIdentifier' || typeof name.name !== 'string') {
    return undefined;
  }

  if (!HEADING_PATTERN.test(name.name)) {
    return undefined;
  }

  const text = literalText(node)?.replace(WHITESPACE_RUN_PATTERN, ' ').trim();
  return text === '' ? undefined : text;
}

/**
 * The text of a JSX element's children, decoded; `undefined` when a child is code that is not a
 * string literal.
 *
 * @param node - A JSX element.
 */
function literalText(node: AstNode): string | undefined {
  const children = Array.isArray(node.children) ? node.children : [];
  let text = '';
  for (const child of children) {
    if (!isNode(child)) {
      return undefined;
    }

    const part = childText(child);
    if (part === undefined) {
      return undefined;
    }

    text += part;
  }

  return text;
}

/**
 * The text of one JSX child: text, a string literal in braces, or an element with literal text.
 *
 * @param child - A JSX child.
 */
function childText(child: AstNode): string | undefined {
  if (child.type === 'JSXText' && typeof child.value === 'string') {
    return decodeCharacterReferences(child.value);
  }

  if (child.type === 'JSXExpressionContainer') {
    const value = readPath(child, ['expression', 'value']);
    return typeof value === 'string' ? value : undefined;
  }

  return child.type === 'JSXElement' ? literalText(child) : undefined;
}

/**
 * The text inside a `<Notes>` element, normalized as MDX notes are: paragraphs and line breaks
 * kept, shared indentation removed, runs of spaces collapsed and character references decoded.
 *
 * @param node - A `<Notes>` element.
 * @param context - The slide, for the error.
 * @throws DeckBuildError when the element contains other elements or non-literal code.
 */
function notesText(node: AstNode, context: Context): string {
  const children = Array.isArray(node.children) ? node.children : [];
  const parts = children.map((child) => {
    if (isNode(child) && child.type === 'JSXText' && typeof child.value === 'string') {
      return decodeCharacterReferences(child.value);
    }

    if (isNode(child) && child.type === 'JSXExpressionContainer' && isNode(child.expression)) {
      return String(evaluateLiteral(child.expression, context));
    }

    throw unreadableFile(context.ref, 'speaker notes', {
      message: `<Notes> on line ${lineOf(context.code, node.start)} contains elements or code.`,
      fix:
        'Write speaker notes as plain text inside <Notes>, ' +
        'or as a string: <Notes>{"…"}</Notes>.',
    });
  });
  return normalizeNotes(parts.join(''));
}

/**
 * The error for a frontmatter value that is not a literal, naming its line.
 *
 * @param context - The slide.
 * @param node - The value at fault.
 */
function notLiteral(context: Context, node: AstNode): Error {
  return unreadableFile(context.ref, 'frontmatter', {
    message:
      `The frontmatter value on line ${lineOf(context.code, node.start)} is not a literal; ` +
      'the build reads frontmatter without running the slide.',
    fix: 'Use only strings, numbers, booleans, lists and objects in `export const frontmatter`.',
  });
}

/**
 * Calls the visitor on a node and then on every node below it, depth first. The inside of a
 * `<Notes>` element is not visited: a heading in the notes is not the slide's.
 *
 * @param node - The root.
 * @param context - The slide, for the names of `Notes`.
 * @param visitor - Called once per node.
 */
function visit(node: AstNode, context: Context, visitor: (node: AstNode) => void): void {
  visitor(node);
  if (isNotesElement(node, context)) {
    return;
  }

  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (isNode(child)) {
        visit(child, context, visitor);
      }
    }
  }
}

/**
 * Whether a value is a string, as a type guard for filters.
 *
 * @param value - Any value.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * The value at a path of keys, or `undefined` when the path leaves the objects of the value.
 *
 * @param value - Any value.
 * @param keys - The keys to follow.
 */
function readPath(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    current = Reflect.get(current, key);
  }

  return current;
}

/**
 * Whether a value is an AST node: an object with a string `type`.
 *
 * @param value - Any value.
 */
function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  );
}

/**
 * The 1-based line of an offset in the source.
 *
 * @param code - The source.
 * @param offset - An offset in UTF-16 code units.
 */
function lineOf(code: string, offset: number): number {
  return code.slice(0, offset).split('\n').length;
}
