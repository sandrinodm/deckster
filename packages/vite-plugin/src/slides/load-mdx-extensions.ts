import type { MdxContext, MdxExtension, MdxPlugins } from '@deckster/engine/mdx';

import { Effect, Predicate } from 'effect';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { invalidMdxExtension, type DeckBuildError, type FileRef } from '#errors.ts';

/**
 * The MDX extensions every deck loads: the kit's, which highlights code and resolves media and
 * icons at build time.
 */
export const DEFAULT_MDX_EXTENSIONS: readonly string[] = ['@deckster/kit/mdx'];

/**
 * Loads each MDX extension module, in Node, and merges the plugins they create for one deck.
 * Plugins keep the order of the extensions, so a later extension's plugins run after an earlier
 * one's.
 *
 * @param specifiers - Extension modules: bare specifiers resolve from this package, absolute paths
 *   are used as they are. Each module's default export must be a `defineMdxExtension(...)`.
 * @param context - The deck and brand the plugins are created for.
 * @returns The merged remark and rehype plugins.
 * @throws DeckBuildError in the error channel naming the module, for one that does not load or does
 *   not export an extension.
 */
export const loadMdxExtensions = Effect.fn('loadMdxExtensions')(function* (
  specifiers: readonly string[],
  context: MdxContext,
): Effect.fn.Return<Required<MdxPlugins>, DeckBuildError> {
  const extensions = yield* Effect.forEach(specifiers, importExtension, { concurrency: 1 });
  const created = extensions.map((extension) => extension.plugins(context));
  return {
    remarkPlugins: created.flatMap((plugins) => plugins.remarkPlugins ?? []),
    rehypePlugins: created.flatMap((plugins) => plugins.rehypePlugins ?? []),
  };
});

/**
 * Imports an extension module and checks its default export.
 *
 * @param specifier - A bare specifier or an absolute path.
 */
const importExtension = Effect.fn('importMdxExtension')(function* (
  specifier: string,
): Effect.fn.Return<MdxExtension, DeckBuildError> {
  const ref = extensionRef(specifier);
  const loaded = yield* Effect.tryPromise({
    try: (): Promise<unknown> => import(/* @vite-ignore */ pathToFileURL(ref.file).href),
    catch: (error) =>
      invalidMdxExtension(ref, [
        {
          message: `Importing it failed: ${error instanceof Error ? error.message : String(error)}`,
          fix:
            'An MDX extension runs in Node: import only build-time code, ' +
            'never components or JSX.',
        },
      ]),
  });
  const exported = Predicate.isObject(loaded) ? loaded.default : undefined;
  if (
    !Predicate.isObject(exported) ||
    typeof exported.name !== 'string' ||
    typeof exported.plugins !== 'function'
  ) {
    return yield* invalidMdxExtension(ref, [
      {
        message: 'The default export is not an MDX extension.',
        fix:
          'Export `defineMdxExtension({ name, plugins })` from `@deckster/engine/mdx` as the default ' +
          'export.',
      },
    ]);
  }

  return exported as MdxExtension;
});

/**
 * The file of an extension module, for messages and for importing it.
 *
 * @param specifier - A bare specifier or an absolute path.
 */
function extensionRef(specifier: string): FileRef {
  const file = path.isAbsolute(specifier)
    ? specifier
    : fileURLToPath(import.meta.resolve(specifier));
  return { file, displayPath: specifier };
}
