import type {
  BrandTokens,
  CardSurfaceTokens,
  CardTokens,
  DataTokens,
  DiagramTextTokens,
  DiagramTokens,
  Hex,
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
import {
  CARD_ACCENT_SIDES,
  CARD_ICON_STYLES,
  CARD_SHAPES,
  DIAGRAM_ALIGNMENTS,
  DIAGRAM_LINE_STYLES,
  DIAGRAM_TEXT_TYPES,
  EDGE_ARROWS,
  EDGE_CORNERS,
  LABEL_STYLES,
  LABEL_TYPES,
} from '#schema/diagram-schema.ts';
import { FAMILY_ROLES, TYPE_STEPS } from '#schema/typography-schema.ts';

/**
 * The accent stripe sides a card variable may hold: a side, or `none` for no stripe.
 */
const ACCENT_SIDES = ['none', ...CARD_ACCENT_SIDES] as const;

/**
 * The values a boolean card variable may hold.
 */
const BOOLEANS = ['true', 'false'] as const;

/**
 * A property and its value, before the rule writer checks both.
 */
type Declaration = readonly [property: string, value: string];

/**
 * Compiles tokens to CSS custom properties. Brand-wide tokens (palette, gradients, type, radii,
 * strokes, spacing, motion, chart line widths) sit on `[data-brand="<name>"]`; each surface's
 * roles, code, diagram, diagram card, data and chart colors, chart plate and shadows sit on
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
 * The declarations a surface sets: its color scheme, roles, text colors, paint, code and diagram
 * colors, every diagram card's colors and shadow, data and chart colors, chart plate and shadows.
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
    ...Object.entries(surface.diagramCards).flatMap(([name, card]) =>
      cardSurfaceDeclarations(cssName(name), card),
    ),
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
 * spacing, motion, chart line widths, the diagram look and card geometry, icon stroke and logo
 * height.
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
    ...diagramDeclarations(tokens.diagram),
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
 * The diagram look and every card's geometry and title type: the card names, the card of each
 * mapped kind, edge, group and label styles, then each card's stroke, radius, shape, icon style,
 * accent stripe and title settings.
 *
 * @param diagram - The brand's resolved diagram look.
 */
function diagramDeclarations(diagram: DiagramTokens): Declaration[] {
  const { align, edges, groups, labels, nodes, notes } = diagram;
  const declarations: Declaration[] = [
    [v.diagramCards, Object.keys(diagram.cards).map(cssName).join(' ')],
    ...Object.entries(diagram.kinds).map(([kind, card]): Declaration => [
      v.diagramKind(cssName(kind)),
      cssName(card),
    ]),
    [v.diagramLook('edge-stroke'), cssPx(edges.stroke)],
    [v.diagramLook('edge-corners'), keyword(edges.corners, EDGE_CORNERS)],
    [v.diagramLook('edge-arrow'), keyword(edges.arrow, EDGE_ARROWS)],
    [v.diagramLook('group-stroke'), cssPx(groups.stroke)],
    [v.diagramLook('group-dashed'), groups.dashed ? 'true' : 'false'],
    [v.diagramLook('group-radius'), cssPx(groups.radius)],
    [v.diagramLook('label-style'), keyword(labels.style, LABEL_STYLES)],
    [v.diagramLook('label-type'), keyword(labels.type, LABEL_TYPES)],
    [v.diagramLook('node-width'), cssPx(nodes.width)],
    [v.diagramLook('node-height'), cssPx(nodes.height)],
    ...textDeclarations(nodes.subtitle, (field) => v.diagramLook(`subtitle-${field}`)),
    ...textDeclarations(notes, (field) => v.diagramLook(`note-${field}`)),
    ...Object.entries(diagram.cards).flatMap(([name, card]) =>
      cardDeclarations(cssName(name), card),
    ),
  ];
  if (align !== undefined) {
    declarations.push([v.diagramLook('align'), keyword(align, DIAGRAM_ALIGNMENTS)]);
  }

  if (edges.lineStyle !== undefined) {
    declarations.push([v.diagramLook('edge-style'), keyword(edges.lineStyle, DIAGRAM_LINE_STYLES)]);
  }

  if (edges.timelineStroke !== undefined) {
    declarations.push([v.diagramLook('timeline-stroke'), cssPx(edges.timelineStroke)]);
  }

  if (groups.lineStyle !== undefined) {
    declarations.push([
      v.diagramLook('group-style'),
      keyword(groups.lineStyle, DIAGRAM_LINE_STYLES),
    ]);
  }

  return declarations;
}

/**
 * One card's geometry and typography shared across surfaces.
 */
function cardDeclarations(name: string, card: CardTokens): Declaration[] {
  const declarations: Declaration[] = [
    [v.card(name, 'stroke'), cssPx(card.stroke)],
    [v.card(name, 'radius'), cssPx(card.radius)],
    [v.card(name, 'shape'), keyword(card.shape, CARD_SHAPES)],
    [v.card(name, 'icon'), keyword(card.icon, CARD_ICON_STYLES)],
    [v.card(name, 'accent-side'), keyword(card.accent.side, ACCENT_SIDES)],
    [v.card(name, 'accent-width'), cssPx(card.accent.width)],
    [v.card(name, 'title-family'), card.title.stack],
    [v.card(name, 'title-weight'), cssNumber(card.title.weight)],
    [v.card(name, 'title-tracking'), `${cssNumber(card.title.tracking)}em`],
    [v.card(name, 'title-case'), card.title.case === 'upper' ? 'uppercase' : 'none'],
    [v.card(name, 'title-own'), keyword(String(card.titleOwn), BOOLEANS)],
    ...textDeclarations(card.subtitle, (field) => v.card(name, `subtitle-${field}`)),
  ];
  if (card.borderStyle !== undefined) {
    declarations.push([
      v.card(name, 'border-style'),
      keyword(card.borderStyle, DIAGRAM_LINE_STYLES),
    ]);
  }

  if (card.iconBorderStyle !== undefined) {
    declarations.push([
      v.card(name, 'icon-border-style'),
      keyword(card.iconBorderStyle, DIAGRAM_LINE_STYLES),
    ]);
  }

  if (card.iconBorderWidth !== undefined) {
    declarations.push([v.card(name, 'icon-border-width'), cssPx(card.iconBorderWidth)]);
  }

  return declarations;
}

/**
 * Emits only explicit typography overrides so the component can fall back to its type step.
 */
function textDeclarations(
  text: DiagramTextTokens,
  variable: (field: keyof DiagramTextTokens) => string,
): Declaration[] {
  const declarations: Declaration[] = [];
  if (text.type !== undefined) {
    declarations.push([variable('type'), keyword(text.type, DIAGRAM_TEXT_TYPES)]);
  }

  if (text.family !== undefined) {
    declarations.push([variable('family'), text.family.stack]);
  }

  if (text.weight !== undefined) {
    declarations.push([variable('weight'), cssNumber(text.weight)]);
  }

  if (text.tracking !== undefined) {
    declarations.push([variable('tracking'), `${cssNumber(text.tracking)}em`]);
  }

  if (text.case !== undefined) {
    declarations.push([variable('case'), text.case === 'upper' ? 'uppercase' : 'none']);
  }

  return declarations;
}

/**
 * One card's colors and shadow on a surface; a fill or border of `none` is `transparent`.
 *
 * @param name - The card name, checked as a CSS name part.
 * @param card - The card's colors and shadow on the surface.
 */
function cardSurfaceDeclarations(name: string, card: CardSurfaceTokens): Declaration[] {
  const declarations: Declaration[] = [
    [v.card(name, 'node-fill'), keyword(String(card.nodeFill), BOOLEANS)],
    [v.card(name, 'fill'), paint(card.fill)],
    [v.card(name, 'border'), paint(card.border)],
    [v.card(name, 'text'), cssColor(card.text)],
    [v.card(name, 'subtext'), cssColor(card.subtext)],
    [v.card(name, 'icon-color'), cssColor(card.iconColor)],
    [v.card(name, 'icon-fill'), cssColor(card.iconFill)],
    [v.card(name, 'accent'), cssColor(card.accent)],
    [v.card(name, 'shadow'), card.shadow.filter],
    [v.card(name, 'box-shadow'), card.shadow.boxShadow],
    [v.card(name, 'detail'), cssColor(card.detail)],
  ];
  if (card.iconBorder !== undefined) {
    declarations.push([v.card(name, 'icon-border'), cssColor(card.iconBorder)]);
  }

  return declarations;
}

/**
 * A card fill or border: a checked hex color, or `transparent` for none.
 *
 * @param color - The color, or `null` for none.
 */
function paint(color: Hex | null): string {
  return color === null ? 'transparent' : cssColor(color);
}

/**
 * A keyword value, checked against the keywords the property allows.
 *
 * @param value - The keyword.
 * @param allowed - Every keyword the property allows.
 * @throws TypeError for anything else, which tokens that passed the schema never hold.
 */
function keyword(value: string, allowed: readonly string[]): string {
  if (!allowed.includes(value)) {
    throw new TypeError(`"${value}" is not one of ${allowed.join(', ')}.`);
  }

  return value;
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
