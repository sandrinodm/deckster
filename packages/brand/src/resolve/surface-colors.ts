import type {
  BackgroundLayerTokens,
  GradientTokens,
  Hex,
  MeshGradientTokens,
} from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { Brand } from '#schema/brand-schema.ts';

import { compositeOver, formatHex, fromHex, type Rgba } from '#color/color.ts';
import { cssColor } from '#compile/css-syntax.ts';
import { ownValue } from '#resolve/own-value.ts';
import { resolveBackgroundLayers } from '#resolve/resolve-background.ts';
import { ROLE_NAMES, type Role, type SurfaceSpec } from '#schema/color-schema.ts';

/**
 * How many samples the mesh composite takes along each side of the slide; with the glow centers
 * added, overlapping glows are measured where they are darkest or lightest within a few percent.
 */
const MESH_SAMPLES_PER_SIDE = 41;

/**
 * The slide's extent in the percent coordinates mesh glows use.
 */
const SLIDE_PERCENT = 100;

/**
 * A surface's roles and what text on it sits on: everything the role-pair contrast checks read.
 */
export type SurfaceColors = {
  /**
   * The surface name.
   */
  name: string;

  /**
   * Every role resolved to hex for this surface; `bg` is always opaque once the brand passes its
   * checks.
   */
  roles: Record<Role, Hex>;

  /**
   * Every opaque color text on this surface may sit on: `bg`, then the gradient's colors painted
   * over what lies underneath them, then the tints and gradient layers painted over `bg`.
   */
  backdrop: readonly Hex[];

  /**
   * The CSS `background` value.
   */
  background: string;

  /**
   * The gradient the surface paints, by name, if any.
   */
  gradient: string | undefined;

  /**
   * The image and gradient layers painted over the background.
   */
  layers: readonly BackgroundLayerTokens[];
};

/**
 * What {@link resolveSurfaceColors} needs.
 */
export type SurfaceColorsInput = {
  /**
   * The decoded brand, for its base roles.
   */
  brand: Brand;

  /**
   * The surface name, for the field paths of bad references.
   */
  name: string;

  /**
   * The surface as the brand writes it, or as derived; `{}` for one with no overrides.
   */
  spec: SurfaceSpec;

  /**
   * The resolver, which records bad references.
   */
  colors: ColorResolver;

  /**
   * Every gradient, already compiled.
   */
  gradients: Readonly<Record<string, GradientTokens>>;
};

/**
 * Resolves a surface's roles over the base roles and paints its background. A gradient is painted
 * over the surface's own `bg`, or the base `bg` when the surface sets none, so translucent gradient
 * colors are measured as they show; such a gradient's CSS gets that solid color as its bottom
 * layer. A gradient surface without its own `bg` takes the gradient's first painted color as `bg`.
 *
 * @param input - The surface and what it depends on.
 */
export function resolveSurfaceColors(input: SurfaceColorsInput): SurfaceColors {
  const { name, spec, gradients, colors } = input;
  const roles = resolveRoles(input);
  const layers = resolveBackgroundLayers(
    spec.background ?? [],
    `color.surfaces.${name}.background`,
    colors,
    gradients,
  );
  const gradient = spec.gradient === undefined ? undefined : ownValue(gradients, spec.gradient);
  if (gradient === undefined) {
    return {
      name,
      roles,
      backdrop: withLayers([roles.bg], layers, gradients, roles.bg),
      background: roles.bg,
      gradient: undefined,
      layers,
    };
  }

  const under = opaque(fromHex(roles.bg));
  const painted = paintedColors(gradient, under).map(formatHex);
  const first = painted[0];
  if (spec.bg === undefined && first !== undefined) {
    roles.bg = first;
  }

  return {
    name,
    roles,
    backdrop: withLayers([roles.bg, ...painted], layers, gradients, roles.bg),
    background: isTranslucent(gradient)
      ? `${gradient.css}, ${cssColor(formatHex(under))}`
      : gradient.css,
    gradient: spec.gradient,
    layers,
  };
}

/**
 * A backdrop with the colors a surface's layers add, without repeats.
 *
 * @param backdrop - The colors of the surface's own paint.
 * @param layers - The surface's resolved layers.
 * @param gradients - Every gradient, already compiled.
 * @param bg - The surface's opaque `bg`, which the layers are measured over.
 */
function withLayers(
  backdrop: readonly Hex[],
  layers: readonly BackgroundLayerTokens[],
  gradients: Readonly<Record<string, GradientTokens>>,
  bg: Hex,
): Hex[] {
  return [...new Set([...backdrop, ...layerBackdrop(layers, gradients, bg)])];
}

/**
 * The colors text may sit on because of a surface's layers, each painted over `bg`: every tint at
 * its opacity and every gradient layer's colors at the layer's opacity. Pictures add none: what
 * they show is measured from pixels by `deckster lint`, and `bg` says what they read as.
 *
 * @param layers - The surface's resolved layers.
 * @param gradients - Every gradient, already compiled.
 * @param bg - The surface's opaque `bg`.
 * @returns Opaque colors.
 */
export function layerBackdrop(
  layers: readonly BackgroundLayerTokens[],
  gradients: Readonly<Record<string, GradientTokens>>,
  bg: Hex,
): Hex[] {
  const under = opaque(fromHex(bg));
  return layers.flatMap((layer) => {
    if (layer.type === 'image' && layer.tint !== undefined) {
      return [formatHex(fade(fromHex(layer.tint.color), layer.tint.opacity, under))];
    }

    if (layer.type === 'gradient') {
      const gradient = ownValue(gradients, layer.gradient);
      return gradient === undefined
        ? []
        : paintedColors(gradient, under).map((color) =>
            formatHex(fade(color, layer.opacity, under)),
          );
    }

    return [];
  });
}

/**
 * A color laid at an opacity over an opaque one.
 *
 * @param color - The color, with its own alpha.
 * @param opacity - The layer's opacity, multiplied into the alpha.
 * @param under - The opaque color underneath.
 */
function fade(color: Rgba, opacity: number, under: Rgba): Rgba {
  return compositeOver({ ...color, alpha: color.alpha * opacity }, under);
}

/**
 * Every color of a gradient as it shows when painted over a solid color: stops over that color, a
 * mesh's base over it and each glow's center over the base.
 *
 * @param gradient - The compiled gradient.
 * @param under - The opaque color underneath.
 * @returns Opaque colors in the gradient's order.
 */
export function paintedColors(gradient: GradientTokens, under: Rgba): Rgba[] {
  if (gradient.type !== 'mesh') {
    return gradient.stops.map((stop) => compositeOver(fromHex(stop.color), under));
  }

  const base = compositeOver(fromHex(gradient.base), under);
  return [base, ...gradient.points.map((point) => compositeOver(fromHex(point.color), base))];
}

/**
 * The colors a surface's mesh gradient actually shows, sampled: every glow painted over the base
 * and over each other, as the browser composites the layers, at a grid of points across the slide
 * and at each glow's center. Overlapping translucent glows can be darker or lighter than any one of
 * them over the base, so contrast must be measured on these. A surface that paints no mesh has
 * none.
 *
 * @param input - The surface and what it depends on.
 * @returns Opaque colors, deduplicated by hex.
 */
export function backdropSamples(input: SurfaceColorsInput): Rgba[] {
  const { spec, gradients } = input;
  const gradient = spec.gradient === undefined ? undefined : ownValue(gradients, spec.gradient);
  if (gradient?.type !== 'mesh') {
    return [];
  }

  return meshSamples(gradient, opaque(fromHex(resolveRoles(input).bg)));
}

/**
 * Samples a mesh composited over a solid color: the base over that color, then each glow from the
 * bottom layer (the last point) to the top (the first), each a radial fade from its color at the
 * center to transparent at its edge, `size` percent of the slide's width and height away.
 *
 * @param mesh - The mesh's base and glows.
 * @param under - The opaque color underneath.
 * @returns Opaque colors, deduplicated by hex.
 */
export function meshSamples(
  mesh: Pick<MeshGradientTokens, 'base' | 'points'>,
  under: Rgba,
): Rgba[] {
  const base = compositeOver(fromHex(mesh.base), under);
  const layers = [...mesh.points]
    .reverse()
    .map((point) => ({ ...point, rgba: fromHex(point.color) }));
  const step = SLIDE_PERCENT / (MESH_SAMPLES_PER_SIDE - 1);
  const grid = Array.from({ length: MESH_SAMPLES_PER_SIDE }, (_, index) => index * step);
  const positions = [
    ...grid.flatMap((x) => grid.map((y) => ({ x, y }))),
    ...mesh.points.map((point) => ({ x: point.x, y: point.y })),
  ];
  const samples = new Map<string, Rgba>();
  for (const { x, y } of positions) {
    const color = layers.reduce((below, layer) => {
      const reach = layer.size === 0 ? 1 : Math.hypot(x - layer.x, y - layer.y) / layer.size;
      const alpha = layer.rgba.alpha * (1 - Math.min(1, reach));
      return alpha <= 0 ? below : compositeOver({ ...layer.rgba, alpha }, below);
    }, base);
    samples.set(formatHex(color), color);
  }

  return [...samples.values()];
}

/**
 * Every role on a surface: the surface's override, else the base role. A surface that overrides
 * `fg` but not `heading` gets that `fg` as its heading color too.
 *
 * @param input - The surface and the resolver.
 */
function resolveRoles(input: SurfaceColorsInput): Record<Role, Hex> {
  const { brand, name, spec, colors } = input;
  const entries = ROLE_NAMES.map((role) => {
    const override = spec[role] ?? (role === 'heading' ? spec.fg : undefined);
    const color =
      override === undefined
        ? colors.hex(baseRole(brand, role), `color.roles.${role}`)
        : colors.hex(override, `color.surfaces.${name}.${role}`);
    return [role, color] as const;
  });
  return Object.fromEntries(entries) as Record<Role, Hex>;
}

/**
 * A base role's reference; `heading` falls back to `fg`.
 */
function baseRole(brand: Brand, role: Role): string {
  const { roles } = brand.color;
  return role === 'heading' ? (roles.heading ?? roles.fg) : roles[role];
}

/**
 * Whether any part of a gradient lets what is underneath show through: a translucent stop, or a
 * translucent mesh base (glows fade out over the base, which covers the slide).
 */
function isTranslucent(gradient: GradientTokens): boolean {
  if (gradient.type === 'mesh') {
    return fromHex(gradient.base).alpha < 1;
  }

  return gradient.stops.some((stop) => fromHex(stop.color).alpha < 1);
}

/**
 * A color with its alpha dropped. A translucent `bg` fails the checks; until then it is measured as
 * if it were opaque, so the other checks still run.
 */
function opaque(color: Rgba): Rgba {
  return { ...color, alpha: 1 };
}
