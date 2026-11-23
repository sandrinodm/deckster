import { MIN_TYPE_SIZE_PX } from '@deckster/brand';

import { LINT_RULES } from '#lint/rules/index.ts';

/**
 * The column width of the rule ids in the help text, in characters.
 */
export const RULE_ID_WIDTH = 28;

/**
 * The rendered rules, one per id with its severity and description, for the help text.
 */
export const RULE_LIST = [...new Map(LINT_RULES.map((rule) => [rule.id, rule])).values()]
  .map((rule) => `  ${rule.id.padEnd(RULE_ID_WIDTH)}${rule.description} (${rule.severity})`)
  .join('\n');

/**
 * The text `deckster lint --help` prints.
 */
export const HELP = `Usage: deckster lint <deck> [--brand <name>] [--json]

Checks a deck and exits non-zero when it finds errors.

  1. Schema: the deck config, the brand and every slide file go through the same checks as
     \`deckster build\`, and each problem is reported with the file and its fix. When files fail, the
     rendered checks are skipped, because the deck cannot render.
  2. Rendered: the deck is opened in static mode and every step of every slide is measured.
  3. Deck: rules over the whole deck, such as the order of layouts.

Rules (the minimum text size is ${MIN_TYPE_SIZE_PX}px on the 1920x1080 canvas, from @deckster/brand):
  schema              Deck config, brand, frontmatter and MDX problems from the build pipeline.
${RULE_LIST}

Mark decoration with aria-hidden="true" or data-decorative: the overflow and text rules skip it.

Options:
  --brand <name>  Lint the deck rendered with brands/<name> instead of the deck config's brand.
  --json          Print { deck, brand, ok, summary: { errors, warnings, slides, steps,
                  budgetSeconds }, findings } as JSON. Each finding has slide, file, step, rule,
                  severity, message, fix and selector. A failure (bad arguments, unknown deck,
                  browser problems) prints { ok: false, error: { type, message } } instead.
  -h, --help      Show this help.`;
