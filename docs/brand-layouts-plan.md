# Plan: layouts that come with a brand

Status: implemented locally on 2026-11-18 (uncommitted). Where the plan and the code differ, the
code is right.

The goal: take a PowerPoint template (`.pptx` or `.potx`), a Keynote file or a Google Slides deck,
turn it into a brand as `brand-import` does today, and also turn every layout under its slide
masters into a layout that decks on that brand can use with `layout: <name>`.

## 1. What exists today

**A brand is tokens only.** `Brand` (`packages/brand/src/schema/brand-schema.ts:25`) has color,
typography, shape, spacing, logo, icons, imagery, chrome, motion, code, diagram and charts. It
has nothing for layouts. Decoding rejects unknown keys (`decode-brand.ts:43`). During agent turns
`brand.ts` must stay a static literal with at most one import (`static-module.ts`,
`code-gate.ts:183`), so a brand cannot ship components.

**Each layout is two pieces with the same name.**

- A Node contract, `LayoutContract` (`packages/engine/src/contract/layout-contract.ts:351`). It
  holds the schema, slots, budget, variants, title, default surface, example and `pptx` mapping.
  It is collected in `@deckster/kit/catalog`.
- A React component, registered by `definePlugin({ layouts })` in `@deckster/kit/runtime`.

`layouts.test.ts` checks that the two lists agree. Names are kebab-case: `KEBAB_CASE_PATTERN` is
enforced by `checkContract` and by the `layout:` frontmatter schema.

**Only engine and kit layouts load.**

- `loadLayoutCatalog()` (`packages/vite-plugin/src/layouts/load-layout-catalog.ts:48`) takes extra
  catalogs; a later catalog replaces a layout with the same name.
- The Vite plugin accepts `layoutCatalogs` and `runtimePlugins`, but only an e2e fixture passes
  them (`packages/vite-plugin/e2e/fixtures/layouts`).
- Every CLI path calls `loadLayoutCatalog()` with no arguments:
  - `packages/cli/src/lint/run-lint.ts:170`
  - `packages/cli/src/layouts/list-layouts.ts:230`
  - `packages/cli/src/export/run-export.ts:199`
  - `packages/cli/src/scaffold/new-deck.ts:76`
  - `packages/cli/src/scaffold/new-slide.ts:68`
  - `packages/vite-plugin/src/slides/slide-meta.ts:45`, which also ignores the plugin option.

**The canvas is a fixed 1920 by 1080.** Kit layouts are CSS grid on `--brand-*` variables.

**The importer reads masters and layouts, but not enough of them.** `extract_pptx.py:882-973`
records, for each layout:

- name, type and master
- background
- direct placeholders, with `type`, `idx`, bbox and the level 1 text style
- pictures
- `show_master_shapes` and `used_by`

The output is advisory. `brand-draft.json` `layouts[]` only maps source pages to kit layouts
(`maps_to`, `override_needed`), and `emit_brand.py` never reads it. These gaps stand between it
and "import every layout":

| Gap                                                                                           | Where                            |
| --------------------------------------------------------------------------------------------- | -------------------------------- |
| `analyze` drops layouts no slide uses                                                         | `brand_tools.py:674`             |
| Layouts are never rendered; only slides get page images                                       | `extract_pptx.py` `render()`     |
| A template with no slides has no page images, so the skill hits its "no images, stop" step    | `SKILL.md:125`                   |
| Layouts are keyed by name, so same-named layouts under two masters collide                    | `extract_pptx.py:966, 971, 1356` |
| Decorative shapes, lines, groups and text boxes on masters and layouts are lost               | `extract_pptx.py:908-916`        |
| A layout's `clrMapOvr` is ignored                                                             | `extract_pptx.py` layout loop    |
| Placeholders keep only `type` and `idx`: no name, size, orientation or prompt text, no groups | `ph_of`, `extract_pptx.py:268`   |
| Only the level 1 text style is kept                                                           | `extract_pptx.py:970`            |
| `.potx` is neither mentioned nor tested; `.key` is refused                                    | `SKILL.md:62-70`, around `:833`  |

**PPTX export builds its masters from nothing** (`packages/export/src/pptx/layout-specs.ts`). It
writes one master per surface. Its layouts come from `contract.pptx`, which has six layout types
and three placeholder kinds. A contract without `pptx` exports as `blank`. Nothing reads a
template.

## 2. The approach in one paragraph

An imported layout is **data in the brand**, not code. Each one is a named list of boxes in canvas
pixels, and each box is bound to the title, a slot or a field. It also names a type step, an
alignment and a surface, plus optional artwork layers for its decoration. One generic kit
component, `BrandLayout`, draws any such spec. A small function turns a spec into a normal
`LayoutContract`, and the Node catalog and the browser registry both use it. Lint, `deckster layouts`,
`deckster new slide`, budgets, overflow checks and export then work on brand layouts with no special
cases.

The importer's job becomes extraction plus emission. It reads every master layout, renders its
artwork without the placeholders, maps the placeholders to boxes, and writes the specs and art
files into the brand folder.

**The cost.** Brand layouts are boxes in fixed positions. They have none of the variants, density
rules, bleed logic or content-aware sizing that hand-written kit layouts have. A brand layout
looks like the template; a kit layout adapts to its content. The plan keeps both: brand layouts
add to the kit catalog and never replace it (see 3.2).

## 3. Decisions

### 3.1 Where the specs live: a sibling `layouts.ts` (confirm)

Recommendation: `brands/<name>/layouts.ts` with `export default defineBrandLayouts([...])`.
`loadBrand` loads it through `gatedLoad(file, text, callee)` with `defineBrandLayouts` as the
callee, as `brand.ts` is loaded with `defineBrand`. The agent gate therefore covers it, because
the gate works per file inside a held folder. `loadBrand` decodes the file with its own schema and
adds the result to `BrandTokens` as `layouts`. The art lives in `brands/<name>/layouts/`.

The reason is size. A template with 20 layouts at 5 to 8 boxes each is 600 or more lines, which
would swamp `brand.ts`. Keeping them apart also keeps token diffs and layout diffs separate. The
alternative is a `layouts` key in `brand.ts`: one file and one decode, but a much longer file.

A spec looks like this:

```ts
import { defineBrandLayouts } from '@deckster/brand';

export default defineBrandLayouts([
  {
    name: 'title-photo',
    label: 'Title with Photo', // the name in the source template
    description: 'Cover with the title on the left and a full-height photo on the right.',
    fallback: 'image', // the kit layout used when this brand is not active
    surface: 'default',
    background: [{ file: 'layouts/title-photo.svg', fit: 'cover' }], // BackgroundLayers
    title: { box: [120, 420, 860, 260], type: 'display', align: 'start', anchor: 'end' },
    regions: [
      { bind: { field: 'eyebrow' }, box: [120, 340, 860, 60], type: 'label' },
      { bind: { slot: 'body' }, box: [120, 700, 860, 200], type: 'lead' },
      { bind: { slot: 'media' }, box: [1040, 0, 880, 1080], fit: 'cover' },
    ],
    chrome: { pageNumber: [1700, 1000, 120, 40], logo: false },
    source: { file: 'template.potx', master: 1, layout: 'Title with Photo' },
  },
]);
```

- `box` is `[x, y, width, height]` in canvas pixels.
- `type` is a brand type step, so imported layouts follow the brand's type scale.
- `anchor` is the vertical alignment.
- `source` records where the layout came from, for re-imports and a later template export
  (3.6).

### 3.2 Names and clashes: plain kebab names, a clash is an error (confirm)

Names must be kebab-case. That rules out a `brand/name` or `brand:name` namespace without changing
the frontmatter schema, `data-layout`, suggestions and scaffolding.

Recommendation:

- A brand layout has a plain kebab name, such as `title-photo` from "Title with Photo".
- A name that clashes with an engine or kit layout fails `deckster brand check`, with the fix "rename
  it". When the kebab form of a source name clashes (a source "Title" becomes `title`), the
  importer prefixes the brand name: `acme-title`.
- Brand layouts never replace kit layouts, so a deck that already works keeps working when its
  brand gains layouts.

**Re-importing a deckster export.** Eval cases 7 and 8 re-import deckster's own exports, whose
layouts are named after kit layouts. The importer should detect a deckster-made package and import
no layouts from it, because those layouts are the kit's. The export should stamp itself in
`docProps/app.xml` if it does not already. Those evals must keep passing unchanged.

**Later:** a deliberate override (`replaces: 'title'`) that lets a brand restyle a kit layout for
every deck. It needs a compatibility rule (same required slots and fields), so it is kept out of
v1.

### 3.3 Switching brands: fall back, and lint says so

Today an unknown `layout:` is a build error. A deck that moves from brand A to brand B would then
break on every slide that used one of A's layouts.

Recommendation: follow the diagram-card rule in `design.md`.

**How a slide falls back.**

- The active brand may not have a layout that another brand in the workspace has. The slide then
  renders with that layout's `fallback` kit layout.
- The swap happens in Node at build time, in the slide transform, like `withLayoutSurface`. Only
  the layout names the deck's own slides use are looked up, in the `layouts.ts` of each brand
  (static data; `listBrands` exists).
- The built deck contains only the kit name. No other brand's layout names, labels or brand names
  reach the browser or a published build.
- `deckster lint` reports `brand-layout-fallback` locally, naming the brand the layout came from and
  the fallback used.
- Two brands may define the same name with different fallbacks. That is an error naming both;
  the fix is to rename one.
- A name that no brand defines stays the error it is today.

**Compatibility runs both ways.** A slide that is valid on its brand layout must also be valid on
the fallback.

- A brand layout may only bind the slots and fields its fallback has.
- It must bind every slot and field its fallback requires, and the generated contract copies
  which of them are required.
- If the fallback requires a title, the brand layout has one (`title: false` is then an error).
- `deckster brand check` rejects a layout that breaks any of these rules. The fix names the
  fallback's slots and the closest kit layouts that would fit.

### 3.4 Budgets: borrowed from the fallback

`design.md` says budgets count content and do not depend on the brand. Budgets worked out from box
sizes would break that.

Recommendation: a brand layout takes its fallback's budget, and the generated contract copies it.
The spec may set tighter counts explicitly (`budget: { body: { maxWords: 25 } }`), and the
importer may suggest them from box area. They stay counts, written into the file and reviewed by
the agent. Whether the content fits stays the job of the overflow rule, which already measures the
DOM.

### 3.5 Artwork: rendered from the source first, native shapes later (confirm)

A layout's decoration (stripes, corner marks, photos, fixed text such as "Confidential") is the
reason people want their template's layouts. There are two ways to carry it.

- **A: render.** Build a probe file with one slide per layout and its placeholders removed.
  Render it with the renderer the importer already uses (LibreOffice, or Keynote on macOS), then
  convert each page to SVG (`pdftocairo -svg`) or PNG. This works for every source format and
  keeps everything the renderer draws. Its text is outlined and its colors are fixed, so the art
  does not follow a surface change.
- **B: native.** Translate simple DrawingML (rect, roundRect, ellipse, line, solid and gradient
  fills, pictures) into SVG in the importer, with colors as brand roles. The art then recolors per
  surface and can later export as native PowerPoint shapes. It only works for PPTX-family sources
  and only for shapes it understands.

Recommendation: A for v1, with B as a later improvement that replaces A shape by shape. Whether
the art can come out transparent, without the slide background, is a Phase 0 question. If it
cannot, the art includes the background and the surface declares the `bg` it reads as. That is
already required for picture layers (`checkPictureBackgrounds`).

Because rendered art has fixed colors, `background` may be keyed by surface
(`background: { default: [...], inverse: [...] }`). One layout can then carry the light and the
dark render of the same template layout (3.7). A slide on a surface with no art of its own gets
that surface's ordinary background layers.

**Chrome in the art.**

- The probe removes the page number, footer and date placeholders, because brand chrome draws
  those at the positions in the spec's `chrome`.
- A logo or other picture on the master stays in the art, which keeps it where the template put
  it. That layout then sets `chrome.logo: false`, so the brand does not draw a second logo.

### 3.6 PPTX export (confirm)

**v1.** The generated contract carries a `pptx` mapping derived from the source placeholders:

| Source placeholders  | `pptx.type`          |
| -------------------- | -------------------- |
| title and subtitle   | `title`              |
| title only           | `title-only`         |
| title and one body   | `content`            |
| title and two bodies | `two-content`        |
| section header type  | `section`            |
| anything else        | `content` or `blank` |

Title, subtitle and body boxes become native placeholders at the spec's boxes. The art reaches
the PPTX the way surface backgrounds already do: as the per-slide backdrop picture that
`collectScene` captures. A slide on a brand layout then exports as an editable slide, with its
decoration as a picture behind it.

**Phase 4.**

- Write each used brand layout as its own `slideLayout` part, named with its `label`, with the
  art placed once in the layout instead of on every slide.
- Add a `picture` placeholder kind for media boxes.

**Not planned, your call:** exporting into the original `.potx`, keeping its masters, theme and
layout parts and filling them by `source.layout` and placeholder `idx`. That is the most faithful
output for a company that must ship decks on its template, and it is a second export path, not a
change to the current one. The `source` field keeps it possible.

### 3.7 Masters, surfaces, duplicates and 4:3

**Masters to surfaces.** This follows the rule in `references/source-types.md` (one master per
background is a surface). Each layout's `surface` is the brand surface its master or own
background maps to.

**Duplicates.** Some masters share a layout name and placeholder geometry, such as the light and
dark "Title and Content". Those become one layout:

- Each master's render goes under its surface in the surface-keyed `background` (3.5).
- The default surface comes from the most-used master.
- A slide picks another surface with `surface:` (an existing frontmatter field).

When the geometry differs, the layouts stay separate, and the master's name becomes a suffix
(`title-and-content-dark`).

**4:3 and other aspects.** The canvas stays 16:9, and one rule covers both the boxes and the art,
because rendered art is a single full-page picture.

- A non-16:9 layout scales uniformly to the canvas height and is centred, so the art and the
  boxes stay registered. The side bands show the surface's `bg`.
- For a layout with no art, or with only a flat color or gradient, the agent may choose `stretch`
  instead. The boxes then map proportionally on each axis and the text reflows in the wider boxes.
- `import-notes.json` records which rule each layout got, as the Google Slides eval already
  expects for 4:3 → 16:9.

### 3.8 Importer or CLI: stays in the skill for v1 (confirm)

Recommendation: extraction stays in `skills/brand-import/scripts` (Python, already reading
masters), and `emit_brand.py` gains layout emission. The agent's part in the skill:

- choosing the fallback and the slot names
- reviewing names and duplicates
- comparing the specimen with the source render

A `deckster brand import` command in TypeScript would make imports reproducible without an agent, but
it means porting about 1,400 lines of OOXML reading. It can come once the format is settled.

## 4. Framework design

**Schema** (`packages/brand`)

- `BrandLayoutSpec` and `defineBrandLayouts` in `src/schema/layout-schema.ts`.
- Regions bind to `title`, `{ slot }` or `{ field }`.
- Text regions take `type`, `align`, `anchor`, `case` and `color` (a role).
- Media regions take `fit`, `focal` and `treatment` (an imagery treatment).
- Other regions take `accepts`, using `SLOT_CONTENT_KINDS` such as chart, table or diagram.
- `background` reuses `BackgroundLayers`, and `layers: 'replace' | 'over'` says whether the
  surface's own layers stay.
- `chrome` holds per-layout positions for the page number and footer, or `false`.

**Loading.** `loadBrand` reads `layouts.ts` and checks the art files with `assetProblem`. Tokens
gain `layouts: BrandLayoutTokens[]`. `brandModuleCode` emits `?url` imports for the art, as it
does for backgrounds. The agent gate covers the file, because it uses the same static reader.

**Checks** (`deckster brand check`)

- names are kebab-case, unique, and clash with no engine or kit layout
- the `fallback` exists, and the bindings exist on it
- boxes sit inside the canvas and are at least a minimum size
- text boxes overlapping each other produce a warning
- type steps, roles and surfaces exist
- art files exist, and art aspects match
- a layout with no title says so explicitly (`title: false`)

**Contract** (`packages/kit`). `brandLayoutContract(spec, fallback): AnyLayoutContract` lives in
`src/layouts/brand-layout.contract.ts`. It builds the schema from the field bindings and the slots
from the slot bindings, with the fallback's descriptions and `accepts`. It also sets:

- the budget, from 3.4
- the title contract
- `surface`
- the `pptx` mapping, from 3.6
- an `example`, built from the fallback's example with the same slots, so it passes
  `checkContract`

`@deckster/kit/catalog` exports `brandLayoutCatalog(tokens): LayoutCatalog` with
`source: 'brand:<name>'`.

**Component** (`packages/kit/src/layouts/brand-layout.tsx`). `BrandLayout` is a `Frame` with its
`Backdrop` layers. Each box is an absolutely positioned `Region` (size containment, so fitting
works), and text boxes use `FittedText` at their type step. Media boxes that touch the canvas edge
report their bleed sides. The kit runtime registers one `LayoutDefinition` per spec from
`getBrand().layouts`, so **no new runtime plugin and no change to `deckViteConfig` callers is
needed**. A test asserts that the registered names equal the catalog names, as `layouts.test.ts`
does for the kit.

**Threading the catalog.** `loadLayoutCatalog({ brand })` appends the brand catalog after the kit.
The brand is passed in at the six call sites listed in section 1, and `slide-meta.ts` stops
ignoring the plugin option. Every call site already has the deck, so it has the brand. Switching
brands in dev (`brand-switch.e2e.ts`) must reload the catalog and re-validate the slides.

**Fallback resolution.** This happens in Node only (3.3).

- `validateFrontmatter` and the slide transform look up the names the deck's slides use, across
  the workspace's brands.
- The transform rewrites the slide's `layout` to the fallback before the browser sees it.
- `deckster lint` reports the swap. Nothing about other brands goes into a virtual module.

**Discovery.**

- `deckster layouts --json` adds `source` (`kit` or `brand:<name>`), `fallback`, `label` and the
  source template name to each `LayoutInfo`, and `--summary` groups brand layouts first.
- `create-presentation` tells agents to prefer the brand's layouts when the deck's brand has
  them, because they are the template the organisation expects. It also tells them to fall back
  to kit layouts for what the template lacks.

## 5. Importer design (`skills/brand-import`)

**Sources**

| Source                                                | Path                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.pptx`, `.potx`, `.pptm`/`.potm` (macros never read) | `extract_pptx.py`. For rendering, convert a template to a presentation by rewriting the main part's content type in a copy.                                                                                                                             |
| Google Slides                                         | `fetch_gslides.py` already exports `deck.pptx`. The layouts come along in that file (Phase 0 checks how many survive).                                                                                                                                  |
| Keynote `.key` / `.kth`                               | macOS with Keynote installed. **K1:** `osascript` exports to PPTX, then the PPTX path. **K2,** if K1 loses masters: JXA lists `master slides`, makes one slide per master, reads the default title and body item frames, and exports a PDF for the art. |
| `.odp` / `.otp`                                       | LibreOffice converts to PPTX first. Not a goal; it comes almost for free.                                                                                                                                                                               |

**`extract_pptx.py` changes**

- Key layouts by master index and layout file, not by name.
- Keep every layout, used or not. `analyze` stops dropping unused ones and marks them `unused`
  instead.
- Placeholders:
  - recurse into groups
  - keep `name`, `sz`, `orient`, `hasCustomPrompt` and the prompt text
  - keep level 1 to 5 styles
  - resolve `clrMapOvr`
- Record decorative shapes (type, geometry, fill and line as theme references), even though v1
  draws art by rendering. They feed 3.5 B and help the agent describe each layout.
- **The layout probe:**
  - Write `layouts-probe.pptx`, with one slide per layout, placeholders empty and prompts off.
  - Render it with the current renderer into `layouts/<key>.pdf`, then into per-layout SVG and
    PNG.
  - Render a second copy with the prompt text filled in. This is the reference image for
    comparison.
- A template with no slides now has page images (the layout renders), so the skill's
  "no images, stop" rule keys on rendered pages of either kind.

**Draft and emission.**

- `brand-draft.json` `layouts[]` grows from notes into specs. For each layout it holds:
  - `name`
  - `label`
  - `fallback` (the old `maps_to`, now required)
  - `surface`
  - bindings per placeholder
  - box and type step per placeholder
  - `keep: true | false`
- `check-draft` validates them against `deckster layouts --json`.
- `emit_brand.py` writes `layouts.ts` and copies the art into `layouts/`.
- `make_specimen.py` adds one specimen slide per brand layout, filled from the contract example.
- `compare.py` puts each specimen next to the prompt-filled source render.

**Placeholder mapping rules.** The agent can override each of these.

| Placeholder                               | Becomes                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `title`, `ctrTitle`                       | title                                                                                      |
| `subTitle`                                | the fallback's lead slot or a subtitle field                                               |
| `body` (first)                            | `body`                                                                                     |
| `body` (further)                          | the fallback's other slots in reading order                                                |
| `pic`                                     | `media`                                                                                    |
| `chart`, `tbl`, `dgm`                     | a slot that accepts that kind                                                              |
| `obj`                                     | `body`                                                                                     |
| `sldNum`, `ftr`, `dt`                     | per-layout `chrome` positions                                                              |
| custom prompt text                        | the region's example text, and a hint in the contract's description                        |
| type size (pt × 1920 / slide width in pt) | the nearest brand type step; a size more than 15% from every step goes to the import notes |

## 6. Phases

### Phase 0: spikes (one agent, a day)

Each spike has a command, a pass criterion and a fallback.

1. **`.potx` reading.**
   - Try: `python3 -I extract_pptx.py template.potx --out $WORK`, then
     `soffice --headless --convert-to pdf` on the content-type-rewritten copy.
   - Pass: every layout is listed, and the PDF has one page per probe slide.
   - Otherwise: run `soffice --convert-to pptx` on the template first.
2. **Empty placeholders.**
   - Try: render a probe whose placeholders have no text, then `pdftoppm -png`.
   - Pass: the PNGs show no "Click to add" text and no placeholder outlines.
   - Otherwise: delete the placeholders from the probe slides instead of emptying them.
3. **Transparent art.**
   - Try: set `<p:bg>` to no fill in the probe, then `pdftocairo -svg`.
   - Pass: the SVG has no full-page background rectangle, or exactly one that can be stripped.
   - Otherwise: the art includes the background (3.5).
   - Check fonts here too: use a template font that is not installed and see what the art draws.
4. **Google Slides.**
   - Try: `fetch_gslides.py` on a template with ten layouts, two of them unused, then count
     `ppt/slideLayouts/*.xml` and their placeholders.
   - Pass: all ten are present, with their placeholders.
   - Otherwise: the importer reports which layouts are missing. The Slides API needs OAuth and
     stays out of scope.
5. **Keynote.**
   - Try: `osascript -e 'tell application "Keynote" to export (open POSIX file "…/theme.key") to
     POSIX file "…/out.pptx" as Microsoft PowerPoint'` on a theme with eight master slides, then
     count the slide layouts.
   - Pass: eight layouts, with title and body placeholders where Keynote has default items.
   - Otherwise: use K2.

Phases 1 and 2 can start before the spikes finish. Phase 3 waits on spikes 1 to 3, and Keynote
waits on spike 5.

### Phase 1: framework (parallel, split by package)

| Owner       | Files                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| brand       | `layout-schema.ts`, `loadBrand`, tokens, checks, `brand-modules.ts` art URLs, `test-brand.fixture.ts` with three layouts                     |
| kit         | `brand-layout.contract.ts`, `brand-layout.tsx` and `.css`, the runtime registration, `brandLayoutCatalog`, unit tests                        |
| vite-plugin | `loadLayoutCatalog({ brand })`, `slide-meta.ts`, frontmatter fallback, a brand-switch reload, an e2e case modelled on `e2e/fixtures/layouts` |
| cli         | the five CLI call sites, `deckster layouts` fields, the `brand-layout-fallback` lint rule, `deckster new slide --layout <brand layout>`      |

The coordinator owns the shared contract (names and types written first in the scratchpad), the
e2e runs and `pnpm ready`.

### Phase 2: a hand-written brand layout set

Write `layouts.ts` by hand for one public brand (`fieldnote` or `tidewater`), three or four
layouts with art. Use it in a test deck and check `deckster shot`, `deckster lint` and `deckster export`. This
proves the format before the importer writes it.

### Phase 3: importer for PPTX, POTX and Google Slides

- the `extract_pptx.py` changes and the probe
- draft specs, `check-draft`, `emit_brand.py`, the specimen and the comparison
- `SKILL.md` and its references (`brand-draft-format.md`, `extraction-format.md`,
  `brand-schema.md:280`)
- In `packages/export`: stamp deckster-made packages in `docProps/app.xml`, so the importer can
  skip their layouts (3.2)

Fixtures come from `make_fixtures.py`:

- a `.potx` with two masters and twelve layouts
- some unused layouts, a picture placeholder, decorative shapes and custom prompts
- a same-named layout on both masters
- a 4:3 copy

`check_extraction.py` asserts the layout count, the keys, the boxes and the bindings. A new
`evals.json` case imports the `.potx` into a brand and grades the layout count, the
`deckster brand check` result and the specimen comparison.

### Phase 4: Keynote

K1 or K2, as spike 5 decides. The eval runs only on macOS with Keynote and is skipped elsewhere.

### Phase 5: export

Native `slideLayout` parts per brand layout, the art placed in the layout, and a `picture`
placeholder. If you want it (3.6), template export follows as its own plan.

### Phase 6: docs

- `design.md`: a "Brand layouts" section
- `packages/brand/README.md` and `packages/kit/README.md`
- the `create-presentation` skill and its `framework.md`
- a docs-site page under Brands, embedding the Phase 2 test deck once it is on the allowlist

## 7. Risks

- **Fidelity expectations.** People will compare an imported layout to PowerPoint pixel for pixel.
  Text metrics differ between PowerPoint, LibreOffice and Chromium, so a box that fits in the
  source may overflow in a slide. The overflow rule catches it, and the import notes should say
  so up front.
- **Fixed art.** Rendered art keeps the source colors, so a layout's art does not follow a slide's
  `surface:` change. Contrast is still checked against the pixels by lint. Native shapes (3.5 B)
  are the fix.
- **Placeholder semantics.** Templates misuse placeholders (a `body` used as a subtitle, a picture
  drawn as a shape). The mapping rules cover the common cases; the agent's review covers the rest.
- **Renderer availability.** The probe needs LibreOffice, and Keynote needs macOS. Both are
  already prerequisites of the skill's render step.
- **Catalog growth.** A template with 40 layouts makes `deckster layouts --summary` long for agents.
  The draft's `keep` flag and the grouping in `--summary` help, and the import notes should
  recommend pruning near-duplicates.
- **Fonts in art.** Outlined text in rendered art uses the renderer's fonts. A missing template
  font shows up as the substitute in the art, though the live text uses the brand font. Spike 3
  should check this with a non-system font.
