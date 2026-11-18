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

The deck has 180 slides in 12 parts and 364 steps. Its slides' `budget:` values add up to 122
minutes 35 seconds, so `deck.config.ts` sets `duration: '127m'`, with four minutes of slack. That
is the lookbook read end to end, not the forty-minute launch talk the story imagines
(`BRIEF.md`), which would use a few slides from each part.

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
