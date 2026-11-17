import type { BrandError, BrandTokens } from '@deckster/brand';
import type { DeckBuildError } from '@deckster/vite-plugin';

import { loadBrand } from '@deckster/brand/node';
import { chartCatalog, type ChartCatalog } from '@deckster/kit/chart-catalog';
import { componentCatalog, type ComponentCatalog } from '@deckster/kit/component-catalog';
import { DIAGRAM_CATALOG, type DiagramCatalog } from '@deckster/kit/diagram-catalog';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect, FileSystem } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import path from 'node:path';

import { checkDocsBrands } from '#check-brands.ts';
import { readCliReference, type DocsCli } from '#data/cli-reference.ts';
import { readDocsDeck, type DocsDeck } from '#data/deck-slides.ts';
import { brandJsonSchema, deckConfigJsonSchema, type DocsJsonSchema } from '#data/json-schemas.ts';
import { deckOutput, packCli, type DeckBinary } from '#data/run-deck.ts';
import { docsError, type DocsError } from '#docs-error.ts';

/**
 * The indent of every JSON file, as the CLI's own `--json` output uses.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The deck whose layouts the export lists: the CLI's default deck, which every published deck
 * shares the layout catalog with.
 */
const LAYOUTS_DECK = 'hello';

/**
 * The JSDoc block right before a brand file's `export default`, which describes the brand.
 */
const BRAND_DOC_PATTERN = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export default\b/;

/**
 * The ` * ` at the start of a line inside a JSDoc block.
 */
const DOC_LINE_PREFIX_PATTERN = /^\s*\*\s?/;

/**
 * What to export: the workspace and the decks and brands the docs publish.
 */
export type DocsDataOptions = {
  /**
   * The absolute workspace root.
   */
  root: string;

  /**
   * The deck folder names to export slides for, in the order the docs list them.
   */
  decks: readonly string[];

  /**
   * The brand folder names to export tokens and icons for, in the order the docs list them.
   */
  brands: readonly string[];

  /**
   * The workspace's own `deck`, which lists the layouts and icons of its decks and brands.
   */
  deck: DeckBinary;

  /**
   * The `deck` whose help and version the CLI reference shows: the packed CLI ({@link packCli}),
   * whose help is worded for an npm install.
   */
  installedDeck: DeckBinary;
};

/**
 * One published brand: its name and label, a sentence or two about it, and every resolved token as
 * `deck brand <name> --json` prints them.
 */
export type DocsBrand = {
  /**
   * The brand folder name.
   */
  name: string;

  /**
   * The brand's display name.
   */
  label: string;

  /**
   * The doc comment on the brand file's default export, as one paragraph; `null` when it has none.
   */
  description: string | null;

  /**
   * The resolved tokens.
   */
  tokens: BrandTokens;
};

/**
 * Where the export came from: the CLI version, the published decks and brands, and the commit.
 */
export type DocsMeta = {
  /**
   * The CLI version.
   */
  version: string;

  /**
   * The git commit of the workspace, or `null` when git cannot read it.
   */
  commit: string | null;

  /**
   * The published decks.
   */
  decks: readonly string[];

  /**
   * The published brands.
   */
  brands: readonly string[];
};

/**
 * Everything the docs site reads, one JSON file per key (`layouts.json` and so on), in the order
 * the files are written.
 */
export type DocsData = {
  /**
   * `deck layouts <deck> --json`: the slide frontmatter JSON Schema and every layout.
   */
  layouts: unknown;

  /**
   * `deck components --json`.
   */
  components: ComponentCatalog;

  /**
   * `deck charts --json`.
   */
  charts: ChartCatalog;

  /**
   * `deck diagrams --json`.
   */
  diagrams: DiagramCatalog;

  /**
   * `deck icons --brand <published brands> --json`: the icon names every published brand has.
   */
  icons: unknown;

  /**
   * The help of every command.
   */
  cli: DocsCli;

  /**
   * The published brands.
   */
  brands: { brands: DocsBrand[] };

  /**
   * The published decks and their slides.
   */
  slides: { decks: DocsDeck[] };

  /**
   * The JSON Schema of a brand file's `defineBrand` argument.
   */
  'brand-schema': DocsJsonSchema;

  /**
   * The JSON Schema of a deck config's `defineDeck` argument.
   */
  'deck-config': DocsJsonSchema;

  /**
   * Where the export came from.
   */
  meta: DocsMeta;
};

/**
 * Everything collecting the export can fail with.
 */
export type DocsDataError = DocsError | BrandError | DeckBuildError;

/**
 * Collects the docs export. The layouts and icons are what the workspace's `deck layouts` and `deck
 * icons` print with `--json`, the CLI reference what the installed `deck` prints for `--help` and
 * `--version`, and the other catalogs, the brand tokens, the slides and the schemas come from the
 * packages that own them. Decks and brands come only from the options, never from listing the
 * workspace, and the output holds no timestamps or absolute paths, so the same commit gives the
 * same data.
 *
 * @param options - The workspace, the published decks and brands, and the two `deck`s to ask.
 * @returns The data, by file.
 * @throws DeckBuildError in the error channel when a deck is missing or invalid, BrandError when a
 *   brand is, and DocsError when a deck renders with a brand the options do not list, a slide file
 *   cannot be read or a `deck` run fails or prints something that is not JSON.
 */
export const collectDocsData = Effect.fn('collectDocsData')(function* (
  options: DocsDataOptions,
): Effect.fn.Return<
  DocsData,
  DocsDataError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const { root, decks, brands, deck } = options;
  yield* checkDocsBrands({ root, decks, brands });
  const cli = yield* readCliReference(options.installedDeck, root);
  const layouts = yield* deckJson(deck, root, ['layouts', LAYOUTS_DECK, '--json']);
  const icons = yield* deckJson(deck, root, ['icons', '--brand', brands.join(','), '--json']);
  return {
    layouts,
    components: componentCatalog(),
    charts: chartCatalog(),
    diagrams: DIAGRAM_CATALOG,
    icons,
    cli,
    brands: { brands: yield* Effect.forEach(brands, (name) => describeBrand(root, name)) },
    slides: { decks: yield* Effect.forEach(decks, (name) => readDocsDeck(root, name)) },
    'brand-schema': brandJsonSchema(),
    'deck-config': deckConfigJsonSchema(),
    meta: { version: cli.version, commit: yield* gitCommit(root), decks, brands },
  };
});

/**
 * Writes each part of the export to `<out>/<key>.json`, creating the folder. Every file is indented
 * JSON with a trailing newline. Files already in the folder that the export does not write are left
 * alone.
 *
 * @param out - The absolute output folder.
 * @param data - The export.
 * @throws DocsError in the error channel when the folder or a file cannot be written.
 */
export const writeDocsData = Effect.fn('writeDocsData')(function* (
  out: string,
  data: DocsData,
): Effect.fn.Return<void, DocsError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(out, { recursive: true })
    .pipe(Effect.mapError((error) => docsError(`Could not create ${out}: ${error.message}`)));
  for (const [key, value] of Object.entries(data)) {
    const file = path.join(out, `${key}.json`);
    yield* fs
      .writeFileString(file, `${JSON.stringify(value, null, JSON_INDENT_SPACES)}\n`)
      .pipe(Effect.mapError((error) => docsError(`Could not write ${file}: ${error.message}`)));
  }
});

/**
 * Packs the CLI, collects the docs export and writes it to a folder, as the process's main program.
 * A failure prints its message and sets a non-zero exit code.
 *
 * @param options - The workspace, the published decks and brands, the workspace's `deck` and the
 *   absolute output folder.
 */
export function runDocsData(
  options: Omit<DocsDataOptions, 'installedDeck'> & { out: string },
): void {
  const program = packCli(options.root).pipe(
    Effect.flatMap((installedDeck) => collectDocsData({ ...options, installedDeck })),
    Effect.flatMap((data) => writeDocsData(options.out, data)),
    Effect.andThen(Console.log(`Wrote the docs data to ${options.out}`)),
    Effect.catch((error) =>
      Console.error(error.message).pipe(
        Effect.andThen(
          Effect.sync(() => {
            process.exitCode = 1;
          }),
        ),
      ),
    ),
    Effect.provide(NodeServices.layer),
  );
  NodeRuntime.runMain(program);
}

/**
 * Runs a `deck` command line that prints JSON and parses what it printed.
 *
 * @param deck - The `deck` to start.
 * @param root - The absolute workspace root.
 * @param args - The arguments after `deck`, `--json` included.
 */
const deckJson = Effect.fn('deckJson')(function* (
  deck: DeckBinary,
  root: string,
  args: readonly string[],
): Effect.fn.Return<unknown, DocsError, ChildProcessSpawner.ChildProcessSpawner> {
  const output = yield* deckOutput(deck, root, args);
  return yield* Effect.try({
    try: (): unknown => JSON.parse(output),
    catch: () => docsError(`\`deck ${args.join(' ')}\` printed something that is not JSON.`),
  });
});

/**
 * One brand's entry: its tokens as `deck brand <name> --json` prints them and the doc comment of
 * its brand file.
 *
 * @param root - The absolute workspace root.
 * @param name - The brand folder name.
 */
const describeBrand = Effect.fn('describeBrand')(function* (
  root: string,
  name: string,
): Effect.fn.Return<DocsBrand, BrandError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const brand = yield* loadBrand(root, name);
  const source = yield* fs.readFileString(brand.location.file).pipe(Effect.orElseSucceed(() => ''));
  return {
    name,
    label: brand.tokens.label,
    description: brandDescription(source),
    tokens: brand.tokens,
  };
});

/**
 * The doc comment on a brand file's default export as one paragraph, or `null` when there is none.
 *
 * @param source - The brand file's text.
 */
function brandDescription(source: string): string | null {
  const body = BRAND_DOC_PATTERN.exec(source)?.[1];
  if (body === undefined) {
    return null;
  }

  const text = body
    .split('\n')
    .map((line) => line.replace(DOC_LINE_PREFIX_PATTERN, '').trim())
    .filter((line) => line !== '')
    .join(' ');
  return text === '' ? null : text;
}

/**
 * The commit the workspace has checked out, or `null` when git is missing or the workspace is not a
 * repository.
 *
 * @param root - The absolute workspace root.
 */
const gitCommit = Effect.fn('gitCommit')(function* (
  root: string,
): Effect.fn.Return<string | null, never, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const command = ChildProcess.make('git', ['rev-parse', 'HEAD'], { cwd: root });
  return yield* spawner.string(command).pipe(
    Effect.map((output) => output.trim() || null),
    Effect.orElseSucceed(() => null),
  );
});
