# @deckster/deck-layouts

Test deck for every later kit layout in all of its variants (`agenda`, `team`, `quote`,
`conversation`, `definition`, `voices`, `bio`, `persona`, `cards`, `faq`, `features`, `steps`,
`actions`, `exercise`, `comparison`, `pricing`, `do-dont`, `quiz`, `timeline`, `schedule`, `table`,
`risks`, `status`, `logos`, `image`, `bento`, `shift`, `gallery`, `before-after`, `proof`,
`columns`, `matrix`, `quadrants`, `equation`, `market`, `ask`, `dashboard`, `screen`, `recap`,
`sources`, `closing`), told as the Larkfield Urban Forestry Division's annual review. Eighteen parts
group related layouts, each opened by a divider. People and research; cards, features and questions;
processes, actions and exercises; comparisons, pricing, guidance and quizzes; timelines and
schedules; tables, status and risks; galleries and before-after; boards and maps; numbers; and
recap, sources and closing share their respective parts. The team part includes founders, and screen
shows browser, phone and laptop frames. 124 slides, 201 steps, 71 minutes. Larkfield, its people and
partners are fictional.

Run these from the repository root:

```sh
pnpm deck dev layouts
pnpm deck lint layouts    # layouts: no problems in 124 slides (201 steps checked).
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
