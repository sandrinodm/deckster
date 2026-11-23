# The brand-layouts deck

A test deck for brand layouts: the four layouts that [`brands/fieldnote/layouts.ts`](../../brands/fieldnote/layouts.ts)
brings, each used at least once, with a few kit layouts between them. It is nine slides about a
street tree survey.

| Slide         | Layout              | Surface (the slide's) | Shows                                                            |
| ------------- | ------------------- | --------------------- | ---------------------------------------------------------------- |
| `title`       | `fieldnote-cover`   | inverse               | Surface-keyed art, fields (`eyebrow`, `byline`, `date`), no logo |
| `what-we-did` | `fieldnote-columns` | default               | Two columns, the `aside` slot, art rules                         |
| `part-one`    | `fieldnote-section` | accent                | A field-bound number, `layers: 'over'` art                       |
| `findings`    | `content` (kit)     | default               | A kit layout between brand layouts                               |
| `planting`    | `fieldnote-photo`   | default               | A media box that bleeds off the edge, a moved page number        |
| `numbers`     | `fieldnote-columns` | inverse               | The inverse art of a surface-keyed layout                        |
| `part-two`    | `fieldnote-section` | accent                | The same layout with another number                              |
| `method`      | `split` (kit)       | default               | A kit layout with a map beside the text                          |
| `closing`     | `fieldnote-cover`   | default               | The paper art of the cover                                       |

```sh
pnpm deckster lint brand-layouts
pnpm deckster shot brand-layouts
pnpm deckster layouts brand-layouts --summary
pnpm deckster export brand-layouts --pptx --dry-run
```

To see the fallback, run `pnpm deckster lint brand-layouts --brand tidewater`, or set `brand` in
[deck.config.ts](deck.config.ts) to `tidewater`: the five brand-layout slides render with their kit
fallbacks (`title`, `content`, `section`, `image`) and `deckster lint` reports `brand-layout-fallback`
for each. The pictures in
[assets/](assets) are drawn illustrations, not photographs.
