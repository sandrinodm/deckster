# Synthesis: from raw values to a system

How to turn `extraction.json`, `analysis.json` and what you saw on the pages into `brand-draft.json`. Data palettes and chart style are in `dataviz.md`.

## Contents

- [Precedence between sources](#precedence-between-sources)
- [Palette](#palette)
- [Semantic roles](#semantic-roles)
- [Surfaces](#surfaces)
- [Contrast](#contrast)
- [Gradients](#gradients)
- [Typography](#typography)
- [Fonts: identifying, sourcing, substituting](#fonts-identifying-sourcing-substituting)
- [Shape and spacing](#shape-and-spacing)
- [Logo, icons, imagery, chrome](#logo-icons-imagery-chrome)
- [Motion](#motion)
- [Layout archetypes](#layout-archetypes)
- [Provenance and confidence](#provenance-and-confidence)

## Precedence between sources

When values disagree, the higher line wins:

1. What the user tells you in the conversation.
2. Values **stated** in a brand guidelines document.
3. Values **used consistently** across the pages of the primary source (the deck, for a deck brand).
4. Values **declared** in a theme or in CSS custom properties and actually used.
5. Values declared but unused, and values from a secondary source (the website, for a deck brand).
6. Pixel estimates.
7. Your own choices where the source is silent.

A declared-but-unused value is worth one line in the review list ("the theme defines a purple that no slide uses: keep it?"), not a place in the roles.

## Palette

1. Start from `analysis.json` `palette`: colours clustered so anti-aliasing and near-duplicates collapse onto the most used exact hex.
2. Keep source hexes exactly as extracted. Do not "clean up" `#0F1B2D` to `#101B2D`, and do not average.
3. Throw out noise: colours used once on one page, colours that only appear inside photos or screenshots, pasted-content colours (a lone `#444444` in Arial on an appendix slide), and anything from a guidelines "misuse" page.
4. A typical brand has one or two brand colours, zero to three supporting colours, and three to five neutrals. If you have fifteen "brand colours" you are looking at illustrations or charts, not the palette.
5. Name each colour for what it is (`coral`, `ink`, `paper`, `forest`), or reuse the source's own names when it has good ones (CSS variable names, guideline names). Roles reference these names.
6. Add a tonal scale only for colours the framework will need tints and shades of, usually the accent and the main neutral: `brand_tools.py scale '#FF5A36' --name coral` builds 50 to 950 through the exact source hex. Generated steps are derived values; say so in provenance.

## Semantic roles

Roles say what a colour does. Assign them from use, then confirm on the page images:

| Role | Evidence |
|---|---|
| `bg` | The background of most pages. |
| `fg` | The highest-contrast colour that carries most text on `bg`. |
| `muted` | A second, quieter text colour used consistently for secondary copy, captions, axis labels. |
| `accent` | Where the eye is sent: big numbers, the highlighted chart series, buttons, the eyebrow or kicker, key words, bullets. Emphasis, not volume. |
| `accent_fg` | Text that sits on a filled accent shape (button label). Read it from the source. |
| `heading` | Only when headlines are consistently set in a colour other than `fg` (a dark brand green over near-black body text). Optional; defaults to `fg`. |
| `surface` | Fill of cards and panels sitting on `bg`, when it differs from `bg`. |
| `border` | Rules, card outlines, gridlines: the low-contrast stroke colour. |
| `positive`, `negative` | Deltas and status (`+12%` in green). Only from the source if it uses them; otherwise leave them out and the emitter generates a pair that passes on each surface. |

Things that go wrong, and how to tell:

- **A dark tinted colour is an ink, not an accent.** Navy `#0F1B2D` or forest `#1E4D36` used for headings is `fg` or a heading colour. The analysis lists these as `dark_brand_tones`.
- **The accent is not always `accent1`.** A deck can leave the theme's `accent1` for charts and put a hard-coded colour on every highlight bar. Check `off_theme_but_frequent`. If two colours both act as accents, pick the one used for emphasis on the most pages as `accent`, keep the other in the palette, and put the choice on the review list.
- **Several colours share emphasis** (a stats row in coral, teal and violet). One is still the accent; the others are supporting colours that also feed the categorical data palette.
- Do not invent roles the source has no evidence for. `success`, `warning` and `danger` only exist if the source uses them.

## Surfaces

A surface is a background treatment plus the foreground roles that work on it. Surfaces give a deck rhythm, so capture every one the source really uses and no others.

`analysis.json` `surfaces` groups pages (or, on the web, text) by background and lists the text colours seen on each with contrast. Typical set:

- `default`: the common light or dark page.
- `inverse`: the opposite tone, used for section breaks, quotes, code blocks or footers. If the source has no inverse page but uses a dark footer or code block, that colour is still the best inverse background. A website's dark-scheme overrides are evidence too.
- `accent`: a page or band filled with the brand colour.
- `gradient`: a page filled with a named gradient.

For each surface, read `fg`, `muted`, `accent` and `border` **from the pages that use it**. Do not assume the default roles carry over: on a dark surface the muted grey is lighter, and on an accent or gradient surface the accent usually flips to white. Where the source shows no muted text on a surface, derive one: start from `fg` and move it toward the background until it is clearly quieter but still at least 4.5:1 against that background (`brand_tools.py contrast` to check), and mark it derived.

On a gradient or accent surface there is often no quieter colour that still passes: set `muted` equal to `fg` there rather than inventing one.

If the source has only one background treatment, still define `default` and `inverse`, derive the inverse from `fg` and `bg` swapped, and mark it as derived. A deck framework needs both.

## Contrast

`brand_tools.py contrast <bg> <fg> ...` and `check-draft` use WCAG 2.x ratios and the framework's thresholds (`brand-schema.md` lists every pair). The compiler fails the build on violations, so settle them in the draft.

- 4.5:1 for text, 3:1 for large text (roughly 32 canvas px and up at regular weight, 24 and up at bold) and for graphical marks.
- **Brands routinely fail with their own accent**: white on a mid-tone orange or teal is around 3:1; an orange eyebrow on cream is under 3:1. This is the source's real behaviour, not an extraction error.
- Do not silently change brand colours, and do not leave the brand uncompilable either. A text pair the source uses between 3:1 and 4.5:1 keeps its source value with a `waivers` entry. A pair under 3:1 (accent on the page background is the usual one) must change: take the nearest passing shade, keep the exact source hex in the palette, and record both. Either way it is a review item with the pair, the ratio and what you did.
- Over a gradient, check the foreground against every stop.

## Gradients

- Prefer exact origins (`ooxml`, `css`, `pdf-shading`) over `pixels`. When only a pixel estimate exists, snap its stops to palette colours within a few units and mark the result as estimated.
- Name gradients for what they look like or where they are used (`sunrise`, `hero`).
- Record type, angle in CSS degrees, stops with positions, and where the source uses it: full-page background, panel fill, or text. That decides whether it becomes a surface.
- Mesh and noise: a soft multi-colour blur is a mesh. Describe it with three to five colour points and positions read from the image, set `grain` if the image shows visible noise, and mark it low confidence. Complex artwork is better carried over as an image asset.
- OOXML stops with `approximate: true` carry colour transforms the parser only estimates. Use the stop colours from the page's `background.pixels` instead.

## Typography

**Roles first.** Display is what titles are set in, body is what running text is set in, mono is the code or label face. One family often plays both display and body. A family used for a few percent of the text on one or two pages is stray content, not the brand.

**Scale.** Sizes for PDF and PPTX are already in canvas pixels (`size_canvas_px`, 1080 high). Build 5 to 8 named steps:

1. Take `analysis.json` `type.steps`. Merge sizes within about 6% of each other, snap to whole pixels.
2. Assign names by job, not by rank: `display` (title and section slides), `h1` (slide headline), `h2` (sub-headline or card title), `body`, `small`, `caption`, plus specials the source uses: `eyebrow`, `quote`, `stat`, `stat_label`, `code`, `label` (chart axis text).
3. For each step record family role, size, weight, line height, tracking and case. Line height comes from `line_height_ratio` (CSS, and PDF text styles that wrap onto several lines), otherwise measure baseline distance on the image. Tracking is exact from CSS and PPTX (`tracking_pt / size`). A PDF does not state it, but it can be measured when the font is open: set the same string in the real font at the same size, compare its width with the span's `bbox` width, and divide the difference by the number of gaps between letters. Otherwise judge it by eye and say so.
4. Compare against a modular ratio (`nearest_modular_ratio`). If the source is close to one, snapping to it is a fair cleanup. If the source is deliberately uneven, keep its sizes.

**Slide sizes have floors.** On a 1920x1080 canvas body text below about 28 px and anything below 20 px will not be read from the back of a room. If the source goes smaller (dense consulting decks do), keep the source value in provenance, raise the draft to the floor, and note it.

**From a website.** Carry over families, weights, the *ratios* between steps, line heights, tracking and case. Set absolute sizes for slides: body 28 to 36, headline 64 to 96, display 110 to 160, then apply the site's ratios between them. Radii, stroke widths, shadows and spacing scale by canvas width over capture width (1920 / 1440 = 1.33 at the default), then round to the values a designer would pick.

**Numerals.** Serif display faces often default to old-style figures on the web (Playfair Display does), which makes big numbers look uneven. If the source shows lining figures, set `numeric: "lining-nums tabular-nums"` on the stat and table steps.

**From a 4:3 or other aspect.** `size_canvas_px` is normalised by height, so sizes carry over; horizontal measures do not. Note the source aspect in the draft.

## Fonts: identifying, sourcing, substituting

Run `brand_tools.py fonts "<family>" ...` (also part of `analyze`). For each family decide one of:

| Situation | Decision | Review list |
|---|---|---|
| On Fontsource (`status: open`) | `source: {kind: "fontsource", id}`. Record the licence. | No entry needed beyond "open licence". |
| System font (Arial, Calibri, Helvetica, SF, Segoe) | The author's machine had it; a deck served on the web does not. Use the metric-compatible or closest open alternative. | Say what was substituted. |
| Commercial or custom (not on Fontsource) | `source: {kind: "unavailable"}` with the reason in `licence`, plus `fallback_family` set to the best open alternative. When the user supplies files it becomes `kind: "files"`. | **Always.** Name the foundry if the metadata shows it, say that licensed web font files are needed, and name the stand-in. |
| Unknown (images, outlined text) | Best visual match, confidence 0.3 to 0.5. | Always. |

Rules that keep this honest:

- **Never reuse extracted font data.** PDF subsets, PPTX embedded fonts and a website's WOFF2 files identify the typeface. They are not a licence. `fsType` and licence strings from the font's own metadata are useful evidence for the review list.
- **Names lie.** `ArialMT`, `HelveticaNeue-Bold`, `SpaceGroteskLight-Bold` are PostScript names. Prefer the family from the font's name table when the extractor has it. Vendor suffixes (`Pro`, `Std`, `LT`, `MT`, `-var`, `W05`) are not part of the family.
- **Choosing a substitute** is a visual judgement. The alternatives table gives candidates; decide by comparing against a crop of real source text: x-height (PDF extraction gives `metrics.x_height`), letter width, stroke contrast, terminals, the shape of `a g y R Q 1`. Render the candidates in the specimen if unsure. A substitute that is wider or narrower changes line breaks everywhere, so prefer matching width over matching details.
- Only list the weights the source uses. Each extra weight is a download.
- **Record what kind of face each family is** (`category`: `sans`, `serif` or `mono`) and end its `fallback` in the matching generic family. The framework uses this for the system substitute that PowerPoint exports fall back to (Arial, Georgia, Courier New), and `brand check` warns when a serif is given a sans substitute. This is separate from the open stand-in for a commercial font: the stand-in is what the web deck shows, the substitute is what an office app without the brand font shows.

## Shape and spacing

- **Radii.** `observed.shapes.corner_radii` gives counts. Collapse to at most three steps plus pill: small (chips, bars), large (cards, images), pill (buttons, tags). A source with only square corners gets radius 0, which is a real brand decision.
- **Strokes.** Typical rule and outline width in canvas pixels (PDF/PPTX points times the canvas factor), and the border colour.
- **Shadows.** Present on the web as exact CSS. Preserve colour alpha as well as offsets and blur: an 8% shadow becoming opaque is a different treatment even when schema validation passes. Compare the resolved shadow with the extracted CSS. In decks, read them off the image: none, soft, or hard. Most deck brands use none.
- **Alignment accidents.** When the extractor warns that a 16:9 deck sits on a 4:3 master, titles "centred" in the left three quarters are an accident. Choose left-aligned or truly centred from the rest of the deck and put the choice on the review list.
- **Margins.** Left edge of the title block and top edge of the first element, as canvas pixels: `bbox x * 1920`, `bbox y * 1080`. Use the most common value across content pages. PPTX placeholders give this exactly.
- **Grid.** If text and visuals align to visible columns (two halves, thirds), record that. The kit has a 12-column grid; you only need margin and gutter.
- **Density.** A one-line note: how much of a typical content slide is empty. It tells layout authors more than numbers do.

## Logo, icons, imagery, chrome

- **Logo.** Take the highest-scoring candidate, then check it on the pages. Prefer SVG. An SVG whose wordmark is live `<text>` (common for inline website logos) loses its font when loaded as an image: convert the text to outlines with the real font if it is open, or keep the PNG and ask for the official file. Look for `rare_variant` entries too: a reversed logo may appear only on the title and closing pages. From a PDF, `assets/chrome/*.svg` is a vector crop that includes the page background and anything else in the box: open it and strip those out. Record each variant with the backgrounds it is used on (`on: ["default"]`). A logo that is only ever seen on light pages has no dark-background variant: do not recolour it yourself; put "need a reversed logo" on the review list. Record placement (corner), height in canvas pixels, and clear space if a guidelines document states it (otherwise the height of the mark).
- **Logo backgrounds.** Inspect each variant on every surface assigned to it, including gradients. A circle or rectangle painted to match one background is not a transparent cutout. Preserve intentional fills, identify actual negative space from source evidence, and flag uncertainty rather than silently inventing a variant. Keep an unavailable reversed logo on the review list as described above.
- **Icons.** Stroke or fill, stroke width, corner style, and a matching Iconify set (`lucide`, `tabler`, `phosphor`, `heroicons`, `material-symbols`...). Websites sometimes reveal the library through class names. Decks rarely have enough icons to tell: choose by stroke weight and roundness to match the typeface, and mark it as a choice.
- **Imagery.** Photography or illustration, colour or duotone, full-bleed or framed, corner radius, any overlay. This comes entirely from looking.
- **Chrome.** What repeats on content pages: logo, page number (format `02` or `2 / 14`, position, type style), footer text, progress bar, section label. Title and section pages often drop the chrome; note that.

## Motion

Static sources cannot show motion. Derive a **feel** and say that it is derived:

| Brand reads as | Easing | Durations | Slide transition |
|---|---|---|---|
| Calm, corporate, editorial | gentle ease-out, `cubic-bezier(0.2, 0, 0, 1)` | 300 to 500 ms | fade |
| Crisp, technical, product | quick ease-out, `cubic-bezier(0.2, 0.8, 0.2, 1)` | 150 to 250 ms | fade or short slide |
| Playful, loud, consumer | slight overshoot, `cubic-bezier(0.34, 1.56, 0.64, 1)` | 250 to 400 ms | slide or scale |

A website gives real evidence: use `observed.motion.transitions` for the easing curve and scale the durations up a little for slide-sized elements (UI hover timings are shorter than a slide build). PPTX transitions are usually whatever the template shipped with; ignore them unless the user says they matter.

Always write the full set the kit animates with: easings `standard` (fades and colour changes), `emphasized` (the slide entrance, step reveals, chart builds and count-ups) and `exit`, and durations `fast`, `base` and `slow`. The framework derives a missing one (`emphasized` and `exit` from `standard`, `fast` and `slow` from `base`), but then the brand file no longer says what the deck moves with, and a reviewer cannot see that a value was guessed. `emphasized` is usually a stronger ease-out than `standard` (`cubic-bezier(0.16, 1, 0.3, 1)` for a calm brand); `exit` an ease-in (`cubic-bezier(0.4, 0, 1, 1)`). `emit_brand.py` fills in the ones the draft leaves out and lists them as defaulted.

## Layout archetypes

Goal: say which kit layouts the source uses, how each is treated, and where the kit's default would not look like the source.

1. **Cluster the pages.** Use the contact sheet. PPTX layout names and placeholder types give a first cut (`Title Slide`, `Section Header`, `Two Content`), but decks are full of "Title Only" slides with hand-placed content, so look at what is on the slide, not what the layout is called. `layout_hints` label obvious cases.
2. **Map each cluster to a layout the framework has.** Run `deck layouts <deck> --json` and use its names and descriptions; the set is growing, so do not assume one exists. A cluster with no match gets `maps_to: null` and a note describing the structure. Chart pages map to the `chart` layout (or to `split` beside text) holding a chart component.
3. **For each archetype record**: source pages, the surface it uses, alignment (left or centred), where the title sits, and what is distinctive (an eyebrow above every headline, rules between bullets, numbers in cards, a coloured bar under the title).
4. **Decide `override_needed`.** True only when the difference is structural and typical of the brand (titles always bottom-left on a full-bleed gradient; section numbers set huge behind the title). Colour, type and spacing differences are tokens, not overrides.
5. Archetypes the source does not have need no entry. The kit's defaults, themed by the tokens, cover them.

Recognising archetypes from an image, quickly:

| Looks like | Archetype |
|---|---|
| One large line, lots of space, maybe a subtitle and logo, first page | title |
| One large line on a contrasting background mid-deck, often numbered | section |
| A sentence filling the slide, no bullets | statement |
| Headline plus bullets or paragraphs | content |
| Text one side, image/chart/panel the other | split |
| Two to four big numbers with labels | stats |
| Quotation marks, attribution line | quote |
| Two columns with parallel structure, "before / after" | comparison |
| Bars, lines, axes | chart on content or split |
| Rows and columns of text | table |
| Monospace block on a dark panel | code |
| Photo edge to edge with text over it | full-bleed image |
| Grid of logos or faces | logo wall, team |
| Last page: thanks, contact, URL | closing |

## Provenance and confidence

For each group of values in the draft add a `provenance` entry: where it came from and how sure you are.

| Source of the value | Typical confidence |
|---|---|
| Stated in guidelines, or declared and used | 0.95 |
| Exact extraction (vector colour, OOXML, CSS), consistent across pages | 0.9 |
| Exact extraction, but the role assignment is a judgement | 0.7 |
| Pixel estimate, or read off the image by eye | 0.5 |
| Derived by you (inverse surface, data palette, tonal scale) | 0.5 to 0.6, marked `derived` |
| Font identified from an image; motion; icon set | 0.3 to 0.4 |

Everything under about 0.6, every font licence that is not open, and every contrast failure becomes a line in `review`. Write each review item as a question or a request the user can answer in one line.
