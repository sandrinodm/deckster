# @deckster/deck-data-stories

Test deck for the chart and number components, told as a support team's review of a year-long
redesign. Each slide states its takeaway in the title and proves it with one component, one
highlight and direct labels. 18 slides, 21 steps. Lumen and every number are fictional.

Run these from the repository root:

```sh
pnpm deck dev data-stories
pnpm deck lint data-stories    # data-stories: no problems in 18 slides (21 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures.

| Slide                                                 | Component                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `scorecard`, `go-live`, `deflection-goal`             | `<StatRow>`, `<BigNumber>`, `<Progress>`                                                               |
| `redesign-effect`, `billing-backlog`, `response-time` | `<LineChart>`, `<AreaChart>`                                                                           |
| `top-reasons`, `wrong-chart`, `right-chart`           | `<BarChart>`, `<Slope>`; the last two show a poor and a good form for the same data (`data/teams.csv`) |
| `channel-mix`, `help-funnel`, `cost-bridge`           | `<Donut>`, `<Funnel>`, `<Waterfall>`                                                                   |
| `self-serve`, `weekly-load`, `speed-satisfaction`     | `<Pictogram>`, `<Heatmap>`, `<Scatter>`                                                                |
| `first-reply`, `plan-choice`                          | `<Comparison>` with `<Sparkline>`, `<Table>`                                                           |

Used by:

- `packages/vite-plugin/e2e/charts.e2e.ts` renders it in both brands and opens slides by number.
- `packages/cli/src/export/chart-equivalence.test.ts` exports its native PPTX charts and compares
  LibreOffice's rendering with the web one. It needs Docker and skips without it.

There are no photos, so no `CREDITS.txt`.
