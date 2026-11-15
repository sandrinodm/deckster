# Writing the brand into the workspace (`brands/<name>/brand.ts`)

This file and `scripts/emit_brand.py` are the only parts of the skill that depend on the framework's brand schema. The authority is `deck brand check`, which prints every schema problem with its field and fix; `deck brand default --json` prints a complete resolved brand to read for the shape (never copy its values), and any brand the user already has under `brands/` is a worked example of the file format. **If this file and what `deck brand check` says disagree, the check wins**: fix the emitter (`scripts/emit_brand.py`, `scripts/_brand_rules.py`) and update this page.

## Contents

- [The loop](#the-loop)
- [What a brand folder contains](#what-a-brand-folder-contains)
- [The schema, section by section](#the-schema-section-by-section)
- [Limits the framework enforces](#limits-the-framework-enforces)
- [What the framework derives, so you do not have to](#what-the-framework-derives-so-you-do-not-have-to)
- [What `brand check` checks](#what-brand-check-checks)
- [How the draft maps onto `brand.ts`](#how-the-draft-maps-onto-brandts)
- [Fonts and substitutes](#fonts-and-substitutes)
- [Reading the check's output](#reading-the-checks-output)
- [Rendering the brand](#rendering-the-brand)
- [Where things go, and what not to commit](#where-things-go-and-what-not-to-commit)
- [Not in the schema](#not-in-the-schema)

## The loop

```bash
uv run $SKILL_DIR/scripts/emit_brand.py $WORK/brand-draft.json --workspace .     # writes brands/<name>/
npm install <font packages>               # only if the run lists some (it prints the command)
deck brand check <name> --json            # { brand, file, ok, errors, warnings }, each { path, message, fix }
# fix the DRAFT, then:
uv run $SKILL_DIR/scripts/emit_brand.py $WORK/brand-draft.json --workspace . --force
deck brand check <name> --json
deck brand <name> --json                  # every resolved token, including what was derived
```

`deck brand check` is the authority: it loads the brand the way the build does (schema, palette references, derived surfaces, contrast on every surface, data palettes, fonts, logo files, substitutes). A brand is done when `ok` is true. `brand_tools.py check-draft` applies the main thresholds to the draft and is only a faster first pass.

Always fix the draft and re-emit. The draft holds the provenance and the review list; a hand-edited `brand.ts` drifts away from them. Once the import is finished and reviewed, `brand.ts` is the source of truth and is edited directly like any other brand.

## What a brand folder contains

```
brands/<name>/
  brand.ts            export default defineBrand({...}); `name` must equal the folder name
  import-notes.json   written by the emitter: the source's kinds and feel, open review items, fonts without
                      files, and this run's notes. Data for people and agents to read; nothing loads it
  logos/              svg, png or webp, named after the variant (`logos/primary.svg`)
  fonts/              only files the user supplied or that are openly licensed (kind: 'files'),
                      named by the emitter (`fonts/acme-sans-700-italic.woff2`)
```

`brand.ts` is data and nothing else: the import of `defineBrand`, one fixed comment, and one literal. The framework reads such a file without running it, and Node imports it in other places, so the emitter never writes text from the draft outside a string literal and never into a comment. That is why provenance and review notes are in `import-notes.json` and not in a header. Before writing, the emitter reads its own output back with a strict reader and stops if it is not the value it meant to write. Do not add imports, variables, computed values or comments carrying source text to `brand.ts` during an import.

A brand folder is plain files: no `package.json` and no install step of its own. Fontsource packages the brand names resolve from the workspace folder's `node_modules`, so a package the CLI does not carry itself (it ships Inter, JetBrains Mono and Bricolage Grotesque) needs `npm install <package>` in the workspace folder, which creates the workspace's `package.json` if there is none. The emitter prints the exact command. Until it has run, commands on the brand fail on the missing font package.

## The schema, section by section

All sizes are canvas pixels on 1920x1080. A colour is a literal (`#1f2937` or `oklch(0.62 0.19 259)`, with alpha as `oklch(0 0 0 / 0.7)`) or a palette reference (`ink.900`, with alpha in percent as `ink.900/12`). Names are kebab-case.

**`name`, `label`.**

**`color.palette`**: named scales, step to literal colour: `{ coral: { 500: '#ff5a36', 600: '#f8532f' } }`. Steps are free (`50`, `500`, `base`).

**`color.roles`**: the base roles, all required except `heading`: `bg surface fg heading? muted accent accent-fg border positive negative`. `heading` falls back to `fg`. `positive` and `negative` colour deltas and status; the emitter generates them when the source has none.

**`color.surfaces`**: a record of surfaces. Each lists role overrides, plus optionally `gradient` (a named gradient painted as its background), `logo` (the logo variant to show on it), `data` (`plate`, the backdrop charts are drawn on, and any of `categorical`, `sequential`, `diverging`, `context` to replace the base palettes there), `code` and `diagram` (theme overrides for that surface), `shadow` (`sm`, `md`, `lg`) and `background` (up to six layers painted over the colour and gradient, in order: `{ type: 'image', file, fit?, focal?, opacity?, treatment?, tint?: { color, opacity } }` for a photo or texture that fills the slide, `{ type: 'placed', file, aspect, anchor, width, offset?, opacity?, rotate? }` for a mark at a corner, edge middle or the center (`width` in canvas px, a negative `offset` bleeds off the edge), `{ type: 'pattern', file, aspect, tile, offset?, opacity? }` for a repeating tile, `{ type: 'gradient', gradient, opacity? }` for one of the brand's gradients over the layers below). Layer files are SVG, PNG, WebP or JPEG in the brand folder, usually `backgrounds/`. A surface with an `image` or `pattern` layer must set its own `bg`, the colour it reads as. `emit_brand.py` does not write `background` yet: add it to `brand.ts` by hand and copy the files. Every brand has `default`, `inverse`, `accent` and `gradient`; a brand may add more.

**`color.data`**: `categorical` (3 to 12 colours), `sequential` and `diverging` (3 or more each), `context` (the colour everything a chart's highlight mutes is drawn in).

**`color.waivers`**: `[{ color, on, surface?, reason }]`. Accepts a text pair at 3:1 instead of 4.5:1, with a warning on every check. Leave out `surface` to waive the pair everywhere.

**`gradients`**: named `linear` (`angle` in CSS degrees, `stops`), `radial` (`shape?`, `at: { x, y }` in percent, `stops`) or `mesh` (`base` colour plus `points: [{ color, x, y, size? }]`, all in percent). A stop is a colour or `{ color, at }` with `at` in percent; at least two. `grain` is an opacity from 0 to 0.4.

**`typography.families`**: `display`, `body`, `mono`, each `{ family, fallback: [...], substitute?, source }`. See [Fonts and substitutes](#fonts-and-substitutes).

**`typography.scale`**: exactly these eleven steps, each `{ family, size, lineHeight, tracking, weight, case?, style?, features?, axes? }`:

| Step | For |
|---|---|
| `display` | cover and statement slides |
| `headline` | slide titles |
| `title` | card and column titles |
| `lead` | the paragraph under a title |
| `body` | running text and bullets |
| `small` | dense text, table cells |
| `caption` | figure captions, sources, the label under a stat |
| `label` | eyebrows, overlines, chrome, chart axis text |
| `stat` | big numbers |
| `quote` | pull quotes |
| `code` | code blocks |

`size` is **at least 20** (the smallest text the framework allows on the canvas; `deck lint` enforces the same number on slides). `lineHeight` is unitless, 0.7 to 2.5. `tracking` is in em, -0.1 to 0.5. `weight` is 1 to 1000 (variable fonts take in-between values). `case` is `none` or `upper`. `features` are OpenType tags (`tnum`, `lnum`). `axes` sets variable-font axes per step (`{ opsz: 144 }`).

**`shape`**: `radius { sm, md, lg, xl }`, `stroke { hairline, regular, bold }`, `shadow { sm, md, lg }`. A shadow is `'none'` or a list of layers `{ x?, y, blur, spread?, color, inset? }`, for example `[{ y: 8, blur: 24, spread: -8, color: 'ink.950/14' }]`. CSS shadow strings are not accepted; the emitter converts one from the draft. There is no pill radius: use a large `xl`.

**`spacing`**: `scale { 2xs, xs, sm, md, lg, xl, 2xl, 3xl }`, `margin { x, y }` (the slide's safe area), `grid { columns, gutter }`.

**`logo`**: `variants: { <name>: { file: 'logos/x.svg', aspect } }` (aspect is width over height), `default`, `clearSpace` (a multiple of the logo height), `placement { corner, height }`. Which variant shows on which surface is set on the surface (`logo: 'reversed'`).

**`icons`**: `{ set, strokeWidth }`, `set` being an Iconify collection (`lucide`, `tabler`).

**`imagery`**: named `treatments` (`none`, `rounded` with a radius name, `grayscale`, `duotone` with `shadow` and `highlight`, `tint` with `color` and `opacity`) and a `default`.

**`chrome`**: `pageNumber { show, format, corner }` (format contains `{n}`, optionally `{total}`), `footer { show, text, corner }`, `progress { show, edge, thickness }`, `logo { show }`, `skipFirst`.

**`motion`**: named `easings` (cubic-bezier tuples), named `durations` (milliseconds), `transition { kind, duration, easing }` with kind one of `none fade slide push zoom` and `duration` and `easing` naming entries of the two records.

**`charts`** (optional; every field optional): how charts, big numbers and tables are drawn. Colours here are **role names** and line weights are **stroke names**, never raw values.

| Field | Values |
|---|---|
| `grid` | `{ show, color: <role>, stroke: hairline\|regular\|bold, dash: solid\|dashed\|dotted }` |
| `axis` | the same, plus `ticks` |
| `labels` | `{ axis, value, legend, annotation: <type step>, color: <role> }` |
| `numbers` | `{ locale: 'en-US', notation: standard\|compact, currency: 'USD', maximumFractionDigits: 0..4, signDisplay: auto\|always\|exceptZero }` |
| `stat` | `{ step: <type step>, label: <type step>, color: <role> }` |
| `table` | `{ header, body: <type step>, emphasis: fill\|text\|bar, rule: <stroke>, zebra }` |

`emphasis` is how a highlighted table row or cell is marked: a tinted fill, accent text, or an in-cell bar.

**`code`, `diagram`** (optional, top level and per surface): colour overrides for the code theme (`background foreground comment keyword string number function type punctuation highlight added removed`) and the diagram theme (`node node-border node-text group edge label highlight highlight-text packet`). Both are derived from each surface's roles when left out, including the diff colours `added` and `removed`. Set one only when the source shows code or diagrams the derived theme does not match.

## Limits the framework enforces

The schema rejects values that could leave their place in the compiled CSS or name a file outside the brand. They are listed here because values in a draft come out of a source nobody vetted. `emit_brand.py` applies the same rules before it writes (`scripts/_brand_rules.py`): a number out of range is clamped, an optional value that breaks a rule is left out, each with a `note:` that belongs on the review list; a required value that cannot be made valid (a role that is not a colour, a `NaN`, too few data colours) stops the emitter with the field's path, and nothing is written. Fix the draft.

| Field | Rule |
|---|---|
| Every number | Finite. No `NaN`, no infinity. |
| Lengths (`radius`, `stroke`, `spacing`, `margin`, `gutter`, shadow `blur`, logo `height`, progress `thickness`, type `size`) | 0 to 1920 canvas pixels; type `size` 20 to 1920. |
| Shadow `x`, `y`, `spread` | -1920 to 1920. |
| Gradient `angle` | -360 to 360 degrees (the emitter wraps a larger angle). Stop `at`, mesh `x`, `y`, `size`, radial `at`: 0 to 100. `grain`: 0 to 0.4. |
| Easing | `[x1, y1, x2, y2]` with x from 0 to 1 and y from -5 to 5. Durations 0 to 3000 ms. |
| `axes` values | -1000 to 1000. |
| `lineHeight`, `tracking`, `weight` | 0.7 to 2.5; -0.1 to 0.5; 1 to 1000. |
| `grid.columns`, `logo.clearSpace`, logo `aspect`, `icons.strokeWidth` | 1 to 24 (whole); 0 to 10; above 0 up to 50; 0.5 to 4. |
| `oklch()` | Lightness and alpha at most 1 (or 100%), chroma at most 1, hue at most 360. Hex is `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Nothing else is a colour: no `rgb()`, no names, no `var()`. |
| Family names (`family`, each `fallback` entry, `substitute.family`) | Letters, digits, spaces and `- _ . ' & +`, starting with a letter, digit or hyphen, at most 100 characters. No quotes, commas, slashes, semicolons or braces. |
| `features`, and the keys of `axes` | Four-character OpenType tags: `tnum`, `ss01`, `wght`, `opsz`. Not `"ss01" 1`. |
| Font files (`source.files[].path`) | A relative path inside the brand folder ending in `.woff2`, `.woff`, `.ttf` or `.otf`, with no `..` and no leading `/`. The file must really be that kind of font (its first bytes are checked) and must still be inside the brand folder once symlinks are followed. |
| `unicodeRange` | A CSS `unicode-range`: `U+0000-00FF, U+0131, U+4??`. |
| Fontsource `package` | `@fontsource/<name>` or `@fontsource-variable/<name>`, lower case. `axes` is a file-set name (`wght`, `standard`, `full`); `subsets` are kebab-case. |
| Logo files | A relative `.svg`, `.png` or `.webp` path inside the brand folder, the content matching the extension. |
| Names (palette, surface, gradient, logo variant, treatment, easing, duration, the brand itself) | kebab-case; the brand name at most 64 characters. |
| `color.data`, and a surface's replacement `data` lists | `categorical` 3 to 12 colours; `sequential` 3 or more; `diverging` an odd number, 3 or more, with the midpoint in the middle. A surface's lists follow the same counts. |

If the schema moves, `scripts/_brand_rules.py` moves with it: the test `scripts/tests/test_emit_rules.py` pins the behaviour.

## What the framework derives, so you do not have to

The resolver fills a lot in. Emit what the source shows and leave the rest out; `deck brand <name> --json` prints what it ended up as.

- **Missing surfaces.** `inverse`, `accent` and `gradient` are derived from the base roles when the brand omits them. The emitter leaves them out for that reason and prints which ones. Look at them in the rendered decks; if one is wrong for the brand, or `brand check` rejects it, define it in the draft (or re-emit with `--build-surfaces`, which builds them from colours that fit each backdrop).
- **Roles a surface leaves out are inherited from the base roles**, which were chosen for the default background. On a surface the draft does define, the emitter therefore fills the roles the draft left out with colours that fit that backdrop and prints what it filled.
- **Data palettes per surface.** Each surface has a chart `plate`. The categorical colours are moved in lightness, keeping hue and order, until they reach 3:1 on it, and the context colour is held to 3:1 on every plate. Write one base palette; write a surface's own `data` only when the source shows different chart colours there.
- **Code and diagram themes**, per surface.
- **Substitute fonts**, from the fallback stack, when `substitute` is left out. The emitter still writes `substitute` so the choice is visible and reviewable.

## What `brand check` checks

On every surface, against every colour of its backdrop (so a gradient surface must pass at each stop):

| Pair | Minimum | Waivable to 3:1 |
|---|---|---|
| `fg` on `bg`, `fg` on `surface` | 4.5:1 | yes |
| `muted` on `bg`, `muted` on `surface` | 4.5:1 | yes |
| `accent-fg` on `accent` | 4.5:1 | yes |
| `heading` on `bg`, `heading` on `surface` | 3:1 | no |
| `accent` on `bg` | 3:1 | no |
| `positive` on `bg`, `negative` on `bg` | 3:1 | no |

Data palettes, on each surface's chart plate:

| Check | Fails | Warns |
|---|---|---|
| Each categorical colour a surface writes itself, against the plate | under 3:1 | |
| Neighbouring categorical colours, normal vision (OKLab ΔE × 100) | under 10 | 10 to 15 |
| Neighbouring categorical colours under deuteranopia, protanopia, tritanopia | under 8 | |
| Diverging ends, and `positive` against `negative`, under each deficiency | | under 12 |
| `context` against the plate | outside 1.4:1 to 4.5:1 | under 3:1 |
| Categorical count | fewer than 3, more than 12 | |

Code themes: the `added` and `removed` line tints must be told apart (a warning when they are tinted almost alike). They are derived from `positive` and `negative`, so a pair chosen to survive colour-vision deficiency can still give similar pale tints; set `code: { added, removed }` on the surface when the check says so.

Not checked by `brand check` but enforced by `deck lint` on slides: text needs 4.5:1 (3:1 at 24 px and up). Layouts set eyebrows in the accent colour at label size, so in practice **the accent needs 4.5:1 on every surface's background**, not the 3:1 the table gives it.

Also: every palette reference resolves, each surface's `gradient` and `logo` exist, logo and font files exist, a Fontsource package has the weights and styles the scale asks for, and a `substitute` is of the same kind (sans, serif, mono) as the family it stands in for.

What this means for an import:

- **A pair under 3:1 cannot be kept.** An accent at 2.8:1 on the page background (common with orange and teal brands) has to change. Use the nearest passing shade (the check and `check-draft` both suggest one, usually a barely visible shift), set the role to it, keep the exact source colour in the palette, and put the change on the review list with both values.
- **A text pair between 3:1 and 4.5:1 that the source itself uses** (white on a mid-tone accent or gradient) is kept with a waiver whose `reason` says where the source does it. Each waiver is a review item.
- Do not waive what the source does not do, and do not write a waiver to get a derived value past the check: change the derived value.

## How the draft maps onto `brand.ts`

`emit_brand.py` does this. The table is for understanding its output and for fixing the emitter when the schema moves.

| `brand-draft.json` | `brand.ts` | Notes |
|---|---|---|
| `name`, `display_name` | `name`, `label` | |
| `color.palette.<n>.base`, `.scale` | `color.palette.<n>` | `base` becomes a step named `base` unless a scale step already has that colour. Roles that equal a palette colour are written as references. |
| `color.roles` | `color.roles` | `accent_fg` becomes `accent-fg`. Missing `surface`, `accent-fg`, `positive`, `negative` are generated and reported. |
| `color.surfaces.<n>` | `color.surfaces.<n>` | `bg: "gradient:<g>"` becomes `gradient: '<g>'`. Roles a defined surface lacks are filled. Surfaces the draft lacks are left to the framework (`--build-surfaces` builds them). `data`, `code`, `diagram` and `shadow` pass through. |
| `logo.variants[].on` | `color.surfaces.<n>.logo` | |
| `color.data` | `color.data` | Objects are reduced to their `hex`. |
| `waivers` | `color.waivers` | |
| `gradients` | `gradients` | `pos` 0 to 1 becomes `at` in percent; `grain: true` becomes 0.12. |
| `typography.families` | `typography.families` | Including `substitute`. See Fonts. |
| `typography.scale` | `typography.scale` | `h1` → `headline`, `h2` → `title`, `lede` → `lead`, `eyebrow` → `label`, `stat_label` → `caption`. A step the draft lacks is derived from its neighbour and reported; a size under 20 is raised and reported. `transform: uppercase` → `case: 'upper'`; `numeric` → `features`; `axes` passes through. |
| `shape.radius`, `.stroke`, `.shadow` | `shape` | Shadows become layer lists. `pill` has no slot. |
| `shape.margin`, `.grid`, `.spacing` | `spacing` | The spacing scale is defaulted unless the draft gives one. |
| `logo` | `logo` | Each variant's file is copied to `logos/<variant>.<ext>` when it is inside the draft's folder and really an SVG, PNG or WebP; SVG is sanitised on the way (scripts, event handlers, external references, `foreignObject`, images and filters removed, each removal reported). Aspect is read from the file. A file that is refused is reported and the variant is skipped. With no logo file the brand has no logo and `chrome.logo.show` is false. |
| `icons`, `imagery` | `icons`, `imagery` | |
| `chrome` | `chrome` | `hidden_on` containing `title` sets `skipFirst`. |
| `motion` | `motion` | |
| `dataviz` | `charts` | Gridline, axis and label colours are matched to the nearest role and widths to the nearest stroke; number format, big-number colour and table emphasis are mapped. Marks (bar radius, line width) stay in the draft as a record. |
| `code`, `diagram` | `code`, `diagram` | Only when the draft sets them. |
| `layouts`, `provenance`, `review` | not in `brand.ts` | Open review items, `source.kinds` and `source.feel` go to `import-notes.json`, with the emitter's notes. Never into a comment. |

The emitter prints `defaulted:` for every value it had to invent and `note:` for every surface role it filled, every size it raised, every chart colour it matched loosely, every number it clamped, every value it left out because it broke a rule above, and every file or package it refused. The same lines are saved in `import-notes.json`. Read them: each is either something to add to the draft (if you know better) or a line for the review list.

## Fonts and substitutes

- **On Fontsource**: `source: { kind: 'fontsource', package: '@fontsource/<id>', weights: [...] }`. Only `@fontsource/<name>` and `@fontsource-variable/<name>` are named in the `npm install` command the emitter prints; any other package name in a draft is reported as a review item and the family is written as `unavailable`, because `npm install` would otherwise install whatever the source named. In the draft: `{"kind": "fontsource", "id": "<id>"}`, plus `"variable": true` to use `@fontsource-variable/<id>`. The draft may also carry `subsets`, `axes` and `styles`, which are passed through. The emitter asks Fontsource what the package has and narrows `subsets` (and reports missing weights or italics) so the brand does not ask for files that do not exist. Static packages need the weights listed; the emitter collects them from the type scale.
- **User-supplied files**: `kind: 'files'` with `files: [{ path, weight, style?, unicodeRange? }]` under `fonts/`. In the draft the path is relative to the draft, and the file has to be inside the draft's folder: copy the user's font files into the work folder first. The emitter refuses a path that leaves the folder (also through a symlink), an absolute path, and a file whose content is not the font its extension says, and then writes the family as `unavailable` with a note. `weight` is a number, or `[min, max]` for a variable font; `unicode_range` in the draft becomes `unicodeRange`.
- **A font the viewer's machine provides**: `kind: 'system'`.
- **Commercial, files missing**: `kind: 'unavailable'` with a `reason` such as "Tiempos Headline is licensed from Klim; web font files not supplied". Put the best open stand-in first in `fallback` so machines that have it show something close. The check warns until files arrive. `emit_brand.py --stand-in-fonts` instead writes the stand-in as the family with a Fontsource source, for when the user has approved the substitute.
- Never copy fonts extracted from a PDF, a PPTX or a website into `fonts/`.

**`substitute`** is a different thing from the web fallback stack: it is the system font a PowerPoint export names beside the brand font, and the font `deck export --fonts system` measures and renders with, so the deck still breaks lines correctly in Keynote, Google Slides or an Office install without the brand's fonts. Every family gets one:

```ts
display: { family: 'Fraunces', fallback: ['Georgia', 'ui-serif', 'serif'], substitute: { family: 'Georgia' }, source: … }
```

- Use a family every office machine has, of the same kind as the brand font: Arial (or Verdana, Calibri, Segoe UI) for a sans, Georgia (or Times New Roman, Cambria) for a serif, Courier New (or Consolas, Menlo) for a mono. `{ family }` is enough for these.
- Any other family needs `panose` (the 20 hex digits of its OS/2 PANOSE classification) so apps can pick something similar; `pitchFamily` and `charset` are optional.
- `brand check` warns when the substitute is a different kind from the family (a serif standing in for a sans), judged from the fallback stack. So the fallback stack must say what the family is: end a serif's stack in `serif`, not `sans-serif`.
- In the draft, set `category` (`sans`, `serif`, `mono`) on the family and the emitter picks the default; give `substitute` only when a closer common family exists.

## Reading the check's output

```
error   color.roles.accent: On the default surface, accent #ff5a36 on bg #f7f4ee has contrast 2.83:1; accent text and marks needs 3:1.
        Fix: Change accent to a color such as "#f8532f", or change color.roles.bg.
```

- The path is a `brand.ts` path. Map it back to the draft (`color.roles.accent-fg` is `color.roles.accent_fg` there) and fix it there.
- "No single fg color passes on every background; change gradients.<name>" means the text colour cannot reach 4.5:1 at every stop. If the source does exactly this, add waivers for `fg` and `muted` on that surface. If it still fails at 3:1, the gradient surface needs a different text colour or the gradient needs darker stops.
- Schema errors (a missing step, a size under 20, a shadow written as a string, a bad palette reference) name the field and show the expected form.
- Warnings do not block. Each one is a waiver you wrote, an `unavailable` font, data colours closer than comfortable, `positive` and `negative` that look alike under a colour-vision deficiency, or a mismatched substitute. All of them belong on the review list or get fixed.

## Rendering the brand

The workspace has no sample deck, so `scripts/make_specimen.py <name>` builds one (`decks/zz-<name>-specimen`, from the framework's own layout examples, with `--brand <name>`). Any deck renders in any brand with `--brand`, with no edits:

```bash
python3 $SKILL_DIR/scripts/make_specimen.py <name>
deck shot zz-<name>-specimen              # every layout, all four surfaces, type scale, logo and chrome;
                                          #   figures and tables: data palettes and `charts` tokens
deck lint zz-<name>-specimen              # overflow or contrast problems the brand's sizes cause
```

For code blocks, terminals and diagrams, which the specimen does not cover, add slides with `deck new slide <deck> <id> --layout code` (or `diagram`): the layout's example carries a working one. Screenshots go to `.deck/shots/<deck>@<name>/` when you pass `--brand`, else `.deck/shots/<deck>/`. `uv run $SKILL_DIR/scripts/compare.py` puts a source page next to a screenshot, and `--sheet` makes a contact sheet of a folder. The specimen's wording is the framework's, so compare treatment, not content: pair like with like (cover with cover, a chart page with a chart slide).

`deck lint zz-<name>-specimen` matters because a brand can be valid and still break slides: a display size too large for the layouts' title lines, margins that squeeze the content, a wide typeface that overflows. Lint errors on a specimen that is clean in the default brand are caused by the brand: fix the scale or spacing in the draft.

## Where things go, and what not to commit

- `brands/<name>/`: part of the workspace, and what the user keeps (commit it with their decks if they use git).
- Work files (extraction folders with page renders, `analysis.json`, `brand-draft.json`, comparison images): keep them outside the workspace, in the `mktemp -d` work folder. Page renders of someone else's deck may be confidential, so nothing in it is committed or shared without asking. The draft is worth keeping: it is the record of where each value came from; offer to save it next to the brand.
- `.deck/shots/` is generated output.

## Not in the schema

- **Chart mark geometry** (bar radius, bar gap, line width, markers): owned by the chart components, which draw them from the brand's `shape` tokens. Keep what the source does in the draft's `dataviz` section and mention a strong mismatch in the review list.
- **A pill radius**, **per-step text colour**, **decoration or rule colours**, **card and button tokens**: keep them in the draft and in `layouts[].notes`.
- **Layout overrides.** A brand is tokens; it cannot move a title or place a shape in a layout's content. Decorative backgrounds (a photo, a corner mark, a pattern) are surface `background` layers, and a layout picks them through its default surface. Where the source's pages have a structure no layout offers, record it in `layouts[]` with `override_needed` and a note, and say so in the handover.
