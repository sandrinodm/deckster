import type { KeyedTokensInfo } from '@shikijs/magic-move/types';

import { highlightAtBuild, keyStatesAtBuild, resolveLang } from '#code/build-highlighter.ts';
import { parseFenceMeta } from '#code/fence-meta.ts';
import { linesOutOfRange, parseHighlight } from '#code/highlight-spec.ts';
import { compactKeyed } from '#code/keyed-states.ts';
import { TERMINAL_TONES } from '#code/terminal-script.ts';
import { warn, type KitFile } from '#mdx/kit-file.ts';
import {
  attributeValue,
  childText,
  removeAttribute,
  setAttribute,
  sourceOfChildren,
  walk,
  type MdastNode,
} from '#mdx/mdast.ts';

/**
 * The parts of a vfile the plugin uses: the source, warnings, and failures that name the place in
 * the slide.
 */
export type CodeFile = Pick<KitFile, 'value' | 'message' | 'fail'>;

/**
 * One state of a `CodeMove` before highlighting.
 */
type StateSource = {
  /**
   * The code.
   */
  code: string;

  /**
   * The language as the author wrote it.
   */
  lang: string | undefined;
};

/**
 * One newline at the end of a source.
 */
const TRAILING_NEWLINE = /\n$/;

/**
 * The meta of a fenced block after parsing: its options, such as the file name and highlighted
 * lines.
 */
type FenceMeta = ReturnType<typeof parseFenceMeta>;

/**
 * The element name fenced code blocks and `<Code>` tags become.
 */
const CODE_ELEMENT = 'Code';

/**
 * The element name of an animated sequence of code states.
 */
const CODE_MOVE_ELEMENT = 'CodeMove';

/**
 * The element name of one state inside a `CodeMove`.
 */
const CODE_STEP_ELEMENT = 'CodeStep';

/**
 * The terminal elements whose text is a command or output, kept exactly as written.
 */
const TERMINAL_TEXT_ELEMENTS = new Set(['Cmd', 'Out']);

/**
 * A remark plugin that highlights code at build time. Fenced blocks become `<Code>` elements,
 * `<Code code="...">` and `<CodeMove>` are filled in, and each gets a `data` attribute with the
 * tokens, so the browser needs no highlighter for them. Blocks whose source is not a literal are
 * left for the browser to highlight.
 */
export function remarkKitCode(): (tree: MdastNode, file: CodeFile) => Promise<void> {
  return async (tree, file) => {
    const jobs: (() => Promise<void>)[] = [];
    walk(tree, (node) => {
      if (node.type === 'code') {
        jobs.push(() => compileFence(node, file));
        return false;
      }

      if (node.name === CODE_ELEMENT && attributeValue(node, 'data') === undefined) {
        jobs.push(() => compileElement(node, file));
        return true;
      }

      if (typeof node.name === 'string' && TERMINAL_TEXT_ELEMENTS.has(node.name)) {
        moveTextToAttribute(node, file);
        checkTone(node, file);
        return true;
      }

      if (node.name === CODE_MOVE_ELEMENT && attributeValue(node, 'data') === undefined) {
        jobs.push(() => compileMove(node, file));
        return true;
      }

      return false;
    });
    for (const job of jobs) {
      await job();
    }
  };
}

/**
 * Moves the text of a `<Cmd>` or `<Out>` into a `text` attribute, exactly as the slide wrote it, so
 * markdown never touches a command: a URL stays text instead of becoming a link, `*x*` stays `*x*`,
 * and later plugins that rewrite the prose (typographic quotes and dashes) leave `pnpm deploy
 * --env` as it was typed. A single string expression (`{'...'}`) is taken as its value.
 *
 * @param node - The `<Cmd>` or `<Out>` element.
 * @param file - The vfile, for the slide's source.
 */
function moveTextToAttribute(node: MdastNode, file: CodeFile): void {
  if (attributeValue(node, 'text') !== undefined) {
    return;
  }

  const literal = childText(node);
  const text = isExpression(node) ? literal : (sourceOfChildren(node, file.value) ?? literal);
  if (text === undefined) {
    return;
  }

  setAttribute(node, 'text', text);
  node.children = [];
}

/**
 * Whether an element's only child is an expression such as `{'npm run x'}`.
 *
 * @param node - A JSX element.
 */
function isExpression(node: MdastNode): boolean {
  const [only, ...rest] = node.children ?? [];
  return (
    rest.length === 0 && (only?.type === 'mdxFlowExpression' || only?.type === 'mdxTextExpression')
  );
}

/**
 * Warns about an `<Out tone>` the terminal does not have, which would draw as plain text.
 *
 * @param node - The `<Cmd>` or `<Out>` element.
 * @param file - The vfile.
 */
function checkTone(node: MdastNode, file: CodeFile): void {
  const tone = attributeValue(node, 'tone');
  if (tone === undefined || (typeof tone === 'string' && TERMINAL_TONES.includes(tone))) {
    return;
  }

  warn(
    file,
    {
      rule: 'terminal-tone',
      problem:
        `<${node.name} tone=${JSON.stringify(tone)}> is not a terminal tone, ` +
        'so the line draws plain.',
      fix: `Use one of ${TERMINAL_TONES.map((name) => `"${name}"`).join(', ')}.`,
    },
    node,
  );
}

/**
 * Turns a fenced code block into a highlighted `<Code>` element, in place.
 *
 * @param node - The `code` node.
 * @param file - The vfile, for warnings and failures.
 */
async function compileFence(node: MdastNode, file: CodeFile): Promise<void> {
  const meta = readMeta(node, file);
  const source = node.value ?? '';
  const resolved = await resolveLang(node.lang ?? undefined);
  warnFallback(resolved.fallback, node.lang, node, file);
  checkHighlight({ highlight: meta.highlight, at: meta.at, source }, node, file);
  const code = await highlightAtBuild(source, resolved.lang, {
    diff: meta.diff,
    words: meta.words,
  });
  becomeCodeElement(node, resolved.lang, JSON.stringify(code));
  setFenceAttributes(node, meta);
}

/**
 * Turns a fenced block into a `<Code>` element with its language and tokens as attributes, in
 * place.
 *
 * @param node - The `code` node.
 * @param lang - The language the block is highlighted as.
 * @param data - The highlighted tokens, as JSON.
 */
function becomeCodeElement(node: MdastNode, lang: string, data: string): void {
  node.type = 'mdxJsxFlowElement';
  node.name = CODE_ELEMENT;
  node.attributes = [];
  node.children = [];
  delete node.value;
  delete node.lang;
  delete node.meta;
  setAttribute(node, 'lang', lang);
  setAttribute(node, 'data', data);
}

/**
 * Sets the options a fence wrote in its meta as attributes of its `<Code>` element, in place.
 *
 * @param node - The `<Code>` element.
 * @param meta - The fence's parsed meta.
 */
function setFenceAttributes(node: MdastNode, meta: FenceMeta): void {
  if (meta.file !== undefined) {
    setAttribute(node, 'file', meta.file);
  }

  if (meta.label !== undefined) {
    setAttribute(node, 'label', meta.label === false ? '' : meta.label);
  }

  if (meta.lineNumbers) {
    setAttribute(node, 'lineNumbers', true);
  }

  if (meta.highlight !== undefined) {
    setAttribute(node, 'highlight', meta.highlight);
  }

  if (meta.at !== undefined) {
    setAttribute(node, 'at', meta.at);
  }

  if (meta.dim === false) {
    setAttribute(node, 'dim', false);
  }

  if (meta.start !== undefined) {
    setAttribute(node, 'start', meta.start);
  }
}

/**
 * Highlights a `<Code>` element whose source is a literal, in place; leaves it alone otherwise.
 *
 * @param node - The `<Code>` element.
 * @param file - The vfile, for warnings and failures.
 */
async function compileElement(node: MdastNode, file: CodeFile): Promise<void> {
  const fromAttribute = attributeValue(node, 'code');
  const source = typeof fromAttribute === 'string' ? fromAttribute : childText(node);
  if (source === undefined) {
    return;
  }

  const lang = attributeValue(node, 'lang');
  const requested = typeof lang === 'string' ? lang : undefined;
  const resolved = await resolveLang(requested);
  warnFallback(resolved.fallback, requested, node, file);
  const highlight = attributeValue(node, 'highlight');
  if (typeof highlight === 'string' || highlight === undefined) {
    checkHighlight({ highlight, at: numberAttribute(node, 'at'), source }, node, file);
  }

  const words = attributeValue(node, 'words');
  const code = await highlightAtBuild(source, resolved.lang, {
    diff: attributeValue(node, 'diff') === true,
    words: Array.isArray(words) ? words.map(String) : [],
  });

  removeAttribute(node, 'code');
  removeAttribute(node, 'diff');
  removeAttribute(node, 'words');
  node.children = [];

  setAttribute(node, 'lang', resolved.lang);
  setAttribute(node, 'data', JSON.stringify(code));
}

/**
 * Highlights and keys every state of a `<CodeMove>`, in place; leaves it alone when a state is not
 * a literal.
 *
 * @param node - The `<CodeMove>` element.
 * @param file - The vfile, for warnings and failures.
 */
async function compileMove(node: MdastNode, file: CodeFile): Promise<void> {
  const states = moveStates(node);
  if (states === undefined) {
    return;
  }

  if (states.length < 2) {
    file.fail('<CodeMove> needs at least two code states to move between.', node);
  }

  const fallback = attributeValue(node, 'lang');
  const resolved = await Promise.all(
    states.map(async (state) => {
      const requested = state.lang ?? (typeof fallback === 'string' ? fallback : undefined);
      const lang = await resolveLang(requested);
      warnFallback(lang.fallback, requested, node, file);
      return { code: state.code.replace(TRAILING_NEWLINE, ''), lang: lang.lang };
    }),
  );
  const keyed: KeyedTokensInfo[] = await keyStatesAtBuild(resolved);
  node.children = [];
  removeAttribute(node, 'steps');
  setAttribute(node, 'data', JSON.stringify(keyed.map(compactKeyed)));
}

/**
 * The code states of a `<CodeMove>`: its fenced blocks and `<CodeStep>` children in order, or its
 * `steps` attribute.
 *
 * @param node - The `<CodeMove>` element.
 * @returns The states; `undefined` when one is not a literal.
 */
function moveStates(node: MdastNode): StateSource[] | undefined {
  const steps = attributeValue(node, 'steps');
  if (Array.isArray(steps)) {
    return steps.map(stepFromValue);
  }

  const states: StateSource[] = [];
  for (const child of node.children ?? []) {
    const state = stateFromChild(child);
    if (state === undefined) {
      return undefined;
    }

    states.push(state);
  }

  return states;
}

/**
 * A state from an entry of the `steps` array: a string, or `{ code, lang }`.
 *
 * @param value - The evaluated entry.
 */
function stepFromValue(value: unknown): StateSource {
  if (typeof value === 'string') {
    return { code: value, lang: undefined };
  }

  const entry = value as { code?: unknown; lang?: unknown } | undefined;
  return {
    code: typeof entry?.code === 'string' ? entry.code : '',
    lang: typeof entry?.lang === 'string' ? entry.lang : undefined,
  };
}

/**
 * A state from a child of `<CodeMove>`: a fenced block, or a `<CodeStep>` holding one or a string.
 *
 * @param child - The child node.
 * @returns The state; `undefined` for a child that is not a literal state.
 */
function stateFromChild(child: MdastNode): StateSource | undefined {
  if (child.type === 'code') {
    return { code: child.value ?? '', lang: child.lang ?? undefined };
  }

  if (child.name !== CODE_STEP_ELEMENT) {
    return undefined;
  }

  const fence = (child.children ?? []).find((inner) => inner.type === 'code');
  if (fence !== undefined) {
    return { code: fence.value ?? '', lang: fence.lang ?? undefined };
  }

  const text = childText(child);
  if (text === undefined) {
    return undefined;
  }

  const lang = attributeValue(child, 'lang');
  return { code: text, lang: typeof lang === 'string' ? lang : undefined };
}

/**
 * Reads a fence's meta, failing the build with the fix for an option it does not know.
 *
 * @param node - The `code` node.
 * @param file - The vfile.
 */
function readMeta(node: MdastNode, file: CodeFile): ReturnType<typeof parseFenceMeta> {
  try {
    return parseFenceMeta(node.meta);
  } catch (error) {
    return file.fail(error instanceof Error ? error.message : String(error), node);
  }
}

/**
 * Fails the build, naming the line, when the highlight steps do not parse, and warns about a step
 * that names lines the block does not have: it would add a step that changes nothing.
 *
 * @param block - The steps as written, the first step and the code.
 * @param node - The node, for the place.
 * @param file - The vfile.
 */
function checkHighlight(
  block: { highlight: string | undefined; at: number | undefined; source: string },
  node: MdastNode,
  file: CodeFile,
): void {
  let steps: ReturnType<typeof parseHighlight>;
  try {
    steps = parseHighlight(block.highlight, block.at);
  } catch (error) {
    return file.fail(error instanceof Error ? error.message : String(error), node);
  }

  const lineCount = block.source.replace(TRAILING_NEWLINE, '').split('\n').length;
  for (const { at, lines } of linesOutOfRange(steps, lineCount)) {
    warn(
      file,
      {
        rule: 'code-step-range',
        problem:
          `The highlight step at ${at} names line${lines.length === 1 ? '' : 's'} ` +
          `${lines.join(', ')}, but the block has ${lineCount} line${lineCount === 1 ? '' : 's'}.`,
        fix:
          `Number the lines from 1 to ${lineCount} in \`{...}\`, or remove the step; a step ` +
          'that names no line of the block is a press that changes nothing.',
      },
      node,
    );
  }
}

/**
 * Warns that a language is unknown and the block is shown as plain text.
 *
 * @param fallback - Whether the language fell back.
 * @param requested - The language as written.
 * @param node - The node, for the place.
 * @param file - The vfile.
 */
function warnFallback(
  fallback: boolean,
  requested: string | null | undefined,
  node: MdastNode,
  file: CodeFile,
): void {
  if (fallback) {
    warn(
      file,
      {
        rule: 'code-unknown-language',
        problem: `Unknown code language "${requested ?? ''}"; the block is shown as plain text.`,
        fix: 'Use a Shiki language id such as ts, tsx, bash or json.',
      },
      node,
    );
  }
}

/**
 * A numeric attribute.
 *
 * @param node - A JSX node.
 * @param name - The attribute.
 */
function numberAttribute(node: MdastNode, name: string): number | undefined {
  const value = attributeValue(node, name);
  return typeof value === 'number' ? value : undefined;
}
