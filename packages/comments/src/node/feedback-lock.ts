import { Effect, FileSystem, Option } from 'effect';

import { feedbackError, type FeedbackError } from '#node/feedback-error.ts';

/**
 * The suffix of the lock file next to a feedback file.
 */
const LOCK_SUFFIX = '.lock';

/**
 * How long to wait between attempts to take a held lock, in milliseconds.
 */
const LOCK_RETRY_MS = 15;

/**
 * How long to keep trying to take a lock before giving up, in milliseconds.
 */
const LOCK_TIMEOUT_MS = 5000;

/**
 * Milliseconds per second, for messages.
 */
const MS_PER_SECOND = 1000;

/**
 * How old a lock file must be before it counts as left behind by a writer that crashed, in
 * milliseconds; a write holds it for a few milliseconds.
 */
const STALE_LOCK_MS = 10_000;

/**
 * Runs an effect while holding the lock of one feedback file, so writers in different processes
 * (the dev server and `deckster comments`) never interleave a read and a write and lose a comment.
 * The lock is a `<file>.lock` file created exclusively; a lock older than ten seconds is taken
 * over. It is released when the effect ends, however it ends.
 *
 * @param file - The absolute feedback file.
 * @param use - The read, change and write to run under the lock.
 * @throws FeedbackError (`busy`) in the error channel when the lock stays held for five seconds.
 */
export const withFeedbackLock = Effect.fn('withFeedbackLock')(function* <A, E, R>(
  file: string,
  use: Effect.Effect<A, E, R>,
): Effect.fn.Return<A, E | FeedbackError, R | FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const lock = `${file}${LOCK_SUFFIX}`;
  return yield* Effect.acquireUseRelease(
    acquireLock(lock),
    () => use,
    () => fs.remove(lock).pipe(Effect.ignore),
  );
});

/**
 * Creates the lock file, waiting while another writer holds it.
 *
 * @param lock - The absolute lock file.
 */
const acquireLock = Effect.fn('acquireFeedbackLock')(function* (
  lock: string,
): Effect.fn.Return<void, FeedbackError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const taken = yield* fs.writeFileString(lock, String(process.pid), { flag: 'wx' }).pipe(
      Effect.as(true),
      Effect.catchReason('PlatformError', 'AlreadyExists', () => Effect.succeed(false)),
      Effect.mapError((error) =>
        feedbackError(
          'io',
          `Could not lock ${lock}: ${error.message}. Check the folder is writable.`,
        ),
      ),
    );
    if (taken) {
      return;
    }

    yield* removeIfStale(lock);
    yield* Effect.sleep(LOCK_RETRY_MS);
  }

  return yield* feedbackError(
    'busy',
    `${lock} stayed locked for ${LOCK_TIMEOUT_MS / MS_PER_SECOND} s. ` +
      'Another process is writing comments; try again, or delete the lock file if none is.',
  );
});

/**
 * Removes a lock file a crashed writer left behind.
 *
 * @param lock - The absolute lock file.
 */
const removeIfStale = Effect.fn('removeStaleFeedbackLock')(function* (
  lock: string,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.stat(lock).pipe(Effect.option);
  const modified = Option.flatMap(info, (stat) => stat.mtime);
  if (Option.isSome(modified) && Date.now() - modified.value.getTime() > STALE_LOCK_MS) {
    yield* fs.remove(lock).pipe(Effect.ignore);
  }
});
