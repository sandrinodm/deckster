# @deckster/deck-components

Test deck for the kit's code and media components, told as the Larkfield API team's notes on
shipping the canopy API: highlight steps, diffs and word focus in code, `<CodeMove>`, `<Terminal>`,
`<Image>` with a brand treatment, a `<Video>` with step cues, `<Lottie>`, icons and a TSX slide.
7 slides, 18 steps. Larkfield and its endpoints are fictional.

Run these from the repository root:

```sh
pnpm deck dev components
pnpm deck lint components    # components: no problems in 7 slides (18 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures.

| Slide file         | Shows                                                    |
| ------------------ | -------------------------------------------------------- |
| `middleware-order` | A code block with stepped line highlights and word focus |
| `user-or-401`      | A `diff` fence                                           |
| `handler-evolves`  | `<CodeMove>` across three states of one handler          |
| `deploy`           | `<Terminal>` and a `<Lottie>` animation                  |
| `register`         | `<Image>` with a brand treatment, on the `split` layout  |
| `video-cues`       | A cued `<Video>` with one poster per part                |
| `in-tsx`           | A slide written in TSX                                   |

`packages/vite-plugin/e2e/components.e2e.ts` renders it in a dev server.

Asset sources and licences are in [assets/CREDITS.txt](assets/CREDITS.txt): one CC0 photo from
Wikimedia Commons; the video, its posters and the Lottie file were made for this deck.
