# @deckster/deck-apps-demo

Test deck for mini apps: an inline `<Live>` counter, a scripted agent run in an `<AppFrame>`
that the slide's steps drive, and an external page with a poster and a recorded fallback. 4 slides,
7 steps. Nothing calls a model or needs an API key.

Run these from the repository root:

```sh
pnpm deck dev apps-demo
pnpm deck lint apps-demo    # apps-demo: no problems in 4 slides (7 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures.

| Path                                | Contents                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [slides/](slides)                   | `title`, `counter` (TSX, `<Live>`), `agent` (TSX, `<AppFrame>`), `external`                              |
| [apps/agent-demo/](apps/agent-demo) | The mini app the `agent` slide frames, talking to the deck over `@deckster/app-bridge`                   |
| [lib/](lib)                         | The counter and the scripted agent run the slides import                                                 |
| [assets/](assets)                   | `external-poster.png` and `external-fallback.webm`, generated demo UI; see [credits](assets/CREDITS.txt) |

`packages/vite-plugin/e2e/apps.e2e.ts` serves it in both brands and as a production build, and
opens slides by position, so keep the slide order.
