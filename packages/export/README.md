# @deckster/export

The PDF and PowerPoint writer behind `deckster export`. It measures a slide that Chromium has rendered,
decides what can be drawn natively, and writes the PDF or the `.pptx` from that. It also holds the
`--verify` tooling that renders a PPTX back to pictures and scores it against the web slide.

The package is internal to deckster: `private: true`, never published, and it exports TypeScript
source. Its one consumer is the CLI (`packages/cli/src/export/` and `deckster diff`).

## Try it

From the repository root, with Playwright's Chromium installed:

```console
$ pnpm deckster export hello --dry-run
PPTX dry run (hybrid mode): native / picture / simplified / dropped
01 title [default]: 2 / 0 / 0 / 0
02 steps [default]: 6 / 0 / 0 / 0
03 live-counter [default]: 5 / 0 / 0 / 0
04 closing [default]: 4 / 0 / 0 / 0
Total: 17 native, 0 picture, 0 simplified, 0 dropped.

$ pnpm deckster export hello
.deck/exports/hello/hello.pdf (4 pages, 4 bookmarks, 0 slide links, 0 external links)
.deck/exports/hello/hello.pptx (4 slides, hybrid mode, masters: default, inverse, accent, gradient, fonts embedded: ...)
.deck/exports/hello/fonts: 5 static TrueType instance(s) in 5 families (...)
```

`pnpm deckster export --help` lists every flag. The ones that reach into this package are `--mode`
(`hybrid`, `native`, `image`), `--outline-text`, `--no-embed-fonts`, `--fonts system`, `--notes`,
`--dry-run` and `--verify`.

Which slides go into an export is the CLI's choice, not this package's: it leaves out slides with
`hidden: true` unless `--include-hidden` is given. With that flag a slide's `PptxSlideInput` has
`hidden: true`, and `buildPptx` writes it with `show="0"`, so PowerPoint skips it in a slide show.

## How an export runs

PPTX, one slide at a time, then once for the deck:

1. `collectScene` (`src/scene/collect-scene.ts`) runs inside the page through `page.evaluate`. It
   records text as the browser laid it out (lines and runs with their fonts), painted boxes,
   gradients, shadows, pictures with crops, inline SVG, tables, media posters, links, the
   `data-chart-spec` and `data-diagram-description` JSON the kit writes, and the hints that force a
   picture.
2. `finishScene` turns that into a `SlideScene` in canvas pixels.
3. `planScene` decides, per node, native or picture for the mode. `hybrid` is native where it is
   faithful; `native` never rasterises and reports what it dropped; `image` is one picture per
   slide with notes and link hotspots.
4. `captureSlide` does steps 1 to 3 and then screenshots what the plan rasterises, fetches the
   original image files and draws the brand's grain as a tile.
5. `buildPptx` writes the OOXML itself: one theme and slide master per brand surface in use, one
   slide layout per layout contract, then the slides with shapes, text, tables, native charts,
   diagrams, notes, links and step animations. Fonts are embedded as static instances cut from the
   brand's variable fonts at the axes the deck uses.

PDF: `printSlide` has Chromium print each slide (and step) as a one-page vector PDF from static
mode, `printNotesPage` draws the optional notes pages, and `assemblePdf` merges them with pdf-lib,
adding bookmarks, page labels, slide-to-slide links, metadata and the structure tree, and storing
identical resources once.

`--verify` runs `validateOoxml` (the Open XML SDK) and the renderers from `detectRenderers`, then
`compareImages` scores each text block, chart, diagram, picture and table region against the web
screenshot and `drawComparison` writes the side-by-side pictures.

## Using it from code

The CLI drives a Playwright page showing the deck in static mode and passes it in. Trimmed from
`packages/cli/src/export/export-pptx.ts`:

```ts
import { buildPptx, captureSlide, outlineFonts, surfaceThemes } from '@deckster/export';
import { Effect } from 'effect';

const exportDeck = Effect.gen(function* () {
  // Once per slide (and per step with --steps), on the same page:
  const slide = yield* captureSlide(page, {
    mode: options.mode,
    placeholderSelectors: placeholderSelectors(contract),
    fieldText: fieldText(target),
    master: masterOf(theme),
    label: `slide ${target.slide.index + 1}`,
    captureTexture: texture,
    captureBackdrop: gradient,
    pictureScale: options.pictureScale,
    outlineText: options.outlineText,
  });
  // slide.scene, slide.plan and slide.assets become one PptxSlideInput.

  // Once for the deck, with every slide's input, the textures and the font plan:
  const result = yield* buildPptx({
    title: opened.deck.config.title ?? options.deck,
    brand: opened.brand.tokens,
    mode: options.mode,
    layouts: contracts,
    slides,
    surfaceTextures: textures,
    animate: options.animate && !options.steps,
    slideIds: opened.page.slides.map((slide) => slide.id),
    outlineFonts: options.outlineText ? outlineFonts(latinFirst(opened)) : null,
    lang: deckLanguage(opened),
    fonts,
  });
  // result.bytes is the .pptx; result.slides has one report per slide.
});
```

Both are `Effect.fn` functions that fail with `ExportError`. `assemblePdf` is a plain async
function.

## Exports

Everything comes from the single entry `@deckster/export` (`src/index.ts`). By area:

| Area     | Main exports                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capture  | `captureSlide`, `fetchEmbedded`, `fetchEmbeddedWithin`                                                                                                               |
| Planning | `planScene`, `EXPORT_MODES`, `planChart`, `plotSvg`, `decodeDiagramDescription`, `isDrawableDiagram`                                                                 |
| PPTX     | `buildPptx`, `surfaceThemes`, `outlineFonts`, `OUTLINE_MIN_SIZE_PX`                                                                                                  |
| PDF      | `printSlide`, `printNotesPage`, `assemblePdf`                                                                                                                        |
| Fonts    | `instanceFonts`, `emptyFontPlan`, `fontUses`, `fontFiles`, `fontsReadme`, `useStaticFonts`, `staticFontsArgs`, `systemFontsStyle`, EOT and embedded-font XML helpers |
| Reports  | `dryRunReport`, `formatDryRun`, `parseSlideSelection` (the `--slides 3,5-9` parser)                                                                                  |
| Verify   | `validateOoxml`, `detectRenderers`, `compareImages`, `drawComparison`, `slideRegions`, `judgeRegion`, `worstRegions`, `dockerStatus`                                 |
| Errors   | `ExportError`, `exportError`                                                                                                                                         |

`collectScene` is not exported: `captureSlide` is the way in.

## Source layout

| Folder         | What is in it                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/scene`    | `collectScene` (in the browser) and `finishScene`                                                             |
| `src/plan`     | `planScene`, chart and text grouping policy                                                                   |
| `src/capture`  | `captureSlide` and the other scripts that run in the page                                                     |
| `src/pptx`     | The OOXML writer: themes, masters, layouts, slides, text, shapes, tables, charts, diagrams, animations, media |
| `src/diagram`  | Reading `data-diagram-description` and routing diagram edges as connectors                                    |
| `src/fonts`    | Font instancing (harfbuzzjs, fontkit), EOT `fntdata`, the PDF's static fonts                                  |
| `src/pdf`      | Printing, notes pages and assembly                                                                            |
| `src/ooxml`    | The zip package and XML helpers                                                                               |
| `src/verify`   | Validator, renderers, image comparison, Docker images                                                         |
| `src/report`   | The `--dry-run` report                                                                                        |
| `src/select`   | The `--slides` list parser                                                                                    |
| `src/vector`   | SVG path parsing for vector shapes                                                                            |
| `src/units.ts` | EMU, points and line spacing                                                                                  |
| `docker/`      | `libreoffice` and `ooxml-validator` images for `--verify`                                                     |

## Tests

```sh
cd packages/export
pnpm exec vp test run                         # all unit tests
pnpm exec vp test run src/pptx/build-pptx.test.ts
```

From the root, `pnpm exec vp run -F @deckster/export test` runs the same suite. A few files launch Playwright's
Chromium (`collect-scene.test.ts`, `capture-slide.test.ts`, `print-pages.test.ts`,
`compare-images.test.ts`, `fetch-embedded.test.ts`); install it once with
`pnpm --dir packages/engine exec e2e-web install chromium`. The export end to end (formats, fonts,
`--verify` scoring) is tested from the CLI in `packages/cli/src/export/`.

## Things to know before changing it

- `collectScene` and every function marked "Runs in the browser; self-contained" are passed to
  `page.evaluate`. They may not import or close over anything: a helper they need goes inside
  their body.
- `captureSlide` turns pseudo-elements into real elements while it measures and marks nodes with
  `data-export-*`. It puts the page back afterwards, also on failure (`releaseScene`). Keep that
  guarantee when you add a capture step, since the same page goes on to the next slide.
- There is no PptxGenJS. The writer needs theme colors, several masters, gradients and connectors,
  which it cannot write. New PPTX features go into `src/pptx` as XML.
- A layout contract's `pptx` mapping (`type`, and `placeholders` of kind `title`, `subtitle` or
  `body` read from a `slot`, a `selector` or a frontmatter `field`) is what makes slide text an
  editable placeholder. See `packages/kit/src/layouts/default-layout.contract.ts`.
- Line spacing follows the single line PowerPoint and LibreOffice both use, 1.2 em. Slide text is
  written as exact `a:spcPts`, master styles as a percentage of 1.2 em. The model is in
  `src/units.ts`; change it there or text drifts between apps.
- The canvas is always 1920x1080. On the 13.333 x 7.5 inch slide one canvas pixel is 6350 EMU.
- `--verify` needs Docker for the validator and the LibreOffice renderers. `ensureImage` builds
  `docker/<name>` on first use and tags it by a hash of the folder, so editing a Dockerfile builds
  a new image. The `quicklook` and `keynote` renderers are macOS only, and `keynote` opens the app,
  so it is never a default.

## License

MIT, see [LICENSE](../../LICENSE).
