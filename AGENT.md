# This Nimbus docs site

> `CLAUDE.md` delegates here. Keep project instructions canonical in this file.

## deckster specifics (read first)

This is the documentation site for [deckster](https://github.com/sandrinodm/deckster), kept on the orphan branch `docs-site` of that repository. It is published at <https://sandrinodm.github.io/deckster/>, with the built decks under `/deckster/decks/`, by `main`'s `.github/workflows/deploy.yml`, run by hand: it checks out the tip of this branch, syncs the stills and decks from `main` (`npm run sync -- --shots --decks`; `src/data` is published as committed), exports the decks, builds the site and publishes it. `.github/workflows/pages.yml` on this branch only checks: it builds but publishes nothing, so a change here goes live on the next run of `deploy.yml`. Where this section and the Nimbus guide below disagree, this section wins.

- **The source of truth is the code on deckster's `main` branch**, not these pages and not `main`'s `README.md`, package READMEs or `docs/*.md`. Locally `main` is the worktree at `../2026-11-13-presentation`. Before you write or change a claim about a command, flag, default, prop, layout, frontmatter key, brand field, limit or error message, find it in the code (`git -C ../2026-11-13-presentation grep -n <name> main -- packages`) or run the command, and describe what the code does. If you can't confirm it, leave it out or ask. The documented release is **v0.3.0** (`@deckster/cli` 0.3.0; `src/data/meta.json` records the version and commit the data came from). Embed mode (`?embed`, what `<DeckEmbed>` loads) is newer than v0.3.0: it is on `main` but not in that release, so don't tell readers they can use it with 0.3.0.
- **Readers install the CLI from npm.** Write commands as `deck dev`, `deck lint hello`, never `pnpm deck ...` or `pnpm dev ...`. Only the pages about working from a clone of the repository use `pnpm`.
- **Links:** write internal links from the site root, without the base path and with a trailing slash: `[quickstart](/get-started/quickstart/)`, not `/deckster/get-started/quickstart/` or a relative `../` path. Nimbus adds `/deckster`. Link a built deck as `/decks/<name>/`, or one slide as `/decks/<name>/#/<slide>`; the decks are built into `public/decks/` by `npm run sync`, so when that folder is missing `nimbus/internal-link` skips `/decks/**` (see `astro.config.ts`) and you check those links by hand; a build after a sync, as in CI, checks them. Don't link a bare `/decks/`: there is no index page. Link source files at `https://github.com/sandrinodm/deckster/blob/main/<path>`.
- **Images** live in `src/assets/` and are imported with a path relative to the page file: `../../assets/deckster-hero.png` from `src/content/docs/index.mdx`, `../../../assets/x.png` from a page in a group folder (`src/content/docs/<group>/<page>.mdx`); `public/` is for files served as-is. Alt text is a full sentence saying what the image shows.
- **Generated files: never edit them by hand.** `src/data/` holds JSON generated from `main` (catalogs, CLI help, brands, slides; committed), `src/assets/shots/` holds generated slide stills and UI screenshots, and `public/decks/` holds built decks (neither committed). `npm run sync` makes all three; see "Deck components" below. Change the code or the generator on `main` instead.
- **Only published decks and brands appear on the site**, on any page, in an example or in a screenshot. They are the allowlist in deckster's `scripts/docs-allowlist.ts` (also in `src/data/meta.json`); anything else under `decks/` or `brands/` on `main` stays private. One exception: `src/assets/tutorial/` holds two committed stills of the `launch-review` deck the get-started pages build (its cover after `deck new`, and the `results` slide of [your first deck](/get-started/your-first-deck/)). They were taken with `deck shot` from `@deckster/cli` 0.3.0 in a scratch workspace from the exact source on those pages and converted to WebP 1280 px wide; when that source changes, take them again.
- **Base path:** the site is a GitHub Pages project page, so every URL is under `/deckster/`, and origin-root files (`/robots.txt`, `/.well-known/*`) aren't served from this site. That's why `agents.discovery` is `false`. Ignore the `wrangler.jsonc` and Cloudflare notes below.
- **Look:** light theme only, black, white and one vermilion (`--deck-*` in `src/styles/globals.css`). Vermilion is 3.3:1 on white: use it for marks, never for text.
- **Before you hand off:** `npx @cloudflare/nimbus-docs check`, `npm run build`, then `check` again (link checking needs the build). Preview the build with `npm run preview` at <http://localhost:4321/deckster/>.
- Commit to `docs-site`, never to `main`; the branches share no history.
- **Starter files merged by hand.** `nimbus.json` records the starter at `templates-v0.8.3`, but `Header.astro`, `toc.client.ts`, `BaseLayout.astro` and `DocsLayout.astro` were merged by hand up to `templates-v0.9.0` (Nimbus 0.20.0), and no command records a hand merge. So `outdated` keeps listing them as `hand-merge`, and `diff <file>` shows this site's edits mixed in with upstream's. For the next upgrade, merge in three ways against the upstream starter (`git show <tag>:template/<path>` in `github.com/cloudflare/nimbus`), from `templates-v0.9.0` to the new tag. `ThemeToggle.astro` shows as `deleted`, and that is intended: the site is light only. Leave it out. The local edits to keep: the brand header and logo, no theme script or toggle, `nb-app`/`nb-scroll-root`/`nb-brand-surface` with `src/lib/scroll-root.ts` (the TOC's bottom detection reads it), `codeBadges()`, and the per-page `socialImageAlt` passed to `NimbusHead`. The registry Switch is restyled to ink at the end of `globals.css`.

## Deck components

MDX globals for deckster content, in `src/components/deck/` and registered in `src/components.ts`. They read `src/data/*.json` and the stills in `src/assets/shots/` (through `import.meta.glob`, so Astro optimises the images; every synced still ships in `dist/_astro`, about 16 MB, whether a page uses it or not). A deck, slide, step, brand, layout, prop target, command or shot that doesn't exist **fails the build** with a message naming the component, the prop, the page and what exists instead; nothing renders an empty box. Pass props as literals (`step={0}`, not a variable): the Markdown twins and the coverage check read the MDX source.

| Component | Example | Shows |
|---|---|---|
| `DeckEmbed` | `<DeckEmbed deck="showcase" slide="lint-path" step={0} />` | A 16:9 poster of the slide; a click (or Enter/Space) swaps in the built deck in `?embed` mode at `/decks/<deck>/?embed#/<slide>/<step>`. One live deck per page: starting another returns the first to its poster. Without JavaScript the poster links to the deck. The poster always shows what the frame opens at: without `step`, the finished slide (the frame opens at the slide's last step); with `step`, that step's still, so `step` works only on the slides shot per step (`STEP_SLIDES`) and fails the build on any other. |
| `SlideShot` | `<SlideShot deck="lookbook" slide="statement-claim" alt="…" />` | A still with zoom. `alt` is required. `brand="nocturne"` only for the brand-grid slides (`showcase` `cover`, `review-rounds`, `lint-path`); `step={2}` only for slides shot per step. |
| `SlideExample` | `<SlideExample deck="hello" slide="steps" />` | Tabs: the live slide (a `DeckEmbed`) and its source file from `slides.json`, so the code shown is the code rendered. |
| `StepStrip` | `<StepStrip deck="showcase" slide="review-rounds" />` | Every step as a filmstrip that wraps (three to a row); a frame opens the deck at that step in a new tab. Only the slides in deckster's `scripts/docs-shots.manifest.ts` (`STEP_SLIDES`) have step stills: showcase `review-rounds`, `lint-path`, `agent-turn`, `no-styling`; data-stories `redesign-effect`; diagrams-demo `request-journey`; components `handler-evolves`, `middleware-order`, `rollout-checks`, `edge-latency`; hello `steps`; lookbook `motion-rise`. |
| `BrandGrid` | `<BrandGrid slide="cover" />` | One showcase slide in each published brand (`BRAND_GRID_SLIDES`: `cover`, `review-rounds`, `lint-path`). |
| `UiShot` | `<UiShot name="presenter" alt="…" />` | A product screenshot at 1440×900: `sidebar`, `overview`, `help`, `presenter`, `comments`, `comment-list`, `tools`, `agent-panel` (all `deck dev` on the showcase deck), and `diff-report` (the report page of `deck diff hello`, staged: see below). `tools-detail` is the tool buttons up close: a 560×200 crop of the bottom-left corner of `tools` at 2x (1120×400). `alt` is required. |
| `LayoutReference` | `<LayoutReference name="statement" />` | Description, frontmatter fields, slots, budgets, variants and example of a layout, with a still of a slide that uses it (first in `lookbook`, else `layouts`, else any deck). Write the `##` heading yourself; the block has `id="layout-<name>"`. |
| `LayoutIndex` | `<LayoutIndex />` | Every layout as a still, linking to `/reference/layouts/#layout-<name>`. |
| `PropsTable` | `<PropsTable of="BarChart" />`, `<PropsTable shared="charts" />` | `of`: use when, avoid, limits, a still of the first published slide that uses the component (lookbook first; none for `Notes` and `Step`), its own props, one line naming the shared props it also takes, and the example, one prop per line, of a component, chart or diagram component (`components.json`, `charts.json`, `diagrams.json`). Has `id="props-<name>"`. `shared` (`charts` or `diagrams`): the catalog's shared props in full, once per page; the entries' "Also takes" lines link to its `id="props-shared"`. |
| `CatalogIndex` | `<CatalogIndex kind="charts" />` | Everything in one catalog (`components`, `charts` or `diagrams`) with its use-when line, linking to `/reference/<kind>/#props-<name>`. |
| `CliCommand` | `<CliCommand name="lint" />` | A command's summary, usage forms and full `--help` from `cli.json`. Has `id="cli-<name>"`. |
| `IconGrid` | `<IconGrid />` | The icon names from `icons.json`, filterable; selecting a name copies it. Names only: each brand draws them from its own set. |
| `BrandTokens` | `<BrandTokens name="default" />` | A brand's palette, surfaces and type scale from `brands.json`. |
| `FrontmatterReference` | `<FrontmatterReference />` | The keys every slide's frontmatter takes, from `layouts.json` `slideFrontmatter` (a JSON Schema): each key's type, allowed values and limits, and the fields of `background`'s object form. No props. Has `id="slide-frontmatter"`. |
| `SchemaReference` | `<SchemaReference of="brand" section="color" />` | Every field of `brand.ts` (`of="brand"`, `brand-schema.json`) or `deck.config.ts` (`of="deck-config"`, `deck-config.json`) as tables grouped by the first two path segments (each row shows its path from there; the forms of a union, `[type=…]`, are folded): path, type with its limits, a `required` tag, and a description with the default from `src/components/deck/schema-descriptions.ts` (a hand-written overlay keyed by row path; a row without an entry shows nothing, and a key that names no row fails the build). `section` limits it to one top-level field (the brand has about 300 rows); an unknown one fails the build. Has `id="schema-<of>"` or `id="schema-<of>-<section>"`. |
| `ChartTypes` | `<ChartTypes of="Highlight" />` | The object types chart props take, from `charts.json` `types`: `RowStat`, `ProgressItem`, `TableColumn`, `SeriesInput`, `FormatOptions`, `Highlight`, `RevealOption`, `Annotation.callout`, `Annotation.reference`, `Annotation.range`, `Annotation.bracket`. Without `of`, all eleven. Each has a `###` label and `id="type-<name>"`. |
| `DiagramKinds` | `<DiagramKinds part="kinds" />` | From `diagrams.json`: the node `kind`s (aliases, shape, icon, use when), the `State` values with the words that mean the same, and the `<Edge>` options with examples. `part` is `kinds`, `states` or `edges`; without it, all three, each with a `###` label and `id="diagram-<part>"`. |
| `Diagram` | `<Diagram name="build-pipeline" alt="…" />` | One of the explanatory SVGs in `src/assets/diagrams/` (`build-pipeline`, `step-model`, `brand-resolution`, `agent-turn`, `export-pipeline`, `review-loop`) as an `<img>`; the image zoom opens it at screen size, and the caption links the file. Below 640 px it keeps a 640 px width and scrolls sideways in its frame. `alt` is required. |

`src/content/docs/project/component-demo.mdx` (hidden from the sidebar) uses each once, so the build exercises them. `FrontmatterReference` and `SchemaReference` share `SchemaTable.astro` and the JSON Schema flattener in `format.ts` (also used by the Markdown twins); a schema keyword the flattener doesn't know (a future `pattern` is known, a `$ref` is not) fails the build rather than dropping a constraint.

**Markdown twins.** Nimbus builds each page's `index.md` and `llms-full.txt` from the MDX; a custom component it doesn't know is dropped. `markdown.componentMap` in `astro.config.ts` renders these components as Markdown instead (`src/components/deck/markdown.ts`): the reference components as tables and lists from the same JSON, stills as their alt text with a link to the slide, embeds as a link to the deck. Check them in `dist/<page>/index.md` after a build.

**Sync.** `npm run sync` refreshes the generated inputs from a deckster checkout: `DECKSTER_REPO`, else `../2026-11-13-presentation`, else `../deckster`, with its dependencies installed (`pnpm install`, plus Chromium for the stills). It runs that checkout's `scripts/docs-data.ts`, `docs-shots.ts`, `docs-ui-shots.ts` and `docs-decks.ts` into scratch folders and installs the results; `--data`, `--shots` or `--decks` runs one part. A part whose script fails is not installed and the sync exits 1.

| Output | From | In git |
|---|---|---|
| `src/data/*.json` | `docs-data.ts` | committed: small, and its diffs show what changed on `main` |
| `src/assets/shots/**` (WebP, 1280 px wide) and `shots.json` | `docs-shots.ts`, `docs-ui-shots.ts` | ignored |
| `public/decks/<deck>/` | `docs-decks.ts` | ignored |

A fresh clone has the data but no stills, so the build fails until you sync. Staging folders sit at the site root (`.src-data.sync-<pid>` and so on, ignored) and are renamed into place at the end. When only `docs-ui-shots.ts` fails, the new slide stills are installed with the previous sync's UI shots and the sync still exits 1.

CI (`.github/workflows/pages.yml`) checks out deckster at `DECKSTER_REF` into `.deckster-main/`. It stays `main`, not the `v0.3.0` tag (commit `4e0b186`): the docs scripts (`scripts/docs-*.ts`) and the embed mode `<DeckEmbed>` loads are newer than the tag, so a checkout of the tag can't sync the stills or build decks with `?embed`. CI regenerates `src/data` and **fails when it differs from the committed files** (`meta.json`'s commit aside), then syncs the stills and decks before checking and building. When main changes the data, sync `--data` and commit it together with the pages it affects. CI fails until deckster's `scripts/docs-*.ts` are committed on the checked-out ref.

**Coverage.** `npm run check:coverage` fails when a layout, component, chart, diagram component or CLI command in `src/data` has no `<LayoutReference name>`, `<PropsTable of>` or `<CliCommand name>` in `src/content/docs` (the demo page, fenced code and MDX comments don't count). CI runs it before the build.

**Briefs.** The pages were written from `{/* BRIEF … */}` comments, which review has removed. Comments stay out of the HTML, `index.md` and `llms*.txt`, but `/<page>/index.mdx` serves the authored source, so a brief there would be published. `npm run check:briefs` fails while any page has one, and CI runs it before the build: keep a brief for a new page in your notes, not in the file.

**What the data does not cover.** `PropsTable` renders catalog entries only; the chart `types` are in `ChartTypes`, the diagram node kinds, states and edge options in `DiagramKinds`. The three JSON Schemas (`slideFrontmatter` in `layouts.json`, `brand-schema.json`, `deck-config.json`) carry types, allowed values, number ranges, lengths and which fields are required, and nothing else: no descriptions, no defaults, and no name or duration patterns (Effect writes a `pattern` only for regexes with the `u` flag, and the engine's kebab-case and duration regexes have none), so `deck-config.json` shows `brand`, the `slides` items and `duration` as plain strings. What each brand and deck-config field does and its default are written by hand in `schema-descriptions.ts`, from the code at `4e0b186`: one line each, plain text with `code` spans. When the schema changes, update the overlay with it. The slide frontmatter has no overlay; write its formats in prose. `CliCommand`'s help is now what the npm CLI prints (deckster's `docs-data.ts` asks for the installed wording; checked against `deck <cmd> --help` from `@deckster/cli@0.3.0` for all 19 commands); `dev` and `present` still end with "See docs/agent.md" and `present` with "See docs/present.md", because 0.3.0 prints them too, and those files are in the repository, not in the npm package.

**Explanatory diagrams.** `src/assets/diagrams/*.svg` were drawn with the `crisp-diagrams` skill in the site palette (light only, vermilion on one box per diagram, never on text) and are committed. They are not generated: when the code they describe changes, redraw them. Each SVG's `<title>` is its takeaway; the facts it draws were read at `4e0b186`. Write the `alt` yourself, a full sentence of what it shows. As `<img>`, their text falls back to the system UI font.

**Staged shots.** `diff-report` is staged by deckster's `docs-ui-shots.ts`: the "before" title still is the same slide rendered in `nocturne`, "moved" comes from two renamed baseline pictures, and the "Compared with" line was rewritten to `.deck/baseline/hello` (the real report prints the absolute base path). Caption it as what a report looks like, never as a real change. The UI-shot dev servers run with `DECK_AUTHOR=Reviewer`, so comments in `comments` and `comment-list` are signed "Reviewer".

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
