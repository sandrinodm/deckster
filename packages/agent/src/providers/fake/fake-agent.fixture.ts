/**
 * A stand-in for a provider CLI, for tests: it reads the prompt on stdin, replays a recorded Claude
 * Code transcript line by line with small delays, makes the real file edit its scenario describes
 * (so the journal and hot reload have something to see) and honours SIGINT the way Claude Code does
 * (a `result` with `terminal_reason: "aborted_streaming"`, exit 0). SIGTERM ends it at once.
 *
 * The scenario is `DECK_FAKE_SCENARIO`, else a `[fake:<name>]` tag in the prompt, else
 * `edit-title`. A `[fake-title:<text>]` tag sets the new title. The slide to edit is the `Slide
 * file:` line of the prompt, relative to the working directory.
 *
 * Scenarios: `edit-title`, `lint-error` (a title the tests' lint flags), `refused` (an edit outside
 * the deck is denied; nothing changes), `long` (streams text slowly until cancelled),
 * `not-signed-in` (exit 1) and `fail-after-init` (names its session, then fails the way a bad model
 * does, exit 1). The slide edit goes to the `Slide file:` line, which names the slide in the turn's
 * working copy, as a real provider edits. The rest write what a turn may not. In the working copy
 * (the `Working copy:` line), where a provider can write: `escape` (edits the slide's title, writes
 * code to a `deck.config.ts` beside the content folders and a `slides/styles.css`), `edit-css` (a
 * stylesheet with `@plugin` in `slides/`), `symlink` (links `slides/link.mdx` to the deck's
 * config), `case-rename` (renames `slides/title.mdx` to `slides/Title.mdx` and rewrites it), and
 * `linger` (edits the title and leaves a process in its own session that writes `slides/late.mdx`
 * and `slides/late.css` into the working copy 1.5 s later, by absolute path and from its working
 * folder, as a shell in Codex's sandbox could). In the real deck, which a provider's limits should
 * stop it reaching (the guard's second belt puts it back): `edit-config` (writes the base64 text of
 * a `[fake-config:<base64>]` tag, or code, to the deck's `deck.config.ts`), `edit-brand` (the
 * brand's `brand.ts`), `unreadable` (rewrites the config and makes it unreadable), `same-stat`
 * (rewrites the config with the same length and puts its old time back) and `hang` (writes the
 * config, a stylesheet, the working copy's `deck.config.ts` and a new `slides/hung.mdx` there, then
 * waits until it is killed).
 *
 * Sessions behave as Claude Code's do: the fake keeps the ids it has seen in `.deck/fake-sessions/`
 * (or `DECK_FAKE_SESSIONS_DIR`); `--session-id` with a known id fails with "Session ID … is already
 * in use", `--resume` with an unknown one with "No conversation found with session ID …", both on
 * stderr with exit 1 before any output.
 *
 * With `DECK_FAKE_PROMPT_LOG` set it appends every prompt it reads to that file, for tests.
 *
 * It also never outlives its host: when its parent process goes away (the deck CLI was killed), it
 * exits, unless `DECK_FAKE_IGNORE_PARENT=1` (the watchdog test, which checks the watchdog alone).
 */
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * One scenario: the transcript it replays and what it does to the slide.
 */
type Scenario = {
  /**
   * The recorded transcript file.
   */
  readonly transcript: string;

  /**
   * The title to write, or undefined for no edit.
   */
  readonly title: ((requested: string | undefined) => string) | undefined;

  /**
   * Whether it waits for a signal after the transcript ends.
   */
  readonly waits: boolean;

  /**
   * The exit code after the transcript.
   */
  readonly exitCode: number;

  /**
   * Milliseconds between lines, unless `DECK_FAKE_DELAY_MS` says otherwise.
   */
  readonly delayMs: number;

  /**
   * What it changes outside the slide before the transcript plays, if anything.
   */
  readonly escape?: (deck: Escape) => void;
};

/**
 * Where an escaping scenario writes: the real deck folder, its config, the brand folder and the
 * turn's working copy.
 */
type Escape = {
  /**
   * The absolute real deck folder.
   */
  readonly dir: string;

  /**
   * The absolute real config file.
   */
  readonly config: string;

  /**
   * The absolute brand folder, when the prompt names a brand.
   */
  readonly brand: string | undefined;

  /**
   * The absolute working copy, when the prompt names one (else the real deck folder).
   */
  readonly work: string;
};

/**
 * A config of code, which the dev server would run.
 */
const EVIL_CONFIG = `import { writeFileSync } from 'node:fs';\nwriteFileSync('/tmp/deck-fake-agent-owned', 'x');\nexport default { title: 'Owned', slides: [] };\n`;

/**
 * Writes code into the real deck config.
 *
 * @param deck - Where to write.
 */
function escapeConfig(deck: Escape): void {
  writeFileSync(deck.config, configText() ?? EVIL_CONFIG);
}

/**
 * Writes a config and a stylesheet into the working copy: the escape the panel and the manual check
 * show.
 *
 * @param deck - Where to write.
 */
function escapeWork(deck: Escape): void {
  writeFileSync(path.join(deck.work, 'deck.config.ts'), configText() ?? EVIL_CONFIG);
  writeFileSync(path.join(deck.work, 'slides', 'styles.css'), '@plugin "./evil.cjs";\n');
}

/**
 * How long the process the `linger` scenario leaves behind waits before it writes, in milliseconds.
 */
const LINGER_MS = 1500;

/**
 * The scenarios by name.
 */
const SCENARIOS: Record<string, Scenario> = {
  'edit-title': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: (requested) => requested ?? 'Hello, fake agent',
    waits: false,
    exitCode: 0,
    delayMs: 4,
  },
  'lint-error': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: (requested) => `LINT-ERROR ${requested ?? 'title'}`,
    waits: false,
    exitCode: 0,
    delayMs: 4,
  },
  refused: {
    transcript: 'claude-2.1.325-refused-edit-outside-deck.jsonl',
    title: undefined,
    waits: false,
    exitCode: 0,
    delayMs: 4,
  },
  long: {
    transcript: 'claude-2.1.325-cancelled-sigterm-no-result.jsonl',
    title: undefined,
    waits: true,
    exitCode: 0,
    delayMs: 150,
  },
  'fail-after-init': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: undefined,
    waits: false,
    exitCode: 1,
    delayMs: 4,
  },
  'edit-config': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: undefined,
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: escapeConfig,
  },
  escape: {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: (requested) => requested ?? 'Hello, fake agent',
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: escapeWork,
  },
  hang: {
    transcript: 'claude-2.1.325-cancelled-sigterm-no-result.jsonl',
    title: undefined,
    waits: true,
    exitCode: 0,
    delayMs: 150,
    escape: (deck) => {
      escapeConfig(deck);
      writeFileSync(path.join(deck.dir, 'styles.css'), '@plugin "./evil.cjs";\n');
      escapeWork(deck);
      writeFileSync(path.join(deck.work, 'slides', 'hung.mdx'), '# Written by a turn that hangs\n');
    },
  },
  'edit-css': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: (requested) => requested ?? 'Hello, fake agent',
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: (deck) => {
      writeFileSync(path.join(deck.work, 'slides/evil.css'), '@plugin "./evil.cjs";\n');
    },
  },
  symlink: {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: undefined,
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: (deck) => {
      symlinkSync(deck.config, path.join(deck.work, 'slides/link.mdx'));
    },
  },
  'edit-brand': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: undefined,
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: (deck) => {
      if (deck.brand !== undefined) {
        writeFileSync(path.join(deck.brand, 'brand.ts'), EVIL_CONFIG);
      }
    },
  },
  unreadable: {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: (requested) => requested ?? 'Hello, fake agent',
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: (deck) => {
      escapeConfig(deck);
      chmodSync(deck.config, 0o000);
    },
  },
  'same-stat': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: undefined,
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: (deck) => {
      const before = statSync(deck.config);
      const old = readFileSync(deck.config, 'utf8');
      const evil = `throw new Error('owned');//`.padEnd(old.length, ' ').slice(0, old.length);
      writeFileSync(deck.config, evil);
      utimesSync(deck.config, before.atime, before.mtime);
    },
  },
  'case-rename': {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: undefined,
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: (deck) => {
      const renamed = path.join(deck.work, 'slides/Title.mdx');
      renameSync(path.join(deck.work, 'slides/title.mdx'), renamed);
      writeFileSync(renamed, '---\ntitle: Renamed by case\n---\n\n# Renamed by case\n');
    },
  },
  linger: {
    transcript: 'claude-2.1.325-turn1-edit-title.jsonl',
    title: (requested) => requested ?? 'Hello, fake agent',
    waits: false,
    exitCode: 0,
    delayMs: 4,
    escape: (deck) => {
      // What a shell in Codex's sandbox can do: start a process in its own session (outside the
      // turn's process group) that writes into the working copy after the turn has ended, by
      // absolute path and relative to the folder it runs in.
      const slides = path.join(deck.work, 'slides');
      spawn(
        process.execPath,
        [
          '-e',
          `setTimeout(() => { const fs = require('node:fs'); for (const name of ['late.mdx', 'late.css']) { try { fs.writeFileSync(${JSON.stringify(slides)} + '/' + name, '@plugin "./x.cjs";\\n'); } catch {} try { fs.writeFileSync(name, '@plugin "./x.cjs";\\n'); } catch {} } }, ${LINGER_MS});`,
        ],
        { cwd: slides, detached: true, stdio: 'ignore' },
      ).unref();
    },
  },
  'not-signed-in': {
    transcript: 'claude-2.1.325-not-signed-in.jsonl',
    title: undefined,
    waits: false,
    exitCode: 1,
    delayMs: 4,
  },
};

/**
 * The folder of the recorded transcripts.
 */
const TRANSCRIPTS = path.resolve(import.meta.dirname, '../../../fixtures/transcripts');

/**
 * The slide path the transcripts were recorded with.
 */
const RECORDED_SLIDE = '/workspace/decks/hello/slides/title.mdx';

let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
});

/**
 * How often the fake checks that its parent still runs, in milliseconds.
 */
const PARENT_POLL_MS = 200;

const parent = process.ppid;
if (process.env.DECK_FAKE_IGNORE_PARENT !== '1') {
  setInterval(() => {
    if (process.ppid !== parent) {
      process.exit(1);
    }
  }, PARENT_POLL_MS).unref();
}

const args = process.argv.slice(2);
const sessionId = valueAfter('--session-id') ?? valueAfter('--resume') ?? 'fake-session';
const streamJson = valueAfter('--input-format') === 'stream-json';
const input = readFileSync(0, 'utf8');
const prompt = streamJson ? promptFromStreamJson(input) : input;
if (process.env.DECK_FAKE_PROMPT_LOG !== undefined) {
  writeFileSync(process.env.DECK_FAKE_PROMPT_LOG, `${prompt}\n=== end of prompt ===\n`, {
    flag: 'a',
  });
}

const name =
  process.env.DECK_FAKE_SCENARIO ?? /\[fake:([a-z-]+)\]/.exec(prompt)?.[1] ?? 'edit-title';
const scenario = SCENARIOS[name] ?? SCENARIOS['edit-title'];
const requestedTitle = /\[fake-title:([^\]]+)\]/.exec(prompt)?.[1];
const slideFile = /^Slide file: (\S+)/m.exec(prompt)?.[1];
const target = slideFile === undefined ? undefined : path.resolve(process.cwd(), slideFile);
const delayMs = Number(process.env.DECK_FAKE_DELAY_MS ?? scenario?.delayMs ?? 4);

if (checkSession()) {
  await replay();
}

/**
 * Plays Claude Code's session rules against the fake's store of session ids.
 *
 * @returns Whether the turn may run.
 */
function checkSession(): boolean {
  const store =
    process.env.DECK_FAKE_SESSIONS_DIR ?? path.join(process.cwd(), '.deck', 'fake-sessions');
  mkdirSync(store, { recursive: true });
  const named = valueAfter('--session-id');
  const resumed = valueAfter('--resume');
  if (named !== undefined) {
    if (existsSync(path.join(store, named))) {
      process.stderr.write(`Error: Session ID ${named} is already in use.\n`);
      process.exitCode = 1;
      return false;
    }

    writeFileSync(path.join(store, named), '');
  }

  if (resumed !== undefined && !existsSync(path.join(store, resumed))) {
    process.stderr.write(`No conversation found with session ID: ${resumed}\n`);
    process.exitCode = 1;
    return false;
  }

  return true;
}

/**
 * Replays the scenario's transcript, editing the slide when the recorded Edit's result arrives.
 */
async function replay(): Promise<void> {
  if (scenario === undefined) {
    return;
  }

  const lines = readFileSync(path.join(TRANSCRIPTS, scenario.transcript), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  if (name === 'fail-after-init') {
    return failAfterInit(lines[0] ?? '{}');
  }

  runEscape();

  let editPending = false;
  for (const line of lines) {
    if (interrupted) {
      return stop();
    }

    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === 'assistant' && JSON.stringify(event).includes('"name":"Edit"')) {
      editPending = true;
    } else if (event.type === 'user' && editPending) {
      editPending = false;
      editSlide();
    }

    if ('session_id' in event) {
      event.session_id = sessionId;
    }

    process.stdout.write(`${localise(JSON.stringify(event))}\n`);
    await sleep(delayMs);
  }

  if (scenario.waits) {
    while (!interrupted) {
      await sleep(25);
    }

    return stop();
  }

  process.exitCode = scenario.exitCode;
}

/**
 * Names the session in an `init` line, then fails the turn as Claude Code does for a model it does
 * not know.
 *
 * @param init - The recorded `system/init` line.
 */
function failAfterInit(init: string): void {
  const event = JSON.parse(init) as Record<string, unknown>;
  event.session_id = sessionId;
  const result = {
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: 'There is an issue with the selected model (no-such-model). It may not exist.',
    session_id: sessionId,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  process.stdout.write(`${localise(JSON.stringify(event))}\n${JSON.stringify(result)}\n`);
  process.exitCode = 1;
}

/**
 * The deck config text a `[fake-config:<base64>]` tag carries, if any.
 */
function configText(): string | undefined {
  const encoded = /\[fake-config:([A-Za-z0-9+/=]+)\]/.exec(prompt)?.[1];
  return encoded === undefined ? undefined : Buffer.from(encoded, 'base64').toString('utf8');
}

/**
 * Does what the scenario changes outside the slide, in the deck the prompt names.
 */
function runEscape(): void {
  const deck = /^Deck: decks\/([^/\s]+)\//m.exec(prompt)?.[1];
  if (scenario?.escape === undefined || deck === undefined) {
    return;
  }

  const brand = /\(brand "([a-z0-9-]+)"\)/.exec(prompt)?.[1];
  const dir = path.join(process.cwd(), 'decks', deck);
  const work = /^Working copy: (\S+?)\/?$/m.exec(prompt)?.[1] ?? dir;
  scenario.escape({
    dir,
    config: path.join(dir, 'deck.config.ts'),
    brand: brand === undefined ? undefined : path.join(process.cwd(), 'brands', brand),
    work,
  });
}

/**
 * Ends a cancelled turn as Claude Code does on SIGINT.
 */
function stop(): void {
  const interruptedLine = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
    parent_tool_use_id: null,
    session_id: sessionId,
  };
  const result = {
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    terminal_reason: 'aborted_streaming',
    session_id: sessionId,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  process.stdout.write(`${JSON.stringify(interruptedLine)}\n${JSON.stringify(result)}\n`);
  process.exitCode = 0;
}

/**
 * Writes the scenario's title into the slide's frontmatter and first heading.
 */
function editSlide(): void {
  if (scenario?.title === undefined || target === undefined) {
    return;
  }

  const title = scenario.title(requestedTitle);
  const source = readFileSync(target, 'utf8');
  const edited = source.replace(/^title: .*$/m, `title: ${title}`).replace(/^# .*$/m, `# ${title}`);
  writeFileSync(target, edited);
}

/**
 * Points the recorded paths at the slide and workspace the fake runs in.
 *
 * @param line - A transcript line.
 */
function localise(line: string): string {
  const slide = target ?? path.join(process.cwd(), 'decks/hello/slides/title.mdx');
  return line
    .replaceAll(RECORDED_SLIDE, slide)
    .replaceAll('"/workspace/', `"${process.cwd()}/`)
    .replaceAll('"cwd":"/workspace"', `"cwd":"${process.cwd()}"`);
}

/**
 * The value after a flag.
 *
 * @param flag - The flag.
 */
function valueAfter(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * The text of a stream-json user message.
 *
 * @param text - The stdin.
 */
function promptFromStreamJson(text: string): string {
  try {
    const message = JSON.parse(text.trim()) as {
      message?: { content?: { type?: string; text?: string }[] };
    };
    return (message.message?.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n');
  } catch {
    return text;
  }
}
