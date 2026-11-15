import { Effect, FileSystem, Option } from 'effect';
import path from 'node:path';

import { feedbackError, type FeedbackError } from '#node/feedback-error.ts';
import { feedbackDir } from '#node/feedback-paths.ts';

/**
 * Fails when a path inside a deck's feedback folder, or the folder itself, is a symbolic link. The
 * feedback folder is committed content, so a link in it (or a linked `.feedback`) could send a
 * write, a read or a recursive remove outside the deck. The folders above the deck are the author's
 * own and may be links. A path that does not exist is fine.
 *
 * @param deckDir - The absolute deck folder.
 * @param target - The absolute path about to be read, written or removed; inside the feedback
 *   folder.
 * @throws FeedbackError (`invalid`) in the error channel naming the link, or a path that is not
 *   inside the feedback folder.
 */
export const assertNoFeedbackLinks = Effect.fn('assertNoFeedbackLinks')(function* (
  deckDir: string,
  target: string,
): Effect.fn.Return<void, FeedbackError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const base = feedbackDir(deckDir);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return yield* feedbackError('invalid', `${target} is not inside ${base}.`);
  }

  let current = base;
  for (const segment of ['', ...relative.split(path.sep).filter((part) => part !== '')]) {
    current = path.join(current, segment);
    const info = yield* fs.lstat(current).pipe(Effect.option);
    if (Option.isSome(info) && info.value.type === 'SymbolicLink') {
      return yield* feedbackError(
        'invalid',
        `${current} is a symbolic link, so the comments will not touch it. ` +
          'Replace it with a real folder or file, or delete it.',
      );
    }
  }
});
