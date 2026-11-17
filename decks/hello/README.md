# The hello deck

The starter deck: four slides, one per brand surface, that show the parts every deck has. It is the
default deck of `deck dev`, `deck preview` and `deck present`, and the engine's browser tests
run against it.

```sh
pnpm install
pnpm deck dev hello
```

Run it from the repository root. It prints the URL (the first free port from 5173, or
`--port <n>`) and reloads as you edit a slide. Press `q` or Ctrl+C to stop.

## The slides

The order comes from `slides` in [deck.config.ts](deck.config.ts).

| Slide          | File                                               | Surface  | Shows                                                                                                   |
| -------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `title`        | [slides/title.mdx](slides/title.mdx)               | gradient | Frontmatter (`title`, `surface`, `budget`) and `<Notes>`                                                |
| `steps`        | [slides/steps.mdx](slides/steps.mdx)               | default  | `<Step at={n}>` reveals, on the `default` layout                                                        |
| `live-counter` | [slides/live-counter.tsx](slides/live-counter.tsx) | accent   | A TSX slide: `frontmatter` as a literal export, `useStep()`, `Step` and `Notes` from `@deckster/engine` |
| `closing`      | [slides/closing.mdx](slides/closing.mdx)           | inverse  | An image imported from [assets/](assets)                                                                |

Only files listed in `deck.config.ts` are slides. To restyle the whole deck, change `brand` there
from `default` to `nocturne`, or pass `--brand nocturne` to a single command.

## Commands

Run these from the repository root.

| Command                   | What it does                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm deck dev hello`     | Serve with hot reload                                                                 |
| `pnpm deck lint hello`    | Render every step in Chromium and report problems with their fix                      |
| `pnpm deck shot hello`    | Write one 1920x1080 PNG per slide to `.deck/shots/hello` (`--steps` for one per step) |
| `pnpm deck build hello`   | Build static files to `decks/hello/dist`                                              |
| `pnpm deck preview hello` | Serve that build                                                                      |
| `pnpm deck export hello`  | Write `hello.pdf` and `hello.pptx` to `.deck/exports/hello`                           |

`deck present` opens a deck in its own desktop window with a presenter view. It needs the Electron
binary, which is downloaded separately: see [docs/present.md](../../docs/present.md).

Each of `dev`, `lint` and `shot` takes `--brand nocturne`. The deck lints without errors in both
brands, with one warning: `closing` has no speaker notes.

```console
$ pnpm deck lint hello
decks/hello/slides/closing.mdx
  warning missing-notes (closing): The slide has no speaker notes.
          Fix: Add a `<Notes>` block saying what the slide proves and what to say, in a sentence or two.

hello: 0 errors, 1 warning in 4 slides (8 steps checked).
```

## Adding to it

`pnpm deck layouts hello --summary` lists the layouts a slide can use, with each one's title
limit, slots and budget. `deck new slide <deck> <id> --layout <name>` creates `slides/<id>.mdx`
from that layout's example and appends the id to the slide list (`pnpm deck new --help`). For a
deck of your own, start a new one with `deck new <name>` rather than editing this one.

## Tests that use it

- The engine's browser suite (`packages/engine`, `pnpm e2e`) starts `deck dev hello --port 5199`
  and drives navigation and steps; `live-counter` carries a `data-testid` for it.
- The CLI's unit tests run `deck layouts hello` and lint hello in Chromium in both brands.
- `agent.e2e.ts` in `packages/vite-plugin` copies hello to a temporary fixture deck for its run.

Change the slides with care: those tests read their text and step counts.

[`decks/showcase`](../showcase/README.md) is a long talk about deckster, and
[`decks/lookbook`](../lookbook/README.md) shows every layout, chart, diagram and component in use.
