import { lazyRun, type Command } from '#command.ts';
import { DEFAULT_DECK } from '#workspace.ts';

/**
 * The text `deck layouts --help` prints.
 */
const HELP = `Usage: deck layouts [deck] [--brand <name>] [--summary] [--json]

Lists the layouts a slide can name in its \`layout:\` frontmatter: the engine's and the kit's, and
the ones the deck's brand brings in brands/<name>/layouts.ts (source "brand:<name>"). A brand's
layouts are the template the organisation expects, so prefer them when one fits; slides on a brand
layout fall back to its kit layout when the deck moves to a brand without it.

Arguments:
  deck          Deck folder name under decks/. Default: $DECK, else "${DEFAULT_DECK}", else the only deck.

Options:
  --brand <name>
                List the layouts of this brand instead of the deck config's, as \`deck dev
                --brand\` renders it. A brand that does not load leaves its own layouts out, with
                a warning on stderr (and in "warnings" with --json).
  --summary     One compact entry per layout, for a first look: name, the first sentence of its
                description, default surface, title limit, slots (\`*\` required) with what each
                accepts and its budget, and item lists with their counts (stats[2-4]). With
                --json, { deck, warnings, layouts: [{ name, description, surface, titleMaxChars, slots:
                { <slot>: { accepts, required, maxWords?, maxBullets?, maxLines? } }, items:
                [{ field, min, max }] }] }. The brand's layouts come first, under a heading that
                names the brand, and each also has source ("brand:<name>") and fallback. Without
                --summary the output is the full catalog.
  --json        Print { deck, slideFrontmatter, warnings, layouts }. slideFrontmatter is the JSON Schema of
                the fields every slide takes. Each layout has name, source (a package, or
                "brand:<name>" for a brand layout), fallback (the kit layout a brand layout falls
                back to, else null), label (a brand layout's name in its source template, else
                null), description,
                frontmatter (JSON Schema of its own fields, with defaults), fields ({ required,
                default, allowed, hint } by name), title ({ required, maxChars } or null),
                surface (the default surface or null), slots ({ tag, description, required,
                accepts } by name; body is the content outside slot tags), budget (maxWords
                and maxBullets per slot, maxLines for code; the same in every brand), variants
                ([{ name, when: { fields, counts, filled }, budget, fields, limits }]: budget and
                fields are what the variant tightens, limits { budget, fields } every limit a
                slide that matches it is held to, field limits by path such as stats[].label),
                example ({ frontmatter, body, mdx }) and pptx.
  -h, --help    Show this help.`;

/**
 * `deck layouts`: the layouts available to a deck.
 */
export const layoutsCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'layouts',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'List the layouts available to a deck',

  /**
   * The text `deck layouts --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('layouts-run.ts', () => import('#commands/layouts-run.ts')),
};
