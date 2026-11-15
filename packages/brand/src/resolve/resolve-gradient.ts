import type {
  GradientStopTokens,
  GradientTokens,
  LinearGradientTokens,
  MeshGradientTokens,
  RadialGradientTokens,
} from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { Gradient } from '#schema/gradient-schema.ts';

import { cssColor, cssNumber, cssUrl } from '#compile/css-syntax.ts';

/**
 * How far a mesh glow reaches when its point gives no size, in percent of the slide.
 */
const DEFAULT_MESH_SIZE = 60;

/**
 * Where a radial gradient is centred when it gives no position, in percent.
 */
const DEFAULT_CENTER = {
  /**
   * Half the slide's width.
   */
  x: 50,

  /**
   * Half the slide's height.
   */
  y: 50,
} as const;

/**
 * Noise tile size in CSS pixels; large enough that the repeat never shows.
 */
const GRAIN_TILE_PX = 280;

/**
 * Turbulence frequency of the grain; higher is finer.
 */
const GRAIN_FREQUENCY = 0.85;

/**
 * The position of a gradient line's end, in percent.
 */
const END_PERCENT = 100;

/**
 * The stops of a linear or radial gradient as the brand writes them.
 */
type Stops = Extract<Gradient, { type: 'linear' }>['stops'];

/**
 * Builds a gradient's `background-image` value from its own layers, with the grain layer added.
 */
type CssOf = (layers: readonly string[]) => string;

/**
 * Compiles a gradient to a CSS `background-image` value and describes it as data: its kind, angle
 * or center, and every stop with its position filled in, or a mesh's base and glows. Mesh gradients
 * are layered radial glows over their base color; grain is an SVG noise layer on top.
 *
 * @param gradient - The decoded gradient.
 * @param path - Its path in the brand, for reference problems, such as `gradients.aurora`.
 * @param colors - The brand's color resolver.
 */
export function resolveGradient(
  gradient: Gradient,
  path: string,
  colors: ColorResolver,
): GradientTokens {
  const grain = gradient.grain;
  const grainLayers = grain === undefined || grain === 0 ? [] : [grainLayer(grain)];
  /**
   * The full `background-image` value: grain on top of the gradient's own layers.
   */
  const css = (layers: readonly string[]): string => [...grainLayers, ...layers].join(', ');
  switch (gradient.type) {
    case 'linear': {
      return { ...resolveLinear(gradient, path, colors, css), grain };
    }

    case 'radial': {
      return { ...resolveRadial(gradient, path, colors, css), grain };
    }

    case 'mesh': {
      const mesh = resolveMesh(gradient, path, colors);
      return { ...mesh, css: css(meshLayers(mesh)), grain };
    }
  }
}

/**
 * A linear gradient's stops, CSS and colors.
 *
 * @param gradient - The linear gradient.
 * @param path - Its field path, for bad references.
 * @param colors - The resolver, which records bad references.
 * @param css - Adds the grain layer.
 */
function resolveLinear(
  gradient: Extract<Gradient, { type: 'linear' }>,
  path: string,
  colors: ColorResolver,
  css: CssOf,
): Omit<LinearGradientTokens, 'grain'> {
  const stops = resolveStops(gradient.stops, `${path}.stops`, colors);
  const layer = `linear-gradient(${cssNumber(gradient.angle)}deg, ${stopList(gradient.stops, stops)})`;
  return {
    type: 'linear',
    angle: gradient.angle,
    stops,
    css: css([layer]),
    colors: stops.map((stop) => stop.color),
  };
}

/**
 * A radial gradient's shape, center, stops, CSS and colors; an ellipse at the center unless it says
 * otherwise.
 *
 * @param gradient - The radial gradient.
 * @param path - Its field path, for bad references.
 * @param colors - The resolver, which records bad references.
 * @param css - Adds the grain layer.
 */
function resolveRadial(
  gradient: Extract<Gradient, { type: 'radial' }>,
  path: string,
  colors: ColorResolver,
  css: CssOf,
): Omit<RadialGradientTokens, 'grain'> {
  const stops = resolveStops(gradient.stops, `${path}.stops`, colors);
  const center = gradient.at ?? DEFAULT_CENTER;
  const shape = gradient.shape ?? 'ellipse';
  const at = `${cssNumber(center.x)}% ${cssNumber(center.y)}%`;
  const layer = `radial-gradient(${shape} at ${at}, ${stopList(gradient.stops, stops)})`;
  return {
    type: 'radial',
    shape,
    center: { x: center.x, y: center.y },
    stops,
    css: css([layer]),
    colors: stops.map((stop) => stop.color),
  };
}

/**
 * A mesh gradient's base and glows, sizes defaulting to {@link DEFAULT_MESH_SIZE} percent.
 *
 * @param gradient - The mesh gradient.
 * @param path - Its field path, for bad references.
 * @param colors - The resolver, which records bad references.
 */
function resolveMesh(
  gradient: Extract<Gradient, { type: 'mesh' }>,
  path: string,
  colors: ColorResolver,
): Omit<MeshGradientTokens, 'css' | 'grain'> {
  const base = colors.hex(gradient.base, `${path}.base`);
  const points = gradient.points.map((point, index) => ({
    color: colors.hex(point.color, `${path}.points[${index}].color`),
    x: point.x,
    y: point.y,
    size: point.size ?? DEFAULT_MESH_SIZE,
  }));
  return { type: 'mesh', base, points, colors: [base, ...points.map((point) => point.color)] };
}

/**
 * A mesh gradient's CSS layers, top first: one soft radial glow per point over a solid base.
 *
 * @param mesh - The resolved mesh.
 */
function meshLayers(mesh: Omit<MeshGradientTokens, 'css' | 'grain'>): string[] {
  const glows = mesh.points.map(
    (point) =>
      `radial-gradient(${cssNumber(point.size)}% ${cssNumber(point.size)}% ` +
      `at ${cssNumber(point.x)}% ${cssNumber(point.y)}%, ${cssColor(point.color)} 0%, ` +
      'transparent 100%)',
  );
  return [...glows, `linear-gradient(${cssColor(mesh.base)}, ${cssColor(mesh.base)})`];
}

/**
 * Color stops with their colors resolved and their positions filled in as CSS fills them: the first
 * defaults to 0 and the last to 100, stops without a position are spread evenly between the nearest
 * stops that have one, and a position before an earlier one moves up to it.
 *
 * @param stops - The stops as the brand writes them.
 * @param path - The stops' field path, for bad references.
 * @param colors - The resolver, which records bad references.
 */
function resolveStops(stops: Stops, path: string, colors: ColorResolver): GradientStopTokens[] {
  const written = stops.map((stop, index) =>
    typeof stop === 'string'
      ? { color: colors.hex(stop, `${path}[${index}]`), at: undefined }
      : { color: colors.hex(stop.color, `${path}[${index}].color`), at: stop.at },
  );
  const positions = fillPositions(written.map((stop) => stop.at));
  return written.map((stop, index) => ({ color: stop.color, at: positions[index] ?? 0 }));
}

/**
 * The CSS stop list: each color, with its position only where the brand wrote one, so the CSS reads
 * as the brand does.
 *
 * @param stops - The stops as the brand writes them.
 * @param resolved - The same stops resolved.
 */
function stopList(stops: Stops, resolved: readonly GradientStopTokens[]): string {
  return resolved
    .map((stop, index) =>
      typeof stops[index] === 'string'
        ? cssColor(stop.color)
        : `${cssColor(stop.color)} ${cssNumber(stop.at)}%`,
    )
    .join(', ');
}

/**
 * Fills in missing stop positions as CSS does.
 *
 * @param written - Each stop's position in percent, or `undefined` where the brand gives none.
 * @returns A position for every stop, never decreasing.
 */
function fillPositions(written: readonly (number | undefined)[]): number[] {
  const last = written.length - 1;
  const known = written.map((at, index) => {
    if (at !== undefined) {
      return at;
    }

    if (index === 0) {
      return 0;
    }

    return index === last ? END_PERCENT : undefined;
  });
  const clamped: (number | undefined)[] = [];
  let highest = 0;
  for (const at of known) {
    highest = at === undefined ? highest : Math.max(highest, at);
    clamped.push(at === undefined ? undefined : highest);
  }

  return clamped.map((at, index) => at ?? interpolate(clamped, index));
}

/**
 * The position of a stop without one: evenly between the nearest positioned stops on each side.
 *
 * @param positions - Positions so far; the first and last are always set.
 * @param index - The stop to place.
 */
function interpolate(positions: readonly (number | undefined)[], index: number): number {
  const before = positions.slice(0, index).findLastIndex((at) => at !== undefined);
  const offset = positions.slice(index).findIndex((at) => at !== undefined);
  const after = index + offset;
  const from = positions[before] ?? 0;
  const to = positions[after] ?? END_PERCENT;
  return from + ((to - from) * (index - before)) / (after - before);
}

/**
 * A tiling SVG of gray fractal noise at the given opacity, as a CSS `url()`.
 */
function grainLayer(opacity: number): string {
  const svg = [
    `<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_TILE_PX}' height='${GRAIN_TILE_PX}'>`,
    "<filter id='grain'>",
    `<feTurbulence type='fractalNoise' baseFrequency='${GRAIN_FREQUENCY}' ` +
      `numOctaves='3' stitchTiles='stitch'/>`,
    "<feColorMatrix type='saturate' values='0'/>",
    '</filter>',
    `<rect width='100%' height='100%' filter='url(#grain)' opacity='${cssNumber(opacity)}'/>`,
    '</svg>',
  ].join('');
  return cssUrl(`data:image/svg+xml,${encodeURIComponent(svg)}`);
}
