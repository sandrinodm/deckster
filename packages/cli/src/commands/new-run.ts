import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { Console, Effect } from 'effect';
import path from 'node:path';

import { usageError } from '#cli-error.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { createApp } from '#scaffold/new-app.ts';
import { createDeck } from '#scaffold/new-deck.ts';
import { addSlide } from '#scaffold/new-slide.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = Effect.fn('deck.new')(function* (argv) {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('new', argv, {
    title: { type: 'string' },
    layout: { type: 'string' },
    brand: { type: 'string' },
    duration: { type: 'string' },
  });
  const [first, second, third] = positionals;
  if (first === 'slide') {
    if (second === undefined || third === undefined) {
      return yield* usageError(
        'Which deck and slide id? For example `' + deckCommand() + ' new slide hello intro`.',
        'new',
      );
    }

    const files = yield* addSlide({
      workspaceRoot,
      deck: second,
      id: third,
      layout: values.layout,
    });
    yield* printFiles(workspaceRoot, files);
    return EXIT_OK;
  }

  if (first === 'app') {
    if (second === undefined || third === undefined) {
      return yield* usageError(
        'Which deck and app name? For example `' + deckCommand() + ' new app hello agent-demo`.',
        'new',
      );
    }

    const created = yield* createApp(workspaceRoot, second, third);
    yield* printFiles(workspaceRoot, created.files);
    yield* Console.log(
      created.needsInstall
        ? `Next: run \`pnpm install\` to link the deck's new dependencies, ` +
            `then add <AppFrame app="${third}" poster="..." /> to a slide.`
        : `Next: add <AppFrame app="${third}" poster="..." /> to a slide.`,
    );
    return EXIT_OK;
  }

  if (first === undefined) {
    return yield* usageError('Which deck? For example `' + deckCommand() + ' new my-talk`.', 'new');
  }

  const created = yield* createDeck(workspaceRoot, first, values.title, {
    ...(values.brand === undefined ? {} : { brand: values.brand }),
    ...(values.duration === undefined ? {} : { duration: values.duration }),
  });
  yield* printFiles(workspaceRoot, created.files);
  yield* Console.log(
    FRAMEWORK_INSTALLED
      ? `Next: run \`deckster dev ${first}\`. For editor type checking, run \`deckster types\` once ` +
          '(again after upgrading @deckster/cli).'
      : `Next: run \`pnpm install\` to link decks/${first}, then \`${deckCommand()} dev ${first}\`.`,
  );
  return EXIT_OK;
});

/**
 * Prints each file, relative to the workspace, one per line.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param files - Absolute paths.
 */
const printFiles = Effect.fn('printFiles')(function* (
  workspaceRoot: string,
  files: readonly string[],
) {
  for (const file of files) {
    yield* Console.log(path.relative(workspaceRoot, file));
  }
});
