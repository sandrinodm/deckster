import { fileExists, listBrands } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { DECK_CONFIG_HINTS, DeckConfig } from '@deckster/engine/config';
import { DECKS_DIR, loadLayoutCatalog, type DeckBuildError } from '@deckster/vite-plugin';
import { Effect, Result, Schema, type FileSystem } from 'effect';
import path from 'node:path';

import { cliError, usageError, type CliError, type FileSystemError } from '#cli-error.ts';
import { assertKebabName, titleFromName } from '#scaffold/names.ts';
import { deckFiles, DEFAULT_BRAND_NAME } from '#scaffold/templates.ts';
import { writeFiles } from '#scaffold/write-files.ts';

/**
 * What `deck new` created.
 */
export type CreatedFiles = {
  /**
   * Absolute paths of the files written.
   */
  files: string[];
};

/**
 * What `deck new <deck>` can be told about the deck besides its title.
 */
export type NewDeckOptions = {
  /**
   * The brand folder under `brands/`; `default` when omitted.
   */
  brand?: string;

  /**
   * The talk length, such as `20m`; the config gets no `duration` when omitted.
   */
  duration?: string;
};

/**
 * The name of the layout the first slide uses.
 */
const COVER_LAYOUT = 'title';

/**
 * Creates `decks/<id>/` with a config, a package, a TypeScript config and one slide that uses the
 * `title` layout, written from that layout's contract example.
 *
 * @param workspaceRoot - The workspace to create the deck in.
 * @param id - The deck folder name, in kebab-case.
 * @param title - The deck title. Defaults to the name as a sentence.
 * @param options - The brand and the duration.
 * @throws CliError in the error channel when the name is invalid, the deck already exists, the
 *   title is longer than the title layout allows, the brand is not in `brands/` or the duration is
 *   not a length such as `20m`; DeckBuildError when the layout catalog does not load;
 *   FileSystemError when a file cannot be written.
 */
export const createDeck = Effect.fn('createDeck')(function* (
  workspaceRoot: string,
  id: string,
  title: string | undefined,
  options: NewDeckOptions = {},
): Effect.fn.Return<
  CreatedFiles,
  CliError | DeckBuildError | FileSystemError,
  FileSystem.FileSystem
> {
  yield* assertKebabName('deck name', id);
  const dir = path.join(workspaceRoot, DECKS_DIR, id);
  if (yield* fileExists(dir)) {
    return yield* cliError(
      `decks/${id} already exists.\n` +
        `Pick another name, or add a slide to it with \`${deckCommand()} new slide ${id} <slide-id>\`.`,
    );
  }

  const deckTitle = title ?? titleFromName(id);
  const cover = (yield* loadLayoutCatalog()).get(COVER_LAYOUT)?.contract;
  const maxChars = cover?.title?.maxChars;
  if (maxChars !== undefined && deckTitle.length > maxChars) {
    return yield* usageError(
      `--title is ${deckTitle.length} characters, but the ${COVER_LAYOUT} layout allows a title of ` +
        `at most ${maxChars}. Shorten it, for example to "${deckTitle.slice(0, maxChars).trimEnd()}".`,
      'new',
    );
  }

  const brand = yield* chooseBrand(workspaceRoot, options.brand);
  const duration = yield* checkDuration(options.duration);
  const contents = Object.entries(
    deckFiles({
      id,
      title: deckTitle,
      brand,
      ...(duration === undefined ? {} : { duration }),
      cover: cover?.example ?? { frontmatter: {}, body: '' },
    }),
  ).map(([relative, content]) => [path.join(dir, relative), content] as const);
  return { files: yield* writeFiles(Object.fromEntries(contents)) };
});

/**
 * The brand a new deck names: the one asked for, which must be a folder under `brands/` (or the
 * framework's `default`, which a workspace without `brands/default` still has), else `default`.
 *
 * @param workspaceRoot - The workspace.
 * @param requested - The `--brand` value, if any.
 * @throws CliError in the error channel naming the brands that exist.
 */
const chooseBrand = Effect.fn('chooseBrand')(function* (
  workspaceRoot: string,
  requested: string | undefined,
): Effect.fn.Return<string, CliError, FileSystem.FileSystem> {
  if (requested === undefined) {
    return DEFAULT_BRAND_NAME;
  }

  const brands = [
    ...new Set([DEFAULT_BRAND_NAME, ...(yield* listBrands(workspaceRoot))]),
  ].toSorted();
  if (!brands.includes(requested)) {
    return yield* usageError(
      `There is no brand "${requested}". Brands: ${brands.join(', ')}.`,
      'new',
    );
  }

  return requested;
});

/**
 * Checks `--duration` with the deck config's own schema.
 *
 * @param requested - The `--duration` value, if any.
 * @throws CliError in the error channel when it is not minutes and seconds such as `20m`.
 */
const checkDuration = Effect.fn('checkDuration')(function* (
  requested: string | undefined,
): Effect.fn.Return<string | undefined, CliError> {
  if (requested === undefined) {
    return undefined;
  }

  const decoded = Schema.decodeUnknownResult(
    Schema.Struct({ duration: DeckConfig.fields.duration }),
  )({ duration: requested });
  if (Result.isFailure(decoded)) {
    return yield* usageError(
      `--duration "${requested}" is not a talk length. ${DECK_CONFIG_HINTS.duration}`,
      'new',
    );
  }

  return requested;
});
