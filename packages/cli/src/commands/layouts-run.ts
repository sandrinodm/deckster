import { deckCommand } from '@deckster/engine/command';
import { Console, Effect } from 'effect';
import { parseArgs } from 'node:util';

import { chooseDeck, defaultDeck } from '#choose-deck.ts';
import { usageError } from '#cli-error.ts';
import { EXIT_OK, lazyRun, type Command } from '#command.ts';
import { withJsonErrors } from '#json-output.ts';
import { describeReplacement, listLayouts, type LayoutInfo } from '#layouts/list-layouts.ts';
import { ownLayoutsFirst, formatSummaries, summarizeLayout } from '#layouts/summarize-layouts.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { DEFAULT_DECK, Workspace } from '#workspace.ts';

/**
 * The subcommands of `deckster layouts`, by the word that selects them, each loaded on first use:
 * `check` brings in the lint server and the browser, which listing never needs.
 */
const SUBCOMMANDS: ReadonlyMap<string, Command['run']> = new Map([
  ['new', lazyRun('layouts-new-run.ts', () => import('#commands/layouts-new-run.ts'))],
  ['check', lazyRun('layouts-check-run.ts', () => import('#commands/layouts-check-run.ts'))],
  ['eject', lazyRun('layouts-eject-run.ts', () => import('#commands/layouts-eject-run.ts'))],
  ['diff', lazyRun('layouts-diff-run.ts', () => import('#commands/layouts-diff-run.ts'))],
]);

/**
 * The options only a subcommand takes, with the subcommand that takes each. They are parsed here
 * too, so the word that names the subcommand is found among the arguments.
 */
const SUBCOMMAND_FLAGS = {
  /**
   * Every kit layout at once.
   */
  all: 'eject',

  /**
   * Keep helpers that differ from the kit's.
   */
  'keep-shared': 'eject',

  /**
   * Exit with 1 when the kit changed.
   */
  'fail-on-change': 'diff',
} as const;

/**
 * The options of the command and of every subcommand, which the command parses to find the word
 * that selects a subcommand.
 */
const OPTIONS = {
  /**
   * Print the result as JSON.
   */
  json: { type: 'boolean', default: false },

  /**
   * List one line per layout.
   */
  summary: { type: 'boolean', default: false },

  /**
   * The brand to list or work on, by name.
   */
  brand: { type: 'string' },

  /**
   * The deck to work on, by name.
   */
  deck: { type: 'string' },

  /**
   * Every kit layout at once, for `eject`.
   */
  all: { type: 'boolean', default: false },

  /**
   * Keep helpers that differ from the kit's, for `eject`.
   */
  'keep-shared': { type: 'boolean', default: false },

  /**
   * Exit with 1 when the kit changed, for `diff`.
   */
  'fail-on-change': { type: 'boolean', default: false },
} as const;

/**
 * Parses the arguments and runs the command, or the subcommand its first argument names; succeeds
 * with the process exit code. With `--json`, a failure, an unknown option included, is printed as
 * JSON on standard output and the exit code is 1.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runLayouts(argv));

/**
 * Lists the layouts, or runs the subcommand the first argument names.
 *
 * @param argv - The arguments after `layouts`.
 */
const runLayouts = Effect.fn('deck.layouts')(function* (argv: readonly string[]) {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('layouts', argv, OPTIONS);
  const [first] = positionals;
  const subcommand = first === undefined ? undefined : SUBCOMMANDS.get(first);
  if (first !== undefined && subcommand !== undefined) {
    return yield* subcommand(withoutArgument(argv, firstPositionalIndex(argv)));
  }

  if (values.deck !== undefined) {
    return yield* usageError(
      `--deck is for \`${deckCommand()} layouts new\`, \`check\`, \`eject\` and \`diff\`; to list ` +
        "a deck's layouts, name the deck as the first argument.",
      'layouts',
    );
  }

  for (const [flag, subcommandName] of Object.entries(SUBCOMMAND_FLAGS)) {
    if (values[flag as keyof typeof SUBCOMMAND_FLAGS]) {
      return yield* usageError(
        `--${flag} is for \`${deckCommand()} layouts ${subcommandName}\`.`,
        'layouts',
      );
    }
  }

  const deck =
    (yield* chooseDeck(positionals[0], yield* defaultDeck(workspaceRoot))) ?? DEFAULT_DECK;
  const catalog = yield* listLayouts(workspaceRoot, deck, values.brand);
  for (const warning of catalog.warnings) {
    yield* Console.error(`warning: ${warning}`);
  }

  if (values.summary) {
    const summaries = ownLayoutsFirst(catalog.layouts.map(summarizeLayout));
    yield* Console.log(
      values.json
        ? JSON.stringify({ deck, warnings: catalog.warnings, layouts: summaries }, null, 2)
        : formatSummaries(summaries),
    );
    return EXIT_OK;
  }

  yield* Console.log(
    values.json
      ? JSON.stringify({ deck, ...catalog }, null, 2)
      : catalog.layouts.map(formatLayout).join('\n'),
  );
  return EXIT_OK;
});

/**
 * The position of the first argument that is not an option or an option's value: the word that
 * selects a subcommand. Looking the word up by value would find an option's value that is the same
 * word (`--brand check check`).
 *
 * @param argv - The arguments, which parse without error.
 * @returns The index, or `-1` when there is none.
 */
function firstPositionalIndex(argv: readonly string[]): number {
  const { tokens } = parseArgs({
    args: [...argv],
    options: OPTIONS,
    allowPositionals: true,
    tokens: true,
  });
  const first = tokens.find((token) => token.kind === 'positional');
  return first === undefined ? -1 : first.index;
}

/**
 * The arguments without the one at a position.
 *
 * @param argv - The arguments.
 * @param at - The position to leave out.
 */
function withoutArgument(argv: readonly string[], at: number): string[] {
  return [...argv.slice(0, at), ...argv.slice(at + 1)];
}

/**
 * The plain listing of one layout: the name and source, the description, its slot tags, its fields
 * with their defaults and choices, its title limit, its default surface and its variants.
 *
 * @param layout - One layout.
 */
function formatLayout(layout: LayoutInfo): string {
  const tags = Object.values(layout.slots)
    .map((slot) => slot.tag)
    .filter((tag) => tag !== null)
    .map((tag) => `<${tag}>`);
  const slots = tags.length === 0 ? 'body only' : `body, ${tags.join(', ')}`;
  const replacement = describeReplacement(layout);
  const lines = [
    `${layout.name}  (${layout.source})`,
    `  ${layout.description}`,
    ...(layout.fallback === null ? [] : [`  Falls back to: ${layout.fallback}`]),
    ...(replacement === undefined ? [] : [`  ${replacement}`]),
    `  Slots: ${slots}`,
  ];
  const fields = Object.entries(layout.fields).map(([name, field]) => formatField(name, field));
  if (fields.length > 0) {
    lines.push(`  Fields: ${fields.join('; ')}`);
  }

  if (layout.title !== null) {
    lines.push(`  Title: ${formatTitle(layout.title)}`);
  }

  if (layout.surface !== null) {
    lines.push(`  Surface: ${layout.surface} unless the slide names one`);
  }

  if (layout.variants.length > 0) {
    lines.push(`  Variants: ${layout.variants.map(formatVariant).join('; ')}`);
  }

  return lines.join('\n');
}

/**
 * One variant in the plain listing: its name and what it tightens, such as `ratio 5:7 (body 30
 * words, 3 bullets)` or `four stats (stats[].label 32 characters)`.
 *
 * @param variant - One variant.
 */
function formatVariant(variant: LayoutInfo['variants'][number]): string {
  const slots = Object.entries(variant.budget).map(([slot, budget]) => {
    const parts = [
      ...(budget?.maxWords === undefined ? [] : [`${budget.maxWords} words`]),
      ...(budget?.maxBullets === undefined ? [] : [`${budget.maxBullets} bullets`]),
      ...(budget?.maxLines === undefined ? [] : [`${budget.maxLines} lines`]),
    ];
    return `${slot} ${parts.join(', ')}`;
  });
  const fields = Object.entries(variant.fields ?? {}).map(
    ([path, limit]) => `${path} ${limit.maxChars ?? ''} characters`,
  );
  const tightened = [...slots, ...fields];
  return tightened.length === 0 ? variant.name : `${variant.name} (${tightened.join('; ')})`;
}

/**
 * One field in the plain listing: its name, its choices and its default.
 *
 * @param name - The field name.
 * @param field - What the catalog knows about it.
 */
function formatField(name: string, field: LayoutInfo['fields'][string]): string {
  const parts = [
    ...(field.required ? ['required'] : []),
    ...(field.allowed === null ? [] : [field.allowed.map(formatValue).join(' | ')]),
    ...(field.default === null ? [] : [`default ${formatValue(field.default)}`]),
  ];
  return parts.length === 0 ? name : `${name} (${parts.join(', ')})`;
}

/**
 * A frontmatter value as the plain listing shows it: strings as they are, anything else as JSON.
 *
 * @param value - A default or an allowed value.
 */
function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The title line of the plain listing.
 *
 * @param title - The layout's title contract.
 */
function formatTitle(title: NonNullable<LayoutInfo['title']>): string {
  const need = title.required === true ? 'required' : 'optional';
  return title.maxChars === undefined ? need : `${need}, up to ${title.maxChars} characters`;
}
