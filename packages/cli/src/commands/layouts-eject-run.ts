import { deckCommand } from '@deckster/engine/command';
import { Console, Effect } from 'effect';

import { usageError } from '#cli-error.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { ejectLayouts, type EjectResult } from '#layouts/eject/eject-layouts.ts';
import { displayPath } from '#layouts/eject/eject-owner.ts';
import { readLayoutsOwner, type LayoutsOwner } from '#layouts/layouts-owner.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * What `--all` costs, said every time it is used.
 */
const ALL_WARNING =
  'Every kit layout is now a copy in this brand: kit fixes and new features reach these layouts ' +
  'only through @deckster/kit/layout-parts and @deckster/kit/layout-fields. Run `deckster ' +
  'layouts diff <name> --brand <brand>` after an upgrade to see what the kit changed.';

/**
 * Parses the arguments after `layouts eject` and ejects the layouts; succeeds with the exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runEject(argv));

/**
 * Copies kit layouts into a brand or a deck and prints what was written and the next step.
 *
 * @param argv - The arguments after `layouts eject`.
 */
const runEject = Effect.fn('deck.layouts.eject')(function* (argv: readonly string[]) {
  const { root } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('layouts', argv, {
    json: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    'keep-shared': { type: 'boolean', default: false },
    brand: { type: 'string' },
    deck: { type: 'string' },
  });
  if (values.all === positionals.length > 0) {
    return yield* usageError(
      'Name the kit layouts to eject, for example `' +
        `${deckCommand()} layouts eject title --brand acme\`, or pass --all with --brand to ` +
        'eject every kit layout; not both.',
      'layouts',
    );
  }

  const owner = yield* readLayoutsOwner('eject', values);
  if (values.all && owner.kind === 'deck') {
    return yield* usageError(
      '--all ejects every kit layout into a brand: pass --brand <brand>. A deck takes the ' +
        'layouts you name.',
      'layouts',
    );
  }

  const result = yield* ejectLayouts(root, owner, {
    names: values.all ? 'all' : positionals,
    keepShared: values['keep-shared'],
  });
  const warnings = values.all ? [ALL_WARNING] : [];
  const next = nextStep(owner, result);
  /**
   * The paths as authors see them.
   *
   * @param files - Absolute paths.
   */
  const shown = (files: readonly string[]): string[] =>
    files.map((file) => displayPath(root, file));
  if (values.json) {
    yield* printJson({
      ok: true,
      brand: owner.kind === 'brand' ? owner.name : null,
      deck: owner.kind === 'deck' ? owner.name : null,
      layouts: result.layouts.map((layout) => ({
        name: layout.name,
        dir: displayPath(root, layout.dir),
        files: shown(layout.files),
      })),
      shared: {
        written: shown(result.sharedWritten),
        reused: shown(result.sharedReused),
        kept: shown(result.sharedKept),
      },
      skipped: result.skipped,
      warnings,
      next,
    });
    return EXIT_OK;
  }

  for (const file of [
    ...result.layouts.flatMap((layout) => layout.files),
    ...result.sharedWritten,
  ]) {
    yield* Console.log(displayPath(root, file));
  }

  if (result.sharedReused.length > 0) {
    yield* Console.log(`Already there, unchanged: ${shown(result.sharedReused).join(', ')}`);
  }

  if (result.sharedKept.length > 0) {
    yield* Console.log(`Kept as you changed them: ${shown(result.sharedKept).join(', ')}`);
  }

  if (result.skipped.length > 0) {
    yield* Console.log(`Left alone, already in layouts/: ${result.skipped.join(', ')}`);
  }

  for (const warning of warnings) {
    yield* Console.error(`warning: ${warning}`);
  }

  yield* Console.log(`Next: ${next}`);
  return EXIT_OK;
});

/**
 * What to do after an eject: change the copies, check them, and watch the kit with `diff`.
 *
 * @param owner - The brand or deck ejected into.
 * @param result - What was written.
 */
function nextStep(owner: LayoutsOwner, result: EjectResult): string {
  const [first] = result.layouts;
  if (first === undefined) {
    return 'nothing was written: every kit layout already has a folder here.';
  }

  const at = `--${owner.kind} ${owner.name}`;
  return (
    'slides on these layouts now render from the copies. Change layout.tsx, layout.css and ' +
    `contract.ts, then run \`${deckCommand()} layouts check ${at}\`. Each copy keeps the kit ` +
    "layout's name and says `replaces: true`, so it must keep accepting what the kit layout's " +
    `slides use. \`${deckCommand()} layouts diff ${first.name} ${at}\` shows what the kit ` +
    'changed since.'
  );
}
