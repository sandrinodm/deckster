import { Effect, FileSystem, Option, Predicate } from 'effect';

import { checkSvg } from '#diagrams/svg-roles.ts';
import { sanitizeSvg } from '#diagrams/svg-sanitize-node.ts';
import { describeBase, PATH_RULE, resolveDeckPath } from '#mdx/deck-path.ts';
import { failBuild, warn, type KitFile } from '#mdx/kit-file.ts';
import { attributeValue, defaultImport, setAttribute, walk, type MdastNode } from '#mdx/mdast.ts';
import { runKitEffect } from '#mdx/node-runtime.ts';

/**
 * The parts of a vfile the plugin uses.
 */
export type SvgFile = Pick<KitFile, 'path' | 'message' | 'fail'>;

/**
 * Options of {@link remarkKitSvg}.
 */
export type SvgOptions = {
  /**
   * The absolute deck folder (it holds `deck.config.ts`): bare paths start there, and every drawing
   * must be inside it.
   */
  deckDir: string;
};

/**
 * A remark plugin that inlines `<Svg src="../assets/drawing.svg">` at build time: it reads the
 * file, parses it with the HTML parser (parse5, as a browser reads inline SVG), keeps only
 * allow-listed SVG elements and attributes and serialises the result from the tree (scripts, event
 * handlers, `<style>`, `<foreignObject>`, animation elements, external references and unsafe CSS
 * are removed, each a warning), derives a `viewBox` from a fixed size, checks literal `recolor` and
 * `steps` against the drawing (an unknown role or id fails the build with the valid ones, a color
 * the drawing does not use is a warning) and passes the cleaned markup as `src`, so the drawing
 * takes brand colors and step reveals. The path follows the deck's rule (`./` and `../` from the
 * slide file, a bare path from the deck folder, `/` from its `public/` folder); the file, links
 * followed, must be an `.svg` inside the deck folder, or the build fails. A URL fails too: a
 * drawing is inlined, so it must be in the deck. A file in the deck is still imported (unused,
 * `?raw`) so editing it reloads the slide. A path that does not exist is a `media-missing`
 * warning.
 *
 * @param options - The deck folder.
 */
export function remarkKitSvg(
  options: SvgOptions,
): (tree: MdastNode, file: SvgFile) => Promise<void> {
  return async (tree, file) => {
    const drawings: MdastNode[] = [];
    walk(tree, (node) => {
      if (node.name === 'Svg') {
        drawings.push(node);
      }

      return false;
    });
    const imports: MdastNode[] = [];
    for (const node of drawings) {
      await inlineSvg(node, file, options, imports);
    }

    if (imports.length > 0) {
      tree.children = [...imports, ...(tree.children ?? [])];
    }
  };
}

/**
 * Inlines one `<Svg>` whose `src` is a path; markup and expressions are left as they are.
 *
 * @param node - The `<Svg>` element.
 * @param file - The vfile.
 * @param options - The deck folder.
 * @param imports - The imports to add, changed in place.
 */
async function inlineSvg(
  node: MdastNode,
  file: SvgFile,
  options: SvgOptions,
  imports: MdastNode[],
): Promise<void> {
  const source = attributeValue(node, 'src');
  if (typeof source !== 'string' || source.trimStart().startsWith('<') || file.path === undefined) {
    return;
  }

  const where = `<Svg src="${source}">`;
  const resolved = await runKitEffect(
    resolveDeckPath({ source, slideFile: file.path, deckDir: options.deckDir, kind: 'svg' }),
  );
  switch (resolved.type) {
    case 'url':
      failBuild(
        file,
        {
          rule: 'media-path',
          problem: `${where} is a URL; <Svg> inlines a drawing from the deck at build time.`,
          fix:
            "Download the drawing into the deck's assets/ folder and write its path, such as " +
            '`src="assets/drawing.svg"`, or show a picture that keeps its own colors with <Image>.',
        },
        node,
      );
      return;
    case 'missing':
      warn(
        file,
        {
          rule: 'media-missing',
          problem: `${where} does not exist (looked for ${resolved.looked}).`,
          fix:
            `Add the file, or fix the path, which is ${describeBase(resolved.base)}. ` + PATH_RULE,
        },
        node,
      );
      return;
    case 'rejected':
      failBuild(
        file,
        { rule: 'media-path', problem: `${where} ${resolved.reason}`, fix: resolved.fix },
        node,
      );
      return;
    case 'local':
    case 'public':
      break;
  }

  const text = await runKitEffect(readDrawing(resolved.file));
  if (Option.isNone(text)) {
    failBuild(
      file,
      {
        rule: 'media-path',
        problem: `${where} could not be read (${resolved.file}).`,
        fix: 'Check that the file is a readable text SVG.',
      },
      node,
    );
    return;
  }

  const { markup, dropped } = sanitizeSvg(text.value);
  for (const what of dropped) {
    file.message(
      `${where} had ${what}; it was removed, because an inline drawing must not run code or ` +
        'load other files. Remove it from the file to silence this warning.',
      node,
    );
  }

  const check = checkSvg(markup, literalRecords(node), where);
  for (const warning of check.warnings) {
    file.message(warning, node);
  }

  if (check.errors.length > 0) {
    failBuild(
      file,
      {
        rule: 'diagram',
        problem: check.errors.join('\n'),
        fix: 'Use the values the message lists.',
      },
      node,
    );
  }

  if (resolved.type === 'local') {
    imports.push(defaultImport(`kitSvg${imports.length}`, `${resolved.specifier}?raw`));
  }

  setAttribute(node, 'src', markup);
}

/**
 * Reads a drawing's text.
 *
 * @param file - Its absolute path.
 * @returns The text; nothing when it cannot be read.
 */
const readDrawing = Effect.fn('readDrawing')(function* (
  file: string,
): Effect.fn.Return<Option.Option<string>, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(file, 'utf8').pipe(Effect.option);
});

/**
 * The `recolor` and `steps` of an `<Svg>` when they are written as literals.
 *
 * @param node - The `<Svg>` element.
 */
function literalRecords(node: MdastNode): {
  recolor?: Readonly<Record<string, unknown>>;
  steps?: Readonly<Record<string, unknown>>;
} {
  const recolor = attributeValue(node, 'recolor');
  const steps = attributeValue(node, 'steps');
  return {
    ...(Predicate.isObject(recolor) ? { recolor } : {}),
    ...(Predicate.isObject(steps) ? { steps } : {}),
  };
}
