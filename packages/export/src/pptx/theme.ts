import type { BrandTokens, SurfaceTokens } from '@deckster/brand';

import type { GradientStop, ScenePaint } from '#scene/scene.ts';

import { el } from '#ooxml/xml.ts';
import { PML_NAMESPACES } from '#pptx/namespaces.ts';
import { cssAngleToDrawing, fractionToDrawing } from '#units.ts';

/**
 * The twelve theme color slots of a DrawingML color scheme, in schema order.
 */
export const THEME_COLOR_SLOTS = [
  'dk1',
  'lt1',
  'dk2',
  'lt2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
] as const;

/**
 * One of {@link THEME_COLOR_SLOTS}.
 */
export type ThemeColorSlot = (typeof THEME_COLOR_SLOTS)[number];

/**
 * The scheme color names slide content refers to through the master's color map.
 */
export type SchemeColor =
  | 'tx1'
  | 'bg1'
  | 'tx2'
  | 'bg2'
  | Exclude<ThemeColorSlot, 'dk1' | 'lt1' | 'dk2' | 'lt2'>;

/**
 * Hex digits of an opaque color, `#` excluded.
 */
const OPAQUE_HEX_LENGTH = 6;

/**
 * The largest value of one colour byte, which an alpha byte is divided by.
 */
const MAX_COLOR_BYTE = 255;

/**
 * The number of hex digits in one colour byte.
 */
const HEX_BYTE_LENGTH = 2;

/**
 * The offsets of the red, green and blue bytes in `RRGGBB`.
 */
const RGB_BYTE_STARTS = [0, HEX_BYTE_LENGTH, 2 * HEX_BYTE_LENGTH] as const;

/**
 * How many units a percentage in a gradient stop or a gradient centre is out of.
 */
const PERCENT = 100;

/**
 * The line widths of the format scheme in EMU: half, one and one and a half points.
 */
const FORMAT_LINE_WIDTHS_EMU = [6350, 12_700, 19_050] as const;

/**
 * The miter limit of the format scheme's lines in DrawingML units, which are thousandths of a
 * percent: 800 %.
 */
const FORMAT_MITER_LIMIT = 800_000;

/**
 * Accent slots after `accent1`, filled from the brand's categorical data palette.
 */
const EXTRA_ACCENT_SLOTS = ['accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const;

/**
 * The theme of one brand surface: what its slide master and the slides on it use.
 */
export type SurfaceTheme = {
  /**
   * The surface name, such as `inverse`.
   */
  surface: string;

  /**
   * Whether text is dark on light (`light`) or light on dark (`dark`).
   */
  scheme: 'light' | 'dark';

  /**
   * The theme colors as `RRGGBB`, by slot.
   */
  colors: Record<ThemeColorSlot, string>;

  /**
   * Scheme color names by opaque `#rrggbb`, for writing slide colors as theme references.
   */
  lookup: ReadonlyMap<string, SchemeColor>;

  /**
   * The heading (major) and body (minor) font families.
   */
  fonts: { major: string; minor: string };

  /**
   * The surface background as a paint: its color, or its gradient's stops.
   */
  background: ScenePaint;

  /**
   * The background's texture: `grain` (the brand's noise over a linear or radial gradient, tiled as
   * a small picture over the native gradient), `picture` (a mesh gradient, which only a picture
   * reproduces), or `null`.
   */
  texture: 'grain' | 'picture' | null;
};

/**
 * A theme font: its typeface and what a viewer without it needs to substitute a similar one.
 */
export type ThemeFont = {
  /**
   * The typeface.
   */
  typeface: string;

  /**
   * The PANOSE classification as 20 hex digits.
   */
  panose?: string;

  /**
   * The pitch and family byte.
   */
  pitchFamily?: number;

  /**
   * The character set.
   */
  charset?: number;
};

/**
 * The themes of every surface of a brand, `default` first.
 *
 * @param brand - The resolved brand.
 * @returns One theme per surface.
 */
export function surfaceThemes(brand: BrandTokens): SurfaceTheme[] {
  return Object.values(brand.surfaces).map((surface) => surfaceTheme(brand, surface));
}

/**
 * The theme of one surface. `lt1` (Background 1) is always the surface background, and `dk1`, which
 * Office calls Text 1, is its text color on dark surfaces too. Every master keeps the default color
 * map: Apple's Office renderer ignores a master's remapped color map, and a dark slide would turn
 * white. `accent1` is the surface accent, and `accent2` to `accent6` come from the brand's
 * categorical data palette, so charts and shapes PowerPoint colors by theme stay on brand.
 *
 * @param brand - The resolved brand.
 * @param surface - The surface.
 */
export function surfaceTheme(brand: BrandTokens, surface: SurfaceTokens): SurfaceTheme {
  const background = surfaceBackground(brand, surface);
  const colors = themeColors(surface, firstColor(background));
  return {
    surface: surface.name,
    scheme: surface.scheme,
    colors,
    lookup: schemeLookup(colors),
    fonts: {
      major: brand.typography.families.display.family,
      minor: brand.typography.families.body.family,
    },
    background,
    texture: hasTexture(brand, surface),
  };
}

/**
 * The theme colors of a surface as opaque `RRGGBB`: background and text from the surface's roles,
 * the accent, and the categorical palette without the accent in accents 2 to 6.
 *
 * @param surface - The surface.
 * @param base - The opaque color under the surface's background.
 */
function themeColors(surface: SurfaceTokens, base: string): Record<ThemeColorSlot, string> {
  const { roles } = surface;
  const bg = opaque(roles.bg, base);
  const fg = opaque(roles.fg, bg);
  const muted = opaque(roles.muted, bg);
  const panel = opaque(roles.surface, bg);
  const accent = opaque(roles.accent, bg);
  const categorical = surface.data.categorical.map((color) => opaque(color, bg));
  const extras = categorical.filter((color) => color !== accent);
  return {
    dk1: fg,
    lt1: bg,
    dk2: muted,
    lt2: panel,
    accent1: accent,
    accent2: extras[0] ?? accent,
    accent3: extras[1] ?? accent,
    accent4: extras[2] ?? accent,
    accent5: extras[3] ?? accent,
    accent6: extras[4] ?? accent,
    hlink: accent,
    folHlink: muted,
  };
}

/**
 * The scheme names of a surface's colors, by opaque `#RRGGBB`, for writing slide colors as theme
 * references. A color keeps the first name that reaches it, so the text and background names win
 * over the accents that share their value.
 *
 * @param colors - The theme colors.
 */
function schemeLookup(colors: Record<ThemeColorSlot, string>): Map<string, SchemeColor> {
  const lookup = new Map<string, SchemeColor>();
  /**
   * Records a scheme name for a color unless the color has one.
   */
  const add = (hex: string, name: SchemeColor): void => {
    if (!lookup.has(`#${hex}`)) {
      lookup.set(`#${hex}`, name);
    }
  };
  add(colors.dk1, 'tx1');
  add(colors.lt1, 'bg1');
  add(colors.dk2, 'tx2');
  add(colors.lt2, 'bg2');
  add(colors.accent1, 'accent1');
  EXTRA_ACCENT_SLOTS.forEach((slot) => add(colors[slot], slot));
  return lookup;
}

/**
 * The surface background as a paint: the gradient's structured stops when the surface has one, else
 * the background role.
 *
 * @param brand - The resolved brand.
 * @param surface - The surface.
 */
export function surfaceBackground(brand: BrandTokens, surface: SurfaceTokens): ScenePaint {
  const gradient = surface.gradient === undefined ? undefined : brand.gradients[surface.gradient];
  if (gradient?.type === 'linear') {
    return {
      kind: 'linear',
      angle: gradient.angle,
      stops: gradient.stops.map((stop) => ({ color: stop.color, at: stop.at / PERCENT })),
    };
  }

  if (gradient?.type === 'radial') {
    return {
      kind: 'radial',
      center: { x: gradient.center.x / PERCENT, y: gradient.center.y / PERCENT },
      stops: gradient.stops.map((stop) => ({ color: stop.color, at: stop.at / PERCENT })),
    };
  }

  if (gradient?.type === 'mesh') {
    return { kind: 'solid', color: gradient.base };
  }

  return { kind: 'solid', color: surface.roles.bg };
}

/**
 * A surface background's texture: a mesh gradient is a picture, grain on a linear or radial
 * gradient is a tiled picture over the native gradient.
 *
 * @param brand - The resolved brand.
 * @param surface - The surface.
 */
function hasTexture(brand: BrandTokens, surface: SurfaceTokens): SurfaceTheme['texture'] {
  const gradient = surface.gradient === undefined ? undefined : brand.gradients[surface.gradient];
  if (gradient === undefined) {
    return null;
  }

  if (gradient.type === 'mesh') {
    return 'picture';
  }

  return (gradient.grain ?? 0) > 0 ? 'grain' : null;
}

/**
 * The first color of a paint.
 *
 * @param paint - A paint.
 */
function firstColor(paint: ScenePaint): string {
  return paint.kind === 'solid' ? paint.color : (paint.stops[0]?.color ?? '#000000');
}

/**
 * A color as opaque `RRGGBB`: translucent colors are painted over a base color.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 * @param base - The opaque color underneath, `#rrggbb` or `RRGGBB`.
 */
export function opaque(hex: string, base: string): string {
  const digits = hex.replace('#', '');
  const rgb = digits.slice(0, OPAQUE_HEX_LENGTH).toUpperCase();
  if (digits.length <= OPAQUE_HEX_LENGTH) {
    return rgb;
  }

  const alpha = alphaOfDigits(digits);
  const under = base.replace('#', '');
  const mix = RGB_BYTE_STARTS.map((start) => {
    const top = Number.parseInt(rgb.slice(start, start + HEX_BYTE_LENGTH), 16);
    const bottom = Number.parseInt(under.slice(start, start + HEX_BYTE_LENGTH), 16);
    return Math.round(top * alpha + bottom * (1 - alpha))
      .toString(16)
      .padStart(HEX_BYTE_LENGTH, '0');
  });
  return mix.join('').toUpperCase();
}

/**
 * A theme part (`ppt/theme/themeN.xml`) for a surface: its color scheme, the brand's heading and
 * body fonts, and a minimal format scheme PowerPoint requires.
 *
 * @param theme - The surface theme.
 * @param name - The theme's display name.
 */
export function themeXml(
  theme: SurfaceTheme,
  name: string,
  fonts: { major: ThemeFont; minor: ThemeFont } | null = null,
): string {
  const major = fonts?.major ?? { typeface: theme.fonts.major };
  const minor = fonts?.minor ?? { typeface: theme.fonts.minor };
  const colorScheme = el(
    'a:clrScheme',
    { name },
    ...THEME_COLOR_SLOTS.map((slot) =>
      el(`a:${slot}`, {}, el('a:srgbClr', { val: theme.colors[slot] })),
    ),
  );
  const fontScheme = fontSchemeXml(name, major, minor);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    el(
      'a:theme',
      { 'xmlns:a': PML_NAMESPACES['xmlns:a'], name },
      el('a:themeElements', {}, colorScheme, fontScheme, formatScheme()),
      el('a:objectDefaults'),
      el('a:extraClrSchemeLst'),
    )
  );
}

/**
 * The font scheme: the heading and body fonts, with the East Asian and complex-script fonts left
 * empty.
 *
 * @param name - The scheme's name.
 * @param major - The heading font.
 * @param minor - The body font.
 */
function fontSchemeXml(name: string, major: ThemeFont, minor: ThemeFont): string {
  return el(
    'a:fontScheme',
    { name },
    themeFontXml('a:majorFont', major),
    themeFontXml('a:minorFont', minor),
  );
}

/**
 * One font of the font scheme, by its element name.
 *
 * @param tag - `a:majorFont` or `a:minorFont`.
 * @param font - The font.
 */
function themeFontXml(tag: 'a:majorFont' | 'a:minorFont', font: ThemeFont): string {
  return el(
    tag,
    {},
    el('a:latin', {
      typeface: font.typeface,
      panose: font.panose,
      pitchFamily: font.pitchFamily,
      charset: font.charset,
    }),
    el('a:ea', { typeface: '' }),
    el('a:cs', { typeface: '' }),
  );
}

/**
 * The format scheme: three fill, line, effect and background styles, as the schema requires. Slides
 * set their own formatting, so these stay plain.
 */
function formatScheme(): string {
  const phColor = el('a:schemeClr', { val: 'phClr' });
  const solid = el('a:solidFill', {}, phColor);
  const fills = el('a:fillStyleLst', {}, solid, solid, solid);
  /**
   * One line style of the format scheme.
   */
  const line = (width: number): string =>
    el(
      'a:ln',
      { w: width, cap: 'flat', cmpd: 'sng', algn: 'ctr' },
      solid,
      el('a:prstDash', { val: 'solid' }),
      el('a:miter', { lim: FORMAT_MITER_LIMIT }),
    );
  const lines = el('a:lnStyleLst', {}, ...FORMAT_LINE_WIDTHS_EMU.map(line));
  const effect = el('a:effectStyle', {}, el('a:effectLst'));
  const effects = el('a:effectStyleLst', {}, effect, effect, effect);
  const backgrounds = el('a:bgFillStyleLst', {}, solid, solid, solid);
  return el('a:fmtScheme', { name: 'deck' }, fills, lines, effects, backgrounds);
}

/**
 * A DrawingML fill for a paint, writing colors that match a theme color as references to it so the
 * deck restyles with the theme.
 *
 * @param paint - The paint.
 * @param theme - The theme of the surface the fill is on, or `null` to write plain colors.
 */
export function paintFill(paint: ScenePaint, theme: SurfaceTheme | null): string {
  if (paint.kind === 'solid') {
    return el('a:solidFill', {}, colorXml(paint.color, theme));
  }

  const stops = el(
    'a:gsLst',
    {},
    ...premultipliedStops(paint.stops).map((stop) =>
      el('a:gs', { pos: fractionToDrawing(stop.at) }, colorXml(stop.color, theme)),
    ),
  );
  if (paint.kind === 'linear') {
    return el(
      'a:gradFill',
      { rotWithShape: 1 },
      stops,
      el('a:lin', { ang: cssAngleToDrawing(paint.angle), scaled: 0 }),
    );
  }

  const { x, y } = paint.center;
  const fillToRect = el('a:fillToRect', {
    l: fractionToDrawing(x),
    t: fractionToDrawing(y),
    r: fractionToDrawing(1 - x),
    b: fractionToDrawing(1 - y),
  });
  return el('a:gradFill', { rotWithShape: 1 }, stops, el('a:path', { path: 'circle' }, fillToRect));
}

/**
 * Gradient stops as DrawingML interpolates them, matching the browser. CSS interpolates in
 * premultiplied alpha, so a fully transparent stop (`transparent`, `rgb(0 0 0 / 0)`) has no color
 * of its own and fades each neighbour out in that neighbour's color; DrawingML interpolates color
 * and alpha separately, so the stop's own RGB (black for `transparent`) would tint the fade. Each
 * transparent stop takes the color of the visible stop before it, and a second stop at the same
 * position takes the color of the visible stop after it when that differs.
 *
 * @param stops - The stops, in order.
 * @returns The stops to write.
 */
export function premultipliedStops(stops: readonly GradientStop[]): GradientStop[] {
  const visible = stops.map((stop) => alphaOf(stop.color) > 0);
  /**
   * The RGB of the nearest visible stop in a direction, or `null` when there is none.
   */
  const neighbour = (index: number, step: -1 | 1): string | null => {
    for (let at = index + step; at >= 0 && at < stops.length; at += step) {
      if (visible[at] === true) {
        return rgbOf(stops[at]?.color ?? '');
      }
    }

    return null;
  };
  return stops.flatMap((stop, index) => {
    if (visible[index] === true) {
      return [stop];
    }

    const before = neighbour(index, -1);
    const after = neighbour(index, 1);
    const colors = [...new Set([before ?? after, after ?? before])].filter(
      (color): color is string => color !== null,
    );
    return colors.length === 0
      ? [stop]
      : colors.map((color) => ({ color: `#${color}00`, at: stop.at }));
  });
}

/**
 * The alpha of a hex color, 0 to 1.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 */
function alphaOf(hex: string): number {
  return alphaOfDigits(hex.replace('#', ''));
}

/**
 * The alpha of a color's digits without the `#`, 0 to 1: opaque when there is no alpha byte.
 *
 * @param digits - `rrggbb` or `rrggbbaa`.
 */
function alphaOfDigits(digits: string): number {
  return digits.length > OPAQUE_HEX_LENGTH
    ? Number.parseInt(digits.slice(OPAQUE_HEX_LENGTH), 16) / MAX_COLOR_BYTE
    : 1;
}

/**
 * The `rrggbb` digits of a hex color, lowercase.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 */
function rgbOf(hex: string): string {
  return hex.replace('#', '').slice(0, OPAQUE_HEX_LENGTH).toLowerCase();
}

/**
 * A DrawingML color: a scheme color when the opaque color is one of the theme's, else an RGB color,
 * with `a:alpha` for translucent colors.
 *
 * @param hex - `#rrggbb` or `#rrggbbaa`.
 * @param theme - The surface theme, or `null` for plain colors.
 */
export function colorXml(hex: string, theme: SurfaceTheme | null): string {
  const digits = hex.replace('#', '');
  const rgb = digits.slice(0, OPAQUE_HEX_LENGTH).toLowerCase();
  const alpha = alphaOfDigits(digits);
  const alphaXml = alpha < 1 ? el('a:alpha', { val: fractionToDrawing(alpha) }) : '';
  const scheme = theme?.lookup.get(`#${rgb.toUpperCase()}`);
  if (scheme !== undefined) {
    return el('a:schemeClr', { val: scheme }, alphaXml);
  }

  return el('a:srgbClr', { val: rgb.toUpperCase() }, alphaXml);
}

/**
 * The color map of every master: the default one, since each surface's theme puts its own
 * background in `lt1` (see {@link surfaceTheme}).
 */
export const COLOR_MAP: Readonly<Record<string, string>> = {
  /**
   * Background 1.
   */
  bg1: 'lt1',

  /**
   * Text 1.
   */
  tx1: 'dk1',

  /**
   * Background 2.
   */
  bg2: 'lt2',

  /**
   * Text 2.
   */
  tx2: 'dk2',

  /**
   * Accent 1.
   */
  accent1: 'accent1',

  /**
   * Accent 2.
   */
  accent2: 'accent2',

  /**
   * Accent 3.
   */
  accent3: 'accent3',

  /**
   * Accent 4.
   */
  accent4: 'accent4',

  /**
   * Accent 5.
   */
  accent5: 'accent5',

  /**
   * Accent 6.
   */
  accent6: 'accent6',

  /**
   * Hyperlinks.
   */
  hlink: 'hlink',

  /**
   * Followed hyperlinks.
   */
  folHlink: 'folHlink',
};
