# @deckster/deck-layouts

Test deck for every kit layout added after the first six, each in all of its variants (`agenda`,
`team`, `quote`, `bio`, `cards`, `steps`, `comparison`, `timeline`, `table`, `logos`, `image`,
`bento`, `shift`, `gallery`, `proof`, `columns`, `matrix`, `equation`, `ask`, `screen`,
`closing`), told as the Larkfield Urban Forestry Division's annual review. Eighteen parts, each
opened by a divider: one per layout, except that quote and bio share one ("Quote and bio"), as do
columns and matrix ("Columns and matrix") and equation and ask ("Numbers"). The team part includes
the founders form (`edge` and `previously`) on two and on four people, and the screen part shows
the browser, phone and laptop frames. 78 slides, 120 steps, 45 minutes. Larkfield, its people and
partners are fictional.

Run these from the repository root:

```sh
pnpm deck dev layouts
pnpm deck lint layouts    # layouts: no problems in 78 slides (120 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures. The first six
layouts are in [exemplars](../exemplars/README.md).

No test suite opens this deck. CI lints it, and `packages/kit/README.md` points to
`slides/cards-principles.mdx` as an example. After changing a layout, lint it in the other brand too:

```sh
pnpm deck lint layouts --brand nocturne
```

Asset sources are in [assets/CREDITS.txt](assets/CREDITS.txt): two CC0 photos from Wikimedia
Commons and a heat map drawn from generated data; the portraits in `assets/people/`, the logos in
`assets/logos/` and the screens of a request service in `assets/screens/` are drawn stand-ins for
fictional people, organisations and software.
