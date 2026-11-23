import type { E2EConfig } from 'e2e';

import { web } from '@e2e-dev/web';

import { DECK_PORT } from '../support/deck.ts';

/**
 * How long the hello deck's dev server gets to answer, in milliseconds.
 */
const STARTUP_TIMEOUT_MS = 120_000;

/**
 * The engine's browser suite: the hello deck in Chromium at 1280x720, served by `pnpm deckster
 * dev`, which the runner starts before the first test and stops after the last.
 */
export default {
  tests: ['e2e/*.e2e.ts'],
  workers: 1,
  reporters: ['list', 'junit'],
  output: '.e2e',
  targets: [
    {
      name: 'engine',
      engine: web({ browser: 'chromium', viewport: { width: 1280, height: 720 } }),
      app: {
        url: `http://localhost:${DECK_PORT}`,
        command: {
          executable: 'pnpm',
          args: ['--dir', '../..', 'deckster', 'dev', 'hello', '--port', String(DECK_PORT)],
          startupTimeout: STARTUP_TIMEOUT_MS,
          log: '.e2e/logs/hello.log',
        },
      },
    },
  ],
} satisfies E2EConfig;
