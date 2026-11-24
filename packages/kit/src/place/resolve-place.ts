import type { LayoutBox, Role, SpaceName, SpacingTokens } from '@deckster/brand';
import type { PlacedName, PlacedWidth, PlacedZone } from '@deckster/engine/manifest';

import {
  checkBoxBounds,
  LAYOUT_CANVAS_HEIGHT,
  LAYOUT_CANVAS_WIDTH,
  RADIUS_NAMES,
  ROLE_NAMES,
  SHADOW_NAMES,
  SPACE_NAMES,
} from '@deckster/brand';

/**
 * Slide zones a placed element may be positioned inside.
 */
export const PLACED_ZONES = ['safe', 'canvas', 'header', 'footer'] as const;

/**
 * Named anchor positions inside a {@link PlacedZone}.
 */
export const PLACED_NAMES = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;

/**
 * Grid-column counts for named width tokens (`sm`, `md`, `lg`).
 */
export const PLACED_SIZE_WORDS = {
  /**
   * Compact width: three grid columns.
   */
  sm: 3,

  /**
   * Medium width: four grid columns.
   */
  md: 4,

  /**
   * Wide width: six grid columns.
   */
  lg: 6,
} as const;

/**
 * A named width token mapped to grid columns by {@link PLACED_SIZE_WORDS}.
 */
export type PlacedSizeWord = keyof typeof PLACED_SIZE_WORDS;

/**
 * Geometric shapes supported by `<Shape>`.
 */
export const SHAPE_GEOMETRIES = [
  'rect',
  'square',
  'ellipse',
  'circle',
  'pill',
  'diamond',
  'triangle',
] as const;

/**
 * A geometric variant of `<Shape>`.
 */
export type ShapeGeometry = (typeof SHAPE_GEOMETRIES)[number];

/**
 * Native OOXML `prstGeom` names written to `data-export-shape`.
 */
export type ShapeExportKind = 'rect' | 'roundRect' | 'ellipse' | 'diamond' | 'triangle';

/**
 * Allowed corner radius values for `<Shape>`.
 */
export const SHAPE_RADII = ['none', ...RADIUS_NAMES, 'full'] as const;

/**
 * Corner radius token for `<Shape>`.
 */
export type ShapeRadius = (typeof SHAPE_RADII)[number];

/**
 * Allowed shadow values for `<Shape>`.
 */
export const SHAPE_SHADOWS = ['none', ...SHADOW_NAMES] as const;

/**
 * Shadow token for `<Shape>`.
 */
export type ShapeShadow = (typeof SHAPE_SHADOWS)[number];

/**
 * Allowed fill values for `<Shape>`: any brand color role, or `none`.
 */
export const SHAPE_FILLS = ['none', ...ROLE_NAMES] as const;

/**
 * Fill token for `<Shape>`.
 */
export type ShapeFill = Role | 'none';

/**
 * Maximum number of placed elements recommended per slide before lint raises an error.
 */
export const PLACED_MAX_COUNT = 4;

/**
 * Maximum words recommended inside one placed element before lint raises a warning.
 */
export const PLACED_MAX_WORDS_PER_ELEMENT = 25;

/**
 * Maximum total words recommended across all placed elements on one slide.
 */
export const PLACED_MAX_WORDS_PER_SLIDE = 40;

/**
 * Maximum share of the safe area one placed element may cover outside `zone="canvas"`.
 */
export const PLACED_MAX_SAFE_AREA_RATIO = 0.35;

/**
 * Default column span for a `square` or `circle` shape when neither `width` nor `height` is given.
 */
const DEFAULT_SQUARE_COLUMNS = 2;

/**
 * Default column span used to estimate the rect of a content-sized placed element before layout.
 */
const DEFAULT_ESTIMATE_COLUMNS = 4;

/**
 * Grid range pattern: 1-based positive integer, optionally followed by `-` and an end integer.
 */
const GRID_RANGE_PATTERN = /^([1-9]\d*)(?:-([1-9]\d*))?$/u;

/**
 * Preference margin (in combined edge pixels) favoring a clean named `place` over a grid cell in
 * {@link nearestPlaceSuggestion}.
 */
const NAMED_PLACE_PREFERENCE_PX = 24;

/**
 * How a placed element specifies its coordinates.
 */
export type PlacedMode = 'place' | 'grid' | 'box';

/**
 * Inclusive 1-based range on the brand grid.
 */
export type GridRange = {
  /**
   * 1-based starting track (inclusive).
   */
  start: number;

  /**
   * 1-based ending track (inclusive).
   */
  end: number;
};

/**
 * Placement inputs accepted by {@link resolvePlace} and {@link validatePlacementInput}. Matches both
 * `PlacedMeta` from `@deckster/engine` and component placement props.
 */
export type PlacedInput = {
  /**
   * Named anchor position within {@link zone}.
   */
  place?: PlacedName | undefined;

  /**
   * Inclusive 1-based column range on the brand grid, such as `"9-12"`.
   */
  cols?: string | undefined;

  /**
   * Inclusive 1-based row range on the brand grid, such as `"1-2"`.
   */
  rows?: string | undefined;

  /**
   * Explicit canvas-pixel box `[x, y, width, height]`.
   */
  box?: LayoutBox | undefined;

  /**
   * Frame the placement is measured in; defaults to `safe` (or `canvas` for `box`).
   */
  zone?: PlacedZone | undefined;

  /**
   * Width in grid columns or a named width token (`sm`, `md`, `lg`).
   */
  width?: PlacedWidth | undefined;

  /**
   * Fixed height in grid rows.
   */
  height?: number | undefined;

  /**
   * Spacing token pulling a named placement inward from its zone edge.
   */
  inset?: string | undefined;

  /**
   * Aspect-ratio lock for geometric variants such as `square` and `circle`.
   */
  aspect?: 'square' | undefined;
};

/**
 * Canvas-pixel positioning styles emitted by {@link resolvePlace}.
 */
export type PlacedPositionStyle = {
  /**
   * Left edge offset from the canvas left edge, in canvas pixels.
   */
  left?: number;

  /**
   * Right edge offset from the canvas right edge, in canvas pixels.
   */
  right?: number;

  /**
   * Top edge offset from the canvas top edge, in canvas pixels.
   */
  top?: number;

  /**
   * Bottom edge offset from the canvas bottom edge, in canvas pixels.
   */
  bottom?: number;

  /**
   * Fixed box width in canvas pixels.
   */
  width?: number;

  /**
   * Fixed box height in canvas pixels.
   */
  height?: number;

  /**
   * Upper bound on width for content-sized boxes, in canvas pixels.
   */
  maxWidth?: number;

  /**
   * Upper bound on height for content-sized boxes, in canvas pixels.
   */
  maxHeight?: number;

  /**
   * Centering transform applied only along auto-sized centered axes.
   */
  transform?: string;
};

/**
 * Resolved placement geometry, positioning styles and metadata for one placed element.
 */
export type PlacedResolution = {
  /**
   * Which placement mode was resolved (`place`, `grid`, or `box`).
   */
  mode: PlacedMode;

  /**
   * The zone the placement is measured in.
   */
  zone: PlacedZone;

  /**
   * Concise specification written to `data-placed-spec`.
   */
  spec: string;

  /**
   * Exact (for fixed-size) or estimated (for content-sized) canvas box `[x, y, width, height]`.
   */
  rect: LayoutBox;

  /**
   * Whether the horizontal size is fixed in canvas pixels.
   */
  fixedWidth: boolean;

  /**
   * Whether the vertical size is fixed in canvas pixels.
   */
  fixedHeight: boolean;

  /**
   * Canvas-pixel positioning styles to apply to the placed wrapper.
   */
  style: PlacedPositionStyle;
};

/**
 * One validation problem returned by {@link validatePlacementInput}.
 */
export type PlacementProblem = {
  /**
   * What is wrong with the placement props.
   */
  message: string;

  /**
   * How to fix it.
   */
  fix: string;
};

/**
 * Maps a `<Shape>` geometry and optional corner radius to its native OOXML `prstGeom` name for
 * `data-export-shape`.
 *
 * @param shape - The `<Shape>` geometry.
 * @param radius - Optional corner radius token (`none`, `sm`..`xl`, `full`).
 * @returns The native OOXML geometry name.
 */
export function shapeExportKind(shape: ShapeGeometry, radius?: string): ShapeExportKind {
  switch (shape) {
    case 'ellipse':
    case 'circle': {
      return 'ellipse';
    }

    case 'diamond': {
      return 'diamond';
    }

    case 'triangle': {
      return 'triangle';
    }

    case 'pill': {
      return 'roundRect';
    }

    case 'rect':
    case 'square': {
      return radius !== undefined && radius !== 'none' ? 'roundRect' : 'rect';
    }
  }
}

/**
 * Whether a `<Shape>` geometry enforces a 1:1 square aspect ratio (`square` or `circle`).
 *
 * @param shape - Optional shape geometry.
 */
export function isSquareShape(shape?: ShapeGeometry): boolean {
  return shape === 'square' || shape === 'circle';
}

/**
 * Whether a component props object sets any slide-level placement prop (`place`, `cols`, `rows` or
 * `box`).
 *
 * @param props - Component props to inspect.
 */
export function hasPlacementProps(props: {
  place?: unknown;
  cols?: unknown;
  rows?: unknown;
  box?: unknown;
}): boolean {
  return (
    props.place !== undefined ||
    props.cols !== undefined ||
    props.rows !== undefined ||
    props.box !== undefined
  );
}

/**
 * The canvas-pixel rectangle `[x, y, width, height]` of a {@link PlacedZone} for a brand's spacing
 * tokens.
 *
 * @param zone - The slide zone.
 * @param spacing - The brand's resolved spacing tokens.
 * @returns The zone rectangle in canvas pixels.
 */
export function zoneRect(zone: PlacedZone, spacing: SpacingTokens): LayoutBox {
  const { x: marginX, y: marginY } = spacing.margin;
  const safeWidth = LAYOUT_CANVAS_WIDTH - 2 * marginX;
  const safeHeight = LAYOUT_CANVAS_HEIGHT - 2 * marginY;
  switch (zone) {
    case 'safe': {
      return [marginX, marginY, safeWidth, safeHeight];
    }

    case 'canvas': {
      return [0, 0, LAYOUT_CANVAS_WIDTH, LAYOUT_CANVAS_HEIGHT];
    }

    case 'header': {
      return [marginX, 0, safeWidth, marginY];
    }

    case 'footer': {
      return [marginX, LAYOUT_CANVAS_HEIGHT - marginY, safeWidth, marginY];
    }
  }
}

/**
 * Parses an inclusive 1-based grid range string (`"2"` or `"2-5"`) bounded by `1..max`.
 *
 * @param raw - The raw range string.
 * @param max - Maximum allowed track index (column or row count).
 * @returns The parsed range, or `null` when malformed or out of bounds.
 */
export function parseGridRange(raw: string, max: number): GridRange | null {
  const match = GRID_RANGE_PATTERN.exec(raw.trim());
  if (match === null) {
    return null;
  }

  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1 || end < start || end > max) {
    return null;
  }

  return { start, end };
}

/**
 * Resolves placement props plus brand spacing tokens into canvas-pixel CSS positioning styles and a
 * canvas box `[x, y, width, height]`.
 *
 * @param input - Placement specification (`place`, `cols`/`rows`, or `box` plus modifiers).
 * @param spacing - The brand's resolved spacing tokens.
 * @returns The resolved mode, zone, spec, estimated or exact rect, and CSS positioning styles.
 */
export function resolvePlace(input: PlacedInput, spacing: SpacingTokens): PlacedResolution {
  if (input.box !== undefined) {
    return resolveBoxMode(input);
  }

  if (input.cols !== undefined || input.rows !== undefined) {
    return resolveGridMode(input, spacing);
  }

  return resolveNamedMode(input, spacing);
}

/**
 * Suggests the nearest idiomatic named `place` or `cols`/`rows` prop string for a raw pixel `box`,
 * used by the `placed-pixels` lint rule.
 *
 * @param box - Raw canvas box `[x, y, width, height]`.
 * @param spacing - The brand's resolved spacing tokens.
 * @returns A concise JSX prop snippet such as `place="top-right" width={3}` or `cols="2-5"
 *   rows="4-5"`.
 */
export function nearestPlaceSuggestion(box: LayoutBox, spacing: SpacingTokens): string {
  const [x, y, width, height] = box;
  const { margin, grid } = spacing;
  const [, , safeW, safeH] = zoneRect('safe', spacing);
  const colW = trackSize(safeW, grid.columns, grid.gutter);
  const rowH = trackSize(safeH, grid.rows, grid.gutter);
  const zone = inferZoneForBox(box, margin);
  const wCols = clampInt(Math.round((width + grid.gutter) / (colW + grid.gutter)), 1, grid.columns);
  const hRows = clampInt(Math.round((height + grid.gutter) / (rowH + grid.gutter)), 1, grid.rows);

  const candidateNames = candidatePlacesForZone(zone);
  let bestNamed: { text: string; error: number } = {
    text: formatNamedSuggestion(candidateNames[0] ?? 'top-left', zone, wCols, undefined),
    error: Number.POSITIVE_INFINITY,
  };
  for (const name of candidateNames) {
    const autoHeightCandidate = resolvePlace({ place: name, zone, width: wCols }, spacing);
    const autoHeightError = boxDistance(box, autoHeightCandidate.rect);
    if (autoHeightError < bestNamed.error) {
      bestNamed = {
        text: formatNamedSuggestion(name, zone, wCols, undefined),
        error: autoHeightError,
      };
    }

    if (zone === 'safe' || zone === 'canvas') {
      const fixedHeightCandidate = resolvePlace(
        { place: name, zone, width: wCols, height: hRows },
        spacing,
      );
      const fixedHeightError = boxDistance(box, fixedHeightCandidate.rect);
      if (fixedHeightError < bestNamed.error) {
        bestNamed = {
          text: formatNamedSuggestion(name, zone, wCols, hRows),
          error: fixedHeightError,
        };
      }
    }
  }

  if (zone === 'header' || zone === 'footer' || zone === 'canvas') {
    return bestNamed.text;
  }

  const [safeX, safeY] = zoneRect('safe', spacing);
  const c1 = closestTrackStart(x, safeX, colW, grid.gutter, grid.columns);
  const c2 = closestTrackEnd(x + width, safeX, colW, grid.gutter, c1, grid.columns);
  const r1 = closestTrackStart(y, safeY, rowH, grid.gutter, grid.rows);
  const r2 = closestTrackEnd(y + height, safeY, rowH, grid.gutter, r1, grid.rows);
  const colsSpec = formatRange(c1, c2);
  const rowsSpec = formatRange(r1, r2);
  const gridCandidate = resolvePlace({ cols: colsSpec, rows: rowsSpec, zone: 'safe' }, spacing);
  const gridError = boxDistance(box, gridCandidate.rect);

  if (bestNamed.error <= gridError + NAMED_PLACE_PREFERENCE_PX) {
    return bestNamed.text;
  }

  return `cols="${colsSpec}" rows="${rowsSpec}"`;
}

/**
 * Validates placement props for mutually exclusive modes, valid zone/place/inset names, grid range
 * bounds, numeric sizes and canvas bounds.
 *
 * @param input - Placement props to validate.
 * @param spacing - The brand's resolved spacing tokens.
 * @returns A list of problems, empty when valid.
 */
export function validatePlacementInput(
  input: PlacedInput,
  spacing: SpacingTokens,
): PlacementProblem[] {
  const problems: PlacementProblem[] = [];
  const hasPlace = input.place !== undefined;
  const hasGrid = input.cols !== undefined || input.rows !== undefined;
  const hasBox = input.box !== undefined;
  const modeCount = Number(hasPlace) + Number(hasGrid) + Number(hasBox);
  if (modeCount > 1) {
    problems.push({
      message: 'Cannot combine `place`, `cols`/`rows`, and `box` on the same element.',
      fix: 'Use only one placement mode: `place="..."`, `cols="..." rows="..."`, or `box={[x, y, w, h]}`.',
    });
  }

  if (input.zone !== undefined && !isPlacedZone(input.zone)) {
    problems.push({
      message: `Unknown zone "${String(input.zone)}".`,
      fix: `Use one of: ${PLACED_ZONES.join(', ')}.`,
    });
  }

  if (input.place !== undefined && !isPlacedName(input.place)) {
    problems.push({
      message: `Unknown place "${String(input.place)}".`,
      fix: `Use one of: ${PLACED_NAMES.join(', ')}.`,
    });
  }

  if (input.inset !== undefined && !isSpaceName(input.inset)) {
    problems.push({
      message: `Unknown inset "${input.inset}".`,
      fix: `Use a brand spacing token: ${SPACE_NAMES.join(', ')}.`,
    });
  }

  if (input.width !== undefined) {
    if (typeof input.width === 'string') {
      if (!(input.width in PLACED_SIZE_WORDS)) {
        problems.push({
          message: `Unknown width "${input.width}".`,
          fix: `Use a column count (1–${spacing.grid.columns}) or one of: ${Object.keys(PLACED_SIZE_WORDS).join(', ')}.`,
        });
      }
    } else if (
      typeof input.width !== 'number' ||
      !Number.isFinite(input.width) ||
      input.width <= 0 ||
      input.width > spacing.grid.columns
    ) {
      problems.push({
        message: `Width ${String(input.width)} is outside the ${spacing.grid.columns}-column grid.`,
        fix: `Use a number greater than 0 and at most ${spacing.grid.columns}, or "sm", "md", "lg".`,
      });
    }
  }

  if (
    input.height !== undefined &&
    (typeof input.height !== 'number' ||
      !Number.isFinite(input.height) ||
      input.height <= 0 ||
      input.height > spacing.grid.rows)
  ) {
    problems.push({
      message: `Height ${String(input.height)} is outside the ${spacing.grid.rows}-row grid.`,
      fix: `Use a number greater than 0 and at most ${spacing.grid.rows}.`,
    });
  }

  if (hasGrid) {
    if (input.cols === undefined) {
      problems.push({
        message: '`rows` cannot be used without `cols`.',
        fix: `Add \`cols="1-${spacing.grid.columns}"\` alongside \`rows\`.`,
      });
    } else if (parseGridRange(input.cols, spacing.grid.columns) === null) {
      problems.push({
        message: `Invalid column range "${input.cols}" for a ${spacing.grid.columns}-column grid.`,
        fix: `Use a 1-based range within 1–${spacing.grid.columns}, such as "9-12" or "4".`,
      });
    }

    if (input.rows === undefined && input.aspect !== 'square') {
      problems.push({
        message: '`cols` requires `rows` (except on a `square` or `circle` shape).',
        fix: `Add \`rows="1-${spacing.grid.rows}"\` alongside \`cols\`.`,
      });
    } else if (input.rows !== undefined && parseGridRange(input.rows, spacing.grid.rows) === null) {
      problems.push({
        message: `Invalid row range "${input.rows}" for a ${spacing.grid.rows}-row grid.`,
        fix: `Use a 1-based range within 1–${spacing.grid.rows}, such as "1-2" or "5".`,
      });
    }
  }

  if (hasBox) {
    if (!Array.isArray(input.box) || input.box.length !== 4) {
      problems.push({
        message: 'Expected `box` to be a 4-number tuple `[x, y, width, height]`.',
        fix: 'Write `box={[x, y, width, height]}` in canvas pixels.',
      });
    } else {
      for (const bound of checkBoxBounds(input.box)) {
        problems.push({ message: bound.message, fix: bound.fix });
      }
    }
  }

  return problems;
}

/**
 * Resolves explicit pixel `box` placement.
 *
 * @param input - Placement input with `box` defined.
 */
function resolveBoxMode(input: PlacedInput): PlacedResolution {
  const [rawX, rawY, rawW, rawH] = input.box ?? [0, 0, 0, 0];
  const x = Math.round(rawX);
  const y = Math.round(rawY);
  const width = Math.round(rawW);
  const height = Math.round(rawH);
  const rect: LayoutBox = [x, y, width, height];
  return {
    mode: 'box',
    zone: input.zone ?? 'canvas',
    spec: `box=${rect.join(',')}`,
    rect,
    fixedWidth: true,
    fixedHeight: true,
    style: { left: x, top: y, width, height },
  };
}

/**
 * Resolves `cols`/`rows` grid-cell placement within a zone.
 *
 * @param input - Placement input with `cols` or `rows` defined.
 * @param spacing - Brand spacing tokens.
 */
function resolveGridMode(input: PlacedInput, spacing: SpacingTokens): PlacedResolution {
  const zone: PlacedZone = input.zone ?? 'safe';
  const [zx, zy, zw, zh] = zoneRect(zone, spacing);
  const { columns, rows, gutter } = spacing.grid;
  const colW = trackSize(zw, columns, gutter);
  const rowH = trackSize(zh, rows, gutter);

  const colRange = parseGridRange(input.cols ?? '1', columns) ?? { start: 1, end: 1 };
  const x1 = zx + (colRange.start - 1) * (colW + gutter);
  const x2 = zx + colRange.end * colW + (colRange.end - 1) * gutter;
  let x = Math.round(x1);
  let width = Math.round(x2) - x;

  let y: number;
  let height: number;
  if (input.rows !== undefined) {
    const rowRange = parseGridRange(input.rows, rows) ?? { start: 1, end: 1 };
    const y1 = zy + (rowRange.start - 1) * (rowH + gutter);
    const y2 = zy + rowRange.end * rowH + (rowRange.end - 1) * gutter;
    y = Math.round(y1);
    height = Math.round(y2) - y;
    if (input.aspect === 'square') {
      const side = Math.min(width, height);
      x = Math.round(x + (width - side) / 2);
      y = Math.round(y + (height - side) / 2);
      width = side;
      height = side;
    }
  } else {
    y = Math.round(zy);
    height = input.aspect === 'square' ? width : Math.round(rowH);
  }

  const rect: LayoutBox = [x, y, width, height];
  const spec =
    input.rows !== undefined
      ? `cols=${input.cols ?? '1'} rows=${input.rows}`
      : `cols=${input.cols ?? '1'}`;
  return {
    mode: 'grid',
    zone,
    spec,
    rect,
    fixedWidth: true,
    fixedHeight: true,
    style: { left: x, top: y, width, height },
  };
}

/**
 * Resolves a named 9-point `place` position within a zone, with optional `inset`, `width`, `height`
 * and square aspect lock.
 *
 * @param input - Placement input.
 * @param spacing - Brand spacing tokens.
 */
function resolveNamedMode(input: PlacedInput, spacing: SpacingTokens): PlacedResolution {
  const zone: PlacedZone = input.zone ?? 'safe';
  const place: PlacedName = input.place ?? 'top-left';
  const [zx, zy, zw, zh] = zoneRect(zone, spacing);
  const insetPx =
    input.inset !== undefined && isSpaceName(input.inset) ? spacing.scale[input.inset] : 0;
  const innerX = zx + insetPx;
  const innerY = zy + insetPx;
  const innerW = Math.max(0, zw - 2 * insetPx);
  const innerH = Math.max(0, zh - 2 * insetPx);

  const [, , safeW, safeH] = zoneRect('safe', spacing);
  const { columns, rows, gutter } = spacing.grid;
  const safeColW = trackSize(safeW, columns, gutter);
  const safeRowH = trackSize(safeH, rows, gutter);

  let widthPx = resolveWidthPx(input.width, safeColW, gutter);
  let heightPx =
    input.height !== undefined && Number.isFinite(input.height) && input.height > 0
      ? Math.round(spanPx(input.height, safeRowH, gutter))
      : undefined;

  if (input.aspect === 'square') {
    if (widthPx !== undefined && heightPx === undefined) {
      heightPx = widthPx;
    } else if (heightPx !== undefined && widthPx === undefined) {
      widthPx = heightPx;
    } else if (widthPx === undefined && heightPx === undefined) {
      const side = Math.round(spanPx(DEFAULT_SQUARE_COLUMNS, safeColW, gutter));
      widthPx = side;
      heightPx = side;
    } else if (widthPx !== undefined && heightPx !== undefined) {
      const side = Math.min(widthPx, heightPx);
      widthPx = side;
      heightPx = side;
    }
  }

  const hAnchor = horizontalAnchor(place);
  const vAnchor = verticalAnchor(place);
  const style: PlacedPositionStyle = {};

  const estW =
    widthPx ?? Math.round(Math.min(innerW, spanPx(DEFAULT_ESTIMATE_COLUMNS, safeColW, gutter)));
  const estH = heightPx ?? Math.round(Math.min(innerH, safeRowH));

  let rectX: number;
  let centerXTransform = false;
  if (hAnchor === 'left') {
    rectX = Math.round(innerX);
    style.left = rectX;
  } else if (hAnchor === 'right') {
    rectX = Math.round(innerX + innerW - estW);
    style.right = Math.round(LAYOUT_CANVAS_WIDTH - (innerX + innerW));
  } else {
    rectX = Math.round(innerX + (innerW - estW) / 2);
    if (widthPx !== undefined) {
      style.left = rectX;
    } else {
      style.left = Math.round(innerX + innerW / 2);
      centerXTransform = true;
    }
  }

  if (widthPx !== undefined) {
    style.width = widthPx;
  } else {
    style.maxWidth = Math.round(innerW);
  }

  let rectY: number;
  let centerYTransform = false;
  if (vAnchor === 'top') {
    rectY = Math.round(innerY);
    style.top = rectY;
  } else if (vAnchor === 'bottom') {
    rectY = Math.round(innerY + innerH - estH);
    style.bottom = Math.round(LAYOUT_CANVAS_HEIGHT - (innerY + innerH));
  } else {
    rectY = Math.round(innerY + (innerH - estH) / 2);
    if (heightPx !== undefined) {
      style.top = rectY;
    } else {
      style.top = Math.round(innerY + innerH / 2);
      centerYTransform = true;
    }
  }

  if (heightPx !== undefined) {
    style.height = heightPx;
  } else {
    style.maxHeight = Math.round(innerH);
  }

  if (centerXTransform && centerYTransform) {
    style.transform = 'translate(-50%, -50%)';
  } else if (centerXTransform) {
    style.transform = 'translateX(-50%)';
  } else if (centerYTransform) {
    style.transform = 'translateY(-50%)';
  }

  return {
    mode: 'place',
    zone,
    spec: place,
    rect: [rectX, rectY, estW, estH],
    fixedWidth: widthPx !== undefined,
    fixedHeight: heightPx !== undefined,
    style,
  };
}

/**
 * Width of one column or row track inside a container with `count` tracks and `gutter` between
 * them.
 *
 * @param total - Total width or height in canvas pixels.
 * @param count - Track count.
 * @param gutter - Gap between adjacent tracks in canvas pixels.
 */
function trackSize(total: number, count: number, gutter: number): number {
  return (total - (count - 1) * gutter) / count;
}

/**
 * Total pixel extent of `span` tracks plus the gutters between them.
 *
 * @param span - Track count (positive).
 * @param track - Single track size in canvas pixels.
 * @param gutter - Gap between adjacent tracks in canvas pixels.
 */
function spanPx(span: number, track: number, gutter: number): number {
  return span <= 1 ? span * track : span * track + (span - 1) * gutter;
}

/**
 * Converts a `width` prop (number of columns or size word) to canvas pixels, or `undefined` when
 * omitted or invalid.
 *
 * @param width - Width prop value.
 * @param colW - Safe-area column width in canvas pixels.
 * @param gutter - Grid gutter in canvas pixels.
 */
function resolveWidthPx(
  width: PlacedWidth | undefined,
  colW: number,
  gutter: number,
): number | undefined {
  if (width === undefined) {
    return undefined;
  }

  if (typeof width === 'string') {
    const cols =
      width in PLACED_SIZE_WORDS ? PLACED_SIZE_WORDS[width as PlacedSizeWord] : undefined;
    return cols === undefined ? undefined : Math.round(spanPx(cols, colW, gutter));
  }

  return Number.isFinite(width) && width > 0 ? Math.round(spanPx(width, colW, gutter)) : undefined;
}

/**
 * Horizontal alignment implied by a named place.
 *
 * @param place - Named place.
 */
function horizontalAnchor(place: PlacedName): 'left' | 'center' | 'right' {
  if (place === 'top-left' || place === 'left' || place === 'bottom-left') {
    return 'left';
  }

  if (place === 'top-right' || place === 'right' || place === 'bottom-right') {
    return 'right';
  }

  return 'center';
}

/**
 * Vertical alignment implied by a named place.
 *
 * @param place - Named place.
 */
function verticalAnchor(place: PlacedName): 'top' | 'center' | 'bottom' {
  if (place === 'top-left' || place === 'top' || place === 'top-right') {
    return 'top';
  }

  if (place === 'bottom-left' || place === 'bottom' || place === 'bottom-right') {
    return 'bottom';
  }

  return 'center';
}

/**
 * Whether a string is a valid {@link PlacedZone}.
 *
 * @param value - Value to check.
 */
function isPlacedZone(value: string): value is PlacedZone {
  return (PLACED_ZONES as readonly string[]).includes(value);
}

/**
 * Whether a string is a valid {@link PlacedName}.
 *
 * @param value - Value to check.
 */
function isPlacedName(value: string): value is PlacedName {
  return (PLACED_NAMES as readonly string[]).includes(value);
}

/**
 * Whether a string is a valid brand {@link SpaceName}.
 *
 * @param value - Value to check.
 */
function isSpaceName(value: string): value is SpaceName {
  return (SPACE_NAMES as readonly string[]).includes(value);
}

/**
 * Named places to consider when suggesting a placement for a zone: top edge anchors for `header`,
 * bottom edge anchors for `footer`, and all nine anchors for `safe` and `canvas`.
 *
 * @param zone - The inferred zone.
 */
function candidatePlacesForZone(zone: PlacedZone): readonly PlacedName[] {
  if (zone === 'header') {
    return ['top-left', 'top', 'top-right'];
  }

  if (zone === 'footer') {
    return ['bottom-left', 'bottom', 'bottom-right'];
  }

  return PLACED_NAMES;
}

/**
 * Infers which slide zone a raw pixel box sits in for {@link nearestPlaceSuggestion}.
 *
 * @param box - Raw canvas box.
 * @param margin - Brand slide margins.
 */
function inferZoneForBox(box: LayoutBox, margin: Readonly<{ x: number; y: number }>): PlacedZone {
  const [x, y, width, height] = box;
  const centerY = y + height / 2;
  if (centerY <= margin.y && x >= margin.x / 2 && x + width <= LAYOUT_CANVAS_WIDTH - margin.x / 2) {
    return 'header';
  }

  if (
    centerY >= LAYOUT_CANVAS_HEIGHT - margin.y &&
    x >= margin.x / 2 &&
    x + width <= LAYOUT_CANVAS_WIDTH - margin.x / 2
  ) {
    return 'footer';
  }

  if (
    x < margin.x / 2 ||
    y < margin.y / 2 ||
    x + width > LAYOUT_CANVAS_WIDTH - margin.x / 2 ||
    y + height > LAYOUT_CANVAS_HEIGHT - margin.y / 2
  ) {
    return 'canvas';
  }

  return 'safe';
}

/**
 * Manhattan distance across all four edges of two canvas boxes.
 *
 * @param first - First box.
 * @param second - Second box.
 */
function boxDistance(first: LayoutBox, second: LayoutBox): number {
  const [ax, ay, aw, ah] = first;
  const [bx, by, bw, bh] = second;
  return (
    Math.abs(ax - bx) +
    Math.abs(ay - by) +
    Math.abs(ax + aw - (bx + bw)) +
    Math.abs(ay + ah - (by + bh))
  );
}

/**
 * Formats a suggested named placement prop string.
 *
 * @param place - Named anchor.
 * @param zone - Zone name.
 * @param widthCols - Width in columns.
 * @param heightRows - Optional height in rows.
 */
function formatNamedSuggestion(
  place: PlacedName,
  zone: PlacedZone,
  widthCols: number,
  heightRows: number | undefined,
): string {
  const parts = [`place="${place}"`];
  if (zone !== 'safe') {
    parts.push(`zone="${zone}"`);
  }

  parts.push(`width={${widthCols}}`);
  if (heightRows !== undefined) {
    parts.push(`height={${heightRows}}`);
  }

  return parts.join(' ');
}

/**
 * Finds the 1-based track whose leading edge is closest to `pos`.
 *
 * @param pos - Target coordinate in canvas pixels.
 * @param origin - Zone leading coordinate in canvas pixels.
 * @param size - Single track size in canvas pixels.
 * @param gutter - Gutter between tracks.
 * @param count - Total track count.
 */
function closestTrackStart(
  pos: number,
  origin: number,
  size: number,
  gutter: number,
  count: number,
): number {
  let best = 1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let track = 1; track <= count; track += 1) {
    const edge = origin + (track - 1) * (size + gutter);
    const dist = Math.abs(pos - edge);
    if (dist < bestDist) {
      best = track;
      bestDist = dist;
    }
  }

  return best;
}

/**
 * Finds the 1-based track (at least `minTrack`) whose trailing edge is closest to `pos`.
 *
 * @param pos - Target trailing coordinate in canvas pixels.
 * @param origin - Zone leading coordinate in canvas pixels.
 * @param size - Single track size in canvas pixels.
 * @param gutter - Gutter between tracks.
 * @param minTrack - Minimum ending track (inclusive).
 * @param count - Total track count.
 */
function closestTrackEnd(
  pos: number,
  origin: number,
  size: number,
  gutter: number,
  minTrack: number,
  count: number,
): number {
  let best = minTrack;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let track = minTrack; track <= count; track += 1) {
    const edge = origin + track * size + (track - 1) * gutter;
    const dist = Math.abs(pos - edge);
    if (dist < bestDist) {
      best = track;
      bestDist = dist;
    }
  }

  return best;
}

/**
 * Formats a 1-based inclusive grid range (`"4"` or `"2-5"`).
 *
 * @param start - Starting track.
 * @param end - Ending track.
 */
function formatRange(start: number, end: number): string {
  return start === end ? String(start) : `${start}-${end}`;
}

/**
 * Clamps a value to an integer within `[min, max]`.
 *
 * @param value - Numeric value.
 * @param min - Minimum integer.
 * @param max - Maximum integer.
 */
function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
