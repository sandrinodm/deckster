import type { ShellDisplay, ShellRect } from '#protocol/shell-messages.ts';

/**
 * Horizontal units in the slide's 16:9 aspect ratio.
 */
const SLIDE_WIDTH_UNITS = 16;

/**
 * Vertical units in the slide's 16:9 aspect ratio.
 */
const SLIDE_HEIGHT_UNITS = 9;

/**
 * The size of the audience window when it is not fullscreen, as a share of the display's work area.
 */
const AUDIENCE_SHARE = 0.8;

/**
 * The preferred presenter window size.
 */
const PRESENTER_SIZE = {
  /**
   * The width.
   */
  width: 1360,

  /**
   * The height.
   */
  height: 860,
} as const;

/**
 * The size of the small window the corner test option uses.
 */
const CORNER_SIZE = {
  /**
   * The width.
   */
  width: 640,

  /**
   * The height.
   */
  height: 360,
} as const;

/**
 * The distance of the corner window from the screen edge.
 */
const CORNER_MARGIN = 16;

/**
 * How far a second window on the same display is offset, so the two are not stacked exactly.
 */
const CASCADE_OFFSET = 48;

/**
 * A rectangle of the given size centred in a display's work area.
 *
 * @param display - The display.
 * @param width - The wanted width; shrunk to fit.
 * @param height - The wanted height; shrunk to fit.
 */
function centred(display: ShellDisplay, width: number, height: number): ShellRect {
  const area = display.workArea;
  const fitted = Math.min(1, area.width / width, area.height / height);
  const fittedWidth = Math.round(width * fitted);
  const fittedHeight = Math.round(height * fitted);
  return {
    x: area.x + Math.round((area.width - fittedWidth) / 2),
    y: area.y + Math.round((area.height - fittedHeight) / 2),
    width: fittedWidth,
    height: fittedHeight,
  };
}

/**
 * The audience window's default bounds: 16:9, most of the work area, centred.
 *
 * @param display - The display it opens on.
 */
export function audienceBounds(display: ShellDisplay): ShellRect {
  const area = display.workArea;
  const width = Math.min(
    area.width * AUDIENCE_SHARE,
    (area.height * AUDIENCE_SHARE * SLIDE_WIDTH_UNITS) / SLIDE_HEIGHT_UNITS,
  );
  return centred(display, width, (width * SLIDE_HEIGHT_UNITS) / SLIDE_WIDTH_UNITS);
}

/**
 * The presenter window's default bounds, offset when it shares a display with the audience window.
 *
 * @param display - The display it opens on.
 * @param sharesDisplay - Whether the audience window is on the same display.
 */
export function presenterBounds(display: ShellDisplay, sharesDisplay: boolean): ShellRect {
  const bounds = centred(display, PRESENTER_SIZE.width, PRESENTER_SIZE.height);
  return sharesDisplay
    ? { ...bounds, x: bounds.x + CASCADE_OFFSET, y: bounds.y + CASCADE_OFFSET }
    : bounds;
}

/**
 * The small bottom-right window of the corner test option.
 *
 * @param display - The display, normally the primary one.
 */
export function cornerBounds(display: ShellDisplay): ShellRect {
  const area = display.workArea;
  return {
    x: area.x + area.width - CORNER_SIZE.width - CORNER_MARGIN,
    y: area.y + area.height - CORNER_SIZE.height - CORNER_MARGIN,
    width: CORNER_SIZE.width,
    height: CORNER_SIZE.height,
  };
}
