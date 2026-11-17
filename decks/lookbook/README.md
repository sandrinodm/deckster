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
pnpm deck dev lookbook
pnpm deck lint lookbook
pnpm deck lint lookbook --brand nocturne
```

The deck has 138 slides in 12 parts and 270 steps. Its slides' `budget:` values add up to 95
minutes 20 seconds, so `deck.config.ts` sets `duration: '100m'`, with five minutes of slack. That
is the lookbook read end to end, not the forty-minute launch talk the story imagines
(`BRIEF.md`), which would use a few slides from each part.

## Parts

The slides are grouped by the job a slide does, so the part you need is the one named after your
problem. Slide ids say what the slide shows (`split-photo-left-bleed`, `chart-waterfall`,
`motion-wipe`), and the first line of every slide's speaker notes names its recipe.

| #   | Part                   | What it shows                                                                                                                                                                                                     |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open                   | The cover with a picture beside or behind the title, a type-only cover, agendas (the plan, the day, where we are now), a speaker with and without a portrait, and the other divider forms                         |
| 2   | Say one thing          | Statements (underlined, centred, giant, as a quote), quotes with and without a portrait, and a picture across the slide with its text at the bottom, left, right or not at all                                    |
| 3   | Explain                | The default and content layouts, text beside a picture, a phone screen or an animation in each ratio, cards, steps and bento grids, with and without builds                                                       |
| 4   | Compare and decide     | Comparisons with winners and a recommended option, a shift from old to new, two-by-two matrices, tables with highlighted rows and columns                                                                         |
| 5   | Prove it with a number | Stats rows, a big number that counts up, before and after, sums built term by term, progress, a pictogram and a sparkline                                                                                         |
| 6   | Show the pattern       | One chart per slide: line, bar, donut, waterfall, area, slope, funnel, table, scatter and heatmap                                                                                                                 |
| 7   | Show how it works      | Flow diagrams with journeys, packets and states, a sequence, layers, a cycle, a tree, a diagram timeline and a drawn map; code with stepped highlights, moves, diffs and a terminal; a mini app and a live widget |
| 8   | Show the product       | Product screens in a browser, phone, laptop or no frame with numbered callouts, two phones side by side, galleries of screens and scenes, a screenshot that morphs between slides, and a cued video               |
| 9   | People and proof       | Founders, a row, a grid and a roster of people, logo walls in one tone and in colour, and case studies with a customer's quote and numbers                                                                        |
| 10  | Plan ahead and ask     | Timelines (a history, a roadmap, a slipped milestone), a board of now, next and later, and the ask                                                                                                                |
| 11  | Motion                 | The same three beats of one drop, set large as statements, with each `<Step>` effect (rise, fade, scale, blur, wipe) and with `focus`                                                                             |
| 12  | Close                  | Link cards, a download, a code to scan, and the closing slide in its two forms                                                                                                                                    |

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
come from the framework's other sample decks; the logo, portraits, customer logos, product
screens, map and the eight illustrated scenes of Wrenhaul at work are drawn for this deck, and
`BRIEF.md` lists what each one shows. The deck has no photographs.
