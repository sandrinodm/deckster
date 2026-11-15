import type { SlideRule } from '#lint/types.ts';

/**
 * The fix for an embedded object, which never renders in export: an image or an app frame with a
 * poster.
 */
const EMBED_FIX = 'Replace it with an image, or `<AppFrame src poster>`';

/**
 * Elements that static mode and export cannot show as they play, with what to use instead.
 */
const LIVE_ELEMENTS: Readonly<Record<string, { what: string; fix: string }>> = {
  /**
   * A raw video shows whatever frame Chromium decoded, or nothing.
   */
  video: {
    what: 'A raw <video> exports as whatever frame Chromium shows, or as a blank box',
    fix: "Use the kit's `<Video src poster alt>`, which shows its poster in static mode and export",
  },

  /**
   * A raw iframe loads live content that PDF and PPTX cannot hold.
   */
  iframe: {
    what: 'A raw <iframe> exports as a picture of whatever it loaded, or as a blank box',
    fix: 'Use `<AppFrame src poster>`, which shows its poster in static mode and export',
  },

  /**
   * A canvas is drawn by script; export can only rasterise it.
   */
  canvas: {
    what: 'A <canvas> exports only as a picture, and as nothing in `--mode native`',
    fix: 'Wrap the widget in `<Live component poster>` so export shows a poster, or draw it as SVG',
  },

  /**
   * Embedded objects never render in export.
   */
  embed: {
    what: 'An <embed> does not render in static mode or export',
    fix: EMBED_FIX,
  },

  /**
   * Embedded objects never render in export.
   */
  object: {
    what: 'An <object> does not render in static mode or export',
    fix: EMBED_FIX,
  },
};

/**
 * Live media the export cannot represent: raw `<video>`, `<iframe>`, `<canvas>`, `<embed>` and
 * `<object>` elements that static mode still shows, because nothing gives them a poster. The kit's
 * `<Video>`, `<AppFrame>` and `<Live>` swap in their posters in static mode, so they never appear
 * here; a missing `<AppFrame>` poster is `app-missing-poster`.
 */
export const exportMissingPosterRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'export-missing-poster',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Media can appear on any step.
   */
  scope: 'step',

  /**
   * The deck still exports, with a picture or a gap.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'Live media without a poster exports as a stray frame, a picture or nothing.',

  /**
   * Reports each live element static mode still shows.
   */
  check: ({ snapshot, slide }) =>
    snapshot.elements.flatMap((element) => {
      const live = Object.hasOwn(LIVE_ELEMENTS, element.tag)
        ? LIVE_ELEMENTS[element.tag]
        : undefined;
      if (live === undefined || element.decorative) {
        return [];
      }

      return [
        {
          message: `${live.what} in PDF and PPTX.`,
          fix: `${live.fix} in ${slide.file}.`,
          selector: element.selector,
        },
      ];
    }),
};
