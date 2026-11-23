import { DEFAULT_RENDERER_IDS, type RendererId } from '@deckster/export';

import { DEFAULT_EXPORT_DIR } from '#export/run-export.ts';

/**
 * The renderers `--verify` uses without `--renderer`: the ones that run unattended.
 */
export const DEFAULT_RENDERERS: readonly RendererId[] = DEFAULT_RENDERER_IDS;

/**
 * The largest video embedded without `--max-media-mb`, in megabytes.
 */
export const DEFAULT_MAX_MEDIA_MB = 50;

/**
 * The smallest and largest `--scale`.
 */
export const SCALE_RANGE = {
  /**
   * The smallest density.
   */
  min: 0.25,

  /**
   * The largest density.
   */
  max: 4,
} as const;

/**
 * The text `deckster export --help` prints.
 */
export const HELP = `Usage: deckster export <deck> [--pdf] [--png] [--pptx] [options]

Exports a deck rendered in static mode. Without a format flag it writes the PDF and the PPTX.

Formats:
  --pdf             One page per slide at its last step: Chromium's vector PDF, the 1920x1080
                    canvas on 1440x810 pt pages (20x11.25 in), fonts embedded, external and
                    slide-to-slide links, a bookmark and page label per slide, tagged for screen
                    readers, the deck title and the brand's language. Videos, iframes and apps
                    show their posters.
  --png             PNG screenshots, as \`deckster shot\` writes them, in <out>/png.
  --pptx            PowerPoint: a theme and slide master per brand surface in use with the brand's
                    chrome and a slide number, the deck's layouts with placeholders placed and
                    styled as the deck sets them, editable text that wraps where the web wraps, the
                    brand's fonts embedded as static instances, shapes, gradients, pictures (JPEG
                    when opaque, each stored once), tables, charts and diagrams, speaker notes,
                    links and step animations; what PowerPoint cannot draw is a picture.

Options:
  --steps           One page or slide per step instead of one per slide.
  --slides <list>   Slides to export, such as 3,5-9 or cover,heat-map. Default: every slide that is
                    not hidden. A hidden slide you name here is exported: as an
                    ordinary page in the PDF and a PNG, still marked hidden in the PPTX.
  --include-hidden  Export hidden slides too (\`hidden: true\` in the frontmatter): as ordinary PDF
                    pages and PNGs, and as hidden slides in the PPTX (PowerPoint skips them in a
                    slide show). Without it they are left out and the summary says how many.
  --brand <name>    Render with brands/<name> instead of the deck config's brand.
  --out <path>      Output folder, or a .pdf or .pptx file when exporting that one format.
                    Default: ${DEFAULT_EXPORT_DIR}/<deck> (or <deck>@<brand>).
  --notes           Add speaker notes pages (slide plus notes) after the slides in the PDF.
  --scale <n>       Pixel density of PNGs and of the PPTX's pictures, from ${SCALE_RANGE.min} to ${SCALE_RANGE.max}.
                    Default: 1 for PNGs; 2 for PPTX pictures, at most 1920x1080 pixels each.
  --mode <mode>     PPTX mode: hybrid (native where faithful, a picture where not; default),
                    native (never a picture; reports what it dropped) or image (one picture per
                    slide with notes and link hotspots).
  --outline-text    Draw display-size text (60px and up: titles, statements, stats) as vector
                    shapes in the brand font at its exact axes, so it looks the same without the
                    font installed; the text stays in the title placeholder for outline view.
  --no-embed-fonts  Do not embed the brand's fonts in the PPTX; text names the brand's families,
                    with PANOSE and pitch so apps substitute a similar font.
  --fonts <set>     brand (default) or system: render and measure the deck in each family's
                    substitute (Arial, Georgia, Courier New...) so line breaks are right in apps
                    without the brand's fonts, such as Keynote or Google Slides.
  --no-animations   Do not turn step reveals into PowerPoint click animations.
  --no-embed-media  Keep videos as posters instead of embedding MP4 and MOV files.
  --max-media-mb <n> The largest video to embed. Default: ${DEFAULT_MAX_MEDIA_MB}.
  --dry-run         List per slide what the PPTX draws natively and what it rasterises, and why;
                    writes nothing.
  --verify          Export the PPTX, validate it with the Open XML SDK (Docker), render it back to
                    pictures and compare each text block, chart, diagram, picture and table with the
                    web slide: where it landed, its size and its line count. Prints the worst
                    regions per slide and writes side-by-side pictures, crops of the regions that
                    differ and report.json to <out>/verify.
  --strict          With --verify, exit non-zero when any region differs or nothing was rendered.
  --renderer <ids>  Renderers for --verify, comma-separated: libreoffice (Docker, the export's
                    fonts installed), libreoffice-nofonts (Docker, no brand fonts and embedded
                    fonts removed: the substitutes), libreoffice-embedded (Docker, no brand fonts,
                    the file's embedded fonts), quicklook (macOS), keynote (macOS; opens Keynote,
                    needs Automation permission). Default: ${DEFAULT_RENDERERS.join(',')}.
  --json            Print the result as JSON.
  -h, --help        Show this help.`;
