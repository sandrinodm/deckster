import { Context, Effect, FileSystem, Layer } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { shellError, type ShellError } from '#cli-error.ts';

/**
 * How a deck URL was opened without Electron.
 */
export type BrowserOpening = 'chrome-app' | 'default-browser';

/**
 * The places an installed Chrome (or Chromium-based browser) lives, by platform, most preferred
 * first. A bare name is looked up on `PATH` by the system.
 *
 * @param platform - `process.platform`.
 * @param env - The process environment, for the Windows program folders.
 */
export function chromeCandidates(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }

  if (platform === 'win32') {
    return [env['ProgramFiles'], env['ProgramFiles(x86)'], env['LocalAppData']]
      .filter((folder): folder is string => folder !== undefined && folder !== '')
      .map((folder) => `${folder}\\Google\\Chrome\\Application\\chrome.exe`);
  }

  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
}

/**
 * The command that opens a URL in the user's default browser.
 *
 * @param platform - `process.platform`.
 * @param url - The URL.
 */
export function defaultBrowserCommand(
  platform: string,
  url: string,
): { command: string; args: readonly string[] } {
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }

  return platform === 'win32'
    ? { command: 'cmd', args: ['/c', 'start', '', url] }
    : { command: 'xdg-open', args: [url] };
}

/**
 * Starts a program detached from the CLI, so the browser outlives the command; fails when it cannot
 * be started. The process is unreferenced before its scope closes, so closing the scope leaves it
 * running.
 *
 * @param command - The program.
 * @param args - Its arguments.
 */
const startDetached = Effect.fn('startDetached')(function* (
  command: string,
  args: readonly string[],
): Effect.fn.Return<void, ShellError, ChildProcessSpawner.ChildProcessSpawner> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* Effect.scoped(
    spawner
      .spawn(
        ChildProcess.make(command, [...args], {
          detached: true,
          shell: false,
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'ignore',
        }),
      )
      .pipe(Effect.flatMap((child) => child.unref)),
  ).pipe(Effect.mapError(() => shellError(`Could not start ${command}.`)));
});

/**
 * Opens a deck URL without Electron: an installed Chrome in app mode (a window without browser
 * chrome), else the default browser. Tests replace the layer so no browser ever starts.
 */
export class BrowserOpener extends Context.Service<
  BrowserOpener,
  {
    /**
     * Opens the URL and says how.
     *
     * @param url - The deck's URL.
     * @throws ShellError in the error channel when nothing could be started.
     */
    readonly open: (url: string) => Effect.Effect<BrowserOpening, ShellError>;
  }
>()('cli/BrowserOpener') {
  /**
   * Opens Chrome in app mode or the default browser, detached from the CLI.
   */
  static readonly layer = Layer.effect(
    BrowserOpener,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      return BrowserOpener.of({
        open: Effect.fn('BrowserOpener.open')(function* (url) {
          for (const candidate of chromeCandidates(process.platform, process.env)) {
            const absolute = candidate.includes('/') || candidate.includes('\\');
            if (
              absolute &&
              !(yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false)))
            ) {
              continue;
            }

            const started = yield* startDetached(candidate, [`--app=${url}`]).pipe(
              Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
              Effect.as(true),
              Effect.orElseSucceed(() => false),
            );
            if (started) {
              return 'chrome-app' as const;
            }
          }

          const fallback = defaultBrowserCommand(process.platform, url);
          yield* startDetached(fallback.command, fallback.args).pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
            Effect.mapError(() => shellError(`Could not open a browser. Open ${url} yourself.`)),
          );
          return 'default-browser' as const;
        }),
      });
    }),
  );
}
