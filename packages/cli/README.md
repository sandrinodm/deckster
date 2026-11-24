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

- **Code layouts**: a brand (`brands/<name>/layouts/<layout>/`) or a deck (`decks/<deck>/layouts/<layout>/`) may bring layouts written as code: a `contract.ts` and a `layout.tsx` per folder. The build, `dev`, `lint`, `shot`, `export` (the PPTX uses the contract's `pptx` mapping), `deckster layouts`, the agent's `catalog` tool and `deckster new slide <deck> <id> --layout <name>` all use them. A layout's `source` in `deckster layouts --json` (and in `--summary --json`) is one of `@deckster/kit` (or another package), `brand:<name>` (a data layout in `layouts.ts`), `brand-code:<name>` (a brand code layout) or `deck:<name>` (a deck code layout). With `--summary`, the deck's layouts come first under `Layouts from the <deck> deck (prefer these):`, then the brand's data and code layouts under `Layouts from the <brand> brand (prefer these):`, then `Other layouts:`. A code layout with a problem (a folder without both files, a contract that throws, an invalid contract, a name already taken) is left out and the other layouts still load: `deckster layouts` prints one warning per problem on stderr (and in `warnings` with `--json`) as `The code layout "<name>" is left out (<problem id>[ in <file>]): <message>. Fix: <fix>` (`Code layouts are left out (...)` for a problem with all of a brand's or deck's code layouts, such as `layout-version`), and `deckster new slide --layout <name>` fails with that problem instead of "There is no layout". `deckster brand <name>` prints `Code layouts: N (names)` (or `Code layouts: none (...)`) under its `Layouts:` line. `deckster brand check <name>` runs the brand's code layout contracts and reports each problem as an error under the layout's file, as `error   <problem id>: <message>` with its `Fix:`, and exits `1`; with `--json`, each such entry of `errors` is `{ path: "", message, fix, file, code, layout? }`, where `code` is the problem id (`layout-folder-incomplete`, `layout-name-mismatch`, `layout-name-clash`, `layout-contract-imports`, `layout-contract-invalid`, `layout-load-failed`, `layout-held`, `layout-version`) and `layout` the layout's folder name. When a code layout's `layout.tsx` throws while loading or rendering, only its slides fail: `deckster lint` reports them under the rule `layout-load-failed` (an error, naming the layout) instead of `render-error`, and `deckster shot` still fails on them. `deckster brand add` never runs a fetched brand's code.

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
