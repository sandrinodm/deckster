import type { ExportMode, RendererId } from '@deckster/export';

/**
 * The files `deckster export` writes.
 */
export type ExportFormat = 'pdf' | 'png' | 'pptx';

/**
 * Everything `deckster export` was asked to do.
 */
export type ExportOptions = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * A brand that replaces the deck config's, or `undefined`.
   */
  brand: string | undefined;

  /**
   * The formats to write.
   */
  formats: ReadonlySet<ExportFormat>;

  /**
   * One page or slide per step instead of one per slide at its last step.
   */
  steps: boolean;

  /**
   * The `--slides` selection, such as `3,5-9`, or `undefined` for every slide.
   */
  slides: string | undefined;

  /**
   * Whether hidden slides are exported: as ordinary PDF pages and PNGs, as hidden slides in the
   * PPTX. Without it they are left out, unless `slides` names them.
   */
  includeHidden: boolean;

  /**
   * Whether the PDF gets speaker notes pages.
   */
  notes: boolean;

  /**
   * The PNG pixel density.
   */
  scale: number;

  /**
   * The PPTX mode.
   */
  mode: ExportMode;

  /**
   * The output file (one format) or folder (several), relative to the workspace, or `undefined` for
   * `.deck/exports/<deck>`.
   */
  out: string | undefined;

  /**
   * Plan the PPTX and report it without writing files.
   */
  dryRun: boolean;

  /**
   * Render the PPTX back to pictures and compare them with the web slides.
   */
  verify: boolean;

  /**
   * The renderers verification uses.
   */
  renderers: readonly RendererId[];

  /**
   * Turn step reveals into click animations (when not exporting per step).
   */
  animate: boolean;

  /**
   * Embed local MP4 and MOV videos in the PPTX.
   */
  embedMedia: boolean;

  /**
   * The largest video embedded, in bytes.
   */
  maxMediaBytes: number;

  /**
   * Draw display-size text as vector outlines in the PPTX, so headlines keep the brand font's exact
   * width and weight on machines without it.
   */
  outlineText: boolean;

  /**
   * With `verify`, fail when any region of a rendered slide differs from the web slide.
   */
  strict: boolean;

  /**
   * Pixels per canvas pixel of the PPTX's pictures, when `--scale` gives one; `null` for automatic
   * (2x, never more pixels than a 1920x1080 slide per picture).
   */
  pictureScale: number | null;

  /**
   * Embed static instances of the brand's fonts in the PPTX (and write them to `<out>/fonts`).
   */
  embedFonts: boolean;

  /**
   * `brand` renders and measures the deck in the brand's fonts; `system` in each family's
   * substitute (a widely installed family), so line breaks match a viewer without the brand's
   * fonts, as in Keynote or Google Slides.
   */
  fonts: 'brand' | 'system';
};

/**
 * The largest video embedded by default, in bytes (50 MB).
 */
export const DEFAULT_MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/**
 * The options of a plain `deckster export <deck>`: PDF and PPTX of every slide at its last step, in
 * hybrid mode, with animations and embedded videos, into the default folder.
 *
 * @param deck - The deck folder name.
 */
export function defaultExportOptions(deck: string): ExportOptions {
  return {
    deck,
    brand: undefined,
    formats: new Set<ExportFormat>(['pdf', 'pptx']),
    steps: false,
    slides: undefined,
    includeHidden: false,
    notes: false,
    scale: 1,
    mode: 'hybrid',
    out: undefined,
    dryRun: false,
    verify: false,
    renderers: [],
    animate: true,
    embedMedia: true,
    maxMediaBytes: DEFAULT_MAX_MEDIA_BYTES,
    outlineText: false,
    strict: false,
    pictureScale: null,
    embedFonts: true,
    fonts: 'brand',
  };
}
