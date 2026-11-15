# The showcase deck

"Slides an agent can write": a 45-slide talk about deckster, built with deckster. It uses all 23
kit layouts, every diagram form, ten of the sixteen chart and figure components, code, media, two
live React demos, and slides about the tools around a deck (lint, comments, the agent, the
presenter window, export). Read it as a tour of what a deck can contain, and open the slide files
to see how each part is written.

```sh
pnpm install
pnpm deck dev showcase
```

**The content is illustrative.** Halden, its people, its client organisations and every Halden
number (review rounds, hours, lint findings) are fictional. Each chart of Halden data carries an
"Illustrative data" footnote, and the speaker and quote slides name Halden as fictional. The
portraits and logos are drawn stand-ins, not real people or organisations. Numbers about deckster
itself (layout, chart, diagram and rule counts, terminal output) were read from this repository.
The links, the QR code and the contact addresses use placeholder domains (`deckster.example`,
`halden.example`).

## Commands

Run these from the repository root.

| Command                                    | What it does                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm deck dev showcase`                   | Serve with hot reload                                                                       |
| `pnpm deck lint showcase`                  | Render all 105 steps in Chromium and check them                                             |
| `pnpm deck lint showcase --brand nocturne` | The same in the dark brand                                                                  |
| `pnpm deck shot showcase`                  | One 1920x1080 PNG per slide in `.deck/shots/showcase` (`--steps` for every step)            |
| `pnpm deck build showcase --with-exports`  | Build to `decks/showcase/dist`, with `showcase.pdf` and `showcase.pptx` beside `index.html` |
| `pnpm deck preview showcase`               | Serve that build                                                                            |
| `pnpm deck export showcase`                | Write the PDF and PPTX to `.deck/exports/showcase`                                          |

The deck lints with no problems in both `default` and `nocturne`. Build with `--with-exports` if
you want the PDF button on the `links` slide to work: it is a `<Download file="showcase.pdf">`,
which links to a file only that flag writes. Every build also builds the mini app in
`apps/agent-chat` into `dist/apps/agent-chat/`.

## How it is organised

| Path                                           | Contents                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [deck.config.ts](deck.config.ts)               | Title, brand (`default`), duration (`45m`) and the slide order                                                                                                  |
| [slides/](slides)                              | One file per slide: 42 MDX, 3 TSX (`live-widget`, `chat-demo`, `export-path`)                                                                                   |
| [lib/](lib)                                    | React code the TSX slides import: the counter for `live-widget`, and the scripted agent run (`lib/agent/`) that both `chat-demo`'s poster and the mini app draw |
| [apps/agent-chat/](apps/agent-chat)            | The mini app `chat-demo` shows in an `<AppFrame>`, talking to the deck through `@deckster/app-bridge`                                                           |
| [assets/](assets)                              | Photo, video with posters, Lottie animation, SVGs, portraits and logos; sources and licences in [assets/CREDITS.txt](assets/CREDITS.txt)                        |
| [BRIEF.md](BRIEF.md), [OUTLINE.md](OUTLINE.md) | The audience, outcome and slide-by-slide outline the deck was written from, in the format of the `create-presentation` skill                                    |

## Which slide shows what

The talk opens with five slides, then has four parts, each opened by a `section` divider.

| Slide        | Layout       | Demonstrates                                         |
| ------------ | ------------ | ---------------------------------------------------- |
| `cover`      | `title`      | The cover on the gradient surface                    |
| `speaker`    | `bio`        | Portrait, role and contacts                          |
| `the-claim`  | `statement`  | One sentence on the inverse surface                  |
| `three-ways` | `comparison` | Options with a `recommended` one and true/false rows |
| `agenda`     | `agenda`     | Parts with times                                     |

A slide is a file (`part-file`):

| Slide              | Layout    | Demonstrates                                                                         |
| ------------------ | --------- | ------------------------------------------------------------------------------------ |
| `slide-source`     | `code`    | A fenced block with a title and stepped highlights (`{1-5\|9-11\|7}`)                |
| `canvas`           | `diagram` | `<Svg>`: an imported SVG recoloured to brand roles, revealed by element id, drawn in |
| `layout-contract`  | `cards`   | Cards with icons, revealed one per step (`reveal: true`)                             |
| `limits`           | `table`   | `<Table>` with a highlighted row                                                     |
| `bullets-to-cards` | `code`    | `<CodeMove>`: an animated change between two code states                             |
| `no-styling`       | `default` | `<Step>` reveals in plain Markdown                                                   |
| `kit-numbers`      | `stats`   | A row of four numbers                                                                |

Evidence makes the point (`part-evidence`):

| Slide              | Layout    | Demonstrates                                                                   |
| ------------------ | --------- | ------------------------------------------------------------------------------ |
| `review-rounds`    | `chart`   | `<LineChart>` with a highlight and annotations added by step                   |
| `deck-hours`       | `chart`   | `<Comparison>` and a `<Sparkline>`                                             |
| `where-hours-went` | `chart`   | `<Waterfall>`                                                                  |
| `effort-share`     | `split`   | `<Donut>` beside text                                                          |
| `render-path`      | `diagram` | `<Flow>` with a `<Journey>` stepping through it                                |
| `packages`         | `diagram` | `<Layers>`                                                                     |
| `motion`           | `split`   | A cued `<Video>` with one poster per part, so shots and exports show each part |
| `photo`            | `image`   | A photo edge to edge, with text and caption on a scrim                         |
| `live-widget`      | `demo`    | `<Live>`: a React component running inside a TSX slide                         |

The deck checks itself (`part-checks`):

| Slide           | Layout    | Demonstrates                                                      |
| --------------- | --------- | ----------------------------------------------------------------- |
| `rebrand`       | `code`    | A `diff` fence                                                    |
| `client-brands` | `logos`   | A logo wall                                                       |
| `lint-path`     | `diagram` | `<Flow>` with `<Packet>`s and `<State>` changes                   |
| `lint-session`  | `code`    | `<Terminal>` with `<Cmd>` and `<Out>`, and a `<Lottie>` animation |
| `first-draft`   | `chart`   | `<BarChart>`, sorted, with two bars highlighted                   |
| `title-length`  | `chart`   | `<Scatter>` with a trend                                          |
| `author-loop`   | `diagram` | `<Cycle>`                                                         |

People and agents share it (`part-people`):

| Slide            | Layout     | Demonstrates                                                                                                         |
| ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `roles`          | `team`     | Four portraits                                                                                                       |
| `comment-anchor` | `diagram`  | `<Tree>`, revealed                                                                                                   |
| `agent-turn`     | `diagram`  | `<SequenceDiagram>` with `<Actor>`s and `<Message>`s                                                                 |
| `chat-demo`      | `demo`     | `<AppFrame app="agent-chat">` driven by the slide's steps, with a poster drawn per step; a scripted replay, no model |
| `designer-quote` | `quote`    | A quote with a portrait                                                                                              |
| `presenter`      | `content`  | Text with an `<Aside>`                                                                                               |
| `export-path`    | `diagram`  | A `<Flow>` written in TSX with automatic layout and run-time kind icons                                              |
| `export-share`   | `chart`    | `<Pictogram>`                                                                                                        |
| `week`           | `timeline` | Five milestones                                                                                                      |
| `start`          | `steps`    | Four steps, revealed                                                                                                 |
| `links`          | `split`    | `<Button>`, `<LinkCard>` and `<Download>`                                                                            |
| `recap`          | `chart`    | `<Progress>` bars                                                                                                    |
| `closing`        | `closing`  | QR code and contacts                                                                                                 |

Every slide has speaker notes (`<Notes>`) and a time `budget`. The charts it does not use
(`BigNumber`, `StatRow`, `AreaChart`, `Slope`, `Funnel`, `Heatmap`) are shown in the
`data-stories` fixture deck.

For the smallest possible deck, see [decks/hello](../hello/README.md). The decks the test suites
drive, one per area of the kit, are in [decks](../README.md).
