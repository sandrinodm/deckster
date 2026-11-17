import { TRANSITION_KIND_LIST } from '@deckster/engine/frontmatter';

/**
 * Matches one path segment in a fix pattern.
 */
const WILDCARD = '*';

/**
 * The fix for any field that takes a color or a palette reference.
 */
const COLOR_FIX =
  'Write a color such as "#1f2937" or "oklch(0.62 0.19 259)", ' +
  'or a palette reference such as "ink.900".';

/**
 * The fix for any field that takes a size in canvas pixels.
 */
const PIXELS_FIX = 'Write a number of canvas pixels (the canvas is 1920x1080), for example `24`.';

/**
 * The fix for any field that takes a stroke width name.
 */
const STROKE_FIX = 'Name a stroke width from `shape.stroke`: "hairline", "regular" or "bold".';

/**
 * The fix for any diagram field that takes a radius name.
 */
const RADIUS_FIX = 'Name a radius from `shape.radius`, "sm", "md", "lg" or "xl", or "none".';

/**
 * The fix for a card color.
 */
const CARD_COLOR_FIX =
  'Name a role such as "fg" or "accent/12", or write a palette reference such as "ink.900/20" ' +
  'or a color such as "#1f2937"; leave it out to derive a readable one.';

/**
 * The fix for a card fill or border.
 */
const CARD_PAINT_FIX =
  'Name a role such as "surface" or "accent/12", write a palette reference or a color, or ' +
  '"none" to draw none.';

/**
 * How to fix a field, by path pattern. `*` matches any one segment; the longest pattern that
 * matches the start of a problem's path wins, so specific fixes override general ones.
 */
const FIELD_FIXES: Readonly<Record<string, string>> = {
  /**
   * The brand's folder name.
   */
  name: 'Use the brand folder name in kebab-case, for example `name: "acme"` for brands/acme/.',

  /**
   * The brand's display name.
   */
  label: 'Give the brand a human-readable name, for example `label: "Acme"`.',

  /**
   * The whole `color` section.
   */
  color: 'Give color a palette, roles, surfaces and data, as in brands/default/brand.ts.',

  /**
   * The palette map, when it is not a map of scales.
   */
  'color.palette':
    'Name each scale in kebab-case and map steps to colors, for example ' +
    '`ink: { 50: "#f6f7f9", 900: "#111827" }`.',

  /**
   * One palette step, which must be a literal color.
   */
  'color.palette.*.*':
    'Write a literal color such as "#1f2937" or "oklch(0.62 0.19 259)"; ' +
    'palette steps cannot reference other steps.',

  /**
   * The base roles, when one is missing or the section is malformed.
   */
  'color.roles':
    'Define every role: bg, surface, fg, muted, accent, accent-fg, border, positive and negative.',

  /**
   * One base role's color.
   */
  'color.roles.*': COLOR_FIX,

  /**
   * The surfaces map, when a required surface is missing or it is malformed.
   */
  'color.surfaces':
    'Define the default, inverse, accent and gradient surfaces, ' +
    'each overriding only the roles it changes.',

  /**
   * One surface's overrides.
   */
  'color.surfaces.*':
    'Override roles (bg, fg, muted, ...), and optionally set `gradient`, `background`, `logo`, ' +
    '`data`, `code`, `diagram` and `shadow`.',

  /**
   * A surface's data palettes and chart plate.
   */
  'color.surfaces.*.data':
    'Give the lists this surface replaces (categorical, sequential, diverging, context) ' +
    'and optionally a `plate`.',

  /**
   * The chart plate of a surface.
   */
  'color.surfaces.*.data.plate':
    'Write an opaque color for the panel charts draw on, such as "ink.950", ' +
    'or leave it out to derive one.',

  /**
   * A surface's code theme overrides.
   */
  'color.surfaces.*.code':
    'Override code theme colors for this surface only, such as `{ keyword: "cobalt.300" }`.',

  /**
   * A surface's diagram theme overrides.
   */
  'color.surfaces.*.diagram':
    'Override diagram theme colors for this surface only, such as `{ packet: "cobalt.300" }`, ' +
    'or recolor cards under `cards`.',

  /**
   * The cards a surface recolors.
   */
  'color.surfaces.*.diagram.cards':
    'Name cards the brand has and give their colors on this surface, for example ' +
    '`cards: { volt: { fill: "ink.950", text: "volt.400" } }`.',

  /**
   * One card a surface recolors.
   */
  'color.surfaces.*.diagram.cards.*':
    'Set any of fill, border, text, subtext, icon { color, fill } and accent { color }; ' +
    "a surface changes only a card's colors.",

  /**
   * A recolored card's fill.
   */
  'color.surfaces.*.diagram.cards.*.fill': CARD_PAINT_FIX,

  /**
   * A recolored card's outline color.
   */
  'color.surfaces.*.diagram.cards.*.border': CARD_PAINT_FIX,

  /**
   * A recolored card's title color.
   */
  'color.surfaces.*.diagram.cards.*.text': CARD_COLOR_FIX,

  /**
   * A recolored card's subtitle color.
   */
  'color.surfaces.*.diagram.cards.*.subtext': CARD_COLOR_FIX,

  /**
   * A recolored card's icon or accent colors.
   */
  'color.surfaces.*.diagram.cards.*.*.color': CARD_COLOR_FIX,

  /**
   * A recolored card's solid icon tile color.
   */
  'color.surfaces.*.diagram.cards.*.icon.fill': CARD_COLOR_FIX,

  /**
   * A surface's diagram theme color.
   */
  'color.surfaces.*.diagram.*': COLOR_FIX,

  /**
   * A surface's shadow overrides.
   */
  'color.surfaces.*.shadow':
    'Replace sm, md or lg for this surface, each "none" or a list of shadow layers.',

  /**
   * The gradient a surface paints.
   */
  'color.surfaces.*.gradient':
    'Name a gradient from the brand\'s `gradients`, for example `gradient: "aurora"`.',

  /**
   * The image and gradient layers a surface paints over its background.
   */
  'color.surfaces.*.background':
    'List layers, each with a `type`: `{ type: "image", file: "backgrounds/city.jpg", tint: ' +
    '{ color: "ink.950", opacity: 0.5 } }`, `{ type: "placed", file: "backgrounds/mark.svg", ' +
    'aspect: 1, anchor: "bottom-right", width: 160 }`, `{ type: "pattern", file: ' +
    '"backgrounds/dots.svg", aspect: 1, tile: 24 }` or `{ type: "gradient", gradient: "scrim" }`.',

  /**
   * The logo variant a surface shows.
   */
  'color.surfaces.*.logo':
    'Name a logo variant from `logo.variants`, for example `logo: "reversed"`.',

  /**
   * The chart palettes section.
   */
  'color.data': 'Give data categorical, sequential and diverging lists and a context color.',

  /**
   * One chart palette or the context color.
   */
  'color.data.*': COLOR_FIX,

  /**
   * The gradients map.
   */
  gradients:
    'Name each gradient in kebab-case, for example ' +
    '`aurora: { type: "linear", angle: 135, stops: ["blue.600", "violet.700"] }`.',

  /**
   * One gradient, when its shape matches no gradient type.
   */
  'gradients.*':
    'Use { type: "linear", angle, stops }, { type: "radial", stops } or ' +
    '{ type: "mesh", base, points }.',

  /**
   * A linear or radial gradient's color stops.
   */
  'gradients.*.stops':
    'List at least two stops, each a color or { color, at } with `at` in percent.',

  /**
   * A mesh gradient's glows.
   */
  'gradients.*.points': 'List glows as { color, x, y, size? } with x, y and size in percent.',

  /**
   * A linear gradient's angle.
   */
  'gradients.*.angle': 'Write the angle in degrees from -360 to 360, for example `angle: 135`.',

  /**
   * A gradient's grain opacity.
   */
  'gradients.*.grain': 'Write the grain opacity, for example `grain: 0.12`, or leave it out.',

  /**
   * The whole `typography` section.
   */
  typography:
    'Give typography families (display, body, mono) and a scale, as in brands/default/brand.ts.',

  /**
   * One font family.
   */
  'typography.families.*':
    'Write { family: "Inter", fallback: ["ui-sans-serif", "sans-serif"], source: {...} }.',

  /**
   * A family's name, which CSS, PowerPoint and file names all use.
   */
  'typography.families.*.family':
    "Write the family's name with letters, digits, spaces and - _ . ' & + only, " +
    'for example `family: "IBM Plex Sans"`.',

  /**
   * A family's fallback stack.
   */
  'typography.families.*.fallback':
    "List family names with letters, digits, spaces and - _ . ' & + only, ending in a " +
    'generic family, for example `["Helvetica Neue", "sans-serif"]`.',

  /**
   * A font file the brand ships.
   */
  'typography.families.*.source.files.*.path':
    'Give a path inside the brand folder ending in .woff2, .woff, .ttf or .otf, for example ' +
    '`path: "fonts/acme-sans.woff2"`.',

  /**
   * The characters a font file covers.
   */
  'typography.families.*.source.files.*.unicodeRange':
    'Write a CSS unicode-range such as "U+0000-00FF, U+0131", or leave it out for every character.',

  /**
   * Where a family's font files come from.
   */
  'typography.families.*.source':
    'Use { kind: "fontsource", package: "@fontsource-variable/inter" }, ' +
    '{ kind: "files", files: [...] } or { kind: "system" }.',

  /**
   * The type scale, when a step is missing or it is malformed.
   */
  'typography.scale':
    'Define every type step: display, headline, title, lead, body, small, caption, label, ' +
    'stat, quote and code.',

  /**
   * One type step.
   */
  'typography.scale.*':
    'Write { family: "display" | "body" | "mono", size, lineHeight, tracking, weight }.',

  /**
   * A type step's size.
   */
  'typography.scale.*.size':
    'Write the size in canvas pixels, at least 20, for example `size: 32`.',

  /**
   * A type step's OpenType features.
   */
  'typography.scale.*.features':
    'List four-character OpenType feature tags, for example `features: ["tnum", "ss01"]`.',

  /**
   * A type step's variable font axes.
   */
  'typography.scale.*.axes':
    'Map four-character axis tags to values from -1000 to 1000, for example ' +
    '`axes: { wght: 650, opsz: 96 }`.',

  /**
   * A type step's letter spacing.
   */
  'typography.scale.*.tracking': 'Write tracking in em, for example `tracking: -0.02`.',

  /**
   * A type step's line height.
   */
  'typography.scale.*.lineHeight': 'Write a unitless line height, for example `lineHeight: 1.2`.',

  /**
   * The whole `shape` section.
   */
  shape:
    'Give shape radius (sm, md, lg, xl), stroke (hairline, regular, bold) and shadow (sm, md, lg).',

  /**
   * One corner radius.
   */
  'shape.radius.*': PIXELS_FIX,

  /**
   * One line width.
   */
  'shape.stroke.*': PIXELS_FIX,

  /**
   * One shadow.
   */
  'shape.shadow.*':
    'Write "none" or a list of layers, for example ' +
    '`[{ y: 12, blur: 32, spread: -8, color: "ink.950/18" }]` (x, spread and inset are optional).',

  /**
   * The whole `spacing` section.
   */
  spacing: 'Give spacing a scale (2xs to 3xl), margin { x, y } and grid { columns, gutter }.',

  /**
   * One spacing step, margin or gutter.
   */
  'spacing.*.*': PIXELS_FIX,

  /**
   * The number of layout columns.
   */
  'spacing.grid.columns': 'Write a whole number of columns, usually `columns: 12`.',

  /**
   * The whole `logo` section.
   */
  logo: 'Give logo variants, a default variant, clearSpace and placement { corner, height }.',

  /**
   * One logo variant.
   */
  'logo.variants.*':
    'Write { file: "logos/wordmark.svg", aspect: 4.2 } with aspect = width / height.',

  /**
   * The corner the logo sits in.
   */
  'logo.placement.corner': 'Use "top-left", "top-right", "bottom-left" or "bottom-right".',

  /**
   * The icon set and stroke width.
   */
  icons: 'Write { set: "lucide", strokeWidth: 1.75 } with an Iconify collection name.',

  /**
   * The image treatments section.
   */
  imagery:
    'Give imagery named treatments and a default, for example ' +
    '`{ treatments: { rounded: { type: "rounded", radius: "lg" } }, default: "rounded" }`.',

  /**
   * The whole `chrome` section.
   */
  chrome:
    'Give chrome pageNumber, footer, progress, logo and skipFirst, as in brands/default/brand.ts.',

  /**
   * The page number format.
   */
  'chrome.pageNumber.format':
    'Use {n} for the slide number and {total} for the slide count, for example "{n} / {total}".',

  /**
   * The whole `motion` section.
   */
  motion: 'Give motion easings, durations and a transition { kind, duration, easing }.',

  /**
   * One easing curve.
   */
  'motion.easings.*':
    'Write cubic-bezier control points as [x1, y1, x2, y2], for example `[0.2, 0, 0, 1]`.',

  /**
   * One duration.
   */
  'motion.durations.*': 'Write milliseconds, for example `base: 320`.',

  /**
   * The default slide transition.
   */
  'motion.transition.kind': `Use ${TRANSITION_KIND_LIST}.`,

  /**
   * The chart, stat and table styles.
   */
  charts:
    'Give charts any of grid, axis, labels, numbers, stat and table, ' +
    'or leave `charts` out to use the defaults.',

  /**
   * Gridlines and axis lines.
   */
  'charts.*.color':
    'Name a role: bg, surface, fg, heading, muted, accent, accent-fg, border, positive or ' +
    'negative.',

  /**
   * A chart line width.
   */
  'charts.*.stroke': 'Name a stroke width from `shape.stroke`: "hairline", "regular" or "bold".',

  /**
   * The type steps chart text uses.
   */
  'charts.labels.*':
    'Name a type step such as "caption" or "small", or `color` as a role name such as "muted".',

  /**
   * The number locale.
   */
  'charts.numbers.locale':
    'Write a BCP 47 locale that Intl.NumberFormat knows, such as "en-US" or "de-DE".',

  /**
   * The default currency.
   */
  'charts.numbers.currency': 'Write an ISO 4217 currency code in capitals, such as "USD" or "EUR".',

  /**
   * The code theme overrides.
   */
  code: 'Override code theme colors, or leave `code` out to derive them from the roles.',

  /**
   * One code theme color.
   */
  'code.*': COLOR_FIX,

  /**
   * The diagram section.
   */
  diagram:
    'Override diagram theme colors, set edges, groups, labels, kinds and cards, or leave ' +
    '`diagram` out to derive everything from the roles.',

  /**
   * One diagram theme color.
   */
  'diagram.*': COLOR_FIX,

  /**
   * The edge look.
   */
  'diagram.edges':
    'Write { stroke: "regular", corners: "round", arrow: "triangle" }, each optional.',

  /**
   * An edge's stroke width.
   */
  'diagram.edges.stroke': STROKE_FIX,

  /**
   * How edges bend.
   */
  'diagram.edges.corners': 'Use "round" or "sharp".',

  /**
   * The arrowhead.
   */
  'diagram.edges.arrow': 'Use "triangle", "open" or "dot".',

  /**
   * The group look.
   */
  'diagram.groups': 'Write { stroke: "hairline", dashed: false, radius: "lg" }, each optional.',

  /**
   * A group's outline width.
   */
  'diagram.groups.stroke': 'Use "none", "hairline", "regular" or "bold".',

  /**
   * Whether group outlines are dashed.
   */
  'diagram.groups.dashed': 'Write `true` or `false`.',

  /**
   * A group's corner radius.
   */
  'diagram.groups.radius': RADIUS_FIX,

  /**
   * The edge label look.
   */
  'diagram.labels': 'Write { style: "plain" | "chip", type: "caption" | "label" }, each optional.',

  /**
   * The edge label type step.
   */
  'diagram.labels.type':
    'Use "caption" (today) or "label" (the brand\'s label step: its family, case and tracking).',

  /**
   * The edge label style.
   */
  'diagram.labels.style': 'Use "plain" (text on a knock-out) or "chip" (a bordered chip).',

  /**
   * The card each node kind uses.
   */
  'diagram.kinds':
    'Map node kinds to card names, for example `kinds: { database: "tint", external: "outline" }`.',

  /**
   * One kind's card.
   */
  'diagram.kinds.*':
    'Name a card in kebab-case: a standard card (default, outline, solid, tint, raised) or one ' +
    'under `diagram.cards`.',

  /**
   * The brand's cards.
   */
  'diagram.cards':
    'Name each card in kebab-case, for example ' +
    '`cards: { spotlight: { fill: "accent", text: "accent-fg" } }`.',

  /**
   * One card.
   */
  'diagram.cards.*':
    'Set any of fill, border, stroke, radius, shadow, shape, text, subtext, icon, accent and ' +
    'title; leave a field out to keep the standard look.',

  /**
   * A card's fill.
   */
  'diagram.cards.*.fill': CARD_PAINT_FIX,

  /**
   * A card's outline color.
   */
  'diagram.cards.*.border': CARD_PAINT_FIX,

  /**
   * A card's outline width.
   */
  'diagram.cards.*.stroke': STROKE_FIX,

  /**
   * A card's corner radius.
   */
  'diagram.cards.*.radius': RADIUS_FIX,

  /**
   * A card's shadow.
   */
  'diagram.cards.*.shadow': 'Name one of the brand\'s shadows, "sm", "md" or "lg", or "none".',

  /**
   * A card's outline shape.
   */
  'diagram.cards.*.shape': 'Use "kind" (the node kind\'s own shape), "box" or "pill".',

  /**
   * A card's title color.
   */
  'diagram.cards.*.text': CARD_COLOR_FIX,

  /**
   * A card's subtitle color.
   */
  'diagram.cards.*.subtext': CARD_COLOR_FIX,

  /**
   * A card's icon.
   */
  'diagram.cards.*.icon':
    'Write { style: "chip" | "solid" | "plain" | "none", color, fill }, each optional.',

  /**
   * A card's icon style.
   */
  'diagram.cards.*.icon.style': 'Use "chip", "solid", "plain" or "none".',

  /**
   * A card's icon glyph color.
   */
  'diagram.cards.*.icon.color': CARD_COLOR_FIX,

  /**
   * A card's solid icon tile color.
   */
  'diagram.cards.*.icon.fill': CARD_COLOR_FIX,

  /**
   * A card's accent stripe.
   */
  'diagram.cards.*.accent':
    'Write { side: "left" | "top" | "right" | "bottom", color, width }, each optional.',

  /**
   * The side of a card's accent stripe.
   */
  'diagram.cards.*.accent.side': 'Use "left", "top", "right" or "bottom".',

  /**
   * A card's accent stripe color.
   */
  'diagram.cards.*.accent.color': CARD_COLOR_FIX,

  /**
   * A card's accent stripe width.
   */
  'diagram.cards.*.accent.width': STROKE_FIX,

  /**
   * How a card sets its title.
   */
  'diagram.cards.*.title':
    'Write { family: "mono", weight: 600, tracking: 0.04, case: "upper" }, each optional.',

  /**
   * A card title's family role.
   */
  'diagram.cards.*.title.family': 'Name a family role: "display", "body" or "mono".',

  /**
   * A card title's weight.
   */
  'diagram.cards.*.title.weight': 'Write a font weight from 1 to 1000, for example `weight: 600`.',

  /**
   * A card title's letter spacing.
   */
  'diagram.cards.*.title.tracking': 'Write tracking in em, for example `tracking: 0.04`.',

  /**
   * A card title's case.
   */
  'diagram.cards.*.title.case': 'Use "none" or "upper".',
};

/**
 * The fix for a field, from the most specific pattern that matches its path.
 *
 * @param path - The field's path segments, such as `['color', 'roles', 'fg']`.
 * @returns A sentence telling the author what to write.
 */
export function fixFor(path: readonly PropertyKey[]): string {
  const segments = path.map(String);
  let best: { length: number; fix: string } | undefined;
  for (const [pattern, fix] of Object.entries(FIELD_FIXES)) {
    const parts = pattern.split('.');
    if (matchesPrefix(parts, segments) && parts.length > (best?.length ?? 0)) {
      best = { length: parts.length, fix };
    }
  }

  return best?.fix ?? 'Check this field against the schema in packages/brand/src/schema.';
}

/**
 * Whether a fix pattern matches the start of a path, segment by segment, with `*` matching any one
 * segment. A pattern longer than the path never matches.
 *
 * @param pattern - The pattern's segments.
 * @param segments - The problem path's segments.
 */
function matchesPrefix(pattern: readonly string[], segments: readonly string[]): boolean {
  if (pattern.length > segments.length) {
    return false;
  }

  return pattern.every((part, index) => part === WILDCARD || part === segments[index]);
}
