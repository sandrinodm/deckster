import { Console, Effect } from 'effect';

import { EXIT_OK, type Command } from '#command.ts';
import { PLAIN_LIMIT } from '#commands/icons.ts';
import { listIcons, type IconListing } from '#icons/list-icons.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs } from '#parse-command-args.ts';

/**
 * The width the plain listing wraps at, in characters.
 */
const WRAP_WIDTH = 100;

/**
 * Parses the arguments and prints the shared icon names; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(
    argv,
    Effect.gen(function* () {
      const { values } = yield* parseCommandArgs('icons', argv, {
        brand: { type: 'string' },
        search: { type: 'string' },
        json: { type: 'boolean', default: false },
      });
      const brands = (values.brand ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '');
      const listing = yield* listIcons(brands, values.search);
      if (values.json) {
        yield* printJson(listing);
      } else {
        yield* Console.log(formatListing(listing, values.search));
      }

      return EXIT_OK;
    }),
  );

/**
 * The plain listing: the sets used, the count, and the names wrapped in lines.
 *
 * @param listing - The shared names.
 * @param search - The `--search` text, if any.
 */
function formatListing(listing: IconListing, search: string | undefined): string {
  const used = listing.brands.map((brand) => `${brand.name} (${brand.set})`).join(', ');
  const sets = [...new Set(listing.brands.map((brand) => brand.set))].join(', ');
  const match = search === undefined ? '' : ` matching "${search}"`;
  const lines = [`${listing.count} icon names${match} in every one of: ${used}`, `Sets: ${sets}`];
  if (listing.count === 0) {
    return lines.join('\n');
  }

  lines.push('', ...wrap(listing.icons.slice(0, PLAIN_LIMIT)));
  const hidden = listing.count - PLAIN_LIMIT;
  if (hidden > 0) {
    lines.push(
      '',
      `... and ${hidden} more. Narrow with --search <text>, or print all with --json.`,
    );
  }

  return lines.join('\n');
}

/**
 * Joins names with commas into lines no wider than the wrap width.
 *
 * @param names - The names, in order.
 */
function wrap(names: readonly string[]): string[] {
  const lines: string[] = [];
  let line = '';
  for (const name of names) {
    const next = line === '' ? name : `${line}, ${name}`;
    if (next.length > WRAP_WIDTH && line !== '') {
      lines.push(`${line},`);
      line = name;
    } else {
      line = next;
    }
  }

  if (line !== '') {
    lines.push(line);
  }

  return lines;
}
