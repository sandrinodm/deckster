# `brand-draft.json` (format `brand-draft/1`)

The neutral record of the synthesized brand. It exists for three reasons:

- `emit_brand.py` generates `brands/<name>/brand.ts` from it, and `check-draft` reads it.
- It keeps what `brand.ts` has no place for: provenance, confidence, the review list, and the mapping from source pages to layouts. When the source is a template it also holds the brand's own layouts as specs (below), which `emit_brand.py` writes to `layouts.ts`.
- It isolates the skill from schema changes. Only `brand-schema.md` and `emit_brand.py` know how this maps onto `brand.ts`.

Keep it next to the extraction, with assets referenced by paths relative to the draft file.

## Shape

The example is a made-up brand. Comments are for explanation; the real file is plain JSON.

```jsonc
{
  "draft": "brand-draft/1",
  "name": "northlight",                    // folder-safe id
  "display_name": "Northlight",
  "source": { "kinds": ["pptx", "web"], "aspect": "16:9", "feel": "calm, technical, generous whitespace" },

  "color": {
    "palette": {                           // named colours; base is the exact source hex
      "blue":  { "base": "#0B3D91", "scale": { "50": "#EEF3FB", "500": "#0B3D91", "900": "#061F4A" } },
      "amber": { "base": "#F2A900" },
      "ink":   { "base": "#101418" },
      "mist":  { "base": "#F4F6F8" }
    },
    "roles": {                             // the default surface, spelled out
      "bg": "#FFFFFF", "surface": "#F4F6F8", "fg": "#101418", "muted": "#5A6572",
      "accent": "#0B3D91", "accent_fg": "#FFFFFF", "border": "#D8DEE5"
    },
    "surfaces": {                          // each remaps roles; "default" is required
      "default": { "bg": "#FFFFFF", "fg": "#101418", "muted": "#5A6572", "accent": "#0B3D91", "accent_fg": "#FFFFFF", "border": "#D8DEE5", "surface": "#F4F6F8" },
      "inverse": { "bg": "#101418", "fg": "#FFFFFF", "muted": "#A7B0BA", "accent": "#F2A900", "accent_fg": "#101418", "border": "#2B333B", "surface": "#1A2026" },
      "accent":  { "bg": "#0B3D91", "fg": "#FFFFFF", "muted": "#C9D6EE", "accent": "#F2A900", "accent_fg": "#101418", "border": "#3A62AB" },
      "gradient": { "bg": "gradient:dusk", "fg": "#FFFFFF", "muted": "#E3E9F5", "accent": "#F2A900", "border": "#FFFFFF" }
    },
    "data": {
      "categorical": ["#0B3D91", "#C68900", "#1B998B", "#7F4400", "#A781E5", "#4960BD"],   // or objects: {hex, origin, adjusted_from, inverse_variant}; amber is darkened from #F2A900 to reach 3:1 on white
      "categorical_safe_count": 6,
      "highlight": "#0B3D91",
      "context": "#8E949C",                // about 3:1 on the default background
      "sequential": ["#E6EFFF", "#C2D9FF", "#98BCF8", "#6F9BE7", "#4778CE", "#345999", "#233C67"],
      "diverging": ["#845A00", "#B48A47", "#D9C09C", "#EDEBE7", "#AFC5EB", "#6D92D2", "#2D5FB6"]
    }
  },

  "gradients": {
    "dusk": { "type": "linear", "angle": 160, "stops": [ { "pos": 0, "color": "#0B3D91" }, { "pos": 1, "color": "#101418" } ], "grain": false, "used_for": "title and closing backgrounds" }
    // radial: { "type": "radial", "at": "30% 20%", "stops": [...] }
    // mesh:   { "type": "mesh", "stops": [{ "pos": 0, "color": "#base" }], "points": [{ "at": "20% 30%", "color": "#..." }], "grain": true }
  },

  "typography": {
    "families": {                          // display, body and mono are required
      "display": { "family": "Tiempos Headline", "source": { "kind": "unavailable" }, "fallback_family": "Source Serif 4",
                   "weights": [600], "fallback": "serif", "category": "serif",   // sans | serif | mono: picks the system substitute (Arial, Georgia, Courier New)
                   "licence": "commercial (Klim); web font files not supplied" },
      "body":    { "family": "Inter", "source": { "kind": "fontsource", "id": "inter", "license": "OFL-1.1" }, "weights": [400, 600], "fallback": "sans-serif" },
      "mono":    { "family": "JetBrains Mono", "source": { "kind": "fontsource", "id": "jetbrains-mono", "license": "OFL-1.1" }, "weights": [400], "fallback": "monospace", "chosen": true }
    },
    "scale": {                             // sizes in canvas px (1920x1080); tracking in em
      "display":    { "family": "display", "size": 132, "line_height": 1.02, "tracking": -0.02, "weight": 600 },
      "h1":         { "family": "display", "size": 76,  "line_height": 1.08, "tracking": -0.01, "weight": 600 },
      "h2":         { "family": "body",    "size": 44,  "line_height": 1.2,  "tracking": 0,     "weight": 600 },
      "body":       { "family": "body",    "size": 32,  "line_height": 1.45, "tracking": 0,     "weight": 400 },
      "small":      { "family": "body",    "size": 26,  "line_height": 1.4,  "tracking": 0,     "weight": 400 },
      "caption":    { "family": "body",    "size": 22,  "line_height": 1.3,  "tracking": 0.01,  "weight": 400 },
      "eyebrow":    { "family": "body",    "size": 22,  "line_height": 1.2,  "tracking": 0.1,   "weight": 600, "transform": "uppercase" },
      "quote":      { "family": "display", "size": 60,  "line_height": 1.2,  "tracking": 0,     "weight": 600 },
      "stat":       { "family": "display", "size": 140, "line_height": 1,    "tracking": -0.02, "weight": 600, "numeric": "tabular-nums" },
      "stat_label": { "family": "body",    "size": 26,  "line_height": 1.3,  "tracking": 0,     "weight": 400 },
      "code":       { "family": "mono",    "size": 26,  "line_height": 1.5,  "tracking": 0,     "weight": 400 },
      "label":      { "family": "body",    "size": 20,  "line_height": 1.2,  "tracking": 0,     "weight": 400 }   // 20 is the smallest size the framework accepts
    },
    "eyebrow_color": "#0B3D91"
  },

  "shape": {
    "radius": { "sm": 4, "lg": 12, "pill": 999 },
    "stroke": { "width": 2 },
    "shadow": { "card": "none" },          // "none", a CSS box-shadow string, or layers [{ "y": 8, "blur": 24, "spread": -8, "color": "#101418", ... }]; also "sm" and "lg"
    "margin": { "x": 120, "y": 96 },
    "grid": { "columns": 12, "gutter": 32 },
    "list_rules": false,                   // hairlines between list items
    "density": "about 45% of a content slide is empty"
  },

  "logo": {
    "variants": [ { "name": "primary", "file": "logos/northlight.svg", "on": ["default"] },
                  { "name": "reversed", "file": "logos/northlight-white.svg", "on": ["inverse", "accent", "gradient"] } ],
    "placement": "bottom-left", "height": 44, "offset_y": 56, "clear_space": "height of the mark"
  },
  "icons":   { "set": "lucide", "style": "stroke", "stroke_width": 1.75, "chosen": true },
  "imagery": { "kind": "photography", "treatment": "full colour, rounded 12", "notes": "people at work, cool light" },
  "chrome":  { "page_number": { "show": true, "format": "00", "position": "bottom-right" }, "footer": null, "progress": false, "hidden_on": ["title", "section", "closing"] },
  "motion":  { "feel": "calm", "easing": { "standard": "cubic-bezier(0.2, 0, 0, 1)", "emphasized": "cubic-bezier(0.16, 1, 0.3, 1)", "exit": "cubic-bezier(0.4, 0, 1, 1)" }, "duration": { "fast": 200, "base": 350, "slow": 500 }, "transition": "fade", "derived": true },

  "dataviz": {
    "source_has_charts": true, "source_style_is_deliberate": true,
    "gridlines": { "show": true, "color": "#D8DEE5", "width": 2, "dash": null, "direction": "horizontal" },
    "axis": { "line": false, "ticks": false, "label_color": "#5A6572", "titles": false },
    "labels": { "direct": true, "legend": null, "weight": 600 },
    "bar": { "radius": 4, "width": 220 },
    "line": { "width": 5, "markers": "end" },
    "number_format": { "decimals": 1, "decimal_separator": ".", "thousands_separator": ",", "compact": true, "space_before_unit": false, "delta": "+12%" },
    "stat": { "style": "stat", "colors": ["#0B3D91"], "card": false, "label_position": "below" },
    "table": { "header_bg": "transparent", "header_fg": "#5A6572", "rule_color": "#D8DEE5", "rule_width": 2, "banded": false, "emphasis": "accent colour, bold" }
  },

  "waivers": [                             // text pairs between 3:1 and 4.5:1 that the SOURCE uses; each is also a review item
    { "color": "muted", "on": "bg", "surface": "accent", "reason": "source sets pale-blue captions on the brand blue at 28 px" }
  ],

  "layouts": [
    { "archetype": "title",   "maps_to": "title",   "surface": "gradient", "source_pages": [1],        "notes": "title bottom-left, logo top-left", "override_needed": true },
    { "archetype": "section", "maps_to": "section", "surface": "accent",   "source_pages": [4, 9, 15], "notes": "large section number above the title", "override_needed": false },
    { "archetype": "stats",   "maps_to": "stats",   "surface": "default",  "source_pages": [6],        "notes": "three figures, no cards, hairline above each" },
    { "archetype": "chart",   "maps_to": "content", "surface": "default",  "source_pages": [7, 8, 11], "notes": "takeaway headline, chart full width" }
  ],

  // A layout spec (from a template; see "Layout specs" below) goes in the same array:
  // { "key": "m1/slideLayout2", "name": "title-and-content", "label": "Title and Content", "description": "...", "fallback": "content", "surface": "default",
  //   "title": { "box": [154, 65, 1613, 194], "type": "headline", "align": "start" },
  //   "regions": [ { "bind": { "slot": "body" }, "box": [154, 302, 1613, 626], "type": "body" } ],
  //   "background": { "inverse": [ { "source": "pptx/layouts/m2-slideLayout11.svg", "fit": "cover" } ] },
  //   "chrome": { "pageNumber": [1498, 994, 307, 54] }, "keep": true, "notes": [] }

  "provenance": {
    "color.roles":           { "source": "observed", "confidence": 0.9,  "evidence": "theme slots used on 22 of 24 slides" },
    "color.surfaces.inverse":{ "source": "observed", "confidence": 0.8,  "evidence": "section slides 4, 9, 15" },
    "color.data":            { "source": "derived",  "confidence": 0.55, "evidence": "first two from chart series; four generated" },
    "typography.families.display": { "source": "observed", "confidence": 0.9, "evidence": "embedded font name; licence unresolved" },
    "motion":                { "source": "derived",  "confidence": 0.3,  "evidence": "static source; chosen from overall feel" }
  },

  "review": [
    { "topic": "fonts",  "severity": "blocker", "question": "Tiempos Headline is commercial. Supply licensed WOFF2 files, or approve Source Serif 4 as the stand-in?" },
    { "topic": "colour", "severity": "check",   "question": "Amber on white is 2.0:1. It is restricted to fills and large figures; confirm it is never needed for body text." },
    { "topic": "logo",   "severity": "check",   "question": "No reversed logo was found. Is there a white version for dark slides?" },
    { "topic": "guess",  "severity": "fyi",     "question": "Motion and the icon set were chosen to fit the brand's feel, not extracted." }
  ]
}
```

## Rules

- **Required**: `name`, `color.roles` (`bg fg muted accent border`), `color.surfaces.default`, `color.data` (`categorical` with 3 to 12 colours, `sequential`, `diverging`, `context`), `typography.families` (`display body mono`), `typography.scale` (`display h1 h2 body caption` at least), `layouts`, `review`. `check-draft` enforces these.
- **Roles**: also `surface`, `accent_fg`, `heading` (only when headlines are not `fg`), `positive`, `negative`. What the draft leaves out, `emit_brand.py` generates and reports. Give every surface you define its own `fg`, `muted`, `accent` and, where the source shows them, `surface` and `border`: a surface does not inherit sensibly from the default roles.
- **Type steps** may use the draft names (`h1`, `h2`, `lede`, `eyebrow`, `stat_label`) or the framework's (`headline`, `title`, `lead`, `label`, `caption`). The framework has exactly `display headline title lead body small caption label stat quote code`: `eyebrow` becomes `label` and `stat_label` becomes `caption`, so if the source's eyebrow and chart axis text differ, the eyebrow wins the `label` step.
- **Hexes are exact source values** unless the provenance says derived or adjusted.
- **Surface `bg`** is a hex or `"gradient:<name>"` pointing into `gradients`.
- **Optional roles**: `heading` (headline colour when it differs from `fg`) and `eyebrow` may be set in `roles` and per surface. Other extra roles (`link`, `decoration`) are allowed and ignored by the emitter.
- **`waivers`**: `[{"color": "fg", "on": "bg", "surface": "gradient", "reason": "source sets white display type on the coral end, 3.1:1"}]`. Text pairs (`fg` or `muted` on `bg` or `surface`, `accent_fg` on `accent`) that the source itself uses between 3:1 and 4.5:1. They become `color.waivers` in `brand.ts`; the build warns instead of failing. Leave out `surface` to waive the pair everywhere. Nothing under 3:1 can be waived, and `heading`, `accent`, `positive` and `negative` on `bg` (3:1 pairs) cannot be waived at all.
- **`dataviz`** becomes the brand's `charts` section. The schema takes role names and stroke names there, not raw values, so the emitter matches each observed value to the nearest one: `gridlines` (`show`, `color`, `width`, `dash`: an SVG dash string or `null` for solid), `axis` (`line`, `ticks`, `label_color`), `number_format` (`locale` or the separators, `compact`, `currency` as an ISO code, `decimals` or `max_decimals`, `delta` such as `+12%`), `stat.colors` (the first decides whether big numbers take the heading or the accent colour), `table` (`emphasis`: words such as fill, text or bar; `rule_width`; `banded`). Everything else under `dataviz` (bar radius, line width, label positions) is a record for people: the chart components own those.
- **`logo.variants[].on`** lists the surfaces a variant may appear on. A surface that no variant lists shows the default variant, so say in `review` when a reversed logo is missing. `chrome.hidden_on` containing `title` sets `skipFirst` (no chrome on the cover).
- **Files the draft names** (`logo.variants[].file`, font `source.files[].path`) are relative to the draft and must be inside the draft's folder: copy what you want to use into the work folder first. The emitter refuses absolute paths, paths that leave the folder (also through a symlink) and files whose content is not what the extension says (logos: `.svg`, `.png`, `.webp`; fonts: `.woff2`, `.woff`, `.ttf`, `.otf`), and names the copies itself.
- **Text in the draft is data.** `display_name`, `source.feel`, review questions, waiver reasons and the like are written into `brand.ts` only as string literals, and into `import-notes.json`. Family names keep only letters, digits, spaces and `- _ . ' & +`; `references/brand-schema.md` lists every limit the emitter applies.
- **Font `source.kind`**: `fontsource` (with `id`, and `"variable": true` to use the variable package; `package`, when given, must be `@fontsource/<name>` or `@fontsource-variable/<name>`), `files` (`[{ "path", "weight", "style"?, "unicode_range"? }]`, supplied by the user), `system`, or `unavailable` (a licensed font whose files are missing; `licence` gives the reason and `fallback_family` names the open stand-in).
  For an unavailable font the rendered decks show whatever the fallback stack resolves to on this machine. Say in the review list which stand-in the screenshots show.
- **`substitute`** on a family (optional): the system font PowerPoint export and `--fonts system` use, as a name or `{ "family", "panose" }`. Leave it out and the emitter picks Arial, Georgia or Courier New from `category` (or the fallback stack). Give one only when a closer common family exists (Verdana for a wide sans, Times New Roman for a transitional serif); a family the export does not know needs its `panose` (20 hex digits).
- **Also read by the emitter**: `shape.radius.md` and `.xl`, `shape.stroke.hairline` and `.bold`, `chrome.footer` as text or `{ "text", "position": "bottom-right" }`, `chrome.progress` as `{ "edge", "thickness" }`, `chrome.logo_on_every_slide`, `imagery.duotone` as `{ "shadow", "highlight" }`, `typography.scale.<step>.axes` (variable-font axes), `dataviz.number_format.sign_display` (`auto`, `always`, `exceptZero`: how chart numbers show their sign). A surface role may be a hex, an `oklch(...)` literal or a palette reference with alpha (`paper.50/16`); it is kept as written.
- **Variable fonts**: `source.axes` on a Fontsource variable family names the axis set the package file carries (`standard` is weight only; `opsz`, `full` and others exist per family: list `node_modules/@fontsource-variable/<id>/files` to see which), and a step's `axes` sets values (`{ "opsz": 144 }`). A mesh point's `size` is its glow's radius in percent of the slide.
- **Type sizes** are at least 20 canvas pixels; the emitter raises anything smaller and says so.
- **`code`, `diagram`** (optional, top level or inside a surface): colour overrides for the code theme (`background foreground comment keyword string number function type punctuation highlight added removed`) and the diagram theme (`node node_border node_text group edge label highlight highlight_text packet`). Leave them out unless the source shows code or diagrams styled in a way the derived themes do not match.
- **`diagram` look** (optional, top level only) uses the brand's own field names. The emitter handles named `edges.stroke` and `groups.stroke`, legacy `groups.dashed`, `labels`, `kinds` and base cards. Surface `diagram.cards` takes the base colour fields (`fill`, `border`, `text`, `subtext`, `icon.color`, `icon.fill`, `accent.color`). A card hex that matches a palette step becomes a reference. The emitter preserves roles such as `accent/12` and `none` where allowed, reports invalid supported values and caps emitted cards at 12. Record newer controls with the source evidence and apply them to the emitted literal on a compatible build. See [Applying expanded diagram controls](synthesis.md#applying-expanded-diagram-controls).
- **`color.surfaces.<n>.data.plate`** (optional): the backdrop charts are drawn on for that surface, when the source sets charts on a panel instead of the page.
- **`chosen: true` / `derived: true`** mark values you picked rather than found. They feed the review list.
- **`layouts[].archetype`** is your name for the kind of page (`chart` and `agenda` are fine). **`layouts[].maps_to`** is a layout name from the target deck and brand’s live catalog, or `null` with a note describing the structural gap. See [Choosing layouts](choosing-layouts.md).
- **`review[].severity`**: `blocker` (the brand cannot ship without it: an unlicensed font, a missing logo), `check` (a decision or a contrast failure), `fyi` (a guess the user may want to know about).
- Unknown keys are allowed. Put anything the source has that this format lacks under a sensible name and mention it in `review`, so the schema owner hears about it.

## Layout specs (`layouts[]` entries from a template)

`layouts[]` takes two kinds of entry. The notes above (`archetype`, `maps_to`, `override_needed`) say how the source's pages use the kit's layouts. A **spec** is a layout the brand brings: an entry with `name` and `fallback` (or `regions`). `brand_tools.py propose-layouts <extraction.json> --draft brand-draft.json --catalog catalog.json` writes one spec per source layout, keeping your notes; the agent reviews them. `check-draft` validates the specs against the catalog (`deckster layouts <deck> --json`); `emit_brand.py` writes the kept ones to `brands/<name>/layouts.ts` and copies their art to `brands/<name>/layouts/`.

| Field | Meaning |
|---|---|
| `name` | kebab-case, unique, never a kit or engine layout's name (a clash gets the brand prefix: `acme-title`). Same-named layouts on two masters with the same geometry are one layout; with different geometry the master's name is a suffix. |
| `label` | the name in the source template. |
| `description` | required; one sentence on what the layout is for. Custom prompt texts from the template are appended to it. |
| `fallback` | required: the kit or engine layout a slide uses on a brand that lacks this layout. `propose-layouts` picks a candidate from the full catalog using the source placeholder roles. Review it against required slots, fields and title. A `null` proposal comes with `keep: false`. See [Choose a template fallback](choosing-layouts.md#choose-a-template-fallback). |
| `surface` | the surface the layout's master or own background belongs to (the nearest surface to the rendered background). |
| `title` | `{ box, type?, align?, anchor?, color? }`, or `false` for none. Required. |
| `regions[]` | `{ bind: { slot } or { field }, box, kind? (text, media, content), type?, align?, anchor?, color?, fit?, treatment? }`. `box` is `[x, y, w, h]` in canvas pixels (1920x1080, inside it, at least 40). `type` is a type step and `color` a role: both only on text regions; `fit` and `treatment` only on media. At most 12. Placeholder to binding: title and ctrTitle to the title; subTitle to a free text slot (or a text field); the first body or content placeholder to `body`, further ones to the fallback's other text slots in reading order; pic to the slot that accepts images (`media`); chart, table, diagram to a slot that accepts them. A placeholder with no place on the fallback is dropped and noted. Untagged MDX needs a region bound to `body`. Bind only slots and fields the fallback declares. |
| `background` | art keyed by the surface it was drawn on: `{ "inverse": [ { "source": "<svg or png next to the draft>", "fit": "cover" | "contain" } ] }`. Rendered art has fixed colours, so a light and a dark master's versions of one layout are two keys. Emitted as `image` layers in `layouts/<name>-<surface>.<ext>`. |
| `chrome` | `{ pageNumber: [x, y, w, h] }` from the page-number placeholder; `logo: false` when the layout or its master has a picture: it is in the art, so the brand draws no second logo (the emitter drops this again if the sanitiser could not keep the picture); `pageNumber: false` / `footer: false` when the layout has no such placeholder and the brand shows one. Review the source for date placeholders that need a separate field or artwork treatment. |
| `fields` | Frontmatter fields accepted by the brand layout even when they do not bind to regions. Include every required fallback field that lacks a binding. The slide supplies the values. |
| `keep` | `false` drops the layout from `layouts.ts` (near-duplicates, unused layouts, ones with no fallback). Default true. |
| `key`, `keys`, `sources`, `unused`, `aspect_rule`, `notes` | for the agent and the specimen: which source layouts it came from, whether no slide used it, the 4:3 rule applied, and what to look at. Not emitted (`import-notes.json` keeps them). |

**Sizes.** A placeholder's size in points becomes canvas pixels (x 1920 / slide width for a 16:9 source) and then the nearest type step of the draft's `typography.scale`; a size more than 15% from every step gets no step and a note. **Other aspects** (4:3): everything scales by the same factor to the canvas height and is centred (`aspect_rule: uniform`; the art is `contain`, the bands show the surface); a layout with no art may use `stretch` (`propose-layouts --aspect-rule stretch`: boxes map proportionally on each axis, sizes scale by 1920 / width). The rule each layout got is in its notes.

Text in a spec (`name`, `label`, `description`) comes from the template: the emitter writes it as capped string literals only, and names art files itself from the layout name.
