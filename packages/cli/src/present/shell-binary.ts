import type { ChildProcessSpawner } from 'effect/process';

import { FRAMEWORK_INSTALLED, HOOKS_ENV } from '@deckster/brand/node';
import { fileExists } from '@deckster/brand/node/file-exists';
import { Console, Effect, FileSystem } from 'effect';
import { createRequire } from 'node:module';
import path from 'node:path';

import { shellError, type ShellError } from '#cli-error.ts';
import { brandedAppWarning, ensureBrandedApp } from '#present/branded-app.ts';

/**
 * The command that downloads Electron's binary, named in every error about it.
 */
export const INSTALL_ELECTRON_COMMAND = 'pnpm --filter @deckster/shell exec install-electron';

/**
 * The command that downloads Electron's binary. A published CLI has no workspace to run `pnpm
 * --filter` in, and a package manager that skips install scripts (pnpm by default) leaves the
 * binary out, so it runs the package's own downloader, which works the same under every package
 * manager.
 *
 * @param electronDir - The `electron` package folder, when it is known.
 */
export function installElectronCommand(electronDir?: string): string {
  return FRAMEWORK_INSTALLED && electronDir !== undefined
    ? `node ${JSON.stringify(path.join(electronDir, 'install.js'))}`
    : INSTALL_ELECTRON_COMMAND;
}

/**
 * Where the Electron binary and the shell's entry file are.
 */
export type ShellBinary = {
  /**
   * The absolute path of the executable to start: the branded `Deckster.app` on macOS, otherwise
   * (and when the branded app could not be prepared) Electron's own.
   */
  executable: string;

  /**
   * Whether `executable` is the branded Deckster app.
   */
  branded: boolean;

  /**
   * The absolute path of the shell's main file, passed to Electron as its app.
   */
  entry: string;
};

/**
 * The `node_modules/electron` folder of `@deckster/shell`, found without loading `electron` itself:
 * `require('electron')` downloads the binary when it is missing, in the middle of a command.
 *
 * @throws ShellError in the error channel when the package is not installed.
 */
export const findElectronPackage = Effect.fn('findElectronPackage')(function* (): Effect.fn.Return<
  string,
  ShellError
> {
  return yield* Effect.try({
    try: () => {
      const shellPackage = createRequire(import.meta.url).resolve('@deckster/shell/package.json');
      return path.dirname(createRequire(shellPackage).resolve('electron/package.json'));
    },
    catch: () =>
      shellError(
        'The electron package is not installed, so `deckster present` cannot open a window.\n' +
          (FRAMEWORK_INSTALLED
            ? 'Electron is an optional dependency that the install skipped or could not fetch: ' +
              'reinstall @deckster/cli, '
            : `Run \`pnpm install\`, then \`${INSTALL_ELECTRON_COMMAND}\` to download the binary, `) +
          'or pass --browser to present in Chrome.',
      ),
  });
});

/**
 * Finds the Electron executable from `node_modules/electron/path.txt`, which the package's
 * downloader writes, and on macOS swaps it for the branded `Deckster.app` built from it
 * (`ensureBrandedApp`, cached under `<root>/.deck/shell/app`; one `stat` when warm). When the
 * branded app cannot be prepared it prints one warning and returns Electron's own executable.
 * Nothing is downloaded and `electron` is never imported.
 *
 * @param root - The workspace root, whose `.deck/shell/app` holds the branded app.
 * @param electronDir - The package folder to look in; defaults to the one `@deckster/shell` uses.
 *   Tests point it at a folder without a binary.
 * @throws ShellError in the error channel when the package or the binary is missing; the message
 *   names the command that downloads it and the `--browser` alternative.
 */
export const resolveShellBinary = Effect.fn('resolveShellBinary')(function* (
  root: string,
  electronDir?: string,
): Effect.fn.Return<
  ShellBinary,
  ShellError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const fs = yield* FileSystem.FileSystem;
  const directory = electronDir ?? (yield* findElectronPackage());
  const missing = shellError(
    `Electron's binary is not downloaded (${path.join(directory, 'dist')}), ` +
      'so `deckster present` cannot open a window.\n' +
      `Run \`${installElectronCommand(directory)}\` (about 120 MB), or pass --browser to present in Chrome.`,
  );
  const relative = yield* fs
    .readFileString(path.join(directory, 'path.txt'))
    .pipe(Effect.mapError(() => missing));
  const executable = path.join(directory, 'dist', relative.trim());
  if (relative.trim() === '' || !(yield* fileExists(executable))) {
    return yield* missing;
  }

  const entry = yield* Effect.try({
    try: () => shellEntry(),
    catch: () =>
      shellError(
        FRAMEWORK_INSTALLED
          ? 'The @deckster/shell package is missing from this install. Reinstall @deckster/cli.'
          : 'The @deckster/shell package is not installed. Run `pnpm install`.',
      ),
  });
  // The real path: macOS refuses to launch an app bundle through a pnpm symlink in some sandboxes.
  const real = yield* fs.realPath(executable).pipe(Effect.orElseSucceed(() => executable));
  const branded = yield* ensureBrandedApp(root, directory);
  if (branded._tag === 'Branded') {
    return { executable: branded.executable, entry, branded: true };
  }

  if (branded._tag === 'Unavailable') {
    yield* Console.error(brandedAppWarning(branded.reason));
  }

  return { executable: real, entry, branded: false };
});

/**
 * The file Electron starts as its app. A published CLI starts `shell-main.js`, which registers the
 * hooks before it loads the shell's TypeScript; the checkout starts the shell's entry directly.
 */
function shellEntry(): string {
  const hooks = process.env[HOOKS_ENV];
  return hooks === undefined || hooks === ''
    ? createRequire(import.meta.url).resolve('@deckster/shell/main')
    : path.join(path.dirname(hooks), 'shell-main.js');
}
