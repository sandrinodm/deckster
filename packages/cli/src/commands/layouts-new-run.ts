import { deckCommand } from '@deckster/engine/command';
import { Console, Effect } from 'effect';
import { parse as parseYaml } from 'yaml';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { usageError } from '#cli-error.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { displayPath } from '#layouts/eject/eject-owner.ts';
import { readLayoutsOwner } from '#layouts/layouts-owner.ts';
import { createLayout } from '#layouts/new-layout.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments after `layouts new` and writes the layout; succeeds with the exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runNew(argv));

/**
 * Writes a new code layout into a brand or a deck and prints the files and the next step.
 *
 * @param argv - The arguments after `layouts new`.
 */
const runNew = Effect.fn('deck.layouts.new')(function* (argv: readonly string[]) {
  const { root } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('layouts', argv, {
    json: { type: 'boolean', default: false },
    brand: { type: 'string' },
    deck: { type: 'string' },
  });
  const [name, ...extra] = positionals;
  if (name === undefined || extra.length > 0) {
    return yield* usageError(
      'Name one layout, for example `' + deckCommand() + ' layouts new kpi-wall --brand acme`.',
      'layouts',
    );
  }

  const owner = yield* readLayoutsOwner('new', values);
  const created = yield* createLayout(root, owner, name);
  const files = created.files.map((file) => displayPath(root, file));
  const next = nextStep(owner, name);
  if (values.json) {
    yield* printJson({
      ok: true,
      layout: name,
      brand: owner.kind === 'brand' ? owner.name : null,
      deck: owner.kind === 'deck' ? owner.name : null,
      dir: displayPath(root, created.dir),
      files,
      next,
    });
    return EXIT_OK;
  }

  for (const file of files) {
    yield* Console.log(file);
  }

  yield* Console.log(`Next: ${next}`);
  return EXIT_OK;
});

/**
 * What to do after `layouts new`: use the layout on a slide, shape it, and check it.
 *
 * @param owner - The brand or deck it was added to.
 * @param name - The layout name.
 */
function nextStep(owner: LayoutsOwner, name: string): string {
  const deck = owner.kind === 'deck' ? owner.name : '<deck>';
  return (
    `put \`layout: ${yamlName(name)}\` in a slide's frontmatter ` +
    `(\`${deckCommand()} new slide ${deck} <id> --layout ${name}\` writes one from the example). ` +
    'Shape layout.tsx, layout.css and ' +
    'contract.ts, add a case to limits.ts for each variant, then run `' +
    `${deckCommand()} layouts check ${name} --${owner.kind} ${owner.name}\`.`
  );
}

/**
 * The layout name as a YAML value that reads back as that name: quoted when YAML would read it as
 * something else, such as `2028` (a number) or `true`.
 *
 * @param name - The layout name.
 */
function yamlName(name: string): string {
  const parsed: unknown = parseYaml(name);
  return parsed === name ? name : JSON.stringify(name);
}
