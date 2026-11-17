import type {
  BrandTokens,
  ChartTokens,
  DataTokens,
  DiagramTokens,
  FamilyTokens,
  GradientTokens,
  Hex,
  MotionTokens,
  ShadowTokens,
  ShapeTokens,
  SurfaceDataTokens,
  SurfaceTokens,
  TreatmentTokens,
  TypeStepTokens,
} from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { ShadowName } from '#schema/shape-schema.ts';

import { fromHex } from '#color/color.ts';
import { relativeLuminance } from '#color/contrast.ts';
import { cssString } from '#compile/css-syntax.ts';
import {
  chartPlate,
  contextFits,
  fitCategorical,
  fitContext,
  marksVisible,
} from '#resolve/derive-data.ts';
import { completeMotion } from '#resolve/derive-motion.ts';
import {
  deriveCodeTheme,
  deriveDiagramTheme,
  type ThemeOverrides,
} from '#resolve/derive-themes.ts';
import { resolveSubstitute } from '#resolve/font-substitutes.ts';
import { ownValue } from '#resolve/own-value.ts';
import { resolveCharts, surfaceChartColors } from '#resolve/resolve-charts.ts';
import { resolveDiagram, surfaceDiagramCards } from '#resolve/resolve-diagram.ts';
import { resolveGradient } from '#resolve/resolve-gradient.ts';
import { NO_SHADOW, resolveShadows } from '#resolve/resolve-shadow.ts';
import { resolveSurfaceColors, type SurfaceColors } from '#resolve/surface-colors.ts';
import { deriveTextColors } from '#resolve/text-colors.ts';
import { DEFAULT_SURFACE } from '#schema/color-schema.ts';
import { withPlainTreatment } from '#schema/identity-schema.ts';
import { DIAGRAM_TOKENS, type DiagramToken } from '#schema/theme-schema.ts';
import { GENERIC_FAMILIES, TYPE_STEPS, type TypeStep } from '#schema/typography-schema.ts';

/**
 * Backgrounds below this relative luminance get a dark `color-scheme` (mid-gray is about 0.2).
 */
const DARK_SCHEME_LUMINANCE = 0.18;

/**
 * CSS's own `ease`, used while a transition names an easing that does not exist.
 */
const CSS_EASE = [0.25, 0.1, 0.25, 1] as const;

/**
 * Family names that can go into a `font-family` list unquoted: one word of letters and hyphens, not
 * starting with a hyphen.
 */
const UNQUOTED_FAMILY_PATTERN = /^[a-z][a-z-]*$/i;

/**
 * Keywords a `font-family` list would read as keywords rather than names, so a family with one of
 * these names is quoted.
 */
const FAMILY_KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'default',
]);

/**
 * Turns a decoded brand into tokens: references resolved to hex, surfaces merged over the base
 * roles, gradients compiled to CSS and described as data, code and diagram themes and chart colors
 * derived per surface, diagram cards resolved for the brand and per surface, data palettes fitted
 * to each surface's chart plate, defaults filled in. Bad references are recorded on the resolver
 * and replaced by a placeholder, so one pass reports every problem.
 *
 * @param brand - The decoded brand, with its required surfaces completed.
 * @param colors - A resolver over the brand's palette.
 */
export function buildTokens(brand: Brand, colors: ColorResolver): BrandTokens {
  const gradients = resolveGradients(brand, colors);
  const data = resolveData(brand, colors);
  const shape = resolveShape(brand, colors);
  const charts = resolveCharts(brand.charts, shape);
  const typography = {
    families: mapEntries(brand.typography.families, resolveFamily),
    scale: resolveScale(brand.typography.scale),
  };
  const diagram = resolveDiagram(brand.diagram, shape, typography);
  return {
    name: brand.name,
    label: brand.label,
    palette: mapEntries(brand.color.palette, (scale, scaleName) =>
      mapEntries(scale, (color, step) => colors.hex(color, `color.palette.${scaleName}.${step}`)),
    ),
    surfaces: resolveSurfaces({ brand, colors, gradients, data, shape, charts, diagram }),
    gradients,
    typography,
    shape,
    spacing: brand.spacing,
    logo: brand.logo,
    icons: brand.icons,
    imagery: {
      treatments: withPlainTreatment<TreatmentTokens>(
        mapEntries(brand.imagery.treatments, (treatment, name) =>
          resolveTreatment(treatment, `imagery.treatments.${name}`, brand, colors),
        ),
        { type: 'none' },
      ),
      default: brand.imagery.default,
    },
    chrome: brand.chrome,
    motion: resolveMotion(brand.motion),
    data,
    charts,
    diagram,
  };
}

/**
 * Every gradient the brand defines, compiled.
 *
 * @param brand - The decoded brand.
 * @param colors - The resolver, which records bad references.
 */
export function resolveGradients(
  brand: Brand,
  colors: ColorResolver,
): Record<string, GradientTokens> {
  return mapEntries(brand.gradients, (gradient, name) =>
    resolveGradient(gradient, `gradients.${name}`, colors),
  );
}

/**
 * Whether a background reads as dark, which picks the surface's `color-scheme`.
 *
 * @param background - An opaque hex color.
 */
export function isDarkBackground(background: Hex): boolean {
  return relativeLuminance(fromHex(background)) < DARK_SCHEME_LUMINANCE;
}

/**
 * The brand's own chart palettes, resolved to hex.
 *
 * @param brand - The decoded brand.
 * @param colors - The resolver, which records bad references.
 */
function resolveData(brand: Brand, colors: ColorResolver): DataTokens {
  const { data } = brand.color;
  /**
   * One palette resolved to hex, each color's path indexed for problems.
   */
  const list = (refs: readonly string[], name: string): Hex[] =>
    refs.map((ref, index) => colors.hex(ref, `color.data.${name}[${index}]`));
  return {
    categorical: list(data.categorical, 'categorical'),
    sequential: list(data.sequential, 'sequential'),
    diverging: list(data.diverging, 'diverging'),
    context: colors.hex(data.context, 'color.data.context'),
  };
}

/**
 * The brand's radii and strokes as written, and its shadows resolved.
 *
 * @param brand - The decoded brand.
 * @param colors - The resolver, which records bad references.
 */
function resolveShape(brand: Brand, colors: ColorResolver): ShapeTokens {
  const { radius, stroke, shadow } = brand.shape;
  const resolved = resolveShadows(shadow, 'shape.shadow', colors);
  return {
    radius,
    stroke,
    shadow: {
      sm: resolved.sm ?? NO_SHADOW,
      md: resolved.md ?? NO_SHADOW,
      lg: resolved.lg ?? NO_SHADOW,
    },
  };
}

/**
 * What resolving the surfaces needs from the rest of the brand.
 */
type SurfacesInput = {
  /**
   * The decoded brand.
   */
  brand: Brand;

  /**
   * The resolver, which records bad references.
   */
  colors: ColorResolver;

  /**
   * Every gradient, already compiled.
   */
  gradients: Readonly<Record<string, GradientTokens>>;

  /**
   * The brand's own chart palettes, resolved.
   */
  data: DataTokens;

  /**
   * The brand's shape, with its shadows resolved.
   */
  shape: ShapeTokens;

  /**
   * The brand's chart styles, resolved.
   */
  charts: ChartTokens;

  /**
   * The brand's diagram look and card geometry, resolved.
   */
  diagram: DiagramTokens;
};

/**
 * Every surface, `default` first, each with its roles merged over the base roles.
 */
function resolveSurfaces(input: SurfacesInput): Record<string, SurfaceTokens> {
  const { brand } = input;
  const names = [...new Set([DEFAULT_SURFACE, ...Object.keys(brand.color.surfaces)])];
  return Object.fromEntries(names.map((name) => [name, resolveSurface(input, name)]));
}

/**
 * Resolves one surface: its roles and paint (see `resolveSurfaceColors`), logo, chart plate and
 * palettes, chart colors, shadows, code and diagram themes derived from the roles with the brand's
 * overrides on top (the surface's own overrides winning over the brand-wide ones), and the diagram
 * cards' colors and shadows on it.
 *
 * @param input - The brand's resolved parts.
 * @param name - The surface name.
 */
function resolveSurface(input: SurfacesInput, name: string): SurfaceTokens {
  const { brand, colors, gradients, shape, charts } = input;
  const spec = ownValue(brand.color.surfaces, name) ?? {};
  const surface = resolveSurfaceColors({ brand, name, spec, colors, gradients });
  const path = `color.surfaces.${name}`;
  const data = surfaceData(input, name, surface);
  const shadow = {
    ...shape.shadow,
    ...resolveShadows(spec.shadow ?? {}, `${path}.shadow`, colors),
  };
  const diagram = deriveDiagramTheme(surface, {
    ...themeOverrides(diagramColors(brand.diagram), 'diagram', colors),
    ...themeOverrides(diagramColors(spec.diagram), `${path}.diagram`, colors),
  });
  return {
    ...surface,
    scheme: isDarkBackground(surface.roles.bg) ? 'dark' : 'light',
    text: deriveTextColors(surface, data.plate),
    logo: spec.logo ?? brand.logo.default,
    code: deriveCodeTheme(surface, data.categorical, {
      ...themeOverrides(brand.code, 'code', colors),
      ...themeOverrides(spec.code, `${path}.code`, colors),
    }),
    diagram,
    diagramCards: surfaceDiagramCards({
      diagram: brand.diagram,
      surfaceName: name,
      recolors: spec.diagram?.cards,
      tokens: input.diagram,
      surface,
      theme: diagram,
      shadows: shadow,
      colors,
      palette: brand.color.palette,
    }),
    data,
    charts: surfaceChartColors(charts, surface, data.plate),
    shadow: shadow satisfies Record<ShadowName, ShadowTokens>,
  };
}

/**
 * The nine theme colors of a brand's or a surface's `diagram` section, without its other keys.
 *
 * @param diagram - The section as written, or `undefined` for none.
 */
function diagramColors(
  diagram: Readonly<Partial<Record<DiagramToken, string>>> | undefined,
): Partial<Record<DiagramToken, string>> | undefined {
  if (diagram === undefined) {
    return undefined;
  }

  const entries = DIAGRAM_TOKENS.flatMap((token) => {
    const color = diagram[token];
    return color === undefined ? [] : [[token, color] as const];
  });
  return Object.fromEntries(entries);
}

/**
 * A surface's chart plate and palettes. A list the surface replaces is used as written. Otherwise
 * the brand's categorical list is used on the default surface, and on any other surface where it
 * reaches its contrast targets on the plate; where it falls short it is adjusted in lightness for
 * that plate, keeping its hues and order (see `fitCategorical`). The brand's context color is
 * fitted the same way on every surface, the default one included, until it reaches
 * `CONTEXT_CONTRAST` on the plate (see `fitContext`). Sequential and diverging lists do not depend
 * on the background and are never adjusted.
 *
 * @param input - The brand's resolved parts.
 * @param name - The surface name.
 * @param surface - The surface's resolved roles and backdrop.
 */
function surfaceData(
  input: SurfacesInput,
  name: string,
  surface: SurfaceColors,
): SurfaceDataTokens {
  const { brand, colors, data: brandData } = input;
  const override = ownValue(brand.color.surfaces, name)?.data ?? {};
  const path = `color.surfaces.${name}.data`;
  /**
   * The surface's replacement for one palette, resolved to hex, if it has one.
   */
  const list = (refs: readonly string[] | undefined, key: string): Hex[] | undefined =>
    refs?.map((ref, index) => colors.hex(ref, `${path}.${key}[${index}]`));
  const plate = chartPlate(
    surface,
    override.plate === undefined ? undefined : colors.hex(override.plate, `${path}.plate`),
  );
  const background = fromHex(plate);
  const isDefault = name === DEFAULT_SURFACE;
  const categorical =
    isDefault || marksVisible(brandData.categorical, background)
      ? brandData.categorical
      : fitCategorical(brandData.categorical, background);
  // The context color is held to 3:1 on every plate, the default one included: context data is
  // thin lines and muted marks, which fade under it.
  const context = contextFits(brandData.context, background)
    ? brandData.context
    : fitContext(brandData.context, background);
  return {
    plate,
    categorical: list(override.categorical, 'categorical') ?? categorical,
    sequential: list(override.sequential, 'sequential') ?? brandData.sequential,
    diverging: list(override.diverging, 'diverging') ?? brandData.diverging,
    context:
      override.context === undefined ? context : colors.hex(override.context, `${path}.context`),
  };
}

/**
 * Resolves the colors a brand sets in a `code` or `diagram` override section.
 *
 * @param section - The overrides as written, or `undefined` for none.
 * @param path - The section's field path, such as `code` or `color.surfaces.inverse.diagram`.
 * @param colors - The resolver, which records bad references.
 */
function themeOverrides<Token extends string>(
  section: Readonly<Partial<Record<Token, string>>> | undefined,
  path: string,
  colors: ColorResolver,
): ThemeOverrides<Token> {
  const entries = Object.entries(section ?? {}) as [Token, string | undefined][];
  return Object.fromEntries(
    entries.flatMap(([token, ref]) =>
      ref === undefined ? [] : [[token, colors.hex(ref, `${path}.${token}`)] as const],
    ),
  ) as ThemeOverrides<Token>;
}

/**
 * A family with its CSS `font-family` stack: the family, then its fallbacks, quoted where needed.
 *
 * @param family - The family as the brand writes it.
 */
function resolveFamily(family: Brand['typography']['families']['body']): FamilyTokens {
  const names = [family.family, ...family.fallback].map(quoteFamily);
  return {
    family: family.family,
    stack: names.join(', '),
    source: family.source,
    substitute: resolveSubstitute(family),
  };
}

/**
 * Writes a family name for a `font-family` list: a generic family or a single word of letters and
 * hyphens as it is, anything else as an escaped CSS string.
 *
 * @param name - The family name.
 */
function quoteFamily(name: string): string {
  if (
    GENERIC_FAMILIES.has(name) ||
    (UNQUOTED_FAMILY_PATTERN.test(name) && !FAMILY_KEYWORDS.has(name.toLowerCase()))
  ) {
    return name;
  }

  return cssString(name);
}

/**
 * Every type step with its optional settings defaulted: no case change, normal style, no features
 * and no axes.
 *
 * @param scale - The type scale as the brand writes it.
 */
function resolveScale(scale: Brand['typography']['scale']): Record<TypeStep, TypeStepTokens> {
  const entries = TYPE_STEPS.map((step) => {
    const spec = scale[step];
    const tokens: TypeStepTokens = {
      family: spec.family,
      size: spec.size,
      lineHeight: spec.lineHeight,
      tracking: spec.tracking,
      weight: spec.weight,
      case: spec.case ?? 'none',
      style: spec.style ?? 'normal',
      features: spec.features ?? [],
      axes: spec.axes ?? {},
    };
    return [step, tokens] as const;
  });
  return Object.fromEntries(entries) as Record<TypeStep, TypeStepTokens>;
}

/**
 * Resolves an image treatment: a radius name to canvas pixels, color references to hex.
 *
 * @param treatment - The treatment as the brand writes it.
 * @param path - Its field path, for bad references.
 * @param brand - The decoded brand, for its radii.
 * @param colors - The resolver, which records bad references.
 */
function resolveTreatment(
  treatment: Brand['imagery']['treatments'][string],
  path: string,
  brand: Brand,
  colors: ColorResolver,
): TreatmentTokens {
  switch (treatment.type) {
    case 'none':
    case 'grayscale': {
      return { type: treatment.type };
    }

    case 'rounded': {
      return { type: 'rounded', radius: brand.shape.radius[treatment.radius] };
    }

    case 'duotone': {
      return {
        type: 'duotone',
        shadow: colors.hex(treatment.shadow, `${path}.shadow`),
        highlight: colors.hex(treatment.highlight, `${path}.highlight`),
      };
    }

    case 'tint': {
      return {
        type: 'tint',
        color: colors.hex(treatment.color, `${path}.color`),
        opacity: treatment.opacity,
      };
    }
  }
}

/**
 * Motion with every easing and duration the kit reads filled in (`completeMotion`), and the default
 * transition's duration and easing looked up by name. A name that does not exist gives 0 ms or
 * CSS's `ease`; the reference checks report it.
 *
 * @param motion - The motion section as the brand writes it.
 */
function resolveMotion(motion: Brand['motion']): MotionTokens {
  const { transition } = motion;
  return {
    ...completeMotion(motion),
    transition: {
      kind: transition.kind,
      duration: ownValue(motion.durations, transition.duration) ?? 0,
      easing: ownValue(motion.easings, transition.easing) ?? CSS_EASE,
    },
  };
}

/**
 * Maps the values of a record, keeping its keys and order.
 *
 * @param record - The record to map.
 * @param map - Turns each value, with its key, into the new value.
 */
function mapEntries<V, R, K extends string>(
  record: Readonly<Record<K, V>>,
  map: (value: V, key: K) => R,
): Record<K, R> {
  const entries = Object.entries(record) as [K, V][];
  return Object.fromEntries(entries.map(([key, value]) => [key, map(value, key)])) as Record<K, R>;
}
