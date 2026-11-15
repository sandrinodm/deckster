import { lazyRun, type Command } from '#command.ts';
import { DEFAULT_DECK } from '#workspace.ts';

/**
 * The text `deck layouts --help` prints.
 */
const HELP = `Usage: deck layouts [deck] [--summary] [--json]

Lists the layouts a slide can name in its \`layout:\` frontmatter.

Arguments:
  deck          Deck folder name under decks/. Default: $DECK, else "${DEFAULT_DECK}", else the only deck.

Options:
  --summary     One compact entry per layout, for a first look: name, the first sentence of its
                description, default surface, title limit, slots (\`*\` required) with what each
                accepts and its budget, and item lists with their counts (stats[2-4]). With
                --json, { deck, layouts: [{ name, description, surface, titleMaxChars, slots:
                { <slot>: { accepts, required, maxWords?, maxBullets?, maxLines? } }, items:
                [{ field, min, max }] }] }. Without --summary the output is the full catalog.
  --json        Print { deck, slideFrontmatter, layouts }. slideFrontmatter is the JSON Schema of
                the fields every slide takes. Each layout has name, source, description,
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
