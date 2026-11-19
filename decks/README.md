# Decks

Every folder here is a deck and a workspace package (`@deckster/deck-<name>`), so a new one needs
`pnpm install` before any command works on it. Every `deck` command takes the folder name:

```console
$ pnpm deck lint apps-demo
apps-demo: no problems in 4 slides (7 steps checked).
```

Output goes to `.deck/` at the repository root, so `pnpm deck shot apps-demo` writes
`.deck/shots/apps-demo/`.

## Examples

Three decks are meant to be read and copied:

| Deck                           | What it is                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [hello](hello/README.md)       | The 4-slide starter and the default deck of `deck dev`                                                                                                                                                            |
| [showcase](showcase/README.md) | A 45-slide talk about deckster that uses 23 of 52 layouts                                                                                                                                                         |
| [lookbook](lookbook/README.md) | Every layout and every layout option, every chart, diagram and component, every surface, transition and step effect, told as the launch-day talk of a fictional cargo-bike delivery company; copy a slide from it |

`packages/cli/src/lookbook/lookbook-coverage.test.ts` fails when the lookbook lacks a layout,
layout option, surface, transition, step effect, chart, diagram or component that the catalogs
list, so a change that adds one to the kit adds it to the lookbook too.

## Test fixtures

The other seven decks are test fixtures. Each one exercises one area of the kit in full (every
layout variant, every chart, every diagram form, the code and media components, mini apps, a
brand's own layouts) and the test suites or CI's lint step render it in a browser. They are also
the best place to see a component used for real. Their organisations, people and numbers are
fictional; photo sources are in each deck's `assets/CREDITS.txt` where it has one (`exemplars`,
`layouts` and `components`).

| Deck                                     | Slides | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Driven by                                                                                                                                                                                                                   |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [exemplars](exemplars/README.md)         | 26     | The first six layouts (`title`, `section`, `statement`, `content`, `split`, `stats`) in each variant, on every surface, with the hard cases: a long title, a full list, four stats, a dense split, and a giant statement (`size: giant`)                                                                                                                                                                                                                                                                               | The kit's browser suite (`packages/kit/e2e`, both brands, served through `deck dev`); PDF and PPTX export tests in `packages/cli/src/export/run-export.test.ts`                                                             |
| [layouts](layouts/README.md)             | 124    | Every later layout (`agenda`, `team`, `quote`, `conversation`, `definition`, `voices`, `bio`, `persona`, `cards`, `faq`, `features`, `steps`, `actions`, `exercise`, `comparison`, `pricing`, `do-dont`, `quiz`, `timeline`, `schedule`, `table`, `risks`, `status`, `logos`, `image`, `bento`, `shift`, `gallery`, `before-after`, `proof`, `columns`, `matrix`, `quadrants`, `equation`, `market`, `ask`, `dashboard`, `screen`, `recap`, `sources`, `closing`) in each variant, grouped into eighteen related parts | No suite; CI's lint step only                                                                                                                                                                                               |
| [brand-layouts](brand-layouts/README.md) | 9      | The four layouts `brands/fieldnote/layouts.ts` brings (`fieldnote-cover`, `fieldnote-section`, `fieldnote-photo`, `fieldnote-columns`), each at least once and on more than one surface, with kit layouts between them; set its brand to `tidewater` to see the fallbacks                                                                                                                                                                                                                                              | No suite; CI's lint step only                                                                                                                                                                                               |
| [data-stories](data-stories/README.md)   | 18     | Every chart and number component, each answering one message with one highlight                                                                                                                                                                                                                                                                                                                                                                                                                                        | `charts.e2e.ts` in `packages/vite-plugin` (both brands); `chart-equivalence.test.ts` in `packages/cli`, which exports native PPTX charts and compares LibreOffice's rendering with the web (needs Docker)                   |
| [diagrams-demo](diagrams-demo/README.md) | 13     | Every diagram form: stepped flows, packets, an automatic layout, a sequence diagram, a timeline, layers, a cycle, a tree, an imported SVG and a flow written in TSX                                                                                                                                                                                                                                                                                                                                                    | `diagrams.e2e.ts` in `packages/vite-plugin` (both brands); the PPTX diagram export test in `run-export.test.ts`; `svg-sanitize.test.ts` and `svg-sanitize-dom.test.ts` in `packages/kit`, which read `assets/warehouse.svg` |
| [components](components/README.md)       | 12     | Code and media components: highlight steps, diffs, word focus, `<CodeMove>`, `<Terminal>`, `<Image>`, a cued `<Video>`, `<Lottie>`, icons, a TSX slide, every `<Step>` effect, a `focus` build, a count-up, a per-slide `transition:` and a `<Morph>`                                                                                                                                                                                                                                                                  | `components.e2e.ts` in `packages/vite-plugin`                                                                                                                                                                               |
| [apps-demo](apps-demo/README.md)         | 4      | Mini apps: an inline `<Live>` widget, a scripted agent run in an `<AppFrame>` (`apps/agent-demo`) driven by the slide's steps, an external page with a poster and a recorded fallback; no model or API key                                                                                                                                                                                                                                                                                                             | `apps.e2e.ts` in `packages/vite-plugin` (both brands and the production build)                                                                                                                                              |

CI (`.github/workflows/ci.yml`) lints every deck in this folder with `pnpm deck lint`, and
`pnpm build` builds all of them.

Before changing a slide in a fixture deck, search the suites in the table for its id: they open
slides by id or by position and assert on what they render, so reordering slides can break them too.

Smaller decks that break one lint rule or reproduce one hard case live beside the tests that use
them: `packages/cli/fixtures/decks` (the `rules` deck, the chart, diagram and layout probes, and
decks with one deliberate fault each) and `packages/vite-plugin/e2e/fixtures/decks` (`comments`,
`apps-cases`, `cases`, `bad-layout`). For a deck meant to be read rather than tested, see
[`showcase`](showcase/README.md) or [`lookbook`](lookbook/README.md).
