import { assertDocsBrands } from '@deckster/cli/docs-brands';
import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { DOCS_BRANDS, DOCS_DECKS } from './docs-allowlist.ts';

/**
 * The workspace root: the folder above `scripts/`.
 */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * The environment every `deck` the scripts start runs with: the inherited one, with `DECK_ROOT` set
 * to this workspace, so a `DECK_ROOT` exported in the shell cannot point the CLI at another
 * workspace's decks. A scratch workspace overrides it on purpose.
 */
export const DECK_ENV: NodeJS.ProcessEnv = { ...process.env, DECK_ROOT: WORKSPACE_ROOT };

/**
 * The workspace's own `deck` binary, run directly so no package manager sits in between.
 */
export const DECK_BIN = path.join(WORKSPACE_ROOT, 'node_modules', '.bin', 'deck');

/**
 * Milliseconds in a second.
 */
const MS_PER_SECOND = 1000;

/**
 * The workspace folders `--out` may not be or sit inside, because the scripts replace folders under
 * `--out`. `node_modules` is among them because its links lead back into the sources.
 */
const PROTECTED_FOLDERS = [
  'decks',
  'brands',
  'packages',
  'scripts',
  'docs',
  'node_modules',
  '.git',
] as const;

/**
 * What a finished `deck` run printed and how it exited.
 */
export type DeckRun = {
  /**
   * The exit code, or `null` when a signal ended the process.
   */
  readonly code: number | null;

  /**
   * Everything written to standard output.
   */
  readonly stdout: string;

  /**
   * Everything written to standard error.
   */
  readonly stderr: string;
};

/**
 * The arguments of a docs script: the output folder and the boolean flags it was given.
 */
export type ScriptArgs = {
  /**
   * The output folder, absolute, with every symbolic link in it resolved.
   */
  readonly out: string;

  /**
   * The names of the boolean flags given, such as `strict`.
   */
  readonly flags: ReadonlySet<string>;
};

/**
 * Reads the required `--out <dir>` argument of a docs script.
 *
 * @param script - The script's file name, for the usage line.
 * @returns The output folder, absolute and resolved as {@link readScriptArgs} resolves it.
 * @throws Error as {@link readScriptArgs} does.
 */
export function readOutDir(script: string): string {
  return readScriptArgs(script, []).out;
}

/**
 * Reads the required `--out <dir>` argument of a docs script and its boolean flags. The folder is
 * resolved against the current directory and then through its symbolic links (those of its nearest
 * existing ancestor, when it does not exist yet), so a link cannot lead the script into the
 * sources.
 *
 * @param script - The script's file name, for the usage line.
 * @param flags - The boolean flags the script accepts, without `--`.
 * @returns The resolved output folder and the flags given.
 * @throws Error when `--out` is missing, an unknown argument is given, or the resolved folder is
 *   the workspace root, contains it, or sits inside `decks/`, `brands/`, `packages/`, `scripts/`,
 *   `docs/`, `node_modules/` or `.git/`.
 */
export function readScriptArgs(script: string, flags: readonly string[]): ScriptArgs {
  const options = Object.fromEntries(flags.map((flag) => [flag, { type: 'boolean' as const }]));
  const { values } = parseArgs({ options: { ...options, out: { type: 'string' } } });
  const usageFlags = flags.map((flag) => ` [--${flag}]`).join('');
  if (typeof values.out !== 'string' || values.out === '') {
    throw new Error(`Usage: node scripts/${script} --out <dir>${usageFlags}`);
  }

  const out = resolveThroughLinks(path.resolve(process.cwd(), values.out));
  if (isProtected(out)) {
    throw new Error(`--out must not be the workspace root or inside its sources: ${out}`);
  }

  const given = flags.filter((flag) => Reflect.get(values, flag) === true);
  return { out, flags: new Set(given) };
}

/**
 * An absolute path with the symbolic links of its nearest existing ancestor resolved, and the
 * missing rest appended as written.
 *
 * @param absolute - An absolute, normalized path.
 * @returns The path as the file system will reach it.
 */
function resolveThroughLinks(absolute: string): string {
  let existing = absolute;
  while (!existsSync(existing) && path.dirname(existing) !== existing) {
    existing = path.dirname(existing);
  }

  return path.join(realpathSync.native(existing), path.relative(existing, absolute));
}

/**
 * Whether a folder is the workspace root, contains it, or sits inside one of the folders a docs
 * script must never replace. Both sides are compared as real paths.
 *
 * @param folder - An absolute path whose links are resolved.
 * @returns `true` when writing there could delete sources.
 */
function isProtected(folder: string): boolean {
  const root = realpathSync.native(WORKSPACE_ROOT);
  if (isInside(root, folder)) {
    return true;
  }

  return PROTECTED_FOLDERS.some((name) => isInside(folder, path.join(root, name)));
}

/**
 * Whether `inner` is `outer` or sits inside it.
 *
 * @param inner - An absolute path.
 * @param outer - An absolute path.
 * @returns `true` when `inner` is `outer` or below it.
 */
function isInside(inner: string, outer: string): boolean {
  const relative = path.relative(outer, inner);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Fails unless every allowlisted deck renders with an allowlisted brand, so a script never shoots,
 * builds or exports a brand the docs do not publish.
 *
 * @returns A promise that resolves when every deck's brand is allowlisted.
 * @throws Error naming each deck and its brand otherwise.
 */
export function requireDocsBrands(): Promise<void> {
  return assertDocsBrands({ root: WORKSPACE_ROOT, decks: DOCS_DECKS, brands: DOCS_BRANDS });
}

/**
 * Runs `deck` in the workspace root, with `DECK_ROOT` set to it, and collects its output. A
 * non-zero exit is not an error here: callers decide, because `deck shot` exits 1 for a broken
 * slide and still prints its JSON.
 *
 * @param args - The arguments after `deck`.
 * @returns The exit code and output.
 * @throws Error when the binary cannot be started.
 */
export function runDeck(args: readonly string[]): Promise<DeckRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(DECK_BIN, args, {
      cwd: WORKSPACE_ROOT,
      env: DECK_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * Seconds since `start`, with one decimal, for progress lines.
 *
 * @param start - A `performance.now()` reading.
 * @returns The elapsed time, such as `"12.3s"`.
 */
export function elapsed(start: number): string {
  return `${((performance.now() - start) / MS_PER_SECOND).toFixed(1)}s`;
}
