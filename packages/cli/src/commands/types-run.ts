import { Console, Effect } from 'effect';
import path from 'node:path';

import { EXIT_OK, type Command } from '#command.ts';
import { writeEditorTypes } from '#editor-types/write-editor-types.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments and writes the editor settings; succeeds with the process exit code.
 */
export const run: Command['run'] = Effect.fn('deck.types')(function* (argv) {
  const { root } = yield* Workspace;
  yield* parseCommandArgs('types', argv, {});
  const result = yield* writeEditorTypes(root);
  if (result._tag === 'NotNeeded') {
    yield* Console.log(
      'Nothing to do: this is the framework repository, where the packages are linked by ' +
        'the workspace. `deckster types` is for a workspace that uses an installed @deckster/cli.',
    );
    return EXIT_OK;
  }

  yield* Console.log(path.relative(root, result.tsconfig));
  yield* Console.log(path.relative(root, result.declarations));
  yield* Console.log(
    `Mapped ${result.entryPoints} @deckster/* entry points. The paths name this install: ` +
      'run `deckster types` again after upgrading @deckster/cli.',
  );
  return EXIT_OK;
});
