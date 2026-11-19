import { fileExists } from '@deckster/brand/node/file-exists';
import {
  APP_NAME,
  BUNDLE_SOURCES,
  brandedAppKey,
  brandedAppPlan,
  readBrandedAppInputs,
  type BrandedAppInputs,
  type BrandedAppPlan,
  type PlistEdit,
  type SigningMode,
} from '@deckster/shell/bundle';
import { Effect, FileSystem, Option, Stream, type Duration } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { shellError, type ShellError } from '#cli-error.ts';

/**
 * How old an unfinished build folder must be before it is removed, so a build that is running right
 * now is never touched.
 */
const STALE_BUILD_MS = 10 * 60 * 1000;

/**
 * How long a key folder may go unused before it is removed after a build. Every run that finds the
 * bundle touches its folder, so only a bundle nobody has started for this long is removed.
 */
const STALE_KEY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long `cp` and `codesign` may take before the build gives up and the fallbacks take over.
 */
const SLOW_TOOL_TIMEOUT: Duration.Input = '30 seconds';

/**
 * How long every other tool (`plutil`, `ps`) may take.
 */
const QUICK_TOOL_TIMEOUT: Duration.Input = '10 seconds';

/**
 * The portable cp used by the task runner reports this when it sees macOS's clone flag.
 */
const COPY_CLONE_FLAG_REJECTED = "unexpected argument '-c' found";

/**
 * The result of looking for the branded app.
 */
export type BrandedApp =
  | {
      /**
       * The app is there.
       */
      _tag: 'Branded';

      /**
       * The absolute path of `Deckster.app/Contents/MacOS/Deckster`.
       */
      executable: string;

      /**
       * How the bundle is signed.
       */
      signing: SigningMode;

      /**
       * Whether this call built it (false for a cache hit or a build another run won).
       */
      built: boolean;
    }
  | {
      /**
       * Not applicable: another platform, or an Electron folder that is not a macOS app bundle.
       */
      _tag: 'NotApplicable';
    }
  | {
      /**
       * The build failed; the caller starts stock Electron and shows the reason.
       */
      _tag: 'Unavailable';

      /**
       * What failed, in one line.
       */
      reason: string;
    };

/**
 * The folder the branded apps live in.
 *
 * @param root - The workspace root.
 */
export function brandedAppsDir(root: string): string {
  return path.join(root, '.deck', 'shell', 'app');
}

/**
 * The one-line warning for a stock-Electron fallback.
 *
 * @param reason - Why the branded app is not available.
 */
export function brandedAppWarning(reason: string): string {
  return `Could not prepare ${APP_NAME}.app (${reason}); the window will show as "Electron".`;
}

/**
 * The first line of a message, cut to a reasonable length for a one-line warning.
 *
 * @param message - The message.
 */
function oneLine(message: string): string {
  const line = message.trim().split('\n')[0] ?? '';
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

/**
 * Runs a program to completion.
 *
 * @param command - The program.
 * @param args - Its arguments.
 * @param timeout - How long it may take; the process is killed when the scope closes.
 * @returns What it printed on standard output.
 * @throws ShellError in the error channel when it cannot start, times out or exits non-zero.
 */
const runTool = Effect.fn('runTool')(function* (
  command: string,
  args: readonly string[],
  timeout: Duration.Input = QUICK_TOOL_TIMEOUT,
): Effect.fn.Return<string, ShellError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      // On a timeout the spawner sends SIGTERM; a tool that ignores it is killed 2 s later, so a
      // hung `codesign` or `cp` can never block `deck present`.
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, [...args], { forceKillAfter: '2 seconds' }),
      );
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: 'unbounded' },
      );
      return { stdout, stderr, code: Number(code) };
    }),
  ).pipe(
    Effect.timeout(timeout),
    Effect.mapError((cause) =>
      cause._tag === 'TimeoutError'
        ? shellError(`\`${path.basename(command)} ${args[0] ?? ''}\` timed out`)
        : shellError(`\`${command}\` did not start: ${cause.message}`),
    ),
  );
  if (result.code !== 0) {
    return yield* shellError(
      `\`${path.basename(command)} ${args[0] ?? ''}\` failed: ${oneLine(result.stderr) || `exit ${result.code}`}`,
    );
  }

  return result.stdout;
});

/**
 * What the key and the build need from Electron's package, read once.
 */
type Sources = {
  /**
   * Electron's stock `Electron.app`.
   */
  app: string;

  /**
   * The key inputs without the signing mode.
   */
  inputs: Omit<BrandedAppInputs, 'signing'>;

  /**
   * Electron's version.
   */
  version: string;
};

/**
 * Reads Electron's version and the small files the key hashes, through the one reader the shell
 * package keeps (`readBrandedAppInputs`, which `findBrandedApp` uses too).
 *
 * @param electronDir - The `electron` package folder.
 * @throws ShellError in the error channel when a file cannot be read.
 */
const readSources = Effect.fn('readSources')(function* (
  electronDir: string,
): Effect.fn.Return<Sources, ShellError> {
  const inputs = yield* Effect.try({
    try: () => readBrandedAppInputs(electronDir),
    catch: (cause) =>
      shellError(`Could not read Electron's files: ${cause instanceof Error ? cause.message : ''}`),
  });
  return {
    app: path.join(electronDir, 'dist', 'Electron.app'),
    version: inputs.electronVersion,
    inputs,
  };
});

/**
 * Applies one edit to a plist with `plutil`. A set is `-replace`, which adds a key that is missing,
 * so a future Electron that drops or adds a key does not fail the build. A remove of a key that is
 * already missing counts as done.
 *
 * @param file - The plist.
 * @param edit - The edit.
 * @throws ShellError in the error channel when `plutil` fails for another reason.
 */
export const applyPlistEdit = Effect.fn('applyPlistEdit')(function* (
  file: string,
  edit: PlistEdit,
): Effect.fn.Return<void, ShellError, ChildProcessSpawner.ChildProcessSpawner> {
  if (edit.op === 'replace') {
    yield* runTool('/usr/bin/plutil', ['-replace', edit.key, '-string', edit.value, file]);
    return;
  }

  const removed = yield* Effect.result(runTool('/usr/bin/plutil', ['-remove', edit.key, file]));
  if (removed._tag === 'Success') {
    return;
  }

  const stillThere = yield* Effect.result(
    runTool('/usr/bin/plutil', ['-extract', edit.key, 'raw', file]),
  );
  if (stillThere._tag === 'Success') {
    return yield* removed.failure;
  }

  // The key is missing, or the file cannot be read; only the first is fine.
  yield* runTool('/usr/bin/plutil', ['-lint', file]).pipe(Effect.mapError(() => removed.failure));
});

/**
 * Clones Electron.app into the temporary folder and applies the plan: renames, plist edits, icon,
 * stub and stamp. Nothing is signed.
 *
 * @param plan - What to do.
 * @param sources - Electron's package.
 * @param app - The destination `.app` folder.
 * @throws ShellError in the error channel when a step fails.
 */
const prepareBundle = Effect.fn('prepareBundle')(function* (
  plan: BrandedAppPlan,
  sources: Sources,
  app: string,
): Effect.fn.Return<
  void,
  ShellError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const fs = yield* FileSystem.FileSystem;
  /**
   * A path inside the new bundle.
   */
  const inApp = (relative: string) => path.join(app, relative);
  /**
   * The error for a failed file step.
   */
  const fileFailure = (action: string) => (cause: { message: string }) =>
    shellError(`Could not ${action}: ${cause.message}`);
  // On APFS `cp -c` clones (no data is copied); elsewhere it copies.
  const clone = runTool('/bin/cp', ['-c', '-R', sources.app, app], SLOW_TOOL_TIMEOUT);
  yield* clone.pipe(
    Effect.catchIf(
      (error) => stripVTControlCharacters(error.message).includes(COPY_CLONE_FLAG_REJECTED),
      // Framework symlinks must survive when the copy tool does not support cloning.
      () => runTool('/bin/cp', ['-R', '-P', sources.app, app], SLOW_TOOL_TIMEOUT),
    ),
  );
  for (const rename of plan.renames) {
    yield* fs
      .rename(inApp(rename.from), inApp(rename.to))
      .pipe(Effect.mapError(fileFailure(`rename ${rename.from}`)));
  }

  for (const removal of plan.removals) {
    yield* fs
      .remove(inApp(removal), { force: true })
      .pipe(Effect.mapError(fileFailure(`remove ${removal}`)));
  }

  yield* fs
    .copyFile(BUNDLE_SOURCES.icon, inApp(plan.icon))
    .pipe(Effect.mapError(fileFailure('install the icon')));
  yield* fs
    .makeDirectory(inApp(plan.stubFolder), { recursive: true })
    .pipe(Effect.mapError(fileFailure('create the stub folder')));
  for (const file of BUNDLE_SOURCES.stubFiles) {
    yield* fs
      .copyFile(path.join(BUNDLE_SOURCES.stubFolder, file), inApp(path.join(plan.stubFolder, file)))
      .pipe(Effect.mapError(fileFailure(`install the stub's ${file}`)));
  }

  // One folder of edits per plist; the files differ, so they run side by side.
  yield* Effect.forEach(
    plan.plists,
    (plist) =>
      Effect.forEach(plist.edits, (edit) => applyPlistEdit(inApp(plist.file), edit), {
        concurrency: 1,
        discard: true,
      }),
    { concurrency: 'unbounded', discard: true },
  );

  yield* fs
    .writeFileString(inApp('Contents/Resources/deckster-bundle.json'), plan.stamp)
    .pipe(Effect.mapError(fileFailure('write the bundle stamp')));
});

/**
 * Signs the bundle ad hoc, inside out, and verifies the app and each helper.
 *
 * @param plan - What to sign.
 * @param app - The `.app` folder.
 * @throws ShellError in the error channel when `codesign` fails.
 */
const signBundle = Effect.fn('signBundle')(function* (
  plan: BrandedAppPlan,
  app: string,
): Effect.fn.Return<void, ShellError, ChildProcessSpawner.ChildProcessSpawner> {
  for (const group of plan.signing) {
    yield* runTool(
      '/usr/bin/codesign',
      ['--force', '--sign', '-', ...group.map((target) => path.join(app, target))],
      SLOW_TOOL_TIMEOUT,
    );
  }

  for (const target of plan.verify) {
    yield* runTool(
      '/usr/bin/codesign',
      ['--verify', '--strict', path.join(app, target)],
      SLOW_TOOL_TIMEOUT,
    );
  }
});

/**
 * What one build attempt came to.
 */
type BuildOutcome = 'built' | 'raced' | { signingFailed: string };

/**
 * Builds one bundle in a temporary folder and renames it into place; a folder for a key is never
 * changed once it is there. Losing the rename to another run is not a failure: that run's bundle is
 * used.
 *
 * @param outDir - The folder of branded apps.
 * @param sources - Electron's package.
 * @param signing - How to sign.
 * @param key - The cache key.
 * @throws ShellError in the error channel when the copy or the edits fail.
 */
const buildBundle = Effect.fn('buildBundle')(function* (
  outDir: string,
  sources: Sources,
  signing: SigningMode,
  key: string,
): Effect.fn.Return<
  BuildOutcome,
  ShellError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const fs = yield* FileSystem.FileSystem;
  const plan = brandedAppPlan(signing, key, sources.version);
  const finalDir = path.join(outDir, key);
  const tempDir = path.join(outDir, `.build-${process.pid}-${randomBytes(4).toString('hex')}`);
  const app = path.join(tempDir, plan.appFolder);
  return yield* Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        fs
          .makeDirectory(tempDir, { recursive: true })
          .pipe(
            Effect.mapError((cause) => shellError(`Could not create ${tempDir}: ${cause.message}`)),
          ),
        () => fs.remove(tempDir, { recursive: true, force: true }).pipe(Effect.ignore),
      );
      yield* prepareBundle(plan, sources, app);
      const signed = yield* Effect.result(signBundle(plan, app));
      if (signed._tag === 'Failure') {
        return { signingFailed: signed.failure.message };
      }

      // A fresh modification time makes LaunchServices read the bundle again.
      const now = new Date();
      yield* fs.utimes(app, now, now).pipe(Effect.ignore);
      const renamed = yield* Effect.result(fs.rename(tempDir, finalDir));
      if (renamed._tag === 'Failure') {
        const executable = path.join(finalDir, plan.appFolder, plan.executable);
        if (yield* fileExists(executable)) {
          return 'raced' as const;
        }

        // The key folder is there without the app (partly deleted): a rename of a folder onto a
        // non-empty one fails, on every run. Remove it (a link is removed as a link) and retry once.
        yield* fs.remove(finalDir, { recursive: true, force: true }).pipe(Effect.ignore);
        const retried = yield* Effect.result(fs.rename(tempDir, finalDir));
        if (retried._tag === 'Failure') {
          return (yield* fileExists(executable))
            ? ('raced' as const)
            : yield* shellError(
                `Could not move the bundle into ${finalDir}: ${retried.failure.message}`,
              );
        }
      }

      return 'built' as const;
    }),
  );
});

/**
 * Removes what earlier builds left behind, best effort and only after a build: unfinished `.build-`
 * folders older than ten minutes, and key folders of other builds untouched for 30 days (every run
 * that finds a bundle touches its folder). A folder some process still runs from, by the paths `ps`
 * shows, is kept as an extra guard. Only folders this code creates are touched: a 16-hex-character
 * name holding `Deckster.app`.
 *
 * @param outDir - The folder of branded apps.
 * @param keep - The key in use.
 */
const pruneStale = Effect.fn('pruneStale')(function* (
  outDir: string,
  keep: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(outDir).pipe(Effect.orElseSucceed(() => [] as string[]));
  const running = yield* runTool('/bin/ps', ['-axo', 'command=']).pipe(
    Effect.orElseSucceed(() => ''),
  );
  yield* Effect.forEach(
    names,
    (name) =>
      Effect.gen(function* () {
        const folder = path.join(outDir, name);
        const isBuild = name.startsWith('.build-');
        if (!isBuild && (name === keep || !/^[0-9a-f]{16}$/.test(name))) {
          return;
        }

        const info = yield* fs.stat(folder);
        const age = Date.now() - Option.getOrElse(info.mtime, () => new Date()).getTime();
        if (isBuild) {
          if (age > STALE_BUILD_MS) {
            yield* fs.remove(folder, { recursive: true, force: true });
          }
        } else if (
          age > STALE_KEY_MS &&
          !running.includes(`${folder}${path.sep}`) &&
          (yield* fileExists(path.join(folder, `${APP_NAME}.app`)))
        ) {
          yield* fs.remove(folder, { recursive: true, force: true });
        }
      }).pipe(Effect.ignore),
    { concurrency: 1, discard: true },
  );
});

/**
 * Finds the branded `Deckster.app` for Electron's package, or builds it: an APFS clone of
 * `Electron.app` with the executable and helpers renamed, five `Info.plist`s edited, the icon
 * swapped, Electron's default app replaced by a stub, and the helpers and the app re-signed ad hoc
 * (the 207 MB framework is left as shipped, so the clone costs about 1 MB of disk). The result
 * lives in `<workspace>/.deck/shell/app/<key>/Deckster.app`. With a warm cache this reads about 700
 * KB and stats one file.
 *
 * The fallbacks, in order: the signed bundle; when signing or verifying fails, the unsigned bundle
 * (under its own key); when the copy or an edit fails, `Unavailable`, and the caller starts stock
 * Electron. Nothing is downloaded and nothing but `<workspace>/.deck/shell/app` is written.
 *
 * @param root - The workspace root.
 * @param electronDir - The `electron` package folder.
 * @param platform - `process.platform`; the app is built on macOS only.
 */
export const ensureBrandedApp = Effect.fn('ensureBrandedApp')(function* (
  root: string,
  electronDir: string,
  platform: string = process.platform,
): Effect.fn.Return<
  BrandedApp,
  never,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  if (platform !== 'darwin') {
    return { _tag: 'NotApplicable' };
  }

  if (!(yield* fileExists(path.join(electronDir, 'dist', 'Electron.app')))) {
    return { _tag: 'NotApplicable' };
  }

  const outDir = brandedAppsDir(root);
  const plan = brandedAppPlan('outer', '', '');
  const sourcesResult = yield* Effect.result(readSources(electronDir));
  if (sourcesResult._tag === 'Failure') {
    return { _tag: 'Unavailable', reason: oneLine(sourcesResult.failure.message) };
  }

  const sources = sourcesResult.success;
  /**
   * The cache key for a signing mode.
   */
  const keyFor = (signing: SigningMode) => brandedAppKey({ ...sources.inputs, signing });
  /**
   * The branded executable for a key.
   */
  const executableFor = (key: string) => path.join(outDir, key, plan.appFolder, plan.executable);
  for (const signing of ['outer', 'none'] as const) {
    const executable = executableFor(keyFor(signing));
    if (yield* fileExists(executable)) {
      // Marks the bundle as used, so only one nobody starts is pruned.
      const now = new Date();
      yield* FileSystem.FileSystem.pipe(
        Effect.flatMap((fs) => fs.utimes(path.join(outDir, keyFor(signing)), now, now)),
        Effect.ignore,
      );
      return { _tag: 'Branded', executable, signing, built: false };
    }
  }

  const fs = yield* FileSystem.FileSystem;
  const attempt = Effect.gen(function* () {
    yield* fs
      .makeDirectory(outDir, { recursive: true })
      .pipe(Effect.mapError((cause) => shellError(`Could not create ${outDir}: ${cause.message}`)));
    const signed = yield* buildBundle(outDir, sources, 'outer', keyFor('outer'));
    if (typeof signed !== 'object') {
      return { outcome: signed, signing: 'outer' as SigningMode };
    }

    // Signing or verifying failed: the unsigned bundle still launches, under its own key.
    const unsigned = yield* buildBundle(outDir, sources, 'none', keyFor('none'));
    return { outcome: unsigned, signing: 'none' as SigningMode };
  });
  const result = yield* Effect.result(attempt);
  if (result._tag === 'Failure') {
    return { _tag: 'Unavailable', reason: oneLine(result.failure.message) };
  }

  const { outcome: built, signing } = result.success;
  if (typeof built === 'object') {
    return { _tag: 'Unavailable', reason: oneLine(built.signingFailed) };
  }

  const key = keyFor(signing);
  yield* pruneStale(outDir, key);
  return {
    _tag: 'Branded',
    executable: executableFor(key),
    signing,
    built: built === 'built',
  };
});
