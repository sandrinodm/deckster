import type { E2EConfig } from 'e2e';

import { web } from '@e2e-dev/web';

import { BRANDS, deckPort } from '../support/deck.ts';

/**
 * How long a deck's dev server gets to answer, in milliseconds.
 */
const STARTUP_TIMEOUT_MS = 120_000;

/**
 * The kit's browser suite: the exemplars deck in Chromium at 1920x1080 (one canvas pixel per screen
 * pixel), once per brand, each served by `deck dev` (`packages/cli/src/bin.ts`), which the runner
 * starts before the first test and stops after the last.
 */
export default {
  tests: ['e2e/*.e2e.ts'],
  workers: 1,
  reporters: ['list', 'junit'],
  output: '.e2e',
  targets: BRANDS.map((brand) => ({
    name: `kit-${brand}`,
    engine: web({ browser: 'chromium', viewport: { width: 1920, height: 1080 } }),
    app: {
      url: `http://localhost:${deckPort(brand)}`,
      command: {
        executable: 'node',
        args: [
          '../cli/src/bin.ts',
          'dev',
          'exemplars',
          '--brand',
          brand,
          '--port',
          String(deckPort(brand)),
        ],
        startupTimeout: STARTUP_TIMEOUT_MS,
        log: `.e2e/logs/exemplars-${brand}.log`,
      },
    },
  })),
} satisfies E2EConfig;
