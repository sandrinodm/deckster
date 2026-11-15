import type { GradientTokens } from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { Gradient } from '#schema/gradient-schema.ts';

import { checkRolePair, ROLE_PAIRS, type DerivedSurfaces } from '#checks/contrast-checks.ts';
import { GRAPHIC_CONTRAST, TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { closeness, MIN_DIVERGING_ENDS_DELTA_E } from '#checks/data-thresholds.ts';
import { lightness } from '#color/color-vision.ts';
import { compositeOver, formatHex, fromHex, mixColors, type Rgba } from '#color/color.ts';
import {
  closestLightness,
  directionAway,
  ensureContrast,
  ensureContrastOnAll,
  relativeLuminance,
  roundToHex,
  withLightness,
  worstContrast,
} from '#color/contrast.ts';
import { resolveGradients } from '#resolve/build-tokens.ts';
import { ownValue } from '#resolve/own-value.ts';
import { resolveGradient } from '#resolve/resolve-gradient.ts';
import {
  backdropSamples,
  meshSamples,
  paintedColors,
  resolveSurfaceColors,
} from '#resolve/surface-colors.ts';
import { ROLE_NAMES, type Role, type SurfaceSpec } from '#schema/color-schema.ts';

/**
 * The gradient added for a derived gradient surface when the brand defines none.
 */
export const DERIVED_GRADIENT = 'derived';

/**
 * The required surfaces that are derived when a brand leaves them out or sets none of their roles.
 */
const DERIVABLE_SURFACES = ['inverse', 'accent', 'gradient'] as const;

/**
 * How far a derived card surface moves from the background toward black or white, whichever is
 * further away, so the card stays visible.
 */
const SURFACE_MIX = 0.07;

/**
 * How far a derived border moves from the background toward the text color.
 */
const BORDER_MIX = 0.18;

/**
 * How far derived secondary text moves from the text color toward the background.
 */
const MUTED_MIX = 0.32;

/**
 * How far the derived gradient's far end moves from its start, away from the text color.
 */
const GRADIENT_DEPTH = 0.3;

/**
 * The derived gradient's angle in CSS degrees: top left to bottom right.
 */
const GRADIENT_ANGLE = 135;

/**
 * OKLCH lightness change per attempt when a derived background moves away from its text.
 */
const BACKGROUND_STEP = 0.01;

/**
 * The most shifts a derived background tries: the whole lightness range, plus the unmoved start.
 */
const MAX_BACKGROUND_SHIFTS = Math.ceil(1 / BACKGROUND_STEP) + 1;

/**
 * OKLab lightness above which a background is light, so its card darkens rather than lightens.
 */
const MID_LIGHTNESS = 0.5;

/**
 * Opaque black.
 */
const BLACK: Rgba = fromHex('#000000');

/**
 * Opaque white.
 */
const WHITE: Rgba = fromHex('#ffffff');

/**
 * Opacity of a derived translucent card on a gradient.
 */
const GLASS_ALPHA = 0.12;

/**
 * Opacity of a derived translucent border on a gradient.
 */
const GLASS_BORDER_ALPHA = 0.24;

/**
 * Where the fields come from that a problem on a derived surface tells the author to change.
 */
const SOURCES = {
  /**
   * The inverse surface swaps the base text and background colors.
   */
  inverse: 'color.roles.fg and color.roles.bg',

  /**
   * The accent surface and the derived gradient start from the accent.
   */
  accent: 'color.roles.accent',
} as const;

/**
 * Every role of a surface as a color.
 */
type Roles = Record<Role, Rgba>;

/**
 * What deriving a surface needs.
 */
type Context = {
  /**
   * The decoded brand.
   */
  brand: Brand;

  /**
   * The brand's color resolver.
   */
  colors: ColorResolver;

  /**
   * The base roles as opaque colors (translucent ones painted over the base `bg`).
   */
  base: Roles;

  /**
   * The brand's own gradients, compiled.
   */
  gradients: Readonly<Record<string, GradientTokens>>;
};

/**
 * A derived surface, what it was derived from, and the gradient it adds, if any.
 */
type Derived = {
  /**
   * The surface's roles as hex, with the fields the brand wrote for it kept.
   */
  spec: SurfaceSpec;

  /**
   * The brand fields the surface was derived from, for messages.
   */
  source: string;

  /**
   * The gradient added for it under {@link DERIVED_GRADIENT}, if it needs one.
   */
  gradient?: Gradient;
};

/**
 * A brand with every required surface present, and which of them were derived.
 */
export type CompletedBrand = {
  /**
   * The brand with derived surfaces (and the derived gradient, when one was needed) filled in.
   */
  brand: Brand;

  /**
   * The derived surfaces and the fields each was derived from.
   */
  derived: DerivedSurfaces;
};

/**
 * Fills in the required surfaces a brand leaves out, or writes without any role, from its base
 * roles; the fields such a surface does write (logo, gradient, data, code, diagram, shadow) are
 * kept. `inverse` swaps the background and text colors, `accent` paints the accent, and `gradient`
 * paints the surface's gradient, the brand's first, or a derived accent gradient.
 *
 * Each derived surface picks its text color first (the brand's own colors when they read, else
 * black or white), then moves its background's lightness away from the text, keeping hue and as
 * much chroma as sRGB allows, until every role pair passes the same check authored surfaces get.
 * The brand's own gradients are never changed, so a gradient surface derived from one passes only
 * when some text color reads on all of it; when a surface cannot pass, the contrast check reports
 * it as derived and names the fields it came from.
 *
 * @param brand - The decoded brand.
 * @param colors - The brand's color resolver.
 * @returns The completed brand and its derived surfaces.
 */
export function completeSurfaces(brand: Brand, colors: ColorResolver): CompletedBrand {
  const context: Context = {
    brand,
    colors,
    base: baseRoles(brand, colors),
    gradients: resolveGradients(brand, colors),
  };
  const surfaces: Record<string, SurfaceSpec> = { ...brand.color.surfaces };
  const derived = new Map<string, string>();
  const added: Record<string, Gradient> = {};
  for (const name of DERIVABLE_SURFACES) {
    const spec = surfaces[name];
    if (spec !== undefined && setsRoles(spec)) {
      continue;
    }

    const result = deriveSurface(context, name, spec ?? {});
    if (result === undefined) {
      continue;
    }

    surfaces[name] = result.spec;
    derived.set(name, result.source);
    if (result.gradient !== undefined) {
      added[DERIVED_GRADIENT] = result.gradient;
    }
  }

  const { default: first = {}, inverse, accent, gradient, ...rest } = surfaces;
  const required = Object.entries({ inverse, accent, gradient }).filter(
    (entry): entry is [string, SurfaceSpec] => entry[1] !== undefined,
  );
  const ordered = { default: first, ...Object.fromEntries(required), ...rest };
  return {
    brand: {
      ...brand,
      gradients: { ...brand.gradients, ...added },
      color: { ...brand.color, surfaces: ordered },
    },
    derived,
  };
}

/**
 * Derives one required surface.
 *
 * @param context - The brand and its resolved parts.
 * @param name - `inverse`, `accent` or `gradient`.
 * @param written - The surface as the brand writes it, without roles; `{}` when left out.
 * @returns The derived surface, or `undefined` when it names a gradient that does not exist (the
 *   reference checks report that).
 */
function deriveSurface(
  context: Context,
  name: (typeof DERIVABLE_SURFACES)[number],
  written: SurfaceSpec,
): Derived | undefined {
  switch (name) {
    case 'inverse': {
      return { spec: deriveInverse(context, written), source: SOURCES.inverse };
    }

    case 'accent': {
      return { spec: deriveAccent(context, written), source: SOURCES.accent };
    }

    case 'gradient': {
      const gradientName = written.gradient ?? Object.keys(context.gradients)[0];
      if (gradientName === undefined) {
        return deriveAccentGradient(context, written);
      }

      const gradient = ownValue(context.gradients, gradientName);
      if (gradient === undefined) {
        return undefined;
      }

      return {
        spec: deriveGradientSurface(context, gradientName, gradient, written),
        source: `gradients.${gradientName}`,
      };
    }
  }
}

/**
 * The `inverse` surface: the base text color becomes the background and the base background (or
 * black or white) the text, the accent is adjusted to show on it, and the background moves away
 * from the text until every pair passes.
 *
 * @param context - The brand and its resolved parts.
 * @param written - The fields the brand writes for the surface.
 */
function deriveInverse(context: Context, written: SurfaceSpec): SurfaceSpec {
  const { base } = context;
  return deriveSolid(context, 'inverse', written, {
    start: base.fg,
    texts: [base.bg],
    roles: (bg, text) => {
      const surface = cardFor(bg);
      const accent = ensureContrast(base.accent, bg, GRAPHIC_CONTRAST);
      return {
        bg,
        surface,
        fg: text,
        heading: text,
        muted: mutedFor(text, [bg, surface]),
        accent,
        'accent-fg': chooseText([bg, text], [accent]),
        border: mixColors(bg, text, BORDER_MIX),
        ...semanticPair(base, [bg]),
      };
    },
  });
}

/**
 * The `accent` surface: the accent becomes the background, with `accent-fg`, `fg` or `bg` (or black
 * or white) as its text, the accent role becoming that text color, and the background moving away
 * from the text until every pair passes.
 *
 * @param context - The brand and its resolved parts.
 * @param written - The fields the brand writes for the surface.
 */
function deriveAccent(context: Context, written: SurfaceSpec): SurfaceSpec {
  const { base } = context;
  return deriveSolid(context, 'accent', written, {
    start: base.accent,
    texts: [base['accent-fg'], base.fg, base.bg],
    roles: (bg, text) => {
      const surface = cardFor(bg);
      return {
        bg,
        surface,
        fg: text,
        heading: text,
        muted: mutedFor(text, [bg, surface]),
        accent: text,
        'accent-fg': bg,
        border: mixColors(bg, text, BORDER_MIX * 2),
        ...semanticPair(base, [bg]),
      };
    },
  });
}

/**
 * How to build a solid derived surface.
 */
type SolidRecipe = {
  /**
   * The background to start from.
   */
  start: Rgba;

  /**
   * Text colors to prefer, in order; black and white are tried after them.
   */
  texts: readonly Rgba[];

  /**
   * Every role for a background and a text color.
   */
  roles: (bg: Rgba, text: Rgba) => Roles;
};

/**
 * Picks the text color for the starting background, then moves the background's lightness away from
 * it step by step until the surface passes every role pair.
 *
 * @param context - The brand and its resolved parts.
 * @param name - The surface name.
 * @param written - The fields the brand writes for the surface, kept on the result.
 * @param recipe - The starting background, the text colors to try and the roles to build.
 * @returns The first passing surface, or the unmoved one when none passes, so the check reports the
 *   brand's own colors.
 */
function deriveSolid(
  context: Context,
  name: string,
  written: SurfaceSpec,
  recipe: SolidRecipe,
): SurfaceSpec {
  const start = roundToHex(recipe.start);
  const text = chooseText(recipe.texts, [start]);
  const away = directionAway(start, text);
  const from = lightness(start);
  /**
   * The surface for a background moved `shift` in lightness away from the text.
   */
  const attempt = (shift: number): SurfaceSpec => {
    const bg = shift === 0 ? start : withLightness(start, from + away * shift);
    return { ...hexRoles(recipe.roles(bg, text)), ...written };
  };
  for (const shift of lightnessShifts(from, away)) {
    const spec = attempt(shift);
    if (passes(context, name, spec, context.gradients)) {
      return spec;
    }
  }

  return attempt(0);
}

/**
 * The lightness shifts a derived background tries, in steps of {@link BACKGROUND_STEP}, starting
 * with the unmoved background (0). It stops once the next shift would leave the lightness range
 * from 0 to 1.
 *
 * @param from - The background's OKLab lightness.
 * @param away - The direction of travel, away from the text: 1 or -1.
 */
function* lightnessShifts(from: number, away: number): Generator<number> {
  let shifts = 0;
  for (
    let shift = 0;
    from + away * shift >= 0 && from + away * shift <= 1 && shifts < MAX_BACKGROUND_SHIFTS;
    shift += BACKGROUND_STEP
  ) {
    shifts += 1;
    yield shift;
  }
}

/**
 * A derived accent gradient that text can sit on, and the gradient surface that paints it. The text
 * color is picked first; the gradient starts at the accent, deepens away from the text toward its
 * far end, and its start moves in lightness away from the text until every pair passes.
 *
 * @param context - The brand and its resolved parts.
 * @param written - The fields the brand writes for the surface.
 */
function deriveAccentGradient(context: Context, written: SurfaceSpec): Derived {
  const { base } = context;
  const accent = roundToHex(base.accent);
  const text = chooseText([base.fg, base.bg], [accent]);
  const away = directionAway(accent, text);
  const end = away === -1 ? BLACK : WHITE;
  const from = lightness(accent);
  /**
   * The gradient and surface for a start moved `shift` in lightness away from the text.
   */
  const attempt = (shift: number): { gradient: Gradient; spec: SurfaceSpec } => {
    const start = shift === 0 ? accent : withLightness(accent, from + away * shift);
    const stops = [formatHex(start), formatHex(mixColors(start, end, GRADIENT_DEPTH))];
    const gradient: Gradient = { type: 'linear', angle: GRADIENT_ANGLE, stops };
    const backdrop = stops.map(fromHex);
    const spec = { ...written, gradient: DERIVED_GRADIENT, ...gradientRoles(base, backdrop, text) };
    return { gradient, spec };
  };
  for (const shift of lightnessShifts(from, away)) {
    const { gradient, spec } = attempt(shift);
    const compiled = resolveGradient(gradient, `gradients.${DERIVED_GRADIENT}`, context.colors);
    if (passes(context, 'gradient', spec, { ...context.gradients, [DERIVED_GRADIENT]: compiled })) {
      return { spec, gradient, source: SOURCES.accent };
    }
  }

  return { ...attempt(0), source: SOURCES.accent };
}

/**
 * The `gradient` surface over one of the brand's gradients: the text color that reads best on every
 * color of it (for a mesh, also where its glows overlap; see `meshSamples`), and the other roles
 * adjusted to pass there. The gradient itself is the brand's and is not changed.
 *
 * @param context - The brand and its resolved parts.
 * @param name - The gradient the surface paints.
 * @param gradient - That gradient, compiled.
 * @param written - The fields the brand writes for the surface.
 */
function deriveGradientSurface(
  context: Context,
  name: string,
  gradient: GradientTokens,
  written: SurfaceSpec,
): SurfaceSpec {
  const { base } = context;
  const painted = paintedColors(gradient, base.bg);
  const backdrop =
    gradient.type === 'mesh' ? [...painted, ...meshSamples(gradient, base.bg)] : painted;
  const text = chooseText([base.fg, base.bg], backdrop);
  return { ...written, gradient: name, ...gradientRoles(base, backdrop, text) };
}

/**
 * The roles of a gradient surface: the text color for text, headings and the accent, glass cards
 * and borders, secondary text moved until it reads on every color and on the glass over it, and the
 * base positive and negative colors adjusted to show on every color.
 *
 * @param base - The base roles.
 * @param backdrop - The gradient's colors as painted, opaque.
 * @param text - The surface's text color.
 */
function gradientRoles(base: Roles, backdrop: readonly Rgba[], text: Rgba): SurfaceSpec {
  const first = backdrop[0] ?? base.accent;
  const glass = relativeLuminance(text) > relativeLuminance(first) ? BLACK : WHITE;
  const card = { ...glass, alpha: GLASS_ALPHA };
  const backgrounds = [...backdrop, ...backdrop.map((color) => compositeOver(card, color))];
  return hexRoles({
    fg: text,
    heading: text,
    surface: card,
    muted: ensureContrastOnAll(mixColors(text, first, MUTED_MIX / 2), backgrounds, TEXT_CONTRAST),
    accent: text,
    'accent-fg': ensureContrast(first, text, TEXT_CONTRAST),
    border: { ...text, alpha: GLASS_BORDER_ALPHA },
    ...semanticPair(base, backdrop),
  });
}

/**
 * The base positive and negative colors adjusted to show (3:1) on every background, and kept apart
 * under every simulated color-vision deficiency, as `checkPositiveNegative` wants: when the
 * adjustment brings them together, the negative moves to the nearest lightness that separates them,
 * else the positive does.
 *
 * @param base - The base roles.
 * @param backgrounds - The surface's opaque backgrounds.
 */
function semanticPair(
  base: Roles,
  backgrounds: readonly Rgba[],
): Pick<Roles, 'positive' | 'negative'> {
  const positive = ensureContrastOnAll(base.positive, backgrounds, GRAPHIC_CONTRAST);
  const negative = ensureContrastOnAll(base.negative, backgrounds, GRAPHIC_CONTRAST);
  /**
   * Whether two colors stay apart under every deficiency.
   */
  const apart = (a: Rgba, b: Rgba): boolean =>
    closeness(formatHex(a), formatHex(b), {
      normal: 0,
      deficient: MIN_DIVERGING_ENDS_DELTA_E,
    }).length === 0;
  if (apart(positive, negative)) {
    return { positive, negative };
  }

  /**
   * Whether a candidate shows on every background.
   */
  const visible = (color: Rgba): boolean => worstContrast(color, backgrounds) >= GRAPHIC_CONTRAST;
  const movedNegative = closestLightness(
    negative,
    (candidate) => visible(candidate) && apart(positive, candidate),
  );
  if (movedNegative !== undefined) {
    return { positive, negative: movedNegative };
  }

  const movedPositive = closestLightness(
    positive,
    (candidate) => visible(candidate) && apart(candidate, negative),
  );
  return { positive: movedPositive ?? positive, negative };
}

/**
 * Whether a derived surface passes every role pair, measured exactly as the build will measure it.
 *
 * @param context - The brand and its resolved parts.
 * @param name - The surface name.
 * @param spec - The derived surface as hex.
 * @param gradients - Every gradient the surface may paint, compiled.
 */
function passes(
  context: Context,
  name: string,
  spec: SurfaceSpec,
  gradients: Readonly<Record<string, GradientTokens>>,
): boolean {
  const { brand, colors } = context;
  const input = { brand, name, spec, colors, gradients };
  const surface = resolveSurfaceColors(input);
  const samples = backdropSamples(input);
  return ROLE_PAIRS.every((pair) => checkRolePair(brand, surface, pair, samples).length === 0);
}

/**
 * The first candidate that reaches 4.5:1 on every background; failing that, whichever of the
 * candidates, black and white has the best worst case.
 *
 * @param candidates - Opaque colors to prefer, in order.
 * @param backgrounds - Opaque backgrounds.
 */
function chooseText(candidates: readonly Rgba[], backgrounds: readonly Rgba[]): Rgba {
  const passing = candidates.find((color) => worstContrast(color, backgrounds) >= TEXT_CONTRAST);
  if (passing !== undefined) {
    return roundToHex(passing);
  }

  const ranked = [...candidates, WHITE, BLACK].sort(
    (a, b) => worstContrast(b, backgrounds) - worstContrast(a, backgrounds),
  );
  return roundToHex(ranked[0] ?? WHITE);
}

/**
 * Secondary text: the text color mixed toward the background, moved back until it reads on every
 * background.
 *
 * @param text - The surface's text color.
 * @param backgrounds - The background and the card.
 */
function mutedFor(text: Rgba, backgrounds: readonly Rgba[]): Rgba {
  const [bg = text] = backgrounds;
  return ensureContrastOnAll(mixColors(text, bg, MUTED_MIX), backgrounds, TEXT_CONTRAST);
}

/**
 * A card color: the background moved toward black or white, whichever is further from it.
 *
 * @param bg - The opaque background.
 */
function cardFor(bg: Rgba): Rgba {
  return mixColors(bg, lightness(bg) > MID_LIGHTNESS ? BLACK : WHITE, SURFACE_MIX);
}

/**
 * Whether a surface sets any role; one that sets none is derived.
 *
 * @param spec - The surface as the brand writes it.
 */
function setsRoles(spec: SurfaceSpec): boolean {
  return ROLE_NAMES.some((role) => spec[role] !== undefined);
}

/**
 * The base roles as opaque colors, `heading` falling back to `fg`; translucent roles are painted
 * over the base `bg`.
 *
 * @param brand - The decoded brand.
 * @param colors - The resolver, which records bad references.
 */
function baseRoles(brand: Brand, colors: ColorResolver): Roles {
  const { roles } = brand.color;
  const bg = { ...colors.rgba(roles.bg, 'color.roles.bg'), alpha: 1 };
  const entries = ROLE_NAMES.map((role) => {
    const ref = role === 'heading' ? (roles.heading ?? roles.fg) : roles[role];
    return [role, compositeOver(colors.rgba(ref, `color.roles.${role}`), bg)] as const;
  });
  return Object.fromEntries(entries) as Roles;
}

/**
 * Roles as hex, in the shape a brand writes a surface.
 *
 * @param roles - The roles to convert; the others stay unset.
 */
function hexRoles(roles: Partial<Record<Role, Rgba>>): SurfaceSpec {
  return Object.fromEntries(
    Object.entries(roles).map(([role, color]) => [role, formatHex(color)]),
  ) as SurfaceSpec;
}
