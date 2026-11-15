import { discoverDecks, findDeck, type DeckLocation } from '@deckster/vite-plugin';
import { Console, Effect } from 'effect';
import path from 'node:path';

import { chooseDeck } from '#choose-deck.ts';
import { usageError } from '#cli-error.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { buildDeck } from '#site/build-deck.ts';
import { buildSite } from '#site/build-site.ts';
import { galleryDecks, SCRATCH_DECK_PREFIX } from '#site/scratch-decks.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = Effect.fn('deck.build')(function* (argv) {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('build', argv, {
    'with-exports': { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    out: { type: 'string' },
    'include-scratch': { type: 'boolean', default: false },
  });
  if (values.all && positionals[0] !== undefined) {
    return yield* usageError(
      `--all builds every deck, so it cannot be combined with "${positionals[0]}". ` +
        'Leave one out.',
      'build',
    );
  }

  if (values['include-scratch'] && values.out === undefined) {
    return yield* usageError(
      '--include-scratch only applies to the site --out writes; without --out every deck, ' +
        'zz- ones included, is built already. Add --out <dir> or leave it out.',
      'build',
    );
  }

  const name = values.all ? undefined : yield* chooseDeck(positionals[0], undefined);
  const decks: DeckLocation[] =
    name === undefined
      ? yield* discoverDecks(workspaceRoot)
      : [yield* findDeck(workspaceRoot, name)];
  if (values.out !== undefined) {
    const out = path.resolve(workspaceRoot, values.out);
    const { built, skipped } =
      name === undefined
        ? galleryDecks(decks, values['include-scratch'])
        : { built: decks, skipped: [] };
    if (skipped.length > 0) {
      yield* Console.log(
        `Leaving out ${skipped.length} scratch deck(s) (${SCRATCH_DECK_PREFIX}): ` +
          `${skipped.map((deck) => deck.id).join(', ')}. ` +
          'Pass --include-scratch to build them too.',
      );
    }

    const entries = yield* buildSite(built, out, values['with-exports']);
    yield* Console.log(
      `Built ${entries.length} deck(s) into ${out}; open ${path.join(out, 'index.html')}`,
    );
    return EXIT_OK;
  }

  for (const deck of decks) {
    yield* buildDeck(workspaceRoot, deck, values['with-exports']);
  }

  return EXIT_OK;
});
