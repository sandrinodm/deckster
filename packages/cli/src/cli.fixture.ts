import { Console, Effect, Layer } from 'effect';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { CommandError } from '#command.ts';
import type { SlideComparer } from '#diff/slide-comparer.ts';
import type { BrowserOpener } from '#present/browser-fallback.ts';
import type { DeckShell } from '#present/deck-shell.ts';
import type { DeckServer } from '#server/deck-server.ts';

import { cliLayer, runCli } from '#cli.ts';
import { Workspace, WORKSPACE_ROOT } from '#workspace.ts';

/**
 * Imports every command body, the live service modules and the shell modules once, when a test file
 * loads this fixture. They load on first use in the real CLI, which inside a test would count
 * against the test's timeout.
 */
await Promise.all([
  import('#commands/agent-run.ts'),
  import('#commands/brand-run.ts'),
  import('#commands/build-run.ts'),
  import('#commands/charts-run.ts'),
  import('#commands/comments-run.ts'),
  import('#commands/components-run.ts'),
  import('#commands/dev-run.ts'),
  import('#commands/diagrams-run.ts'),
  import('#commands/diff-run.ts'),
  import('#commands/export-run.ts'),
  import('#commands/icons-run.ts'),
  import('#commands/layouts-run.ts'),
  import('#commands/lint-run.ts'),
  import('#commands/mcp-run.ts'),
  import('#commands/new-run.ts'),
  import('#commands/present-run.ts'),
  import('#commands/preview-run.ts'),
  import('#commands/shot-run.ts'),
  import('#browser/deck-browser-live.ts'),
  import('#diff/slide-comparer-live.ts'),
  import('#json-output.ts'),
  import('#present/browser-fallback.ts'),
  import('#present/deck-shell.ts'),
  import('#present/deck-shell-live.ts'),
  import('#server/deck-server-live.ts'),
]);

/**
 * What one captured CLI run printed and returned.
 */
export type CapturedRun = {
  /**
   * The exit code the command succeeded with.
   */
  code: number;

  /**
   * Everything printed with `Console.log`, one line per call.
   */
  output: string;

  /**
   * Everything printed with `Console.error`, one line per call.
   */
  errors: string;
};

/**
 * Options for {@link runCaptured}.
 */
export type CaptureOptions = {
  /**
   * The workspace; the framework's own by default.
   */
  root?: string;

  /**
   * Replaces the real deck server and browser, such as `fakeDeckLayer(...)`, and optionally the
   * picture comparer.
   */
  deck?:
    | Layer.Layer<DeckServer | DeckBrowser>
    | Layer.Layer<DeckServer | DeckBrowser | SlideComparer>;

  /**
   * Replaces the real Electron shell and browser opener, such as `fakeShellLayer(...)`, so no
   * window or browser ever opens.
   */
  shell?: Layer.Layer<DeckShell | BrowserOpener>;
};

/**
 * Runs a command line in a workspace with Node's services, capturing what it prints. A failing
 * command fails the effect with its error, as `runCli` does.
 *
 * @param argv - The arguments after `deck`.
 * @param options - The workspace, and fakes for the deck server and browser.
 */
export function runCaptured(
  argv: readonly string[],
  options: CaptureOptions = {},
): Effect.Effect<CapturedRun, CommandError> {
  const lines: string[] = [];
  const errors: string[] = [];
  const console: Console.Console = {
    ...globalThis.console,
    log: (...args: readonly unknown[]) => {
      lines.push(args.map(String).join(' '));
    },
    error: (...args: readonly unknown[]) => {
      errors.push(args.map(String).join(' '));
    },
  };
  const services = cliLayer(Workspace.at(options.root ?? WORKSPACE_ROOT));
  const withDeck = options.deck === undefined ? services : Layer.merge(services, options.deck);
  const layer = options.shell === undefined ? withDeck : Layer.merge(withDeck, options.shell);
  return runCli(argv).pipe(
    Effect.map((code): CapturedRun => ({
      code,
      output: lines.join('\n'),
      errors: errors.join('\n'),
    })),
    Effect.provideService(Console.Console, console),
    Effect.provide(layer),
  );
}
