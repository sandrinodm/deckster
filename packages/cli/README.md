# @deckster/cli

`@deckster/cli` is `deck`, deckster's command line. It serves, builds, screenshots, lints, diffs,
exports and presents the decks in your folder, and prints the catalogs (layouts, charts, diagrams,
components, icons, brands) that agents read before they write a slide.

## Install

```sh
npm install --global @deckster/cli
```

It needs Node 26 or newer. The package carries the whole framework, so `dev`, `build` and `new`
need nothing else. `lint`, `shot`, `diff` and `export` drive Chromium, which you download once, and
`present` opens Electron; see [What it needs](#what-it-needs). `pnpm add --global @deckster/cli` works too.

`deck` works in a folder that holds `decks/<name>/` and, optionally, `brands/<name>/`. It uses the
nearest folder at or above the current one that has a `decks/` folder, or the one named by
`DECK_ROOT`. In an empty folder, `deck new` starts a workspace. It never picks your home folder or
the filesystem root on its own, because the dev server serves the workspace's decks and brands:
make a project folder first (`mkdir talks && cd talks`), or set `DECK_ROOT` to a folder you mean.
When the workspace is not the current folder, `deck` says which one it uses on standard error.
`deck --version` prints the installed version.

```sh
mkdir talks && cd talks
deck new launch-review --title "Launch review" --duration 20m
deck new slide launch-review results --layout stats
deck dev launch-review                    # hot reload; q or Ctrl+C stops it
deck lint launch-review
deck shot launch-review results           # .deck/shots/launch-review/02-results.png
deck export launch-review                 # .deck/exports/launch-review/*.pdf and *.pptx
deck types                                # once, for editor type checking
```

```console
decks/launch-review/slides/title.mdx
  warning missing-notes (title): The slide has no speaker notes.
          Fix: Add a `<Notes>` block saying what the slide proves and what to say, in a sentence or two.

launch-review: 0 errors, 1 warning in 1 slide (1 step checked).
```

`deck new` writes `deck.config.ts` and `slides/title.mdx` into the new deck folder and lists them.
A new deck is a plain folder: no `package.json` and no `node_modules`. The built-in `default` brand
is always there; add your own as `brands/<name>/brand.ts` and name it in `deck.config.ts`.

`deck <command> --json | jq .` gets clean JSON, `deck --help` lists the commands and
`deck <command> --help` prints the full options of one.

### Editor types

`deck types` writes `tsconfig.json` and `.deck/env.d.ts` at the workspace root, so an editor or
`tsc` resolves `@deckster/*`, `effect` and `react` imports from the files of your install without
a `node_modules` in the workspace. Settings you already have in `tsconfig.json` are kept. The paths
name this install's folders: run `deck types` again after upgrading, and do not commit the result
for others to use.

### Upgrading and the repository

Upgrade with `npm install --global @deckster/cli@latest`. To work on the framework itself, clone
the repository and use `pnpm deck <command>` from its root: the commands are the same, and the
repository's decks (`decks/hello` and the test decks) are ordinary decks.

## Conventions shared by every command

- **The deck argument** is a folder name under `decks/`, in kebab-case. A path is refused. When a
  command's deck is optional, it falls back to `$DECK`, then to `hello`, then to the only deck
  the workspace has (`build` falls back to every deck).
- **`--brand <name>`** on `dev`, `present`, `shot`, `lint`, `diff` and `export` renders the deck in
  `brands/<name>` instead of the brand its config names. Shots, exports and diffs then go to a
  folder with an `@<name>` suffix.
- **`--json`** prints one JSON document. A failure prints `{ ok: false, error: { type, message } }`
  and exits 1:

  ```console
  $ deck lint nope --json
  {
    "ok": false,
    "error": {
      "type": "DeckBuildError",
      "message": "No such deck in decks/nope:\n  - There is no decks/nope/deck.config.ts.\n    Fix: Use one of: apps-demo, components, data-stories, diagrams-demo, exemplars, hello, layouts, showcase; or create decks/nope/deck.config.ts."
    }
  }
  ```

- **Errors say what to do.** The CLI's own errors, brand errors and deck build errors print their
  message and fix without a stack trace. Anything else is a bug and prints its stack.
- **Exit codes**: 0 on success; 1 when the command fails, `lint` or `brand check` finds errors,
  `shot` captures a slide that threw, `agent doctor` finds a problem, or `diff --fail-on-change`
  finds a change; 129 after SIGHUP.

## What it needs

| For                                                                                | You need                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shot`, `lint`, `diff`, `export`, `build --out` thumbnails, `build --with-exports` | Playwright's Chromium, downloaded once: `npx playwright@1.65.0 install chromium` (the error names the exact command)                                                                                         |
| `present`                                                                          | Electron's binary, downloaded once. The error prints the command; it runs the `install.js` of the `electron` package, which works under npm and pnpm. `--browser` uses Chrome or the default browser instead |
| `diff` against a git ref                                                           | A git repository. Without one, compare with a folder made by `--save-baseline`                                                                                                                               |
| `export --verify`                                                                  | Docker for the LibreOffice and Open XML SDK renderers; the `quicklook` and `keynote` renderers are macOS only                                                                                                |
| `--agent claude` or `--agent codex`                                                | That CLI installed and signed in; `deck agent doctor` checks both                                                                                                                                            |

A local GIF becomes a looping video only when `ffmpeg` is on `PATH`; without it the build keeps the
GIF and `lint` warns `media-gif`.

## Commands

| Command                                     | What it does                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| [`dev`](#dev)                               | Serve a deck with hot reload                                             |
| [`present`](#present)                       | Open a deck in its own window, with displays and presenter view          |
| [`build`](#build)                           | Build a deck (or every deck) to `decks/<deck>/dist`                      |
| [`preview`](#preview)                       | Serve the built output of a deck                                         |
| [`shot`](#shot)                             | Write PNG screenshots of slides (and steps)                              |
| [`diff`](#diff)                             | Show which slides changed visually against a git ref or baseline         |
| [`export`](#export)                         | Export a deck to PDF, PNG and PowerPoint                                 |
| [`lint`](#lint)                             | Check a deck for schema errors, overflow, contrast and off-brand values  |
| [`layouts`](#layouts)                       | List the layouts available to a deck                                     |
| [`icons`](#icons)                           | List the icon names every brand has                                      |
| [`charts`](#charts-diagrams-components)     | List the chart and number components and when to use each                |
| [`diagrams`](#charts-diagrams-components)   | List the diagram components, node kinds and animation primitives         |
| [`components`](#charts-diagrams-components) | List the code, media, link and demo components with their props          |
| [`brand`](#brand)                           | Print a brand's resolved tokens, or check a brand                        |
| [`new`](#new)                               | Create a deck, or add a slide or a mini app to one                       |
| [`types`](#types)                           | Write tsconfig.json so editors and tsc resolve @deckster imports         |
| [`comments`](#comments)                     | List, resolve, reopen, add and prune review comments                     |
| [`mcp`](#mcp)                               | Print Claude Code and Codex configuration for a running `deck dev --mcp` |
| [`agent`](#agent)                           | Check the agent CLIs (Claude Code, Codex): installed, version, signed in |

### dev

```
deck dev [deck] [--port <n>] [--host] [--brand <name>] [--mcp]
         [--agent claude|codex] [--agent-panel right|bottom] [--agent-model <m>]
         [--agent-web]
```

Serves a deck with hot reload and prints the URL. It runs until you press `q` or Ctrl+C. In the
browser, `c` toggles comment mode and `a` the agent panel (with `--agent`).

| Flag                            | Meaning                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                    | Use this port and fail if it is taken. Default: the first free port from 5173                                                                                           |
| `--host`                        | Listen on all network interfaces, for example to present from a phone                                                                                                   |
| `--brand <name>`                | Render with `brands/<name>`                                                                                                                                             |
| `--mcp`                         | Serve the deck's MCP tools at `/__deck/mcp` on 127.0.0.1. The port and a per-run bearer token go to `.deck/agent/<deck>/server.json` (mode 0600) until the server stops |
| `--agent <claude\|codex>`       | Add the agent chat beside the slide. It runs that CLI with your own login, one process per prompt, and every turn can be undone. Implies `--mcp`                        |
| `--agent-panel <right\|bottom>` | Where the chat docks. Default: `right`                                                                                                                                  |
| `--agent-model <name>`          | The model the agent uses. Default: the CLI's own default                                                                                                                |
| `--agent-web`                   | Let the agent search the web and read pages. Off by default                                                                                                             |

The agent edits only the deck's content (slide files in `slides/`, media and data in `assets/` and
`public/`) through a working copy, and changes the slide list only through the deck tools. What
it writes anywhere else is put back. [docs/agent.md](https://github.com/sandrinodm/deckster/blob/main/docs/agent.md) covers the panel and its
trust model.

### present

```
deck present [deck] [--brand <name>] [--port <n>] [--built] [--fullscreen]
             [--display <n>] [--presenter [display]] [--kiosk] [--browser] [--verbose]
             [--agent claude|codex] [--agent-panel right|bottom] [--agent-model <m>]
             [--agent-web]
deck present --list-displays [--json]
```

Opens a deck in its own Electron window and serves it with hot reload. Closing the window stops
the server, and so does Ctrl+C. The terminal shows a short status. Download the binary first (see
[What it needs](#what-it-needs)); the window, displays and shortcuts are in
[docs/present.md](https://github.com/sandrinodm/deckster/blob/main/docs/present.md).

| Flag                                                       | Meaning                                                                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--brand <name>`, `--port <n>`                             | As for `dev`                                                                                                                                   |
| `--built`                                                  | Build the deck and present the static build: no hot reload, comments, agent or other dev tools. Cannot be combined with `--brand` or `--agent` |
| `--fullscreen`                                             | Make the audience window fullscreen                                                                                                            |
| `--display <n>`                                            | Open the audience window on display n. Default: the primary display, or the one that is not the presenter's                                    |
| `--presenter [n]`                                          | Also open the presenter window, with notes and timer, on display n. Default: the other display                                                 |
| `--kiosk`                                                  | Fullscreen with no menu; Cmd/Ctrl+Q must be pressed twice to quit                                                                              |
| `--browser`                                                | Open the deck in Chrome's app mode (else the default browser) instead of Electron, and print the URL                                           |
| `--list-displays`                                          | Print the connected displays and exit; with `--json`, `{ ok, displays }`                                                                       |
| `--verbose`                                                | Also print the dev server's log                                                                                                                |
| `--agent`, `--agent-panel`, `--agent-model`, `--agent-web` | As for `dev`                                                                                                                                   |

### build

```
deck build [deck] [--with-exports] [--all] [--out <dir>] [--include-scratch]
```

Builds a deck to `decks/<deck>/dist` as static files that can be hosted under any path. Without a
deck it builds every deck.

| Flag                | Meaning                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--out <dir>`       | Also write one site folder: `<dir>/<deck>/` per deck with a `thumbnail.png`, and `<dir>/index.html`, a gallery with each deck's title, brand, slide count and links. Only the built decks' folders and `index.html` are replaced |
| `--all`             | Build every deck (already the default without a deck name); cannot be combined with a deck                                                                                                                                       |
| `--include-scratch` | With `--out`, also put `zz-` decks (scratch decks such as trial runs) in the site. A named deck is always included                                                                                                               |
| `--with-exports`    | Also write `<deck>.pdf` and `<deck>.pptx` beside `index.html`, for the kit's `<Download file>` and the gallery                                                                                                                   |

Hosting the result is in [docs/deploy.md](https://github.com/sandrinodm/deckster/blob/main/docs/deploy.md).

### preview

```
deck preview [deck] [--port <n>] [--host]
```

Serves `decks/<deck>/dist` until Ctrl+C. Run `deck build <deck>` first. `--port` fails when the
port is taken; `--host` listens on all interfaces.

### shot

```
deck shot <deck> [slide] [--steps] [--brand <name>] [--out <dir>] [--scale <n>] [--json]
```

Renders the deck in static mode and writes a 1920x1080 PNG per slide, named `03-request-flow.png`.
`slide` is an id or a 1-based number. Each slide is captured at its last step. A slide that throws
is still captured, showing its error, and the command exits 1.

| Flag             | Meaning                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `--steps`        | One PNG per step, named `NN-id.stepK.png` (K from 0)                                                    |
| `--brand <name>` | Render with `brands/<name>`; the default folder becomes `.deck/shots/<deck>@<brand>`                    |
| `--out <dir>`    | Output folder. Default: `.deck/shots/<deck>`                                                            |
| `--scale <n>`    | Pixel density from 0.25 to 4; 2 writes 3840x2160. Default: 1                                            |
| `--json`         | `{ deck, brand, outDir, ok, files: [{ path, slide, number, step, width, height, error }], pageErrors }` |

A run over the whole deck first removes older screenshots with the same naming from the folder.

### diff

```
deck diff <deck> [--base <ref|dir>] [--brand <name>] [--steps] [--threshold <n>]
                 [--out <dir>] [--fail-on-change] [--json]
deck diff <deck> --save-baseline [dir] [--brand <name>] [--steps] [--json]
```

Renders the deck now and at a base, matches slides by id and compares them pixel by pixel. Each
slide is `unchanged`, `changed`, `added`, `removed` or `moved`, so a reordered deck reports moves,
not a change on every slide.

| Flag                    | Meaning                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--base <x>`            | A folder of `deck shot` PNGs, else a git ref. Default: `HEAD` in a git repository; outside one, the `--save-baseline` folder. A ref is extracted with `git archive` into a temporary folder that links this workspace's `node_modules` and renders with the ref's own packages |
| `--brand <name>`        | Render both sides with `brands/<name>`                                                                                                                                                                                                                                         |
| `--steps`               | Compare every step; a baseline folder must then hold step pictures                                                                                                                                                                                                             |
| `--threshold <n>`       | The share of visibly changed pixels, 0 to 1, above which a picture counts as changed. Default: 0                                                                                                                                                                               |
| `--out <dir>`           | Report folder. Default: `.deck/diff/<deck>[@<brand>]`                                                                                                                                                                                                                          |
| `--fail-on-change`      | Exit 1 when any slide changed, was added, removed or moved                                                                                                                                                                                                                     |
| `--save-baseline [dir]` | Render a baseline instead of comparing. Default: `.deck/baseline/<deck>[@<brand>]`                                                                                                                                                                                             |
| `--json`                | The report, with absolute picture paths                                                                                                                                                                                                                                        |

The report folder holds `index.html`, `summary.md` (a table for a pull request comment),
`report.json` and `before/`, `after/` and `compare/` pictures of what differs. Without git:

```console
$ deck diff hello --save-baseline
Saved 4 pictures of "hello" to .../.deck/baseline/hello
$ deck diff hello
hello (default) against .../.deck/baseline/hello: 4 unchanged
Nothing changed. Report: .../.deck/diff/hello/index.html
```

### export

```
deck export <deck> [--pdf] [--png] [--pptx] [options]
```

Exports the deck rendered in static mode to `.deck/exports/<deck>` (or `<deck>@<brand>`). Without
a format flag it writes the PDF and the PPTX.

- `--pdf`: one page per slide at its last step, Chromium's vector PDF with fonts embedded, links,
  a bookmark and page label per slide, and tags for screen readers. Videos, iframes and apps show
  their posters.
- `--png`: screenshots as `deck shot` writes them, in `<out>/png`.
- `--pptx`: a theme and master per brand surface, the deck's layouts as slide layouts with
  placeholders, editable text, embedded brand fonts, native shapes, tables, charts and diagrams,
  speaker notes, links and step animations. What PowerPoint cannot draw becomes a picture.

| Flag                 | Meaning                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--steps`            | One page or slide per step                                                                                                                                                                 |
| `--slides <list>`    | Slides to export, such as `3,5-9` or `cover,heat-map`                                                                                                                                      |
| `--brand <name>`     | Render with `brands/<name>`                                                                                                                                                                |
| `--out <path>`       | Output folder, or a `.pdf` or `.pptx` file when exporting one format                                                                                                                       |
| `--notes`            | Add speaker notes pages after the slides in the PDF                                                                                                                                        |
| `--scale <n>`        | Pixel density of PNGs and PPTX pictures, 0.25 to 4. Default: 1 for PNGs, 2 for PPTX pictures                                                                                               |
| `--mode <mode>`      | PPTX mode: `hybrid` (default: native where faithful, else a picture), `native` (never a picture; reports what it dropped) or `image` (one picture per slide, with notes and link hotspots) |
| `--outline-text`     | Draw display-size text (60px and up) as vector shapes in the brand font; the text stays in the title placeholder                                                                           |
| `--no-embed-fonts`   | Name the brand's families instead of embedding them                                                                                                                                        |
| `--fonts <set>`      | `brand` (default) or `system`: lay the deck out in each family's substitute (Arial, Georgia, Courier New...) for apps without the brand's fonts                                            |
| `--no-animations`    | Do not turn step reveals into click animations                                                                                                                                             |
| `--no-embed-media`   | Keep videos as posters instead of embedding them                                                                                                                                           |
| `--max-media-mb <n>` | The largest video to embed. Default: 50                                                                                                                                                    |
| `--dry-run`          | List per slide what the PPTX draws natively, as a picture, simplified or dropped, and why; writes nothing                                                                                  |
| `--verify`           | Validate the PPTX with the Open XML SDK, render it back and compare each region with the web slide; writes side-by-side pictures and `report.json` to `<out>/verify`                       |
| `--strict`           | With `--verify`, exit non-zero when any region differs or nothing was rendered                                                                                                             |
| `--renderer <ids>`   | Renderers for `--verify`: `libreoffice`, `libreoffice-nofonts`, `libreoffice-embedded` (Docker), `quicklook`, `keynote` (macOS). Default: `libreoffice,libreoffice-nofonts,quicklook`      |
| `--json`             | Print the result as JSON                                                                                                                                                                   |

```console
$ deck export hello --dry-run
PPTX dry run (hybrid mode): native / picture / simplified / dropped
01 title [default]: 2 / 0 / 0 / 0
02 steps [default]: 6 / 0 / 0 / 0
03 live-counter [default]: 5 / 0 / 0 / 0
04 closing [default]: 4 / 0 / 0 / 0
Total: 17 native, 0 picture, 0 simplified, 0 dropped.
```

### lint

```
deck lint <deck> [--brand <name>] [--json]
```

Checks a deck in three passes and exits 1 when it finds errors:

1. **Schema**: the deck config, the brand and every slide file go through the same checks as
   `deck build`. When files fail, the rendered checks are skipped.
2. **Rendered**: the deck opens in static mode in headless Chromium and every step of every slide
   is measured: overflow, truncated or overlapping text, minimum type size, WCAG contrast
   (including text over photos), off-brand values, content budgets, chart and diagram rules,
   missing posters and broken images.
3. **Deck**: rules over the whole deck, such as layout repetition and the time budget against the
   config's `duration`.

`deck lint --help` lists every rule with its severity. With `--json` it prints
`{ deck, brand, ok, summary: { errors, warnings, slides, steps, budgetSeconds }, findings }`, each
finding with `slide`, `file`, `step`, `rule`, `severity`, `message`, `fix` and `selector`. Mark
decoration with `aria-hidden="true"` or `data-decorative` to keep it out of the overflow and text
rules.

### layouts

```
deck layouts [deck] [--summary] [--json]
```

Lists the layouts a slide can name in its `layout:` frontmatter. `--summary` gives one compact
entry per layout (description, default surface, title limit, slots with what they accept and their
budget, item counts); `--json` gives the full catalog: each layout's frontmatter schema, fields,
slots, budget, variants with their limits, and an example.

```console
$ deck layouts --summary
default     surface default   title any
            One column of content under an accent rule, centred on the slide: a heading with a lead paragraph, or a heading with a short list.
            slots: body* heading/text/bullets/image/component 80 words 6 bullets
title       surface gradient  title <= 36
...
```

### icons

```
deck icons [--brand <a,b>] [--search <text>] [--json]
```

Lists the icon names every given brand's icon set has (default: every brand in `brands/`), for
`<Icon name>`, layout `icon` fields and diagram nodes. Plain output prints the count and the first
120 names.

```console
$ deck icons --search arrow-right
5 icon names matching "arrow-right" in every one of: default (lucide), nocturne (tabler)
Sets: lucide, tabler

arrow-right, arrow-right-circle, arrow-right-square, circle-arrow-right, square-arrow-right
```

### charts, diagrams, components

```
deck charts [--json]
deck diagrams [--json]
deck components [--json]
```

The component catalogs. `charts` lists the chart and number components by the message each suits
(trend, ranking, part-to-whole...), with props, data shape, lint limits and an example.
`diagrams` lists the diagram components and parts, node kinds, edge options, animation
primitives, limits and how to write diagrams in TSX. `components` lists code, terminal, media,
icon, link, live demo, step and notes components with their props. The three share one shape: a
`shared` block of props described once, then one entry per component named by its tag.

### brand

```
deck brand [name] [--json]
deck brand check <name> [--json]
```

`deck brand [name]` prints a summary of `brands/<name>` (default: `default`): fonts, type scale,
spacing and each surface's colour roles. `--json` prints every resolved token. `deck brand check
<name>` validates a brand without a deck and exits 1 on errors.

```console
$ deck brand check nocturne
brands/nocturne/brand.ts
nocturne: is valid (0 errors, 0 warnings).
```

### new

```
deck new <deck> [--title <text>] [--brand <name>] [--duration <length>]
deck new slide <deck> <id> [--layout <name>]
deck new app <deck> <name>
```

| Form                         | Creates                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deck new <deck>`            | `decks/<deck>/` with `deck.config.ts` and a title slide that passes `deck lint` (in the repository also `package.json` and `tsconfig.json`; run `pnpm install` next) |
| `deck new slide <deck> <id>` | `slides/<id>.mdx` from the layout's example, appended to the slide list                                                                                              |
| `deck new app <deck> <name>` | `apps/<name>/`, a React mini app wired to `@deckster/app-bridge`, shown with `<AppFrame app="<name>" poster="..." />`                                                |

`--title` defaults to the name as a sentence and is held to the title layout's limit. `--brand`
defaults to `default`. `--duration` takes `20m`, `90s` or `1m30s`. `--layout` defaults to
`default`. Names are kebab-case.

### types

```
deck types
```

Writes `tsconfig.json` and `.deck/env.d.ts` at the workspace root for editors and `tsc`: `@deckster/*`
imports map to the framework's source in this install, `effect`, `react` and `react-dom` to the
framework's own copies, and the `*.mdx`, Node, Vite client and icon declarations are included. Only the
entries it manages (`@deckster/*`, `effect`, `react`, `react-dom` and `*`) of an existing
`compilerOptions.paths` are replaced; a `tsconfig.json` that extends another keeps its own compiler
options, and one with comments or a symbolic link is left alone. In the framework's repository it does nothing, because the workspace links
the packages.

### comments

```
deck comments <deck> [--open | --resolved | --all] [--slide <id>] [--json]
deck comments resolve <deck> <id> [--note <text>] [--json]
deck comments reopen <deck> <id> [--json]
deck comments add <deck> <slide> --text <text> [--line <n>] [--step <n>] [--type <type>]
deck comments prune <deck> [--json]
```

Review comments are left in the browser (`c` in `deck dev`) or by agents, and stored in
`decks/<deck>/.feedback/<slide-id>.json`, committed with the deck. Each one names the file, line
and column to edit, with an anchor status (`ok`, `moved`, `guessed`, `lost`, `none`) that says how
far to trust that line.

| Form                   | Does                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `deck comments <deck>` | Lists open comments (`--resolved` or `--all` for the others; `--slide` for one slide)                                                 |
| `resolve <deck> <id>`  | Marks a comment resolved, signed with `$DECK_AUTHOR`, else git's `user.name`; `--note` says what changed                              |
| `reopen <deck> <id>`   | Opens a resolved comment again                                                                                                        |
| `add <deck> <slide>`   | Adds a comment on a slide, or with `--line` on that line of its file. `--type` is `fix`, `question` or `idea`; `--step` defaults to 0 |
| `prune <deck>`         | Removes comments of slides the deck config no longer lists                                                                            |

### mcp

```
deck mcp [deck] [--json]
```

Prints ready-to-paste configuration for Claude Code (`.mcp.json` and `claude mcp add`) and Codex
(`config.toml` and `codex mcp add`) that connects them to a running `deck dev <deck> --mcp`. It
reads the port and token from `.deck/agent/<deck>/server.json`. Without a running server it says
how to start one:

```console
$ deck mcp hello
No dev server with the MCP endpoint is running for "hello".
Start one with `deck dev hello --mcp`, then run this again.
```

### agent

```
deck agent doctor [--agent claude|codex] [--json]
```

Checks the CLIs that `--agent` drives: whether each binary is on the `PATH`, its version against
the one the adapter was tested with, and whether it is signed in, with the command that fixes each
problem. It never prints an e-mail address or a token. Exits 1 when a checked provider has a
problem.

## Output folders

| Path                               | Written by                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `decks/<deck>/dist/`               | `build`                                                                      |
| `.deck/shots/<deck>[@<brand>]/`    | `shot`                                                                       |
| `.deck/exports/<deck>[@<brand>]/`  | `export` (`verify/` inside it for `--verify`)                                |
| `.deck/diff/<deck>[@<brand>]/`     | `diff`                                                                       |
| `.deck/baseline/<deck>[@<brand>]/` | `diff --save-baseline`                                                       |
| `.deck/agent/<deck>/`              | `dev --mcp` and `--agent`: `server.json`, screenshots, session, turn journal |
| `.deck/shell/`                     | `present`: the Electron profile and saved window bounds                      |

`.deck/` and `dist/` are in `.gitignore`.

## Using it from code

In the repository only: the published package exports nothing but its `package.json`.

The package's one export (`.` → `src/index.ts`) is used by the root scripts
(`scripts/tailwind-tooling.ts`). `main(argv, workspace?)` runs a command line as the process's main
program; `Workspace.at(root)` points it at another workspace, such as a scratch folder:

```ts
import { main, Workspace } from '@deckster/cli';

main(process.argv.slice(2), Workspace.at('/path/to/workspace'));
```

It also exports `runCli` and `cliProgram` (the Effect program behind `main`), `cliLayer`, the
`DeckServer` and `DeckBrowser` services, `lintDeck` with `LINT_RULES` and the rule types,
`takeShots`, `listLayouts`, `createDeck`, `addSlide` and `runToolingStylesheet` (what `pnpm
tooling:tailwind` runs).

## Working on the CLI

This section is for contributors, in a clone of the repository.

| Folder in `src/`                               | Holds                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `commands/`                                    | One file per command: its help text, argument parsing and run. `cli.ts` lists them in `COMMANDS`                                        |
| `lint/`                                        | `deck lint`: `run-lint.ts`, the rules in `lint/rules/` (listed in `rules/index.ts`)                                                     |
| `browser/`                                     | `DeckBrowser` (headless Chromium, launched on first use) and `collect-snapshot.ts`, which runs in the page and must stay self-contained |
| `server/`                                      | `DeckServer`, the dev and preview servers, shutdown handling                                                                            |
| `shot/`, `diff/`, `export/`, `site/`           | `shot`, `diff`, `export`, and `build --out`                                                                                             |
| `present/`                                     | `DeckShell` (spawns the Electron shell), the window plan and the `--browser` fallback                                                   |
| `agent/`                                       | The `--agent*` flags and the live implementation of the MCP deck tools                                                                  |
| `scaffold/`, `comments/`, `layouts/`, `icons/` | `new`, `comments`, `layouts`, `icons`                                                                                                   |

Run one test file from the package folder:

```sh
cd packages/cli
pnpm exec vp test run src/commands/icons.test.ts
```

`pnpm exec vp test` runs the whole package. Most tests need no browser: `fakeDeckLayer`
(`src/browser/fake-deck.fixture.ts`) replaces the server and browser with prepared snapshots,
`fakeShell()` (`src/present/fake-shell.fixture.ts`) stands in for Electron, and
`src/diff/diff.fixture.ts` fakes the picture comparer. A few integration tests drive real Chromium
(hello in both brands, and this package's `fixtures/decks/rules`, which has a failing and a passing case for every
lint rule). The real-Electron tests skip when the binary is absent. The test config sets
`DECK_TEST_FAKE_AGENT=1`, which the real CLI requires before it accepts the hidden `--agent fake`.

Rules a change here has to keep:

- Commands, flags, help text, messages, `--json` shapes and exit codes are the public surface.
  Agents and CI scripts parse them, so changing one is a feature, not a refactor.
- Node-side code is Effect v4: every effectful function is `Effect.fn('name')`, errors are tagged
  classes built by one factory (`cliError`, `usageError`, `browserError`...) whose message says
  what to do, and every server, browser and child process is released by a scope.
- Deck, brand and slide names that become paths go through `isSafeName`; never join a raw argument
  into a path.
- Lint thresholds and minimum sizes come from `@deckster/brand`, not from constants here.
- A new lint rule goes in `src/lint/rules/`, is listed in `rules/index.ts`, and gets a failing and
  a passing case in this package's `fixtures/decks/rules`.

## License

MIT, see [LICENSE](./LICENSE).
