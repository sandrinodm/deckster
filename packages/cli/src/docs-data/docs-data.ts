import type { BrandError, BrandTokens } from '@deckster/brand';
import type { DeckBuildError } from '@deckster/vite-plugin';

import { loadBrand } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { chartCatalog, type ChartCatalog } from '@deckster/kit/chart-catalog';
import { componentCatalog, type ComponentCatalog } from '@deckster/kit/component-catalog';
import { DIAGRAM_CATALOG, type DiagramCatalog } from '@deckster/kit/diagram-catalog';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect, FileSystem } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import path from 'node:path';

import { fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';
import { COMMANDS } from '#cli.ts';
import { commandHelp } from '#command.ts';
import { checkDocsBrands } from '#docs-data/docs-brands.ts';
import {
  brandJsonSchema,
  deckConfigJsonSchema,
  type DocsJsonSchema,
} from '#docs-data/docs-schemas.ts';
import { readDocsDeck, type DocsDeck } from '#docs-data/docs-slides.ts';
import { listIcons, type IconListing } from '#icons/list-icons.ts';
import { listLayouts, type LayoutCatalogInfo } from '#layouts/list-layouts.ts';
import { cliVersion } from '#version.ts';
import { DEFAULT_DECK, Workspace } from '#workspace.ts';

/**
 * The indent of every JSON file, as the CLI's own `--json` output uses.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The prefix of the first line of a command's `--help`.
 */
const USAGE_PREFIX = 'Usage: ';

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
};

/**
 * One `deck` command as the CLI reference shows it.
 */
export type DocsCommand = {
  /**
   * The word after `deck`, such as `lint`.
   */
  name: string;

  /**
   * The line `deck --help` shows for it.
   */
  summary: string;

  /**
   * The usage lines at the top of its help without the `Usage: ` prefix, one per form; commands
   * with subcommands, such as `brand check`, have one line per subcommand.
   */
  usage: string[];

  /**
   * The full `--help` text as the published CLI prints it, without the lines only the repository
   * checkout shows (`pnpm` commands, workspace packages). Subcommands share their command's help.
   */
  help: string;
};

/**
 * The CLI reference: the command name, its version and every command in `deck --help` order.
 */
export type DocsCli = {
  /**
   * The command the help texts name, such as `deck`.
   */
  command: string;

  /**
   * The CLI version.
   */
  version: string;

  /**
   * Every command, in the order `deck --help` lists them.
   */
  commands: DocsCommand[];
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
  layouts: { deck: string } & LayoutCatalogInfo;

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
  icons: IconListing;

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
export type DocsDataError = CliError | BrandError | DeckBuildError;

/**
 * Collects the docs export with the CLI's own functions, so each catalog is exactly what its
 * command prints with `--json`. Decks and brands come only from the options, never from listing the
 * workspace, and the output holds no timestamps or absolute paths, so the same commit gives the
 * same data.
 *
 * @param options - The workspace and the published decks and brands.
 * @returns The data, by file.
 * @throws DeckBuildError in the error channel when a deck is missing or invalid, BrandError when a
 *   brand is, and CliError when a deck renders with a brand the options do not list, a slide file
 *   cannot be read or a command's help cannot load.
 */
export const collectDocsData = Effect.fn('collectDocsData')(function* (
  options: DocsDataOptions,
): Effect.fn.Return<
  DocsData,
  DocsDataError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const { root, decks, brands } = options;
  yield* checkDocsBrands({ root, decks, brands });
  const version = yield* cliVersion();
  const layouts = { deck: DEFAULT_DECK, ...(yield* listLayouts(root, DEFAULT_DECK)) };
  const icons = yield* listIcons(brands, undefined).pipe(
    Effect.provideService(Workspace, Workspace.of({ root })),
  );
  const commands = yield* Effect.forEach(COMMANDS, describeCommand);
  return {
    layouts,
    components: componentCatalog(),
    charts: chartCatalog(),
    diagrams: DIAGRAM_CATALOG,
    icons,
    cli: { command: deckCommand(), version, commands },
    brands: { brands: yield* Effect.forEach(brands, (name) => describeBrand(root, name)) },
    slides: { decks: yield* Effect.forEach(decks, (name) => readDocsDeck(root, name)) },
    'brand-schema': brandJsonSchema(),
    'deck-config': deckConfigJsonSchema(),
    meta: { version, commit: yield* gitCommit(root), decks, brands },
  };
});

/**
 * Writes each part of the export to `<out>/<key>.json`, creating the folder. Every file is indented
 * JSON with a trailing newline. Files already in the folder that the export does not write are left
 * alone.
 *
 * @param out - The absolute output folder.
 * @param data - The export.
 * @throws FileSystemError in the error channel when the folder or a file cannot be written.
 */
export const writeDocsData = Effect.fn('writeDocsData')(function* (
  out: string,
  data: DocsData,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(out, { recursive: true })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError('create', out, error, 'Check that the parent folder is writable.'),
      ),
    );
  for (const [key, value] of Object.entries(data)) {
    const file = path.join(out, `${key}.json`);
    yield* fs
      .writeFileString(file, `${JSON.stringify(value, null, JSON_INDENT_SPACES)}\n`)
      .pipe(
        Effect.mapError((error) =>
          fileSystemError('write', file, error, 'Check that the output folder is writable.'),
        ),
      );
  }
});

/**
 * Collects the docs export and writes it to a folder, as the process's main program. A failure
 * prints its message and sets a non-zero exit code.
 *
 * @param options - The workspace, the published decks and brands, and the absolute output folder.
 */
export function runDocsData(options: DocsDataOptions & { out: string }): void {
  const program = collectDocsData(options).pipe(
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
 * One command's reference entry, its help loaded as `deck <name> --help` loads it in the published
 * CLI, which is what the docs' readers install, even when the export runs from the repository.
 *
 * @param command - The command.
 */
const describeCommand = Effect.fn('describeCommand')(function* (
  command: (typeof COMMANDS)[number],
): Effect.fn.Return<DocsCommand, CliError> {
  const help = yield* commandHelp(command, true);
  return { name: command.name, summary: command.summary, usage: usageLines(help), help };
});

/**
 * The usage forms at the top of a help text: the `Usage: ` line and the indented lines right below
 * it, without the prefix or indent. A line that starts with the program name (`deck`) starts a new
 * form; any other line continues the form above it, as when a long form wraps.
 *
 * @param help - The whole help text.
 */
function usageLines(help: string): string[] {
  const lines = help.split('\n');
  const end = lines.findIndex((line) => line.trim() === '');
  const block = lines
    .slice(0, end === -1 ? lines.length : end)
    .map((line) => (line.startsWith(USAGE_PREFIX) ? line.slice(USAGE_PREFIX.length) : line).trim());
  const program = `${block[0]?.split(' ')[0] ?? ''} `;
  const forms: string[] = [];
  for (const line of block) {
    const last = forms.length - 1;
    if (last < 0 || line.startsWith(program)) {
      forms.push(line);
    } else {
      forms[last] = `${forms[last]} ${line}`;
    }
  }

  return forms;
}

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
