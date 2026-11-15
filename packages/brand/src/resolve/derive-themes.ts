import type { Hex } from '#resolve/brand-tokens.ts';
import type { SurfaceColors } from '#resolve/surface-colors.ts';
import type { CodeToken, DiagramToken } from '#schema/theme-schema.ts';

import { GRAPHIC_CONTRAST, TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { compositeOver, formatHex, fromHex, mixColors, type Rgba } from '#color/color.ts';
import {
  contrastRatio,
  directionAway,
  ensureContrastOnAll,
  roundToHex,
  searchLightness,
} from '#color/contrast.ts';
import { oklabToOklch, oklabToRgb, oklchToOklab, rgbToOklab } from '#color/oklab.ts';

/**
 * How much accent tints the background of a highlighted code line.
 */
const LINE_HIGHLIGHT_MIX = 0.14;

/**
 * The least share of the way from the code background to the positive or negative role (in OKLCH) a
 * line tint is moved.
 */
const DIFF_TINT_MIN_MIX = 0.1;

/**
 * The largest share; a tint stays mostly the code background, so a diff sits within the surface's
 * palette instead of laying saturated bands across it.
 */
const DIFF_TINT_MAX_MIX = 0.6;

/**
 * How much further each try moves.
 */
const DIFF_TINT_MIX_STEP = 0.02;

/**
 * How much of the lightness difference to the role a tint takes, relative to its share of hue and
 * chroma: the band keeps close to the background's lightness.
 */
const DIFF_TINT_LIGHTNESS_SHARE = 0.5;

/**
 * The most OKLCH chroma a line tint has, so a band is quieter than the saturated surfaces (a blue
 * gradient, a coral accent) it sits on.
 */
const DIFF_TINT_MAX_CHROMA = 0.09;

/**
 * Below this OKLCH chroma a code background has no hue worth keeping; its tints start from the
 * role's hue.
 */
const ACHROMATIC_CHROMA = 0.02;

/**
 * The OKLab distance a tint aims for from the code background and from the other tint: a little
 * over {@link DIFF_TINT_MIN_DISTANCE}, so the bands show and the brand check passes with room, and
 * no more. The gutter sign and the colored edge carry the rest of the meaning.
 */
const DIFF_TINT_TARGET_DISTANCE = 0.06;

/**
 * Degrees in a full turn of hue.
 */
const FULL_TURN = 360;

/**
 * The least OKLab distance between the tint of an added or removed code line and the code
 * background, or the other tint, for the tint to mean something at a glance.
 */
export const DIFF_TINT_MIN_DISTANCE = 0.05;

/**
 * How much foreground tints the fill of a diagram group box.
 */
const GROUP_FILL_MIX = 0.05;

/**
 * Float slack when stepping through the shares of the way, so the last share is still tried.
 */
const DIFF_TINT_SHARE_EPSILON = 1e-9;

/**
 * Half the number of lightness steps the tint search tries on each side of the code background.
 */
const SEARCH_LIGHTNESS_RADIUS_STEPS = 30;

/**
 * The OKLCH lightness change between two neighbouring steps of the tint search.
 */
const SEARCH_LIGHTNESS_STEP = 0.005;

/**
 * Lightness offsets from the code background the tint search tries, in OKLCH, darkest first.
 */
const SEARCH_LIGHTNESS = Array.from(
  { length: 2 * SEARCH_LIGHTNESS_RADIUS_STEPS + 1 },
  (_, index) => (index - SEARCH_LIGHTNESS_RADIUS_STEPS) * SEARCH_LIGHTNESS_STEP,
);

/**
 * Chroma values the tint search tries, in OKLCH.
 */
const SEARCH_CHROMA = [0, 0.015, 0.03, 0.05, 0.07, 0.09, 0.12];

/**
 * Hue steps the tint search tries, in degrees.
 */
const SEARCH_HUE_STEP = 10;

/**
 * The hues the tint search tries, in degrees: every {@link SEARCH_HUE_STEP} around the wheel.
 */
const SEARCH_HUES = Array.from(
  { length: FULL_TURN / SEARCH_HUE_STEP },
  (_, index) => index * SEARCH_HUE_STEP,
);

/**
 * Added before the second modulo in {@link shortestTurn}, a turn and a half, so the sum is never
 * negative and the modulo lands in the range from 0 to a full turn.
 */
const POSITIVE_REMAINDER_SHIFT = FULL_TURN * 1.5;

/**
 * How much each unit of OKLab distance from the target distance counts against a candidate tint,
 * next to the hue's share of a turn in {@link tintScore}.
 */
const TARGET_DISTANCE_WEIGHT = 4;

/**
 * Colors a brand sets for some theme tokens, already resolved; the rest are derived.
 */
export type ThemeOverrides<Token extends string> = Readonly<Partial<Record<Token, Hex>>>;

/**
 * What a theme is derived from: a surface's roles and the colors under it.
 */
type ThemeSurface = Pick<SurfaceColors, 'roles' | 'backdrop'>;

/**
 * Derives a code theme from a surface's roles, with the brand's overrides applied first: panels use
 * `surface` (painted over `bg`), keywords the accent, strings `positive`, and functions, numbers
 * and types the next categorical data colors. Every derived text color is moved in lightness until
 * it reaches 4.5:1 on the code background, and a derived line highlight until the code text reaches
 * 4.5:1 on it, so derived tokens pass against overridden ones too. Overridden colors are kept as
 * written; the contrast checks measure them.
 *
 * @param surface - The surface's resolved roles and backdrop.
 * @param categorical - The surface's categorical data colors, for extra hues.
 * @param overrides - The colors the brand sets for this surface.
 */
export function deriveCodeTheme(
  surface: ThemeSurface,
  categorical: readonly Hex[],
  overrides: ThemeOverrides<CodeToken>,
): Record<CodeToken, Hex> {
  const { roles } = surface;
  const bg = fromHex(roles.bg);
  const surfaceCard = compositeOver(fromHex(roles.surface), bg);
  const background = compositeOver(fromHex(overrides.background ?? formatHex(surfaceCard)), bg);
  /**
   * A token's override, else its color moved in lightness until it reads on the code background;
   * `fallback` stands in when the brand has no such color.
   */
  const pick = (token: CodeToken, color: Hex | undefined, fallback: Hex): Hex =>
    overrides[token] ??
    formatHex(ensureContrastOnAll(fromHex(color ?? fallback), [background], TEXT_CONTRAST));
  const foreground = pick('foreground', roles.fg, roles.fg);
  const diff = diffTints(
    background,
    fromHex(roles.positive),
    fromHex(roles.negative),
    fromHex(foreground),
    fixedTints(overrides, background),
  );
  return {
    background: formatHex(background),
    foreground,
    comment: pick('comment', roles.muted, roles.muted),
    keyword: pick('keyword', roles.accent, roles.fg),
    string: pick('string', roles.positive, roles.fg),
    function: pick('function', categorical[1], roles.accent),
    number: pick('number', categorical[2], roles.accent),
    type: pick('type', categorical[3], roles.fg),
    punctuation: pick('punctuation', roles.muted, roles.muted),
    highlight:
      overrides.highlight ??
      formatHex(lineHighlight(background, fromHex(roles.accent), fromHex(foreground))),
    added: overrides.added ?? formatHex(diff.added),
    removed: overrides.removed ?? formatHex(diff.removed),
  };
}

/**
 * The line tints a brand sets in its code theme, painted over the code background so the derived
 * tints are measured against what the brand actually shows. A tint the brand leaves out is absent
 * from the result, so `diffTints` derives it.
 *
 * @param overrides - The code theme overrides for the surface.
 * @param background - The opaque code background.
 */
function fixedTints(overrides: ThemeOverrides<CodeToken>, background: Rgba): FixedTints {
  return {
    ...(overrides.added === undefined
      ? {}
      : { added: compositeOver(fromHex(overrides.added), background) }),
    ...(overrides.removed === undefined
      ? {}
      : { removed: compositeOver(fromHex(overrides.removed), background) }),
  };
}

/**
 * Line tints an author fixed, which the derived ones must stand apart from.
 */
export type FixedTints = {
  /**
   * The brand's own added-line tint.
   */
  added?: Rgba;

  /**
   * The brand's own removed-line tint.
   */
  removed?: Rgba;
};

/**
 * What {@link searchTints} works from.
 */
type TintSearch = {
  /**
   * The code background, rounded to hex.
   */
  background: Rgba;

  /**
   * The role added lines lean toward.
   */
  positive: Rgba;

  /**
   * The role removed lines lean toward.
   */
  negative: Rgba;

  /**
   * The code text color.
   */
  foreground: Rgba;

  /**
   * The tints the brand sets itself.
   */
  fixed: FixedTints;
};

/**
 * The backgrounds of added and removed code lines: the code background moved the least share of the
 * way toward the `positive` and `negative` roles (in OKLCH, the same share for both, between
 * {@link DIFF_TINT_MIN_MIX} and {@link DIFF_TINT_MAX_MIX}) that sets each tint
 * {@link DIFF_TINT_TARGET_DISTANCE} apart from the background and from the other. A band turns
 * toward its role's hue, keeps near the background's lightness and never exceeds
 * {@link DIFF_TINT_MAX_CHROMA}, so a diff reads as added and removed but sits within the surface's
 * palette; each is then moved in lightness until the code text reads on it.
 *
 * The result passes the brand's diff check by construction: the pair is measured after the
 * lightness move and the rounding to hex, and when no share of the way gets both tints apart (roles
 * close in hue, or a move that brings them back together), the tints are searched around the
 * background instead, nearest the roles' hues first. Only when no two colors the code text reads on
 * stand apart from the background and each other does the pair fall short, and then because of the
 * code text and background, which the check names. A tint the brand fixes is kept, and the other is
 * derived apart from it.
 *
 * @param background - The opaque code background.
 * @param positive - The surface's `positive` role, for added lines.
 * @param negative - The surface's `negative` role, for removed lines.
 * @param foreground - The code text color.
 * @param fixed - The tints the brand sets itself, if any.
 */
export function diffTints(
  background: Rgba,
  positive: Rgba,
  negative: Rgba,
  foreground: Rgba,
  fixed: FixedTints = {},
): { added: Rgba; removed: Rgba } {
  const bg = roundToHex(background);
  /**
   * Both tints at one share of the way to their roles, made readable; a fixed tint as it is.
   */
  const pairAt = (amount: number) => ({
    added: fixed.added ?? readableTint(towardRole(bg, positive, amount), bg, foreground),
    removed: fixed.removed ?? readableTint(towardRole(bg, negative, amount), bg, foreground),
  });
  const pairs = tintShares().map(pairAt);
  const found =
    pairs.find((pair) => tintsApart(pair, bg, foreground, DIFF_TINT_TARGET_DISTANCE)) ??
    pairs.find((pair) => tintsApart(pair, bg, foreground, DIFF_TINT_MIN_DISTANCE)) ??
    searchTints({ background: bg, positive, negative, foreground, fixed });
  return found ?? pairAt(DIFF_TINT_MAX_MIX);
}

/**
 * The shares of the way from the background toward each role that the derived tints try, from the
 * least to the most, in steps of {@link DIFF_TINT_MIX_STEP}.
 */
function tintShares(): number[] {
  const shares: number[] = [];
  for (
    let amount = DIFF_TINT_MIN_MIX;
    amount <= DIFF_TINT_MAX_MIX + DIFF_TINT_SHARE_EPSILON;
    amount += DIFF_TINT_MIX_STEP
  ) {
    shares.push(amount);
  }

  return shares;
}

/**
 * Whether a pair of line tints does what the brand's diff check asks: the code text reads on each,
 * and each stands at least `distance` apart from the code background and from the other.
 *
 * @param pair - The tints, rounded to hex.
 * @param background - The opaque code background.
 * @param foreground - The code text color.
 * @param distance - The least OKLab distance.
 */
function tintsApart(
  pair: { added: Rgba; removed: Rgba },
  background: Rgba,
  foreground: Rgba,
  distance: number,
): boolean {
  return (
    contrastRatio(foreground, pair.added) >= TEXT_CONTRAST &&
    contrastRatio(foreground, pair.removed) >= TEXT_CONTRAST &&
    oklabDistance(pair.added, background) >= distance &&
    oklabDistance(pair.removed, background) >= distance &&
    oklabDistance(pair.added, pair.removed) >= distance
  );
}

/**
 * The distinct colors near the code background that the tint search may pick from: each reads with
 * the code text and stands at least {@link DIFF_TINT_MIN_DISTANCE} from the background. The search
 * walks lightness, chroma and hue around the background in fixed steps.
 *
 * @param background - The opaque code background, rounded to hex.
 * @param foreground - The code text color.
 */
function candidateTints(background: Rgba, foreground: Rgba): Rgba[] {
  const from = oklabToOklch(rgbToOklab(background));
  const grid = SEARCH_LIGHTNESS.flatMap((lightnessOffset) =>
    SEARCH_CHROMA.flatMap((chroma) =>
      SEARCH_HUES.map((hue) => ({ l: from.l + lightnessOffset, c: chroma, h: hue })),
    ),
  );
  const seen = new Set<string>();
  const candidates: Rgba[] = [];
  for (const point of grid) {
    const candidate = roundToHex(oklabToRgb(oklchToOklab(point)));
    const key = formatHex(candidate);
    const apart = oklabDistance(candidate, background) >= DIFF_TINT_MIN_DISTANCE;
    if (!seen.has(key) && apart && contrastRatio(foreground, candidate) >= TEXT_CONTRAST) {
      seen.add(key);
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Searches colors around the code background for two line tints the check accepts: the code text
 * reads on each, each is {@link DIFF_TINT_MIN_DISTANCE} from the background and from the other.
 * Candidates are ranked by how near they are to their role's hue and to the target distance; the
 * added tints are tried in that order, each with the best removed tint apart from it, and the first
 * that has one wins. A fixed tint is the only candidate for its side.
 *
 * @param search - The background, roles, text color and fixed tints.
 * @returns The pair, or `undefined` when no such pair exists.
 */
function searchTints(search: TintSearch): { added: Rgba; removed: Rgba } | undefined {
  const { background, positive, negative, foreground, fixed } = search;
  const candidates = candidateTints(background, foreground);

  /**
   * The candidates for one side, best first: the fixed tint alone, else every candidate by score.
   */
  const ranked = (role: Rgba, own: Rgba | undefined): Rgba[] => {
    if (own !== undefined) {
      return [own];
    }

    const hue = oklabToOklch(rgbToOklab(role)).h;
    return candidates
      .map((candidate) => ({ candidate, score: tintScore(candidate, hue, background) }))
      .sort((a, b) => a.score - b.score)
      .map(({ candidate }) => candidate);
  };
  const removals = ranked(negative, fixed.removed);
  for (const added of ranked(positive, fixed.added)) {
    const removed = removals.find(
      (candidate) => oklabDistance(candidate, added) >= DIFF_TINT_MIN_DISTANCE,
    );
    if (
      removed !== undefined &&
      tintsApart({ added, removed }, background, foreground, DIFF_TINT_MIN_DISTANCE)
    ) {
      return { added, removed };
    }
  }

  return undefined;
}

/**
 * The signed hue difference from one hue to another, the short way round, in degrees from -180 up
 * to 180.
 *
 * @param from - The starting hue in degrees.
 * @param to - The hue to reach, in degrees.
 */
function shortestTurn(from: number, to: number): number {
  return ((((to - from) % FULL_TURN) + POSITIVE_REMAINDER_SHIFT) % FULL_TURN) - FULL_TURN / 2;
}

/**
 * How far a candidate tint is from what a tint should be: its hue's distance from the role's (in
 * turns), plus how far its distance from the background is from the target.
 *
 * @param candidate - A candidate tint.
 * @param hue - The role's OKLCH hue.
 * @param background - The code background.
 */
function tintScore(candidate: Rgba, hue: number, background: Rgba): number {
  const own = oklabToOklch(rgbToOklab(candidate)).h;
  const turn = Math.abs(shortestTurn(hue, own));
  return (
    turn / FULL_TURN +
    Math.abs(oklabDistance(candidate, background) - DIFF_TINT_TARGET_DISTANCE) *
      TARGET_DISTANCE_WEIGHT
  );
}

/**
 * A color part of the way from a code background to a role in OKLCH: the hue turns the short way
 * round, the chroma moves and is capped at {@link DIFF_TINT_MAX_CHROMA}, and the lightness moves
 * {@link DIFF_TINT_LIGHTNESS_SHARE} as far. A background with no hue starts from the role's.
 *
 * @param background - The opaque code background.
 * @param role - The role to move toward.
 * @param amount - The share of the way, from 0 to 1.
 */
function towardRole(background: Rgba, role: Rgba, amount: number): Rgba {
  const from = oklabToOklch(rgbToOklab(background));
  const to = oklabToOklch(rgbToOklab(role));
  const hue = from.c < ACHROMATIC_CHROMA ? to.h : from.h;
  const turn = shortestTurn(hue, to.h);
  return oklabToRgb(
    oklchToOklab({
      l: from.l + (to.l - from.l) * amount * DIFF_TINT_LIGHTNESS_SHARE,
      c: Math.min(from.c + (to.c - from.c) * amount, DIFF_TINT_MAX_CHROMA),
      h: hue + turn * amount,
    }),
  );
}

/**
 * A diff tint moved in lightness until the code text reads on it while it stays apart from the code
 * background; the background itself when no lightness does.
 *
 * @param tinted - The mixed tint.
 * @param background - The opaque code background.
 * @param foreground - The code text color.
 */
function readableTint(tinted: Rgba, background: Rgba, foreground: Rgba): Rgba {
  /**
   * Whether the code text reads on a candidate and it stands apart from the code background.
   */
  const accepts = (candidate: Rgba): boolean =>
    contrastRatio(foreground, candidate) >= TEXT_CONTRAST &&
    oklabDistance(candidate, background) >= DIFF_TINT_MIN_DISTANCE;
  const away = directionAway(tinted, compositeOver(foreground, tinted));
  return searchLightness(tinted, away, accepts) ?? readableBehind(tinted, foreground) ?? background;
}

/**
 * The distance between two colors in OKLab, about 0.02 for a just-visible difference.
 *
 * @param first - A color.
 * @param second - Another color.
 */
export function oklabDistance(first: Rgba, second: Rgba): number {
  const a = rgbToOklab(first);
  const b = rgbToOklab(second);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/**
 * Derives a diagram theme from a surface's roles, with the brand's overrides applied first: nodes
 * are `surface` boxes with `border` outlines and `fg` text on the slide's `bg`; edges and labels
 * are `muted`; the highlighted node and the packets travelling along edges use the accent. Derived
 * colors are moved in lightness until they pass on every color they may sit on: node text on the
 * node fill painted over each backdrop color, highlight text on the highlight fill, labels (4.5:1),
 * edges and packets (3:1) on the backdrop.
 *
 * @param surface - The surface's resolved roles and backdrop.
 * @param overrides - The colors the brand sets for this surface.
 */
export function deriveDiagramTheme(
  surface: ThemeSurface,
  overrides: ThemeOverrides<DiagramToken>,
): Record<DiagramToken, Hex> {
  const { roles } = surface;
  const backdrop = surface.backdrop.map(fromHex);
  const node = overrides.node ?? roles.surface;
  const highlight = overrides.highlight ?? roles.accent;
  /**
   * A token's override, else the role color moved until it passes on every background.
   */
  const pick = (token: DiagramToken, color: Hex, on: readonly Rgba[], ratio: number): Hex =>
    overrides[token] ?? formatHex(ensureContrastOnAll(fromHex(color), on, ratio));
  return {
    node,
    'node-border': overrides['node-border'] ?? roles.border,
    'node-text': pick('node-text', roles.fg, paintOver(node, backdrop), TEXT_CONTRAST),
    group:
      overrides.group ?? formatHex(mixColors(fromHex(roles.bg), fromHex(roles.fg), GROUP_FILL_MIX)),
    edge: pick('edge', roles.muted, backdrop, GRAPHIC_CONTRAST),
    label: pick('label', roles.muted, backdrop, TEXT_CONTRAST),
    highlight,
    'highlight-text': pick(
      'highlight-text',
      roles['accent-fg'],
      paintOver(highlight, backdrop),
      TEXT_CONTRAST,
    ),
    packet: pick('packet', roles.accent, backdrop, GRAPHIC_CONTRAST),
  };
}

/**
 * A fill painted over each color underneath it, for measuring text on a translucent fill.
 *
 * @param fill - The fill, translucent or not.
 * @param under - The opaque colors it may be painted over.
 * @returns One opaque color per color underneath.
 */
export function paintOver(fill: Hex, under: readonly Rgba[]): Rgba[] {
  const color = fromHex(fill);
  return under.map((background) => compositeOver(color, background));
}

/**
 * The accent-tinted line background, moved in lightness until the code text reads on it.
 *
 * @param background - The opaque code background.
 * @param accent - The surface's accent.
 * @param foreground - The code text color.
 */
function lineHighlight(background: Rgba, accent: Rgba, foreground: Rgba): Rgba {
  const tinted = mixColors(background, accent, LINE_HIGHLIGHT_MIX);
  return readableBehind(tinted, foreground) ?? background;
}

/**
 * A line background moved in lightness, away from the text first, until the code text reaches 4.5:1
 * on it; `undefined` when no lightness does.
 *
 * @param tinted - The line color to start from.
 * @param foreground - The code text color.
 */
function readableBehind(tinted: Rgba, foreground: Rgba): Rgba | undefined {
  /**
   * Whether the code text reaches 4.5:1 on a candidate line color.
   */
  const readable = (candidate: Rgba): boolean =>
    contrastRatio(foreground, candidate) >= TEXT_CONTRAST;
  const away = directionAway(tinted, compositeOver(foreground, tinted));
  const other = away === 1 ? -1 : 1;
  return searchLightness(tinted, away, readable) ?? searchLightness(tinted, other, readable);
}
