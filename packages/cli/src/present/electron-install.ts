import { deckCommand } from '@deckster/engine/command';
import { Duration, Effect, FileSystem, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import path from 'node:path';

import { shellError, type ShellError } from '#cli-error.ts';

/**
 * How long a download may take before it is given up: Electron is about 120 MB.
 */
const INSTALL_TIMEOUT = Duration.minutes(15);

/**
 * The number of lines of the downloader's output a failure quotes when it matches no known cause.
 */
const QUOTED_LINES = 3;

/**
 * The command that downloads Electron's binary, as the reader types it.
 */
export function electronInstallCommand(): string {
  return `${deckCommand()} electron install`;
}

/**
 * What is on disk for the Electron the shell uses.
 */
export type ElectronStatus = {
  /**
   * The `electron` package folder.
   */
  directory: string;

  /**
   * The Electron version the installed package downloads, which the shell was tested with.
   */
  version: string;

  /**
   * The version of the downloaded binary, or null when nothing is downloaded.
   */
  downloadedVersion: string | null;

  /**
   * The absolute path of the executable, or null when it is missing.
   */
  executable: string | null;

  /**
   * Whether the binary is there and is the version the package expects.
   */
  ready: boolean;
};

/**
 * Reads a small text file, or null when it is missing or unreadable.
 *
 * @param file - The absolute path.
 */
const readOptional = Effect.fn('readOptional')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(file).pipe(
    Effect.map((text) => text.trim()),
    Effect.orElseSucceed(() => null),
  );
});

/**
 * Reads what the `electron` package folder holds: its version, and the version and executable its
 * downloader left in `dist/version` and `path.txt`. Nothing is downloaded and `electron` is never
 * imported.
 *
 * @param directory - The `electron` package folder.
 * @throws ShellError in the error channel when the package's own `package.json` cannot be read.
 */
export const readElectronStatus = Effect.fn('readElectronStatus')(function* (
  directory: string,
): Effect.fn.Return<ElectronStatus, ShellError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const manifest = yield* readOptional(path.join(directory, 'package.json'));
  const version = manifest === null ? undefined : packageVersion(manifest);
  if (version === undefined) {
    return yield* shellError(
      `The electron package in ${directory} is damaged (no version in its package.json). ` +
        'Reinstall @deckster/cli.',
    );
  }

  const downloaded = yield* readOptional(path.join(directory, 'dist', 'version'));
  const relative = yield* readOptional(path.join(directory, 'path.txt'));
  const candidate =
    relative === null || relative === '' ? null : path.join(directory, 'dist', relative);
  const executable =
    candidate !== null && (yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false)))
      ? candidate
      : null;
  const downloadedVersion = downloaded === null ? null : downloaded.replace(/^v/u, '');
  return {
    directory,
    version,
    downloadedVersion,
    executable,
    ready: executable !== null && downloadedVersion === version,
  };
});

/**
 * The `version` of a `package.json` text, or undefined when it has none.
 *
 * @param manifest - The file's text.
 */
function packageVersion(manifest: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(manifest);
    const version: unknown =
      typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : undefined;
    return typeof version === 'string' && version !== '' ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What `installElectron` did.
 */
export type ElectronInstall = {
  /**
   * Whether a download ran; false when the right binary was already there.
   */
  downloaded: boolean;

  /**
   * What is on disk afterwards.
   */
  status: ElectronStatus;
};

/**
 * Downloads Electron's binary into the `electron` package folder by running the package's own
 * downloader (`install.js`) with this Node, so it works the same whichever package manager
 * installed the CLI and whether or not it ran install scripts. The downloader verifies the
 * checksums the package ships and reuses Electron's download cache. A binary of the right version
 * is left alone unless `force` is set; `force` removes it first and skips the cache.
 *
 * @param directory - The `electron` package folder.
 * @param force - Download again even when the right binary is there.
 * @throws ShellError in the error channel when the download fails, with its cause in plain words.
 */
export const installElectron = Effect.fn('installElectron')(function* (
  directory: string,
  force: boolean,
): Effect.fn.Return<
  ElectronInstall,
  ShellError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const before = yield* readElectronStatus(directory);
  if (before.ready && !force) {
    return { downloaded: false, status: before };
  }

  const fs = yield* FileSystem.FileSystem;
  if (force) {
    yield* Effect.all(
      [
        fs.remove(path.join(directory, 'dist'), { recursive: true, force: true }),
        fs.remove(path.join(directory, 'path.txt'), { force: true }),
      ],
      { discard: true },
    ).pipe(
      Effect.mapError((cause) =>
        shellError(installFailure(directory, cause.message, before.version)),
      ),
    );
  }

  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(process.execPath, [path.join(directory, 'install.js')], {
          cwd: directory,
          env: force ? { force_no_cache: 'true' } : {},
          extendEnv: true,
          forceKillAfter: '2 seconds',
        }),
      );
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: 'unbounded' },
      );
      return { output: `${stderr}\n${stdout}`, code: Number(code) };
    }),
  ).pipe(
    Effect.timeout(INSTALL_TIMEOUT),
    Effect.mapError((cause) =>
      shellError(
        cause._tag === 'TimeoutError'
          ? `Downloading Electron ${before.version} took longer than ${Duration.format(INSTALL_TIMEOUT)} and was stopped. ` +
              'Check the connection and run the command again.'
          : `Electron's downloader did not start: ${cause.message}`,
      ),
    ),
  );
  if (result.code !== 0) {
    return yield* shellError(installFailure(directory, result.output, before.version));
  }

  const after = yield* readElectronStatus(directory);
  if (!after.ready) {
    return yield* shellError(
      `Electron's downloader finished, but ${path.join(directory, 'dist')} has no Electron ` +
        `${after.version} executable. Run \`${electronInstallCommand()} --force\`.`,
    );
  }

  return { downloaded: true, status: after };
});

/**
 * The known causes of a failed download, each with the words that give it away and what to tell the
 * reader. They are tried in order; the first match wins.
 */
const FAILURE_CAUSES: readonly {
  /**
   * Matches the downloader's output.
   */
  pattern: RegExp;

  /**
   * The explanation and fix.
   *
   * @param directory - The `electron` package folder.
   * @param version - The Electron version.
   */
  explain: (directory: string, version: string) => string;
}[] = [
  {
    pattern: /\b(?:EACCES|EPERM|EROFS)\b|permission denied|operation not permitted/iu,
    explain: (directory) =>
      `Cannot write to ${directory}. @deckster/cli was probably installed by another user or with ` +
      `sudo. Reinstall it as yourself (a Node version manager or an npm prefix you own avoids ` +
      `sudo), or run \`sudo ${electronInstallCommand()}\` once.`,
  },
  {
    pattern: /checksum/iu,
    explain: (_directory, version) =>
      `The downloaded Electron ${version} did not match its published checksum, so it was not ` +
      `installed. A proxy or a broken cache can cause this: run \`${electronInstallCommand()} ` +
      `--force\` to download it again without the cache.`,
  },
  {
    pattern:
      /\b(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EPROTO|CERT_|UNABLE_TO_GET_ISSUER_CERT|SELF_SIGNED_CERT)|getaddrinfo|socket hang up|HTTPError|RequestError|Response code \d+/iu,
    explain: (_directory, version) =>
      `Could not download Electron ${version} from GitHub. Check the connection; behind a proxy ` +
      `set HTTPS_PROXY, and where GitHub is blocked set ELECTRON_MIRROR to a mirror. Then run ` +
      `\`${electronInstallCommand()}\` again.`,
  },
  {
    pattern: /extract-zip|ERR_DLOPEN_FAILED|dlopen|NODE_MODULE_VERSION|was compiled against/iu,
    explain: (directory) =>
      `Electron was downloaded, but the module that unpacks it could not load in ${directory} ` +
      `(an install that skipped build scripts, or an OS policy that blocks native modules). ` +
      `Reinstall @deckster/cli with install scripts allowed and run \`${electronInstallCommand()}\` again.`,
  },
  {
    pattern: /Cannot find module '@electron\/get'|Cannot find module/iu,
    explain: () =>
      "Electron's downloader is missing from this install. Reinstall @deckster/cli, then run " +
      `\`${electronInstallCommand()}\` again.`,
  },
  {
    pattern: /Electron builds are not available on platform/iu,
    explain: () =>
      `Electron has no build for ${process.platform}-${process.arch}, so \`${deckCommand()} ` +
      'present` cannot open a window here.',
  },
];

/**
 * The message for a failed download: its cause in plain words when the output names a known one,
 * otherwise the first lines the downloader printed. Either way it ends with the `--browser`
 * alternative.
 *
 * @param directory - The `electron` package folder.
 * @param output - What the downloader printed, or the cause of a failed file operation.
 * @param version - The Electron version.
 */
export function installFailure(directory: string, output: string, version: string): string {
  const known = FAILURE_CAUSES.find((cause) => cause.pattern.test(output));
  const reason =
    known === undefined
      ? `Downloading Electron ${version} failed:\n${leadingLines(output)}`
      : known.explain(directory, version);
  return `${reason}\nUntil then, \`${deckCommand()} present --browser\` presents in Chrome.`;
}

/**
 * The first few non-empty lines of a text (where an error puts its message), indented, without a
 * stack trace's `at` frames.
 *
 * @param text - The text.
 */
function leadingLines(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '' && !/^\s*at /u.test(line));
  const quoted = lines.slice(0, QUOTED_LINES);
  return quoted.length === 0
    ? '  (it printed nothing)'
    : quoted.map((line) => `  ${line.trim()}`).join('\n');
}
