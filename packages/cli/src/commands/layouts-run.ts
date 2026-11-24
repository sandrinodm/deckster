import { Console, Effect } from 'effect';

import { chooseDeck, defaultDeck } from '#choose-deck.ts';
import { EXIT_OK, type Command } from '#command.ts';
import { listLayouts, type LayoutInfo } from '#layouts/list-layouts.ts';
import { ownLayoutsFirst, formatSummaries, summarizeLayout } from '#layouts/summarize-layouts.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { DEFAULT_DECK, Workspace } from '#workspace.ts';

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = Effect.fn('deck.layouts')(function* (argv) {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('layouts', argv, {
    json: { type: 'boolean', default: false },
    summary: { type: 'boolean', default: false },
    brand: { type: 'string' },
  });
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
  const lines = [
    `${layout.name}  (${layout.source})`,
    `  ${layout.description}`,
    ...(layout.fallback === null ? [] : [`  Falls back to: ${layout.fallback}`]),
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
