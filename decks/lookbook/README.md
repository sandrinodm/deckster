# @deckster/deck-lookbook

The lookbook: one deck that shows everything the kit can make. Every layout, every option of every
layout, every chart, diagram component and slide component, all four surfaces, all eight slide
transitions, the five `<Step>` effects, `focus`, a count-up and a `<Morph>` pair, each in the forms
worth copying. Open it to see what deckster can do; copy a slide from it to start one of your own.

It tells one story, so it reads as a talk rather than a specimen sheet: Wrenhaul, a fictional
cargo-bike delivery company, on the day it opens its delivery network to every shop and announces
its Series A. [BRIEF.md](BRIEF.md) holds the story bible (people, customers, numbers, voice) and
[OUTLINE.md](OUTLINE.md) lists every slide with the layout, options and capability it shows.
Wrenhaul, its people and every figure are invented.

Run these from the repository root:

```sh
pnpm deckster dev lookbook
pnpm deckster lint lookbook
pnpm deckster lint lookbook --brand nocturne
```

The deck has 208 slides and 435 steps in 12 parts. The slide budgets add up to 144 minutes within
the 149-minute runtime. The fictional forty-minute launch talk selects slides from the lookbook.

## Parts

The slides are grouped by the job a slide does, so the part you need is the one named after your
problem. Slide ids say what the slide shows (`split-photo-left-bleed`, `chart-waterfall`,
`motion-wipe`), and the first line of every slide's speaker notes names its recipe.

| #   | Part                   | What it shows                                                                           |
| --- | ---------------------- | --------------------------------------------------------------------------------------- |
| 1   | Open                   | Covers, agendas, the speaker, divider forms                                             |
| 2   | Say one thing          | Statements, definitions, quotes, a picture across the slide                             |
| 3   | Explain                | Text, pictures, peers, capabilities, questions, processes, exercises, facets and habits |
| 4   | Compare and decide     | Options, plans and prices, a change, a map, four lists, exact values and risk registers |
| 5   | Prove it with a number | Big numbers, nested markets, before and after, a sum, a cost bridge and quiz            |
| 6   | Show the pattern       | Single charts and dashboards: trend, ranking, flow, spread                              |
| 7   | Show how it works      | Diagrams, conversations, code, live demos                                               |
| 8   | Show the product       | Framed screens, galleries, before and after, a morph, video                             |
| 9   | People and proof       | Founders, team, testimonials, personas, logos and case studies                          |
| 10  | Plan ahead and ask     | History, roadmap, status reports, schedules, actions and the ask                        |
| 11  | Motion                 | The five step effects side by side, and focus                                           |
| 12  | Close                  | Takeaways, references, links, a code to scan, the last slide                            |

## Presentation patterns

| When you need to…                                                  | Copy this slide                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Compare retention at the same age since signup                     | [Retention cohorts](slides/chart-retention-cohorts.mdx)          |
| Explain which segments earn the most from their sales              | [Profit pool](slides/chart-profit-pool.mdx)                      |
| Show a company's changing position against peers                   | [Market movement](slides/chart-market-movement.mdx)              |
| Walk through the decisions a product screen supports               | [Product cutaway](slides/product-cutaway.mdx)                    |
| Show ownership and handoffs in a customer journey                  | [Service blueprint](slides/service-blueprint.mdx)                |
| Let the audience pick and replay a product scenario                | [Choose-your-path demo](slides/demo-choose-path.mdx)             |
| Explain a new model through a familiar one and name the assumption | [Pitch by analogy](slides/pitch-analogy.mdx)                     |
| Ask an investment committee for a specific decision                | [Investment committee](slides/investment-committee.mdx)          |
| Connect an opportunity to a measurable test                        | [Opportunity to experiments](slides/opportunity-experiments.mdx) |

### Vision and strategy

| When you need to…                                                   | Copy this slide                                     |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| Follow one customer outcome through three human moments             | [Vision storyboard](slides/vision-storyboard.mdx)   |
| Trace the decisions from a pencil sketch to the shipped design      | [Sketch to ship](slides/sketch-to-ship.mdx)         |
| Explain the dependency between two workstreams                      | [Transit roadmap](slides/roadmap-transit.mdx)       |
| Show which scopes are still uncertain and which are ready to build  | [Uncertainty hill roadmap](slides/roadmap-hill.mdx) |
| Show where to expand and which physical constraint changes the plan | [Opportunity map](slides/opportunity-map.mdx)       |
| Compare competing offers and explain your strategic tradeoff        | [Strategy canvas](slides/strategy-canvas.mdx)       |
| Work backward from an illustrated future to one test                | [Future-back plan](slides/future-back.mdx)          |

The [visual patterns guide](../../skills/create-presentation/references/visual-patterns.md)
includes field shapes, reveal order and source notes for these layouts. The vision storyboard
draws on customer-experience storyboarding, the hill on Basecamp's work-tracking method and the
value curves on the Blue Ocean strategy canvas. [Customer storyboards](https://articles.sequoiacap.com/visualizing-customer-experience) · [Basecamp Hill Charts](https://basecamp.com/shapeup/3.4-chapter-13) · [Strategy Canvas](https://www.blueoceanstrategy.com/tools/strategy-canvas/)

### Product and AI demos

| When you need to…                                             | Copy this slide                                   |
| ------------------------------------------------------------- | ------------------------------------------------- |
| Zoom in on a single decision within its original screen       | [Browser spotlight](slides/browser-spotlight.mdx) |
| Compare two versions of one screen in the same position       | [Version wipe](slides/version-wipe.mdx)           |
| Follow one action from desktop to mobile                      | [Device handoff](slides/device-handoff.mdx)       |
| Preserve the key frames of a workflow                         | [Demo filmstrip](slides/demo-filmstrip.mdx)       |
| Show how a keyboard command changes the working view          | [Command palette](slides/command-palette.mdx)     |
| Let the audience verify a generated answer against its source | [Grounded answer](slides/ai-grounded-answer.mdx)  |
| Show a proposed change and the human review decision          | [Review diff](slides/ai-review-diff.mdx)          |
| Make an agent's actions and approval boundary visible         | [Agent run trace](slides/agent-run-trace.mdx)     |

## What holds it complete

`packages/cli/src/lookbook/lookbook-coverage.test.ts` reads the kit's catalogs and this deck's
slide files and fails with a list of everything the deck does not show yet: layouts, option values,
`reveal: true`, surfaces, transitions, step effects, `focus`, a `<Morph>` pair, charts, diagram
components and slide components. A layout or component added to the kit appears in that list
without editing the test.

```sh
cd packages/cli && pnpm exec vp test run src/lookbook
```

## Pictures

Sources and licences are in [assets/CREDITS.txt](assets/CREDITS.txt). The video and animation
come from the framework's other sample decks. The logo, portraits, product screens, maps and
drawn scenes are made for this deck. Four generated editorial photographs illustrate the
storyboard and the future-back plan. Their subjects and places are fictional. [Picture credits](assets/CREDITS.txt)
