import { Config, Effect, Option } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/**
 * The author of comments when neither `DECK_AUTHOR` nor git's `user.name` is set.
 */
export const FALLBACK_AUTHOR = 'Reviewer';

/**
 * The `DECK_AUTHOR` environment variable, which names the author of new comments and resolutions.
 */
const AUTHOR_FROM_ENV = Config.option(Config.String('DECK_AUTHOR'));

/**
 * The name new comments and resolutions are signed with: `DECK_AUTHOR`, else `git config user.name`
 * run in the given folder, else {@link FALLBACK_AUTHOR}. It never fails; a missing git counts as no
 * name.
 *
 * @param cwd - The folder to ask git in, normally the workspace root.
 */
export const commentAuthor = Effect.fn('commentAuthor')(function* (
  cwd: string,
): Effect.fn.Return<string, never, ChildProcessSpawner.ChildProcessSpawner> {
  const fromEnv = yield* Effect.orElseSucceed(AUTHOR_FROM_ENV, () => Option.none<string>());
  const named = Option.getOrUndefined(fromEnv)?.trim();
  if (named !== undefined && named !== '') {
    return named;
  }

  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const fromGit = yield* spawner
    .string(ChildProcess.make('git', ['config', 'user.name'], { cwd }))
    .pipe(Effect.orElseSucceed(() => ''));
  const name = fromGit.trim();
  return name === '' ? FALLBACK_AUTHOR : name;
});
