import { deckCommand } from '@deckster/engine/command';
import { Console, Effect } from 'effect';

import type { LayoutDiff } from '#layouts/eject/diff-layout.ts';

import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { diffLayout } from '#layouts/eject/diff-layout.ts';
import { PROVENANCE_DIR } from '#layouts/eject/provenance.ts';
import { readLayoutsOwner } from '#layouts/layouts-owner.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments after `layouts diff` and prints the kit's changes; succeeds with the exit
 * code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runDiff(argv));

/**
 * Prints what the kit changed in one ejected layout since it was ejected.
 *
 * @param argv - The arguments after `layouts diff`.
 */
const runDiff = Effect.fn('deck.layouts.diff')(function* (argv: readonly string[]) {
  const { root } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('layouts', argv, {
    json: { type: 'boolean', default: false },
    'fail-on-change': { type: 'boolean', default: false },
    brand: { type: 'string' },
    deck: { type: 'string' },
  });
  const [name, ...extra] = positionals;
  if (name === undefined || extra.length > 0) {
    return yield* usageError(
      'Name one ejected layout, for example `' +
        `${deckCommand()} layouts diff title --brand acme\`.`,
      'layouts',
    );
  }

  const owner = yield* readLayoutsOwner('diff', values);
  const diff = yield* diffLayout(root, owner, name);
  if (values.json) {
    yield* printJson({
      ok: true,
      brand: owner.kind === 'brand' ? owner.name : null,
      deck: owner.kind === 'deck' ? owner.name : null,
      ...diff,
    });
  } else {
    yield* printDiff(diff);
  }

  const failed = values['fail-on-change'] && (diff.changed || diff.problems.length > 0);
  return failed ? EXIT_FAILED : EXIT_OK;
});

/**
 * Prints the diff as text: the patch on standard output, everything about it on standard error, so
 * the output can be piped to a file or a pager.
 *
 * @param diff - The kit's changes.
 */
const printDiff = Effect.fn('printDiff')(function* (diff: LayoutDiff) {
  for (const file of diff.provenanceEdited) {
    yield* Console.error(
      `warning: ${diff.dir}/${PROVENANCE_DIR}/${file} is missing or was changed after the eject, ` +
        'so its diff does not start from what was ejected.',
    );
  }

  for (const problem of diff.problems) {
    yield* Console.error(
      `warning: the kit's ${diff.layout} no longer ejects cleanly: ${problem} The diff below ` +
        "shows the kit's files as far as they could be rewritten.",
    );
  }

  const patches = diff.files.filter((file) => file.status !== 'unchanged');
  if (patches.length === 0) {
    yield* Console.log(
      `The kit's ${diff.layout} is the same as when it was ejected (deckster ` +
        `${diff.ejectedWith}; this is ${diff.current}).`,
    );
    return;
  }

  yield* Console.error(
    `The kit's ${diff.layout} changed in ${patches.length} of ${diff.files.length} files since ` +
      `it was ejected with deckster ${diff.ejectedWith} (this is ${diff.current}). "-" lines are ` +
      `what was ejected (${diff.dir}/${PROVENANCE_DIR}/), "+" lines are the kit now. Your own ` +
      'edits are not part of this; apply the changes you want by hand.',
  );
  yield* Console.log(patches.map((file) => file.diff).join(''));
});
