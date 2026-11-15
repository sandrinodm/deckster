import type * as fontkit from 'fontkit';

import { openSync } from 'fontkit';

import type { SceneParagraph, SceneRun } from '#scene/scene.ts';
import type { PathCommand, Point } from '#vector/svg-path.ts';

import { maxOf } from '#units.ts';
import { formatPath } from '#vector/svg-path.ts';

/**
 * The length of `#rrggbb`.
 */
const OPAQUE_HEX_LENGTH = 7;

/**
 * The largest value of one colour byte, which the alpha byte of `#rrggbbaa` is divided by.
 */
const MAX_COLOR_BYTE = 255;

/**
 * Decimal places of a fill opacity in the SVG markup.
 */
const FILL_OPACITY_DIGITS = 3;

/**
 * The factor that turns a quadratic curve's control point into the two cubic control points of the
 * same curve.
 */
const CUBIC_FROM_QUADRATIC = 2 / 3;

/**
 * The metric points the variation table stores after a glyph's outline.
 */
const VARIATION_METRIC_POINTS = 4;

/**
 * Text at or above this size, in canvas pixels, is outlined by `--outline-text`: display, headline,
 * stat and quote type, where the brand's variable-font axes (width, optical size, exact weight)
 * matter most and PowerPoint cannot set them.
 */
export const OUTLINE_MIN_SIZE_PX = 60;

/**
 * A font file of the brand, by family, for outlining.
 */
export type OutlineFace = {
  /**
   * The family name the deck uses.
   */
  family: string;

  /**
   * The font file.
   */
  file: string;

  /**
   * The style.
   */
  style: 'normal' | 'italic';
};

/**
 * Finds the font a run is set in, or `null` when the brand has no file for it.
 */
export type OutlineFonts = (family: string, italic: boolean) => fontkit.Font | null;

/**
 * Opens the brand's font files lazily, one per family and style.
 *
 * @param faces - The brand's faces; the first face of each family and style is used, so pass the
 *   Latin subset first.
 * @returns A lookup that returns `null` for unknown families or files that do not open.
 */
export function outlineFonts(faces: readonly OutlineFace[]): OutlineFonts {
  const cache = new Map<string, fontkit.Font | null>();
  return (family, italic) => {
    const key = `${family}|${italic ? 'italic' : 'normal'}`;
    if (!cache.has(key)) {
      const face =
        faces.find(
          (candidate) => candidate.family === family && (candidate.style === 'italic') === italic,
        ) ?? faces.find((candidate) => candidate.family === family);
      cache.set(key, face === undefined ? null : openFont(face.file));
    }

    return cache.get(key) ?? null;
  };
}

/**
 * Whether a frame qualifies for outlining: its largest run is at least {@link OUTLINE_MIN_SIZE_PX},
 * so a stat with a smaller unit is outlined whole.
 *
 * @param paragraphs - The frame's paragraphs.
 */
export function isOutlineCandidate(paragraphs: readonly SceneParagraph[]): boolean {
  const runs = paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.runs));
  return runs.length > 0 && maxOf(runs.map((run) => run.style.size)) >= OUTLINE_MIN_SIZE_PX;
}

/**
 * The share of the largest font size an outlined frame's picture reaches past its box on every
 * side, for ascenders, descenders and accents a tight line height lets out.
 */
const OUTLINE_BLEED_EM = 0.3;

/**
 * The box an outlined frame's picture covers: the frame's box with room around it for glyphs that
 * reach past it, inside the canvas.
 *
 * @param rect - The frame's box.
 * @param paragraphs - Its paragraphs.
 * @param canvas - The canvas size.
 * @param canvas.width - Its width.
 * @param canvas.height - Its height.
 */
export function outlineBox(
  rect: { x: number; y: number; width: number; height: number },
  paragraphs: readonly SceneParagraph[],
  canvas: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const sizes = paragraphs.flatMap((paragraph) =>
    paragraph.lines.flatMap((line) => line.runs.map((run) => run.style.size)),
  );
  const bleed = maxOf(sizes, 0) * OUTLINE_BLEED_EM;
  const x = Math.max(0, rect.x - bleed);
  const y = Math.max(0, rect.y - bleed);
  const right = Math.min(canvas.width, rect.x + rect.width + bleed);
  const bottom = Math.min(canvas.height, rect.y + rect.height + bleed);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Draws a text frame as an SVG of its glyphs: every run shaped with the brand font at the axes the
 * browser used (weight, width, optical size), placed on the browser's baselines from each run's
 * measured start, filled with the run's color, in a document whose view box is the frame's box in
 * canvas pixels. The writer places it as a picture whose fallback is the browser's own rendering:
 * Apple's Office renderer draws only the first contour of a custom shape and nothing of one inside
 * a group, so freeform glyphs would lose letters there.
 *
 * @param paragraphs - The frame's paragraphs.
 * @param fonts - The brand's fonts.
 * @param box - The frame's box in canvas pixels.
 * @returns The SVG markup, or `null` when a font is missing or nothing is drawn.
 */
export function outlineSvg(
  paragraphs: readonly SceneParagraph[],
  fonts: OutlineFonts,
  box: { x: number; y: number; width: number; height: number },
): string | null {
  const runs = paragraphs.flatMap((paragraph) =>
    paragraph.lines.flatMap((line) => line.runs.map((run) => ({ run, baseline: line.baseline }))),
  );
  const paths: string[] = [];
  for (const { run, baseline } of runs) {
    const commands = runOutline(run, baseline, fonts);
    if (commands === null) {
      return null;
    }

    if (commands.length > 0) {
      paths.push(runPath(run, commands));
    }
  }

  if (paths.length === 0) {
    return null;
  }

  const view = [box.x, box.y, box.width, box.height].map((value) => value.toFixed(2)).join(' ');
  const attributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="${view}"`,
    `width="${box.width.toFixed(2)}"`,
    `height="${box.height.toFixed(2)}"`,
  ];
  return `<svg ${attributes.join(' ')}>${paths.join('')}</svg>`;
}

/**
 * The SVG path of one run's outline in the run's colour. A colour with an alpha byte (`#rrggbbaa`)
 * becomes a fill opacity.
 *
 * @param run - The run.
 * @param commands - The run's outline in canvas pixels.
 */
function runPath(run: SceneRun, commands: PathCommand[]): string {
  const color = run.style.color.slice(0, OPAQUE_HEX_LENGTH);
  const alpha =
    run.style.color.length > OPAQUE_HEX_LENGTH
      ? Number.parseInt(run.style.color.slice(OPAQUE_HEX_LENGTH), 16) / MAX_COLOR_BYTE
      : 1;
  const opacity = alpha < 1 ? ` fill-opacity="${alpha.toFixed(FILL_OPACITY_DIGITS)}"` : '';
  return `<path d="${formatPath(commands)}" fill="${color}"${opacity}/>`;
}

/**
 * The outline of one run in canvas pixels, or `null` when its font is missing.
 *
 * @param run - The run.
 * @param baseline - The line's baseline.
 * @param fonts - The brand's fonts.
 */
export function runOutline(
  run: SceneRun,
  baseline: number,
  fonts: OutlineFonts,
): PathCommand[] | null {
  const base = fonts(run.style.family, run.style.italic);
  if (base === null) {
    return null;
  }

  const font = instanceOf(base, run.style.axes, run.style.size);
  const scale = run.style.size / font.unitsPerEm;
  const text = run.style.caps === 'all' ? run.text.toUpperCase() : run.text;
  const shaped = font.layout(text);
  const commands: PathCommand[] = [];
  let pen = run.rect.x;
  shaped.glyphs.forEach((glyph, index) => {
    const position = shaped.positions[index];
    const originX = pen + (position?.xOffset ?? 0) * scale;
    const originY = baseline - (position?.yOffset ?? 0) * scale;
    /**
     * Maps a point in font units to canvas pixels.
     */
    const map = (x: number, y: number): Point => ({
      x: originX + x * scale,
      y: originY - y * scale,
    });
    commands.push(...glyphCommands(glyph, map));
    pen += (position?.xAdvance ?? 0) * scale + run.style.letterSpacing;
  });
  return commands;
}

/**
 * A glyph's outline as absolute commands, quadratic curves raised to cubics.
 *
 * @param glyph - The glyph.
 * @param map - Maps font units to canvas pixels.
 */
function glyphCommands(glyph: fontkit.Glyph, map: (x: number, y: number) => Point): PathCommand[] {
  const path = (
    glyph as fontkit.Glyph & { path: { commands: { command: string; args: number[] }[] } }
  ).path;
  const commands: PathCommand[] = [];
  let current: Point = { x: 0, y: 0 };
  for (const { command, args } of path.commands) {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = args;
    switch (command) {
      case 'moveTo': {
        current = map(a, b);
        commands.push({ type: 'M', points: [current] });
        break;
      }

      case 'lineTo': {
        current = map(a, b);
        commands.push({ type: 'L', points: [current] });
        break;
      }

      case 'quadraticCurveTo': {
        const control = map(a, b);
        const end = map(c, d);
        commands.push({ type: 'C', points: [...cubicControls(current, control, end), end] });
        current = end;
        break;
      }

      case 'bezierCurveTo': {
        current = map(e, f);
        commands.push({ type: 'C', points: [map(a, b), map(c, d), current] });
        break;
      }

      case 'closePath': {
        commands.push({ type: 'Z', points: [] });
      }
    }
  }

  return commands;
}

/**
 * The two cubic control points of the quadratic curve from `start` through `control` to `end`.
 *
 * @param start - The curve's start point.
 * @param control - The quadratic control point.
 * @param end - The curve's end point.
 */
function cubicControls(start: Point, control: Point, end: Point): [Point, Point] {
  return [
    {
      x: start.x + CUBIC_FROM_QUADRATIC * (control.x - start.x),
      y: start.y + CUBIC_FROM_QUADRATIC * (control.y - start.y),
    },
    {
      x: end.x + CUBIC_FROM_QUADRATIC * (control.x - end.x),
      y: end.y + CUBIC_FROM_QUADRATIC * (control.y - end.y),
    },
  ];
}

/**
 * The font at a run's axes, clamped to the axes the font has; optical size follows the font size
 * when the run does not set it, as browsers do.
 *
 * @param font - The variable or static font.
 * @param axes - The run's axes.
 * @param size - The font size in canvas pixels.
 */
function instanceOf(
  font: fontkit.Font,
  axes: Readonly<Record<string, number>>,
  size: number,
): fontkit.Font {
  const available = font.variationAxes;
  const tags = Object.keys(available);
  if (tags.length === 0) {
    return font;
  }

  const settings: Record<string, number> = {};
  for (const tag of tags) {
    const axis = available[tag];
    const wanted = axes[tag] ?? (tag === 'opsz' ? size : undefined);
    if (axis !== undefined && wanted !== undefined) {
      settings[tag] = Math.min(axis.max, Math.max(axis.min, wanted));
    }
  }

  return variationOf(font, settings);
}

/**
 * A point of a decoded TrueType glyph, as fontkit stores it.
 */
type GlyphPoint = {
  /**
   * Whether the point is on the curve.
   */
  onCurve: boolean;

  /**
   * Whether it ends a contour.
   */
  endContour: boolean;

  /**
   * Horizontal position in font units.
   */
  x: number;

  /**
   * Vertical position in font units.
   */
  y: number;
};

/**
 * A decoded TrueType glyph, as fontkit stores it.
 */
type DecodedGlyph = {
  /**
   * Contours, or a negative count for a composite glyph.
   */
  numberOfContours: number;

  /**
   * The points of a simple glyph.
   */
  points?: GlyphPoint[];

  /**
   * The parts of a composite glyph.
   */
  components?: { dx: number; dy: number }[];

  /**
   * Metrics points after variation.
   */
  phantomPoints?: GlyphPoint[];
};

/**
 * The glyph internals the WOFF2 variation fix uses.
 */
type GlyphInternals = fontkit.Glyph & {
  /**
   * Decodes the glyph's outline.
   */
  _decode: () => DecodedGlyph | null;
};

/**
 * The font internals the WOFF2 variation fix uses.
 */
type FontInternals = fontkit.Font & {
  /**
   * WOFF2 only: the decoded glyph table.
   */
  _transformedGlyphs?: (DecodedGlyph | null)[];

  /**
   * The variation coordinates.
   */
  variationCoords: number[] | null;

  /**
   * The glyph cache.
   */
  _glyphs: Record<number, fontkit.Glyph>;

  /**
   * Applies variation deltas to glyph points.
   */
  _variationProcessor: { transformPoints: (glyph: number, points: GlyphPoint[]) => void } | null;

  /**
   * The font variations table.
   */
  fvar: { axis: { axisTag: string; minValue: number; maxValue: number; defaultValue: number }[] };
};

/**
 * Getters fontkit caches per font that depend on the variation coordinates.
 */
const VARIATION_DEPENDENT = ['_variationProcessor', '_layoutEngine'];

/**
 * A variation instance of a font. For TrueType files this is fontkit's `getVariation`. fontkit
 * 2.0.4 cannot vary WOFF2 fonts (Fontsource ships WOFF2): `getVariation` re-parses them as
 * TrueType, and WOFF2 glyphs skip the variation deltas. So for WOFF2 the instance is a view of the
 * decoded font with its own coordinates and glyph cache, whose glyphs apply the deltas themselves.
 *
 * @param font - The variable font.
 * @param settings - Axis values by tag.
 */
function variationOf(font: fontkit.Font, settings: Readonly<Record<string, number>>): fontkit.Font {
  const internals = font as FontInternals;
  if (internals._transformedGlyphs === undefined && !('_transformGlyfTable' in internals)) {
    return font.getVariation(settings);
  }

  font.getGlyph(0);
  const variant = Object.create(font) as FontInternals;
  variant.variationCoords = variationCoordinates(internals, settings);
  variant._glyphs = {};
  for (const key of VARIATION_DEPENDENT) {
    getterOf(font, key)?.call(variant);
  }

  const getGlyph = Reflect.get(font, 'getGlyph') as (
    this: FontInternals,
    id: number,
    codePoints?: number[],
  ) => fontkit.Glyph | null;
  variant.getGlyph = (id: number, codePoints?: number[]) => {
    const glyph = getGlyph.call(variant, id, codePoints) as GlyphInternals | null;
    if (glyph !== null) {
      glyph._decode = () => variedGlyph(variant, glyph);
    }

    return glyph as fontkit.Glyph;
  };
  return variant;
}

/**
 * The coordinates of a font's axes for a variation: each axis's setting, clamped to the axis's
 * range, or its default when the setting is missing.
 *
 * @param font - The font whose axes these are.
 * @param settings - Axis values by tag.
 */
function variationCoordinates(
  font: FontInternals,
  settings: Readonly<Record<string, number>>,
): number[] {
  return font.fvar.axis.map((axis) => {
    const value = settings[axis.axisTag.trim()];
    return value === undefined
      ? axis.defaultValue
      : Math.max(axis.minValue, Math.min(axis.maxValue, value));
  });
}

/**
 * A WOFF2 glyph's outline with the variation deltas applied, as fontkit applies them to TrueType
 * glyphs.
 *
 * @param font - The variation instance.
 * @param glyph - The glyph.
 */
function variedGlyph(font: FontInternals, glyph: GlyphInternals): DecodedGlyph | null {
  const base = font._transformedGlyphs?.[glyph.id] ?? null;
  const processor = font._variationProcessor;
  if (base === null || processor === null) {
    return base;
  }

  const Point = pointClass(font);
  const copy: DecodedGlyph = {
    ...base,
    ...(base.points === undefined
      ? {}
      : {
          points: base.points.map(
            (point) => new Point(point.onCurve, point.endContour, point.x, point.y),
          ),
        }),
    ...(base.components === undefined
      ? {}
      : { components: base.components.map((component) => ({ ...component })) }),
  };
  const own =
    copy.points ??
    (copy.components ?? []).map((component) => new Point(true, true, component.dx, component.dy));
  // The variation table carries deltas for four metric points after the outline; the advance comes
  // from HVAR, so these only keep the point count right.
  const phantoms = Array.from(
    { length: VARIATION_METRIC_POINTS },
    () => new Point(false, true, 0, 0),
  );
  const points = [...own, ...phantoms];
  processor.transformPoints(glyph.id, points);
  copy.phantomPoints = points.slice(-VARIATION_METRIC_POINTS);
  (copy.components ?? []).forEach((component, index) => {
    component.dx = points[index]?.x ?? component.dx;
    component.dy = points[index]?.y ?? component.dy;
  });
  return copy;
}

/**
 * Fontkit's glyph point class, which variation processing needs (it copies points), taken from the
 * first simple glyph of the font.
 *
 * @param font - A WOFF2 font with its glyph table decoded.
 */
function pointClass(
  font: FontInternals,
): new (onCurve: boolean, endContour: boolean, x: number, y: number) => GlyphPoint {
  const sample = font._transformedGlyphs?.find((glyph) => (glyph?.points?.length ?? 0) > 0)
    ?.points?.[0];
  return (sample?.constructor ?? Object) as new (
    onCurve: boolean,
    endContour: boolean,
    x: number,
    y: number,
  ) => GlyphPoint;
}

/**
 * The getter of a property somewhere on an object's prototype chain.
 *
 * @param object - The object.
 * @param key - The property.
 */
function getterOf(object: object, key: string): (() => unknown) | undefined {
  for (
    let proto = Object.getPrototypeOf(object) as object | null;
    proto !== null;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    const getter: unknown = Reflect.get(Object.getOwnPropertyDescriptor(proto, key) ?? {}, 'get');
    if (typeof getter === 'function') {
      return getter as () => unknown;
    }
  }

  return undefined;
}

/**
 * Opens a font file, or `null` when it cannot be read.
 *
 * @param file - The font file.
 */
function openFont(file: string): fontkit.Font | null {
  try {
    const opened = openSync(file);
    return 'fonts' in opened ? (opened.fonts[0] ?? null) : opened;
  } catch {
    return null;
  }
}
