# @deckster/deck-exemplars

Test deck for the kit's first six layouts (`title`, `section`, `statement`, `content`, `split`,
`stats`): a city forestry team's budget briefing on planting shade where heat hits hardest. Every
layout appears in each of its variants on every brand surface, including the hard cases: a long
title, a full list, four stats and a dense split. An appendix after the recommendation (slides 17
to 26) shows the options of the cover, divider and statement: a cover photo across the whole slide
(`picture: full`), large numerals (`numeral: large`), a divider beside a photo, centred slides
(`align: center`), marked emphasis (`emphasis: underline`) and three giant statements
(`size: giant`): set from the left, centred with emphasis, and a single word. 26 slides, 29 steps.
Larkfield and its people are fictional.

Run these from the repository root:

```sh
pnpm deckster dev exemplars
pnpm deckster lint exemplars    # exemplars: no problems in 26 slides (29 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures. The later
layouts are in [layouts](../layouts/README.md).

Used by:

- The kit's browser suite (`packages/kit/e2e`) serves it once per brand through
  `deckster dev`, and checks slides by position: add slides at the end.
- `packages/cli/src/export/run-export.test.ts` exports it to PDF and PPTX and checks the slide
  count against `deck.config.ts`, and that only the full-bleed cover (slide 17) has pictures: its
  two scrims.
- Channel-name tests in `packages/presenter` and a scratch-build test in `packages/cli` use its
  name only.

Photo sources and licences are in [assets/CREDITS.txt](assets/CREDITS.txt): two CC0 photos from
Wikimedia Commons, plus a heat map drawn for this deck.
