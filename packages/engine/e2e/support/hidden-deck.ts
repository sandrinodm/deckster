import { afterAll, beforeAll } from 'e2e';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

/**
 * The port the hidden-slides deck's dev server listens on during the suite; a clash fails the run.
 */
const HIDDEN_PORT = 5198;

/**
 * The address of the hidden-slides deck's dev server.
 */
export const HIDDEN_URL = `http://localhost:${HIDDEN_PORT}`;

/**
 * Slide ids of the hidden-slides deck, in manifest order; the second, fourth and fifth are hidden.
 */
export const HIDDEN_DECK_SLIDES = [
  'opening',
  'backup-one',
  'middle',
  'backup-two',
  'backup-three',
  'closing',
];

/**
 * How long the dev server gets to answer before the suite fails, in milliseconds.
 */
const STARTUP_TIMEOUT_MS = 120_000;

/**
 * How long to wait between two checks for the dev server, in milliseconds.
 */
const POLL_INTERVAL_MS = 500;

/**
 * The repository root, where `pnpm deck` runs.
 */
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * The workspace folder that holds the fixture deck under `decks/`.
 */
const FIXTURE_WORKSPACE = path.resolve(import.meta.dirname, '../fixtures');

/**
 * Starts `deckster dev` on the fixture deck before the suite's first test and stops it after the
 * last. The deck lives in this package's `e2e/fixtures`, which `DECK_ROOT` names as the workspace.
 */
export function useHiddenDeckServer(): void {
  let server: ChildProcess | undefined;
  beforeAll(async () => {
    server = spawn(
      'pnpm',
      ['--dir', REPOSITORY_ROOT, 'deckster', 'dev', 'hidden', '--port', String(HIDDEN_PORT)],
      { env: { ...process.env, DECK_ROOT: FIXTURE_WORKSPACE }, stdio: 'ignore', detached: true },
    );
    await waitForServer();
  });
  afterAll(() => {
    if (server?.pid !== undefined) {
      process.kill(-server.pid, 'SIGTERM');
    }
  });
}

/**
 * Polls the dev server until it answers.
 *
 * @throws Error when it does not answer within the startup timeout.
 */
async function waitForServer(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const answered = await fetch(HIDDEN_URL).then(
      (response) => response.ok,
      () => false,
    );
    if (answered) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`The hidden-slides deck did not start on ${HIDDEN_URL}.`);
}
