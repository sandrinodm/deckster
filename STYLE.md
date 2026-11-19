# Style sheet for the deckster docs

One page every writer follows. `AGENT.md` has the site's rules (links, images, generated files);
this page has the writing rules. The site goes live when `main`'s `.github/workflows/deploy.yml`
is run by hand: it builds this branch with fresh stills and decks and publishes it.
`.github/workflows/pages.yml` here only checks. The pages were written from briefs, `{/* BRIEF … */}` comments
that said what each page covers; review removed them all, because the site serves each page's
MDX source at `/<page>/index.mdx`. Don't add one back: `npm run check:briefs` fails the CI
build while any page carries one. When you are given a brief for a page, it decides what the
page covers and this page decides how it is written; list any conflict in your report.

## The reader

Someone who installed `@deckster/cli` 0.6.1 from npm (`npm install --global @deckster/cli`, Node
26 or later) and works in a folder of their own with `decks/` and maybe `brands/`. They have never
seen the deckster repository, and often they are directing an AI agent (Claude Code, Codex) that
writes the slides while they review. Write for that person: what to type, what they will see,
what to tell their agent.

## Ground truth: v0.6.1, run it

- The pages describe the npm release `@deckster/cli@0.6.1`. Its tag is `v0.6.1`.
  Read files at the tag
  (`git -C ../2026-11-13-presentation show v0.6.1:<path>`), because `main` and the working tree
  move on after a release. Earlier pages were checked against 0.6.0 (commit `5ee4926`), 0.5.0 (commit
  `7dc64ea`), 0.4.0 (commit `50e5d19`) or 0.3.0 (commit `4e0b186`); a statement that names one of
  them says which version was measured.
- **Run new or changed commands against 0.6.1 and verify their output.** Install it
  once in a scratch folder and run it from a fresh workspace:

  ```sh
  npm install --prefix "$TMPDIR/deck-0.6.1" @deckster/cli@0.6.1
  mkdir -p "$TMPDIR/talks" && cd "$TMPDIR/talks"
  export DECK_ROOT="$PWD"                      # the CLI climbs to the nearest folder with decks/
  export PATH="$TMPDIR/deck-0.6.1/node_modules/.bin:$PATH"
  deck --version                               # 0.6.1
  ```

  Before a release is on npm, pack the CLI as the publish workflow does
  (`pnpm --filter @deckster/cli pack --out <dir>/deckster-cli.tgz` in the checkout) and install
  that tarball the same way, and say so in your report. Keep both folders out of `/tmp` on macOS
  (`$TMPDIR` is fine): a stray `/tmp/node_modules` resolves a brand's font packages that a
  reader's workspace would not have, and `deck brand check` and `deck brand add` then print the
  wrong output. Running `packages/cli/dist/deck.js` from the checkout through a wrapper finds the
  checkout's own fonts the same way, and `deck brand add` there writes the repository's package
  files; use it only for commands that touch no brand.

  An agent's shell keeps no state between calls: repeat the `cd`, `DECK_ROOT` and `PATH` lines in
  every command.

  Chromium for `lint`, `shot`, `diff` and `export`: `npx playwright@1.65.0 install chromium`.
  Confirmed: with no Chromium, 0.3.0 prints "Could not start Chromium: ..." and then
  "Install the browser with `npx playwright@1.65.0 install chromium`." 0.4.0, 0.5.0 and 0.6.0 pin the
  same Playwright, 1.65.0.
- **What an npm workspace has and the repository does not, or the other way round.** Confirmed by
  running 0.3.0, again with 0.4.0 and 0.5.0 from npm, and with the 0.6.0 tarball and then 0.6.0 from npm:
  - `deck new <deck>` writes only `decks/<deck>/deck.config.ts` and `decks/<deck>/slides/title.mdx`
    (no `package.json`, no `tsconfig.json`, no `pnpm install`). `deck types` writes the
    `tsconfig.json`.
  - Only the `default` brand ships with the CLI. `nocturne`, `fieldnote`, `kinetic` and `tidewater`
    live in the repository's `brands/` folder. To use one, run
    `deck brand add gh:sandrinodm/deckster/brands/<name>#v0.6.0`: it copies the folder without
    its `package.json` and `tsconfig.json` and prints the `npm install` line for its font
    packages, which go in the workspace folder; `deck brand check <name>` then passes. With 0.5.0
    and earlier, copy the folder, delete those two files and install the fonts by hand.
  - Only `fieldnote` of the published brands has a `layouts.ts`. The `brand-layouts` deck that
    uses its four layouts is not on the docs allowlist, so no still shows a brand layout: show its
    source and the CLI output of a scratch deck.
  - There is no `hello` deck in a new workspace. To run a published deck, copy
    `decks/<name>/` from the repository and delete its `package.json` and `tsconfig.json` (they
    point into the monorepo and make every slide fail with "Transform failed").
  - `deck icons` lists the names shared by the brands in the workspace: 2,377 Lucide names with
    only `default`. The site's `icons.json` lists the 776 names shared by all five published
    brands.
- `src/data/*.json` was generated from the repository. `cli.json` carries the help as the npm CLI
  prints it (checked against `deck <cmd> --help` from 0.3.0 for all 19 commands; the 0.4.0, 0.5.0 and
  0.6.0 data were read from the CLI packed at the release commit, which is what npm publishes), including the
  "See docs/agent.md" and "See docs/present.md" lines the CLI prints in `dev` and `present`; those
  files are not in the npm package, so never send readers to them. Still paste help you quote from
  the installed CLI, as for every output block.
- **Stale sources: never copy these.** `SECURITY.md`'s supported-versions table (says 0.1.x);
  `docs/deploy.md` (repository commands, Node 24, the gallery at the site root);
  `docs/present.md` (`pnpm` set-up and timing figures); every `pnpm ...` command in the READMEs.
  The READMEs and `docs/*.md` are written for the repository: translate them to the npm workspace
  and run the result.
- **A claim you cannot confirm in the code or by running it is left out and listed in your
  report.** No speed, size or quality claim without a number you measured, and say what you
  measured.

## Voice

- Second person, present tense, plain words: "Run `deck lint`", "The slide shows...".
- Specific over general: name the flag, the default, the file, the rule id.
- No marketing adjectives (powerful, seamless, beautiful, blazing, robust) and no "simply",
  "just", "easily", "of course".
- Sentence-case headings. No heading repeats the page title. No emoji.
- Commands are written `deck ...`, never `pnpm deck ...` or `pnpm dev ...`. The only exceptions
  are `/get-started/work-from-a-clone/` and `/project/contributing/`.
- Name things as the code does: `deck.config.ts`, the `stats` layout, the `<BarChart>` component,
  the `content-budget` rule, the `inverse` surface. Several names are both a layout and a
  component: say "the `table` layout" and "`<Table>`", "the `comparison` layout" and
  "`<Comparison>`", "the `timeline` layout" and "`<Timeline>`", "the `steps` layout" and
  "`<Step>`".

## Page shapes

- **Every page** opens with one paragraph (no heading above it) that says what the reader can do
  after reading it. Then sections. End with links onward only when the brief names them.
- **Task pages** (most of Get started, Write slides, Brands, Review, Present, Export): the
  procedure is a `<Steps>` list, one action per step, each with the command and what it prints.
- **Concept pages** (Concepts, Design decisions): explain the model in prose and one picture, then
  link to the task pages. No procedures.
- **Reference pages**: the generated components carry the content; prose is short and only says
  what the data cannot (how to read the table, where the names come from, a trap).
- **Length**: most pages 300 to 900 words. No padding, no history, no "in this guide we will".
  Never re-explain what another page owns: link to it. The brief's Links line says who owns what.

## Code and output

- Commands in `sh` fences; command plus output in `console` fences with a `$ ` prompt. Paste
  output exactly as the documented release printed it. Cut long output with a line `...` and say so in prose. Run
  from inside the workspace, so no `Using the workspace ...` line or scratch path appears; call
  the workspace `talks` and the example deck by a plain name such as `launch-review`.
- Slide source goes in `mdx` or `tsx` fences. Deck components (`<Notes>`, `<Step>`, `<Flow>`,
  ...) never appear as live tags on a page: the site has its own `Step`, `Steps`, `LinkCard` and
  `Aside`, and the rest are not registered. Inline, write them in backticks: `<Notes>`.
- Prefer real source: show a slide from a published deck (`slides.json` has every slide's source)
  over an invented one. If you invent one, lint it with the documented release first.

## Site components

`AGENT.md` ("Deck components") is the contract for these components; read it. The brief names
the exact props. Briefs write these calls without angle brackets (the site's validator reads
comments); on the page, write the tag: `<DeckEmbed deck="hello" slide="steps" />`. Pass props as
literals. A deck, slide, step, brand or name that does not exist fails the build, so build before
you hand off. No deck component renders a heading of its own (their labels, such as "Slots" or
"Example", are `###`), so `LayoutReference`, `PropsTable`, `CliCommand`, `BrandTokens`,
`FrontmatterReference`, `SchemaReference`, `ChartTypes` and `DiagramKinds` each need a `##`
heading you write above them.

| Component | Use it for | Limits in this release of the data |
| --- | --- | --- |
| `<DeckEmbed deck slide step? />` | A slide the reader should click through: steps, motion, a live demo | Any slide of a published deck; without `step` it opens the finished slide. `step` only for the twelve filmstrip slides (the build fails otherwise). One per section at most |
| `<SlideShot deck slide alt brand? step? />` | A still beside prose; zooms on click | Any slide; `step` only for the twelve filmstrip slides; `brand` only for `showcase` `cover`, `review-rounds`, `lint-path` |
| `<SlideExample deck slide />` | A slide and the source that made it, in tabs | Any slide; use it when the source is the point |
| `<StepStrip deck slide />` | Every step of one slide side by side | Only: showcase `review-rounds`, `lint-path`, `agent-turn`, `no-styling`; data-stories `redesign-effect`; diagrams-demo `request-journey`; components `handler-evolves`, `middleware-order`, `rollout-checks`, `edge-latency`; hello `steps`; lookbook `motion-rise` |
| `<BrandGrid slide />` | One slide in all five brands | Only `cover`, `review-rounds`, `lint-path` |
| `<UiShot name alt />` | The product UI in `deck dev` (showcase deck, 1440x900), the `deck present` windows, and one each of a `deck diff` report, a lint fix, a build gallery and a verify picture | Only `sidebar`, `overview`, `help`, `presenter`, `comments`, `comment-list`, `tools`, `tools-detail` (the tool buttons up close, 1120x400), `agent-panel`, `present-audience`, `present-presenter`, `diff-report` (the hello deck's report, staged: never call it a real change), `lint-before` and `lint-after` (a scratch slide, 1920x1080), `build-gallery`, `export-verify` (hello's title slide in LibreOffice; the CLI's one-row picture rearranged into two rows, 1920x1160: say so), `agent-turn` (a replayed fake-provider turn relabelled "Claude": caption it as a recorded example, never quote its figures; it is on `/ai-agents/agent-panel/`) |
| `<Diagram name alt />` | One of the six explanatory SVGs, on concept pages and where a brief names one | `build-pipeline`, `step-model`, `brand-resolution`, `agent-turn`, `export-pipeline`, `review-loop`; one per page |
| `<FrontmatterReference />`, `<SchemaReference of section? />`, `<ChartTypes of? />`, `<DiagramKinds part? />` | The slide frontmatter keys; every field of `brand.ts` (`of="brand"`, one `section` per table) or `deck.config.ts` (`of="deck-config"`); the chart prop types (`Highlight`, `Annotation.*`, ...); diagram node kinds, states, edge options and the cards guide | Types, allowed values, ranges and required. `SchemaReference` also shows a one-line description and default per field from `src/components/deck/schema-descriptions.ts`; the others have none. Write formats, patterns and how fields work together in prose from the code |
| `<LayoutReference name />`, `<LayoutIndex />`, `<PropsTable of />` (and `<PropsTable shared />` once on charts and diagrams), `<CatalogIndex kind />`, `<CliCommand name />`, `<IconGrid />`, `<BrandTokens name />` | Reference pages and, sparingly, one entry quoted on a guide. Each layout's `<LayoutReference>` is on its own page, `/reference/layouts/<name>/`; `<LayoutIndex />` is on `/reference/layouts/` | Names exactly as in the JSON |

A still or filmstrip the page needs and the table does not have: do not fake it with another
slide. Write the page without it and ask for it in your report (deck, slide, step or brand, why).

Site components from Nimbus: `<Steps>` for procedures, `<Tabs>`/`<TabItem>` for alternatives
(Claude or Codex), `<Aside>` for one caution per section at most, `<CardGrid>`/`<LinkCard>` only on
landing pages, `<FileTree>` for folder layouts.

## Images and alt text

`alt` is required and is a full sentence that says what the image shows, not what it is for:
"The presenter window shows the current slide, the next slide, the speaker notes and a timer."
Not "Presenter window screenshot". Open the WebP (stills in `src/assets/shots/`, or run
`node scripts/docs/shots.ts --out <dir>` / `ui-shots.ts` in the deckster repo) before you
describe it.

## Links

From `AGENT.md`: internal links from the site root, no base path, trailing slash
(`/get-started/quickstart/`); a built deck as `/decks/<name>/`, one slide as
`/decks/<name>/#/<slide>`; never a bare `/decks/`; source files as
`https://github.com/sandrinodm/deckster/blob/main/<path>`. Link the first mention of a concept that
has its own page, once per page. A layout links to its own page, `/reference/layouts/<name>/`, never to an
anchor on `/reference/layouts/`. Only the ten published decks and five published brands may
appear on any page, in examples or screenshots.

## New in v0.6.0, and newer than the release

Three features are new in 0.6.0. Twenty layouts: `recap`, `sources`, `definition`, `features`,
`do-dont`, `faq`, `quiz`, `exercise`, `pricing`, `quadrants`, `risks`, `market`, `dashboard`,
`conversation`, `before-after`, `voices`, `persona`, `schedule`, `status` and `actions`; each of
their pages carries `<Aside type="note" title="New in v0.6.0">` right after its opening
paragraph, with the error 0.5.0 prints for the name, and another page that names them as a group
says "new in 0.6.0" once. Brand layouts (`layouts.ts`, `deck layouts --brand`, the
`brand-layout-fallback` rule), owned by `/brands/brand-layouts/`. And `deck brand add`, owned by
the "Add a published brand" and "Add a brand from another repository" sections of
`/brands/use-a-brand/`.
A page that describes a feature new in a release says it needs that release: an
`<Aside type="note" title="New in v0.X.0">` on the page that owns it, or "New in 0.X.0." in a
sentence or a table row on the others. These notes stay after later releases, because they tell
a reader on an older CLI what is missing: hidden slides are new in 0.5.0 (`hidden: true` in a
slide's frontmatter, `deck export --include-hidden`, the `hidden` field of `deck shot --json` and
of `window.__deck.slides`; owned by `/write-slides/hidden-slides/`), and embed mode (`?embed`) and
diagram looks and cards (`diagram.edges`, `groups`, `labels`, `kinds`, `cards` in `brand.ts`,
`card="..."` on diagram parts, `diagram-card-missing`) are new in 0.4.0. Every other behaviour you
describe must be in the documented release. Something on `main` that is newer than the release is left out, or,
where a brief asks for it, mentioned in one or two sentences inside
`<Aside type="note" title="Not in v0.6.1">`; if `main` or the working tree differs from the
release, describe the release and report the difference.

## Your report

List: claims you left out because you could not confirm them; stills, filmstrips, UI shots or
JSON fields you needed; commands whose output differed from a README; and anything in a brief
that turned out to be wrong.
