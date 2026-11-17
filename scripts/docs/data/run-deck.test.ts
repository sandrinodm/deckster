import * as NodeServices from '@effect/platform-node/NodeServices';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { checkInstalledWording } from '#data/run-deck.ts';
import { REPO_ROOT } from '#scratch-workspace.fixture.ts';
import { DECK_BIN } from '#script-support.ts';

/**
 * How long `deck present --help` may take to start, in milliseconds.
 */
const HELP_TIMEOUT_MS = 60_000;

describe('checkInstalledWording', () => {
  it.effect(
    "fails for the workspace's deck, whose help is in the repository's wording",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          checkInstalledWording({ executable: DECK_BIN, prefix: [] }, REPO_ROOT),
        );
        expect(error.message).toContain('install-electron');
      }).pipe(Effect.provide(NodeServices.layer)),
    HELP_TIMEOUT_MS,
  );
});
