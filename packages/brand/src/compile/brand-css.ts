import type {
  BrandTokens,
  DataTokens,
  SurfaceTokens,
  TypeStepTokens,
} from '#resolve/brand-tokens.ts';

import {
  attributeSelector,
  cssColor,
  cssName,
  cssNumber,
  cssPx,
  cssRule,
  cssString,
} from '#compile/css-syntax.ts';
import { brandVariables as v, cssVar } from '#compile/variable-names.ts';
import { DEFAULT_SURFACE } from '#schema/color-schema.ts';
import { FAMILY_ROLES, TYPE_STEPS } from '#schema/typography-schema.ts';

/**
 * A property and its value, before the rule writer checks both.
 */
type Declaration = readonly [property: string, value: string];

/**
 * Compiles tokens to CSS custom properties. Brand-wide tokens (palette, gradients, type, radii,
 * strokes, spacing, motion, chart line widths) sit on `[data-brand="<name>"]`; each surface's
 * roles, code, diagram, data and chart colors, chart plate and shadows sit on
 * `[data-surface="<surface>"]` inside it, together with the surface's paint, text color and body
 * font. The deck root also carries the default surface's values, so chrome outside any slide still
 * has them.
 *
 * @param tokens - Resolved brand tokens.
 * @returns A stylesheet with no `@font-face` rules; see `fontFaceCss`.
 */
export function brandCss(tokens: BrandTokens): string {
  const brand = attributeSelector('data-brand', tokens.name);
  const surfaces = Object.values(tokens.surfaces);
  const defaultSurface = tokens.surfaces[DEFAULT_SURFACE];
  return [
    cssRule([brand], [...brandDeclarations(tokens), ...surfaceVariables(defaultSurface)]),
    ...surfaces.map((surface) => surfaceRule(brand, surface)),
  ].join('\n\n');
}

/**
 * The rule for one surface, matching it both inside the brand root and on the root itself, with the
 * surface's variables, paint, text color and body font.
 *
 * @param brand - The brand root's selector.
 * @param surface - The resolved surface.
 */
function surfaceRule(brand: string, surface: SurfaceTokens): string {
  const attribute = attributeSelector('data-surface', surface.name);
  const selectors = [`${brand} ${attribute}`, `${brand}${attribute}`];
  return cssRule(selectors, [
    ...surfaceVariables(surface),
    ['background', cssVar(v.background)],
    ['color', cssVar(v.role('fg'))],
    ['font-family', cssVar(v.font('body'))],
  ]);
}

/**
 * The declarations a surface sets: its color scheme, roles, text colors, paint, code, diagram, data
 * and chart colors, chart plate and shadows.
 *
 * @param surface - The resolved surface, or `undefined` for a brand without one, which sets none.
 */
function surfaceVariables(surface: SurfaceTokens | undefined): Declaration[] {
  if (surface === undefined) {
    return [];
  }

  return [
    ['color-scheme', surface.scheme === 'dark' ? 'dark' : 'light'],
    ...colorDeclarations(surface.roles, v.role),
    ...colorDeclarations(surface.text, v.text),
    [v.background, surface.background],
    ...colorDeclarations(surface.code, v.code),
    ...colorDeclarations(surface.diagram, v.diagram),
    ...dataDeclarations(surface.data),
    [v.plate, cssColor(surface.data.plate)],
    ...colorDeclarations(surface.charts, v.chart),
    ...Object.entries(surface.shadow).map(([name, shadow]): Declaration => [
      v.shadow(cssName(name)),
      shadow.css,
    ]),
  ];
}

/**
 * One declaration per color of a token section, each color checked to be hex.
 *
 * @param colors - Colors by token name.
 * @param variable - The custom property of a token.
 */
function colorDeclarations(
  colors: Readonly<Record<string, string>>,
  variable: (name: string) => string,
): Declaration[] {
  return Object.entries(colors).map(([name, color]) => [variable(cssName(name)), cssColor(color)]);
}

/**
 * The brand-wide declarations: palette, gradients, font stacks, type steps, radii and strokes,
 * spacing, motion, chart line widths, icon stroke and logo height.
 *
 * @param tokens - Resolved brand tokens.
 */
function brandDeclarations(tokens: BrandTokens): Declaration[] {
  return [
    ...paletteDeclarations(tokens),
    ...Object.entries(tokens.gradients).map(([name, gradient]): Declaration => [
      v.gradient(cssName(name)),
      gradient.css,
    ]),
    ...FAMILY_ROLES.map((role): Declaration => [
      v.font(role),
      tokens.typography.families[role].stack,
    ]),
    ...TYPE_STEPS.flatMap((step) => typeDeclarations(step, tokens.typography.scale[step])),
    ...shapeDeclarations(tokens),
    ...spacingDeclarations(tokens),
    ...motionDeclarations(tokens),
    [v.chartWidth('grid'), cssPx(tokens.charts.grid.stroke)],
    [v.chartWidth('axis'), cssPx(tokens.charts.axis.stroke)],
    [v.chartWidth('rule'), cssPx(tokens.charts.table.rule)],
    [v.iconStroke, cssNumber(tokens.icons.strokeWidth)],
    [v.logoHeight, cssPx(tokens.logo.placement.height)],
  ];
}

/**
 * One declaration per palette step.
 *
 * @param tokens - Resolved brand tokens.
 */
function paletteDeclarations(tokens: BrandTokens): Declaration[] {
  return Object.entries(tokens.palette).flatMap(([scale, steps]) =>
    colorDeclarations(steps, (step) => v.palette(cssName(scale), step)),
  );
}

/**
 * The declarations of one type step, one per {@link TypeProperty}.
 *
 * @param step - The type step.
 * @param type - Its resolved settings.
 */
function typeDeclarations(step: (typeof TYPE_STEPS)[number], type: TypeStepTokens): Declaration[] {
  return [
    [v.type(step, 'family'), cssVar(v.font(type.family))],
    [v.type(step, 'size'), cssPx(type.size)],
    [v.type(step, 'line-height'), cssNumber(type.lineHeight)],
    [v.type(step, 'tracking'), `${cssNumber(type.tracking)}em`],
    [v.type(step, 'weight'), cssNumber(type.weight)],
    [v.type(step, 'case'), type.case === 'upper' ? 'uppercase' : 'none'],
    [v.type(step, 'style'), type.style === 'italic' ? 'italic' : 'normal'],
    [v.type(step, 'features'), fontFeatures(type.features)],
    [v.type(step, 'axes'), fontVariations(type.axes)],
  ];
}

/**
 * One declaration per radius and stroke. Shadows are per surface, in {@link surfaceVariables}.
 *
 * @param tokens - Resolved brand tokens.
 */
function shapeDeclarations(tokens: BrandTokens): Declaration[] {
  const { radius, stroke } = tokens.shape;
  return [
    ...Object.entries(radius).map(([name, size]): Declaration => [
      v.radius(cssName(name)),
      cssPx(size),
    ]),
    ...Object.entries(stroke).map(([name, size]): Declaration => [
      v.stroke(cssName(name)),
      cssPx(size),
    ]),
  ];
}

/**
 * One declaration per spacing step, plus the slide margins and the column grid.
 *
 * @param tokens - Resolved brand tokens.
 */
function spacingDeclarations(tokens: BrandTokens): Declaration[] {
  const { scale, margin, grid } = tokens.spacing;
  return [
    ...Object.entries(scale).map(([name, size]): Declaration => [
      v.space(cssName(name)),
      cssPx(size),
    ]),
    [v.marginX, cssPx(margin.x)],
    [v.marginY, cssPx(margin.y)],
    [v.gridColumns, cssNumber(grid.columns)],
    [v.gridGutter, cssPx(grid.gutter)],
  ];
}

/**
 * One declaration per easing and duration, plus the default transition's duration and easing.
 *
 * @param tokens - Resolved brand tokens.
 */
function motionDeclarations(tokens: BrandTokens): Declaration[] {
  const { easings, durations, transition } = tokens.motion;
  return [
    ...Object.entries(easings).map(([name, curve]): Declaration => [
      v.ease(cssName(name)),
      cubicBezier(curve),
    ]),
    ...Object.entries(durations).map(([name, ms]): Declaration => [
      v.duration(cssName(name)),
      `${cssNumber(ms)}ms`,
    ]),
    [v.transitionDuration, `${cssNumber(transition.duration)}ms`],
    [v.transitionEasing, cubicBezier(transition.easing)],
  ];
}

/**
 * One declaration per chart color, numbered from 1, plus the context color.
 *
 * @param data - A surface's chart palettes.
 */
function dataDeclarations(data: DataTokens): Declaration[] {
  const { categorical, sequential, diverging, context } = data;
  return [
    ...categorical.map((color, index): Declaration => [v.categorical(index), cssColor(color)]),
    ...sequential.map((color, index): Declaration => [v.sequential(index), cssColor(color)]),
    ...diverging.map((color, index): Declaration => [v.diverging(index), cssColor(color)]),
    [v.context, cssColor(context)],
  ];
}

/**
 * An easing curve as a CSS `cubic-bezier()` value.
 *
 * @param curve - The control points `[x1, y1, x2, y2]`.
 */
function cubicBezier(curve: readonly number[]): string {
  return `cubic-bezier(${curve.map(cssNumber).join(', ')})`;
}

/**
 * A `font-feature-settings` value with each tag written as a string, or `normal` for none.
 *
 * @param features - OpenType feature tags.
 */
function fontFeatures(features: readonly string[]): string {
  return features.length === 0 ? 'normal' : features.map(cssString).join(', ');
}

/**
 * A `font-variation-settings` value with each axis tag quoted, or `normal` for none.
 *
 * @param axes - Axis values by axis tag.
 */
function fontVariations(axes: Readonly<Record<string, number>>): string {
  const entries = Object.entries(axes);
  return entries.length === 0
    ? 'normal'
    : entries.map(([axis, value]) => `${cssString(axis)} ${cssNumber(value)}`).join(', ');
}
