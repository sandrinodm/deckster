# This Nimbus docs site

> `CLAUDE.md` delegates here. Keep project instructions canonical in this file.

## deckster specifics (read first)

This is the documentation site for [deckster](https://github.com/sandrinodm/deckster), kept on the orphan branch `docs-site` of that repository. It is published at <https://sandrinodm.github.io/deckster/>, with the built decks under `/deckster/decks/`, by `main`'s `.github/workflows/deploy.yml`, run by hand: it checks out the tip of this branch, syncs the stills and decks from `main` under Xvfb with `DECKSTER_SHOTS_STRICT=1` (`npm run sync -- --shots --decks`; `src/data` is published as committed), exports the decks, builds the site and publishes it. `.github/workflows/pages.yml` on this branch only checks: it builds but publishes nothing, so a change here goes live on the next run of `deploy.yml`. Where this section and the Nimbus guide below disagree, this section wins.

Both workflows work: `deploy.yml`, the docs scripts (`scripts/docs/`) the sync runs and the embed mode `<DeckEmbed>` loads are committed on `main`, and `deploy.yml` has run successfully. It runs only when started by hand, so what is live is the tip of this branch at its last run, not the tip now.

- **The source of truth is the code on deckster's `main` branch**, not these pages and not `main`'s `README.md`, package READMEs or `docs/*.md`. Locally `main` is the worktree at `../2026-11-13-presentation`. Before you write or change a claim about a command, flag, default, prop, layout, frontmatter key, brand field, limit or error message, find it in the code (`git -C ../2026-11-13-presentation grep -n <name> main -- packages`) or run the command, and describe what the code does. Once `main` moves past the documented release, read the release tag instead (`git -C ../2026-11-13-presentation grep -n <name> v0.8.0 -- packages`). If you can't confirm it, leave it out or ask. The documented release is **v0.8.0**. `src/data/meta.json` records the version and release commit. Features that are new in 0.6.0 (twenty layouts, brand layouts, `deckster brand add`) say so on the pages that describe them, as do those new in 0.5.0 (hidden slides) and 0.4.0 (embed mode, diagram looks and cards); anything on `main` newer than the release is left out until it ships.
- **Readers install the CLI from npm.** Write commands as `deckster dev`, `deckster lint hello`, never `pnpm deck ...` or `pnpm dev ...`. Only the pages about working from a clone of the repository use `pnpm`.
- **Links:** write internal links from the site root, without the base path and with a trailing slash: `[quickstart](/get-started/quickstart/)`, not `/deckster/get-started/quickstart/` or a relative `../` path. Nimbus adds `/deckster`. Link a built deck as `/decks/<name>/`, or one slide as `/decks/<name>/#/<slide>`; the decks are built into `public/decks/` by `npm run sync`, so when that folder is missing `nimbus/internal-link` skips `/decks/**` (see `astro.config.ts`) and you check those links by hand; a build after a sync, as in CI, checks them. Don't link a bare `/decks/`: there is no index page. Link source files at `https://github.com/sandrinodm/deckster/blob/main/<path>`.
- **Images** live in `src/assets/` and are imported with a path relative to the page file: `../../assets/deckster-hero.png` from `src/content/docs/index.mdx`, `../../../assets/x.png` from a page in a group folder (`src/content/docs/<group>/<page>.mdx`); `public/` is for files served as-is. Alt text is a full sentence saying what the image shows.
- **Generated files: never edit them by hand.** `src/data/` holds JSON generated from `main` (catalogs, CLI help, brands, slides; committed), `src/assets/shots/` holds generated slide stills and UI screenshots, and `public/decks/` holds built decks (neither committed). `npm run sync` makes all three; see "Deck components" below. Change the code or the generator on `main` instead.
- **Only published decks and brands appear on the site**, on any page, in an example or in a screenshot. They are the allowlist in deckster's `scripts/docs/allowlist.ts` (also in `src/data/meta.json`); anything else under `decks/` or `brands/` on `main` stays private. Two exceptions. The UI shots `lint-before` and `lint-after` show one slide of a scratch deck (see "The lint pair" below). And `src/assets/tutorial/` holds two committed stills of the `launch-review` deck the get-started pages build (its cover after `deckster new`, and the `results` slide of [your first deck](/get-started/your-first-deck/)). They were taken with `deckster shot` from `@deckster/cli` 0.3.0 in a scratch workspace from the exact source on those pages and converted to WebP 1280 px wide; `@deckster/cli` 0.4.0 renders the same source the same (compared pixel by pixel: only antialiasing at the edges of a few glyphs differs), so they were kept. That comparison was not repeated for 0.5.0 (its only change to how slides are drawn is the page number, total and progress of a deck with hidden slides, which these decks have none of). For 0.6.0 both slides were shot again with `@deckster/cli` 0.6.0 from npm from the same source (the results slide with the deck at two slides, as on the page) and compared at 1280 px: the same slides, with only a few hundred antialiased edge pixels different, so they were kept. When that source changes, take them again.
- **Base path:** the site is a GitHub Pages project page, so every URL is under `/deckster/`, and origin-root files (`/robots.txt`, `/.well-known/*`) aren't served from this site. That's why `agents.discovery` is `false`. Ignore the `wrangler.jsonc` and Cloudflare notes below.
- **Look:** light theme only, black, white and one vermilion (`--deck-*` in `src/styles/globals.css`). Vermilion is 3.3:1 on white: use it for marks, never for text.
- **Before you hand off:** `npx @cloudflare/nimbus-docs check`, `npm run build`, then `check` again (link checking needs the build). Preview the build with `npm run preview` at <http://localhost:4321/deckster/>.
- Commit to `docs-site`, never to `main`; the branches share no history.
- **Starter files merged by hand.** `nimbus.json` records the starter at `templates-v0.8.3`, but `Header.astro`, `toc.client.ts`, `BaseLayout.astro` and `DocsLayout.astro` were merged by hand up to `templates-v0.9.0` (Nimbus 0.20.0), and no command records a hand merge. So `outdated` keeps listing them as `hand-merge`, and `diff <file>` shows this site's edits mixed in with upstream's. For the next upgrade, merge in three ways against the upstream starter (`git show <tag>:template/<path>` in `github.com/cloudflare/nimbus`), from `templates-v0.9.0` to the new tag. `ThemeToggle.astro` shows as `deleted`, and that is intended: the site is light only. Leave it out. The local edits to keep: the brand header and logo, no theme script or toggle, `nb-app`/`nb-scroll-root`/`nb-brand-surface` with `src/lib/scroll-root.ts` (the TOC's bottom detection reads it; it also saves and restores the scroll root's offset per history entry, on `astro:page-load` for a reload or a traversal to another page and on `popstate` with a non-null state for Back and Forward between fragments of one page, which Astro's router handles without any `astro:*` event), `codeBadges()`, and the per-page `socialImageAlt` passed to `NimbusHead`. The registry Switch is restyled to ink at the end of `globals.css`.

## Deck components

MDX globals for deckster content, in `src/components/deck/` and registered in `src/components.ts`. They read `src/data/*.json` and the stills in `src/assets/shots/` (through `import.meta.glob`, so Astro optimises the images; every synced still ships in `dist/_astro`, about 16 MB, whether a page uses it or not). A deck, slide, step, brand, layout, prop target, command or shot that doesn't exist **fails the build** with a message naming the component, the prop, the page and what exists instead; nothing renders an empty box. Pass props as literals: a string (`deck="hello"`, quotes inside it are fine: `alt='"No budgets"'`), a number (`step={0}`), a boolean or a string literal (`of={"BarChart"}`), never a variable, a computed value or a spread. The Markdown twins, the coverage check and the sync read the MDX source, and the build fails on any other expression (`checkWrittenProps` in `markdown.ts`); expression literals are read with a JavaScript parser (`literalValue` in `mdx-source.ts`, `@babel/parser`), so escapes are decoded (`{'Bar\u0043hart'}` is `BarChart`). **Write every component as a tag of its own**, never inside JavaScript: not in an `{expression}` (`{cond && <PropsTable of="BarChart" />}`), a prop value (`icon={<UiShot … />}`), a spread or an `export`. `mdx-source.ts` doesn't walk into JavaScript, so it fails the build, the coverage check and the sync alike with the page and line of each such component (an HTML element like `<br />` there is fine). `npm run check:mdx-source` (`scripts/check-mdx-source.mjs`, run in CI) checks those rejections and the literal parser.

| Component | Example | Shows |
|---|---|---|
| `DeckEmbed` | `<DeckEmbed deck="showcase" slide="lint-path" step={0} />` | A 16:9 poster of the slide; a click (or Enter/Space) swaps in the built deck in `?embed` mode at `/decks/<deck>/?embed#/<slide>/<step>`. One live deck per page: starting another returns the first to its poster. Without JavaScript the poster links to the deck. The poster always shows what the frame opens at: without `step`, the finished slide (the frame opens at the slide's last step); with `step`, that step's still, so `step` works only on the slides shot per step (`STEP_SLIDES`) and fails the build on any other. |
| `SlideShot` | `<SlideShot deck="lookbook" slide="statement-claim" alt="…" />` | A still with zoom. `alt` is required. `brand="nocturne"` only for the brand-grid slides (`showcase` `cover`, `review-rounds`, `lint-path`); `step={2}` only for slides shot per step. |
| `SlideExample` | `<SlideExample deck="hello" slide="steps" />` | Tabs: the live slide (a `DeckEmbed`) and its source file from `slides.json`, so the code shown is the code rendered. |
| `StepStrip` | `<StepStrip deck="showcase" slide="review-rounds" />` | Every step as a filmstrip that wraps (three to a row); a frame opens the deck at that step in a new tab. Only the slides in deckster's `scripts/docs/shots.manifest.ts` (`STEP_SLIDES`) have step stills: showcase `review-rounds`, `lint-path`, `agent-turn`, `no-styling`; data-stories `redesign-effect`; diagrams-demo `request-journey`; components `handler-evolves`, `middleware-order`, `rollout-checks`, `edge-latency`; hello `steps`; lookbook `motion-rise`. |
| `BrandGrid` | `<BrandGrid slide="cover" />` | One showcase slide in each published brand (`BRAND_GRID_SLIDES`: `cover`, `review-rounds`, `lint-path`). |
| `UiShot` | `<UiShot name="presenter" alt="…" />` | A product screenshot. At 1440×900: `sidebar`, `overview`, `help`, `presenter`, `comments`, `comment-list`, `tools`, `agent-panel` (all `deckster dev` on the showcase deck); `present-audience` and `present-presenter` (the `deckster present` windows on showcase `where-hours-went`); `agent-turn` (a replayed turn: see below); `diff-report` (the report page of `deckster diff hello`, staged: see below); `build-gallery` (the gallery page of `deckster build --all --out` over the published decks). `tools-detail` is the tool buttons up close: a 560×200 crop of the bottom-left corner of `tools` at 2x (1120×400). `lint-before` and `lint-after` are one scratch slide before and after its lint fix (1920×1080; see below). `export-verify` is the LibreOffice comparison picture of `hello`'s title slide from `deckster export hello --verify --renderer libreoffice`: the script copies the CLI's 2880×580 picture (three panels in a row), and the sync moves the difference panel under the other two (1920×1160, `UI_RELAYOUT` in `scripts/sync.mjs`), so say so where you show it. `alt` is required. |
| `LayoutReference` | `<LayoutReference name="statement" />` | Description, frontmatter fields, slots, budgets, variants and example of a layout, with a still of a slide that uses it (first in `lookbook`, else `layouts`, else any deck). It renders no heading: write the `##` heading yourself (`## Reference` on a layout page); the block has `id="layout-<name>"`. Each layout's entry lives on its own page, `src/content/docs/reference/layouts/<name>.mdx`. |
| `LayoutIndex` | `<LayoutIndex />` | Every layout as a still with its one-line summary, linking to the layout's page `/reference/layouts/<name>/`. The summary is that page's frontmatter `description` (the Markdown twin reads the same field from the file), so the card and the page say the same thing; a layout without a page falls back to `layoutSummary` in `format.ts` (the catalog description's first sentence, cut before its first colon outside a code span). |
| `PropsTable` | `<PropsTable of="BarChart" />`, `<PropsTable shared="charts" />` | `of`: use when, avoid, limits, a still of the first published slide that uses the component (lookbook first; none for `Notes` and `Step`), its own props, one line naming the shared props it also takes, and the example, one prop per line, of a component, chart or diagram component (`components.json`, `charts.json`, `diagrams.json`). Has `id="props-<name>"`. `shared` (`charts` or `diagrams`): the catalog's shared props in full, once per page; the entries' "Also takes" lines link to its `id="props-shared"`. |
| `CatalogIndex` | `<CatalogIndex kind="charts" />` | Everything in one catalog (`components`, `charts` or `diagrams`) with its use-when line, linking to `/reference/<kind>/#props-<name>`. |
| `CliCommand` | `<CliCommand name="lint" />` | A command's summary, usage forms and full `--help` from `cli.json`. Has `id="cli-<name>"`. |
| `IconGrid` | `<IconGrid />` | The icon names from `icons.json`, filterable; selecting a name copies it. Names only: each brand draws them from its own set. |
| `BrandTokens` | `<BrandTokens name="default" />` | A brand's palette, surfaces and type scale from `brands.json`, then its diagram look (`tokens.diagram`: edges, groups, edge labels, kinds) and every card with its colours on the `default` surface (`tokens.surfaces.default.diagramCards`), the lines `deckster brand <name>` prints. |
| `FrontmatterReference` | `<FrontmatterReference />` | The keys every slide's frontmatter takes, from `layouts.json` `slideFrontmatter` (a JSON Schema): each key's type, allowed values and limits, and the fields of `background`'s object form. No props. Has `id="slide-frontmatter"`. |
| `SchemaReference` | `<SchemaReference of="brand" section="color" />` | Every field of `brand.ts` (`of="brand"`, `brand-schema.json`) or `deck.config.ts` (`of="deck-config"`, `deck-config.json`) as tables grouped by the first two path segments (each row shows its path from there; the forms of a union, `[type=…]`, are folded): path, type with its limits, a `required` tag, and a description with the default from `src/components/deck/schema-descriptions.ts` (a hand-written overlay keyed by row path; a row without an entry shows nothing, and a key that names no row fails the build). `section` limits it to one top-level field (the brand has about 300 rows); an unknown one fails the build. Has `id="schema-<of>"` or `id="schema-<of>-<section>"`. |
| `ChartTypes` | `<ChartTypes of="Highlight" />` | The object types chart props take, from `charts.json` `types`: `RowStat`, `ProgressItem`, `TableColumn`, `SeriesInput`, `FormatOptions`, `Highlight`, `RevealOption`, `Annotation.callout`, `Annotation.reference`, `Annotation.range`, `Annotation.bracket`. Without `of`, all eleven. Each has a `###` label and `id="type-<name>"`. |
| `DiagramKinds` | `<DiagramKinds part="kinds" />` | From `diagrams.json`: the node `kind`s (aliases, shape, icon, use when), the `State` values with the words that mean the same, the `<Edge>` options with examples, and the cards guide (`cards`: how a node picks its `card`, the five standard cards, the rules). `part` is `kinds`, `states`, `edges` or `cards`; without it, all four, each with a `###` label and `id="diagram-<part>"`. |
| `Diagram` | `<Diagram name="build-pipeline" alt="…" />` | One of the explanatory SVGs in `src/assets/diagrams/` (`build-pipeline`, `step-model`, `brand-resolution`, `agent-turn`, `export-pipeline`, `review-loop`) as an `<img>`; the image zoom opens it at screen size, and the caption links the file. Below 640 px it keeps a 640 px width and scrolls sideways in its frame. `alt` is required. |

`src/content/docs/project/component-demo.mdx` (hidden from the sidebar) uses each once, so the build exercises them. `FrontmatterReference` and `SchemaReference` share `SchemaTable.astro` and the JSON Schema flattener in `format.ts` (also used by the Markdown twins); a schema keyword the flattener doesn't know (a future `pattern` is known, a `$ref` is not) fails the build rather than dropping a constraint.

**Markdown twins.** Nimbus builds each page's `index.md` and `llms-full.txt` from the MDX; a custom component it doesn't know is dropped. `markdown.componentMap` in `astro.config.ts` renders these components as Markdown instead (`src/components/deck/markdown.ts`). Nimbus passes a renderer a string prop as written and an expression prop as its source (`of={"BarChart"}` arrives as `"BarChart"`, quotes and all) and doesn't say which was which, so `writtenAttrs` looks each tag up among the tags `mdx-source.ts` read from the pages, which know how each attribute was written, and decodes only the expressions; a string passes through unchanged. Two tags that reach the renderer identically but were written differently (`alt='"x"'` on one, `alt={"x"}` on another) can't be told apart there and fail the build when decoding would change the value (`step="0"` and `step={0}` pass): write both the same way: the reference components as tables and lists from the same JSON, stills as their alt text with a link to the slide, embeds as a link to the deck. Check them in `dist/<page>/index.md` after a build.

**Sync.** `npm run sync` refreshes the generated inputs from a deckster checkout: `DECKSTER_REPO`, else `../2026-11-13-presentation`, else `../deckster`, with its dependencies installed (`pnpm install`, plus Chromium for the stills). It runs that checkout's `scripts/docs/data.ts`, `shots.ts`, `ui-shots.ts` and `decks.ts` into scratch folders and installs the results; `--data`, `--shots` or `--decks` runs one part. A part whose script fails is not installed and the sync exits 1.

For slide and step stills and built decks, `scripts/preview-workspace.mjs` copies the allowlisted decks and brands into a temporary workspace and selects Fieldnote in the copied deck configs. Brand comparison stills use their explicit brand overrides. Product UI shots and release data are generated from the source checkout, so their authored brands and metadata are preserved. Keep tutorial screenshots in the brand the tutorial commands select.

| Output | From | In git |
|---|---|---|
| `src/data/*.json` | `data.ts` | committed: small, and its diffs show what changed on `main` |
| `src/assets/shots/**` (WebP, 1280 px wide) and `shots.json` | `shots.ts`, `ui-shots.ts` | ignored |
| `public/decks/<deck>/` | `decks.ts` | ignored |

A fresh clone has the data but no stills, so the build fails until you sync. Staging folders sit at the site root (`.src-data.sync-<pid>` and so on, ignored) and are renamed into place at the end. When the second rename fails, the old folder is renamed back; a sync that was killed between the renames leaves `.<target>.old-<pid>`, and the next sync renames it back when the target is missing and deletes every other leftover (of a process that is no longer running).

Before the shots are installed, the UI shots are checked against the names the pages use: every `<UiShot name>` the MDX renders in `src/content/docs`, the component demo included (read with `src/components/deck/mdx-source.ts`; a `<UiShot>` inside JavaScript fails the shots part before any script runs). A run of `ui-shots.ts` that lacks one, or fails, counts as failed: the new slide stills are installed with the previous sync's UI shots when those have every needed name, else `src/assets/shots` is left as it was, and either way the sync exits 1 and names the missing shots. With `DECKSTER_SHOTS_STRICT=1` the sync passes `--strict`, so the script itself fails on any skipped shot, including one no page uses.

CI (`.github/workflows/pages.yml`) checks out deckster at `DECKSTER_REF` into `.deckster-main/`. It is `v0.8.0`, the tag of the documented release: the pages describe the release, so CI compares the committed `src/data` with it, and a later change on `main` does not fail this branch. When the pages move to a new release, change `DECKSTER_REF` to its tag, sync `--data` against it and commit both with the pages they affect. Deploys still sync the stills and decks from `main` (see the top of this section). CI regenerates `src/data` and **fails when it differs from the committed files** (`meta.json`'s commit aside), then syncs the stills and decks before checking and building. For the stills, CI installs Electron's binary (`pnpm --filter @deckster/shell exec install-electron`) with Xvfb and the GTK, NSS, GBM and ALSA libraries, builds the LibreOffice image for `export-verify` (`pnpm --filter @deckster/export prepare:verify`), and runs the sync under `xvfb-run` with `DECKSTER_SHOTS_STRICT=1`.

**Coverage.** `npm run check:coverage` fails when a layout, component, chart, diagram component or CLI command in `src/data` has no `<LayoutReference name>`, `<PropsTable of>` or `<CliCommand name>` in `src/content/docs`. It also fails when a layout has no page of its own, `src/content/docs/reference/layouts/<name>.mdx` rendering `<LayoutReference name="<name>" />`, or when a page in that folder other than `index.mdx` names no layout. The pages are parsed as MDX with the parser Astro compiles them with (`satteri`, through `src/components/deck/mdx-source.ts`), so only tags the page renders count: not the demo page, and not a tag in a code span, a fenced block or an MDX comment. A name written as a string-literal expression (`of={"BarChart"}`) counts; any other expression is reported, and so is a component inside JavaScript (see "Deck components" above). CI runs it before the build.

**Briefs.** The pages were written from `{/* BRIEF … */}` comments, which review has removed. Comments stay out of the HTML, `index.md` and `llms*.txt`, but `/<page>/index.mdx` serves the authored source, so a brief there would be published. `npm run check:briefs` fails while any page has one, and CI runs it before the build: keep a brief for a new page in your notes, not in the file.

**What the data does not cover.** `PropsTable` renders catalog entries only; the chart `types` are in `ChartTypes`, the diagram node kinds, states, edge options and cards guide in `DiagramKinds`. The three JSON Schemas (`slideFrontmatter` in `layouts.json`, `brand-schema.json`, `deck-config.json`) carry types, allowed values, number ranges, lengths and which fields are required, and nothing else: no descriptions, no defaults, and no name or duration patterns (Effect writes a `pattern` only for regexes with the `u` flag, and the engine's kebab-case and duration regexes have none), so `deck-config.json` shows `brand`, the `slides` items and `duration` as plain strings. What each brand and deck-config field does and its default are written by hand in `schema-descriptions.ts`, from the code at `4e0b186` (v0.3.0), and for the diagram look and cards (`diagram.edges`, `groups`, `labels`, `kinds`, `cards`, `color.surfaces.<name>.diagram.cards`, new in 0.4.0) from `6c27269`; the rest was checked unchanged at the 0.4.0 release (tag `v0.4.0`, commit `50e5d19`, the same tree as `c018637`) and again at the 0.5.0 release (tag `v0.5.0`, commit `7dc64ea`: `git diff v0.4.0 7dc64ea` in the deckster repository touches no brand or deck-config schema, only the slide frontmatter) and the 0.6.0 release (tag `v0.6.0`, commit `5ee4926`, whose `packages/` tree is the same as `67418e3`'s: `git diff v0.5.0 v0.6.0 -- packages/brand/src/schema packages/engine/src/config` only adds `layout-schema.ts`, the schema of `layouts.ts`, which no JSON in `src/data` carries; `brand-schema.json`, `deck-config.json` and `slideFrontmatter` are byte for byte the same as at 0.5.0): one line each, plain text with `code` spans. When the schema changes, update the overlay with it. The slide frontmatter has no overlay; write its formats in prose. `CliCommand`'s help is what the npm CLI prints (deckster's `scripts/docs/data.ts` packs the CLI and reads the help from that copy; for 0.3.0 this was checked against `deck <cmd> --help` from npm for all 19 commands, and the 0.4.0 data was read from the CLI packed at the release commit before it was on npm, and the outputs on the pages were re-run with `@deckster/cli@0.4.0` from npm; the 0.5.0 data was read from the CLI packed at the release commit `7dc64ea`, and the outputs of the hidden-slides sections were run with that CLI and re-checked with `@deckster/cli@0.5.0` from npm: the export summary line, the all-hidden errors, `deckster --version`, `deckster types` and the global-install warnings of the quickstart came out the same; the 0.6.0 data was read from the CLI packed at `67418e3` before 0.6.0 was on npm, and the outputs of the 0.6.0 sections were run with the tarball `pnpm --filter @deckster/cli pack` makes at that commit, installed with `npm install` into a folder outside `/tmp`, whose own `node_modules` would otherwise resolve a brand's fonts; after the release, a data sync at the tag produced the same `src/data` apart from `meta.json`'s commit, and the outputs that name a version, tag or commit, the `deckster brand add` examples, the `git clone --branch v0.6.0` copies (hello, showcase, lookbook, `default` as `acme`), the quickstart and first-deck commands and the twenty new layout pages' `deckster lint` blocks were run again with `@deckster/cli@0.6.0` from npm and came out the same, apart from the commit `deckster brand add` prints); `dev` and `present` still end with "See docs/agent.md" and `present` with "See docs/present.md", because the released CLI prints them too, and those files are in the repository, not in the npm package.

**Diagram cards (new in 0.4.0).** A brand's diagram look and cards are documented on `/brands/diagram-look-and-cards/` (what a brand writes, how cards inherit, a worked `acme` example, the checks), picking a card on a slide on `/data-and-diagrams/flow-diagrams/#pick-a-card` (the order, the standard names, `diagram-card-missing`), the other forms in the "Cards" section of `/data-and-diagrams/sequence-timeline-layers-cycle-tree/`, the check errors under "Diagram cards" on `/brands/check-a-brand/`, and the PowerPoint limits on `/export-and-publish/powerpoint/`. Pages that describe the feature say it needs 0.4.0 (`<Aside type="note" title="New in v0.4.0">` on the brand page). The command output on those pages was run with the CLI packed at the release commit (`packages/cli/dist/deck.js`, which the data sync builds), in a scratch workspace with the published brands copied in, and checked again with `@deckster/cli@0.4.0` from npm. `<BrandGrid slide="lint-path" />` shows each brand's diagram look with the cards its kinds map to and no `card=` on a node. A grid of the cards themselves in each brand needs `diagrams-demo` `card-reference` added to `BRAND_GRID_SLIDES` in `scripts/docs/shots.manifest.ts` on `main` (`shots.ts` would then write `brands/<brand>/card-reference.png`) and, on this branch, `BrandGrid` and its Markdown twin taught to name the deck from `shots.json` instead of assuming `showcase` (its title lookup, alt text and caption do).

**Hidden slides (new in 0.5.0).** `hidden: true` in a slide's frontmatter is documented on `/write-slides/hidden-slides/` (how to hide a slide, the two numbering rules, hiding is not removing, the all-hidden build error), with short "New in 0.5.0" sections on `/present/presenter-tools-and-shortcuts/` ("Backup slides", the pacing bullet), `/export-and-publish/pdf/` and `/export-and-publish/powerpoint/` (`--include-hidden`, `--slides`, native hidden slides), `/export-and-publish/build-and-host/`, `/review/screenshots/` (`hidden` in `--json`), `/review/visual-diff/`, `/review/lint/` (`time-budget`, `layout-repetition`, `few-builds`), and one-line changes on the slide frontmatter, deck API (`window.__deck.slides[].hidden`, the hash), keyboard shortcuts, lint rules, brand schema (`chrome`), transitions, speaker notes and agent tools pages. The command output on those pages was run with the CLI packed at the release commit (`packages/cli/dist/deck.js`), in a scratch workspace, on a `launch-review` deck whose fourth slide `pricing-backup` has `hidden: true`. No published deck has a hidden slide, so no still shows one; the presenter screenshots are of decks without hidden slides. The presenter window, sidebar and overview behaviour (badge, "· hidden", next-slide preview) is written from the code (`packages/presenter`), not from a screenshot.

**Twenty layouts (new in 0.6.0).** The 0.6.0 catalog listed 52 layouts, the 32 of 0.5.0 and 20 added in 0.6.0 by the pull request "feat(kit): add twenty layouts": `recap`, `sources`, `definition`, `features`, `do-dont`, `faq`, `quiz`, `exercise`, `pricing`, `quadrants`, `risks`, `market`, `dashboard`, `conversation`, `before-after`, `voices`, `persona`, `schedule`, `status` and `actions`. Each has its own page under `reference/layouts/` that opens with `<Aside type="note" title="New in v0.6.0">` (`@deckster/cli` 0.5.0 reports `There is no "<name>" layout.`), and the layouts index, the lookbook page (180 slides and 364 steps, 42 slides in the new layouts) and the `reveal` list on `/write-slides/builds/` name them. Their command output was run before the release, with the CLI packed from the kit's branch at `ff2e9c9` through a wrapper named `deckster`; at `67418e3` the layout contracts in `layouts.json` are the same apart from the `fallback` and `label` keys every layout gained and three catalog examples (`section`, `columns`, `sources`) whose numbers in `number`, `note` and `year` are now quoted. After the release, the `deckster lint` blocks of fourteen of the pages (`recap`, `sources`, `definition`, `features`, `faq`, `quiz`, `pricing`, `risks`, `market`, `conversation`, `status`, `actions`, `schedule`, `exercise`) were run again with `@deckster/cli@0.6.0` from npm on slides written to reproduce them, and each printed the page's block exactly. The blocks of the other six (`do-dont`, `quadrants`, `dashboard`, `before-after`, `voices` and `persona`) were run the same way later, and each printed the page's block exactly. The lint messages those six pages quote under "Common mistakes" match too, apart from two deliberate differences: `dashboard` puts `<BarChart>` in a code span, which MDX needs, and `before-after` stops the `media-missing` message before the machine's path; `deckster lint lookbook` prints the same line as on the lookbook page. Thirteen of the 32 older layout pages (`stats`, `equation`, `chart`, `quote`, `gallery`, `cards`, `columns`, `steps`, `comparison`, `matrix`, `timeline`, `table` and `bio`) render reference descriptions from `layouts.json` that point at the new layouts. The same descriptions dropped three uses 0.5.0 gave (`gallery`: before and after photos; `comparison`: before and after; `cards`: features), which now belong to `before-after` and `features`; the opening paragraphs of those three pages (and the `cards` page's `description`) no longer offer them. Each of the thirteen pages links the new layouts its description names, under "When to use it" and "Related layouts" (a script over the `description` of every layout in `layouts.json` finds them; `content`'s "definition", `screen`'s "dashboard" and `matrix`'s `quadrants:` field are ordinary words there, not layout names).

**Brand layouts and `deckster brand add` (new in 0.6.0).** A brand's own slide layouts (`brands/<name>/layouts.ts`) are documented on `/brands/brand-layouts/` (fieldnote's four, `deckster layouts --brand ... --summary`, a slide on one, the fallback and `brand-layout-fallback`, the `layouts.ts` fields, the checks, PowerPoint, the importer), with one-line changes on `/brands/check-a-brand/` (a sixth stage), `/brands/import-a-brand/`, `/export-and-publish/powerpoint/`, `/get-started/workspace-layout/`, `/concepts/layouts-and-slots/` and `/reference/lint-rules/`. No JSON in `src/data` carries the `layouts.ts` schema, so its field table is written by hand from `packages/brand/src/schema/layout-schema.ts` and the defaults in `packages/brand/src/resolve/resolve-layouts.ts` at `67418e3`; `brands.json` has each brand's resolved `layouts`, which no component renders yet. The brand layouts guide embeds the published `brand-layouts` deck at its `part-one` slide. The command examples use a scratch `launch-review` deck on `fieldnote`. `deckster brand add` is on `/brands/use-a-brand/` ("Add a published brand" now uses it, and "Add a brand from another repository" has the source forms, what it copies and refuses, `--force` and `--json`); its help is in `cli.json` under `brand`, so the coverage check counts it with `deckster brand`. Its outputs were run again with `@deckster/cli@0.6.0` from npm and the source `#v0.6.0`, which prints `at 5ee4926`, the tag's commit. At `v0.6.0`, `ui-shots.ts` builds `build-gallery` from the allowlisted decks only (`490e558`), so a strict sync at the tag makes every still, UI shot and deck.

**Explanatory diagrams.** `src/assets/diagrams/*.svg` were drawn with the `crisp-diagrams` skill in the site palette (light only, vermilion on one box per diagram, never on text) and are committed. They are not generated: when the code they describe changes, redraw them. Each SVG's `<title>` is its takeaway; the facts it draws were read at `4e0b186`. Write the `alt` yourself, a full sentence of what it shows. As `<img>`, their text falls back to the system UI font.

**Staged shots.** `diff-report` is staged by deckster's `scripts/docs/ui-shots.ts`: the "before" title still is the same slide rendered in `nocturne`, "moved" comes from two renamed baseline pictures, and the "Compared with" line was rewritten to `.deck/baseline/hello` (the real report prints the absolute base path). Caption it as what a report looks like, never as a real change. The UI-shot dev servers run with `DECK_AUTHOR=Reviewer`, so comments in `comments` and `comment-list` are signed "Reviewer".

`agent-turn` and `agent-panel` both run the hidden `--agent fake` provider (on a scratch copy of `hello`, and on showcase), so neither needs an agent CLI on the machine. The script relabels "Fake agent" to "Claude" in the header, the empty-state heading and the placeholder (`AGENT_LABELS` in `ui-shots.ts`), which is what 0.3.0 and 0.4.0 show for `--agent claude` (`providerLabel` in `packages/agent/src/runtime/status.tsx`; the model button reads "default model" because no model was chosen). `agent-turn` is a replayed turn: its steps, answer, time, tokens and cost are recorded figures, not a live run, and the time varies by a tenth of a second between syncs. It is on `/ai-agents/agent-panel/` under "After a turn", captioned as a recorded example turn; never quote its figures as what a turn takes or costs.

**The lint pair.** `lint-before` and `lint-after` are taken by `ui-shots.ts` from a scratch deck (`lint-demo`, slide `launch-plan`) that is not on the allowlist, like the tutorial stills. `/review/lint/` prints their lint output from a separate 0.3.0 run of the same two slide files, named `launch-risks` and `plan` so they don't clash with the page's `launch-review` examples. Don't paste the `lint-*.txt` files the script writes: they come from the repository CLI, whose fix hints say `pnpm deckster layouts`. When the script's slides change, run them again with the documented release and update the page.

**Skipped shots fail the sync.** `ui-shots.ts` skips a shot whose prerequisite is missing (no Electron binary or window server for `present-*`, no Docker for `export-verify`; since `v0.6.0`, `build-gallery` copies the allowlisted decks into a scratch workspace and is no longer skipped for a deck outside the allowlist) and, without `--strict`, still exits 0. The sync then finds the name missing from what the pages use and keeps the previous UI shots, or installs none, and exits 1 (see "Sync" above). Read the script's skipped list in the sync log. A shot no page uses (`tools`, `agent-turn`) is not checked unless the sync runs strict.

## Nimbus

Astro-based docs. The `nimbus-docs` package handles content schemas, sidebar/TOC, MDX→markdown, build hooks, and the `nimbus-docs` CLI. Install dependencies first, then run it as `npx @cloudflare/nimbus-docs <command>`: npx uses the project's installed version. Before an install, npx fetches the latest release instead, which may differ from the site's version and give different results. The scoped name keeps npx from fetching the unrelated `nimbus-docs` package. Everything in `src/` is yours to edit.

## File layout

```
astro.config.ts              # imports nimbus + defineNimbusConfig
nimbus.json                  # records the last reviewed Nimbus package version
src/
├── components.ts            # MDX globals — components every .mdx can use without an import
├── components/              # AgentDirective, Header, Logo (drawn from logo.ts), Render + ui/<slug>/
├── content/
│   ├── docs/*.mdx
│   └── partials/*.mdx       # referenced via <Render file="..." />
├── content.config.ts        # registers docsCollection() + partialsCollection()
├── data/                    # generated JSON from main (npm run sync); never edit by hand
├── layouts/                 # BaseLayout (NimbusHead), DocsLayout (sidebar/TOC/breadcrumbs)
├── lib/cn.ts                # Tailwind className merger
├── pages/
│   ├── [...slug].astro
│   ├── [...slug]/index.md.ts   # Markdown version of every page
│   ├── [...slug]/index.mdx.ts  # authored source of every page
│   ├── [...section]/llms.txt.ts  # per-section llms.txt, nested sections included
│   ├── 404.astro
│   ├── llms.txt.ts
│   ├── llms-full.txt.ts
│   ├── og.png.ts                # site-level OG card
│   ├── og/
│   │   ├── _card.ts             # the card's look, shared by both routes (underscore = not a route)
│   │   ├── _fonts/              # the card's fonts
│   │   └── [...slug].ts         # per-page OG cards
│   └── robots.txt.ts
└── styles/                  # globals.css, prose.css
```

Cloudflare deploys also have `wrangler.jsonc` at the project root.

## Writing docs

Frontmatter validates against the schema from `docsCollection()` (`@cloudflare/nimbus-docs/content`). Required: `title`.

```mdx
---
title: My page
description: One-line summary.
---

Content here. The page H1 comes from `title` — don't repeat it in the body.

## Section heading
```

Rules:

- **Components are PascalCase.** Register one in `src/components.ts` to use it in every `.mdx` without an import, or import it in the file that uses it. A pre-build validator catches unresolved names with a "did you mean" hint.
- **Partials use `<Render file="..." />`.** Don't import `.mdx` directly. Shared content lives in `src/content/partials/<slug>.mdx`.
- **Icons use Nimbus's `Icon` + Phosphor.** `<Icon name="ph:<glyph>" class="w-4 h-4" />` from `@cloudflare/nimbus-docs/components/Icon.astro`. Glyphs: [phosphoricons.com](https://phosphoricons.com).
- **Don't remove `<AgentDirective />` from `BaseLayout.astro`.** It points agents at `/llms.txt`.

## Adding things

| Goal | Action |
|---|---|
| New doc page | Create `src/content/docs/<slug>.mdx`. Sidebar picks it up. |
| New partial | Create `src/content/partials/<slug>.mdx`. Use via `<Render file="<slug>" />`. |
| UI from registry | `npx @cloudflare/nimbus-docs add <slug>`. Register in `src/components.ts` if used in MDX. |
| Feature recipe | `npx @cloudflare/nimbus-docs add <feature-slug> --print`. Prints the recipe for you to follow; it changes no files itself. |
| Check it builds | `npx @cloudflare/nimbus-docs check` — build-free preflight (env + structure + authoring + types). `--json` for an agent loop, `--fix` to repair what's safe. |
| Custom page route | Add a file under `src/pages/`. |
| Custom OG style | Edit `src/pages/og/_card.ts`. The card draws the logo from `src/components/logo.ts`, the same drawing as the header. |
| Check for updates | `npx @cloudflare/nimbus-docs outdated` — starter files behind their tag + registry components behind. |
| Upgrade Nimbus | Update the package, then run `npx @cloudflare/nimbus-docs migrate --dry-run --diff`. Review every change and required manual step before applying. |
| Upgrade a starter file | `npx @cloudflare/nimbus-docs diff <file>` to review, `diff --apply <file>` to pull a clean upstream change. |
| Upgrade a registry component | `npx @cloudflare/nimbus-docs add <slug> --overwrite`, then review with `git diff`. Components you edited are kept and listed. To compare one with upstream, commit, run the `--overwrite --yes` command it prints, and read `git diff`; unless the user decided to discard their edits, undo the whole run with `git checkout -- . && git clean -fd`, since it also rewrote `nimbus.json`. |

Sätteri is Nimbus's default Markdown and MDX processor. Extend it using `markdown.mdastPlugins` for Markdown AST transformations or `markdown.hastPlugins` for HTML AST transformations.
If the site replaces Sätteri with another processor, set `admonitions: false` and keep that processor's existing callout implementation.

List installable items: `npx @cloudflare/nimbus-docs list`.

## Sidebar

The sidebar mirrors `src/content/docs/`. A folder becomes a group, and its `index.mdx` is the group's landing page; set `sidebar.group.label` there to rename the group. Within a group, `sidebar.order` sorts entries (lowest first, otherwise alphabetical), `sidebar.label` shortens a page's rail title, and `sidebar.hidden: true` builds a page without listing it.

**Layouts.** Each layout has its own page in `src/content/docs/reference/layouts/`, and `index.mdx` there is the visual index at `/reference/layouts/` (`sidebar.group.label: "Layouts"`, order 3 in Reference). Frontmatter can't collapse a folder group, so `astro.config.ts` sets `sidebar.defaultCollapsed: true` and `collapsed: false` on every top-level group: only folders nested inside a group start closed, and a folder opens on its own pages. A new top-level group needs `collapsed: false` too. Inside the folder the group header is a disclosure and the index is listed as "Overview". The layout pages' `sidebar.order` follows the "Layouts by purpose" table on the index; a new layout needs a page, a row in that table and an order.

To add an external link or fix the top-level order, set `sidebar.items` in `defineNimbusConfig` in `astro.config.ts`. Items you list replace the generated top level, and a listed item's `label` wins over the folder's `sidebar.group.label`:

```ts
sidebar: {
  items: [
    { label: "Guides", autogenerate: { directory: "guides" } },
    { label: "GitHub", link: "https://github.com/you/repo" },
  ],
},
```

The header's section tabs come from the same list: each top-level item that autogenerates from another collection (`{ label: "API", autogenerate: { collection: "api", prefix: "/reference" } }`) becomes a tab, and the tabs show once there are two. With one, an API reference served away from `/` makes the tabs: Docs and API reference. Folders of `src/content/docs/` and external links stay in the sidebar. For any other header link, edit `src/components/Header.astro`.

Everything else: <https://nimbus-docs.com/navigation/sidebar/>.

## API reference

This site has no OpenAPI reference: the scaffold it was copied from had one, and its collection, route, `api` config entry and `api-*` registry components were removed. The deckster reference pages will be MDX built on generated JSON in `src/data/`; for now they are stubs. To add an OpenAPI reference later, follow <https://nimbus-docs.com/api-reference/>.

## Agent interfaces

Read the release-matched guide at [`node_modules/@cloudflare/nimbus-docs/dist/docs-for-agents.md`](node_modules/@cloudflare/nimbus-docs/dist/docs-for-agents.md), especially for preview packages. Nimbus publishes discovery automatically; add project-owned Skills under `skills/<name>/SKILL.md`. Keep `<WebMCP />` in `BaseLayout.astro` for browser-agent search with default Pagefind, and render `<ConnectMcp />` in `DocsLayout.astro` only when `capabilities.mcpUrl` is set (`agents: { mcp: true }`; needs a server adapter and `@modelcontextprotocol/server`). Markdown negotiation applies to request-rendered pages; static hosting and response headers follow the deployment target's setup.

## Upgrading Nimbus

Keep `nimbus.json` committed. Its `lastReviewedNimbusVersion` is the baseline Nimbus uses to select the versioned reviews crossed by a package upgrade; state-detected migrations come from the current project files. It is not a package pin and should not be edited by hand.

1. Update `@cloudflare/nimbus-docs` with the project's package manager.
2. Preview the complete plan with `npx @cloudflare/nimbus-docs migrate --dry-run --diff`. If no baseline exists yet, add `--from <previous-version>`.
3. Review every versioned entry and resolve each blocked/manual item.
4. Apply safe edits only with explicit consent: `npx @cloudflare/nimbus-docs migrate --yes`. Review the resulting diff, then rerun the preview.
5. When no migration remains, run `npx @cloudflare/nimbus-docs migrate --yes` again to record the completed review in `nimbus.json`.
6. Pull in starter fixes: `npx @cloudflare/nimbus-docs outdated` lists starter files that changed upstream. For each one, review it with `npx @cloudflare/nimbus-docs diff <file>`, and take a clean update with `diff --apply <file>`. Merge files you've edited by hand. `migrate` doesn't cover these.
7. Run the project's typecheck and production build, then run `npx @cloudflare/nimbus-docs check` again for post-build coverage.

Except for task-printing mode (`--print`), `migrate` exits nonzero while work or review remains; that is a pending-upgrade signal, not necessarily a command failure. Never skip versions by changing `nimbus.json` directly.

## Audit this site

First set `site` in `astro.config.ts` to the production URL; a fresh site still has the placeholder. Ask the user for the URL if you don't know it, and never make one up.

Then run `npx @cloudflare/nimbus-docs check --json`. It runs the environment, structural, authoring, and type checks build-free — config validity, `site` placeholder, route collisions, MDX component resolution, the lint rules, and a `tsc` type-check — and returns three top-level signals plus per-scope detail:

- **`status`** (`passed` | `failed` | `partial`) and **`readiness`** (`buildable` | `blocked` | `unknown`) are the primary signals. `status` is the whole-run verdict; `readiness` answers "does env + structure say it builds?". `ok` (=== zero errors) is kept for back-compat only.
- **`findings[{scope,code,severity,file,line,message,fixable,fix}]`** are problems we evaluated. Apply each `fix` (or `check --fix`).
- **`scopes[].notes[{code,reason,requiresBuild?,requiresInput?}]`** are checks we *couldn't* evaluate yet (e.g. types before a build). A note is never a finding and never carries a `fix` — you resolve it by making the missing thing exist (usually a build), not by `--fix`. `summary.notes` counts them.

Loop until `status !== "failed"` and no finding has a `fix` without `fix.requiresInput` — `summary.fixable` also counts fixes that need input (a placeholder `site`), which `--fix` can't apply for you. An error with no `fix` (such as `nimbus/dependencies-missing`) ends the loop too: do what its message says (install dependencies), then run `check` again, or stop and report it. A `partial` run with nothing left to fix is a **stop** (optionally build, then re-check), not a `--fix` retry. Exit is `1` only when `status` is `"failed"`. For full coverage (types + link-checking) run a build first, then `check` again. With server output, `check` stays `partial` with the note `nimbus/request-rendering-build-required` even after a build: it doesn't verify request-rendered pages, so a passing production build is the gate.

Then walk the categories below for what `check` doesn't cover yet — route-file existence, registry hygiene, the AI surface, post-build search, and Cloudflare config. Emit findings as:

```
- [error|warn|info] FILE:LINE — what + why + fix.
```

End with `Summary: N errors, N warnings.`

- **Config** — `astro.config.ts` calls `nimbus(defineNimbusConfig({ ... }))`; `site` is set; `editPattern` (if set) contains `{path}`; `output:` matches the deploy target.
- **Content** — `content.config.ts` registers `docsCollection()` (and `partialsCollection()` if used); every `.mdx` is inside a registered collection; frontmatter validates.
- **Sidebar** — every sidebar ref resolves to a content entry; no orphans; no slug collisions.
- **MDX** — every PascalCase component in `*.mdx` is registered or imported; every `<Render file=...>` resolves; code-fence languages are valid.
- **Routes** — `llms.txt.ts`, `robots.txt.ts`, `[...slug]/index.md.ts`, `og.png.ts`, `og/[...slug].ts` all exist.
- **Registry hygiene** — every `src/components/ui/<slug>/` is either MDX-registered or imported in `src/`; transitive deps (`lib/cn.ts`, etc.) exist.
- **AI surface** — `<AgentDirective />` renders in `BaseLayout.astro`; doc `<head>` has `<link rel="alternate" type="text/markdown" ...>`.
- **Search** — `data-pagefind-body` is on the docs main wrapper; after a production build, `dist/pagefind/` exists with ≥1 indexed page.
- **Cloudflare** (if applicable) — `wrangler.jsonc` has `name` and `compatibility_date`. Static output: `assets.directory = "./dist"` and `assets.not_found_handling = "404-page"`. Server output (`@astrojs/cloudflare`): no `assets.directory` or `main`; the adapter writes the deploy config to `dist/server/wrangler.json` at build time, so check that file after a build.

## Don't

- Hand-add components under `src/components/ui/` that exists in the Nimbus registry — use `npx @cloudflare/nimbus-docs add <slug>` so deps resolve.
- Import `.mdx` files directly — use `<Render file="..." />`.
- Remove `<AgentDirective />` unless asked.

## Project home

[nimbus-docs.com](https://nimbus-docs.com)
