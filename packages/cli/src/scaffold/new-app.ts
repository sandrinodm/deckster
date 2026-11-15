import { fileExists } from '@deckster/brand/node';
import { APPS_DIR, findDeck, type DeckBuildError } from '@deckster/vite-plugin';
import { Effect, type FileSystem } from 'effect';
import path from 'node:path';

import { cliError, type CliError, type FileSystemError } from '#cli-error.ts';
import { appFiles } from '#scaffold/app-templates.ts';
import { assertKebabName } from '#scaffold/names.ts';
import { readText, writeFiles } from '#scaffold/write-files.ts';

/**
 * The dependencies a deck needs to host mini apps, with the range each takes: the bridge from the
 * workspace, React from the workspace catalog.
 */
const APP_DEPENDENCIES: Readonly<Record<string, string>> = {
  /**
   * The bridge, linked from the workspace.
   */
  '@deckster/app-bridge': 'workspace:*',

  /**
   * React's renderer for the app's entry.
   */
  'react-dom': 'catalog:',
};

/**
 * The development dependencies an app's types need.
 */
const APP_DEV_DEPENDENCIES: Readonly<Record<string, string>> = {
  /**
   * Types for `react-dom/client`.
   */
  '@types/react-dom': 'catalog:',
};

/**
 * Spaces of indentation in the deck's JSON files.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The `include` list of a `tsconfig.json`, on one line or several, capturing the indentation of its
 * key and the entries.
 */
const INCLUDE_PATTERN = /^([ \t]*)"include":\s*\[([^\]]*)\]/m;

/**
 * The formatter's line width, which decides whether the list fits on one line.
 */
const PRINT_WIDTH = 100;

/**
 * What `deck new app` created.
 */
export type CreatedApp = {
  /**
   * Absolute paths of the files written or changed.
   */
  files: string[];

  /**
   * Whether the deck's `package.json` gained dependencies, so `pnpm install` must run before the
   * app builds.
   */
  needsInstall: boolean;
};

/**
 * Creates `decks/<deck>/apps/<name>/` with an `index.html`, an entry, a component wired to the
 * bridge and a stylesheet, and prepares the deck to build it: the bridge and `react-dom` join the
 * deck's `package.json`, and `apps` joins the `include` list of its `tsconfig.json`.
 *
 * @param workspaceRoot - The workspace that contains the deck.
 * @param deckId - The deck folder name.
 * @param name - The app folder name, in kebab-case.
 * @returns The files written and whether `pnpm install` is needed.
 * @throws CliError in the error channel when the name is invalid or the app exists; DeckBuildError
 *   when the deck does not exist; FileSystemError when a file cannot be read or written.
 */
export const createApp = Effect.fn('createApp')(function* (
  workspaceRoot: string,
  deckId: string,
  name: string,
): Effect.fn.Return<
  CreatedApp,
  CliError | DeckBuildError | FileSystemError,
  FileSystem.FileSystem
> {
  yield* assertKebabName('app name', name);
  const deck = yield* findDeck(workspaceRoot, deckId);
  const appDir = path.join(deck.dir, APPS_DIR, name);
  if (yield* fileExists(appDir)) {
    return yield* cliError(
      `${APPS_DIR}/${name} already exists in deck "${deck.id}". Pick another name.`,
    );
  }

  const packageFile = path.join(deck.dir, 'package.json');
  const tsconfigFile = path.join(deck.dir, 'tsconfig.json');
  // A deck in a published CLI's workspace has neither file; there is nothing to prepare then.
  const packageUpdate = (yield* fileExists(packageFile))
    ? withAppDependencies(yield* readText(packageFile))
    : undefined;
  const tsconfigUpdate = (yield* fileExists(tsconfigFile))
    ? withAppsIncluded(yield* readText(tsconfigFile))
    : undefined;
  const sources = Object.entries(appFiles(name)).map(
    ([relative, content]) => [path.join(appDir, relative), content] as const,
  );
  const files = yield* writeFiles({
    ...Object.fromEntries(sources),
    ...(packageUpdate === undefined ? {} : { [packageFile]: packageUpdate }),
    ...(tsconfigUpdate === undefined ? {} : { [tsconfigFile]: tsconfigUpdate }),
  });
  return { files, needsInstall: packageUpdate !== undefined };
});

/**
 * The deck's `package.json` with the app dependencies added, or `undefined` when it has them all or
 * is not a JSON object.
 *
 * @param source - The file's text.
 */
export function withAppDependencies(source: string): string | undefined {
  const parsed: unknown = parseJson(source);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const manifest: Record<string, unknown> = { ...parsed };
  const dependencies = addMissing(manifest['dependencies'], APP_DEPENDENCIES);
  const devDependencies = addMissing(manifest['devDependencies'], APP_DEV_DEPENDENCIES);
  if (dependencies === undefined && devDependencies === undefined) {
    return undefined;
  }

  return `${JSON.stringify(
    {
      ...manifest,
      ...(dependencies === undefined ? {} : { dependencies }),
      ...(devDependencies === undefined ? {} : { devDependencies }),
    },
    null,
    JSON_INDENT_SPACES,
  )}\n`;
}

/**
 * The deck's `tsconfig.json` with `apps` in its `include` list, or `undefined` when it is there
 * already or the file has no `include` array. Only the list is rewritten, the way the formatter
 * prints it: on one line when it fits in the print width, else one entry per line.
 *
 * @param source - The file's text.
 */
export function withAppsIncluded(source: string): string | undefined {
  const match = INCLUDE_PATTERN.exec(source);
  const entries = match === null ? undefined : parseJson(`[${match[2] ?? ''}]`);
  if (match === null || !Array.isArray(entries) || entries.includes(APPS_DIR)) {
    return undefined;
  }

  const indent = match[1] ?? '';
  const items = [...entries, APPS_DIR].map((entry) => JSON.stringify(entry));
  const oneLine = `${indent}"include": [${items.join(', ')}]`;
  const list = oneLine.length <= PRINT_WIDTH ? oneLine : includeListLines(indent, items);
  return source.replace(INCLUDE_PATTERN, () => list);
}

/**
 * A dependency table with the missing entries added, sorted by name, or `undefined` when none was
 * missing.
 *
 * @param table - The existing table, whatever it is.
 * @param wanted - The entries it should have.
 */
function addMissing(
  table: unknown,
  wanted: Readonly<Record<string, string>>,
): Record<string, unknown> | undefined {
  const current: Record<string, unknown> =
    typeof table === 'object' && table !== null && !Array.isArray(table) ? { ...table } : {};
  const missing = Object.entries(wanted).filter(([name]) => !(name in current));
  if (missing.length === 0) {
    return undefined;
  }

  const merged = { ...current, ...Object.fromEntries(missing) };
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The `include` list written one entry per line, each indented one level past its key.
 *
 * @param indent - The indentation of the `include` key.
 * @param items - The entries, already quoted as JSON.
 */
function includeListLines(indent: string, items: readonly string[]): string {
  return [
    `${indent}"include": [`,
    items.map((item) => `${indent}  ${item}`).join(',\n'),
    `${indent}]`,
  ].join('\n');
}

/**
 * Parses JSON, `undefined` for text that is not JSON.
 *
 * @param source - The text.
 */
function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return undefined;
  }
}
