# `extraction.json` (schema `brand-extraction/1`)

The neutral output of every extractor. It describes the **source**, not the brand, and knows nothing about `brand.ts`. The framework's `deck brand extract` is expected to write the same shape, so the rest of the skill does not care which tool produced it.

An extraction is a folder:

```
<out>/
  extraction.json
  analysis.json            written by `brand_tools.py analyze`
  pages/page-NNN.png       one render per page or slide (web: full-page screenshot, plus page-NNN-fold.png)
  pages/contact-sheet.png  all pages in one image, labelled
  assets/                  media, images, chrome (repeated-region crops), logos, charts
  source.pdf               PPTX only: the intermediate PDF, when one was made
```

All paths inside the JSON are relative to the folder. All bounding boxes are `[x, y, w, h]` as fractions of the page, origin top-left. Colours are `#RRGGBB` upper case.

## Top level

| Key | Meaning |
|---|---|
| `schema` | `"brand-extraction/1"` |
| `source` | `type` (`pptx`, `pdf`, `gslides`, `web`, `images`), `path` or `url`, `page_count`, `page_size`, `aspect`, `canvas_scale` (how sizes map to the 1080-high canvas) |
| `tool` | Which script and library versions wrote it |
| `declared` | What the source states outright. See below |
| `observed` | What the pages actually use, weighted |
| `pages[]` | One entry per page |
| `masters[]`, `layouts[]` | PPTX and Google Slides only |
| `assets` | Files written next to the JSON |
| `dataviz` | `charts[]`, `tables[]`, `big_numbers[]` |
| `blocked[]` | Web only: every request the page asked for that was refused, `{url, reason, by}` (`by` is `fetch` for the script's own downloads, `browser` for the page's). Report it; never fetch these yourself |
| `warnings[]` | Read these first |

## `declared`

- `colors[]`: `{name, hex, origin, used}`. `origin` is `theme:accent1`, `css-var:--brand`, or `stated-in-text` (a guidelines PDF). `used: false` means nothing on the pages references it.
- `fonts[]`: `{role, family, origin}`. PPTX roles are `major` (headings) and `minor` (body). Web roles are custom-property names.
- Web only: `tokens[]` (radius, shadow, spacing, gradient and motion custom properties), `font_faces[]` (`family, weight, style, files[{url, host, licence_note, metadata}]`), `meta` (`theme_color`, `og_image`...), `dark_scheme_overrides`.

## `observed`

- `colors[]`: `{hex, weight, page_share, uses, pages}`. `uses` holds raw amounts per kind: `text` (characters), `fill` (area fraction summed over pages), `stroke`, `background` (pages). `weight` combines them for sorting only; do not read meaning into its absolute value. PPTX adds `theme_refs`, `hard_coded_uses`, `in_theme`.
- `fonts[]`: `{family, share, sizes_pt[] | weights_used}` plus source-specific fields: `raw`, `subset`, `embedded`, `name_in_font_file`, `licence_evidence`, `metrics` (PDF); `theme_role`, `via_theme_share`, `installed_on_this_machine` (PPTX); `webfont`, `hosts`, `licence_note`, `system_or_generic` (web).
- `text_styles[]`: one entry per distinct combination of family, weight, size and colour, with `chars`, `pages`, a `sample`, and `size_canvas_px` (PDF, PPTX) or `size_px` (web, CSS pixels).
- `gradients[]`: `{type, css_angle_deg, stops[{pos, hex}], origin}`. `origin` is `ooxml`, `css`, `pdf-shading` (all exact) or `pixels` (estimated).
- `shapes`: corner radii (canvas px for PDF and PPTX, CSS for web) and stroke styles, with counts.
- Web only: `color_pairs[]` (`background, foreground, chars, contrast`), `motion.transitions[]`, `components` (computed style of a representative heading, paragraph, button, card, table cell...), `icons`.

## `pages[]`

`{index, image, background, text_blocks[], images[], layout_hints[], palette[]}`.

- `background`: `{kind: solid | gradient | image, hex | stops...}`. PPTX also has `from` (slide, layout or master) and, when rendered, `pixels` with what the image shows. If the two disagree, a picture or shape covers the declared background.
- `text_blocks[]`: the largest blocks first: `{bbox, text, family, weight | bold, size_pt, size_canvas_px, color}`; PPTX adds `placeholder`.
- `layout_hints[]`: cheap guesses (`chart`, `table`, `stats`, `big-number`, `quote`, `code`, `title-or-section-or-statement`, `split-with-image`, `full-bleed-image`). They label the contact sheet. They are prompts for looking, not classifications.
- PPTX adds `layout: {name, type}`; web adds `url`, `fold_image`.

## `layouts[]` (PPTX)

`{name, type, master, background, placeholders[{type, idx, bbox, text_style}], pictures[], used_by[]}`, most used first. `type` is the OOXML layout type (`title`, `obj`, `secHead`, `twoObj`, `titleOnly`, `blank`...). `masters[]` carry `color_map`, `text_styles` (title, body, other by level) and `pictures`.

## `assets`

- PPTX: `images[]` with `file`, placements, `on_masters`, `on_layouts`, `on_slides`, `logo_candidate_score`.
- PDF: `images[]` (embedded rasters) and `chrome[]`: regions repeated across pages, each with `png`, `svg`, `bbox`, `placement`, `pages`, `logo_candidate_score`.
- Web: `logos[]` (`file`, `png`, `why`, `score`, `background`, `uses_current_color`, and `blocked` with the reason when the image was refused) and `icons[]` (favicons, likewise). SVG files here are already sanitised.

## `dataviz`

- `charts[]`: always `page`, `bbox`, `origin`, `confidence`, `series_colors`.
  - `origin: "ooxml-chart"` (confidence 1): `kind`, `plots[]` (direction, grouping, gap width, `data_labels`), `series[]` (`name`, `color`, `color_source`, `line`, `point_overrides`), `axes[]` (`visible`, `gridlines{color, width_pt, dash}`, `axis_line`, `number_format`, `label_text`), `legend`, `text`.
  - `origin: "vector-heuristic"` (PDF) and `"svg"` (web): `kind_guess`, `gridlines`, `text_styles[]`, `number_formats[]`, `highlight_pattern`, `bar_corner_rounded`, `direct_labels_guess` / `has_legend_guess`.
  - `origin: "canvas"`: an element screenshot and its palette only.
- `tables[]`: `header` and `body` fill and text style, borders, `banded_guess`; PPTX adds `style_flags`.
- `big_numbers[]`: `{page, text, family, size, color, format, label}` where `format` describes how the number is written (prefix, suffix, decimals, separators, compact notation, space before the unit).

## Stability

Fields may be added. Renames or removals bump the schema string. Consumers should ignore unknown keys and treat missing optional keys as "not available from this source type".
