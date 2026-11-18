import { FRAMEWORK_ROOT } from '@deckster/brand/node';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

import { scratchWorkspace } from '#lint/scratch-workspace.fixture.ts';

/**
 * The CLI fixture.
 */
const FIXTURE = fileURLToPath(new URL('./cli-process.fixture.ts', import.meta.url));

/**
 * How long a command that fails on the deck may run before it counts as hung, in milliseconds. A
 * failure the deck config can report takes a few seconds; a command that prints the error and then
 * never exits is what this guards against.
 */
const EXIT_LIMIT_MS = 30_000;

/**
 * The test timeout: the exit limit and room to clean up.
 */
const TEST_TIMEOUT_MS = EXIT_LIMIT_MS + 15_000;

/**
 * The slide that every deck of this suite starts from.
 */
const SLIDE = (hidden: boolean): string =>
  `---\ntitle: Backup\n${hidden ? 'hidden: true\n' : ''}---\n\n# Backup\n`;

/**
 * How a CLI process ended.
 */
type Outcome = {
  /**
   * The exit code, or `null` when the process was killed because it did not exit in time.
   */
  code: number | null;

  /**
   * Whether the process outlived the exit limit.
   */
  hung: boolean;

  /**
   * What it printed.
   */
  output: string;
};

/**
 * Writes a scratch workspace with one deck, `demo`, whose config lists `listed` and whose slides
 * folder holds a slide per name of `files`, hidden or not.
 *
 * @param files - Slide ids and whether each is hidden.
 * @param listed - The ids the config lists.
 */
function writeDeck(files: Readonly<Record<string, boolean>>, listed: readonly string[]): string {
  const root = scratchWorkspace('deck-error-exit-');
  const deck = path.join(root, 'decks/demo');
  mkdirSync(path.join(deck, 'slides'), { recursive: true });
  writeFileSync(
    path.join(deck, 'deck.config.ts'),
    `export default { title: 'Demo', slides: ${JSON.stringify(listed)} };\n`,
  );
  for (const [id, hidden] of Object.entries(files)) {
    writeFileSync(path.join(deck, 'slides', `${id}.mdx`), SLIDE(hidden));
  }

  return root;
}

/**
 * Runs a deck command as a process and waits for it to exit.
 *
 * @param root - The workspace.
 * @param argv - The command and its arguments.
 */
function runCli(root: string, argv: readonly string[]): Promise<Outcome> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [FIXTURE, root, ...argv], {
      cwd: path.join(FRAMEWORK_ROOT, 'packages/cli'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let hung = false;
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      hung = true;
      child.kill('SIGKILL');
    }, EXIT_LIMIT_MS);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, hung, output });
    });
  });
}

describe('a deck that cannot load', () => {
  const COMMANDS = [
    ['lint', 'demo'],
    ['shot', 'demo'],
    ['export', 'demo', '--pdf'],
    ['dev', 'demo', '--port', '5391'],
  ] as const;

  describe.each([
    {
      name: 'every slide hidden',
      files: { first: true, second: true },
      listed: ['first', 'second'],
      message: 'has `hidden: true`, so there is nothing to show',
    },
    {
      name: 'a listed slide file missing',
      files: { first: false },
      listed: ['first', 'second'],
      message: 'second',
    },
  ])('with $name', ({ files, listed, message }) => {
    it.each(COMMANDS.map((argv) => [argv[0], argv] as const))(
      'deck %s exits non-zero with the error',
      async (_command, argv) => {
        const root = writeDeck(files, listed);
        try {
          const outcome = await runCli(root, argv);
          expect(outcome.hung, `the CLI did not exit in time:\n${outcome.output}`).toBe(false);
          expect(outcome.code).toBe(1);
          expect(outcome.output).toContain(message);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      },
      TEST_TIMEOUT_MS,
    );
  });
});
