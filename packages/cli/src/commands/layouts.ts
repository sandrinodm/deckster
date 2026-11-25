import { lazyRun, type Command } from '#command.ts';
import { DEFAULT_DECK } from '#workspace.ts';

/**
 * The text `deckster layouts --help` prints.
 */
const HELP = `Usage: deckster layouts [deck] [--brand <name>] [--summary] [--json]
       deckster layouts new <name> (--brand <brand> | --deck <deck>) [--json]
       deckster layouts check [name] (--brand <brand> | --deck <deck>) [--json]
       deckster layouts eject <name...> (--brand <brand> | --deck <deck>) [--keep-shared] [--json]
       deckster layouts eject --all --brand <brand> [--keep-shared] [--json]
       deckster layouts diff <name> (--brand <brand> | --deck <deck>) [--fail-on-change] [--json]

Lists the layouts a slide can name in its \`layout:\` frontmatter: the engine's and the kit's, the
ones the deck's brand brings in brands/<name>/layouts.ts (source "brand:<name>") and as code in
brands/<name>/layouts/<layout>/ (source "brand-code:<name>"), and the deck's own code layouts in
decks/<deck>/layouts/<layout>/ (source "deck:<deck>"). The deck's and the brand's layouts are the
template the organisation expects, so prefer them when one fits; slides on a brand data layout fall
back to its kit layout when the deck moves to a brand without it. A code layout with a problem is
left out, with a warning on stderr (and in "warnings" with --json) that names it and the fix. A code
layout that replaces a kit layout is marked "replaces the kit's <name>" and has \`replaces\` in --json.

Arguments:
  deck          Deck folder name under decks/. Default: $DECK, else "${DEFAULT_DECK}", else the only deck.
                The words new, check, eject and diff start the subcommands below; list a deck of
                one of those names with DECK=<name>.

Subcommands:
  new <name>    Writes a new code layout to brands/<brand>/layouts/<name>/ (--brand) or
                decks/<deck>/layouts/<name>/ (--deck): contract.ts (one body slot, a title and an
                eyebrow, a description, an example and a PowerPoint mapping whose title is the
                header's), layout.tsx (Frame, SlideHeader and Region from
                @deckster/kit/layout-parts), layout.css and limits.ts with one limit case. They pass
                \`deckster layouts check\` as written. The name is kebab-case and must be free: no
                folder there has it, and it is not an engine or kit layout (to replace one, write
                the folder yourself with \`replaces: true\` in its contract), a data layout of the
                brand, or (for a deck) a code layout of the deck's brand. The brand must be a folder
                of this workspace. It prints the files and the next step.
  check [name]  Checks the code layouts of the brand (--brand) or the deck (--deck), or only the
                one named: each folder has contract.ts and layout.tsx, both name the layout, the
                contract imports only what a contract may, loads and passes the contract checks,
                its name is not taken, a layout with \`replaces: true\` keeps what slides of the
                kit layout it replaces use (the decks' own slides included), and limits.ts
                (optional) is a list of limit cases. Then it renders each layout with no error
                through the lint server, in a temporary folder (nothing is written to the
                workspace): its contract's example, and every limit case with the title, eyebrow
                and slots filled to their limits (as a paragraph and, when the body takes bullets,
                as a list), in the deck's brand or, for a brand's layouts, in that brand. It reports
                the lint problems of each slide (overflow, budgets, contrast and the other slide
                rules) under the layout and case; rules about a deck as a talk (repetition, builds,
                notes, timing) are not run. Exits with 1 when any layout has an error. limits.ts
                runs like contract.ts (the same import rules), and never while an agent turn is
                changing files: \`export default [{ name: 'full-body', frontmatter: {}, filled: [] }]
                satisfies readonly LimitCase[]\`, with \`import type { LimitCase } from
                '@deckster/kit/limit-cases'\`; case names are kebab-case, filled lists named slots to
                fill besides body, and body: false leaves body empty.
  eject <name...>
                Copies kit layouts into brands/<brand>/layouts/<name>/ (--brand) or
                decks/<deck>/layouts/<name>/ (--deck) as code layouts that replace them, so you can
                change them: layout.tsx, contract.ts (with \`replaces: true\`), layout.css and
                limits.ts (the kit's limit cases). A copy renders the same as the kit layout until
                you change it. Kit parts with a public home are imported from
                @deckster/kit/layout-parts, @deckster/kit/layout-fields, @deckster/kit and
                @deckster/kit/diagrams; other helpers are copied once to layouts/_shared/ and
                shared by the ejected layouts, with the classes of a helper's own stylesheet renamed
                from kit-… to own-… in a brand and to dck-… in a deck, so the copy, the kit and the
                other owners never style each other. A stylesheet the layout shares with other kit
                layouts is copied into its folder and scoped to it. A kit layout without a
                stylesheet of its own (demo) gets an empty layout.css that layout.tsx imports. The kit layout and its stylesheet are no longer loaded for that brand or deck.
                Each folder also gets .eject/: the files as written and eject.json ({ layout,
                deckster, files: { <path>: <sha256> } }), which \`diff\` reads; leave it as it is.
                Refuses a name that is not a kit layout (\`brand\`, the renderer of data layouts,
                is not one), a layout whose folder exists, and a helper in layouts/_shared/ that
                differs from the one it would write, unless --keep-shared. Nothing is written when
                it refuses.
  diff <name>   Shows what the kit changed in an ejected layout since it was ejected: it ejects the
                current kit layout in memory and prints a unified diff from the files in .eject/ to
                that, on standard output, helpers in _shared/ included. Your own edits play no part;
                apply the changes you want by hand. It says so on standard error when the kit's
                layout no longer ejects cleanly (a private import with no place in a copy) or when
                .eject/ was changed. Exit code: 0 unless the command fails, or --fail-on-change
                finds a change.

Options:
  --brand <name>
                For new, check, eject and diff, the brand whose layouts/ to use. Otherwise, list the layouts of
                this brand instead of the deck config's, as \`deckster dev --brand\` renders it. A
                brand that does not load leaves its own layouts out, with a warning on stderr (and
                in "warnings" with --json).
  --summary     One compact entry per layout, for a first look: name, the first sentence of its
                description, default surface, title limit, slots (\`*\` required) with what each
                accepts and its budget, and item lists with their counts (stats[2-4]). With
                --json, { deck, warnings, layouts: [{ name, description, surface, titleMaxChars, slots:
                { <slot>: { accepts, required, maxWords?, maxBullets?, maxLines? } }, items:
                [{ field, min, max }] }] }. The deck's layouts come first, under a heading that
                names the deck, then the brand's, under a heading that names the brand; each
                layout also has source and fallback. Without --summary the output is the full
                catalog.
  --deck <deck>
                For new, check, eject and diff, the deck whose layouts/ to use.
  --all         For eject: every layout of the kit's catalog that the brand has no folder for yet,
                into one brand. From then on kit fixes reach those layouts only through
                @deckster/kit/layout-parts and layout-fields; the command warns about it.
  --keep-shared
                For eject: keep helpers in layouts/_shared/ that differ from the ones it would
                write (your edits, or an earlier version's); the new layouts use them as they are.
  --fail-on-change
                For diff: exit with 1 when the kit changed the layout or it no longer ejects
                cleanly.
  --json        For new: { ok, layout, brand, deck, dir, files, next } (brand or deck is null).
                For check: { ok, brand, deck, dir, layouts: [{ name, dir, cases, ok, problems }],
                problems }, each problem { severity, code, file, message, fix } and, for a rendered
                slide's, case, slide, step and selector; severity is error, warning or note (only
                errors fail); code is a layout problem id (such as layout-name-mismatch,
                layout-replace-breaks, layout-limits-invalid, layout-fallback-unavailable or
                layout-not-rendered) or a lint rule id (such as content-budget). problems at the top level belong to no one layout. A failure
                prints { ok: false, error: { type, message } }.
                For eject: { ok, brand, deck, layouts: [{ name, dir, files }], shared: { written,
                reused, kept }, skipped, skippedForDecks, warnings, next }; skipped lists the layouts
                --all left alone because their folder exists, and skippedForDecks [{ name, deck }]
                those it left out because a deck of the brand has a layout folder of the name.
                For diff: { ok, brand, deck, layout, dir, ejectedWith, current, changed, files:
                [{ path, status, diff }], problems, provenanceEdited }; status is unchanged,
                changed, added or removed, path is a file of the layout or _shared/<file>, and
                problems says why the kit's layout no longer ejects cleanly.
                Otherwise print { deck, slideFrontmatter, warnings, layouts }. slideFrontmatter is the JSON Schema of
                the fields every slide takes. Each layout has name, source (a package such as
                "@deckster/kit", "brand:<name>" for a brand data layout, "brand-code:<name>" for
                a brand code layout or "deck:<name>" for a deck code layout), fallback (the kit layout a brand layout falls
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
 * `deckster layouts`: the layouts available to a deck.
 */
export const layoutsCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'layouts',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'List the layouts available to a deck, or add, check and eject code layouts',

  /**
   * The text `deckster layouts --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('layouts-run.ts', () => import('#commands/layouts-run.ts')),
};
