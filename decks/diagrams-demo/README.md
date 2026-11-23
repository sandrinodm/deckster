# @deckster/deck-diagrams-demo

Test deck for the diagram components, told as a platform team walking a new hire through how
their system handles a request, one diagram per slide. The [deck configuration](deck.config.ts)
lists the slides in talk order. Parcelwise and its systems are fictional.

Run these from the repository root:

```sh
pnpm deckster dev diagrams-demo
pnpm deckster lint diagrams-demo
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
| `money-path`                    | A `<Flow>` whose nodes pick the `solid` and `outline` cards    |
| `card-reference`                | The five standard cards side by side, one `card` each          |

For a branded handoff, see the [dispatch example](https://github.com/sandrinodm/deckster/blob/be8cc95edb8db522f084f7f8b3a89ef46e9efd5b/decks/diagrams-demo/slides/dispatch-handoff.mdx)
from the diagram design PR. Its two nodes sit on the right, with a dotted connector, a dashed
group outline and a bundled parcel icon. It requires a build with those controls.

Used by:

- `packages/vite-plugin/e2e/diagrams.e2e.ts` renders it in both brands.
- `packages/cli/src/export/run-export.test.ts` exports it to PPTX to check native diagrams.
- `svg-sanitize.test.ts` and `svg-sanitize-dom.test.ts` in `packages/kit` read
  `assets/warehouse.svg`; the deck itself is not needed for them, but the path must stay.

The deck has no photos and no `CREDITS.txt`.
