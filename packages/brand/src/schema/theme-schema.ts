import { Schema } from 'effect';

import { ColorRef } from '#schema/primitives.ts';

/**
 * Colors of a code theme. Derived from each surface's roles unless the brand overrides them.
 */
export const CODE_TOKENS = [
  'background',
  'foreground',
  'comment',
  'keyword',
  'string',
  'number',
  'function',
  'type',
  'punctuation',
  'highlight',
  'added',
  'removed',
] as const;

/**
 * A code theme color.
 */
export type CodeToken = (typeof CODE_TOKENS)[number];

/**
 * Colors of a diagram theme. Derived from each surface's roles unless the brand overrides them.
 */
export const DIAGRAM_TOKENS = [
  'node',
  'node-border',
  'node-text',
  'group',
  'edge',
  'label',
  'highlight',
  'highlight-text',
  'packet',
] as const;

/**
 * A diagram theme color.
 */
export type DiagramToken = (typeof DIAGRAM_TOKENS)[number];

/**
 * Overrides for the derived code theme. At the top level of a brand they apply on every surface;
 * under `color.surfaces.<name>.code` they apply on that surface and win over the top-level ones.
 * Tokens left out are derived from the surface's roles and kept readable on the code background.
 */
export const BrandCode = Schema.Struct({
  background: Schema.optionalKey(ColorRef),
  foreground: Schema.optionalKey(ColorRef),
  comment: Schema.optionalKey(ColorRef),
  keyword: Schema.optionalKey(ColorRef),
  string: Schema.optionalKey(ColorRef),
  number: Schema.optionalKey(ColorRef),
  function: Schema.optionalKey(ColorRef),
  type: Schema.optionalKey(ColorRef),
  punctuation: Schema.optionalKey(ColorRef),
  highlight: Schema.optionalKey(ColorRef),
  added: Schema.optionalKey(ColorRef),
  removed: Schema.optionalKey(ColorRef),
} satisfies Record<CodeToken, unknown>);

/**
 * Overrides for the derived diagram theme's colors. At the top level of a brand (inside `diagram`,
 * next to its non-color keys) they apply on every surface; under `color.surfaces.<name>.diagram`
 * they apply on that surface and win over the top-level ones. Tokens left out are derived from the
 * surface's roles, and text stays readable on the node and highlight fills.
 */
export const DiagramColors = Schema.Struct({
  node: Schema.optionalKey(ColorRef),
  'node-border': Schema.optionalKey(ColorRef),
  'node-text': Schema.optionalKey(ColorRef),
  group: Schema.optionalKey(ColorRef),
  edge: Schema.optionalKey(ColorRef),
  label: Schema.optionalKey(ColorRef),
  highlight: Schema.optionalKey(ColorRef),
  'highlight-text': Schema.optionalKey(ColorRef),
  packet: Schema.optionalKey(ColorRef),
} satisfies Record<DiagramToken, unknown>);
