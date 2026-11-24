import type { AnyLayoutContract } from '@deckster/engine/layout';

import { assertSlidePath, guardedWrite, writeDeckManifest } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { DEFAULT_LAYOUT } from '@deckster/engine/frontmatter';
import {
  appendSlideId,
  deckBrandName,
  findDeck,
  loadDeck,
  slideListProblem,
  SLIDES_DIR,
  type DeckBuildError,
  type LayoutCatalogIndex,
  type LayoutProblem,
} from '@deckster/vite-plugin';
import { Console, Effect, FileSystem, Result } from 'effect';
import path from 'node:path';

import {
  cliError,
  fileSystemError,
  firstLine,
  type CliError,
  type FileSystemError,
} from '#cli-error.ts';
import { exampleMdx } from '#layouts/list-layouts.ts';
import { loadBrandCatalog } from '#layouts/load-brand-catalog.ts';
import { assertKebabName } from '#scaffold/names.ts';
import { slideTitle } from '#scaffold/templates.ts';

/**
 * Options for {@link addSlide}.
 */
export type AddSlideOptions = {
  /**
   * The workspace that contains the deck.
   */
  workspaceRoot: string;

  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * The new slide's id, in kebab-case.
   */
  id: string;

  /**
   * The layout the slide uses, from the layout catalog; `undefined` for `default`.
   */
  layout: string | undefined;

  /**
   * The active brand when a live session overrides the deck's configured brand.
   */
  brand?: string | undefined;
};

/**
 * Adds `slides/<id>.mdx` to a deck, written from the layout contract's example with the slide's own
 * title, and appends its id to the manifest in `deck.config.ts` through `writeDeckManifest` (plain
 * files inside the deck only, the config written atomically and kept by the turn guard when an
 * agent turn calls this through the `new_slide` deck tool). The slide file is created exclusively
 * and removed again when the manifest cannot be edited.
 *
 * @param options - The deck, the new slide's id and its layout.
 * @returns The absolute paths of the files written or changed.
 * @throws CliError in the error channel when the id is invalid, the layout is not in the catalog,
 *   the slide exists, or the manifest has no `slides` array that can be edited; DeckBuildError when
 *   the deck does not exist or the catalog does not load; FileSystemError when a file cannot be
 *   read or written.
 */
export const addSlide = Effect.fn('addSlide')(function* (
  options: AddSlideOptions,
): Effect.fn.Return<string[], CliError | DeckBuildError | FileSystemError, FileSystem.FileSystem> {
  const id = yield* assertKebabName('slide id', options.id);
  const deck = yield* findDeck(options.workspaceRoot, options.deck);
  // A deck that does not load fully (a listed slide without a file, say) still gets its slide
  // added, against the config's brand when the config reads; the problem is reported only when
  // the layout asked for is one that the brand's layouts might have supplied.
  const loaded = yield* Effect.result(loadDeck(options.workspaceRoot, deck));
  const config = Result.isSuccess(loaded) ? loaded.success.config : {};
  const { catalog, local, warnings } = yield* loadBrandCatalog(
    options.workspaceRoot,
    deckBrandName(config, options.brand),
    deck,
  );
  for (const warning of warnings) {
    yield* Console.error(`warning: ${warning}`);
  }

  const wanted = options.layout ?? DEFAULT_LAYOUT;
  if (Result.isFailure(loaded) && !catalog.has(wanted)) {
    return yield* loaded.failure;
  }

  const contract = yield* chooseLayout(catalog, wanted, deck.id, local.problems);
  const slideFile = path.join(deck.slidesDir, `${id}.mdx`);
  const taken = yield* existingSlideFiles(deck.slidesDir, id);
  const [existing] = taken;
  if (existing !== undefined) {
    return yield* cliError(
      `${SLIDES_DIR}/${existing} already exists in deck "${deck.id}". Pick another id.`,
    );
  }

  yield* assertSlidePath(options.workspaceRoot, deck.id, slideFile).pipe(
    Effect.mapError((error) => cliError(error.message)),
  );
  const frontmatter = {
    layout: contract.name,
    ...contract.example.frontmatter,
    title: slideTitle(id),
  };
  const fs = yield* FileSystem.FileSystem;
  // Created exclusively, so nothing already at the path (a file, a link) is ever written through.
  // During an agent turn the guard records it and puts it in the turn's working copy.
  yield* guardedWrite(
    slideFile,
    fs
      .writeFileString(
        slideFile,
        exampleMdx(frontmatter, contract.example.body, contract.example.comments),
        { flag: 'wx' },
      )
      .pipe(
        Effect.mapError((error) =>
          fileSystemError('write', slideFile, error, 'Check that the slides folder is writable.'),
        ),
      ),
  );
  yield* writeDeckManifest(options.workspaceRoot, deck.id, (config) => {
    const listed = slideListProblem(config, { rewrite: false, append: id });
    if (listed !== undefined && listed.includes('already holds')) {
      return Effect.fail(
        cliError(`The manifest of deck "${deck.id}" already lists "${id}". Pick another id.`),
      );
    }

    const updated = appendSlideId(config, id);
    return updated === undefined
      ? Effect.fail(
          cliError(
            `Could not find a \`slides: [...]\` list in decks/${deck.id}/deck.config.ts.\n` +
              `Add '${id}' to the slide list by hand; the slide file was not created.`,
          ),
        )
      : Effect.succeed(updated);
  }).pipe(
    Effect.catchTag('TurnGuardError', (error) => Effect.fail(cliError(error.message))),
    Effect.tapError(() =>
      guardedWrite(slideFile, fs.remove(slideFile, { force: true }).pipe(Effect.ignore)),
    ),
  );
  return [slideFile, deck.configFile];
});

/**
 * The files in a deck's `slides/` folder that a slide id would collide with: `<id>` with any
 * extension, so `<id>.tsx` blocks a new `<id>.mdx` too.
 *
 * @param slidesDir - The absolute `slides/` folder.
 * @param id - The new slide id.
 * @returns The file names, none when the folder does not exist.
 */
const existingSlideFiles = Effect.fn('existingSlideFiles')(function* (
  slidesDir: string,
  id: string,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(slidesDir).pipe(Effect.orElseSucceed((): string[] => []));
  return names.filter((name) => name === id || name.startsWith(`${id}.`));
});

/**
 * The contract of the layout a new slide asks for.
 *
 * @param catalog - The layout catalog.
 * @param name - The layout name.
 * @param deck - The deck folder name, for the fix.
 * @param problems - The problems of the brand's and the deck's code layouts, which are left out of
 *   the catalog.
 * @throws CliError in the error channel when the catalog has no such layout: the code layout's
 *   problem when a code layout of that name has one, else the list of layouts.
 */
const chooseLayout = Effect.fn('chooseLayout')(function* (
  catalog: LayoutCatalogIndex,
  name: string,
  deck: string,
  problems: readonly LayoutProblem[],
): Effect.fn.Return<AnyLayoutContract, CliError> {
  const layout = catalog.get(name);
  if (layout !== undefined) {
    return layout.contract;
  }

  const problem = problems.find((entry) => entry.layout === name);
  if (problem !== undefined) {
    return yield* cliError(
      `The layout "${name}" cannot be used: ${firstLine(problem.message)}\n${problem.fix}`,
    );
  }

  return yield* cliError(
    `There is no layout "${name}". Layouts: ${[...catalog.keys()].join(', ')}.\n` +
      `Run \`${deckCommand()} layouts ${deck}\` to see what each one is for.`,
  );
});
