<p align="center">
  <img src="https://raw.githubusercontent.com/sandrinodm/deckster/main/assets/brand/icon-192.png" alt="deckster logo" width="84" height="84" />
</p>

<h1 align="center">@deckster/cli</h1>

<p align="center">
  The <code>deck</code> CLI for <strong>deckster</strong> — code-first MDX/TSX slides with typed layouts, brands, visual linting, PDF/PPTX export, and an Electron presenter.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@deckster/cli"><img src="https://img.shields.io/npm/v/@deckster/cli.svg" alt="npm version" /></a>
  <a href="https://github.com/sandrinodm/deckster/actions/workflows/ci.yml"><img src="https://github.com/sandrinodm/deckster/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/sandrinodm/deckster/blob/main/package.json"><img src="https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg" alt="Node.js >= 26" /></a>
  <a href="https://github.com/sandrinodm/deckster/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

<p align="center">
  <a href="https://sandrinodm.github.io/deckster/"><strong>Documentation</strong></a> ·
  <a href="https://sandrinodm.github.io/deckster/get-started/quickstart/">Quickstart</a> ·
  <a href="https://sandrinodm.github.io/deckster/reference/cli/">CLI reference</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/sandrinodm/deckster/main/assets/brand/hero.png" alt="deckster hero — a black card box printed deckster with slide cards" width="760" />
</p>

---

## Install

Requires **Node.js 26 or later**:

```sh
npm install --global @deckster/cli
```

(`pnpm add --global @deckster/cli` works too.)

## Quick start

```sh
mkdir talks && cd talks
deckster new launch-review --title "Launch review" --duration 20m
deckster new slide launch-review results --layout stats
deckster dev launch-review                    # hot-reload dev server (q or Ctrl+C to stop)
```

Check, screenshot, and export:

```sh
deckster lint launch-review                   # checks schema, overflow, contrast, budgets, notes
deckster shot launch-review results           # 1920x1080 PNG -> .deck/shots/launch-review/02-results.png
deckster export launch-review                 # PDF + editable PPTX -> .deck/exports/launch-review/
deckster types                                # optional: generate tsconfig.json for editor IntelliSense
```

A deck is just a plain folder (`decks/<name>/`) with `deck.config.ts` and `slides/*.mdx` (or `.tsx`) — no `package.json` or `node_modules` needed inside your talks folder.

## Highlights

- **MDX & TSX slides**: Write declarative slides with `<Step at={n}>` reveals and `<Notes>` speaker notes, or drop into TSX for interactive React demos.
- **Typed layouts & brands**: 52 built-in layouts and data-driven `brand.ts` themes (`--brand <name>`). Slides stay free of raw colors and pixel positioning.
- **Visual linting (`deckster lint`)**: Renders every step of every slide in headless Chromium to catch overflow, truncated text, contrast failures (including over photos), off-brand values, diagram problems (overlaps, density, a card the brand does not have), and pacing issues.
- **PDF & editable PPTX export**: Vector PDFs with bookmarks and embedded fonts, plus hybrid/native PowerPoint decks with masters, editable text, native charts/diagrams, notes, and step animations.
- **Visual diffing (`deckster diff`)**: Pixel-by-pixel slide comparison against a git ref or saved baseline, with an HTML report and PR summary.
- **Built for AI agents**: Every command supports `--json`, exposes typed catalogs (`layouts`, `charts`, `diagrams`, `components`, `icons`), and supports `--mcp` and `--agent claude|codex` in `deckster dev`.

## Commands

Run `deckster --help` for all commands, or `deckster <command> --help` for full flags.

| Command                                      | Description                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `deckster dev [deck]`                        | Serve a deck with hot reload (`--mcp`, `--agent claude\|codex`, `--host`)  |
| `deckster present [deck]`                    | Open in Electron with presenter notes, timer, and display selection        |
| `deckster build [deck]`                      | Build static site output to `decks/<deck>/dist` (`--all`, `--out <dir>`)   |
| `deckster preview [deck]`                    | Serve a built deck locally                                                 |
| `deckster new <deck>`                        | Scaffold a new deck (`deckster new slide ...`, `deckster new app ...`)     |
| `deckster lint <deck>`                       | Validate schema, layout budgets, contrast, and overflow in Chromium        |
| `deckster shot <deck> [slide]`               | Capture 1920x1080 PNGs, hidden slides too (`--steps`, `--scale <n>`)       |
| `deckster diff <deck>`                       | Compare rendered slides against a git ref or `--save-baseline`             |
| `deckster export <deck>`                     | Export `--pdf`, `--pptx`, and/or `--png` (`--include-hidden`, `--dry-run`) |
| `deckster brand [name]`                      | Inspect resolved brand tokens and diagram cards, or `deckster brand check` |
| `deckster brand add <source>`                | Copy a brand folder from a git repository into `brands/<name>`             |
| `deckster layouts \| icons \| charts \| ...` | Print typed catalogs (`diagrams`, `components`) for humans and agents      |
| `deckster layouts new \| check`              | Add a code layout to a brand or deck, or check and render its layouts      |
| `deckster layouts eject \| diff`             | Copy kit layouts into a brand or deck to change, and see kit changes since |
| `deckster comments <deck>`                   | List, add, resolve, reopen, and prune browser review comments              |
| `deckster types`                             | Write `tsconfig.json` and `.deck/env.d.ts` for editor type checking        |
| `deckster mcp [deck]`                        | Print Claude Code / Codex MCP config for a running `deckster dev --mcp`    |
| `deckster agent doctor`                      | Verify local `claude` / `codex` CLI availability and auth                  |

### Shared conventions

- **`--brand <name>`** overrides the deck's configured brand for `dev`, `present`, `shot`, `lint`, `diff`, and `export`.
- **`--json`** outputs structured JSON (`{ ok: false, error: { type, message } }` on failure).
- **Workspace discovery**: `deckster` uses the nearest parent directory containing `decks/` (or `DECK_ROOT`), and refuses to use `$HOME` or `/`.
- **Hidden slides**: a slide with `hidden: true` in its frontmatter stays in the deck, and a talk skips it. `deckster shot` and `deckster lint` cover it (`deckster shot --json` marks each file with `hidden`; `deckster lint` checks it like any slide, but `time-budget`, `few-builds` and `layout-repetition` count the slides the talk shows). `deckster export` leaves hidden slides out of the PDF, PNGs, and PPTX and says how many; `--include-hidden` puts them in (as native hidden slides in the PPTX), and a hidden slide named in `--slides`, or inside a range there, is exported (the summary then reports none left out): as an ordinary page in the PDF and a PNG, and still marked hidden in the PPTX. Slide numbers in `--slides`, file names, and the URL count every slide.
- **Brand layouts**: a brand may bring layouts of its own in `brands/<name>/layouts.ts`. `deckster layouts` lists them with the kit's, shows each one's `source` (`brand:<name>`) and `fallback` (the kit layout a deck on another brand renders it with) and, with `--json`, its `label` (the layout's name in the source template). With `--summary` the brand's layouts come first under their own heading. `--brand <name>` lists another brand's. `deckster new slide <deck> <id> --layout <name>` takes a brand layout, and `deckster brand check <name>` reports a layout's problems against `layouts.ts`. When a slide names a layout only another brand defines, the build renders the fallback and `deckster lint` reports `brand-layout-fallback` (a warning) for the slide.

  With the [brand import and layout changes](https://github.com/sandrinodm/deckster/pull/31),
  a live agent session uses its active brand override when its `new_slide` tool scaffolds a slide.
  A Git brand install also checks each SVG before replacing the installed brand. If an install
  succeeds with an artwork warning, render a specimen slide and compare the imported artwork with its source. If an SVG prevents installation, fix the source artwork and retry.

- **Code layouts**: a brand (`brands/<name>/layouts/<layout>/`) or a deck (`decks/<deck>/layouts/<layout>/`) may bring layouts written as code: a `contract.ts` and a `layout.tsx` per folder. The build, `dev`, `lint`, `shot`, `export` (the PPTX uses the contract's `pptx` mapping), `deckster layouts`, the agent's `catalog` tool and `deckster new slide <deck> <id> --layout <name>` all use them. A layout's `source` in `deckster layouts --json` (and in `--summary --json`) is one of `@deckster/kit` (or another package), `brand:<name>` (a data layout in `layouts.ts`), `brand-code:<name>` (a brand code layout) or `deck:<name>` (a deck code layout). A code layout that replaces a kit layout (`replaces: true` in its contract) keeps the kit layout's place in the list and has `replaces` on its entry, the source of the layout it replaces, such as `"replaces": "@deckster/kit"` (other layouts have no `replaces` key; `--summary --json` has it too, and the agent's `catalog` tool returns it with the rest of the entry). `--summary` prints `replaces the kit's title` under such a layout's description. With `--summary`, the deck's layouts come first under `Layouts from the <deck> deck (prefer these):`, then the brand's data and code layouts under `Layouts from the <brand> brand (prefer these):`, then `Other layouts:`. A code layout with a problem (a folder without both files, a contract that throws, an invalid contract, a name already taken) is left out and the other layouts still load: `deckster layouts` prints one warning per problem on stderr (and in `warnings` with `--json`) as `The code layout "<name>" is left out (<problem id>[ in <file>]): <message>. Fix: <fix>` (`Code layouts are left out (...)` for a problem with all of a brand's or deck's code layouts, such as `layout-version`), and `deckster new slide --layout <name>` fails with that problem instead of "There is no layout". `deckster brand <name>` prints `Code layouts: N (names)` (or `Code layouts: none (...)`) under its `Layouts:` line, with `title (replaces the kit's title)` for a layout that replaces a kit layout (that needs the contracts, so it runs them as `deckster layouts` does; when they cannot be loaded it lists the names alone). `deckster brand check <name>` runs the brand's code layout contracts and reports each problem as an error under the layout's file, as `error   <problem id>: <message>` with its `Fix:`, and exits `1`; with `--json`, each such entry of `errors` is `{ path: "", message, fix, file, code, layout? }`, where `code` is the problem id (`layout-folder-incomplete`, `layout-name-mismatch`, `layout-name-clash`, `layout-contract-imports`, `layout-contract-invalid`, `layout-load-failed`, `layout-held`, `layout-version`) and `layout` the layout's folder name. `layout-replace-breaks` is also a slide of a deck on the brand that uses a replaced kit layout and does not fit its replacement. A data layout in `layouts.ts` may name a brand code layout (or a replacement) as its `fallback`. A replacement that joins the catalog can add to `warnings` and, when it changes a budget or the title limit, notes: `layout-replace-pptx` (the kit layout has a PowerPoint mapping and the replacement does not) is a warning, `layout-replace-budget` is a note; they print as `warning` and `note` lines like the errors (the verdict counts notes as `K notes` when there are any), and each entry of `warnings` has `{ path: "", message, fix, file, code, layout, level }` with `level` `"warning"` or `"note"` (only errors fail). When a code layout's `layout.tsx` throws while loading or rendering, only its slides fail: `deckster lint` reports them under the rule `layout-load-failed` (an error, naming the layout) instead of `render-error`, and `deckster shot` still fails on them. A slide whose code layout cannot be used at build time is reported under the problem's own id instead of `schema`, as an error at the slide (in `findings[].rule` with `--json`): `layout-load-failed` (the contract threw), `layout-contract-invalid`, `layout-name-mismatch`, `layout-folder-incomplete`, `layout-contract-imports`, `layout-held`, `layout-version`, `layout-name-clash`, `layout-replace-breaks` (the slide does not fit the layout's replacement), and `layout-code-skipped` (the slide uses a code layout `deckster brand add` left out, or one that only another brand has). `deckster brand add` never runs a fetched brand's code.

- **Layouts new and check**: `deckster layouts new <name> --brand <brand>` (or `--deck <deck>`) writes `layouts/<name>/` in the brand or deck: `contract.ts` (one `body` slot, a required title, an optional eyebrow, a description, an `example` and a `pptx` mapping whose title placeholder is the header's `.kit-title`), `layout.tsx` (`Frame`, `SlideHeader` and `Region` from `@deckster/kit/layout-parts`, default export `defineLayout` with the same name), `layout.css` (the kit's `@layer` line, rules keyed on `.kit-frame[data-layout='<name>']`) and `limits.ts` with one limit case. The files pass `deckster layouts check`, `deckster brand check`, `lint` and `build` as written. Exactly one of `--brand` and `--deck` is required. The name must be kebab-case (at most 64 characters), its folder must not exist, and it must not be an engine or kit layout (to replace one on purpose, write the folder by hand with `replaces: true` in its contract), a data layout of the brand, or, for a deck, a code layout of the deck's brand; the brand must be a folder of the workspace (not the framework's built-in `default`). It prints the files and a `Next:` line; with `--json`, `{ ok: true, layout, brand, deck, dir, files, next }` (`brand` or `deck` is `null`). The words `new` and `check` after `deckster layouts` start these subcommands, so a deck of either name is listed with `DECK=<name> deckster layouts`. `deckster layouts check [<name>] --brand <brand>` (or `--deck <deck>`) runs the checks `brand check` runs on the code layouts of that brand or deck (or only the one named: a folder with both files, names that match, a contract that imports only what a contract may, loads, is valid and takes no name already taken), and for a layout whose contract says `replaces: true` the compatibility check against the kit layout it replaces, including the slides of the workspace's decks on the brand (or of the deck) that use it; it loads each layout's optional `limits.ts`, then renders every layout that passed through the lint server in a temporary workspace that is removed afterwards (nothing is written to the workspace): its contract's `example`, and each limit case with the title and eyebrow at their longest and every slot at its budget (as a paragraph and, when the body takes bullets, as a list), in the deck's brand or, for a brand's layouts, in that brand. It runs the slide rules and page errors, not the rules about a deck as a talk (`layout-repetition`, `few-builds`, `time-budget`, `open-comments`, `missing-notes`, `brand-layout-fallback`), and leaves out `info` findings. `limits.ts` is optional and is loaded like `contract.ts` (the same import rules, never during an agent turn): `import type { LimitCase } from '@deckster/kit/limit-cases'` and `export default [{ name: 'full-body', frontmatter: {}, filled: [] }] satisfies readonly LimitCase[]`; each case has a kebab-case `name` (unique), `frontmatter`, `filled` (named slots to fill besides `body`), and optionally `body: false` and `bodyMdx`. The plain output lists each layout as `<name>: ok (<cases>)` or with its problems (`error   <id> (<file>, case <case>, slide <slide>, step <n>, <selector>): <message>` and a `Fix:` line), then `The <brand|deck> <name>: N of M layouts pass (E errors, W warnings[, K notes]).` With `--json`: `{ ok, brand, deck, dir, layouts: [{ name, dir, cases, ok, problems }], problems }`, each problem `{ severity, code, file, message, fix, case?, slide?, step?, selector? }`, where `severity` is `error`, `warning` or `note` (only errors fail), `code` is a layout problem id (`layout-folder-incomplete`, `layout-name-mismatch`, `layout-name-clash`, `layout-replace-breaks`, `layout-replace-pptx` (a warning), `layout-replace-budget` (a note), `layout-contract-imports`, `layout-contract-invalid`, `layout-load-failed`, `layout-held`, `layout-version`, or `layout-limits-invalid` for a `limits.ts` that is not a list of cases) or a lint rule id (`container-overflow`, `content-budget`, ...), `file` is the layout's `contract.ts` for the example, its `limits.ts` for a limit case, or the file at fault, and the top-level `problems` belong to no one layout (such as `layout-version`). A layout with an error before rendering is not rendered (`cases` is empty). Exit codes: `0` when no layout has an error (warnings do not fail), `1` when one does or the command fails (an unknown brand, deck or layout name, a bad command line).

- **Layouts eject and diff**: `deckster layouts eject <name...> --brand <brand>` (or `--deck <deck>`) copies kit layouts into `layouts/<name>/` as code layouts that replace them: `layout.tsx`, `contract.ts` (with `replaces: true`), `layout.css` and `limits.ts` (the kit's limit cases, as literals). A copy renders the same as the kit layout until you change it, and the kit layout and its stylesheet are no longer loaded for that brand or deck. Imports of kit parts point at `@deckster/kit/layout-parts`, `@deckster/kit/layout-fields`, `@deckster/kit` and `@deckster/kit/diagrams`. Helpers with no public home are copied once to `layouts/_shared/` and shared by every ejected layout; the classes of a helper's own stylesheet are renamed from `kit-…` to `own-…` (for example `.own-portrait`), so the kit's copy and yours never style each other. A stylesheet the layout shares with other kit layouts (`display-align.css`, `image-layout.css` for `title`, `stat-cards.css` for `stats`) is copied into the layout's folder with every rule scoped to the layout through `:where(…)`; the kit's own copy of those three still applies while another kit layout or chart loads it, so removing a rule from the copy only shows once that is no longer so. `--all --brand <brand>` ejects every layout of the kit's catalog (64) that the brand has no folder for, and warns that kit fixes then reach them only through `layout-parts` and `layout-fields`. Eject refuses, and writes nothing, for a name that is not a kit layout (with the closest name; `brand`, the renderer of data layouts, is not one), a layout folder that exists, a brand outside the workspace (the built-in `default`), a deck layout the deck's brand already replaces, and a helper in `layouts/_shared/` that differs from the one it would write; `--keep-shared` keeps your helper and makes the new layout use it. Each layout folder also gets `.eject/`: every file as written, the helpers under `.eject/_shared/`, and `eject.json` (`{ layout, deckster, files: { <path>: <sha256> } }`). `deckster layouts diff <name> --brand <brand>` (or `--deck <deck>`) ejects the current kit layout in memory and prints a unified diff from `.eject/` to it on standard output; your own edits play no part and nothing is applied. It warns on standard error when the kit's layout does not eject cleanly any more (a private import with no place in a copy) and when `.eject/` was changed. Exit code 0, or 1 with `--fail-on-change` when anything changed. `--json` prints `{ ok, brand, deck, layouts: [{ name, dir, files }], shared: { written, reused, kept }, skipped, warnings, next }` for eject and `{ ok, brand, deck, layout, dir, ejectedWith, current, changed, files: [{ path, status, diff }], problems, provenanceEdited }` for diff.

- **Brand add**: `deckster brand add <source>` copies only data and assets: code files, including a brand's code layouts (`layouts/<name>/` folders with a `contract.ts` or `layout.tsx`), are left out and listed under "Left out". It always writes `brands/<name>/.deckster-source.json` with `{ "source", "commit", "codeLayoutsSkipped" }`: where the brand came from (without credentials), the commit fetched (`null` when unknown), and the sorted names of the code layouts left out. Adding the brand again replaces the file, and a `.deckster-source.json` inside the fetched brand is ignored. With `--json` the result has the same names under `codeLayoutsSkipped`. Slides that use a skipped layout fail until its folder is copied from the brand's own repository.

- **Exit codes**: `0` on success, `1` on command/lint/diff failure, `129` on `SIGHUP`.

## Optional dependencies

`new`, `dev`, and `build` work out of the box. Other commands use optional tools installed on demand:

| Feature                          | Requirement                                                               |
| -------------------------------- | ------------------------------------------------------------------------- |
| `lint`, `shot`, `diff`, `export` | Playwright Chromium (commands print the exact install command if missing) |
| `present`                        | Electron binary (or pass `--browser` to open Chrome / default browser)    |
| `export --verify`                | Docker (LibreOffice + Open XML SDK), or `quicklook`/`keynote` on macOS    |
| `dev --agent claude\|codex`      | Signed-in `claude` or `codex` CLI (`deckster agent doctor` checks both)   |
| Looping video from GIFs          | `ffmpeg` on `PATH` (otherwise GIFs stay images)                           |

## Documentation & Links

- [Documentation](https://sandrinodm.github.io/deckster/)
- [CLI reference](https://sandrinodm.github.io/deckster/reference/cli/)
- [Presenting](https://sandrinodm.github.io/deckster/present/deck-present-and-displays/)
- [Agent panel](https://sandrinodm.github.io/deckster/ai-agents/agent-panel/) and
  [MCP tools](https://sandrinodm.github.io/deckster/ai-agents/mcp-tools/)
- [Build and host](https://sandrinodm.github.io/deckster/export-and-publish/build-and-host/)
- [deckster Repository](https://github.com/sandrinodm/deckster)
- [Design & Architecture](https://github.com/sandrinodm/deckster/blob/main/docs/design.md)
- [Contributing](https://github.com/sandrinodm/deckster/blob/main/CONTRIBUTING.md)

## License

[MIT](./LICENSE) © Sandrino Di Mattia
