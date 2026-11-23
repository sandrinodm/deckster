import { describeProblem } from '@deckster/brand';
import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect, Result } from 'effect';

import { addBrand, type AddedBrand } from '#brand-add/add-brand.ts';
import { parseBrandSource } from '#brand-add/brand-source.ts';
import { shortCommit } from '#brand-add/fetch-brand.ts';
import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK } from '#command.ts';
import { printJson } from '#json-output.ts';
import { count } from '#lint/format-report.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * Parses the arguments of `deckster brand add <source>` and adds the brand.
 *
 * @param argv - The arguments after `brand`, without `add`.
 * @returns The exit code.
 * @throws CliError in the error channel for a missing or extra source, and every error of
 *   `addBrand`.
 */
export const runBrandAdd = Effect.fn('deck.brand.add')(function* (argv: readonly string[]) {
  const args = parseCommandArgs('brand', argv, {
    json: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  });
  const { values, positionals } = yield* args.pipe(Effect.mapError(invalidAddArguments));
  const [input, ...extra] = positionals;
  if (input === undefined || extra.length > 0) {
    return yield* invalidAddArguments();
  }

  const source = yield* parseBrandSource(input);
  const { root } = yield* Workspace;
  yield* Console.error(`Fetching ${source.display} with git...`);
  const result = yield* addBrand(root, {
    source,
    force: values.force,
    installed: FRAMEWORK_INSTALLED,
  }).pipe(Effect.provide(NodeServices.layer), Effect.result);
  if (Result.isFailure(result)) {
    const error = result.failure;
    if (values.json && error._tag === 'BrandError') {
      yield* printJson({
        ok: false,
        error: {
          type: error._tag,
          message: error.message,
          file: error.source,
          problems: error.problems,
        },
      });
      return EXIT_FAILED;
    }

    return yield* Effect.fail(error);
  }

  const added = result.success;
  if (values.json) {
    yield* printJson({ ok: true, ...added });
  } else {
    yield* Console.log(formatAdded(added));
  }

  return EXIT_OK;
});

/**
 * Reports malformed arguments without quoting a source that was parsed as an option.
 */
function invalidAddArguments(): ReturnType<typeof usageError> {
  return usageError(
    'Name one brand source with optional --force or --json flags. For example, ' +
      `\`${deckCommand()} brand add gh:acme/brand-kit/brands/acme#v2\`.`,
    'brand',
  );
}

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
    lines.push(
      `  warning ${warning.file}: ${describeProblem(warning)}`,
      `          Fix: ${warning.fix}`,
    );
  }

  lines.push('Next:', ...added.next.map((command) => `  ${command}`));
  return lines.join('\n');
}
