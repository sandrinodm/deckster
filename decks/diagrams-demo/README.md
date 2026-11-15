# @deckster/deck-diagrams-demo

Test deck for the diagram components, told as a platform team walking a new hire through how
their system handles a request, one diagram per slide. 13 slides, 62 steps. Parcelwise and its
systems are fictional.

Run these from the repository root:

```sh
pnpm deck dev diagrams-demo
pnpm deck lint diagrams-demo    # diagrams-demo: no problems in 13 slides (62 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures.

| Slide                           | Diagram                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `request-journey`, `agent-loop` | `<Flow>` with a stepped `<Journey>`                            |
| `order-events`, `card-retry`    | `<Flow>` with `<Packet>`s and `<State>` changes                |
| `service-map`                   | A `<Flow>` placed automatically                                |
| `idempotent-charge`             | `<SequenceDiagram>`                                            |
| `migration-timeline`            | `<Timeline>`                                                   |
| `platform-layers`               | `<Layers>`                                                     |
| `incident-loop`                 | `<Cycle>`                                                      |
| `pricing-tree`                  | `<Tree>`                                                       |
| `warehouse-floor`               | `<Svg>` importing [assets/warehouse.svg](assets/warehouse.svg) |
| `deploy-gates`                  | A flow written in TSX                                          |

Used by:

- `packages/vite-plugin/e2e/diagrams.e2e.ts` renders it in both brands.
- `packages/cli/src/export/run-export.test.ts` exports it to PPTX to check native diagrams.
- `svg-sanitize.test.ts` and `svg-sanitize-dom.test.ts` in `packages/kit` read
  `assets/warehouse.svg`; the deck itself is not needed for them, but the path must stay.

The deck has no photos and no `CREDITS.txt`.
