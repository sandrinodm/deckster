import type { MdxPlugins } from '@deckster/engine/mdx';

import { SLIDE_META_EXPORT } from '@deckster/engine/manifest';
import { SLOT_ELEMENT, SLOT_NAME_ATTRIBUTE, SLOTS_ELEMENT } from '@deckster/engine/slots';
import { compile, type CompileOptions } from '@mdx-js/mdx';
import { Effect } from 'effect';
import remarkGfm from 'remark-gfm';

import type { SlotCandidate } from '#slides/slot-usage.ts';

import { invalidMdx, type DeckBuildError, type FileRef, type Problem } from '#errors.ts';
import { decodeCharacterReferences, normalizeNotes, NOTES_SEPARATOR } from '#slides/notes-text.ts';

/**
 * The element whose text is the slide's speaker notes.
 */
const NOTES_ELEMENT = 'Notes';

/**
 * The export a TSX slide declares its frontmatter in, which an MDX slide must not use.
 */
const FRONTMATTER_EXPORT = 'frontmatter';

/**
 * The mdast node types of JSX elements, in a block of their own or inside a paragraph.
 */
const JSX_ELEMENT_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

/**
 * The plugin list type `@mdx-js/mdx` takes; extension plugins are typed loosely so the engine does
 * not depend on unified.
 */
type PluginList = NonNullable<CompileOptions['remarkPlugins']>;

/**
 * The mdast node type of an `import` or `export` block.
 */
const ESM_TYPE = 'mdxjsEsm';

/**
 * The mdast node type of a JSX element in a block of its own.
 */
const FLOW_ELEMENT_TYPE = 'mdxJsxFlowElement';

/**
 * The parts of an mdast node this module reads and writes.
 */
type MdastNode = {
  /**
   * The node type, such as `heading` or `mdxJsxFlowElement`.
   */
  type: string;

  /**
   * The element name of a JSX node, such as `Notes`; `null` for a fragment.
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
  children?: MdastNode[];

  /**
   * Extra data; for an ESM block, its program as `estree`.
   */
  data?: { estree?: { body?: unknown[] } };

  /**
   * Where the node is in the source: 1-based lines and offsets in UTF-16 code units, when known.
   */
  position?: { start: { line?: number; offset?: number }; end: { offset?: number } };
};

/**
 * How to compile an MDX file.
 */
export type CompileMdxOptions = {
  /**
   * Emit development JSX with source locations.
   */
  development: boolean;

  /**
   * The slide's layout's slot tags, mapped to their slot names (`Left` to `left`). Given for
   * slides: the top-level content is wrapped for the layout and each top-level slot tag renamed.
   * Omitted for MDX files under `slides/` that the deck does not list, such as partials a slide
   * imports, which compile as plain MDX.
   */
  slotTags?: ReadonlyMap<string, string>;

  /**
   * The slide's validated frontmatter, which extension plugins read as `file.data.frontmatter` (the
   * kit resolves the icons and image paths that layout fields name). Omitted for partials.
   */
  frontmatter?: Readonly<Record<string, unknown>>;

  /**
   * Plugins from the deck's MDX extensions, added after the build's own.
   */
  extensions?: MdxPlugins;

  /**
   * Called with the text of each warning a plugin reports with `file.message(...)`, such as a
   * missing image, and the warning's parts: its rule id and fix, for `deckster lint`.
   */
  onWarning?: (message: string, warning: MdxWarning) => void;
};

/**
 * A warning a plugin reported while compiling an MDX file. A plugin names the kind of problem with
 * the message's origin (`file.message(reason, node, 'deck:media-missing')`) and puts the fix in its
 * `note`.
 */
export type MdxWarning = {
  /**
   * What is wrong.
   */
  reason: string;

  /**
   * The 1-based line in the slide file, when known.
   */
  line: number | null;

  /**
   * The kind of problem, such as `media-missing`; `null` when the plugin named none.
   */
  ruleId: string | null;

  /**
   * How to fix it; `null` when the plugin gave no fix apart from the reason.
   */
  fix: string | null;
};

/**
 * A compiled MDX file.
 */
export type CompiledMdx = {
  /**
   * JavaScript whose default export is the slide component.
   */
  code: string;

  /**
   * The text of every `<Notes>` block, normalized, joined by blank lines.
   */
  notes: string;

  /**
   * The text of the first heading outside `<Notes>`, if any.
   */
  heading: string | undefined;

  /**
   * Every JSX element, for the slot check: its name, line and whether it is nested.
   */
  candidates: SlotCandidate[];

  /**
   * Whether the slide has content outside its slot tags and `<Notes>`.
   */
  hasBody: boolean;

  /**
   * Exports the build does not accept: `export default`, `export const frontmatter` and the
   * reserved `slideMeta`.
   */
  exportProblems: Problem[];
};

/**
 * Compiles an MDX slide body to JavaScript, with GitHub-flavored markdown (tables, strikethrough,
 * task lists, autolinks), and reads what the build needs from it: speaker notes, the first heading,
 * how it fills its layout's slots and its exports. Components such as `<Step>` and `<Notes>` are
 * not imported; the engine passes them in.
 *
 * @param body - The MDX without its frontmatter (line numbers preserved).
 * @param ref - The file, for error messages and source positions.
 * @param options - Development output, and the layout's slot tags for a slide.
 * @throws DeckBuildError in the error channel, with the line and column of a syntax error.
 */
export const compileMdx = Effect.fn('compileMdx')(function* (
  body: string,
  ref: FileRef,
  options: CompileMdxOptions,
): Effect.fn.Return<CompiledMdx, DeckBuildError> {
  const read: Omit<CompiledMdx, 'code'> = {
    notes: '',
    heading: undefined,
    candidates: [],
    hasBody: false,
    exportProblems: [],
  };

  /**
   * A remark plugin that reads the slide's metadata from the tree and, for a slide, wraps its
   * top-level content for the layout.
   */
  const remarkSlide = () => (tree: MdastNode) => {
    read.notes = collectNotes(tree, body).join(NOTES_SEPARATOR);
    read.heading = firstHeading(tree);
    read.candidates = slotCandidates(tree);
    read.exportProblems = exportProblems(tree);
    if (options.slotTags !== undefined) {
      read.hasBody = wrapForLayout(tree, options.slotTags);
    }
  };

  const file = yield* Effect.tryPromise({
    try: () =>
      compile(
        {
          value: body,
          path: ref.file,
          data: options.frontmatter === undefined ? {} : { frontmatter: options.frontmatter },
        },
        {
          development: options.development,
          jsxImportSource: 'react',
          // GitHub-flavored markdown: tables, strikethrough, task lists and autolinks.
          remarkPlugins: [
            remarkGfm,
            ...((options.extensions?.remarkPlugins ?? []) as PluginList),
            remarkSlide,
          ],
          rehypePlugins: [...((options.extensions?.rehypePlugins ?? []) as PluginList)],
        },
      ),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) =>
      isMdxMessage(error) ? Effect.fail(mdxError(error, ref)) : Effect.die(error),
    ),
  );
  for (const message of file.messages) {
    const warning: MdxWarning = {
      reason: message.reason,
      line: message.line ?? null,
      ruleId: message.ruleId ?? null,
      fix: message.note ?? null,
    };
    const fix = warning.fix === null ? '' : ` ${warning.fix}`;
    const line = warning.line === null ? '' : ` (line ${warning.line})`;
    options.onWarning?.(`${warning.reason}${fix}${line}`, warning);
  }

  return { code: String(file.value), ...read };
});

/**
 * Wraps the slide's top-level content (everything but `import` and `export` blocks) in
 * `<DeckSlots>` and renames each top-level slot tag to `<DeckSlot name="...">`, so the engine can
 * sort the content into the layout's slots.
 *
 * @param tree - The mdast root, changed in place.
 * @param slotTags - The layout's slot tags, mapped to their slot names.
 * @returns Whether any top-level content is left for `body`.
 */
function wrapForLayout(tree: MdastNode, slotTags: ReadonlyMap<string, string>): boolean {
  const children = tree.children ?? [];
  const esm = children.filter((node) => node.type === ESM_TYPE);
  const content = children.filter((node) => node.type !== ESM_TYPE);
  let hasBody = false;
  for (const node of content) {
    const slot = node.type === FLOW_ELEMENT_TYPE ? slotTags.get(node.name ?? '') : undefined;
    if (slot !== undefined) {
      node.name = SLOT_ELEMENT;
      node.attributes = [
        ...(node.attributes ?? []),
        { type: 'mdxJsxAttribute', name: SLOT_NAME_ATTRIBUTE, value: slot },
      ];
    } else if (isBodyContent(node)) {
      hasBody = true;
    }
  }

  tree.children = [
    ...esm,
    { type: FLOW_ELEMENT_TYPE, name: SLOTS_ELEMENT, attributes: [], children: content },
  ];
  return hasBody;
}

/**
 * Whether a node adds slide content. Notes, Markdown definitions and MDX comments can appear on a
 * slide that has no body region.
 *
 * @param node - A node outside a named slot.
 */
function isBodyContent(node: MdastNode): boolean {
  if (isNotes(node)) {
    return false;
  }

  if (node.name === null && JSX_ELEMENT_TYPES.has(node.type)) {
    return node.children?.some(isBodyContent) ?? false;
  }

  switch (node.type) {
    case 'definition':
    case 'footnoteDefinition':
      return false;
    case 'mdxFlowExpression':
    case 'mdxTextExpression':
      return node.data?.estree?.body?.length !== 0;
    case 'paragraph':
      return node.children?.some(isBodyContent) ?? false;
    case 'text':
      return typeof node.value === 'string' && node.value.trim() !== '';
    default:
      return true;
  }
}

/**
 * Every named JSX element in the tree, with its line and whether it is nested inside another node
 * than the root. The slot check picks out the slot tags.
 *
 * @param tree - The mdast root.
 */
function slotCandidates(tree: MdastNode): SlotCandidate[] {
  const candidates: SlotCandidate[] = [];
  const topLevel = new Set(tree.children ?? []);
  visit(tree, (node) => {
    if (JSX_ELEMENT_TYPES.has(node.type) && typeof node.name === 'string') {
      const nested = !(topLevel.has(node) && node.type === FLOW_ELEMENT_TYPE);
      candidates.push({ name: node.name, line: node.position?.start.line, nested });
    }
  });
  return candidates;
}

/**
 * Problems with the slide's `export` statements: `export default` (MDX would treat it as a layout
 * wrapper), `export const frontmatter` (MDX frontmatter is the `---` block) and the reserved
 * `slideMeta`.
 *
 * @param tree - The mdast root.
 */
function exportProblems(tree: MdastNode): Problem[] {
  const problems: Problem[] = [];
  for (const node of tree.children ?? []) {
    if (node.type !== ESM_TYPE) {
      continue;
    }

    const line = node.position?.start.line ?? 1;
    for (const statement of node.data?.estree?.body ?? []) {
      problems.push(...statementProblems(statement, line));
    }
  }

  return problems;
}

/**
 * Problems with one statement of an ESM block.
 *
 * @param statement - An estree statement.
 * @param line - The line the block starts on.
 */
function statementProblems(statement: unknown, line: number): Problem[] {
  const type = readString(statement, 'type');
  if (type === 'ExportDefaultDeclaration') {
    return [
      {
        message:
          `The export block on line ${line} has \`export default\`, which would replace the ` +
          "slide's layout.",
        fix:
          'Remove it; name the layout in the frontmatter instead, for example ' +
          '`layout: default`.',
      },
    ];
  }

  if (type !== 'ExportNamedDeclaration') {
    return [];
  }

  return exportedNames(statement).flatMap((name): Problem[] => {
    if (name === FRONTMATTER_EXPORT) {
      return [
        {
          message: `Line ${line} exports "frontmatter", which an MDX slide does not read.`,
          fix: 'Move the fields into the --- block at the top of the file and remove the export.',
        },
      ];
    }

    if (name === SLIDE_META_EXPORT) {
      return [
        {
          message: `Line ${line} exports "${SLIDE_META_EXPORT}", a name the build reserves.`,
          fix: `Rename the export; the build adds "${SLIDE_META_EXPORT}" to every slide.`,
        },
      ];
    }

    return [];
  });
}

/**
 * The names an `export` statement declares: its variables, function or class, and its specifiers.
 *
 * @param statement - An `ExportNamedDeclaration`.
 */
function exportedNames(statement: unknown): string[] {
  const declaration = readObject(statement, 'declaration');
  const declarators = readArray(declaration, 'declarations');
  const declared = [
    ...declarators.map((declarator) => readString(readObject(declarator, 'id'), 'name')),
    readString(readObject(declaration, 'id'), 'name'),
  ];
  const specified = readArray(statement, 'specifiers').map((specifier) => {
    const exported = readObject(specifier, 'exported');
    return readString(exported, 'name') ?? readString(exported, 'value');
  });
  return [...declared, ...specified].filter((name) => name !== undefined);
}

/**
 * The text of every non-empty `<Notes>` block, normalized, in source order.
 *
 * @param tree - The mdast root.
 * @param source - The MDX the tree was parsed from.
 */
function collectNotes(tree: MdastNode, source: string): string[] {
  const notes: string[] = [];
  visit(tree, (node) => {
    if (!isNotes(node)) {
      return;
    }

    const text = normalizeNotes(decodeCharacterReferences(sliceChildren(node, source)));
    if (text !== '') {
      notes.push(text);
    }
  });
  return notes;
}

/**
 * The source of a node's children from the start of the first child's line, so its indentation
 * dedents with the others; empty when the parser gave no offsets.
 *
 * @param node - A JSX element.
 * @param source - The MDX the tree was parsed from.
 */
function sliceChildren(node: MdastNode, source: string): string {
  const children = node.children ?? [];
  const firstOffset = children[0]?.position?.start.offset;
  const end = children.at(-1)?.position?.end.offset;
  if (firstOffset === undefined || end === undefined) {
    return '';
  }

  const lineStart = source.lastIndexOf('\n', firstOffset - 1) + 1;
  const isIndentOnly = source.slice(lineStart, firstOffset).trim() === '';
  return source.slice(isIndentOnly ? lineStart : firstOffset, end);
}

/**
 * The text of the first heading outside `<Notes>`, or `undefined` when there is none or it is
 * empty.
 *
 * @param tree - The mdast root.
 */
function firstHeading(tree: MdastNode): string | undefined {
  let heading: string | undefined;
  visit(tree, (node) => {
    if (heading === undefined && node.type === 'heading') {
      heading = textOf(node).trim();
    }
  });
  return heading === '' ? undefined : heading;
}

/**
 * Whether a node is a `<Notes>` element.
 *
 * @param node - Any mdast node.
 */
function isNotes(node: MdastNode): boolean {
  return JSX_ELEMENT_TYPES.has(node.type) && node.name === NOTES_ELEMENT;
}

/**
 * The text of a node and everything below it, without markup.
 *
 * @param node - Any mdast node.
 */
function textOf(node: MdastNode): string {
  if (typeof node.value === 'string') {
    return node.value;
  }

  return (node.children ?? []).map(textOf).join('');
}

/**
 * Calls the visitor on a node and then on every node below it, depth first. The inside of a
 * `<Notes>` block is visited only for the notes themselves: headings and slot tags in notes are not
 * part of the slide.
 *
 * @param node - The root.
 * @param visitor - Called once per node.
 */
function visit(node: MdastNode, visitor: (node: MdastNode) => void): void {
  visitor(node);
  if (isNotes(node)) {
    return;
  }

  for (const child of node.children ?? []) {
    visit(child, visitor);
  }
}

/**
 * A string property of an estree node, or `undefined`.
 *
 * @param value - Any value.
 * @param key - The property.
 */
function readString(value: unknown, key: string): string | undefined {
  const read: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
  return typeof read === 'string' ? read : undefined;
}

/**
 * An object property of an estree node, or `undefined`.
 *
 * @param value - Any value.
 * @param key - The property.
 */
function readObject(value: unknown, key: string): object | undefined {
  const read: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
  return typeof read === 'object' && read !== null ? read : undefined;
}

/**
 * An array property of an estree node, or an empty array.
 *
 * @param value - Any value.
 * @param key - The property.
 */
function readArray(value: unknown, key: string): unknown[] {
  const read: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
  return Array.isArray(read) ? read : [];
}

/**
 * The error for MDX that does not compile, with the line and column the compiler reported. A check
 * of the deck's own plugins (source `deck`, such as a diagram's) brings its own fix; anything else
 * is a syntax error and gets the fix for JSX syntax.
 *
 * @param error - The compiler's message.
 * @param ref - The file, for the error.
 */
function mdxError(error: MdxMessage, ref: FileRef): DeckBuildError {
  const place = error.line === undefined ? '' : `Line ${error.line}, column ${error.column ?? 1}: `;
  const fromPlugin = error.source === 'deck';
  return invalidMdx(ref, {
    message: `${place}${error.reason}`,
    fix: fromPlugin
      ? (error.note ?? 'Change the element as the message says.')
      : 'Close every JSX tag, keep markdown inside a component separated by blank lines, and ' +
        'escape a literal { or < in text as \\{ or &lt;.',
  });
}

/**
 * A VFileMessage from the MDX compiler: an error with a `reason` and, usually, a position.
 */
type MdxMessage = Error & {
  /**
   * The problem, sometimes with the position in it.
   */
  reason: string;

  /**
   * The 1-based line of the problem, when known.
   */
  line?: number;

  /**
   * The 1-based column of the problem, when known.
   */
  column?: number;

  /**
   * Where the message came from: `deck` for a check of the deck's own plugins, which carry their
   * own fix.
   */
  source?: string;

  /**
   * The fix a plugin attached, when it has one.
   */
  note?: string;
};

/**
 * Whether a thrown value is a VFileMessage from the MDX compiler; the position is sometimes only in
 * `reason`.
 *
 * @param error - Whatever the compiler threw.
 */
function isMdxMessage(error: unknown): error is MdxMessage {
  return error instanceof Error && 'reason' in error && typeof error.reason === 'string';
}
