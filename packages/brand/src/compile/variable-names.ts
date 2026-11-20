import type { FamilyRole, TypeStep } from '#schema/typography-schema.ts';

/**
 * The CSS custom property names the compiler emits. Every name starts with `--brand-`; Tailwind's
 * theme maps its own names onto these, so layouts use classes and components that need a raw value
 * read the variable or `useBrand()`.
 */
export const brandVariables = {
  /**
   * A role on the current surface: `--brand-color-fg`.
   */
  role: (role: string): string => `--brand-color-${role}`,

  /**
   * The color small text in a role is set in on the current surface, held to 4.5:1:
   * `--brand-color-accent-text`.
   */
  text: (tone: string): string => `--brand-color-${tone}-text`,

  /**
   * A palette step: `--brand-palette-ink-900`.
   */
  palette: (scale: string, step: string): string => `--brand-palette-${scale}-${step}`,

  /**
   * A gradient as a `background-image`: `--brand-gradient-aurora`.
   */
  gradient: (name: string): string => `--brand-gradient-${name}`,

  /**
   * The current surface's paint, gradient or solid: `--brand-background`.
   */
  background: '--brand-background',

  /**
   * A family's full `font-family` stack: `--brand-font-display`.
   */
  font: (role: FamilyRole): string => `--brand-font-${role}`,

  /**
   * One property of a type step: `--brand-type-title-size`.
   */
  type: (step: TypeStep, property: TypeProperty): string => `--brand-type-${step}-${property}`,

  /**
   * A corner radius: `--brand-radius-md`.
   */
  radius: (name: string): string => `--brand-radius-${name}`,

  /**
   * A line width: `--brand-stroke-regular`.
   */
  stroke: (name: string): string => `--brand-stroke-${name}`,

  /**
   * A box shadow: `--brand-shadow-md`.
   */
  shadow: (name: string): string => `--brand-shadow-${name}`,

  /**
   * A spacing step: `--brand-space-md`.
   */
  space: (name: string): string => `--brand-space-${name}`,

  /**
   * The slide's horizontal margin.
   */
  marginX: '--brand-margin-x',

  /**
   * The slide's vertical margin.
   */
  marginY: '--brand-margin-y',

  /**
   * The number of layout columns, unitless.
   */
  gridColumns: '--brand-grid-columns',

  /**
   * The gap between layout columns.
   */
  gridGutter: '--brand-grid-gutter',

  /**
   * An easing curve as `cubic-bezier()`: `--brand-ease-standard`.
   */
  ease: (name: string): string => `--brand-ease-${name}`,

  /**
   * A duration in milliseconds: `--brand-duration-base`.
   */
  duration: (name: string): string => `--brand-duration-${name}`,

  /**
   * The default slide transition's duration.
   */
  transitionDuration: '--brand-transition-duration',

  /**
   * The default slide transition's easing curve.
   */
  transitionEasing: '--brand-transition-easing',

  /**
   * The icon stroke width, unitless as SVG `stroke-width` takes it.
   */
  iconStroke: '--brand-icon-stroke',

  /**
   * The logo's height.
   */
  logoHeight: '--brand-logo-height',

  /**
   * A categorical data color, numbered from 1: `--brand-data-1`.
   */
  categorical: (index: number): string => `--brand-data-${index + 1}`,

  /**
   * A sequential data color, numbered from 1: `--brand-data-sequential-1`.
   */
  sequential: (index: number): string => `--brand-data-sequential-${index + 1}`,

  /**
   * A diverging data color, numbered from 1: `--brand-data-diverging-1`.
   */
  diverging: (index: number): string => `--brand-data-diverging-${index + 1}`,

  /**
   * The muted color for data that is not highlighted.
   */
  context: '--brand-data-context',

  /**
   * The opaque panel charts draw behind themselves on the current surface.
   */
  plate: '--brand-data-plate',

  /**
   * A chart color on the current surface: `--brand-chart-grid`.
   */
  chart: (token: string): string => `--brand-chart-${token}`,

  /**
   * A chart line width: `--brand-chart-grid-width`, `--brand-chart-axis-width` or
   * `--brand-chart-rule-width` (between table rows).
   */
  chartWidth: (line: 'grid' | 'axis' | 'rule'): string => `--brand-chart-${line}-width`,

  /**
   * A code theme color on the current surface: `--brand-code-keyword`.
   */
  code: (token: string): string => `--brand-code-${token}`,

  /**
   * A diagram theme color on the current surface: `--brand-diagram-node`.
   */
  diagram: (token: string): string => `--brand-diagram-${token}`,

  /**
   * The brand's diagram card names, space separated: `--brand-diagram-cards`.
   */
  diagramCards: '--brand-diagram-cards',

  /**
   * The card a node kind uses by default, for the kinds the brand maps:
   * `--brand-diagram-kind-database`.
   */
  diagramKind: (kind: string): string => `--brand-diagram-kind-${kind}`,

  /**
   * One property of the diagram look shared by every card: `--brand-diagram-edge-stroke`.
   */
  diagramLook: (property: DiagramLookProperty): string => `--brand-diagram-${property}`,

  /**
   * One property of a card: `--brand-diagram-card-tint-fill`. Colors and the shadow are per
   * surface; the rest sit on the brand root.
   */
  card: (card: string, property: CardProperty): string =>
    `--brand-diagram-card-${card}-${property}`,
} as const;

/**
 * The diagram look's properties, on the brand root.
 */
export const DIAGRAM_LOOK_PROPERTIES = [
  'align',
  'edge-stroke',
  'edge-style',
  'edge-corners',
  'edge-arrow',
  'timeline-stroke',
  'group-stroke',
  'group-style',
  'group-dashed',
  'group-radius',
  'label-style',
  'label-type',
  'node-width',
  'node-height',
  'subtitle-type',
  'subtitle-family',
  'subtitle-weight',
  'subtitle-tracking',
  'subtitle-case',
  'note-type',
  'note-family',
  'note-weight',
  'note-tracking',
  'note-case',
] as const;

/**
 * A diagram look property.
 */
export type DiagramLookProperty = (typeof DIAGRAM_LOOK_PROPERTIES)[number];

/**
 * A card's properties that are the same on every surface, on the brand root.
 */
export const CARD_ROOT_PROPERTIES = [
  'stroke',
  'radius',
  'shape',
  'icon',
  'accent-side',
  'accent-width',
  'title-family',
  'title-weight',
  'title-tracking',
  'title-case',
  'title-own',
] as const;

/**
 * Geometry and font overrides emitted only on cards that define them.
 */
export const CARD_OPTIONAL_ROOT_PROPERTIES = [
  'border-style',
  'icon-border-style',
  'icon-border-width',
  'subtitle-type',
  'subtitle-family',
  'subtitle-weight',
  'subtitle-tracking',
  'subtitle-case',
] as const;

/**
 * A card's properties that change with the surface, in each surface's rule.
 */
export const CARD_SURFACE_PROPERTIES = [
  'node-fill',
  'fill',
  'border',
  'text',
  'subtext',
  'icon-color',
  'icon-fill',
  'accent',
  'shadow',
  'box-shadow',
  'detail',
] as const;

/**
 * Surface overrides emitted only when a card or its surface specifies them.
 */
export const CARD_OPTIONAL_SURFACE_PROPERTIES = ['icon-border'] as const;

/**
 * A card property.
 */
export type CardProperty =
  | (typeof CARD_ROOT_PROPERTIES)[number]
  | (typeof CARD_OPTIONAL_ROOT_PROPERTIES)[number]
  | (typeof CARD_OPTIONAL_SURFACE_PROPERTIES)[number]
  | (typeof CARD_SURFACE_PROPERTIES)[number];

/**
 * The properties each type step sets.
 */
export const TYPE_PROPERTIES = [
  'family',
  'size',
  'line-height',
  'tracking',
  'weight',
  'case',
  'style',
  'features',
  'axes',
] as const;

/**
 * A type step property.
 */
export type TypeProperty = (typeof TYPE_PROPERTIES)[number];

/**
 * A `var()` reference.
 *
 * @param name - A custom property name, such as `--brand-color-fg`.
 */
export function cssVar(name: string): string {
  return `var(${name})`;
}
