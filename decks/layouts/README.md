# @deckster/deck-layouts

Test deck for every kit layout added after the first six, each in all of its variants (`agenda`,
`team`, `quote`, `bio`, `cards`, `steps`, `comparison`, `timeline`, `table`, `logos`, `image`,
`closing`), told as the Larkfield Urban Forestry Division's annual review. One part per layout,
each opened by a divider. 43 slides, 60 steps, 45 minutes. Larkfield, its people and partners are
fictional.

Run these from the repository root:

```sh
pnpm deck dev layouts
pnpm deck lint layouts    # layouts: no problems in 43 slides (60 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures. The first six
layouts are in [exemplars](../exemplars/README.md).

No test suite opens this deck. CI lints it, and `packages/kit/README.md` points to
`slides/cards-principles.mdx` as an example. After changing a layout, lint it in the other brand too:

```sh
pnpm deck lint layouts --brand nocturne
```

Asset sources are in [assets/CREDITS.txt](assets/CREDITS.txt): two CC0 photos from Wikimedia
Commons; the portraits in `assets/people/` and the logos in `assets/logos/` are drawn stand-ins for
fictional people and organisations.
