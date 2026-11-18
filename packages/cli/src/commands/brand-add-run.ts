import { describeProblem } from '@deckster/brand';
import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect } from 'effect';

import { addBrand, type AddedBrand } from '#brand-add/add-brand.ts';
import { shortCommit } from '#brand-add/fetch-brand.ts';
import { usageError } from '#cli-error.ts';
import { EXIT_OK } from '#command.ts';
import { printJson } from '#json-output.ts';
import { count } from '#lint/format-report.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments of `deck brand add <source>` and adds the brand.
 *
 * @param argv - The arguments after `brand`, without `add`.
 * @returns The exit code.
 * @throws CliError in the error channel for a missing or extra source, and every error of
 *   `addBrand`.
 */
export const runBrandAdd = Effect.fn('deck.brand.add')(function* (argv: readonly string[]) {
  const { values, positionals } = yield* parseCommandArgs('brand', argv, {
    json: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  });
  const [source, ...extra] = positionals;
  if (source === undefined || extra.length > 0) {
    return yield* usageError(
      'Name one brand source, for example ' +
        `\`${deckCommand()} brand add gh:acme/brand-kit/brands/acme#v2\`.`,
      'brand',
    );
  }

  const { root } = yield* Workspace;
  yield* Console.error(`Fetching ${source} with git...`);
  const added = yield* addBrand(root, {
    source,
    force: values.force,
    installed: FRAMEWORK_INSTALLED,
  }).pipe(Effect.provide(NodeServices.layer));
  if (values.json) {
    yield* printJson({ ok: true, ...added });
  } else {
    yield* Console.log(formatAdded(added));
  }

  return EXIT_OK;
});

/**
 * The plain-text report of an added brand: where it came from, what was left out, its warnings and
 * what to run next.
 *
 * @param added - What `addBrand` did.
 */
function formatAdded(added: AddedBrand): string {
  const verb = added.replaced ? 'Replaced' : 'Added';
  const lines = [
    `${verb} ${added.dir}/ from ${added.source} at ${shortCommit(added.commit)} ` +
      `(${count(added.files.length, 'file')}).`,
  ];
  const leftOut = added.skipped.filter((file) => !added.written.includes(file.path));
  if (leftOut.length > 0) {
    lines.push(`Left out: ${leftOut.map((file) => `${file.path} (${file.reason})`).join(', ')}.`);
  }

  if (added.written.length > 0) {
    lines.push(`Wrote ${added.written.join(' and ')} for this workspace.`);
  }

  for (const warning of added.warnings) {
    lines.push(`  warning ${describeProblem(warning)}`, `          Fix: ${warning.fix}`);
  }

  lines.push('Next:', ...added.next.map((command) => `  ${command}`));
  return lines.join('\n');
}
