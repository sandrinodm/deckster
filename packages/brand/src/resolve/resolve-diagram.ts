import type {
  CardSurfaceTokens,
  CardTokens,
  DiagramTokens,
  Hex,
  ShadowTokens,
  ShapeTokens,
  TypographyTokens,
} from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { SurfaceColors } from '#resolve/surface-colors.ts';
import type { ShadowName, StrokeName } from '#schema/shape-schema.ts';
import type { DiagramToken } from '#schema/theme-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { GRAPHIC_CONTRAST, TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { formatHex, fromHex, type Rgba } from '#color/color.ts';
import { ensureContrastOnAll, worstContrast } from '#color/contrast.ts';
import { paintOver } from '#resolve/derive-themes.ts';
import { ownValue } from '#resolve/own-value.ts';
import { cardShadow } from '#resolve/resolve-shadow.ts';
import { ROLE_NAMES } from '#schema/color-schema.ts';
import {
  DIAGRAM_NODE_KINDS,
  ROLE_COLOR_PATTERN,
  STANDARD_CARDS,
  type BrandDiagram,
  type CardIconStyle,
  type CardShape,
  type DiagramCard,
  type DiagramRadius,
  type StandardCard,
  type SurfaceCardColors,
} from '#schema/diagram-schema.ts';
import { FAMILY_ROLES } from '#schema/typography-schema.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * Where a card color comes from before it is resolved on a surface: a card color as a brand writes
 * it (a role, a palette reference, a literal or `none`), or one of the surface's diagram theme
 * colors.
 */
type PaintSource = string | { diagram: DiagramToken };

/**
 * A standard card's look, every field filled in. Colors are sources, resolved per surface.
 */
type CardLook = {
  /**
   * The fill.
   */
  fill: PaintSource;

  /**
   * The outline color.
   */
  border: PaintSource;

  /**
   * The title color, or where its derivation starts.
   */
  text: PaintSource;

  /**
   * The subtitle color, or where its derivation starts.
   */
  subtext: PaintSource;

  /**
   * The icon glyph color, or where its derivation starts.
   */
  iconColor: PaintSource;

  /**
   * The tile color of a `solid` icon.
   */
  iconFill: PaintSource;

  /**
   * The accent stripe color.
   */
  accent: PaintSource;

  /**
   * The brand shadow the card casts, or `none`.
   */
  shadow: ShadowName | 'none';

  /**
   * The outline shape.
   */
  shape: CardShape;

  /**
   * The icon style.
   */
  icon: CardIconStyle;
};

/**
 * What diagrams look like when the brand's `diagram` section leaves a field out: today's regular
 * edges with round corners and triangle arrowheads, hairline groups with `lg` corners, and plain
 * edge labels.
 */
const DIAGRAM_DEFAULTS = {
  /**
   * Regular, round-cornered edges with filled arrowheads.
   */
  edges: { stroke: 'regular', corners: 'round', arrow: 'triangle' },

  /**
   * A hairline outline, solid, with the brand's large radius.
   */
  groups: { stroke: 'hairline', dashed: false, radius: 'lg' },

  /**
   * Text on a knock-out.
   */
  labels: { style: 'plain', type: 'caption' },
} as const;

/**
 * The built-in look of the standard `default` card: today's node, drawn from the surface's diagram
 * theme. A card of the brand's own starts from this look too (not from the brand's `default` entry,
 * which lends every card only its stroke, radius and title; see {@link cardTokens}).
 */
const DEFAULT_LOOK: CardLook = {
  /**
   * The diagram `node` color.
   */
  fill: { diagram: 'node' },

  /**
   * The diagram `node-border` color.
   */
  border: { diagram: 'node-border' },

  /**
   * The diagram `node-text` color.
   */
  text: { diagram: 'node-text' },

  /**
   * The diagram `label` color.
   */
  subtext: { diagram: 'label' },

  /**
   * The diagram `node-text` color, on a `bg` chip.
   */
  iconColor: { diagram: 'node-text' },

  /**
   * The accent.
   */
  iconFill: 'accent',

  /**
   * The accent.
   */
  accent: 'accent',

  /**
   * No shadow.
   */
  shadow: 'none',

  /**
   * The node kind's own shape.
   */
  shape: 'kind',

  /**
   * A bordered chip.
   */
  icon: 'chip',
};

/**
 * The opacity of a `tint` card's accent fill, in percent.
 */
const TINT_FILL_PERCENT = 12;

/**
 * The standard cards' looks. Text colors here are where derivation starts: each is moved until it
 * reads on the card's fill.
 */
const STANDARD_LOOKS: Readonly<Record<StandardCard, CardLook>> = {
  /**
   * Today's node.
   */
  default: DEFAULT_LOOK,

  /**
   * No fill, the `node-border` outline.
   */
  outline: { ...DEFAULT_LOOK, fill: 'none' },

  /**
   * An accent fill without an outline, `accent-fg` text and a plain icon.
   */
  solid: {
    ...DEFAULT_LOOK,
    fill: 'accent',
    border: 'none',
    text: 'accent-fg',
    subtext: 'accent-fg',
    iconColor: 'accent-fg',
    icon: 'plain',
  },

  /**
   * The accent at a low opacity over the backdrop, an accent outline and a solid icon tile.
   */
  tint: {
    ...DEFAULT_LOOK,
    fill: `accent/${TINT_FILL_PERCENT}`,
    border: 'accent',
    iconColor: 'accent-fg',
    icon: 'solid',
  },

  /**
   * A `surface` fill, a hairline outline and the brand's `md` shadow.
   */
  raised: { ...DEFAULT_LOOK, fill: 'surface', shadow: 'md' },
};

/**
 * A card's outline width and corner radius names.
 */
type CardGeometry = {
  /**
   * The outline width name.
   */
  stroke?: StrokeName;

  /**
   * The corner radius name.
   */
  radius?: DiagramRadius;
};

/**
 * The built-in outline and radius every card starts from: today's regular outline and the brand's
 * medium radius. The brand's `default` entry overrides it for every card.
 */
const BASE_GEOMETRY = {
  /**
   * A regular outline.
   */
  stroke: 'regular',

  /**
   * The brand's medium radius.
   */
  radius: 'md',
} as const;

/**
 * The outline and radius a standard card sets for itself, which win over the brand's `default`
 * card: `raised` is a hairline.
 */
const STANDARD_GEOMETRY: Readonly<Partial<Record<StandardCard, CardGeometry>>> = {
  /**
   * A hairline outline under the shadow.
   */
  raised: { stroke: 'hairline' },
};

/**
 * The title fields a brand may write on a card.
 */
const TITLE_FIELDS = ['family', 'weight', 'tracking', 'case'] as const;

/**
 * The side an accent stripe runs along when a card writes `accent` without one.
 */
const DEFAULT_ACCENT_SIDE = 'left';

/**
 * The stripe width when a card writes `accent` without one.
 */
const DEFAULT_ACCENT_WIDTH: StrokeName = 'bold';

/**
 * Shown in place of a card color whose role does not exist, so the rest of the brand still checks.
 */
const UNRESOLVED_HEX = '#ff00ff';

/**
 * Steps a fix suggests for a palette name written without one, in order of preference: a mid step
 * reads as the palette's own color.
 */
const EXAMPLE_STEPS = ['600', '500', 'base', '700', '400'];

/**
 * Divides an opacity percentage into an alpha.
 */
const PERCENT = 100;

/**
 * Node kinds `diagram.kinds` may map, for lookups.
 */
const KINDS: ReadonlySet<string> = new Set(DIAGRAM_NODE_KINDS);

/**
 * Every card name the brand has: the standard cards, then the brand's own in the order it writes
 * them.
 *
 * @param diagram - The brand's `diagram` section, or `undefined` when it leaves it out.
 */
export function diagramCardNames(diagram: BrandDiagram | undefined): string[] {
  return [...new Set<string>([...STANDARD_CARDS, ...Object.keys(diagram?.cards ?? {})])];
}

/**
 * Fills in the brand's `diagram` look from {@link DIAGRAM_DEFAULTS} and every card from its
 * built-in look (the standard `default` card's built-in look, for a card of the brand's own), with
 * only outline width, radius and title type inherited from the brand's `default` entry, turning
 * stroke and radius names into canvas pixels. A title family the brand does not have falls back to
 * the `title` step's family, and a `kinds` entry naming an unknown kind or card is left out; the
 * reference checks report both.
 *
 * @param diagram - The brand's `diagram` section, or `undefined` when it leaves it out.
 * @param shape - The brand's resolved shape, for strokes and radii.
 * @param typography - The brand's resolved typography, for title defaults and font stacks.
 */
export function resolveDiagram(
  diagram: BrandDiagram | undefined,
  shape: ShapeTokens,
  typography: TypographyTokens,
): DiagramTokens {
  const edges = { ...DIAGRAM_DEFAULTS.edges, ...diagram?.edges };
  const groups = { ...DIAGRAM_DEFAULTS.groups, ...diagram?.groups };
  const names = diagramCardNames(diagram);
  const cards = Object.fromEntries(
    names.map((name) => [name, cardTokens(name, diagram, shape, typography)]),
  );
  const kinds = Object.entries(diagram?.kinds ?? {}).filter(
    ([kind, card]) => KINDS.has(kind) && Object.hasOwn(cards, card),
  );
  return {
    edges: { ...edges, stroke: shape.stroke[edges.stroke] },
    groups: {
      stroke: groups.stroke === 'none' ? 0 : shape.stroke[groups.stroke],
      dashed: groups.dashed,
      radius: radiusPx(groups.radius, shape),
    },
    labels: { ...DIAGRAM_DEFAULTS.labels, ...diagram?.labels },
    kinds: Object.fromEntries(kinds),
    cards,
  };
}

/**
 * The card color fields a brand or a surface may write, by their path inside a card.
 */
export const CARD_COLOR_FIELDS = [
  'fill',
  'border',
  'text',
  'subtext',
  'icon.color',
  'icon.fill',
  'accent.color',
] as const;

/**
 * A card color field.
 */
export type CardColorField = (typeof CARD_COLOR_FIELDS)[number];

/**
 * A card color as written, and the field that wrote it.
 */
export type WrittenColor = {
  /**
   * The color as written, such as `accent/12` or `none`.
   */
  ref: string;

  /**
   * The field that wrote it: `diagram.cards.<card>.<field>`, or
   * `color.surfaces.<surface>.diagram.cards.<card>.<field>` when the surface recolors the card.
   */
  path: string;
};

/**
 * Where a card's written colors come from on one surface.
 */
export type CardColorSources = {
  /**
   * The brand's `diagram` section, or `undefined` when it leaves it out.
   */
  diagram: BrandDiagram | undefined;

  /**
   * The surface name, for field paths.
   */
  surfaceName: string;

  /**
   * The cards the surface recolors, as written under `color.surfaces.<name>.diagram.cards`.
   */
  recolors: Readonly<Record<string, SurfaceCardColors>> | undefined;
};

/**
 * The colors written for a card on one surface: the surface's recoloring of each field wins over
 * the card's own entry. Fields neither writes are left out.
 *
 * @param sources - The brand's diagram section and the surface's recolorings.
 * @param name - The card name.
 */
export function writtenCardColors(
  sources: CardColorSources,
  name: string,
): Partial<Record<CardColorField, WrittenColor>> {
  const own = writtenCard(sources.diagram, name);
  const recolor = ownValue<SurfaceCardColors>(sources.recolors ?? {}, name) ?? {};
  const surfacePath = `color.surfaces.${sources.surfaceName}.diagram.cards.${name}`;
  const entries = CARD_COLOR_FIELDS.flatMap((field) => {
    const onSurface = colorField(recolor, field);
    if (onSurface !== undefined) {
      return [[field, { ref: onSurface, path: `${surfacePath}.${field}` }] as const];
    }

    const onCard = colorField(own, field);
    return onCard === undefined
      ? []
      : [[field, { ref: onCard, path: `diagram.cards.${name}.${field}` }] as const];
  });
  return Object.fromEntries(entries);
}

/**
 * What resolving a surface's card colors needs.
 */
export type SurfaceCardsInput = CardColorSources & {
  /**
   * The brand's resolved diagram look, for the card names, icon styles and shadow names.
   */
  tokens: DiagramTokens;

  /**
   * The surface's roles and backdrop.
   */
  surface: Pick<SurfaceColors, 'roles' | 'backdrop'>;

  /**
   * The surface's diagram theme colors, from `deriveDiagramTheme`.
   */
  theme: Readonly<Record<DiagramToken, Hex>>;

  /**
   * The surface's shadows, with any it replaces.
   */
  shadows: Readonly<Record<ShadowName, ShadowTokens>>;

  /**
   * The resolver, which records bad references; card roles that do not exist are recorded on it
   * too.
   */
  colors: ColorResolver;

  /**
   * The brand's palette, to tell a palette name written without a step from a misspelled role.
   */
  palette: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

/**
 * Every card's colors and shadow on one surface. Roles resolve on this surface; a palette reference
 * or literal is the same everywhere. Colors the brand writes are kept as written (the contrast
 * checks measure them). Derived title, subtitle and icon colors are moved in lightness until they
 * read on the card's fill painted over every backdrop color (the backdrop alone for `fill: none`):
 * text at 4.5:1, the icon glyph at 3:1 on its tile. A card that keeps the diagram `node` fill keeps
 * the theme's `node-text` and `label` colors as they are (and `node-text` for a chip icon's glyph),
 * so the `default` card is today's node. A surface's recoloring of a card field wins over the
 * card's own on that surface ({@link writtenCardColors}).
 *
 * @param input - The brand's diagram section and tokens, and the surface's colors and shadows.
 */
export function surfaceDiagramCards(input: SurfaceCardsInput): Record<string, CardSurfaceTokens> {
  const entries = Object.entries(input.tokens.cards).map(([name, card]) => [
    name,
    cardColors(input, name, card),
  ]);
  return Object.fromEntries(entries);
}

/**
 * The built-in look a card starts from: its standard look, or the standard `default` card's
 * built-in look for one of the brand's own (never the brand's `default` entry).
 *
 * @param name - The card name.
 */
function baseLook(name: string): CardLook {
  return ownValue<CardLook>(STANDARD_LOOKS, name) ?? DEFAULT_LOOK;
}

/**
 * One card's geometry and title type. Paint, shadow, icon, accent and shape come from the card's
 * own entry over its base look. Outline width, radius and each title field come, last one winning,
 * from the built-in base, the brand's `default` entry, the fields a standard card sets for itself
 * ({@link STANDARD_GEOMETRY}) and the card's own entry, so a brand sets them once on `default`.
 *
 * @param name - The card name.
 * @param diagram - The brand's `diagram` section.
 * @param shape - The brand's resolved shape.
 * @param typography - The brand's resolved typography.
 */
function cardTokens(
  name: string,
  diagram: BrandDiagram | undefined,
  shape: ShapeTokens,
  typography: TypographyTokens,
): CardTokens {
  const look = baseLook(name);
  const card = writtenCard(diagram, name);
  const inherited = writtenCard(diagram, 'default');
  const standard = ownValue<CardGeometry>(STANDARD_GEOMETRY, name) ?? {};
  const title = { ...inherited.title, ...card.title };
  const titleStep = typography.scale.title;
  const family = FAMILY_ROLES.find((role) => role === title.family) ?? titleStep.family;
  const stroke = card.stroke ?? standard.stroke ?? inherited.stroke ?? BASE_GEOMETRY.stroke;
  const radius = card.radius ?? standard.radius ?? inherited.radius ?? BASE_GEOMETRY.radius;
  return {
    stroke: shape.stroke[stroke],
    radius: radiusPx(radius, shape),
    shape: card.shape ?? look.shape,
    shadow: card.shadow ?? look.shadow,
    icon: card.icon?.style ?? look.icon,
    accent: {
      side: card.accent === undefined ? 'none' : (card.accent.side ?? DEFAULT_ACCENT_SIDE),
      width: shape.stroke[card.accent?.width ?? DEFAULT_ACCENT_WIDTH],
    },
    titleOwn: TITLE_FIELDS.some((field) => title[field] !== undefined),
    title: {
      family,
      stack: typography.families[family].stack,
      weight: title.weight ?? titleStep.weight,
      tracking: title.tracking ?? titleStep.tracking,
      case: title.case ?? 'none',
    },
  };
}

/**
 * The card the brand writes under a name, or an empty one.
 *
 * @param diagram - The brand's `diagram` section.
 * @param name - The card name.
 */
function writtenCard(diagram: BrandDiagram | undefined, name: string): DiagramCard {
  return ownValue<DiagramCard>(diagram?.cards ?? {}, name) ?? {};
}

/**
 * A radius name in canvas pixels; `none` is 0.
 *
 * @param radius - The radius name.
 * @param shape - The brand's resolved shape.
 */
function radiusPx(radius: DiagramRadius, shape: ShapeTokens): number {
  return radius === 'none' ? 0 : shape.radius[radius];
}

/**
 * One card's colors and shadow on a surface.
 *
 * @param input - The brand's diagram section and tokens, and the surface's colors and shadows.
 * @param name - The card name.
 * @param card - The card's resolved geometry.
 */
function cardColors(input: SurfaceCardsInput, name: string, card: CardTokens): CardSurfaceTokens {
  const { surface } = input;
  const look = baseLook(name);
  const written = writtenCardColors(input, name);
  /**
   * A field's color source and the path its problems are reported at: what is written, else the
   * look's.
   */
  const source = (field: CardColorField, fallback: PaintSource): [PaintSource, string] => {
    const own = written[field];
    return own === undefined ? [fallback, `diagram.cards.${name}.${field}`] : [own.ref, own.path];
  };
  /**
   * A fill or border; `null` for `none`.
   */
  const paint = (field: CardColorField, fallback: PaintSource): Hex | null => {
    const [from, path] = source(field, fallback);
    return from === 'none' ? null : resolveColor(input, from, path);
  };
  /**
   * Any other color.
   */
  const color = (field: CardColorField, fallback: PaintSource): Hex =>
    resolveColor(input, ...source(field, fallback));
  const fill = paint('fill', look.fill);
  const under = cardBackgrounds(fill, surface.backdrop.map(fromHex));
  const keepsNodeFill = written.fill === undefined && isTheme(look.fill, 'node');
  /**
   * A text color: as written, the theme's as it is on the node fill, else derived.
   */
  const text = (field: 'text' | 'subtext', start: PaintSource): Hex => {
    const resolved = color(field, start);
    if (written[field] !== undefined || (keepsNodeFill && typeof start !== 'string')) {
      return resolved;
    }

    return readable(input, resolved, under, TEXT_CONTRAST);
  };
  const iconFill = color('icon.fill', look.iconFill);
  const iconStart = color('icon.color', look.iconColor);
  const keepsIcon =
    written['icon.color'] !== undefined ||
    (keepsNodeFill && card.icon === 'chip' && typeof look.iconColor !== 'string');
  const iconColor = keepsIcon
    ? iconStart
    : readable(
        input,
        iconStart,
        iconBackgrounds(card.icon, { under, iconFill, bg: surface.roles.bg }),
        GRAPHIC_CONTRAST,
      );
  const border = paint('border', look.border);
  const subtext = text('subtext', look.subtext);
  return {
    nodeFill: keepsNodeFill,
    fill,
    border,
    text: text('text', look.text),
    subtext,
    detail: border ?? subtext,
    iconColor,
    iconFill,
    accent: color('accent.color', look.accent),
    shadow:
      card.shadow === 'none'
        ? { layers: [], filter: 'none', boxShadow: 'none' }
        : cardShadow(input.shadows[card.shadow]),
  };
}

/**
 * One color field of a card or a surface's recoloring of it.
 *
 * @param card - The card's colors as written.
 * @param field - The field.
 */
function colorField(card: SurfaceCardColors, field: CardColorField): string | undefined {
  switch (field) {
    case 'fill':
    case 'border':
    case 'text':
    case 'subtext': {
      return card[field];
    }

    case 'icon.color': {
      return card.icon?.color;
    }

    case 'icon.fill': {
      return card.icon?.fill;
    }

    case 'accent.color': {
      return card.accent?.color;
    }
  }
}

/**
 * Whether a paint source is a given diagram theme color.
 *
 * @param source - The source.
 * @param token - The theme color.
 */
function isTheme(source: PaintSource, token: DiagramToken): boolean {
  return typeof source !== 'string' && source.diagram === token;
}

/**
 * The opaque colors a card's title sits on: its fill painted over each backdrop color, or the
 * backdrop itself for a card without a fill.
 *
 * @param fill - The card's fill on the surface, or `null` for none.
 * @param backdrop - The surface's opaque backdrop colors.
 */
export function cardBackgrounds(fill: Hex | null, backdrop: readonly Rgba[]): Rgba[] {
  return fill === null ? [...backdrop] : paintOver(fill, backdrop);
}

/**
 * What a card's icon glyph sits on, per backdrop color: the `bg` tile of a chip painted over the
 * card, the icon fill painted over the card for a solid tile, else the card itself.
 *
 * @param style - The card's icon style.
 * @param on - The card's backgrounds ({@link cardBackgrounds}), its icon fill and the surface's
 *   `bg`.
 */
export function iconBackgrounds(
  style: CardIconStyle,
  on: { under: readonly Rgba[]; iconFill: Hex; bg: Hex },
): Rgba[] {
  switch (style) {
    case 'chip': {
      return on.under.flatMap((color) => paintOver(on.bg, [color]));
    }

    case 'solid': {
      return on.under.flatMap((color) => paintOver(on.iconFill, [color]));
    }

    case 'plain':
    case 'none': {
      return [...on.under];
    }
  }
}

/**
 * A derived text or glyph color that reads on every background: the start color moved in lightness
 * until it passes (see `ensureContrastOnAll`; unchanged when it already does), else `fg` or
 * `accent-fg` when one of them passes as it is, else the moved start color, the best there is.
 *
 * @param input - The surface, for its `fg` and `accent-fg`.
 * @param start - The color derivation starts from.
 * @param backgrounds - The opaque colors it may sit on.
 * @param ratio - The contrast to reach.
 */
function readable(
  input: SurfaceCardsInput,
  start: Hex,
  backgrounds: readonly Rgba[],
  ratio: number,
): Hex {
  const { roles } = input.surface;
  const moved = formatHex(ensureContrastOnAll(fromHex(start), backgrounds, ratio));
  const candidates = [moved, roles.fg, roles['accent-fg']];
  const passing = candidates.find(
    (candidate) => worstContrast(fromHex(candidate), backgrounds) >= ratio,
  );
  return passing ?? moved;
}

/**
 * Resolves a color source on a surface: a diagram theme color, a role with an optional opacity, or
 * a palette reference or literal through the resolver. A role that does not exist (`none` included,
 * which only a fill or border may be), or an opacity over 100, records a problem at `path` and
 * gives the placeholder color.
 *
 * @param input - The surface and the resolver.
 * @param source - The source.
 * @param path - The field path, for problems.
 */
function resolveColor(input: SurfaceCardsInput, source: PaintSource, path: string): Hex {
  if (typeof source !== 'string') {
    return input.theme[source.diagram];
  }

  const match = ROLE_COLOR_PATTERN.exec(source);
  if (match === null) {
    return input.colors.hex(source, path);
  }

  const [, role = '', opacity] = match;
  return roleColor(input, { ref: source, role, opacity, path });
}

/**
 * The problem for a card color that names no role: a palette name written without a step gets that
 * palette's steps; anything else gets the closest role.
 *
 * @param input - The brand's palette.
 * @param ref - The color as written.
 */
function unknownRoleProblem(input: SurfaceCardsInput, ref: RoleRef): BrandProblem {
  const scale = ownValue(input.palette, ref.role);
  if (scale === undefined) {
    return {
      path: ref.path,
      message: `"${ref.ref}" refers to a role "${ref.role}" that does not exist.`,
      fix: pickFrom(ref.role, ROLE_NAMES, 'role'),
    };
  }

  const steps = Object.keys(scale);
  const step = EXAMPLE_STEPS.find((candidate) => steps.includes(candidate)) ?? steps[0] ?? '500';
  const opacity = ref.opacity === undefined ? '' : `/${ref.opacity}`;
  return {
    path: ref.path,
    message: `"${ref.ref}" names the "${ref.role}" palette without a step, so it is not a color.`,
    fix:
      `Write a step such as "${ref.role}.${step}${opacity}"; the "${ref.role}" palette has ` +
      `${steps.join(', ')}.`,
  };
}

/**
 * A role as written in a card color, with its parts.
 */
type RoleRef = {
  /**
   * The color as written, such as `accent/12`.
   */
  ref: string;

  /**
   * The role name.
   */
  role: string;

  /**
   * The opacity in percent, as written, if any.
   */
  opacity: string | undefined;

  /**
   * The field path, for problems.
   */
  path: string;
};

/**
 * A role's color on the surface, with the opacity a card color asks for multiplied in.
 *
 * @param input - The surface and the resolver.
 * @param ref - The role as written.
 */
function roleColor(input: SurfaceCardsInput, ref: RoleRef): Hex {
  if (ref.role === 'none' && ref.opacity !== undefined) {
    input.colors.problems.push({
      path: ref.path,
      message: `"${ref.ref}" gives "none" an opacity, but "none" draws nothing.`,
      fix:
        'Write "none" alone to draw no fill or border, or a role with an opacity such as ' +
        '"accent/12".',
    });
    return UNRESOLVED_HEX;
  }

  if (ref.role === 'none') {
    input.colors.problems.push({
      path: ref.path,
      message: 'Only a card\'s `fill` and `border` may be "none".',
      fix: 'Name a role such as "fg", or leave the field out to derive a readable color.',
    });
    return UNRESOLVED_HEX;
  }

  const role = ROLE_NAMES.find((name) => name === ref.role);
  if (role === undefined) {
    input.colors.problems.push(unknownRoleProblem(input, ref));
    return UNRESOLVED_HEX;
  }

  const color = fromHex(input.surface.roles[role]);
  if (ref.opacity === undefined) {
    return formatHex(color);
  }

  const percent = Number(ref.opacity);
  if (percent > PERCENT) {
    input.colors.problems.push({
      path: ref.path,
      message: `"${ref.ref}" asks for ${percent}% opacity; opacity runs from 0 to ${PERCENT}.`,
      fix: `Write an opacity from 0 to ${PERCENT}, such as "${ref.role}/12", or leave it out.`,
    });
    return UNRESOLVED_HEX;
  }

  return formatHex({ ...color, alpha: color.alpha * (percent / PERCENT) });
}
