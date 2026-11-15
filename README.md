# deckster

[![CI](https://github.com/sandrinodm/deckster/actions/workflows/ci.yml/badge.svg)](https://github.com/sandrinodm/deckster/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@deckster/cli.svg)](https://www.npmjs.com/package/@deckster/cli)
[![Node.js >= 26](https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

![A black card box printed "deckster" with a vermilion square, a stack of blank cards, and eight slide-shaped cards in two rows: a title rule, a bar chart with one vermilion bar, three boxes joined by arrows, a large "3×", a vermilion quotation mark, a line chart with one vermilion point, a grid of six squares with one vermilion, and a nearly empty card numbered 8](assets/brand/hero.png)

deckster is a code-first slide framework: one MDX or TSX file per slide, typed layouts and brands,
a React engine on Vite, and a `deck` CLI that serves, lints, screenshots, exports and presents
decks. It is built for slides written largely by AI agents and checked by `deck lint`, with a
person reviewing the result.

## Quick start

With **Node.js 26 or later**, install [`@deckster/cli`](packages/cli/README.md) globally and create
a workspace:

```sh
npm install --global @deckster/cli
mkdir talks && cd talks
deck new launch-review --title "Launch review" --duration 20m
deck dev launch-review                    # hot reload; q or Ctrl+C stops it
```

Or run directly from a clone of this repository:

```sh
git clone https://github.com/sandrinodm/deckster.git
cd deckster
pnpm install
pnpm dev hello              # the 4-slide starter deck, with hot reload
pnpm deck dev showcase      # a 45-slide tour of everything a deck can hold
```

The dev server prints its URL (the first free port from 5173). When working in this repository,
pnpm 12.16.1 is pinned in `devEngines` and downloaded on demand.

The other commands work on the same deck name:

```console
$ pnpm deck lint hello
decks/hello/slides/closing.mdx
  warning missing-notes (closing): The slide has no speaker notes.
          Fix: Add a `<Notes>` block saying what the slide proves and what to say, in a sentence or two.

hello: 0 errors, 1 warning in 4 slides (8 steps checked).
```

| Command                                               | What it does                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm deck shot hello`                                | One 1920x1080 PNG per slide in `.deck/shots/hello` (`--steps` for every step)                           |
| `pnpm deck export hello`                              | `hello.pdf` and `hello.pptx` in `.deck/exports/hello`                                                   |
| `pnpm deck present hello`                             | The deck in its own window, with a presenter window (needs Electron, see [Requirements](#requirements)) |
| `pnpm deck new launch-review --title "Launch review"` | A new deck in `decks/launch-review` that passes `deck lint`; run `pnpm install` before using it         |
| `pnpm deck --help`                                    | Every command; `pnpm deck <command> --help` for one                                                     |

`shot`, `lint` and `export` render in Playwright's Chromium. Install it once with
`pnpm --filter @deckster/cli exec playwright install chromium`.

## What a deck looks like

A deck is a folder with a config that lists its slides in order. This is
[`decks/hello/deck.config.ts`](decks/hello/deck.config.ts):

```ts
import { defineDeck } from '@deckster/engine/config';

export default defineDeck({
  title: 'Hello, deck',
  brand: 'default',
  slides: ['title', 'steps', 'live-counter', 'closing'],
});
```

Each slide is a file in `slides/`. The frontmatter picks a layout and a brand surface and sets a
time budget; `<Step at={n}>` reveals content from step n on, and `<Notes>` holds what the speaker
says. This is [`decks/hello/slides/steps.mdx`](decks/hello/slides/steps.mdx):

```mdx
---
layout: default
title: How steps work
budget: 1m30s
---

## How steps work

<Step at={1}>- Each slide has one integer step, starting at 0.</Step>

<Step at={2}>
- `<Step at={n}>` reveals its content from step n on.
</Step>

<Step at={3}>- Going back into a slide lands on its last step.</Step>

<Notes>
Press the right arrow three times to reveal each point.

Mention that the step count comes from the steps that mount.

</Notes>
```

A slide that needs real code is a TSX file with the same steps and notes, such as
[`live-counter.tsx`](decks/hello/slides/live-counter.tsx). [decks/hello](decks/hello/README.md)
walks through all four slides.

## The idea

An agent that writes slides needs rules it can read and a check it can run. deckster gives it both.

Slides fill typed layouts. A layout such as `cards`, `stats` or `comparison` owns the grid, the type
and the spacing, and its contract says which frontmatter fields and slots it takes and how much
content fits: words, bullets and items, counted the same in every brand. `pnpm deck layouts
--summary` prints that budget for all 23 layouts, and the `charts`, `diagrams`, `components` and
`icons` commands list the rest. The build fails on an unknown layout, field or icon.

`deck lint` is the check. It renders every step of every slide in Chromium and reports overflow,
text cut short, contrast (including text over photos, measured against the pixels), off-brand
values, content over budget, missing notes and a talk that runs over its `duration`, each with a
fix. `deck shot` gives the agent, or you, a picture to look at.

Brands are data. A brand is a typed `brand.ts` in `brands/<name>` with colours, surfaces, fonts,
icons, motion and chart palettes; slides hold no raw colours or pixel positions. The same deck
renders in another brand without an edit: `pnpm deck lint hello --brand nocturne`. The reasons
behind these choices are in [docs/design.md](docs/design.md).

## What it does

- Write MDX or TSX slides on [23 kit layouts](packages/kit/README.md), with code blocks (Shiki,
  line steps, diffs, `<CodeMove>`), `<Terminal>`, images, video with cues, Lottie and icons from
  the brand's icon set.
- Put numbers on a slide with chart and number components in the brand's chart palette that
  highlight one value, take annotations and reveal by step (`pnpm deck charts` lists them).
- Draw `<Flow>` diagrams placed on a grid or by ELK, with routed edges and packets that travel
  along them by step, plus sequence diagrams, timelines, layers, cycles, trees and sanitised SVG.
- Embed live React components with `<Live>`, and mini apps in `<AppFrame>` that talk to the deck
  over [`@deckster/app-bridge`](packages/app-bridge/README.md).
- Check a deck with `deck lint`, and see which slides changed visually against a git ref or a
  saved baseline with `deck diff` ([CLI](packages/cli/README.md)).
- Review in the dev server: press `c` and click an element to comment on it. The comment is saved
  with the file and line that rendered the element, and `deck comments` lists them for a person or
  an agent to fix ([`@deckster/comments`](packages/comments/README.md)).
- Present with the slide sidebar, overview, presenter window with notes and pacing, laser and
  blackout ([`@deckster/presenter`](packages/presenter/README.md)), or with `deck present`, which opens
  the audience and presenter windows on the displays you pick ([docs/present.md](docs/present.md)).
- Export a PDF with bookmarks and links, and a PPTX with editable text, a master per brand surface,
  native charts and diagrams, speaker notes and click animations
  ([`@deckster/export`](packages/export/README.md)).
- Ask an agent: `pnpm deck dev hello --agent claude` (or `codex`) opens a chat panel beside the
  slide that runs your own signed-in CLI, limited to the deck's content, with undo per turn
  ([docs/agent.md](docs/agent.md)). `--mcp` alone serves the deck's tools to an agent you run
  yourself.
- Publish: `pnpm deck build --all --out site` builds every deck into one static folder with a
  gallery page ([docs/deploy.md](docs/deploy.md)).

## Working with agents

Two agent skills teach a coding agent (Claude Code, Codex, Cursor and others) to use the `deck` CLI
well. They live in [`skills/`](skills) and are written for the published CLI: they expect `deck` on
your PATH (`npm install --global @deckster/cli`, Node 26 or newer) and a folder with `decks/` and
`brands/`, not a clone of this repository.

- [create-presentation](skills/create-presentation/SKILL.md) plans a talk from audience and outcome
  to a storyline and an outline with one claim per slide, then writes the slides, speaker notes and
  charts with `deck new`, `deck lint` and `deck shot`, looks at every screenshot, and critiques the
  result against a rubric.
- [brand-import](skills/brand-import/SKILL.md) turns a PPTX, PDF, Google Slides link, website,
  guidelines document or screenshots into a draft `brands/<name>/brand.ts`: palette, surfaces,
  typography with font licence status, logos, data palettes. It checks the brand with
  `deck brand check`, builds a specimen deck in it and renders side-by-side comparisons with the
  source.

Install them with [skills.sh](https://skills.sh):

```sh
npx skills add sandrinodm/deckster                              # both skills; asks which agents
npx skills add sandrinodm/deckster --skill create-presentation  # one skill
npx skills add sandrinodm/deckster -a claude-code codex         # choose the agents
npx skills add sandrinodm/deckster -g                           # for every project, not just this one
npx skills add sandrinodm/deckster --list                       # see what is there without installing
```

Without `-g` the skills go into the current project: `.agents/skills/` (read by Codex and several
other agents) with a symlink for each other agent you pick, such as `.claude/skills/` for Claude
Code; `--copy` copies the files instead. With `-g` they go into the agents' user-level folders.
`npx skills ls`, `update` and `remove` manage them afterwards, and `-y` skips the prompts.

Then ask for what you want in the folder that holds your decks:

```console
$ mkdir talks && cd talks
$ claude
> Make a 10-minute deck about our Q3 reliability numbers for the leadership team. We want them to
  approve the on-call staffing change. Use the default brand.
```

The agent asks only what it cannot infer, writes a short brief and outline for you to react to,
then builds `decks/q3-reliability/` and checks it. For a brand, hand it a source:

```console
> Import our brand from ~/Downloads/company-template.pptx and the site https://example.com.
```

The skills run the CLI for you; for editor type checking in the same folder run `deck types` once.
The skills need Chromium for `deck lint` and `deck shot` (downloaded once, see
[the CLI README](packages/cli/README.md#what-it-needs)), and brand-import also uses
[`uv`](https://docs.astral.sh/uv/) for its Python extractors.

In this repository `.claude/skills` and `.agents/skills` link to `skills/`, so agents working on
deckster itself load the same files. The chat panel's agent (`deck dev --agent`) reads
`create-presentation` from the workspace when it finds it, under either folder.

## Packages

[`@deckster/cli`](packages/cli/README.md) is published to npm and bundles the framework. The other
workspace packages are private and export TypeScript source directly:

| Package                                                   | What it is                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`@deckster/engine`](packages/engine/README.md)           | The React runtime: canvas, steps, navigation, `window.__deck`, and the typed deck, slide and layout contracts |
| [`@deckster/vite-plugin`](packages/vite-plugin/README.md) | Finds and validates a deck, compiles MDX slides and serves the `virtual:deck*` modules                        |
| [`@deckster/brand`](packages/brand/README.md)             | The brand schema, resolver, contrast checks and CSS compiler                                                  |
| [`@deckster/kit`](packages/kit/README.md)                 | Layouts and components: code, media, charts, diagrams, mini apps                                              |
| [`@deckster/cli`](packages/cli/README.md)                 | `deck`, the command line                                                                                      |
| [`@deckster/presenter`](packages/presenter/README.md)     | Sidebar, overview, presenter window and the other presenting tools                                            |
| [`@deckster/comments`](packages/comments/README.md)       | Review comments, in the dev server only                                                                       |
| [`@deckster/export`](packages/export/README.md)           | The PDF and PPTX writer and its `--verify` tooling                                                            |
| [`@deckster/shell`](packages/shell/README.md)             | The Electron app behind `deck present`                                                                        |
| [`@deckster/agent`](packages/agent/README.md)             | The deck MCP server, the agent host and the chat panel                                                        |
| [`@deckster/app-bridge`](packages/app-bridge/README.md)   | The `postMessage` protocol between a deck and its mini apps                                                   |

Brands and decks:

| Folder                                       | What it is                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| [brands/default](brands/default/README.md)   | Light, cool grays with a cobalt accent; every deck here uses it                   |
| [brands/nocturne](brands/nocturne/README.md) | Dark and editorial; the tests render decks in it to check they fit both           |
| [decks/hello](decks/hello/README.md)         | The 4-slide starter and the default deck of `deck dev`                            |
| [decks/showcase](decks/showcase/README.md)   | A 45-slide talk about deckster that uses every layout                             |
| [decks/\*](decks/README.md)                  | Six test decks the suites drive, one area of the kit each; run them like any deck |

## Requirements

| For                                 | You need                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything                          | Node 26 or later; pnpm 12.16.1 (fetched by pnpm itself from `devEngines`)                                                                          |
| `shot`, `lint`, `diff`, `export`    | Playwright's Chromium: `pnpm --filter @deckster/cli exec playwright install chromium`                                                              |
| `present`                           | Electron's binary, downloaded once: `pnpm --filter @deckster/shell exec install-electron`. `--browser` opens Chrome or the default browser instead |
| `export --verify`                   | Docker for the LibreOffice and Open XML SDK checks; the `quicklook` and `keynote` renderers are macOS only                                         |
| `diff` against a git ref            | A git repository; otherwise compare with a folder from `deck diff --save-baseline`                                                                 |
| `--agent claude` or `--agent codex` | That CLI installed and signed in; `pnpm deck agent doctor` checks both                                                                             |
| GIFs as looping video               | `ffmpeg` on `PATH`; without it a GIF stays an image and `lint` warns                                                                               |

`deck present` has been checked on macOS with one display only. Several displays, kiosk mode,
Windows and Linux are untested ([docs/present.md](docs/present.md#verified-and-not)).

## Development

`pnpm ready` runs these in order. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs
the same steps, then lints every deck.

| Command          | What it runs                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm check`     | The generated Tailwind tooling stylesheet is current, then format, lint and types (`vp check`), then `jsdoc-lint` |
| `pnpm format`    | `vp check --fix`                                                                                                  |
| `pnpm typecheck` | `tsc --noEmit` at the root and in every package                                                                   |
| `pnpm test`      | Unit tests in every package; a few render in Chromium, and the export checks skip without Docker                  |
| `pnpm test:e2e`  | Browser tests, one package at a time                                                                              |
| `pnpm build`     | `deck build` for every deck                                                                                       |

The browser tests need their own Chromium:
`pnpm --dir packages/engine exec e2e-web install chromium`. Tooling is Vite+ (`vp`); each
package's README covers its internals and the rules for changing it.

## Documentation

| Page                                         | Covers                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| [docs/design.md](docs/design.md)             | Why the framework is built the way it is                |
| [docs/agent.md](docs/agent.md)               | Using the agent panel                                   |
| [docs/agent-design.md](docs/agent-design.md) | How an agent turn runs and what it is allowed to change |
| [docs/present.md](docs/present.md)           | `deck present`, displays and troubleshooting            |
| [docs/deploy.md](docs/deploy.md)             | Hosting built decks                                     |

## Contributing & Security

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, test commands, and pull request guidelines.
- Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
