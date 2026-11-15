import type { Page } from 'playwright';

import { Effect } from 'effect';

import type { SceneRect } from '#scene/scene.ts';
import type { RegionMeasurement, VerifyRegion } from '#verify/regions.ts';

import { exportError, type ExportError } from '#export-error.ts';

/**
 * The size both images are compared at: half the canvas, which keeps anti-aliasing and grain noise
 * low and the comparison fast. Region results are reported in canvas pixels.
 */
const COMPARE_SIZE = {
  /**
   * The width in pixels.
   */
  width: 960,

  /**
   * The height in pixels.
   */
  height: 540,
} as const;

/**
 * The canvas width every slide is laid out on, in canvas pixels.
 */
const CANVAS_WIDTH = 1920;

/**
 * A pixel counts as changed when its mean channel difference is above this share of full scale.
 */
const CHANGED_THRESHOLD = 0.1;

/**
 * A pixel is an edge when its luminance differs from its right or lower neighbour by more than this
 * share of full scale: text strokes, bar outlines and picture detail, but not smooth gradients or
 * grain.
 */
const EDGE_THRESHOLD = 0.1;

/**
 * The most edge pixels of a region sampled while searching for its offset.
 */
const MAX_SAMPLES = 1500;

/**
 * The action a failed comparison names in its error.
 */
const COMPARE_ACTION = 'compare the slide pictures';

/**
 * Fix for a comparison that failed.
 */
const COMPARE_FIX = 'Check that both pictures are PNG files, then run the command again.';

/**
 * How two pictures of a slide differ: overall, and region by region.
 */
export type ImageComparison = {
  /**
   * The mean absolute difference of all channels, from 0 (identical) to 1.
   */
  meanDifference: number;

  /**
   * The share of pixels whose difference is above {@link CHANGED_THRESHOLD}, from 0 to 1.
   */
  changedShare: number;

  /**
   * The similarity score, `1 - meanDifference`, from 0 to 1.
   */
  score: number;

  /**
   * Where each region landed in the candidate, in the order given.
   */
  regions: RegionMeasurement[];
};

/**
 * A region to mark on the side-by-side picture and crop.
 */
export type ComparisonMark = {
  /**
   * The region in the reference, in canvas pixels.
   */
  rect: SceneRect;

  /**
   * Where the candidate drew it, relative to `rect`, in canvas pixels.
   */
  offset: { x: number; y: number };

  /**
   * A short tag drawn next to the marks, such as `1`.
   */
  tag: string;
};

/**
 * The side-by-side picture and crops of a comparison.
 */
export type ComparisonPictures = {
  /**
   * A PNG with the reference, the candidate and a heat map of their differences side by side, the
   * marked regions outlined.
   */
  sideBySide: Uint8Array;

  /**
   * One PNG per mark: the reference region above the candidate's, at canvas resolution.
   */
  crops: Uint8Array[];
};

/**
 * Arguments of the in-page comparison.
 */
type CompareArgs = {
  /**
   * The reference PNG as base64.
   */
  reference: string;

  /**
   * The candidate PNG as base64.
   */
  candidate: string;

  /**
   * The labels of the two pictures.
   */
  labels: [string, string];

  /**
   * The comparison width.
   */
  width: number;

  /**
   * The comparison height.
   */
  height: number;

  /**
   * The canvas width, to convert canvas pixels to comparison pixels.
   */
  canvasWidth: number;

  /**
   * The changed-pixel threshold.
   */
  threshold: number;

  /**
   * The edge threshold.
   */
  edgeThreshold: number;

  /**
   * The most sampled edge pixels per region.
   */
  maxSamples: number;

  /**
   * The regions to measure; empty when drawing.
   */
  regions: Pick<VerifyRegion, 'id' | 'rect' | 'margin' | 'extend' | 'anchor' | 'linePitch'>[];

  /**
   * The marks to draw, or `null` to measure only.
   */
  marks: ComparisonMark[] | null;
};

/**
 * What the in-page comparison returns: measurements, pictures, or why it could not run.
 */
type CompareOutcome =
  | {
      /**
       * The pictures could not be compared.
       */
      error: string;
    }
  | {
      /**
       * The mean channel difference.
       */
      meanDifference: number;

      /**
       * The share of changed pixels.
       */
      changedShare: number;

      /**
       * The region measurements.
       */
      regions: RegionMeasurement[];

      /**
       * The side-by-side PNG as base64, when drawing; else empty.
       */
      sideBySide: string;

      /**
       * The crops as base64 PNGs, when drawing; else empty.
       */
      crops: string[];
    };

/**
 * The edge masks of the two pictures a region is measured against, one byte a pixel (1 on an edge).
 */
type EdgeMasks = {
  /**
   * The reference picture's edges.
   */
  referenceEdges: Uint8Array;

  /**
   * The candidate picture's edges.
   */
  candidateEdges: Uint8Array;

  /**
   * The candidate's edges grown by one pixel, for the fine search.
   */
  near: Uint8Array;

  /**
   * The candidate's edges grown by two pixels, for the coarse search.
   */
  loose: Uint8Array;
};

/**
 * Compares a web screenshot of a slide with a picture of the same slide rendered from the PPTX:
 * both are scaled to 960x540, the mean channel difference and the share of visibly changed pixels
 * are measured, and each region is looked for in the candidate. A region is found by matching its
 * edge pixels (luminance steps, which ignore smooth gradients) against the candidate's within a
 * search window, preferring no offset when it matches about as well; the result says where it
 * matched best, how much of it matched, and the box of the drawn content in both pictures, its
 * growth limited to the space around it that is empty in the reference. It runs in a blank browser
 * page, so it needs no image library.
 *
 * @param page - A blank page.
 * @param reference - The web screenshot (PNG).
 * @param candidate - The rendered slide (PNG).
 * @param regions - The regions to measure.
 * @returns The scores and the region measurements.
 * @throws ExportError in the error channel when the browser fails or a picture does not decode.
 */
export const compareImages = Effect.fn('compareImages')(function* (
  page: Page,
  reference: Uint8Array,
  candidate: Uint8Array,
  regions: readonly VerifyRegion[],
): Effect.fn.Return<ImageComparison, ExportError> {
  const result = yield* runInPage(page, {
    ...baseArgs(reference, candidate, ['', '']),
    regions: regions.map((region) => ({
      id: region.id,
      rect: region.rect,
      margin: region.margin,
      extend: region.extend,
      anchor: region.anchor,
      linePitch: region.linePitch,
    })),
    marks: null,
  });
  return {
    meanDifference: result.meanDifference,
    changedShare: result.changedShare,
    score: 1 - result.meanDifference,
    regions: result.regions,
  };
});

/**
 * Draws the side-by-side picture of a comparison (reference, candidate, difference heat map) with
 * the marked regions outlined, and a crop of each marked region from both pictures.
 *
 * @param page - A blank page.
 * @param reference - The web screenshot (PNG).
 * @param candidate - The rendered slide (PNG).
 * @param labels - Captions for the two panels, such as `web` and `libreoffice`.
 * @param marks - Regions to outline and crop.
 * @returns The pictures.
 * @throws ExportError in the error channel when the browser fails or a picture does not decode.
 */
export const drawComparison = Effect.fn('drawComparison')(function* (
  page: Page,
  reference: Uint8Array,
  candidate: Uint8Array,
  labels: [string, string],
  marks: readonly ComparisonMark[],
): Effect.fn.Return<ComparisonPictures, ExportError> {
  const result = yield* runInPage(page, {
    ...baseArgs(reference, candidate, labels),
    regions: [],
    marks: [...marks],
  });
  return {
    sideBySide: new Uint8Array(Buffer.from(result.sideBySide, 'base64')),
    crops: result.crops.map((crop) => new Uint8Array(Buffer.from(crop, 'base64'))),
  };
});

/**
 * The arguments every in-page call shares.
 *
 * @param reference - The reference PNG.
 * @param candidate - The candidate PNG.
 * @param labels - The panel captions.
 */
function baseArgs(
  reference: Uint8Array,
  candidate: Uint8Array,
  labels: [string, string],
): Omit<CompareArgs, 'regions' | 'marks'> {
  return {
    reference: Buffer.from(reference).toString('base64'),
    candidate: Buffer.from(candidate).toString('base64'),
    labels,
    width: COMPARE_SIZE.width,
    height: COMPARE_SIZE.height,
    canvasWidth: CANVAS_WIDTH,
    threshold: CHANGED_THRESHOLD,
    edgeThreshold: EDGE_THRESHOLD,
    maxSamples: MAX_SAMPLES,
  };
}

/**
 * Runs the comparison in the page and maps its failures to an {@link ExportError}.
 *
 * @param page - A blank page.
 * @param args - The arguments.
 */
const runInPage = Effect.fn('runInPage')(function* (
  page: Page,
  args: CompareArgs,
): Effect.fn.Return<Exclude<CompareOutcome, { error: string }>, ExportError> {
  const outcome = yield* Effect.tryPromise({
    try: () => page.evaluate(compareInPage, args),
    catch: (cause) => exportError(COMPARE_ACTION, cause, COMPARE_FIX),
  });
  if ('error' in outcome) {
    return yield* exportError(COMPARE_ACTION, outcome.error, COMPARE_FIX);
  }

  return outcome;
});

/**
 * The edge pixels of a region's reference box: where they are, how many, their extent, and the box
 * searched.
 */
type RegionInk = {
  /**
   * The x and y of each edge pixel, flattened: x0, y0, x1, y1, and so on.
   */
  points: number[];

  /**
   * The number of edge pixels.
   */
  count: number;

  /**
   * The leftmost edge pixel's x.
   */
  left: number;

  /**
   * The top edge pixel's y.
   */
  top: number;

  /**
   * The rightmost edge pixel's x.
   */
  right: number;

  /**
   * The bottom edge pixel's y.
   */
  bottom: number;

  /**
   * The searched box's left edge, in comparison pixels.
   */
  x0: number;

  /**
   * The searched box's top edge.
   */
  y0: number;

  /**
   * The searched box's right edge, exclusive.
   */
  x1: number;

  /**
   * The searched box's bottom edge, exclusive.
   */
  y1: number;
};

/**
 * How far the region's content may grow in each direction, in comparison pixels.
 */
type Growth = {
  /**
   * Leftwards.
   */
  leftward: number;

  /**
   * Rightwards.
   */
  rightward: number;

  /**
   * Upwards.
   */
  up: number;

  /**
   * Downwards.
   */
  down: number;
};

/**
 * An offset and how well the reference edges match there.
 */
type ScoredOffset = {
  /**
   * Rightwards, in comparison pixels.
   */
  dx: number;

  /**
   * Downwards, in comparison pixels.
   */
  dy: number;

  /**
   * How many sampled reference edges land on the candidate's edges.
   */
  value: number;
};

/**
 * The box the candidate's content takes around a region, in comparison pixels.
 */
type InkBox = {
  /**
   * The leftmost content pixel's x.
   */
  left: number;

  /**
   * The top content pixel's y.
   */
  top: number;

  /**
   * The rightmost content pixel's x; -1 when there is none.
   */
  right: number;

  /**
   * The bottom content pixel's y; -1 when there is none.
   */
  bottom: number;

  /**
   * How many content pixels are in the box.
   */
  count: number;
};

/**
 * Counts how many sampled reference edges land on a mask at an offset.
 */
type Scorer = (mask: Uint8Array, dx: number, dy: number) => number;

/**
 * The comparison itself, in the browser; self-contained. It returns an error value instead of
 * throwing, so the caller reports it as an export error. The page runs this function on its own, so
 * it names the numbers and messages it needs inside its body rather than using this module's
 * constants, and its helpers are defined inside it for the same reason.
 *
 * @param args - The pictures and settings.
 */
async function compareInPage(args: CompareArgs): Promise<CompareOutcome> {
  const NO_CANVAS = 'the browser has no 2D canvas';
  const { width, height } = args;
  const pixels = width * height;
  const scale = width / args.canvasWidth;
  const LABEL_BAND_PX = 40;
  const CHANNELS = 4;
  const ALPHA_CHANNEL = 3;
  const COLOR_CHANNELS = 3;
  const PANELS = 3;
  const FULL_SCALE = 255;
  const LUMA_RED = 0.299;
  const LUMA_GREEN = 0.587;
  const LUMA_BLUE = 0.114;
  const BLANK_INK = 12;
  const COARSE_STEP = 2;
  const FINE_RADIUS = 2;
  const MIN_MARGIN_PX = 2;
  const KEEP_ZERO_SHARE = 0.97;
  const GROWTH_CLEARANCE_PX = 3;
  const ABOVE_CLEARANCE_PX = 2;
  const INK_SHARE_FOR_ALIGN = 0.35;
  const CENTER_TEMPLATE_SHARE = 0.15;
  const EDGE_TEMPLATE_SHARE = 0.1;
  const EDGE_HOLD_PX = 2;
  const HEAT_GAIN = 3;
  const HEAT_FADE = 0.25;
  const CHANGED_RED = 230;
  const CHANGED_GREEN = 30;
  const CHANGED_BLUE = 60;
  const PERCENT = 100;
  const CAPTION_X_PX = 12;
  const CAPTION_BASELINE_PX = 27;
  const MARK_LINE_PX = 2;
  const TAG_LEFT_PX = 2;
  const TAG_ABOVE_BOX_PX = 3;
  const TAG_BELOW_BAND_PX = 12;
  const CROP_PAD_PX = 24;
  const CROP_GAP_PX = 8;

  /**
   * Decodes a PNG and draws it at the comparison size; also keeps the bitmap for crops.
   */
  const decode = async (
    base64: string,
  ): Promise<{ data: ImageData; bitmap: ImageBitmap } | string> => {
    try {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) {
        return NO_CANVAS;
      }

      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      return { data: context.getImageData(0, 0, width, height), bitmap };
    } catch (cause) {
      return `a picture did not decode (${cause instanceof Error ? cause.message : String(cause)})`;
    }
  };
  /**
   * Whether a mask is set at a pixel, false outside the picture.
   */
  const at = (mask: Uint8Array, x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  /**
   * The edge mask of an image: luminance steps to the right or below above the threshold.
   */
  const edges = (image: ImageData): Uint8Array => {
    const luminance = new Float32Array(pixels);
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const index = pixel * CHANNELS;
      luminance[pixel] =
        (LUMA_RED * (image.data[index] ?? 0) +
          LUMA_GREEN * (image.data[index + 1] ?? 0) +
          LUMA_BLUE * (image.data[index + 2] ?? 0)) /
        FULL_SCALE;
    }

    const mask = new Uint8Array(pixels);
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const pixel = y * width + x;
        const here = luminance[pixel] ?? 0;
        const step = Math.max(
          Math.abs((luminance[pixel + 1] ?? 0) - here),
          Math.abs((luminance[pixel + width] ?? 0) - here),
        );
        mask[pixel] = step > args.edgeThreshold ? 1 : 0;
      }
    }

    return mask;
  };
  /**
   * A mask grown by a radius in every direction.
   */
  const dilate = (mask: Uint8Array, radius: number): Uint8Array => {
    const across = new Uint8Array(pixels);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let on = 0;
        for (let d = -radius; d <= radius && on === 0; d += 1) {
          const column = x + d;
          on = column >= 0 && column < width ? (mask[y * width + column] ?? 0) : 0;
        }

        across[y * width + x] = on;
      }
    }

    const grown = new Uint8Array(pixels);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let on = 0;
        for (let d = -radius; d <= radius && on === 0; d += 1) {
          const row = y + d;
          on = row >= 0 && row < height ? (across[row * width + x] ?? 0) : 0;
        }

        grown[y * width + x] = on;
      }
    }

    return grown;
  };
  /**
   * The per-pixel difference of the two pictures (the mean of their channels, 0 to 1), its mean and
   * the share of pixels above the changed threshold.
   */
  const differencesOf = (
    reference: ImageData,
    candidate: ImageData,
  ): { meanDifference: number; changedShare: number; difference: Float32Array } => {
    let total = 0;
    let changed = 0;
    const difference = new Float32Array(pixels);
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const index = pixel * CHANNELS;
      const value =
        (Math.abs((reference.data[index] ?? 0) - (candidate.data[index] ?? 0)) +
          Math.abs((reference.data[index + 1] ?? 0) - (candidate.data[index + 1] ?? 0)) +
          Math.abs((reference.data[index + 2] ?? 0) - (candidate.data[index + 2] ?? 0))) /
        (COLOR_CHANNELS * FULL_SCALE);
      difference[pixel] = value;
      total += value;
      if (value > args.threshold) {
        changed += 1;
      }
    }

    return { meanDifference: total / pixels, changedShare: changed / pixels, difference };
  };
  /**
   * Whether a row of a mask has edges between two columns; a row off the picture counts as edged,
   * so growth stops at the picture's edge.
   */
  const rowHas = (edgeMask: Uint8Array, y: number, from: number, to: number): boolean => {
    if (y < 0 || y >= height) {
      return true;
    }

    for (let x = Math.max(0, from); x < Math.min(width, to); x += 1) {
      if (edgeMask[y * width + x] === 1) {
        return true;
      }
    }

    return false;
  };
  /**
   * Whether a column of a mask has edges between two rows; a column off the picture counts as
   * edged.
   */
  const columnHas = (edgeMask: Uint8Array, x: number, from: number, to: number): boolean => {
    if (x < 0 || x >= width) {
      return true;
    }

    for (let y = Math.max(0, from); y < Math.min(height, to); y += 1) {
      if (edgeMask[y * width + x] === 1) {
        return true;
      }
    }

    return false;
  };
  /**
   * Finds the reference's edge pixels inside a region's box, with their extent.
   */
  const inkWithin = (
    region: CompareArgs['regions'][number],
    referenceEdges: Uint8Array,
  ): RegionInk => {
    const x0 = Math.max(0, Math.floor(region.rect.x * scale));
    const y0 = Math.max(0, Math.floor(region.rect.y * scale));
    const x1 = Math.min(width, Math.ceil((region.rect.x + region.rect.width) * scale));
    const y1 = Math.min(height, Math.ceil((region.rect.y + region.rect.height) * scale));
    const points: number[] = [];
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (referenceEdges[y * width + x] === 1) {
          points.push(x, y);
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }

    return { points, count: points.length / 2, left, top, right, bottom, x0, y0, x1, y1 };
  };
  /**
   * The scorer of a region's sampled reference edges: each sample is stepped by the offset and
   * counted when it lands on the mask.
   */
  const scorerOf =
    (ink: RegionInk, stride: number): Scorer =>
    (mask, dx, dy) => {
      let found = 0;
      for (let sample = 0; sample < ink.count; sample += stride) {
        if (at(mask, (ink.points[sample * 2] ?? 0) + dx, (ink.points[sample * 2 + 1] ?? 0) + dy)) {
          found += 1;
        }
      }

      return found;
    };
  /**
   * The offset at which the reference edges best match the candidate: a coarse search over the
   * loose mask within the region's margin, a fine search over the near mask around it, and no
   * offset when that matches nearly as well.
   */
  const searchOffset = (
    region: CompareArgs['regions'][number],
    masks: EdgeMasks,
    score: Scorer,
  ): ScoredOffset => {
    const margin = Math.max(MIN_MARGIN_PX, Math.round(region.margin * scale));
    let best = { dx: 0, dy: 0, value: score(masks.loose, 0, 0) };
    for (let dy = -margin; dy <= margin; dy += COARSE_STEP) {
      for (let dx = -margin; dx <= margin; dx += COARSE_STEP) {
        const value = score(masks.loose, dx, dy);
        const closer = Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.dy);
        if (value > best.value || (value === best.value && closer)) {
          best = { dx, dy, value };
        }
      }
    }

    let fine = { dx: best.dx, dy: best.dy, value: score(masks.near, best.dx, best.dy) };
    for (let dy = best.dy - FINE_RADIUS; dy <= best.dy + FINE_RADIUS; dy += 1) {
      for (let dx = best.dx - FINE_RADIUS; dx <= best.dx + FINE_RADIUS; dx += 1) {
        const value = score(masks.near, dx, dy);
        if (value > fine.value) {
          fine = { dx, dy, value };
        }
      }
    }

    const atZero = score(masks.near, 0, 0);
    if (atZero >= fine.value * KEEP_ZERO_SHARE) {
      return { dx: 0, dy: 0, value: atZero };
    }

    return fine;
  };
  /**
   * How far the region's content may grow in each direction before the reference has edges there.
   */
  const growthOf = (
    region: CompareArgs['regions'][number],
    ink: RegionInk,
    referenceEdges: Uint8Array,
  ): Growth => {
    const growX = Math.round(region.extend.x * scale);
    const growY = Math.round(region.extend.y * scale);
    const { x0, y0, x1, y1 } = ink;
    /**
     * How far the region may grow in one direction before the reference has edges there.
     */
    const free = (limit: number, blocked: (step: number) => boolean): number => {
      for (let step = 1; step <= limit; step += 1) {
        if (blocked(step)) {
          return Math.max(0, step - GROWTH_CLEARANCE_PX);
        }
      }

      return limit;
    };
    const rightward = free(growX, (step) => columnHas(referenceEdges, x1 - 1 + step, y0, y1));
    const leftward = free(growX, (step) => columnHas(referenceEdges, x0 - step, y0, y1));
    // Rows are tested across the widened columns the ink box scans, so a taller neighbour just
    // beside the region (an ascender of the title under an eyebrow) stops the growth too.
    const down = free(growY, (step) =>
      rowHas(referenceEdges, y1 - 1 + step, x0 - leftward, x1 + rightward),
    );
    const up = free(growY, (step) =>
      rowHas(referenceEdges, y0 - step, x0 - leftward, x1 + rightward),
    );
    return { leftward, rightward, up, down };
  };
  /**
   * The index of the first row of content that is not a band wholly above the reference's ink: the
   * bands before it are other content, and are left out of the box.
   */
  const firstRowBelow = (
    rows: readonly { count: number }[],
    boxTop: number,
    referenceTop: number,
  ): number => {
    let first = 0;
    for (let index = 0; index < rows.length; index += 1) {
      if ((rows[index]?.count ?? 0) === 0) {
        continue;
      }

      let end = index;
      while (end < rows.length && (rows[end]?.count ?? 0) > 0) {
        end += 1;
      }

      const above = boxTop + end < referenceTop - ABOVE_CLEARANCE_PX;
      if (!above || end >= rows.length) {
        break;
      }

      first = end;
      index = end;
    }

    return first;
  };
  /**
   * The box and count of the candidate's edges in the region grown into its free space, at an
   * offset, leaving out bands of other content wholly above the reference's ink.
   */
  const inkBoxAt = (
    ink: RegionInk,
    growth: Growth,
    candidateEdges: Uint8Array,
    dx: number,
    dy: number,
  ): InkBox => {
    const boxTop = ink.y0 - growth.up + dy;
    const referenceTop = ink.top + dy;
    const rows: { count: number; left: number; right: number }[] = [];
    for (let y = boxTop; y < ink.y1 + growth.down + dy; y += 1) {
      const row = { count: 0, left: width, right: -1 };
      for (let x = ink.x0 - growth.leftward + dx; x < ink.x1 + growth.rightward + dx; x += 1) {
        if (at(candidateEdges, x, y)) {
          row.count += 1;
          row.left = Math.min(row.left, x);
          row.right = Math.max(row.right, x);
        }
      }

      rows.push(row);
    }

    const first = firstRowBelow(rows, boxTop, referenceTop);
    const box: InkBox = { left: width, top: height, right: -1, bottom: -1, count: 0 };
    rows.forEach((row, index) => {
      if (index < first || row.count === 0) {
        return;
      }

      box.count += row.count;
      box.left = Math.min(box.left, row.left);
      box.right = Math.max(box.right, row.right);
      box.top = Math.min(box.top, boxTop + index);
      box.bottom = Math.max(box.bottom, boxTop + index);
    });
    return box;
  };
  /**
   * Chooses where the content sits. The fine template wins unless an edge or centre of the ink in
   * the render matches about as well; then the content is placed on that edge (or the centre), and
   * the template's vertical offset is kept when the edge holds close to the web position.
   */
  const chooseOffset = (
    region: CompareArgs['regions'][number],
    ink: RegionInk,
    fine: ScoredOffset,
    samples: number,
    score: Scorer,
    nearMask: Uint8Array,
    boxAt: (dx: number, dy: number) => InkBox,
  ): { chosen: ScoredOffset; box: InkBox } => {
    const box = boxAt(0, 0);
    if (box.count < ink.count * INK_SHARE_FOR_ALIGN) {
      return { chosen: fine, box: boxAt(fine.dx, fine.dy) };
    }

    let anchorX = Math.round((box.left + box.right - ink.left - ink.right) / 2);
    if (region.anchor === 'left') {
      anchorX = box.left - ink.left;
    } else if (region.anchor === 'right') {
      anchorX = box.right - ink.right;
    }

    const aligned = {
      dx: anchorX,
      dy: box.top - ink.top,
      value: score(nearMask, anchorX, box.top - ink.top),
    };
    const templateWins =
      fine.value >
      aligned.value +
        samples * (region.anchor === 'center' ? CENTER_TEMPLATE_SHARE : EDGE_TEMPLATE_SHARE);
    if (!templateWins) {
      return { chosen: aligned, box };
    }

    const edgeHolds = region.anchor !== 'center' && Math.abs(aligned.dx) <= EDGE_HOLD_PX;
    const chosen = edgeHolds
      ? { dx: aligned.dx, dy: fine.dy, value: score(nearMask, aligned.dx, fine.dy) }
      : fine;
    return { chosen, box: boxAt(chosen.dx, chosen.dy) };
  };
  /**
   * The measurement of a region that has edges: its match and offset, the web's ink box and the
   * render's box around the chosen offset, in comparison pixels turned into canvas pixels.
   */
  const measurementOf = (
    id: string,
    ink: RegionInk,
    chosen: ScoredOffset,
    box: InkBox,
    samples: number,
  ): RegionMeasurement => ({
    id,
    blank: false,
    match: chosen.value / samples,
    offset: { x: chosen.dx / scale, y: chosen.dy / scale },
    reference: {
      x: ink.left / scale,
      y: ink.top / scale,
      width: (ink.right - ink.left + 1) / scale,
      height: (ink.bottom - ink.top + 1) / scale,
    },
    candidate:
      box.right < 0
        ? null
        : {
            x: box.left / scale,
            y: box.top / scale,
            width: (box.right - box.left + 1) / scale,
            height: (box.bottom - box.top + 1) / scale,
          },
    referenceInk: ink.count,
    candidateInk: box.count,
  });
  /**
   * Measures one region: where its web edges sit in the render, how well they match, and the box
   * the render's content takes around them.
   */
  const measureRegion = (
    region: CompareArgs['regions'][number],
    masks: EdgeMasks,
  ): RegionMeasurement => {
    const ink = inkWithin(region, masks.referenceEdges);
    if (ink.count < BLANK_INK) {
      return {
        id: region.id,
        blank: true,
        match: 0,
        offset: { x: 0, y: 0 },
        reference: null,
        candidate: null,
        referenceInk: ink.count,
        candidateInk: 0,
      };
    }

    const stride = Math.max(1, Math.ceil(ink.count / args.maxSamples));
    const score = scorerOf(ink, stride);
    const samples = Math.ceil(ink.count / stride);
    const fine = searchOffset(region, masks, score);
    const growth = growthOf(region, ink, masks.referenceEdges);
    /**
     * The candidate's ink box for this region at an offset.
     */
    const boxAt = (dx: number, dy: number): InkBox =>
      inkBoxAt(ink, growth, masks.candidateEdges, dx, dy);
    const { chosen, box } = chooseOffset(region, ink, fine, samples, score, masks.near, boxAt);
    return measurementOf(region.id, ink, chosen, box, samples);
  };
  /**
   * Measures every region against the two pictures' edge masks, in the order given.
   */
  const measureRegions = (reference: ImageData, candidate: ImageData): RegionMeasurement[] => {
    const referenceEdges = edges(reference);
    const candidateEdges = edges(candidate);
    const masks: EdgeMasks = {
      referenceEdges,
      candidateEdges,
      near: dilate(candidateEdges, 1),
      loose: dilate(candidateEdges, 2),
    };
    return args.regions.map((region) => measureRegion(region, masks));
  };
  /**
   * The heat map of the differences: the reference faded, with the changed pixels tinted red.
   */
  const heatMapOf = (reference: ImageData, difference: Float32Array): ImageData => {
    const heat = new ImageData(width, height);
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const index = pixel * CHANNELS;
      const gray =
        ((reference.data[index] ?? 0) +
          (reference.data[index + 1] ?? 0) +
          (reference.data[index + 2] ?? 0)) /
        COLOR_CHANNELS;
      const faded = FULL_SCALE - (FULL_SCALE - gray) * HEAT_FADE;
      const strength = Math.min(1, (difference[pixel] ?? 0) * HEAT_GAIN);
      heat.data[index] = Math.round(faded * (1 - strength) + CHANGED_RED * strength);
      heat.data[index + 1] = Math.round(faded * (1 - strength) + CHANGED_GREEN * strength);
      heat.data[index + 2] = Math.round(faded * (1 - strength) + CHANGED_BLUE * strength);
      heat.data[index + ALPHA_CHANNEL] = FULL_SCALE;
    }

    return heat;
  };
  /**
   * Outlines each mark on the three panels, with its tag.
   */
  const outlineMarks = (context: CanvasRenderingContext2D, marks: ComparisonMark[]): void => {
    for (const mark of marks) {
      const boxes = [
        { panel: 0, dx: 0, dy: 0 },
        { panel: 1, dx: mark.offset.x, dy: mark.offset.y },
        { panel: 2, dx: 0, dy: 0 },
      ];
      for (const box of boxes) {
        const x = box.panel * width + (mark.rect.x + box.dx) * scale;
        const y = LABEL_BAND_PX + (mark.rect.y + box.dy) * scale;
        context.strokeStyle = '#e01e5a';
        context.strokeRect(x, y, mark.rect.width * scale, mark.rect.height * scale);
        context.fillStyle = '#e01e5a';
        context.fillText(
          mark.tag,
          x + TAG_LEFT_PX,
          Math.max(LABEL_BAND_PX + TAG_BELOW_BAND_PX, y - TAG_ABOVE_BOX_PX),
        );
      }
    }
  };
  /**
   * Draws the reference, the candidate and the heat map of their differences side by side under a
   * label band, with the marks outlined. Returns the PNG as base64, or `null` without a canvas.
   */
  const drawSideBySide = (
    reference: ImageData,
    candidate: ImageData,
    difference: Float32Array,
    meanDifference: number,
    marks: ComparisonMark[],
  ): string | null => {
    const canvas = document.createElement('canvas');
    canvas.width = width * PANELS;
    canvas.height = height + LABEL_BAND_PX;
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.putImageData(reference, 0, LABEL_BAND_PX);
    context.putImageData(candidate, width, LABEL_BAND_PX);
    context.putImageData(heatMapOf(reference, difference), width * 2, LABEL_BAND_PX);
    context.fillStyle = '#161920';
    context.font = '20px system-ui, sans-serif';
    const captions = [
      args.labels[0],
      args.labels[1],
      `difference: ${((1 - meanDifference) * PERCENT).toFixed(1)}% similar`,
    ];
    captions.forEach((caption, panel) => {
      context.fillText(caption, panel * width + CAPTION_X_PX, CAPTION_BASELINE_PX);
    });
    context.lineWidth = MARK_LINE_PX;
    context.font = 'bold 14px system-ui, sans-serif';
    outlineMarks(context, marks);
    const url = canvas.toDataURL('image/png');
    return url.slice(url.indexOf(',') + 1);
  };
  /**
   * Crops one mark from both pictures, the reference above the candidate, as a base64 PNG. Returns
   * `null` without a canvas.
   */
  const cropOf = (
    mark: ComparisonMark,
    referenceBitmap: ImageBitmap,
    candidateBitmap: ImageBitmap,
  ): string | null => {
    const sourceWidth = Math.min(args.canvasWidth, mark.rect.width + CROP_PAD_PX * 2);
    const sourceHeight = mark.rect.height + CROP_PAD_PX * 2;
    const crop = document.createElement('canvas');
    crop.width = Math.round(sourceWidth);
    crop.height = Math.round(sourceHeight * 2 + CROP_GAP_PX);
    const cropContext = crop.getContext('2d');
    if (cropContext === null) {
      return null;
    }

    cropContext.fillStyle = '#e01e5a';
    cropContext.fillRect(0, 0, crop.width, crop.height);
    const panes = [
      { bitmap: referenceBitmap, dx: 0, dy: 0, top: 0 },
      {
        bitmap: candidateBitmap,
        dx: mark.offset.x,
        dy: mark.offset.y,
        top: sourceHeight + CROP_GAP_PX,
      },
    ];
    for (const pane of panes) {
      const ratio = pane.bitmap.width / args.canvasWidth;
      cropContext.drawImage(
        pane.bitmap,
        (mark.rect.x - CROP_PAD_PX + pane.dx) * ratio,
        (mark.rect.y - CROP_PAD_PX + pane.dy) * ratio,
        sourceWidth * ratio,
        sourceHeight * ratio,
        0,
        pane.top,
        sourceWidth,
        sourceHeight,
      );
    }

    const url = crop.toDataURL('image/png');
    return url.slice(url.indexOf(',') + 1);
  };
  /**
   * Crops every mark, in order. Returns `null` without a canvas.
   */
  const cropMarks = (
    marks: ComparisonMark[],
    referenceBitmap: ImageBitmap,
    candidateBitmap: ImageBitmap,
  ): string[] | null => {
    const crops: string[] = [];
    for (const mark of marks) {
      const crop = cropOf(mark, referenceBitmap, candidateBitmap);
      if (crop === null) {
        return null;
      }

      crops.push(crop);
    }

    return crops;
  };

  const referenceImage = await decode(args.reference);
  const candidateImage = await decode(args.candidate);
  if (typeof referenceImage === 'string') {
    return { error: referenceImage };
  }

  if (typeof candidateImage === 'string') {
    return { error: candidateImage };
  }

  const reference = referenceImage.data;
  const candidate = candidateImage.data;
  const { meanDifference, changedShare, difference } = differencesOf(reference, candidate);
  const regions = args.regions.length > 0 ? measureRegions(reference, candidate) : [];
  if (args.marks === null) {
    return { meanDifference, changedShare, regions, sideBySide: '', crops: [] };
  }

  const marks = args.marks;
  const sideBySide = drawSideBySide(reference, candidate, difference, meanDifference, marks);
  if (sideBySide === null) {
    return { error: NO_CANVAS };
  }

  const crops = cropMarks(marks, referenceImage.bitmap, candidateImage.bitmap);
  if (crops === null) {
    return { error: NO_CANVAS };
  }

  return { meanDifference, changedShare, regions, sideBySide, crops };
}
