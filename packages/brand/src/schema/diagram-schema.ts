import { Schema } from 'effect';

import { isColorLiteral } from '#color/color.ts';
import { FiniteBetween, KebabName, PALETTE_REF_PATTERN, Pixels } from '#schema/primitives.ts';
import { SHADOW_NAMES, STROKE_NAMES } from '#schema/shape-schema.ts';
import { DiagramColors } from '#schema/theme-schema.ts';

/**
 * The node kinds the kit draws, by their canonical names (aliases such as `db` are not listed). A
 * brand's `diagram.kinds` may map only these. The canonical list is `NODE_KINDS` in
 * `packages/kit/src/diagrams/node-kinds.ts`, which depends on this package; keep the two in step.
 */
export const DIAGRAM_NODE_KINDS = [
  'service',
  'database',
  'queue',
  'cache',
  'storage',
  'user',
  'client',
  'mobile',
  'cloud',
  'external',
  'function',
  'gateway',
  'loadbalancer',
  'agent',
  'llm',
  'tool',
  'document',
  'decision',
  'node',
] as const;

/**
 * A node kind the kit draws.
 */
export type DiagramNodeKind = (typeof DIAGRAM_NODE_KINDS)[number];

/**
 * Other names the kit accepts for a node kind on a node, mapped to the kind they mean.
 * `diagram.kinds` takes only canonical kinds, so an alias there is answered with its kind. A copy
 * of `NODE_KIND_ALIASES` in `packages/kit/src/diagrams/node-kinds.ts`; keep the two in step.
 */
export const DIAGRAM_NODE_KIND_ALIASES: Readonly<Record<string, DiagramNodeKind>> = {
  /**
   * `browser` means `client`.
   */
  browser: 'client',

  /**
   * `web` means `client`.
   */
  web: 'client',

  /**
   * `app` means `client`.
   */
  app: 'client',

  /**
   * `db` means `database`.
   */
  db: 'database',

  /**
   * `stream` means `queue`.
   */
  stream: 'queue',

  /**
   * `bus` means `queue`.
   */
  bus: 'queue',

  /**
   * `lb` means `loadbalancer`.
   */
  lb: 'loadbalancer',

  /**
   * `load-balancer` means `loadbalancer`.
   */
  'load-balancer': 'loadbalancer',

  /**
   * `proxy` means `gateway`.
   */
  proxy: 'gateway',

  /**
   * `lambda` means `function`.
   */
  lambda: 'function',

  /**
   * `worker` means `function`.
   */
  worker: 'function',

  /**
   * `person` means `user`.
   */
  person: 'user',

  /**
   * `model` means `llm`.
   */
  model: 'llm',

  /**
   * `bucket` means `storage`.
   */
  bucket: 'storage',

  /**
   * `file` means `document`.
   */
  file: 'document',

  /**
   * `phone` means `mobile`.
   */
  phone: 'mobile',

  /**
   * `third-party` means `external`.
   */
  'third-party': 'external',

  /**
   * `generic` means `node`.
   */
  generic: 'node',
};

/**
 * The cards every brand has, whether or not it writes them: `default` (today's node), `outline`,
 * `solid`, `tint` and `raised`. A brand's own entry with one of these names is merged over the
 * standard card field by field.
 */
export const STANDARD_CARDS = ['default', 'outline', 'solid', 'tint', 'raised'] as const;

/**
 * A standard card name.
 */
export type StandardCard = (typeof STANDARD_CARDS)[number];

/**
 * Most cards a brand may write in `diagram.cards`, standard names included.
 */
export const MAX_DIAGRAM_CARDS = 12;

/**
 * Edge corner styles: `round` bends with the brand's `lg` radius, `sharp` bends square.
 */
export const EDGE_CORNERS = ['round', 'sharp'] as const;

/**
 * An edge corner style.
 */
export type EdgeCorners = (typeof EDGE_CORNERS)[number];

/**
 * Arrowheads: a filled `triangle`, an `open` chevron or a `dot`.
 */
export const EDGE_ARROWS = ['triangle', 'open', 'dot'] as const;

/**
 * An arrowhead style.
 */
export type EdgeArrow = (typeof EDGE_ARROWS)[number];

/**
 * The stroke patterns available for connectors and outlines.
 */
export const DIAGRAM_LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;

/**
 * A diagram stroke pattern.
 */
export type DiagramLineStyle = (typeof DIAGRAM_LINE_STYLES)[number];

/**
 * The horizontal positions a diagram can take within its layout.
 */
export const DIAGRAM_ALIGNMENTS = ['left', 'center', 'right'] as const;

/**
 * A diagram's horizontal position.
 */
export type DiagramAlignment = (typeof DIAGRAM_ALIGNMENTS)[number];

/**
 * Brand typography steps available for subtitles and notes.
 */
export const DIAGRAM_TEXT_TYPES = ['caption', 'label', 'small', 'body'] as const;

/**
 * A brand typography step for a diagram subtitle or note.
 */
export type DiagramTextType = (typeof DIAGRAM_TEXT_TYPES)[number];

/**
 * Edge label styles: `plain` text on a knock-out, or a bordered `chip`.
 */
export const LABEL_STYLES = ['plain', 'chip'] as const;

/**
 * An edge label style.
 */
export type LabelStyle = (typeof LABEL_STYLES)[number];

/**
 * The type step edge labels are set in: `caption` (today), or the brand's `label` step with its
 * family, case and tracking.
 */
export const LABEL_TYPES = ['caption', 'label'] as const;

/**
 * An edge label type step.
 */
export type LabelType = (typeof LABEL_TYPES)[number];

/**
 * Corner radius names a diagram part may use: the brand's radii, or `none` for square corners.
 */
export const DIAGRAM_RADII = ['none', 'sm', 'md', 'lg', 'xl'] as const;

/**
 * A diagram radius name.
 */
export type DiagramRadius = (typeof DIAGRAM_RADII)[number];

/**
 * The outline a card draws: the node kind's own shape, a plain `box`, or a `pill`.
 */
export const CARD_SHAPES = ['kind', 'box', 'pill'] as const;

/**
 * A card shape.
 */
export type CardShape = (typeof CARD_SHAPES)[number];

/**
 * How a card draws its icon: a bordered `chip` tile, a filled `solid` tile, the glyph alone
 * (`plain`), or no icon (`none`).
 */
export const CARD_ICON_STYLES = ['chip', 'solid', 'plain', 'none'] as const;

/**
 * A card icon style.
 */
export type CardIconStyle = (typeof CARD_ICON_STYLES)[number];

/**
 * The side of a card an accent stripe runs along.
 */
export const CARD_ACCENT_SIDES = ['left', 'top', 'right', 'bottom'] as const;

/**
 * An accent stripe side.
 */
export type CardAccentSide = (typeof CARD_ACCENT_SIDES)[number];

/**
 * A role name with an optional opacity in percent: `accent` or `accent/12`. The role is checked
 * after decoding, so a typo names the roles that exist.
 */
export const ROLE_COLOR_PATTERN = /^([a-z]+(?:-[a-z]+)*)(?:\/(\d{1,3}))?$/;

/**
 * The failure message of a card color.
 */
const CARD_COLOR_MESSAGE =
  'Expected a role such as "accent" or "accent/12", a palette reference such as "ink.900/20", ' +
  'or a color such as "#1f2937"';

/**
 * The failure message of a card fill or border, which may also be `"none"`.
 */
const CARD_PAINT_MESSAGE = `${CARD_COLOR_MESSAGE}, or "none"`;

/**
 * A card color: a surface role, optionally with an opacity (`accent/12`), which follows the surface
 * the diagram sits on; or a palette reference or color literal, the same on every surface.
 */
export const CardColor = Schema.String.check(
  Schema.makeFilter((value: string) => isCardColor(value), { message: CARD_COLOR_MESSAGE }),
);

/**
 * A card fill or border: a {@link CardColor}, or `"none"` to draw none.
 */
const CardPaint = Schema.String.check(
  Schema.makeFilter((value: string) => value === 'none' || isCardColor(value), {
    message: CARD_PAINT_MESSAGE,
  }),
);

/**
 * A stroke width name from `shape.stroke`.
 */
const StrokeName = Schema.Literals(STROKE_NAMES);

/**
 * A named stroke width or an explicit width in canvas pixels.
 */
const StrokeWidth = Schema.Union([StrokeName, Pixels]);

/**
 * The available connector and outline patterns.
 */
const LineStyle = Schema.Literals(DIAGRAM_LINE_STYLES);

/**
 * The available typography steps for diagram subtitles and notes.
 */
const DiagramTextStep = Schema.Literals(DIAGRAM_TEXT_TYPES);

/**
 * A radius name from `shape.radius`, or `none`.
 */
const RadiusName = Schema.Literals(DIAGRAM_RADII);

/**
 * A card's icon and its glyph, tile and border settings.
 */
const CardIcon = Schema.Struct({
  style: Schema.optionalKey(Schema.Literals(CARD_ICON_STYLES)),
  color: Schema.optionalKey(CardColor),
  fill: Schema.optionalKey(CardColor),
  border: Schema.optionalKey(CardColor),
  borderWidth: Schema.optionalKey(StrokeWidth),
  borderStyle: Schema.optionalKey(LineStyle),
});

/**
 * A stripe along one side of a card, clipped to the node's outline.
 */
const CardAccent = Schema.Struct({
  side: Schema.optionalKey(Schema.Literals(CARD_ACCENT_SIDES)),
  color: Schema.optionalKey(CardColor),
  width: Schema.optionalKey(StrokeName),
});

/**
 * Individual font properties shared by node titles, subtitles and notes. The family role is checked
 * after decoding so a typo names the roles that exist.
 */
const DiagramTextOverrides = Schema.Struct({
  family: Schema.optionalKey(KebabName('family role', 'mono')),
  weight: Schema.optionalKey(FiniteBetween(1, 1000, 'Expected a font weight from 1 to 1000')),
  tracking: Schema.optionalKey(
    FiniteBetween(-0.1, 0.5, 'Expected tracking in em from -0.1 to 0.5'),
  ),
  case: Schema.optionalKey(Schema.Literals(['none', 'upper'])),
});

/**
 * The base typography step for a note or subtitle plus individual font overrides.
 */
const DiagramTextSpec = Schema.Struct({
  type: Schema.optionalKey(DiagramTextStep),
  ...DiagramTextOverrides.fields,
});

/**
 * A subtitle accepts a typography step as shorthand for an object with `type`.
 */
const SubtitleSpec = Schema.Union([DiagramTextStep, DiagramTextSpec]);

/**
 * Decoded text settings for a diagram subtitle or note.
 */
export type DiagramTextSpec = typeof DiagramTextSpec.Type;

/**
 * A named node style. Every field is optional. A standard card fills what the brand leaves out from
 * its own built-in look; a card of the brand's own starts from the built-in look of the standard
 * `default` card (today's node: its paint, shadow, shape and icon), not from the brand's `default`
 * entry. All cards inherit `stroke`, `radius`, `borderStyle`, `subtitle` and the `title` fields
 * from the brand's `default` entry. `subtitle: null` skips the default card's subtitle settings and
 * uses the diagram's node subtitle settings.
 */
export const DiagramCard = Schema.Struct({
  fill: Schema.optionalKey(CardPaint),
  border: Schema.optionalKey(CardPaint),
  borderStyle: Schema.optionalKey(LineStyle),
  stroke: Schema.optionalKey(StrokeName),
  radius: Schema.optionalKey(RadiusName),
  shadow: Schema.optionalKey(Schema.Literals(['none', ...SHADOW_NAMES])),
  shape: Schema.optionalKey(Schema.Literals(CARD_SHAPES)),
  text: Schema.optionalKey(CardColor),
  subtext: Schema.optionalKey(CardColor),
  icon: Schema.optionalKey(CardIcon),
  accent: Schema.optionalKey(CardAccent),
  title: Schema.optionalKey(DiagramTextOverrides),
  subtitle: Schema.optionalKey(Schema.NullOr(SubtitleSpec)),
});

/**
 * A decoded card.
 */
export type DiagramCard = typeof DiagramCard.Type;

/**
 * A card's colors as a surface replaces them: only the color fields of a card. Each wins over the
 * card's own color on that surface.
 */
export const SurfaceCardColors = Schema.Struct({
  fill: Schema.optionalKey(CardPaint),
  border: Schema.optionalKey(CardPaint),
  text: Schema.optionalKey(CardColor),
  subtext: Schema.optionalKey(CardColor),
  icon: Schema.optionalKey(
    Schema.Struct({
      color: Schema.optionalKey(CardColor),
      fill: Schema.optionalKey(CardColor),
      border: Schema.optionalKey(CardColor),
    }),
  ),
  accent: Schema.optionalKey(Schema.Struct({ color: Schema.optionalKey(CardColor) })),
});

/**
 * A decoded surface card recoloring.
 */
export type SurfaceCardColors = typeof SurfaceCardColors.Type;

/**
 * A surface's `diagram` section: the nine theme color overrides for that surface, and the colors of
 * any card it recolors (the card must exist, standard or the brand's own).
 */
export const SurfaceDiagram = Schema.Struct({
  ...DiagramColors.fields,
  cards: Schema.optionalKey(Schema.Record(KebabName('card name', 'tint'), SurfaceCardColors)),
});

/**
 * The top-level `diagram` section of a brand: the nine theme color overrides, plus the look of
 * edges, groups, nodes, notes and edge labels, plus the brand's cards and kind assignments. Every
 * key is optional; without them diagrams look as the roles and shape derive them.
 */
export const BrandDiagram = Schema.Struct({
  ...DiagramColors.fields,
  align: Schema.optionalKey(Schema.Literals(DIAGRAM_ALIGNMENTS)),
  edges: Schema.optionalKey(
    Schema.Struct({
      stroke: Schema.optionalKey(StrokeWidth),
      lineStyle: Schema.optionalKey(LineStyle),
      corners: Schema.optionalKey(Schema.Literals(EDGE_CORNERS)),
      arrow: Schema.optionalKey(Schema.Literals(EDGE_ARROWS)),
    }),
  ),
  groups: Schema.optionalKey(
    Schema.Struct({
      stroke: Schema.optionalKey(Schema.Union([Schema.Literal('none'), StrokeWidth])),
      lineStyle: Schema.optionalKey(LineStyle),
      dashed: Schema.optionalKey(Schema.Boolean),
      radius: Schema.optionalKey(RadiusName),
    }),
  ),
  labels: Schema.optionalKey(
    Schema.Struct({
      style: Schema.optionalKey(Schema.Literals(LABEL_STYLES)),
      type: Schema.optionalKey(Schema.Literals(LABEL_TYPES)),
    }),
  ),
  nodes: Schema.optionalKey(
    Schema.Struct({
      width: Schema.optionalKey(Pixels),
      height: Schema.optionalKey(Pixels),
      subtitle: Schema.optionalKey(SubtitleSpec),
    }),
  ),
  notes: Schema.optionalKey(DiagramTextSpec),
  kinds: Schema.optionalKey(
    Schema.Record(KebabName('node kind', 'database'), KebabName('card name', 'tint')),
  ),
  cards: Schema.optionalKey(Schema.Record(KebabName('card name', 'spotlight'), DiagramCard)),
});

/**
 * A decoded top-level `diagram` section.
 */
export type BrandDiagram = typeof BrandDiagram.Type;

/**
 * Whether text is a card color: a role with an optional opacity, a palette reference or a color
 * literal. Unknown roles and palette steps pass here and are reported by the reference checks.
 *
 * @param value - The color as written.
 */
function isCardColor(value: string): boolean {
  return ROLE_COLOR_PATTERN.test(value) || PALETTE_REF_PATTERN.test(value) || isColorLiteral(value);
}
