# Source types: what each gives, what it cannot, and how to extract it

Findings here were verified by running the bundled scripts on real files unless marked *(not verified)*.

## Contents

- [At a glance](#at-a-glance)
- [PPTX](#pptx)
- [PDF](#pdf)
- [Google Slides](#google-slides)
- [Websites](#websites)
- [Brand guidelines documents](#brand-guidelines-documents)
- [Images and screenshots](#images-and-screenshots)
- [System dependencies](#system-dependencies)

## Limits the scripts apply to every source

A source file or page is someone else's data. The extractors refuse the ways it could reach beyond itself, and say so in `warnings[]` (the web extractor also lists each refusal in `blocked[]`). A refusal is a result to report, not an obstacle to get around.

- **Archives (PPTX, Slides export):** at most 5,000 entries, 200 MB per entry (64 MB for an XML part, 100 MB for a media file), 1 GB in total, and no entry that expands more than 250 times; XML parts must be UTF-8 and may not declare a DTD or entities, in any encoding; at most 600 media files, written under their own plain file names only.
- **PDF:** at most 1 GB, at most 200 pages rendered (60 by default), no page image or embedded image over 40 megapixels.
- **Web:** only `http:` and `https:`, only hosts whose every address is public, on every redirect hop; 8 MB per resource, 64 MB per run, 15 s per resource and a wall-clock limit for the run; images and fonts must be what their content type and first bytes say. `file:` is read only for a local page you pass, inside its own folder.
- **SVG** from any source is reduced to static drawing before it is saved by the web extractor or copied into a brand.
- **Keynote rendering** passes file paths as arguments to a fixed script.

## At a glance

| | PPTX | PDF | Google Slides | Website | Images |
|---|---|---|---|---|---|
| Exact colours | yes | yes (vector), ±1 (pixels) | yes | yes | flat colours yes, JPEG approximate |
| Named colours / intent | theme slots | no | theme slots (often unused) | custom properties | no |
| Font family names | yes | yes, from embedded font names | yes | yes | no |
| Reusable font files | no | no (subsets) | no | no (licence) | no |
| Font sizes | exact, with inheritance | exact | exact | CSS px, different medium | estimate only |
| Line height, tracking | partly | line height yes, tracking no | partly | yes | no |
| Gradients | exact stops and angle | exact when a PDF shading; else pixel estimate | exact | exact CSS | pixel estimate |
| Layout structure | masters, layouts, placeholders | positions only | masters, layouts | DOM (not slide-like) | by eye |
| Charts | native: series, axes, formats | vector heuristic | become images in export | SVG yes, canvas pixels only | by eye |
| Logo | media on master/layout | repeated region crop (PNG/SVG) | media | inline SVG / img / favicon | crop by hand |
| Motion | transitions exist, rarely meaningful | none | none | transitions and easings | none |

## PPTX

`extract_pptx.py` parses the OOXML package with the standard library.

**Reliable**

- Theme colour scheme (`dk1 lt1 dk2 lt2 accent1..6 hlink folHlink`) and font scheme (major = headings, minor = body), resolved through the master's colour map (`tx1 -> dk1`, `bg1 -> lt1`...).
- Which theme slots are actually referenced (`declared.colors[].used`) and which colours are hard-coded (`observed.colors[].hard_coded_uses`, `in_theme`).
- Masters and layouts: names, placeholder types and geometry (normalised 0..1), backgrounds, pictures placed on them, and which slides use which layout.
- Text: effective family, size, weight and colour per run, following the inheritance chain (run, shape list style, layout placeholder, master placeholder, master text styles) and `normAutofit` shrink.
- Gradient fills: stops, positions and angle. OOXML angles run clockwise from "left to right", so CSS angle = OOXML angle + 90.
- Corner radii from `roundRect` adjust values, converted to canvas pixels.
- Native charts (`ppt/charts/chartN.xml`): chart kind, series names and colours, per-point overrides (the highlight convention), gap width, data-label visibility, position and number format, axis visibility, gridline colour/width/dash, tick-label style, legend position, chart-wide font. A series with no explicit fill is reported as `color_source: "theme-order:accentN"`, because PowerPoint cycles the accents in order.
- Tables: header and body fill and text style, borders, banding flags.
- Media: every file in `ppt/media` with a plain image file name (up to 600), with where it is placed. Anything on a master or layout, or repeated on many slides, is scored as a logo candidate.

**Not reliable, or missing**

- **One master per background.** A deck exported from a design system often has a slide master, with its own theme, for each background (light, dark, accent, gradient). The script resolves each master against its own theme, warns, and lists them in `declared.themes`: each is a surface, with `dk1`/`lt1` its text and background and `accent1` its accent.
- **A gradient stored as a picture** (a background image on the master) is reported as an image background with no stops. Read its corner and centre colours from the page render and describe it as a `mesh` gradient (a base colour plus two or three glows), marked as estimated.
- **Fonts named per text style** ("Fraunces Deck Headline", "Manrope Deck Body": static instances an exporter cut from a variable font) are one family each: strip the suffix and look the base family up. Weights of such instances are in the embedded font's name, not in the run properties; reading an embedded font's name and metrics to identify it is fine, reusing the file is not.
- **Line spacing, tracking and capitals.** The script's line-height figure for percentage spacing is an estimate; exact `a:lnSpc`, letter spacing (`spc`, in hundredths of a point) and `cap="all"` are in the slide XML when a value matters (unzip the file and read `ppt/slideMasters` and a slide).
- **The theme may be a lie.** Decks built on a stock template keep the Office (or Google) default theme and hard-code everything. The script warns when no accent is referenced or most text overrides the theme fonts. Then build from `observed`, not `declared`.
- Colour transforms (`tint`, `shade`, `satMod`, `lumMod`) are applied approximately and flagged `approximate: true`. Verified case: a `tint 50% + satMod 350%` accent resolved to `#65EF9F` here and rendered as `#AEDBBC` in LibreOffice. When a transformed colour matters, take it from the page image.
- Rendering needs LibreOffice, and LibreOffice substitutes any font that is not installed, which changes letterforms, line breaks and sometimes overflow. The script checks `fc-list` and warns. Colours and geometry in the render are still right. A PDF exported from PowerPoint, Keynote or Google Slides (`--pdf`) avoids the problem and is the better page image.
- Group transforms are not applied to child geometry (positions inside scaled groups are approximate).
- Embedded fonts (`ppt/fonts/*.fntdata`) are obfuscated and licensed for that document only. They are reported and never extracted.
- SmartArt, 3D, and effects such as shadows and glows are not parsed. Look at the image.
- EMF/WMF media need converting (`soffice --convert-to svg`) *(not verified)*.

**Rendering options**, in order of preference:

1. A PDF the user exported from the authoring app: `--pdf deck.pdf`.
2. LibreOffice on PATH (`brew install --cask libreoffice`, or `apt install libreoffice-impress`).
3. LibreOffice in a container: `--soffice "docker run --rm --entrypoint soffice -v {dir}:/work <image>"` (set the entrypoint: an image built for something else, such as one built for something else, has its own). A container without the deck's fonts renders in a fallback face, so compare colour and layout against those pages, not letterforms. Verified with a `debian:bookworm-slim` image that has `libreoffice-impress` installed.
4. Keynote on macOS: `--renderer keynote` (opens the app; *not verified*).
5. macOS Quick Look, headless: `qlmanage -p -o <dir> deck.pptx` writes an HTML preview that can be screenshotted per slide with Chrome and assembled into a PDF for `--pdf`. An agent used this in one eval run when nothing else was available: colours, type and layout came out right, but charts are Quick Look's own redraw (wrong number format and legend order) and white panels appear behind cards. Treat it as a last resort and say so in the handover.

## PDF

`extract_pdf.py` uses PyMuPDF.

**Reliable**

- Text spans with font, size, colour and position. Sizes are in points; `size_canvas_px = size_pt * 1080 / page_height_pt` puts them on the framework's canvas. A 1920x1080 px deck printed by Chrome is 1440x810 pt, so 90 pt is 120 canvas px.
- Vector fill and stroke colours, exact to the stored value.
- **Gradients, when they are PDF shadings**: the script reads axial and radial shading objects directly, including stop colours and the pattern matrix, and returns exact stops and a CSS angle. Verified: `linear-gradient(135deg, #FF5A36, #7A2CF5)` printed from Chrome came back as exactly that. The per-page pixel estimate of the same gradient was off by one unit per channel.
- Embedded images, deduplicated, with placements.
- Elements repeated at the same position on many pages (logo, footer rule): cropped to PNG at 4x and to SVG with text converted to paths. This is how a vector logo is recovered from a PDF. A second pass looks in the page corners for elements on as few as two pages (`rare_variant: true`): verified to find a reversed logo used only on the title and closing pages. The SVG is the whole page behind a clip path, so it is the source of exact paths and colours for rebuilding a clean file, not a finished asset.
- Line height for any text style that wraps (`text_styles[].line_height_ratio`, from baseline distances). Verified: 1.45 and 1.2 for styles set at exactly those values.
- Corner radii of rounded rectangles (from where the straight top edge begins), stroke widths.
- Font identity even from subsets: the embedded font program usually keeps its `name` table, so the script reads the real family name, weight class, copyright and licence strings, embedding flags (`fsType`), and x-height and cap-height ratios.
- Colour values written out in the text of a guidelines PDF (`#RRGGBB`, `HEX RRGGBB`, `RGB r g b`) are returned in `declared.colors` with the nearest label.

**Lost compared with PPTX**

- No theme, no semantic names, no layouts or placeholders. Structure has to be inferred from position and from the images.
- **Fonts are subsets and cannot be reused.** A name like `AAAAAA+SpaceGroteskLight-Bold` means a subset (the six-letter tag) of a font whose PostScript name is not the family name. Verified trap: static instances cut from a variable font report the family as "Space Grotesk Light" with weight 700; the script strips the stray weight word and reports the weight class from the font itself. Type 3 fonts and fonts converted to outlines give no name at all.
- Letter spacing is not stored. It can be measured when the font is open (set the same string in the real font and compare widths; see synthesis.md); otherwise judge it by eye.
- Dashed strokes may be expanded into filled shapes by the PDF producer (Chrome/Skia does this), so `dashed_guess` on gridlines is a guess from segment counts.
- Charts are just shapes. `detect_charts` recognises bars sharing a baseline with unequal heights, long polylines over repeated thin horizontal lines, and reports mark colours, gridline colour and weight, label styles and number formats, with a confidence. Pies, stacked bars and anything rasterised are not recognised.
- Pixel-sampled colours are within about one unit of the stored value (renderers truncate where the file rounds: `#F6F4ED` on screen for a stored `#F7F4EE`). The script snaps page backgrounds to an exact vector colour when one is that close.
- Transparency and blend modes are flattened in the render only.
- A scanned or fully rasterised PDF has no text layer: the script warns, and the pages should go through `extract_images.py`.

## Google Slides

- A deck shared as **"Anyone with the link"** (viewer is enough) exports without credentials from `https://docs.google.com/presentation/d/<ID>/export/pptx` and `/export/pdf`. Verified on a public deck. `fetch_gslides.py` does both and checks that it received real files rather than a sign-in page.
- A private deck returns 404 or a sign-in page; "Publish to the web" links (`/d/e/2PACX-...`) only serve the viewer. The owner can also disable download for viewers, and a Workspace admin can block external sharing. In all of these cases ask the user for File > Download > Microsoft PowerPoint and File > Download > PDF.
- Use both files: the PPTX for theme, masters and layouts, and **the PDF as the page images** (`extract_pptx.py --pdf`). Google's PDF has the real fonts embedded, so there is no font substitution and no need for LibreOffice.
- Export quirks: charts linked from Sheets arrive as images in the PPTX, Google's default theme is usually left unused (the warnings say so), and Google Fonts used in the deck are named in the PPTX but not embedded.
- The Slides API (`presentations.get`) exposes masters, layouts, page elements, text styles, theme colours and thumbnails as JSON, but needs OAuth or a service account the deck is shared with. It gives nothing the PPTX export does not, so the skill does not use it. *(API not exercised here.)*

## Websites

`extract_web.py` drives Chromium through Playwright and reads the rendered page.

The page is untrusted and decides what gets requested, so the browser runs behind a filtering proxy and every file the script fetches for the page goes through one guarded function (`scripts/_netsafe.py`). A page cannot make the extractor read a local file (`<link rel="icon" href="file:///…/.ssh/id_rsa">`), reach `localhost`, a private network or a cloud metadata address (directly, through a redirect, or through a DNS name that changes its answer), open a WebSocket, register a service worker or start a download. Whatever was refused is in `blocked[]` with the reason, and a warning says how many. Do not fetch a blocked URL yourself with `curl`, a web-fetch tool or a browser tool: the block is the finding. If the list shows a page reaching for local files or internal addresses, tell the user.

To extract a site the user runs on this machine or network, pass its origin: `--allow-origin http://localhost:3000` (repeatable). Nothing private is reachable without it. A local HTML file is passed as a path; keep it in a folder of its own, because files in that folder are readable to the page's logo and stylesheet references.

**Reliable**

- CSS custom properties on `:root`, resolved to their computed value, with colours converted to hex whatever notation they were written in, and whether any element actually uses them (`used`). Cross-origin stylesheets, which the CSSOM refuses to expose, are fetched and scanned as text. Verified on a public site with 700+ tokens.
- Usage-weighted colours from computed styles: text by character count, backgrounds by area, borders by count.
- **Foreground/background pairs** (`observed.color_pairs`): for each run of text, the first non-transparent background behind it, with contrast. This is direct evidence for surfaces.
- Text styles: family that was requested, size, weight, line height, letter spacing, case, colour, and which tags use them.
- `@font-face` rules with file URLs and a host classification (Google Fonts, Adobe Fonts, Monotype, self-hosted...) made from the URL's parsed host, so a look-alike such as `fonts.gstatic.com.example.net` is a third-party host with an unknown licence. With `--font-metadata` the font file is read in memory for its family name, copyright, licence string and `fsType`. Nothing is saved.
- Gradients as written in CSS, parsed into type, angle and stops, with the area they cover.
- Radii, shadows, borders, section padding, and **transition durations and easing curves**: the only source type that gives any motion evidence.
- Logo candidates: the graphic inside the header's home link, anything named `logo`, the first header graphic; saved as sanitised SVG (inline markup or a downloaded file, with scripts, event handlers, external references, `foreignObject`, embedded images and filters removed and each removal reported) or as a downloaded raster image, plus an element screenshot. Files are named by the script (`logo-01.svg`, `icon-02.png`), never after the URL. When the SVG cannot be made safe it is not saved: use the PNG crop and add a review item. Favicons, `theme-color`, `og:image`, JSON-LD organisation logo.
- Icon style: stroke against fill, stroke width, size, and library class names when present.
- A second pass with `prefers-color-scheme: dark` records which custom properties change: evidence for an inverse surface.
- SVG charts: fills, strokes, gridline colour, width and dash pattern, label styles, number formats, and a warning when marks lie outside the viewBox (present in the markup, invisible on the page). Tables: header and body styles. Big numbers: large short numeric text with its label.
- One screenshot per full-width band (`pages[].sections[]`, `page-NNN-section-NN.png`) with its background: the nearest thing a site has to slides, for looking and for specimen comparison.

**Not reliable, or missing**

- **A website is not a slide.** Sizes are CSS pixels on a scrolling page: keep roles and ratios, set absolute sizes for the 1920x1080 canvas. Web body text at 16 to 18 px maps to roughly 28 to 36 canvas px.
- The first family in a stack is what was *requested*. Without a matching `@font-face` the browser fell back (`system_or_generic: true`).
- **Web font files are licensed for that site.** Report the host and metadata, look the family up on Fontsource, and put anything else on the review list. Do not copy the files into the brand.
- Canvas and WebGL charts have no structure: only an element screenshot and its palette, and only when a chart library is detected.
- Scroll-driven and JavaScript animation is not captured. Cookie banners and consent walls may cover the first screenshot. Bot protection can block the page entirely; ask the user for screenshots.
- Marketing sites often use a louder palette than the company's decks. If both a site and a deck are available, the deck wins for deck-specific choices.

## Brand guidelines documents

Usually a PDF, sometimes a web page. Extract it with the matching script, then read it as a document:

- Stated colour values (`declared.colors` with origin `stated-in-text`) outrank everything observed, including in other sources.
- Typeface names, weights and usage rules are in prose. Read the typography pages.
- Logo rules: clear space, minimum size, permitted backgrounds, misuse examples. **Misuse pages are full of wrong colours and stretched logos**: exclude them from palette and logo extraction.
- The guidelines' own layout is a print document, not a deck. Do not derive slide layouts or a slide type scale from it; use its hierarchy and proportions as a guide.
- Print values (CMYK, Pantone) are not converted. Use the stated RGB or hex; if only print values exist, ask.

## Images and screenshots

`extract_images.py` measures colours and backgrounds and prepares a contact sheet.

- Flat colours in PNG screenshots come back exact. Verified: four slide screenshots returned exactly the seven flat brand colours, including white cards kept apart from the off-white page, after pixels along gradient ramps were removed. JPEG and WebP shift colours by a few units; prefer hexes that recur across images.
- Linear gradients are estimated with a robust fit: angle within a degree or two, end stops within about one unit on a clean screenshot. Multi-stop, radial and mesh gradients are only approximated.
- Colours of thin text (a muted grey caption, an axis label) do not come back: anti-aliased small text has no flat pixels. Large fills, backgrounds and big type do. Verified: seven flat colours exact, the muted text grey missing.
- No font names. Identify typefaces by eye from distinctive glyphs (`a g y Q R 1 4`, terminals, x-height, contrast), name candidates, and mark them low confidence. Type sizes are estimated as a fraction of image height times 1080.
- Photos of projected slides add colour casts and perspective: palette only, low confidence, say so.

## System dependencies

| Need | Used by | Notes |
|---|---|---|
| `uv` | all scripts | Scripts declare dependencies inline (PEP 723). Python 3.10+. |
| PyMuPDF, Pillow, numpy, fontTools | `extract_pdf.py` | Installed by uv. PyMuPDF is AGPL: fine as a local tool, to be replaced by pdf.js or MuPDF bindings in `deck brand extract`. |
| Pillow, numpy | `extract_pptx.py`, `extract_images.py` | The PPTX parse itself is standard library. |
| LibreOffice **or** a PDF export **or** Docker | `extract_pptx.py` rendering | Only for page images. |
| poppler `pdftoppm` | `extract_pptx.py` rendering | Falls back to PyMuPDF if importable. |
| `fc-list` (fontconfig) | `extract_pptx.py` | Optional: detects fonts missing on this machine. |
| Playwright + Chrome or Chromium | `extract_web.py` | Uses installed Google Chrome first, then Playwright's Chromium. |
| Network | `fetch_gslides.py`, `extract_web.py`, `brand_tools.py` font lookups | `brand_tools.py --offline` skips Fontsource lookups. |
