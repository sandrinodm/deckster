import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { cssAtRule, cssName } from '#compile/css-syntax.ts';
import { brandVariables as v, cssVar } from '#compile/variable-names.ts';
import { TEXT_TONES } from '#resolve/text-colors.ts';
import { CHART_COLORS } from '#schema/charts-schema.ts';
import { ROLE_NAMES } from '#schema/color-schema.ts';
import { RADIUS_NAMES, SHADOW_NAMES, SPACE_NAMES, STROKE_NAMES } from '#schema/shape-schema.ts';
import { FAMILY_ROLES, TYPE_STEPS, type TypeStep } from '#schema/typography-schema.ts';

/**
 * Tailwind's default namespaces that the brand replaces outright, so off-brand colors, fonts, type
 * sizes, radii, shadows and easings do not exist as classes at all.
 */
const RESET_NAMESPACES = ['color', 'font', 'text', 'radius', 'shadow', 'ease'];

/**
 * Compiles a Tailwind v4 theme for a brand. Every theme value is a `var(--brand-...)` reference
 * (`@theme inline`), so classes follow the surface they are used on: `text-muted` is the inverse
 * surface's muted color inside `[data-surface="inverse"]`.
 *
 * Classes: colors `bg-<role>`, `text-<role>`, `border-<role>` (bg, surface, fg, muted, accent,
 * accent-fg, border, positive, negative), `text-accent-text`, `text-positive-text` and
 * `text-negative-text` (the role colors held to 4.5:1 for small text), palette steps
 * `bg-<palette>-<step>`, data colors `bg-data-<n>`, the chart plate `bg-data-plate`, chart colors
 * `stroke-chart-grid`, `text-chart-label` and so on; fonts `font-display`, `font-body`,
 * `font-mono`; type steps `type-<step>` (family, size, leading, tracking, weight, case, features)
 * and `text-<step>` (size, leading, tracking and weight only); `rounded-<sm|md|lg|xl>`,
 * `shadow-<sm|md|lg>`, `ease-<name>`; spacing `p-<2xs..3xl>`, `gap-<...>` and so on, `px-margin-x`,
 * `py-margin-y`, `gap-gutter`; plus the utilities `slide-padding`, `grid-brand`,
 * `border-<hairline|regular|bold>` and `gradient-<name>`.
 *
 * @param tokens - Resolved brand tokens.
 * @returns CSS for a Tailwind entry file, after `@import "tailwindcss"`.
 */
export function tailwindTheme(tokens: BrandTokens): string {
  const theme = [
    ...RESET_NAMESPACES.map((namespace) => `--${namespace}-*: initial`),
    `--default-font-family: ${cssVar(v.font('body'))}`,
    `--default-mono-font-family: ${cssVar(v.font('mono'))}`,
    `--default-transition-duration: ${cssVar(v.transitionDuration)}`,
    `--default-transition-timing-function: ${cssVar(v.transitionEasing)}`,
    ...colorTheme(tokens),
    ...FAMILY_ROLES.map((role) => `--font-${role}: ${cssVar(v.font(role))}`),
    ...TYPE_STEPS.flatMap(textTheme),
    ...RADIUS_NAMES.map((name) => `--radius-${name}: ${cssVar(v.radius(name))}`),
    ...SHADOW_NAMES.map((name) => `--shadow-${name}: ${cssVar(v.shadow(name))}`),
    ...Object.keys(tokens.motion.easings).map(
      (name) => `--ease-${cssName(name)}: ${cssVar(v.ease(name))}`,
    ),
    ...SPACE_NAMES.map((name) => `--spacing-${name}: ${cssVar(v.space(name))}`),
    `--spacing-margin-x: ${cssVar(v.marginX)}`,
    `--spacing-margin-y: ${cssVar(v.marginY)}`,
    `--spacing-gutter: ${cssVar(v.gridGutter)}`,
  ];
  return [
    block('@theme inline', theme),
    ...TYPE_STEPS.map(typeUtility),
    ...Object.keys(tokens.gradients).map((name) =>
      block(`@utility gradient-${cssName(name)}`, [
        `background-image: ${cssVar(v.gradient(name))}`,
      ]),
    ),
    ...STROKE_NAMES.map((name) =>
      block(`@utility border-${name}`, [`border-width: ${cssVar(v.stroke(name))}`]),
    ),
    block('@utility slide-padding', [
      `padding-block: ${cssVar(v.marginY)}`,
      `padding-inline: ${cssVar(v.marginX)}`,
    ]),
    block('@utility grid-brand', [
      'display: grid',
      `grid-template-columns: repeat(${cssVar(v.gridColumns)}, minmax(0, 1fr))`,
      `column-gap: ${cssVar(v.gridGutter)}`,
    ]),
  ].join('\n\n');
}

/**
 * Tailwind color variables for every role, palette step and data color. Data colors are declared up
 * to the longest list on any surface, so every surface's colors have classes.
 *
 * @param tokens - Resolved brand tokens.
 */
function colorTheme(tokens: BrandTokens): string[] {
  const surfaces = Object.values(tokens.surfaces);
  /**
   * A placeholder entry per color of the longest list of this kind on any surface.
   */
  const longest = (list: 'categorical' | 'sequential' | 'diverging'): unknown[] =>
    Array.from({ length: Math.max(...surfaces.map((surface) => surface.data[list].length)) });
  const categorical = longest('categorical');
  const sequential = longest('sequential');
  const diverging = longest('diverging');
  return [
    ...ROLE_NAMES.map((role) => `--color-${role}: ${cssVar(v.role(role))}`),
    ...TEXT_TONES.map((tone) => `--color-${tone}-text: ${cssVar(v.text(tone))}`),
    ...Object.entries(tokens.palette).flatMap(([scale, steps]) =>
      Object.keys(steps).map(
        (step) => `--color-${cssName(scale)}-${cssName(step)}: ${cssVar(v.palette(scale, step))}`,
      ),
    ),
    ...categorical.map((_, index) => `--color-data-${index + 1}: ${cssVar(v.categorical(index))}`),
    ...sequential.map(
      (_, index) => `--color-sequential-${index + 1}: ${cssVar(v.sequential(index))}`,
    ),
    ...diverging.map((_, index) => `--color-diverging-${index + 1}: ${cssVar(v.diverging(index))}`),
    `--color-context: ${cssVar(v.context)}`,
    `--color-data-plate: ${cssVar(v.plate)}`,
    ...CHART_COLORS.map((token) => `--color-chart-${token}: ${cssVar(v.chart(token))}`),
  ];
}

/**
 * Tailwind `--text-*` variables for one type step: size, line height, tracking and weight.
 *
 * @param step - The type step.
 */
function textTheme(step: TypeStep): string[] {
  return [
    `--text-${step}: ${cssVar(v.type(step, 'size'))}`,
    `--text-${step}--line-height: ${cssVar(v.type(step, 'line-height'))}`,
    `--text-${step}--letter-spacing: ${cssVar(v.type(step, 'tracking'))}`,
    `--text-${step}--font-weight: ${cssVar(v.type(step, 'weight'))}`,
  ];
}

/**
 * A `type-<step>` utility that applies every property of one type step.
 *
 * @param step - The type step.
 */
function typeUtility(step: TypeStep): string {
  return block(`@utility type-${step}`, [
    `font-family: ${cssVar(v.type(step, 'family'))}`,
    `font-size: ${cssVar(v.type(step, 'size'))}`,
    `line-height: ${cssVar(v.type(step, 'line-height'))}`,
    `letter-spacing: ${cssVar(v.type(step, 'tracking'))}`,
    `font-weight: ${cssVar(v.type(step, 'weight'))}`,
    `font-style: ${cssVar(v.type(step, 'style'))}`,
    `text-transform: ${cssVar(v.type(step, 'case'))}`,
    `font-feature-settings: ${cssVar(v.type(step, 'features'))}`,
    `font-variation-settings: ${cssVar(v.type(step, 'axes'))}`,
  ]);
}

/**
 * A CSS block with one declaration per line, each split at its first `: ` and checked by
 * `cssAtRule`.
 *
 * @param header - The at-rule or selector, such as `@utility grid-brand`.
 * @param declarations - `property: value` pairs without the trailing semicolon.
 */
function block(header: string, declarations: readonly string[]): string {
  return cssAtRule(
    header,
    declarations.map((declaration) => {
      const colon = declaration.indexOf(': ');
      return [declaration.slice(0, colon), declaration.slice(colon + 2)] as const;
    }),
  );
}
