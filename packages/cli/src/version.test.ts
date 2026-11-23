import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { runCaptured } from '#cli.fixture.ts';
import { cliVersion } from '#version.ts';

/**
 * The version in this package's manifest.
 */
const MANIFEST_VERSION: string = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'),
).version;

describe('cliVersion', () => {
  it.effect('reads the repository package version', () =>
    Effect.gen(function* () {
      expect(yield* cliVersion()).toBe(MANIFEST_VERSION);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe('deckster --version', () => {
  it.effect('prints the version for --version and -v', () =>
    Effect.gen(function* () {
      for (const flag of ['--version', '-v']) {
        const { output, code } = yield* runCaptured([flag]);

        expect(output.trim()).toBe(MANIFEST_VERSION);
        expect(code).toBe(0);
      }
    }),
  );
});
