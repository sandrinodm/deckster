# Plan: placed elements (shapes and content anywhere on a slide)

Status: proposal, 2026-11-23. Nothing is built. Sections marked "(confirm)" need a decision before
phase 1.

The goal: an author or an agent can put a shape, a text block, or any kit component on a slide at a
named place ("top right", "in the footer, left"), PowerPoint style. A shape has a fill, a border, a
radius, a shadow and optional text or bullets; a text element puts unboxed typography directly on
the slide; a generic placement wrapper holds any Markdown (including lists) or kit component (an
icon, an image, a button, a QR code, a small chart). Placed elements sit outside the layout's slots,
appear on a step if asked, and survive lint, `deckster shot`, PDF and PPTX export like everything
else on the slide.

## 1. What exists today

**The canvas is 1920 by 1080, in canvas pixels.** `CANVAS_WIDTH`/`CANVAS_HEIGHT` are in
`engine/src/canvas/fit-canvas.ts:4,9`. The canvas is scaled with one transform
(`engine/src/canvas/canvas.tsx:62-74`). A rendered slide looks like this
(`engine/src/deck/deck.tsx:146-170`, `kit/src/foundation/slide-parts.tsx:86-92`):

```
div.deck-canvas
  section.deck-slide[data-surface]              (one per slide, absolute, inset 0)
    div.kit-frame[data-layout]
      div.kit-backdrop                          (background layers)
      div.kit-safe                              (absolute, inset = brand margins)
        header.kit-header, div.kit-region …     (slots; .kit-region has container-type: size)
      {bleed}                                   (brand-layout boxes live here, in canvas pixels)
  div.kit-chrome                                (page number, footer, logo, progress; z-index 2)
```

**Content written in MDX goes into slots.** Every top-level element that is not a slot tag or
`<Notes>` lands in `body` (`engine/src/deck/slide-content.tsx:193-215`,
`vite-plugin/src/slides/compile-mdx.ts:263-292`). A `<div style="position: absolute">` written
today is positioned inside `.kit-safe` or a `.kit-region`, not the canvas. It moves with the
region's entrance animation. It also counts against the body budget. On a brand layout without a
`body` region, it is a build error (`vite-plugin/src/slides/slot-usage.ts:100-103`).

**There is no shape, box, callout or sticker component.** No slide-level component takes `x`,
`y`, `position` or `place`. The catalog is `kit/src/components/component-catalog.ts`. Unknown props
on catalog components fail the build (`kit/src/mdx/remark-props.ts`). The closest relatives are
both scoped to their own figure:

- chart `annotations` (`kit/src/charts/chart-catalog.ts:565-632`);
- diagram `col`/`row` placement (`kit/src/diagrams/flow-parts.tsx:41-55`).

**Brand layouts already place boxes in canvas pixels.**

- **Schema:** `brand/src/schema/layout-schema.ts`. It holds the canvas constants, the box as
  `[x, y, w, h]`, `MIN_BOX_SIZE_PX = 40`, and the region fields `align` (horizontal), `anchor`
  (vertical text placement), `type` (type step) and `color` (role).
- **Rendering:** `BrandLayout` in `kit/src/layouts/brand-layout.tsx:316-348` draws the boxes in
  the frame's `bleed`, with `FittedText` for text.
- **Checks:** `deckster brand check` validates them (inside the canvas, minimum size, text
  overlap) in `brand/src/checks/layout-checks.ts:68-91`.

This is the precedent, and the source of a reusable box type.

**Chrome already yields to boxes.** `planChrome` takes `mediaBoxes` and moves page number, footer
and logo off the corners they cover (`kit/src/chrome/chrome-plan.ts:139,198`). It reads them from
compile-time `slideMeta` (`kit/src/chrome/chrome.tsx:168-203`). There is no header in chrome. The
"header" and "footer" a reader means are the brand's margin bands, `spacing.margin.y` tall.

**Brand tokens cover a shape's look.**

- Colours are role variables `--brand-color-<role>`.
- An element with `data-surface="accent"` is fully re-themed with checked colour pairs
  (`brand/src/compile/brand-css.ts:54-100`).
- The shape scales are `--brand-radius-{sm..xl}`, `--brand-stroke-{hairline,regular,bold}` and
  `--brand-shadow-{sm,md,lg}`. Spacing is `--brand-space-*`.
- The grid is `spacing.grid` with `columns` and `gutter` (12 and 32 in the default brand). It has
  no rows.

**Stacking differs between live and static mode.**

- **Live:** every slide is a stacking context (`z-index: 0`/`1` plus `clip-path: inset(0)`,
  `kit/src/motion/motion.css:113-132`). Nothing on a slide can paint above `.kit-chrome`.
- **Static (`?static`, used by shot, lint, PDF and export):** the slide has no stacking context, so
  a high `z-index` could cover chrome in a screenshot and not on stage.

**Lint, export, readiness and comments only see the active `section`.**

- **Lint** (`cli/src/browser/collect-snapshot.ts:50,689`) never measures chrome.
- An **absolutely positioned element with no text or media is treated as decoration** and skipped
  by the overflow rules (`cli/src/lint/rules/elements.ts:25-46`).
- **Contrast** walks ancestors only, so text over a solid sibling box is measured against the wrong
  background (`collect-snapshot.ts:290-313`).
- **PPTX export** measures the DOM and writes a painted box as a native `p:sp` plus a separate text
  box (`export/src/pptx/shape-xml.ts:396-438`, `pptx/frame-xml.ts:67-88`). It knows `rect` and
  `roundRect` but no ellipse.
- **PPTX chrome:** slide-written chrome goes after all slide shapes, so it is on top
  (`export/src/pptx/slide-xml.ts:480`). Chrome inherited from the layout sits below them.
- **Rotation** makes an element a picture in hybrid export (`export/src/scene/collect-scene.ts:565-576`).

**The design doc sets two constraints.** `docs/design.md`: "Slides hold no raw colors, fonts or
pixel positions", and "Agents are reliable with grid cells and unreliable with pixel coordinates."
The showcase deck lists "placing boxes" as wasted effort. Placed elements must not turn slides back
into hand-placed collages.

## 2. The approach in one paragraph

Three kit components: `<Shape>` (a styled geometric shape — rectangle, square, circle, ellipse,
pill, diamond or triangle — with optional text or lists), `<Text>` (unboxed floating text for
labels, captions, stamps and footers) and `<Place>` (positions any Markdown block, list, `<Icon>` or
other kit component). They are placed by name or by grid cell, in a zone of the slide (the safe
area, the whole canvas, the header band or the footer band). They are styled only with brand tokens
and surfaces.

- **Build:** the MDX compiler lifts them out of the slot flow into a reserved layer and records
  their placement in `slideMeta`, so they never count against a slot and work on every layout.
- **Render:** the engine draws that layer inside the slide section, after the layout, in canvas
  coordinates. One pure resolver turns placement props plus the brand's margins and grid into a
  canvas rect. The rect is written on the element (`data-placed-rect`).
- **Tooling:** chrome yields to boxes in its corners, the same way it yields to bleeding media.
  Lint gains rules for what placed boxes can break. PPTX export writes each `<Shape>` as one native
  shape with its text/bullets inside and each `<Text>` as a native text box.

Why three primitives instead of separate tags for `<Rectangle>`, `<Square>`, `<Circle>`, `<Ul>`,
`<Li>` or a placed `<Icon>`: placement is orthogonal to content. Existing kit components (`<Icon>`,
`<Image>`, `<QR>`, `<Button>`, `<Svg>`) and standard MDX Markdown (including `-` bullet lists) work
directly inside `<Place>` (and text/lists inside `<Shape>` and `<Text>`), while geometric variants
share the exact same props on `<Shape>`. That keeps `deckster components --json` and prop validation
compact for agents.

## 3. Decisions

### 3.1 How a place is named (confirm)

**Recommended:** named positions and grid cells, plus a pixel box as a documented escape hatch.

```mdx
<Shape place="top-right" width={4} surface="accent" radius="md">
  New in 0.9
</Shape>

<Shape shape="circle" place="top-left" width={2} surface="accent" align="center" anchor="center">
  01
</Shape>

<Shape cols="2-5" rows="5-6" fill="surface" border="accent" stroke="bold">
  Three of five teams cut review time by half.
</Shape>

<Text place="bottom-right" zone="footer" type="caption" color="muted">
  Source: Q3 customer survey, n = 412
</Text>

<Place place="bottom-left" zone="footer">
  <Icon name="lucide:lock" /> Confidential
</Place>

<Place cols="9-12" rows="2-4">

- First takeaway
- Second takeaway

</Place>

<Shape box={[1520, 80, 320, 120]} fill="muted">
  Imported from the template
</Shape>
```

**Named place** (`place`): `top-left`, `top`, `top-right`, `left`, `center`, `right`,
`bottom-left`, `bottom`, `bottom-right`. The box hugs that point of its zone, optionally pulled
inward with `inset` (a spacing token, such as `inset="md"`).

**Size:**

- `width` in grid columns (`width={4}`), or a size word (`sm`, `md`, `lg`) that maps to columns.
- Height follows the content, up to a cap. Text steps down to fit, then is flagged.
- `height` in rows when a fixed height is wanted.

**Grid cell** (`cols`, `rows`): inclusive 1-based ranges, `cols="9-12" rows="1-2"`.

- Columns are the brand's `spacing.grid` inside the safe area.
- Rows come from a new optional `spacing.grid.rows`, default 6, with the same gutter. 6 rows on
  1080 minus margins gives about 140 px per row, which is the unit diagrams already use for
  cells.

**Pixel box** (`box={[x, y, w, h]}`): the brand-layout box type, in canvas pixels.

- It exists because imported PowerPoint content and exact template matches need it.
- Lint reports it at `info` level with the nearest named place or cell as the suggestion, so agents
  are steered back to names.
- _Why not pixels only:_ the design doc's two rules above, and slides that keep working when the
  brand's margins change.
- _Why not named places only:_ the user asked for "anywhere", and the brand importer will want
  `box`.

All forms are literals: placement props must be string, number or array literals in MDX, like
diagram props. The compiler can then read them into `slideMeta` (3.4) without running the slide.
A TSX slide passes the same props, and its placements are read from the rendered element instead
(phase 1 checks that chrome still yields there).

Names already in use keep their meaning:

- `at` stays the step prop.
- `align` and `anchor` mean horizontal and vertical text placement inside the box, as in brand-layout
  regions.
- `type` is a type step and `color` a role.

### 3.2 Header, footer and chrome: chrome yields (confirm)

`zone` picks the frame a place is measured in:

- `safe` (default): inside the brand margins;
- `canvas`: the full 1920 by 1080, for full-bleed;
- `header`: the top margin band;
- `footer`: the bottom margin band.

**Recommended:** a placed element never paints over chrome. Chrome yields instead: the chrome plan
gets the placed boxes as occupied boxes (the `mediaBoxes` input it has today), and moves or hides
the page number, footer text or logo in a corner a box covers. Reasons:

- **Live mode:** chrome is above the slide whatever the z-index (1).
- **Comments:** they hit-test chrome first.
- **PPTX:** slide-written chrome is drawn last.

Painting over chrome would need changes in all three and would still differ between live and
static. Yielding needs a new input to `planChrome` and one lint rule.

Static mode gets `isolation: isolate` on `.deck-slide`, so a screenshot stacks the way the stage
does.

### 3.3 Scope of v1: per slide only (confirm)

**v1 is per slide.** Out of v1:

- **Deck-wide placed elements**, such as a "DRAFT" stamp or a confidential label on every slide.
  They belong in `deck.config.ts` and would share the same layer and resolver.
- **Brand-level shape presets** (`brand.shapes.callout`, used as `<Shape preset="callout">`).
  They fit "a brand is data" and are phase 4.
- **Placed elements inside a brand layout's own `layouts.ts`.** Those are regions today.

Nested use: a `<Place>`, `<Shape>` or `<Text>` with placement props inside a slot, a list or another
component is a build error naming the fix ("move it to the top level of the slide"). Placement is
only meaningful against the slide. A `<Shape>` or `<Text>` _without_ placement props is an ordinary
inline block and may appear anywhere.

Wrapping in `<Step>` is not needed: all three components take `at` and `effect` like other kit
components (`useStepAt`). A top-level `<Step>` around a placed element is unwrapped by the compiler
into `at` with the step's effect.

### 3.4 Caps (confirm)

Placed text sits outside every slot, so slot budgets never count it. **Recommended caps**, overridable
by a layout contract and tightenable by a brand:

- **Count:** at most 4 placed elements per slide; lint `placed-count` is an error at 5 and more.
- **Words:** at most 25 words of text per placed element and 40 for all of them on a slide
  (`placed-words`, a warning).
- **Size:** a placed element covers at most 35% of the safe area unless `zone="canvas"`
  (`placed-size`, a warning: a box that big is a layout, so the fix names one).

These keep placed elements to callouts, badges, stamps and labels. An argument still lives in the
layout.

### 3.5 Components and styling: tokens and surfaces only

**`<Shape>`** draws a geometric container styled only from brand scales:

| Prop                               | Values                                                                         | Maps to                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shape`                            | `rect` (default), `square`, `ellipse`, `circle`, `pill`, `diamond`, `triangle` | geometry; `square` and `circle` lock a 1:1 aspect ratio from `width` (or `height`), `pill` sets full radius, and all map to native OOXML `prstGeom` (`rect`, `roundRect`, `ellipse`, `diamond`, `triangle`) |
| `surface`                          | `default`, `inverse`, `accent`, `gradient`                                     | `data-surface`: fill, text and every colour pair re-themed and contrast-checked by the brand                                                                                                                |
| `fill`                             | a role (`surface`, `muted`, `accent`, …) or `none`                             | `--brand-color-<role>`, when the box stays on the slide's surface                                                                                                                                           |
| `border`, `stroke`                 | a role; `hairline`, `regular`, `bold`                                          | `--brand-color-<role>`, `--brand-stroke-*`                                                                                                                                                                  |
| `radius`                           | `none`, `sm` … `xl`, `full`                                                    | `--brand-radius-*`; ignored on `ellipse`, `circle`, `diamond`, `triangle`                                                                                                                                   |
| `shadow`                           | `none`, `sm`, `md`, `lg`                                                       | `--brand-shadow-*`                                                                                                                                                                                          |
| `padding`                          | a spacing token                                                                | `--brand-space-*`                                                                                                                                                                                           |
| `type`, `align`, `anchor`, `color` | as brand-layout regions                                                        | type step, text alignment, vertical anchor, text role                                                                                                                                                       |

**`<Text>`** places unboxed text directly on the slide (labels, captions, stamps, footers, big
numbers) without shape chrome (`fill`, `border`, `shadow`, `radius` or `padding`). It takes the
placement props plus `type`, `align`, `anchor` and `color`.

**`<Place>`** is the unstyled positioning wrapper for any other content: existing kit components
(`<Icon>`, `<Image>`, `<QR>`, `<Button>`, `<Svg>`, mini charts) or Markdown blocks (paragraphs,
headings, `-` bulleted or numbered lists).

There are no raw colours or pixel sizes. On `<Shape>`, `surface` is the recommended way to colour a
box, because the brand already checks its text colours. `fill` with a role that fails contrast
against the text role is a build error, using the same pair table as brand checks.

Text and Markdown lists (`<ul>`/`<ol>`/`<li>`) inside `<Shape>` and `<Text>` use `FittedText` (as
brand-layout regions do): content steps down to 0.7 and is then clipped and flagged with
`data-fit="overflow"`, which `text-truncated` reports. Lists inside `<Shape>`, `<Text>` or `<Place>`
take the brand's list styling and spacing tokens.

Out of v1: lines, arrows and connectors (they need endpoints, not boxes), rotation (it rasterises
in PPTX), and free SVG paths. `<Svg>` inside `<Place>` covers custom art.

### 3.6 Export

- **PDF and PNG** need nothing: they print and screenshot the static page.
- **PPTX:**
  - Write a `<Shape>` as one `p:sp` with a `txBody`, not a box plus a separate text box, so it
    moves and edits as one object in PowerPoint. The shape carries `data-export-shape`; the scene
    collector keeps its text (including Markdown bullet/numbered lists as native PowerPoint bullet
    paragraphs) as the shape's body.
  - Write a `<Text>` as a native text box (`p:sp` with `txBox="1"`, no fill or stroke) using the
    same `txBody` path.
  - Add `ellipse`, `diamond` and `triangle` geometries next to `rect` and `roundRect` in
    `shape-xml.ts` (`square` exports as `rect`/`roundRect`, `circle` as `ellipse`, `pill` as
    `roundRect` with full radius).
  - Name shapes from an optional `name` prop, or "Callout 1", "Callout 2" ("Text 1" for `<Text>`).
  - Placed items are written after the layout's shapes and before slide chrome, which matches the
    stage because chrome yields.
  - Inherited layout chrome is checked too: a slide whose placed boxes cover a corner writes its own
    chrome (as a slide with background layers does today, `slide-xml.ts:458-470`).

## 4. Framework design

**Compile** (`vite-plugin/src/slides/compile-mdx.ts`, `slot-usage.ts`):

- `wrapForLayout` routes top-level `<Shape>`, `<Text>` and `<Place>` elements with placement props
  into a reserved `placed` slot. They then never reach `body`, never count against budgets, and
  never trip the brand-layout body check.
- Placement props are validated (literal, known names, ranges inside the grid, `box` inside the
  canvas and at least `MIN_BOX_SIZE_PX`) with fixes.
- `slideMeta.placed` records `{ place|cols/rows|box, zone, width, height, aspect }` for each element.

**Resolver** (`kit/src/place/resolve-place.ts`, pure): placement plus `{ margin, grid, rows }` from
the brand gives a canvas rect for fixed sizes, or an anchor point plus max size for content-sized
boxes. Unit tests cover:

- every named place in every zone;
- grid edges;
- gutters;
- `inset`;
- a brand with odd margins.

`brand/src/checks/layout-checks.ts` reuses its box checks.

**Layer** (engine, `engine/src/deck/slide-frame.tsx`):

- `SlideFrame` renders the `placed` slot in `div.deck-placed` after the layout, inside
  `section.deck-slide`: absolute, inset 0, `pointer-events: none` with `auto` on its children.
- Because it lives in the engine, every layout gets it, kit, brand and custom alike, including TSX
  slides and `SlideView` (sidebar thumbnails and the presenter's next slide).
- Being inside the section is what keeps readiness, source stamps for comments, lint and export
  working without new plumbing.

**Components** (`kit/src/place/`):

- `Place`, `Shape` and `Text` are registered in `kit/src/runtime.ts` and `COMPONENT_INFOS`, with
  `useWhen` and `avoid` that steer agents to layouts first (and clarify that icons, media and
  Markdown lists go inside `<Place>` rather than dedicated tags).
- They set `data-placed`, `data-placed-rect`, and `data-export-shape` (for `<Shape>`) or
  `data-export-text` (for `<Text>`).
- They take `at` and `effect` and use `useEnter` for the slide entrance, so they animate on their
  own, not with a region.

**Chrome** (`kit/src/chrome/chrome-plan.ts`): `planChrome` takes `placedBoxes` next to `mediaBoxes`;
`useChromeLook` reads them from `slideMeta.placed` through the resolver.

**Agents:**

- `deckster components --json` lists all three components (`Place`, `Shape`, `Text`).
- `current_slide` includes the slide's placed elements, with their place and rect.
- The `create-presentation` skill gets a short section: when a placed element is right (a badge, a
  stamp, a callout on a chart, a label in the footer) and when it is a sign the slide needs another
  layout.

## 5. Lint

| Rule                                          | Severity                | Checks                                                                                                             |
| --------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `placed-off-canvas`                           | error                   | a placed rect leaves its zone or the canvas; covers empty shapes, which the decorative rule skips today            |
| `placed-covers-text`                          | error                   | a placed box (`<Shape>`, `<Text>` or `<Place>`) intersects slot text glyphs, as `text-overlap` does for text pairs |
| `placed-chrome`                               | warning                 | a box covers a corner whose chrome was moved or hidden for it; lint starts measuring `.kit-chrome` items           |
| `placed-count`, `placed-words`, `placed-size` | error, warning, warning | the caps in 3.4                                                                                                    |
| `placed-pixels`                               | info                    | a `box` in pixels, with the nearest named place or cell                                                            |

Contrast keeps working without a change: text inside a `<Shape>` walks to the shape as its ancestor
(carrying the fill or surface), and `<Text>` walks to the slide's surface background. Elements with
`data-placed` are never treated as decoration.

## 6. Phases

### Phase 0: spike (one agent, half a day)

Put one raw absolutely positioned box in a hand-written `deck-placed` layer on:

- a kit layout slide;
- a brand-layout slide;
- a TSX slide.

Then compare:

- live against `deckster shot`, with and without `isolation: isolate`;
- what `deckster lint` reports;
- what `deckster export --pptx` writes.

Also confirm that a box inside `.kit-region` uses the region as its containing block. The design
does not depend on it, but it decides the nested-use error message. Output: a short note and
screenshots that settle 3.2.

### Phase 1: framework (parallel, split by package)

- **compile (vite-plugin):** reserved slot, literal checks, `slideMeta.placed`.
- **engine:** the layer, and static-mode isolation.
- **kit:**
  - the resolver (including 1:1 aspect lock for `square` and `circle`);
  - `Place`, `Shape` and `Text` (with `FittedText` and Markdown list support);
  - catalog entries;
  - chrome `placedBoxes`;
  - `spacing.grid.rows` in the brand schema with its default.

### Phase 2: lint and export

The rules in 5, chrome measurement in the snapshot, PPTX single-shape text (including bullet lists in
`txBody`), native `<Text>` text boxes (`txBox="1"`), `ellipse`/`diamond`/`triangle` geometries,
names, and chrome order.

### Phase 3: docs, decks and skills

- **Lookbook:** a section with every place, zone, cell, shape geometry, `<Text>` and `<Place>`
  (icons and lists).
- **Showcase:** two slides that use a callout and a footer label.
- **Docs:** `docs/design.md` (why placed elements are capped), README, the `create-presentation`
  skill and its evals.
- **Docs site, with the release:** a component page for each (`check:coverage` requires it once the
  data has them) and a write-slides guide.

### Phase 4: later

- Brand shape presets.
- Deck-wide placed elements.
- Lines and arrows between placed boxes and slot content.
- Drag to move in `deckster dev`: the comments capture layer already hit-tests and maps viewport
  points to canvas pixels, and source stamps give the file and line. A move would snap to a named
  place or grid cell and rewrite that prop. It needs the first dev-server endpoint that writes a
  slide file, which deserves its own security review.

## 7. Risks

- **Slides become collages.** This is the main risk, given the framework's premise. It is
  mitigated by the caps in 3.4, by named places over pixels, by catalog guidance, and by lint
  suggesting a layout when a placed box is large.
- **Brand changes move boxes.** Named places and cells follow the brand's margins and grid, by
  design. Pixel boxes do not, and `placed-off-canvas` catches the ones that end up outside.
- **Content-sized boxes and fitting.** A box whose height follows its text can grow into slot text.
  `placed-covers-text` catches it, and a fixed `height` stops it.
- **Two stacking models.** Isolating the slide in static mode must not change existing screenshots:
  phase 0 diffs every published deck with `deckster diff` before and after.
