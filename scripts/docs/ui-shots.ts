import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  _electron as electron,
  chromium,
  type Browser,
  type BrowserContext,
  type ElectronApplication,
  type Page,
} from 'playwright';

import type { DocsBrand } from '#shots.manifest.ts';

import { DOCS_DECKS } from '#allowlist.ts';
import {
  DECK_BIN,
  DECK_ENV,
  elapsed,
  readScriptArgs,
  requireDocsBrands,
  runDeck,
  WORKSPACE_ROOT,
  type DeckRun,
} from '#script-support.ts';

/**
 * The deck the product UI is shown on.
 */
const DECK = 'showcase';

/**
 * The browser window size of every UI shot, in CSS pixels.
 */
const VIEWPORT = {
  /**
   * The width.
   */
  width: 1440,

  /**
   * The height.
   */
  height: 900,
} as const;

/**
 * The time every page and Electron window reads from `Date`, so the presenter's clock shows the
 * same time on every run. Only `Date` is fixed: timers keep running, so animations and the waits of
 * the shots work as usual.
 */
const FIXED_TIME = new Date('2026-11-13T09:30:00Z');

/**
 * The locale every page and Electron window formats dates and numbers in.
 */
const LOCALE = 'en-US';

/**
 * The time zone every page and Electron window shows times in.
 */
const TIME_ZONE = 'UTC';

/**
 * The flag that turns a skipped shot into a failure.
 */
const STRICT_FLAG = 'strict';

/**
 * The environment variable that turns on strict mode like `--strict` does, set to `1`; the docs
 * site's sync passes its own environment through, so a deploy sets it once for the whole sync.
 */
const STRICT_ENV = 'DECKSTER_SHOTS_STRICT';

/**
 * The slide the default view, the overview, the help and the tools are shot on.
 */
const MAIN_SLIDE = 'where-hours-went';

/**
 * The slide that gets the comment; its heading is the element commented on.
 */
const COMMENT_SLIDE = 'the-claim';

/**
 * The comment placed for the comment-mode shot. It is deleted again afterwards, through the dev
 * server, so no other comment in the deck is touched.
 */
const COMMENT_TEXT = 'Lead with the linter: it is the claim people doubt.';

/**
 * The name the dev servers sign comments with, through `DECK_AUTHOR`, so the shots show a neutral
 * reviewer instead of the git user of the machine that ran the script.
 */
const COMMENT_AUTHOR = 'Reviewer';

/**
 * The accessible name of the comment-mode toolbar's panel button, which ends with the open count.
 */
const COMMENTS_BUTTON_PATTERN = /^Comments/;

/**
 * Where saved comments go, inside the deck folder. It is not ignored by git, so the script deletes
 * the comment it placed and, when the folder did not exist before the run, removes it once empty.
 */
const FEEDBACK_FOLDER = path.join(WORKSPACE_ROOT, 'decks', DECK, '.feedback');

/**
 * The dev server's comments endpoint. It answers only pages that loaded the deck, because they hold
 * the dev session cookie, so the script calls it from inside a page.
 */
const COMMENTS_ENDPOINT = '/__deck/comments';

/**
 * The exit code for each signal the script handles: 128 plus the signal number, as a shell reports
 * it.
 */
const SIGNAL_EXIT_CODES = {
  /**
   * Ctrl-C: 128 + 2.
   */
  SIGINT: 130,

  /**
   * A termination request: 128 + 15.
   */
  SIGTERM: 143,
} as const;

/**
 * How long the dev server may take to answer its first request.
 */
const SERVER_START_TIMEOUT_MS = 60_000;

/**
 * How long to wait between checks for the dev server.
 */
const SERVER_POLL_MS = 250;

/**
 * How long the dev server gets to stop after its input closes, before it is killed.
 */
const SERVER_STOP_TIMEOUT_MS = 10_000;

/**
 * How long a panel may take to appear after its key is pressed.
 */
const UI_TIMEOUT_MS = 15_000;

/**
 * How long to let animations and fonts settle before a screenshot.
 */
const SETTLE_MS = 600;

/**
 * Where the pointer goes to reveal the tool cluster: inside the bottom-left zone the presenter
 * watches (280 by 140 pixels).
 */
const TOOL_ZONE_POINT = {
  /**
   * Pixels from the left edge.
   */
  x: 120,

  /**
   * Pixels from the top edge: 60 above the bottom.
   */
  y: VIEWPORT.height - 60,
} as const;

/**
 * The device pixel ratio of the tool cluster close-up, so its icons stay sharp at docs size.
 */
const DETAIL_SCALE = 2;

/**
 * The part of the window the tool cluster close-up keeps, in CSS pixels: the bottom-left corner,
 * where the cluster sits. At `DETAIL_SCALE` the picture is 1120x400.
 */
const TOOLS_DETAIL_CLIP = {
  /**
   * The left edge.
   */
  x: 0,

  /**
   * The top edge: 200 above the bottom of the window.
   */
  y: VIEWPORT.height - 200,

  /**
   * The width.
   */
  width: 560,

  /**
   * The height.
   */
  height: 200,
} as const;

/**
 * Where the pointer rests when a shot should show no hover state: the top-right corner.
 */
const NEUTRAL_POINT = {
  /**
   * Pixels from the left edge: 4 inside the right edge.
   */
  x: VIEWPORT.width - 4,

  /**
   * Pixels from the top edge.
   */
  y: 4,
} as const;

/**
 * The deck the `deck diff` report is made for: small, so its three renders are quick.
 */
const DIFF_DECK = 'hello';

/**
 * The brand the "changed" slide of the diff baseline is rendered in, so the report shows a visible
 * change without touching the deck.
 */
const DIFF_CHANGED_BRAND: DocsBrand = 'nocturne';

/**
 * What the report's "Compared with" line shows instead of the temporary baseline folder, whose
 * absolute path names the machine and changes on every run. It is where `deck diff --save-baseline`
 * writes by default.
 */
const DIFF_BASE_LABEL = `.deck/baseline/${DIFF_DECK}`;

/**
 * The fewest slides the diff deck needs: one shown changed and two that trade places.
 */
const DIFF_MIN_SLIDES = 3;

/**
 * Matches a baseline picture name, such as `02-steps.png`: the slide number and the slide id.
 */
const BASELINE_FILE_PATTERN = /^(\d+)-(.+)\.png$/;

/**
 * The environment the CLI reads to accept the hidden `--agent fake` provider, which replays a
 * recorded Claude Code transcript and spends no tokens. The agent-panel shot runs on it too: its
 * check always passes, where the real provider's depends on the machine (installed, signed in,
 * version), and the shot sends no prompt.
 */
const FAKE_AGENT_ENV = {
  /**
   * Set, so `--agent fake` is accepted.
   */
  DECK_TEST_FAKE_AGENT: '1',
} as const;

/**
 * The deck the agent turn runs on, copied into a scratch workspace so the fake's edit never reaches
 * the repository.
 */
const AGENT_DECK = 'hello';

/**
 * The slide file the fake agent edits, relative to the deck folder.
 */
const AGENT_SLIDE_FILE = path.join('slides', 'title.mdx');

/**
 * The title the scratch copy starts with. The fake sets the title to `AGENT_FINAL_TITLE`, which is
 * what its recorded answer says it did, so the answer and the slide agree.
 */
const AGENT_START_TITLE = 'A slide system in code';

/**
 * The title the fake writes, and the title the recorded transcript reports.
 */
const AGENT_FINAL_TITLE = 'Hello, deck';

/**
 * The prompt as the picture shows it. The fake reads the new title from a `[fake-title:…]` tag,
 * which is removed from the prompt bubble before the shot.
 */
const AGENT_PROMPT = 'Make the title friendlier';

/**
 * A slide's frontmatter title line, which the fake agent rewrites.
 */
const TITLE_LINE = /^title: .*$/m;

/**
 * A slide's first `#` heading line.
 */
const HEADING_LINE = /^# .*$/m;

/**
 * The provider name the panel shows for the fake, and the name the shot shows instead: what the
 * panel shows for `--agent claude` (`providerLabel('claude')` in
 * `packages/agent/src/runtime/status.tsx`), since the transcript the fake replays was recorded from
 * Claude Code.
 */
const AGENT_LABELS = {
  /**
   * What the panel shows for the fake provider.
   */
  fake: 'Fake agent',

  /**
   * What the shot shows instead.
   */
  shown: 'Claude',
} as const;

/**
 * How long the fake turn, its lint check and the hot reload after it may take.
 */
const AGENT_TURN_TIMEOUT_MS = 60_000;

/**
 * The files of a deck the scratch copies leave out: build output, dependencies (linked instead),
 * saved comments, and the package files that would make the copy a workspace package.
 */
const COPY_EXCLUDED = /[/\\](node_modules|dist|\.feedback|tsconfig\.json|package\.json)([/\\]|$)/;

/**
 * The deck whose installed dependencies every scratch deck links to, so its imports resolve outside
 * the repository.
 */
const DEPENDENCIES_DECK = 'hello';

/**
 * The scratch deck of the lint pair, and its one slide.
 */
const LINT_DECK = 'lint-demo';

/**
 * The slide id of the lint pair.
 */
const LINT_SLIDE = 'launch-plan';

/**
 * The scratch lint deck's config.
 */
const LINT_DECK_CONFIG = [
  "import { defineDeck } from '@deckster/engine/config';",
  '',
  'export default defineDeck({',
  "  title: 'Launch review',",
  "  brand: 'default',",
  `  slides: ['${LINT_SLIDE}'],`,
  '});',
  '',
].join('\n');

/**
 * The frontmatter both versions of the lint slide share.
 */
const LINT_SLIDE_HEAD = [
  '---',
  'layout: content',
  'title: The launch plan has three risks we can still remove',
  'budget: 1m',
  '---',
  '',
];

/**
 * The speaker note both versions of the lint slide start with.
 */
const LINT_SLIDE_NOTE =
  'Name the three risks we can still remove before Friday, then ask for owners.';

/**
 * The slide before the fix: nine long bullets in the content layout, which allows six bullets and
 * 72 words in its text column. It goes over both budgets and runs off the bottom of the canvas.
 */
const LINT_BEFORE_SLIDE = [
  ...LINT_SLIDE_HEAD,
  '- Supplier contracts for the second warehouse are signed but not yet countersigned by legal',
  "- The pricing page still shows last year's tiers in two of the five regions we sell in",
  '- Support has not been trained on the new returns flow and the macros are missing',
  '- The mobile app release depends on a store review that usually takes four working days',
  '- Marketing has booked the launch email for a Monday, when open rates are lowest',
  '- Finance needs the revenue forecast split by region before it can approve the budget',
  '- The status page still links to the old incident channel and the old on-call rota',
  '- Two of the onboarding videos still show the previous dashboard and its old menu',
  '- Nobody owns the launch-day war room or the checklist that goes with it',
  '',
  '<Notes>',
  LINT_SLIDE_NOTE,
  '</Notes>',
  '',
].join('\n');

/**
 * The same slide fixed: the three risks the title promises, the rest moved into the notes.
 */
const LINT_AFTER_SLIDE = [
  ...LINT_SLIDE_HEAD,
  '- Legal has not countersigned the second warehouse contracts',
  "- The pricing page shows last year's tiers in two regions",
  '- Support has no training or macros for the new returns flow',
  '',
  '<Notes>',
  LINT_SLIDE_NOTE,
  'The rest of the list (store review, launch email, forecast, status page, videos, war room)',
  'is tracked in the launch checklist.',
  '</Notes>',
  '',
].join('\n');

/**
 * What `deck lint` prints for a deck with no findings at all, warnings included.
 */
const LINT_CLEAN_TEXT = 'no problems';

/**
 * A terminal colour or style code. Built from the escape character's code, because a control
 * character in a regex literal trips the linter.
 */
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g');

/**
 * How long `docker info` may take before Docker counts as not running.
 */
const DOCKER_CHECK_TIMEOUT_MS = 15_000;

/**
 * The deck the export comparison is made for.
 */
const EXPORT_DECK = 'hello';

/**
 * The renderer of the export comparison: LibreOffice in Docker, with the export's fonts.
 */
const EXPORT_RENDERER = 'libreoffice';

/**
 * The side-by-side picture of the export comparison, inside `<out>/verify/compare/`.
 */
const EXPORT_COMPARE_FILE = `01-title.${EXPORT_RENDERER}.png`;

/**
 * The deck the presenter shots show, at the same slide as the browser shots.
 */
const PRESENT_TITLE = 'Slides an agent can write';

/**
 * How long Electron may take to start and load the deck.
 */
const ELECTRON_START_TIMEOUT_MS = 30_000;

/**
 * How many times the shell is launched before the present shots are skipped: where no window server
 * is reachable its renderer crashes at once, as `shell.e2e.ts` notes.
 */
const ELECTRON_LAUNCH_ATTEMPTS = 2;

/**
 * The shell package, whose `node_modules` holds Electron and whose main file `deck present` runs.
 */
const SHELL_DIR = path.join(WORKSPACE_ROOT, 'packages', 'shell');

/**
 * The documented step that downloads Electron, tried once when the binary is missing.
 */
const ELECTRON_INSTALL = ['--filter', '@deckster/shell', 'exec', 'install-electron'] as const;

/**
 * A running `deck dev` and its address.
 */
type DevServer = {
  /**
   * The process.
   */
  readonly child: ChildProcess;

  /**
   * The deck page, such as `http://localhost:5190/`.
   */
  readonly url: string;
};

/**
 * One UI shot: a name and how to bring the page into that state.
 */
type UiShot = {
  /**
   * The file name without `.png`.
   */
  readonly name: string;

  /**
   * Brings the page into the state to shoot, and returns the page to shoot.
   */
  readonly prepare: (browser: Browser, url: string) => Promise<Page>;

  /**
   * The part of the window to keep, in CSS pixels; the whole window when left out.
   */
  readonly clip?: { x: number; y: number; width: number; height: number };
};

/**
 * Which deck a `deck dev` serves, from which workspace, and how.
 */
type ServerSetup = {
  /**
   * The deck folder name.
   */
  readonly deck: string;

  /**
   * Extra `deck dev` flags.
   */
  readonly flags: readonly string[];

  /**
   * The workspace root, passed as `DECK_ROOT`; the repository when left out.
   */
  readonly root?: string;

  /**
   * Extra environment variables.
   */
  readonly env?: Readonly<Record<string, string>>;
};

/**
 * What the run found: failures, which make it exit with 1, and shots skipped because something they
 * need is missing, which do so only in strict mode.
 */
type RunReport = {
  /**
   * Failures, one line each.
   */
  readonly problems: string[];

  /**
   * Skipped shots with the reason, one line each.
   */
  readonly skipped: string[];
};

/**
 * What `deck shot --json` prints, as far as this script reads it.
 */
type DeckShotAnswer = {
  /**
   * The pictures written, in slide order.
   */
  readonly files: readonly { readonly path: string }[];
};

/**
 * A signal the script handles by cleaning up before it exits.
 */
type HandledSignal = keyof typeof SIGNAL_EXIT_CODES;

/**
 * Thrown by a shot whose prerequisite is missing (a binary, Docker, a provider), so the shot is
 * recorded as skipped instead of failed.
 */
class ShotSkipped extends Error {}

/**
 * A dev server the comment shot ran on, and the comments the deck had before the shot. A comment on
 * `COMMENT_SLIDE` with `COMMENT_TEXT` that is not among them is the one the shot placed.
 */
type CommentWatch = {
  /**
   * The deck page of the server.
   */
  readonly url: string;

  /**
   * The ids of the comments the deck had before the shot.
   */
  readonly before: readonly string[];
};

/**
 * What the comments endpoint answers to `GET`, as far as this script reads it.
 */
type CommentsAnswer = {
  /**
   * Every comment of the deck.
   */
  readonly comments: readonly {
    readonly id: string;
    readonly slide: string;
    readonly text: string;
  }[];
};

/**
 * The comment shots whose comment is not deleted yet. Each is taken out of the list before its
 * comment is deleted, so the normal path and a signal never delete twice.
 */
const commentWatches: CommentWatch[] = [];

/**
 * The dev servers that are running, so a signal can stop them.
 */
const runningServers = new Set<DevServer>();

/**
 * The Electron apps that are running, so a signal can close them before their profile is removed.
 */
const runningApps = new Set<ElectronApplication>();

/**
 * The temporary folders the shots made, removed by the clean-up.
 */
const scratchFolders: string[] = [];

/**
 * The shots of the plain dev server, in order.
 */
const SHOTS: readonly UiShot[] = [
  { name: 'sidebar', prepare: shotSidebar },
  { name: 'overview', prepare: shotOverview },
  { name: 'help', prepare: shotHelp },
  { name: 'presenter', prepare: shotPresenter },
  { name: 'comments', prepare: shotComments },
  { name: 'comment-list', prepare: shotCommentList },
  { name: 'tools', prepare: shotTools },
  { name: 'tools-detail', prepare: shotToolsDetail, clip: TOOLS_DETAIL_CLIP },
];

await main();

/**
 * Starts `deck dev showcase`, shoots each UI state at 1440x900 into `--out` (the tool cluster
 * close-up only its corner, at twice the pixel density) and the audience and presenter windows of
 * the desktop shell, then the agent panel on a second server with `--agent`, a finished turn of the
 * fake agent on a scratch copy of hello, a `deck diff` report, a lint finding before and after its
 * fix (with the lint output as text), the gallery of `deck build --all --out` and a `deck export
 * --verify` comparison, all made in temporary folders. Every page and window reads the same fixed
 * time, locale and time zone. The comment the comment shot placed is deleted before its server
 * stops, also on Ctrl-C or `SIGTERM` (a second Ctrl-C quits at once). A shot whose prerequisite is
 * missing (Electron, a display, Docker) is skipped with its reason; with `--strict` (or
 * `DECKSTER_SHOTS_STRICT=1`) a skip is a failure. Refuses to start when an allowlisted deck renders
 * with a brand outside the allowlist. Exits with 1 when a shot or the clean-up failed, after trying
 * the others.
 */
async function main(): Promise<void> {
  const start = performance.now();
  const args = readScriptArgs('ui-shots.ts', [STRICT_FLAG]);
  const { out } = args;
  const strict = args.flags.has(STRICT_FLAG) || process.env[STRICT_ENV] === '1';
  await requireDocsBrands();
  await mkdir(out, { recursive: true });
  const feedbackExisted = await exists(FEEDBACK_FOLDER);
  const report: RunReport = { problems: [], skipped: [] };
  const { problems } = report;
  // The script cleans up on these signals itself, which needs the browser still open.
  const browser = await chromium.launch({ handleSIGINT: false, handleSIGTERM: false });

  /**
   * The run's clean-up (comments, shells, servers, browser, temporary folders), shared by the
   * signal handler and the end of the run; safe to call more than once.
   *
   * @returns A promise that resolves once everything was tried.
   */
  const cleanUp = () => cleanUpRun(browser, feedbackExisted, problems);

  /**
   * Cleans up on a signal, then exits with the signal's exit code.
   *
   * @param signal - The signal received.
   */
  const onSignal = (signal: HandledSignal): void => {
    console.error(`${signal}: deleting the placed comment first. Press Ctrl-C again to quit now.`);
    void cleanUp().finally(() => {
      if (problems.length > 0) {
        console.error(problems.join('\n'));
      }

      process.exit(SIGNAL_EXIT_CODES[signal]);
    });
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await withServer({ deck: DECK, flags: [] }, async (url) => {
      try {
        for (const shot of SHOTS) {
          await takeShot(browser, url, out, shot, report);
        }

        await takePresentShots(url, out, report);
      } finally {
        await deletePlacedComments(browser, problems);
      }
    });
    await takeAgentPanelShot(browser, out, report);
    await takeAgentTurnShot(browser, out, report);
    await takeShot(browser, '', out, { name: 'diff-report', prepare: shotDiffReport }, report);
    await takeLintShots(out, report);
    await takeShot(browser, '', out, { name: 'build-gallery', prepare: shotBuildGallery }, report);
    await takeExportVerifyShot(out, report);
  } finally {
    await cleanUp();
  }

  console.log(`UI shots written to ${out} in ${elapsed(start)}.`);
  finishRun(report, strict);
}

/**
 * Prints the skipped shots and the problems, and sets exit code 1 when there are problems. In
 * strict mode each skipped shot counts as a problem, named with the prerequisite it lacked.
 *
 * @param report - What the run found.
 * @param strict - Whether a skipped shot fails the run.
 */
function finishRun(report: RunReport, strict: boolean): void {
  const { problems, skipped } = report;
  if (skipped.length > 0 && strict) {
    problems.push(...skipped.map((line) => `skipped in strict mode: ${line}`));
  } else if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:\n${skipped.join('\n')}`);
  }

  if (problems.length > 0) {
    console.error(`${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
  }
}

/**
 * Takes one shot in a fresh browser context and records a failure or a skip instead of throwing.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @param out - The output folder.
 * @param shot - The shot.
 * @param report - Where failures and skips are recorded.
 */
async function takeShot(
  browser: Browser,
  url: string,
  out: string,
  shot: UiShot,
  report: RunReport,
): Promise<void> {
  const start = performance.now();
  try {
    const page = await shot.prepare(browser, url);
    await page.waitForTimeout(SETTLE_MS);
    const file = path.join(out, `${shot.name}.png`);
    await page.screenshot(
      shot.clip === undefined ? { path: file } : { path: file, clip: shot.clip },
    );
    await page.context().close();
    console.log(`${shot.name}: ${elapsed(start)}`);
  } catch (error) {
    recordFailure(report, [shot.name], error);
  }
}

/**
 * Records a shot's failure, or its skip when it threw `ShotSkipped`.
 *
 * @param report - Where it is recorded.
 * @param names - The shots it concerns.
 * @param error - What was thrown.
 */
function recordFailure(report: RunReport, names: readonly string[], error: unknown): void {
  const list = error instanceof ShotSkipped ? report.skipped : report.problems;
  list.push(`${names.join(', ')}: ${reasonOf(error)}`);
}

/**
 * The message of what was thrown.
 *
 * @param error - What was thrown.
 * @returns Its message, or its text when it is not an `Error`.
 */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The default view: a chart slide with the slide sidebar open.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The page to shoot.
 */
async function shotSidebar(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${MAIN_SLIDE}`);
  await ensureSidebar(page, true);
  return page;
}

/**
 * The overview grid, opened with `o`.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The page to shoot.
 */
async function shotOverview(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${MAIN_SLIDE}`);
  await ensureSidebar(page, false);
  await page.keyboard.press('o');
  await page.locator('.dp-overview').waitFor({ timeout: UI_TIMEOUT_MS });
  return page;
}

/**
 * The keyboard shortcuts overlay, opened with `?`.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The page to shoot.
 */
async function shotHelp(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${MAIN_SLIDE}`);
  await ensureSidebar(page, false);
  await page.keyboard.press('?');
  await page
    .getByRole('dialog', { name: 'Keyboard shortcuts' })
    .waitFor({ timeout: UI_TIMEOUT_MS });
  return page;
}

/**
 * The presenter window (`?presenter`), opened beside an audience page in the same context so the
 * two are in sync.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The presenter page to shoot.
 */
async function shotPresenter(browser: Browser, url: string): Promise<Page> {
  const audience = await openDeck(browser, `${url}#/${MAIN_SLIDE}`);
  const presenter = await audience.context().newPage();
  await presenter.setViewportSize(VIEWPORT);
  await presenter.goto(`${url}?presenter#/${MAIN_SLIDE}`);
  await presenter.locator('.dp-p-notes').waitFor({ timeout: UI_TIMEOUT_MS });
  await presenter.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y);
  return presenter;
}

/**
 * Comment mode with one comment saved on the claim slide's text, its pin showing.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The page to shoot.
 */
async function shotComments(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${COMMENT_SLIDE}`);
  const answer = await readComments(page);
  commentWatches.push({ url, before: answer.comments.map((comment) => comment.id) });
  await ensureSidebar(page, false);
  await page.keyboard.press('c');
  await page.locator('.dc-toolbar').waitFor({ timeout: UI_TIMEOUT_MS });
  const target = page.locator('.deck-main [data-slide-active="true"] p[data-deck-source]').first();
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error(`No stamped paragraph on the "${COMMENT_SLIDE}" slide.`);
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const field = page.locator('.dc-composer textarea');
  await field.waitFor({ timeout: UI_TIMEOUT_MS });
  await field.fill(COMMENT_TEXT);
  await field.press('ControlOrMeta+Enter');
  await page.locator('.dc-pin').first().waitFor({ timeout: UI_TIMEOUT_MS });
  await page.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y);
  return page;
}

/**
 * The comment panel listing the comment the comment shot placed, opened from the comment-mode
 * toolbar and left open after comment mode closes, beside the slide. It runs right after the
 * comment shot, while that comment is still saved.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The page to shoot.
 */
async function shotCommentList(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${COMMENT_SLIDE}`);
  await ensureSidebar(page, false);
  await page.keyboard.press('c');
  const toolbar = page.locator('.dc-toolbar');
  await toolbar.waitFor({ timeout: UI_TIMEOUT_MS });
  await toolbar.getByRole('button', { name: COMMENTS_BUTTON_PATTERN }).click();
  await page
    .locator('.dc-panel .dc-list')
    .getByText(COMMENT_TEXT)
    .first()
    .waitFor({ timeout: UI_TIMEOUT_MS });
  await page.keyboard.press('Escape');
  await toolbar.waitFor({ state: 'hidden', timeout: UI_TIMEOUT_MS });
  await page.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y);
  return page;
}

/**
 * The tool cluster, revealed by moving the pointer into the bottom-left corner.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The page to shoot.
 */
async function shotTools(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${MAIN_SLIDE}`);
  await revealTools(page);
  return page;
}

/**
 * A close-up of the tool cluster at twice the pixel density, so its buttons stay legible where the
 * docs show it at its natural size; the shot keeps only `TOOLS_DETAIL_CLIP`.
 *
 * @param browser - The browser.
 * @param url - The deck page.
 * @returns The page to shoot.
 */
async function shotToolsDetail(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${MAIN_SLIDE}`, DETAIL_SCALE);
  await revealTools(page);
  return page;
}

/**
 * Closes the sidebar and moves the pointer into the bottom-left corner, which reveals the tool
 * cluster.
 *
 * @param page - The deck page.
 */
async function revealTools(page: Page): Promise<void> {
  await ensureSidebar(page, false);
  await page.mouse.move(TOOL_ZONE_POINT.x, TOOL_ZONE_POINT.y);
  await page.locator('.dp-tools').waitFor({ state: 'visible', timeout: UI_TIMEOUT_MS });
}

/**
 * The agent panel on a server started with the fake provider, which spends nothing and whose check
 * always passes. Skipped when that server does not start.
 *
 * @param browser - The browser.
 * @param out - The output folder.
 * @param report - Where failures and skips are recorded.
 */
async function takeAgentPanelShot(browser: Browser, out: string, report: RunReport): Promise<void> {
  const name = 'agent-panel';
  try {
    const sessions = await scratchFolder('docs-ui-agent-panel-');
    const server = await startServer({
      deck: DECK,
      flags: ['--agent', 'fake'],
      env: { ...FAKE_AGENT_ENV, DECK_FAKE_SESSIONS_DIR: sessions },
    }).catch((error: unknown) => {
      throw new ShotSkipped(`the server with --agent fake did not start: ${reasonOf(error)}`);
    });
    try {
      await takeShot(browser, server.url, out, { name, prepare: shotAgentPanel }, report);
    } finally {
      await stopServer(server);
    }
  } catch (error) {
    recordFailure(report, [name], error);
  }
}

/**
 * The agent panel docked beside the slide, before any prompt: the shot sends nothing. The provider
 * is shown under the name the panel gives Claude Code.
 *
 * @param browser - The browser.
 * @param url - The deck page of a server started with `--agent`.
 * @returns The page to shoot.
 */
async function shotAgentPanel(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, `${url}#/${MAIN_SLIDE}`);
  await ensureSidebar(page, false);
  await waitForAgentPanel(page);
  await page.evaluate(relabelAgent, {
    prompt: AGENT_PROMPT,
    from: AGENT_LABELS.fake,
    to: AGENT_LABELS.shown,
  });
  await page.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y);
  return page;
}

/**
 * Waits until the agent panel is connected and drawn.
 *
 * @param page - A deck page of a server started with `--agent`.
 */
async function waitForAgentPanel(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (Reflect.get(window, '__deckAgent') as { state?: string } | undefined)?.state === 'open',
    undefined,
    { timeout: UI_TIMEOUT_MS },
  );
  await page.locator('.da-head').waitFor({ timeout: UI_TIMEOUT_MS });
}

/**
 * The audience and presenter windows of the desktop shell, as `deck present --presenter` opens
 * them, on the showcase server: the shell is started hidden through Playwright's Electron launcher,
 * each window is sized to 1440x900 and shot. Skipped when Electron is not downloaded (after trying
 * the documented install once) or cannot start here.
 *
 * @param url - The showcase deck page.
 * @param out - The output folder.
 * @param report - Where failures and skips are recorded.
 */
async function takePresentShots(url: string, out: string, report: RunReport): Promise<void> {
  const names = ['present-audience', 'present-presenter'] as const;
  const start = performance.now();
  try {
    const executable = await electronExecutable();
    const { app, audience } = await launchShell(executable, `${url}#/${MAIN_SLIDE}`);
    try {
      await shootShellWindow(app, audience, path.join(out, `${names[0]}.png`));
      const opened = app.waitForEvent('window', { timeout: UI_TIMEOUT_MS });
      await audience.evaluate(() => {
        const shell = Reflect.get(window, 'deckShell') as { openPresenter: () => unknown };
        shell.openPresenter();
      });
      const presenter = await opened;
      await presenter.locator('.dp-p-notes').waitFor({ timeout: UI_TIMEOUT_MS });
      await shootShellWindow(app, presenter, path.join(out, `${names[1]}.png`));
    } finally {
      await closeApp(app);
    }

    console.log(`${names.join(', ')}: ${elapsed(start)}`);
  } catch (error) {
    recordFailure(report, names, error);
  }
}

/**
 * The Electron executable the shell runs on. When it is not downloaded, runs the documented install
 * step once and looks again.
 *
 * @returns The absolute path of the executable.
 * @throws ShotSkipped when it is still missing after the install step.
 */
async function electronExecutable(): Promise<string> {
  const found = findElectron();
  if (found !== undefined) {
    return found;
  }

  const command = `pnpm ${ELECTRON_INSTALL.join(' ')}`;
  console.log(`Electron is not downloaded; running \`${command}\` once.`);
  const install = await runProcess('pnpm', ELECTRON_INSTALL, { cwd: WORKSPACE_ROOT }).catch(
    (error: unknown) => ({ code: null, stdout: '', stderr: reasonOf(error) }),
  );
  const installed = findElectron();
  if (installed === undefined) {
    throw new ShotSkipped(
      `Electron is not downloaded and \`${command}\` did not download it ` +
        `(exit ${install.code}): ${install.stderr.trim().split('\n')[0] ?? ''}`,
    );
  }

  return installed;
}

/**
 * Finds the Electron executable the shell package installed, without loading `electron` (which
 * would download it).
 *
 * @returns The executable, or `undefined` when it is not downloaded.
 */
function findElectron(): string | undefined {
  const electronDir = path.join(SHELL_DIR, 'node_modules', 'electron');
  try {
    const relative = readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim();
    const executable = path.join(electronDir, 'dist', relative);
    return existsSync(executable) ? executable : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Starts the shell hidden on a deck page, with a profile in a scratch folder, and waits until its
 * audience window runs the deck. Tries `ELECTRON_LAUNCH_ATTEMPTS` times.
 *
 * @param executable - The Electron executable.
 * @param url - The deck page the audience window loads.
 * @returns The app and its audience window.
 * @throws ShotSkipped when no attempt got the deck running.
 */
async function launchShell(
  executable: string,
  url: string,
): Promise<{ app: ElectronApplication; audience: Page }> {
  const profileDir = await scratchFolder('docs-ui-shell-');
  const config = {
    url,
    title: PRESENT_TITLE,
    backgroundColor: '#ffffff',
    watchParent: false,
    profileDir,
    plan: { audience: { displayId: 0, fullscreen: false }, kiosk: false },
  };
  let failure = '';
  for (let attempt = 1; attempt <= ELECTRON_LAUNCH_ATTEMPTS; attempt += 1) {
    let app: ElectronApplication | undefined;
    try {
      app = await electron.launch({
        executablePath: executable,
        args: [path.join(SHELL_DIR, 'src', 'main', 'main.ts'), `--lang=${LOCALE}`],
        timeout: ELECTRON_START_TIMEOUT_MS,
        locale: LOCALE,
        timezoneId: TIME_ZONE,
        env: {
          ...DECK_ENV,
          TZ: TIME_ZONE,
          LANG: `${LOCALE.replace('-', '_')}.UTF-8`,
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
          DECK_SHELL_TEST_HIDDEN: '1',
          DECK_SHELL_CONFIG: JSON.stringify(config),
        },
      });
      runningApps.add(app);
      await app.context().clock.setFixedTime(FIXED_TIME);
      const audience = await app.firstWindow();
      await audience.waitForFunction(() => Reflect.get(window, '__deck') !== undefined, undefined, {
        timeout: ELECTRON_START_TIMEOUT_MS,
      });
      return { app, audience };
    } catch (error) {
      failure = reasonOf(error).split('\n')[0] ?? '';
      if (app !== undefined) {
        await closeApp(app);
      }
    }
  }

  throw new ShotSkipped(
    `Electron could not start here after ${ELECTRON_LAUNCH_ATTEMPTS} attempts: ${failure}`,
  );
}

/**
 * Sizes every window of the shell to the viewport and shoots one of them. The windows are hidden,
 * so the picture is the page alone, without the window frame.
 *
 * @param app - The shell.
 * @param window - The window to shoot.
 * @param file - The PNG to write.
 */
async function shootShellWindow(
  app: ElectronApplication,
  window: Page,
  file: string,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, size) => {
    for (const shellWindow of BrowserWindow.getAllWindows()) {
      shellWindow.setContentSize(size.width, size.height);
      // A hidden window paints no frames on Linux, so a screenshot there never returns. The run
      // is under a virtual display (Xvfb) on Linux, where a shown window is seen by nobody.
      if (process.platform === 'linux') {
        shellWindow.showInactive();
      }
    }
  }, VIEWPORT);
  await window.waitForTimeout(SETTLE_MS);
  await window.screenshot({ path: file });
}

/**
 * Closes a shell and forgets it; a shell that already quit is fine.
 *
 * @param app - The shell.
 */
async function closeApp(app: ElectronApplication): Promise<void> {
  runningApps.delete(app);
  await app.close().catch(() => undefined);
}

/**
 * A finished turn of the agent panel: the transcript with its steps open, the changed file with its
 * diff, the lint result and the footer with the token counts and Undo. The turn is the fake
 * provider's replay of a recorded Claude Code turn, on a copy of hello in a scratch workspace, so
 * no tokens are spent and no repository file changes. Skipped when the server with `--agent fake`
 * does not start.
 *
 * @param browser - The browser.
 * @param out - The output folder.
 * @param report - Where failures and skips are recorded.
 */
async function takeAgentTurnShot(browser: Browser, out: string, report: RunReport): Promise<void> {
  const name = 'agent-turn';
  try {
    const root = await scratchWorkspace('docs-ui-agent-');
    const deckDir = await copyDeck(AGENT_DECK, root);
    await retitle(path.join(deckDir, AGENT_SLIDE_FILE), AGENT_START_TITLE);
    const server = await startServer({
      deck: AGENT_DECK,
      flags: ['--agent', 'fake'],
      root,
      env: { ...FAKE_AGENT_ENV, DECK_FAKE_SESSIONS_DIR: path.join(root, '.fake-sessions') },
    }).catch((error: unknown) => {
      throw new ShotSkipped(`the server with --agent fake did not start: ${reasonOf(error)}`);
    });
    try {
      await takeShot(browser, server.url, out, { name, prepare: shotAgentTurn }, report);
    } finally {
      await stopServer(server);
    }
  } catch (error) {
    recordFailure(report, [name], error);
  }
}

/**
 * Sends the prompt to the fake agent, waits for the turn to finish, opens its steps and its diff,
 * and shows the prompt without the fake's title tag and the provider under the name of the agent
 * the transcript was recorded from.
 *
 * @param browser - The browser.
 * @param url - The deck page of the fake-agent server.
 * @returns The page to shoot.
 */
async function shotAgentTurn(browser: Browser, url: string): Promise<Page> {
  const page = await openDeck(browser, url);
  await ensureSidebar(page, false);
  await waitForAgentPanel(page);
  const field = page.locator('.da-textarea');
  await field.fill(`${AGENT_PROMPT} [fake-title:${AGENT_FINAL_TITLE}]`);
  await field.press('Enter');
  const finished = { timeout: AGENT_TURN_TIMEOUT_MS };
  await page.locator('.da-footer [data-action="undo"]:not([disabled])').waitFor(finished);
  await page.locator('.da-lint[data-state="clean"]').waitFor(finished);
  await page
    .locator('.da-slide-area [data-slide-active="true"] h1')
    .filter({ hasText: AGENT_FINAL_TITLE })
    .waitFor(finished);
  await page.locator('.da-tools-summary').first().click();
  await page.locator('.da-file').first().click();
  await page.locator('.da-diff-line').first().waitFor({ timeout: UI_TIMEOUT_MS });
  await page.evaluate(relabelAgent, {
    prompt: AGENT_PROMPT,
    from: AGENT_LABELS.fake,
    to: AGENT_LABELS.shown,
  });
  await page.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y);
  return page;
}

/**
 * Runs in the page: sets the prompt bubbles (if any) to the prompt without its tag, and renames the
 * provider wherever the page shows it: in text, the composer's placeholder and accessible names.
 *
 * @param input - The prompt to show and the provider name to replace.
 */
function relabelAgent(input: {
  readonly prompt: string;
  readonly from: string;
  readonly to: string;
}): void {
  for (const bubble of document.querySelectorAll('.da-prompt-text')) {
    bubble.textContent = input.prompt;
  }

  const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let text = texts.nextNode(); text !== null; text = texts.nextNode()) {
    text.nodeValue = (text.nodeValue ?? '').replaceAll(input.from, input.to);
  }

  for (const field of document.querySelectorAll('textarea')) {
    field.placeholder = field.placeholder.replace(input.from, input.to);
  }

  for (const labelled of document.querySelectorAll('[aria-label]')) {
    const label = labelled.getAttribute('aria-label') ?? '';
    labelled.setAttribute('aria-label', label.replace(input.from, input.to));
  }
}

/**
 * Sets a slide's frontmatter title and first `#` heading, as the fake agent edits them.
 *
 * @param file - The slide file.
 * @param title - The new title.
 */
async function retitle(file: string, title: string): Promise<void> {
  const source = await readFile(file, 'utf8');
  const edited = source.replace(TITLE_LINE, `title: ${title}`).replace(HEADING_LINE, `# ${title}`);
  await writeFile(file, edited);
}

/**
 * The lint pair: a slide that fails lint and the same slide fixed, each shot with `deck shot` and
 * its `deck lint` output written beside it as text, in a scratch workspace. A slide that does not
 * lint as intended (the first passing, the second failing) is a failure.
 *
 * @param out - The output folder.
 * @param report - Where failures are recorded.
 */
async function takeLintShots(out: string, report: RunReport): Promise<void> {
  const variants = [
    { name: 'lint-before', slide: LINT_BEFORE_SLIDE, clean: false },
    { name: 'lint-after', slide: LINT_AFTER_SLIDE, clean: true },
  ] as const;
  let root: string;
  try {
    root = await scratchWorkspace('docs-ui-lint-');
    await writeLintDeck(root);
  } catch (error) {
    recordFailure(
      report,
      variants.map((variant) => variant.name),
      error,
    );
    return;
  }

  for (const variant of variants) {
    const start = performance.now();
    try {
      await shootLintVariant(root, out, variant);
      console.log(`${variant.name}: ${elapsed(start)}`);
    } catch (error) {
      recordFailure(report, [variant.name, `${variant.name}.txt`], error);
    }
  }
}

/**
 * Writes the scratch lint deck: its config, an empty slides folder and the dependency link.
 *
 * @param root - The scratch workspace.
 */
async function writeLintDeck(root: string): Promise<void> {
  const deckDir = path.join(root, 'decks', LINT_DECK);
  await mkdir(path.join(deckDir, 'slides'), { recursive: true });
  await writeFile(path.join(deckDir, 'deck.config.ts'), LINT_DECK_CONFIG);
  await linkDependencies(deckDir);
}

/**
 * Writes one version of the lint slide, lints the deck into `<name>.txt` and shoots the slide into
 * `<name>.png`.
 *
 * @param root - The scratch workspace.
 * @param out - The output folder.
 * @param variant - The shot name, the slide source and whether lint should pass.
 * @throws Error when lint does not come out as intended or `deck shot` fails.
 */
async function shootLintVariant(
  root: string,
  out: string,
  variant: { readonly name: string; readonly slide: string; readonly clean: boolean },
): Promise<void> {
  const slideFile = path.join(root, 'decks', LINT_DECK, 'slides', `${LINT_SLIDE}.mdx`);
  await writeFile(slideFile, variant.slide);
  const lint = await runDeckIn(root, ['lint', LINT_DECK]);
  const output = plainOutput(`${lint.stdout}${lint.stderr}`, root);
  const clean = lint.code === 0 && output.includes(LINT_CLEAN_TEXT);
  if (clean !== variant.clean) {
    throw new Error(
      `deck lint exited ${lint.code}, but the slide should ${variant.clean ? 'pass' : 'fail'}:\n` +
        output,
    );
  }

  await writeFile(path.join(out, `${variant.name}.txt`), `$ deck lint ${LINT_DECK}\n${output}`);
  const shots = path.join(root, 'shots', variant.name);
  const shot = await runDeckIn(root, ['shot', LINT_DECK, LINT_SLIDE, '--out', shots, '--json']);
  const listed = shot.code === 0 ? (JSON.parse(shot.stdout) as DeckShotAnswer) : undefined;
  const picture = listed?.files[0]?.path;
  if (picture === undefined) {
    throw new Error(`deck shot exited ${shot.code}:\n${shot.stdout}${shot.stderr}`);
  }

  await copyFile(picture, path.join(out, `${variant.name}.png`));
}

/**
 * A command's output as the docs show it: without colour codes, and with the scratch workspace's
 * absolute path written as the current folder.
 *
 * @param text - What the command printed.
 * @param root - The scratch workspace.
 * @returns The cleaned text.
 */
function plainOutput(text: string, root: string): string {
  return text.replace(ANSI_ESCAPE, '').replaceAll(`${root}${path.sep}`, '').replaceAll(root, '.');
}

/**
 * The gallery page `deck build --all --out` writes, built into a scratch folder from the decks on
 * the docs allowlist only. The build runs in a scratch workspace holding copies of those decks,
 * each linked to its own dependencies, and a link to the brands, so a deck outside the allowlist
 * never reaches the page. The CLI does not list a deck folder that is itself a link.
 *
 * @param browser - The browser.
 * @returns The gallery page to shoot.
 * @throws Error when the build fails.
 */
async function shotBuildGallery(browser: Browser): Promise<Page> {
  const root = await scratchWorkspace('docs-ui-gallery-');
  await symlink(path.join(WORKSPACE_ROOT, 'brands'), path.join(root, 'brands'), 'dir');
  for (const deck of DOCS_DECKS) {
    const source = path.join(WORKSPACE_ROOT, 'decks', deck);
    const target = path.join(root, 'decks', deck);
    await cp(source, target, { recursive: true, filter: (file) => !COPY_EXCLUDED.test(file) });
    await symlink(path.join(source, 'node_modules'), path.join(target, 'node_modules'), 'dir');
  }

  const site = path.join(await scratchFolder('docs-ui-gallery-site-'), 'site');
  const run = await runDeckIn(root, ['build', '--all', '--out', site]);
  if (run.code !== 0) {
    throw new Error(`deck build --all exited ${run.code}:\n${run.stdout}${run.stderr}`);
  }

  const context = await newShotContext(browser, 1);
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(site, 'index.html')).href);
  await waitForImages(page);
  return page;
}

/**
 * The side-by-side picture of `deck export --verify` for the first slide of hello: the web render,
 * the LibreOffice render of the PPTX and their difference, copied from the report folder. Skipped
 * when Docker is not running or the report has no such picture.
 *
 * @param out - The output folder.
 * @param report - Where failures and skips are recorded.
 */
async function takeExportVerifyShot(out: string, report: RunReport): Promise<void> {
  const name = 'export-verify';
  const start = performance.now();
  try {
    const docker = await runProcess('docker', ['info'], {
      cwd: WORKSPACE_ROOT,
      timeoutMs: DOCKER_CHECK_TIMEOUT_MS,
    }).catch(() => undefined);
    if (docker?.code !== 0) {
      throw new ShotSkipped('Docker is not running, and deck export --verify needs it.');
    }

    const folder = path.join(await scratchFolder('docs-ui-export-'), 'export');
    const args = ['export', EXPORT_DECK, '--verify', '--renderer', EXPORT_RENDERER];
    await deckOrThrow([...args, '--out', folder, '--json']);
    const picture = path.join(folder, 'verify', 'compare', EXPORT_COMPARE_FILE);
    if (!(await exists(picture))) {
      throw new ShotSkipped(`the verify report has no ${EXPORT_COMPARE_FILE}.`);
    }

    await copyFile(picture, path.join(out, `${name}.png`));
    console.log(`${name}: ${elapsed(start)}`);
  } catch (error) {
    recordFailure(report, [name], error);
  }
}

/**
 * The HTML report of `deck diff` for the diff deck, made without touching the workspace: a baseline
 * saved into a temporary folder, with the first slide's picture replaced by its render in another
 * brand (shown as changed) and the next two slides' numbers swapped (shown as moved), then compared
 * with the deck as it is. The report's "Compared with" line names the temporary folder, so the shot
 * shows the default baseline folder there instead.
 *
 * @param browser - The browser.
 * @returns The report page to shoot.
 * @throws Error when a `deck` run fails or the deck has too few slides.
 */
async function shotDiffReport(browser: Browser): Promise<Page> {
  const scratch = await scratchFolder('docs-ui-diff-');
  const baseline = path.join(scratch, 'baseline');
  const report = path.join(scratch, 'report');
  await deckOrThrow(['diff', DIFF_DECK, '--save-baseline', baseline, '--json']);
  await alterBaseline(baseline, path.join(scratch, 'changed'));
  await deckOrThrow(['diff', DIFF_DECK, '--base', baseline, '--out', report, '--json']);
  const context = await newShotContext(browser, 1);
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(report, 'index.html')).href);
  await waitForImages(page);
  await page
    .locator('.meta code')
    .first()
    .evaluate((element, label) => {
      element.textContent = label;
    }, DIFF_BASE_LABEL);
  return page;
}

/**
 * Makes a saved baseline differ from the deck: the first slide's picture is replaced by its render
 * in `DIFF_CHANGED_BRAND`, and the second and third pictures trade slide numbers.
 *
 * @param baseline - The baseline folder `deck diff --save-baseline` wrote.
 * @param changed - An empty folder for the other brand's render.
 * @throws Error when the baseline has fewer than `DIFF_MIN_SLIDES` pictures or a `deck` run fails.
 */
async function alterBaseline(baseline: string, changed: string): Promise<void> {
  const files = (await readdir(baseline))
    .filter((name) => BASELINE_FILE_PATTERN.test(name))
    .toSorted();
  const [first, second, third] = files.map(baselineFile);
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error(
      `deck diff --save-baseline wrote ${files.length} picture(s) for ${DIFF_DECK}; ` +
        `the report needs at least ${DIFF_MIN_SLIDES}.`,
    );
  }

  const shot = ['shot', DIFF_DECK, first.id, '--brand', DIFF_CHANGED_BRAND, '--out', changed];
  await deckOrThrow([...shot, '--json']);
  await copyFile(path.join(changed, first.name), path.join(baseline, first.name));
  const parked = path.join(baseline, `parked-${second.name}`);
  await rename(path.join(baseline, second.name), parked);
  await rename(
    path.join(baseline, third.name),
    path.join(baseline, `${second.number}-${third.id}.png`),
  );
  await rename(parked, path.join(baseline, `${third.number}-${second.id}.png`));
}

/**
 * A baseline picture's name split into its slide number (as written, with its zero padding) and its
 * slide id.
 *
 * @param name - A name that matches `BASELINE_FILE_PATTERN`.
 * @returns The name, number and id.
 */
function baselineFile(name: string): { name: string; number: string; id: string } {
  const [, number = '', id = ''] = BASELINE_FILE_PATTERN.exec(name) ?? [];
  return { name, number, id };
}

/**
 * Runs `deck` in the workspace and fails when it exits with anything but 0.
 *
 * @param args - The arguments after `deck`.
 * @throws Error with the command and its output when it fails.
 */
async function deckOrThrow(args: readonly string[]): Promise<void> {
  const run = await runDeck(args);
  if (run.code !== 0) {
    throw new Error(`deck ${args.join(' ')} exited ${run.code}:\n${run.stdout}${run.stderr}`);
  }
}

/**
 * Runs `deck` on a scratch workspace, which it finds through `DECK_ROOT`.
 *
 * @param root - The scratch workspace.
 * @param args - The arguments after `deck`.
 * @returns The exit code and output; a non-zero exit is not an error here.
 * @throws Error when the binary cannot be started.
 */
function runDeckIn(root: string, args: readonly string[]): Promise<DeckRun> {
  return runProcess(DECK_BIN, args, { cwd: root, env: { DECK_ROOT: root } });
}

/**
 * Runs a command, with `DECK_ROOT` set to the workspace unless `options.env` overrides it, and
 * collects its output.
 *
 * @param command - The executable.
 * @param args - Its arguments.
 * @param options - The folder it runs in, extra environment variables, and how long it may run
 *   before it is killed (no limit when left out).
 * @returns The exit code (`null` when a signal ended it) and output.
 * @throws Error when the command cannot be started.
 */
function runProcess(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
  },
): Promise<DeckRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...DECK_ENV, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
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
 * Makes a temporary folder that the clean-up removes.
 *
 * @param prefix - The start of its name.
 * @returns Its absolute path.
 */
async function scratchFolder(prefix: string): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), prefix));
  scratchFolders.push(folder);
  return folder;
}

/**
 * Makes a scratch workspace: a temporary folder with an empty `decks/`, for `DECK_ROOT`. Its path
 * is resolved, so it matches the path the CLI prints.
 *
 * @param prefix - The start of its name.
 * @returns Its absolute, resolved path.
 */
async function scratchWorkspace(prefix: string): Promise<string> {
  const root = await realpath(await scratchFolder(prefix));
  await mkdir(path.join(root, 'decks'));
  return root;
}

/**
 * Copies a repository deck into a scratch workspace, without its build output, dependencies,
 * comments or package files, and links its dependencies.
 *
 * @param deck - The deck folder name.
 * @param root - The scratch workspace.
 * @returns The copy's folder.
 */
async function copyDeck(deck: string, root: string): Promise<string> {
  const target = path.join(root, 'decks', deck);
  await cp(path.join(WORKSPACE_ROOT, 'decks', deck), target, {
    recursive: true,
    filter: (source) => !COPY_EXCLUDED.test(source),
  });
  await linkDependencies(target);
  return target;
}

/**
 * Links a scratch deck's `node_modules` to the installed dependencies of `DEPENDENCIES_DECK`, so
 * `@deckster/engine` and React resolve outside the repository. Removing the scratch folder removes
 * the link, not what it points to.
 *
 * @param deckDir - The scratch deck folder.
 */
async function linkDependencies(deckDir: string): Promise<void> {
  const installed = path.join(WORKSPACE_ROOT, 'decks', DEPENDENCIES_DECK, 'node_modules');
  await symlink(installed, path.join(deckDir, 'node_modules'), 'dir');
}

/**
 * Waits until every image on the page has loaded.
 *
 * @param page - The page.
 */
async function waitForImages(page: Page): Promise<void> {
  await page.waitForFunction(
    () => [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    undefined,
    { timeout: UI_TIMEOUT_MS },
  );
}

/**
 * Opens the deck in a fresh context at 1440x900 and waits until it is running.
 *
 * @param browser - The browser.
 * @param url - The page with its hash.
 * @param deviceScaleFactor - The device pixel ratio; 1 by default.
 * @returns The page.
 */
async function openDeck(browser: Browser, url: string, deviceScaleFactor = 1): Promise<Page> {
  const context = await newShotContext(browser, deviceScaleFactor);
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => Reflect.get(window, '__deck') !== undefined, undefined, {
    timeout: UI_TIMEOUT_MS,
  });
  await page.mouse.move(NEUTRAL_POINT.x, NEUTRAL_POINT.y);
  return page;
}

/**
 * A fresh browser context at 1440x900 whose pages read `FIXED_TIME` from `Date` and format in
 * `LOCALE` and `TIME_ZONE`, so a shot does not depend on when or where it was taken.
 *
 * @param browser - The browser.
 * @param deviceScaleFactor - The device pixel ratio.
 * @returns The context.
 */
async function newShotContext(
  browser: Browser,
  deviceScaleFactor: number,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor,
    locale: LOCALE,
    timezoneId: TIME_ZONE,
  });
  await context.clock.setFixedTime(FIXED_TIME);
  return context;
}

/**
 * Opens or closes the slide sidebar with `s`, whatever its remembered state.
 *
 * @param page - The deck page.
 * @param open - Whether it should be open.
 */
async function ensureSidebar(page: Page, open: boolean): Promise<void> {
  const sidebar = page.locator('.dp-sidebar');
  if ((await sidebar.isVisible()) !== open) {
    await page.keyboard.press('s');
  }

  await sidebar.waitFor({ state: open ? 'visible' : 'hidden', timeout: UI_TIMEOUT_MS });
}

/**
 * Starts `deck dev` on a free port, runs `use`, and stops the server.
 *
 * @param setup - The deck, its workspace and the extra flags.
 * @param use - The work to do while it runs.
 */
async function withServer(setup: ServerSetup, use: (url: string) => Promise<void>): Promise<void> {
  const server = await startServer(setup);
  try {
    await use(server.url);
  } finally {
    await stopServer(server);
  }
}

/**
 * Starts `deck dev` and waits for its first answer. Its input stays open, because the server stops
 * when its input ends.
 *
 * @param setup - The deck, its workspace and the extra flags.
 * @returns The running server.
 * @throws Error when it exits or does not answer within `SERVER_START_TIMEOUT_MS`.
 */
async function startServer(setup: ServerSetup): Promise<DevServer> {
  const port = await freePort();
  const args = ['dev', setup.deck, '--port', String(port), ...setup.flags];
  const workspace = { DECK_ROOT: setup.root ?? WORKSPACE_ROOT };
  // Detached, so a Ctrl-C in the terminal reaches only this script, which then deletes the comment
  // through the server before it stops it.
  const child = spawn(DECK_BIN, args, {
    cwd: setup.root ?? WORKSPACE_ROOT,
    env: { ...DECK_ENV, DECK_AUTHOR: COMMENT_AUTHOR, ...workspace, ...setup.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const server = { child, url: `http://localhost:${port}/` };
  runningServers.add(server);
  const deadline = performance.now() + SERVER_START_TIMEOUT_MS;
  while (performance.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`deck dev exited ${child.exitCode}:\n${output}`);
    }

    if (await answers(server.url)) {
      return server;
    }

    await new Promise((resolve) => setTimeout(resolve, SERVER_POLL_MS));
  }

  await stopServer(server);
  throw new Error(`deck dev did not answer on ${server.url}:\n${output}`);
}

/**
 * Stops the server by closing its input, and kills it when it has not exited in time.
 *
 * @param server - The server.
 */
async function stopServer(server: DevServer): Promise<void> {
  runningServers.delete(server);
  const { child } = server;
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.stdin?.end();
  child.kill('SIGINT');
  const timer = setTimeout(() => child.kill('SIGKILL'), SERVER_STOP_TIMEOUT_MS);
  await exited;
  clearTimeout(timer);
}

/**
 * Whether a URL answers at all.
 *
 * @param url - The address.
 * @returns `true` when a response came back.
 */
async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * A TCP port that is free right now, chosen by the operating system.
 *
 * @returns The port.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Deletes the placed comments, closes the shells and stops the servers still running, closes the
 * browser, removes the shots' temporary folders and removes the `.feedback` folder when the run
 * created it and left it empty. Safe to call more than once.
 *
 * @param browser - The browser.
 * @param feedbackExisted - Whether the deck had a `.feedback` folder before the run.
 * @param problems - Where failures are recorded.
 */
async function cleanUpRun(
  browser: Browser,
  feedbackExisted: boolean,
  problems: string[],
): Promise<void> {
  await deletePlacedComments(browser, problems);
  await Promise.all([...runningApps].map(closeApp));
  await Promise.all([...runningServers].map(stopServer));
  await browser.close();
  await Promise.all(
    scratchFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
  if (!feedbackExisted) {
    // Fails, and so keeps the folder, when anything is in it, such as a comment added meanwhile.
    await rmdir(FEEDBACK_FOLDER).catch(() => undefined);
  }
}

/**
 * Deletes the comments the comment shots placed, through the dev servers they ran on, which must
 * still be running. Only comments on `COMMENT_SLIDE` with `COMMENT_TEXT` that the deck did not have
 * before the shot are deleted, so comments anyone else adds meanwhile stay.
 *
 * @param browser - The browser.
 * @param problems - Where a comment that could not be deleted is recorded.
 */
async function deletePlacedComments(browser: Browser, problems: string[]): Promise<void> {
  for (const watch of commentWatches.splice(0)) {
    try {
      const page = await openDeck(browser, watch.url);
      try {
        await page.evaluate(deleteNewComments, {
          endpoint: COMMENTS_ENDPOINT,
          slide: COMMENT_SLIDE,
          text: COMMENT_TEXT,
          before: watch.before,
        });
      } finally {
        await page.context().close();
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push(
        `comments: the comment "${COMMENT_TEXT}" may still be in ${FEEDBACK_FOLDER}; ` +
          `delete it by hand: ${reason}`,
      );
    }
  }
}

/**
 * Runs in the page: deletes each comment on the slide with the text whose id is not in `before`.
 *
 * @param input - The endpoint, the slide, the text and the ids to keep.
 * @throws Error when the endpoint refuses a request.
 */
async function deleteNewComments(input: {
  readonly endpoint: string;
  readonly slide: string;
  readonly text: string;
  readonly before: readonly string[];
}): Promise<void> {
  const listed = await fetch(input.endpoint);
  if (!listed.ok) {
    throw new Error(`GET ${input.endpoint} answered ${listed.status}: ${await listed.text()}`);
  }

  const answer = (await listed.json()) as CommentsAnswer;
  const placed = answer.comments.filter(
    (comment) =>
      comment.slide === input.slide &&
      comment.text === input.text &&
      !input.before.includes(comment.id),
  );
  for (const comment of placed) {
    const response = await fetch(input.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: comment.id }),
    });
    if (!response.ok) {
      throw new Error(
        `Deleting ${comment.id} answered ${response.status}: ${await response.text()}`,
      );
    }
  }
}

/**
 * Reads every comment of the deck through the page, which holds the dev session cookie.
 *
 * @param page - A page that loaded the deck.
 * @returns What the comments endpoint answered.
 * @throws Error when the endpoint refuses the request.
 */
async function readComments(page: Page): Promise<CommentsAnswer> {
  return page.evaluate(async (endpoint) => {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`GET ${endpoint} answered ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as CommentsAnswer;
  }, COMMENTS_ENDPOINT);
}

/**
 * Whether a path exists.
 *
 * @param file - The path.
 * @returns `true` when it exists.
 */
async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}
