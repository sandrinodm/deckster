# @deckster/deck-components

Test deck for the kit's code and media components, told as the Larkfield API team's notes on
shipping the canopy API: highlight steps, diffs and word focus in code, `<CodeMove>`, `<Terminal>`,
`<Image>` with a brand treatment, a `<Video>` with step cues, `<Lottie>`, icons, a TSX slide, and
`<Step>` reveals: every `effect`, a `focus` build and a `<BigNumber>` that counts up at its step,
a slide with its own `transition:` and a `<Morph>` across two slides. 12 slides, 31 steps.
Larkfield and its endpoints are fictional.

Run these from the repository root:

```sh
pnpm deckster dev components
pnpm deckster lint components    # components: no problems in 12 slides (31 steps checked).
```

[decks](../README.md) explains which decks are examples and which are test fixtures.

| Slide file         | Shows                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `middleware-order` | A code block with stepped line highlights and word focus                               |
| `user-or-401`      | A `diff` fence                                                                         |
| `handler-evolves`  | `<CodeMove>` across three states of one handler                                        |
| `deploy`           | `<Terminal>` and a `<Lottie>` animation                                                |
| `register`         | `<Image>` with a brand treatment, on the `split` layout                                |
| `video-cues`       | A cued `<Video>` with one poster per part                                              |
| `in-tsx`           | A slide written in TSX                                                                 |
| `rollout-checks`   | A `focus` build of three points, then a `wipe` step                                    |
| `edge-latency`     | A `<BigNumber>` that counts up at its step, and the `fade`, `scale` and `blur` effects |
| `after-launch`     | A `section` slide with `transition: push`, which pushes in and back out                |
| `street-survey`    | The photo in a `<Morph>`, which flies to its place on the next slide                   |
| `street-record`    | The same photo at its new place and size, on the other side of a `split`               |

`packages/vite-plugin/e2e/components.e2e.ts` renders it in a dev server.

Asset sources and licences are in [assets/CREDITS.txt](assets/CREDITS.txt): one CC0 photo from
Wikimedia Commons; the video, its posters and the Lottie file were made for this deck.
