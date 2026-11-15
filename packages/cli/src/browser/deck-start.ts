import path from 'node:path';

/**
 * One thing that went wrong before the deck started.
 */
export type StartProblem = {
  /**
   * What the page or Vite reported.
   */
  message: string;

  /**
   * The file it came from, as an absolute path (or the URL path for a module outside the file
   * system), or empty when unknown.
   */
  file: string;
};

/**
 * What the page shows about its start, read in the page by {@link readStartState}.
 */
export type StartState = {
  /**
   * Whether `window.__deck` exists.
   */
  started: boolean;

  /**
   * The error Vite's overlay shows (a module that does not compile), or `null` when it shows none.
   */
  overlay: StartProblem | null;

  /**
   * The problems the engine's start-error panel lists (`[data-deck-start-error]`), with the module
   * each came from.
   */
  panel: StartProblem[];
};

/**
 * A problem the browser reported to the CLI while the deck was starting: an uncaught error, or a
 * module request that failed.
 */
export type ReportedProblem = StartProblem & {
  /**
   * When it arrived, from `Date.now()`.
   */
  at: number;
};

/**
 * What {@link waitForStart} watches.
 */
export type StartWatch = {
  /**
   * Reads the page's {@link StartState}.
   */
  state: () => Promise<StartState>;

  /**
   * The problems reported so far, oldest first.
   */
  reported: () => readonly ReportedProblem[];
};

/**
 * How long {@link waitForStart} waits, in milliseconds.
 */
export type StartTiming = {
  /**
   * How long the deck gets to start when nothing goes wrong.
   */
  timeoutMs: number;

  /**
   * How long after the first reported problem the deck may still start before that problem counts
   * as what stopped it. An error that does not stop the deck becomes a lint finding instead.
   */
  graceMs: number;

  /**
   * How often the page is checked.
   */
  pollMs: number;
};

/**
 * How the start ended: the deck started, something stopped it, or it hung.
 */
export type StartOutcome =
  | { kind: 'started' }
  | { kind: 'failed'; problems: StartProblem[] }
  | { kind: 'timeout' };

/**
 * The default timing: 30 s for a deck that hangs, 2 s after a page error for a deck that might
 * still start, a check every 100 ms.
 */
export const START_TIMING: StartTiming = {
  /**
   * The same budget `ready()` gives a held slide.
   */
  timeoutMs: 30_000,

  /**
   * Long enough for the deck to mount after an error that does not stop it.
   */
  graceMs: 2000,

  /**
   * Often enough that a failure shows at once.
   */
  pollMs: 100,
};

/**
 * Matches the browser's error for an import of a name a module does not export, capturing the
 * module and the name.
 */
const MISSING_EXPORT_PATTERN =
  /The requested module '([^']+)' does not provide an export named '([^']+)'/;

/**
 * The prefix Vite serves files outside its root under.
 */
const FS_PREFIX = '/@fs';

/**
 * A `:line:column` suffix on a file in Vite's overlay.
 */
const LOCATION_SUFFIX = /:\d+(?::\d+)?$/;

/**
 * A query string or hash at the end of a module URL, which the message leaves out.
 */
const QUERY_OR_HASH_SUFFIX = /[?#].*$/;

/**
 * Reads the page's {@link StartState}. It runs in the page through `page.evaluate`, so it must stay
 * self-contained.
 */
export function readStartState(): StartState {
  const overlay = document.querySelector('vite-error-overlay')?.shadowRoot;
  const message = overlay?.querySelector('.message-body')?.textContent?.trim() ?? '';
  const panel = Array.from(
    document.querySelectorAll('[data-deck-start-error] [data-deck-start-problem]'),
    (item) => ({
      message: item.querySelector('[data-message]')?.getAttribute('data-message') ?? '',
      file: item.getAttribute('data-file') ?? '',
    }),
  );
  return {
    started: (window as { __deck?: unknown }).__deck !== undefined,
    overlay:
      overlay === undefined || overlay === null || message === ''
        ? null
        : { message, file: overlay.querySelector('.file')?.textContent?.trim() ?? '' },
    panel,
  };
}

/**
 * Waits until the deck starts, Vite shows an error, a reported problem has stood for
 * {@link StartTiming.graceMs} without the deck starting, or the timeout passes. A failure names the
 * problems the engine's panel lists (they carry the module each came from), else the reported
 * ones.
 *
 * @param watch - Reads the page and the reported problems.
 * @param timing - The timeout, the grace and the polling interval.
 * @param now - The clock; `Date.now` outside tests.
 */
export async function waitForStart(
  watch: StartWatch,
  timing: StartTiming,
  now: () => number = Date.now,
): Promise<StartOutcome> {
  const deadline = now() + timing.timeoutMs;
  for (;;) {
    const state = await watch.state();
    if (state.started) {
      return { kind: 'started' };
    }

    if (state.overlay !== null) {
      return { kind: 'failed', problems: [state.overlay] };
    }

    const reported = watch.reported();
    const first = reported[0];
    if (first !== undefined && now() - first.at >= timing.graceMs) {
      const problems = state.panel.length > 0 ? state.panel : reported;
      return { kind: 'failed', problems: problems.map(({ message, file }) => ({ message, file })) };
    }

    if (now() >= deadline) {
      return { kind: 'timeout' };
    }

    await new Promise((resolve) => setTimeout(resolve, timing.pollMs));
  }
}

/**
 * The message for a deck that failed to start: each problem with its file, then the fix for the
 * first.
 *
 * @param problems - What stopped the deck, at least one.
 * @param workspaceRoot - The workspace root, to show files relative to it; `undefined` shows them
 *   as they are.
 */
export function startFailureMessage(
  problems: readonly StartProblem[],
  workspaceRoot: string | undefined,
): string {
  const lines = ['The deck did not start: the page failed before the deck could mount.'];
  for (const problem of problems) {
    const file = shownFile(problem.file, workspaceRoot);
    lines.push(file === '' ? '' : file, `  ${shownText(problem.message, workspaceRoot)}`);
  }

  const first = problems[0];
  if (first !== undefined) {
    lines.push(startFix(first, workspaceRoot));
  }

  return lines.filter((line) => line !== '').join('\n');
}

/**
 * The fix for one start problem.
 *
 * @param problem - The problem.
 * @param workspaceRoot - The workspace root, for relative paths.
 */
function startFix(problem: StartProblem, workspaceRoot: string | undefined): string {
  const file = shownFile(problem.file, workspaceRoot);
  const missing = MISSING_EXPORT_PATTERN.exec(problem.message);
  if (missing !== null) {
    const [, module = '', name = ''] = missing;
    const from = shownFile(module, workspaceRoot);
    const importer = file === '' ? 'the slide or helper that imports it' : file;
    return (
      `Fix the import in ${importer}: it imports \`${name}\` from ${from}, which does not ` +
      `export it. Import a name that module exports, or export \`${name}\` from it.`
    );
  }

  const place = file === '' ? 'the file named above' : file;
  return (
    `Fix the error in ${place}; it stopped the page before the deck mounted. ` +
    '`pnpm deck lint <deck>` lists the files that do not compile, and ' +
    '`pnpm deck dev <deck>` shows the error in the browser.'
  );
}

/**
 * A file as the message shows it: relative to the workspace when inside it, without Vite's `/@fs`
 * prefix or a query.
 *
 * @param file - An absolute path, a `/@fs` path or a URL path; empty for none.
 * @param workspaceRoot - The workspace root, or `undefined`.
 */
export function shownFile(file: string, workspaceRoot: string | undefined): string {
  const bare = file.replace(QUERY_OR_HASH_SUFFIX, '');
  const absolute = bare.startsWith(`${FS_PREFIX}/`) ? bare.slice(FS_PREFIX.length) : bare;
  if (workspaceRoot === undefined) {
    return absolute;
  }

  const location = LOCATION_SUFFIX.exec(absolute)?.[0] ?? '';
  const filePart = absolute.slice(0, absolute.length - location.length);
  const relative = path.relative(workspaceRoot, filePart);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return absolute;
  }

  return `${relative.split(path.sep).join('/')}${location}`;
}

/**
 * A message with the workspace's absolute paths (and Vite's `/@fs` prefix) made relative.
 *
 * @param message - What the page reported.
 * @param workspaceRoot - The workspace root, or `undefined`.
 */
function shownText(message: string, workspaceRoot: string | undefined): string {
  const unprefixed = message.replaceAll(`${FS_PREFIX}/`, '/');
  return workspaceRoot === undefined
    ? unprefixed
    : unprefixed.replaceAll(`${workspaceRoot}${path.sep}`, '');
}
