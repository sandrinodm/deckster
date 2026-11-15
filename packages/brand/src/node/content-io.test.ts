import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { execFileSync } from 'node:child_process';
import { closeSync, constants, mkdtempSync, openSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hashRegular, readRegular } from '#node/content-io.ts';

/**
 * The largest file the tests read.
 */
const MAX_BYTES = 1024;

/**
 * How long a read of a FIFO may take before the test counts it as blocked, in milliseconds.
 */
const FIFO_TIMEOUT_MS = 2000;

/**
 * A new scratch folder.
 */
function scratch(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'content-io-'));
}

describe('reading a file a provider could have touched', () => {
  it.effect(
    'refuses a FIFO it is handed at once, without blocking on it',
    () =>
      Effect.gen(function* () {
        const fifo = path.join(scratch(), 'pipe.mdx');
        execFileSync('mkfifo', [fifo]);
        const read = yield* hashRegular(fifo, MAX_BYTES).pipe(
          Effect.timeoutOption(FIFO_TIMEOUT_MS),
          Effect.ensuring(
            Effect.sync(() => {
              // A read that blocked waits for a writer: give it one, so nothing hangs after the test.
              try {
                closeSync(openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK));
              } catch {
                // No reader was waiting.
              }
            }),
          ),
        );
        expect(read._tag === 'Some' ? read.value : 'blocked').toBe('fifo');
      }),
    FIFO_TIMEOUT_MS * 2,
  );

  it.effect('refuses a file that is not the one a walk saw (swapped in between)', () =>
    Effect.gen(function* () {
      const folder = scratch();
      const seen = path.join(folder, 'seen.mdx');
      const other = path.join(folder, 'other.mdx');
      writeFileSync(seen, '# Seen\n');
      writeFileSync(other, '# Other\n');
      const { dev, ino } = statSync(seen, { bigint: true });
      expect(yield* readRegular(other, MAX_BYTES, { dev, ino }).pipe(Effect.scoped)).toBe(
        'swapped',
      );
      const same = yield* readRegular(seen, MAX_BYTES, { dev, ino }).pipe(Effect.scoped);
      expect(typeof same === 'string' ? same : same.size).toBe('# Seen\n'.length);
    }),
  );
});
