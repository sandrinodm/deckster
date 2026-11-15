import type { BrandTokens, Hex, SurfaceTokens } from '#resolve/brand-tokens.ts';
import type { SurfaceColors } from '#resolve/surface-colors.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { ContrastWaiver, Role } from '#schema/color-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { GRAPHIC_CONTRAST, TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { compositeOver, formatHex, fromHex, type Rgba } from '#color/color.ts';
import { contrastRatio, ensureContrastOnAll, worstContrast } from '#color/contrast.ts';
import { createColorResolver } from '#resolve/color-resolver.ts';
import { DIFF_TINT_MIN_DISTANCE, oklabDistance, paintOver } from '#resolve/derive-themes.ts';
import { backdropSamples } from '#resolve/surface-colors.ts';
import { TEXT_TONES, textBackgrounds } from '#resolve/text-colors.ts';
import { CODE_TOKENS, type CodeToken, type DiagramToken } from '#schema/theme-schema.ts';

export { GRAPHIC_CONTRAST, TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';

/**
 * Failing pairs a derived surface's problem lists before it counts the rest.
 */
const DERIVED_PAIRS_SHOWN = 3;

/**
 * A foreground that must stand out from a background, and by how much.
 */
type Pair = {
  /**
   * The role that carries the text or mark.
   */
  color: Role;

  /**
   * The role it sits on; `bg` means every color of the surface's backdrop.
   */
  on: Role;

  /**
   * The lowest WCAG contrast ratio that passes, such as 4.5 for 4.5:1.
   */
  minimum: number;

  /**
   * What the pair carries, for the message.
   */
  use: string;
};

/**
 * The role pairs that carry text or marks on every surface. `on: 'bg'` is checked against every
 * color of the surface's backdrop, so a gradient surface must work at each of its colors. Pairs
 * that may carry small text (captions and labels are under WCAG's 24px large-text size) need 4.5:1;
 * headings are always large and need 3:1. `accent`, `positive` and `negative` need 3:1: they carry
 * marks and large text, and small text in those roles is set in the surface's derived text colors
 * (`text.accent` and so on, 4.5:1; see `checkTextColors`). A brand can waive a 4.5:1 pair down to
 * 3:1 with `color.waivers`, which turns the shortfall into a warning.
 */
export const ROLE_PAIRS: readonly Pair[] = [
  { color: 'fg', on: 'bg', minimum: TEXT_CONTRAST, use: 'text' },
  { color: 'heading', on: 'bg', minimum: GRAPHIC_CONTRAST, use: 'headings (large text)' },
  { color: 'heading', on: 'surface', minimum: GRAPHIC_CONTRAST, use: 'headings on cards' },
  { color: 'muted', on: 'bg', minimum: TEXT_CONTRAST, use: 'secondary text' },
  { color: 'fg', on: 'surface', minimum: TEXT_CONTRAST, use: 'text on cards' },
  { color: 'muted', on: 'surface', minimum: TEXT_CONTRAST, use: 'secondary text on cards' },
  { color: 'accent-fg', on: 'accent', minimum: TEXT_CONTRAST, use: 'text on accent fills' },
  { color: 'accent', on: 'bg', minimum: GRAPHIC_CONTRAST, use: 'large accent text and marks' },
  {
    color: 'positive',
    on: 'bg',
    minimum: GRAPHIC_CONTRAST,
    use: 'positive marks and large values',
  },
  {
    color: 'negative',
    on: 'bg',
    minimum: GRAPHIC_CONTRAST,
    use: 'negative marks and large values',
  },
];

/**
 * The derived surfaces of a brand, by name, each with the brand fields it was derived from, such as
 * `color.roles.accent`; a problem on a derived surface names those fields, not ones the author
 * never wrote.
 */
export type DerivedSurfaces = ReadonlyMap<string, string>;

/**
 * Contrast failures, and waived shortfalls that still reach 3:1.
 */
export type ContrastResult = {
  /**
   * Pairs that fall short and have no waiver, or fall below 3:1 despite one; they fail the build.
   */
  errors: BrandProblem[];

  /**
   * Waived pairs that miss 4.5:1 but reach 3:1; they are reported and do not fail the build.
   */
  warnings: BrandProblem[];
};

/**
 * One role pair that falls short on one surface, and whether a waiver turns it into a warning.
 */
export type PairResult = {
  /**
   * The shortfall, with the worst background and a fix.
   */
  problem: BrandProblem;

  /**
   * Whether a waiver covers the pair and the ratio still reaches 3:1.
   */
  waived: boolean;

  /**
   * What was measured, for messages that group several pairs: `fg #090909 on bg #2e7d4f has
   * contrast 3.95:1; text needs 4.5:1`.
   */
  measured: string;
};

/**
 * Checks WCAG contrast for every text-carrying role pair on every surface, and the code and diagram
 * colors a brand overrides. A derived surface that fails is reported once, at
 * `color.surfaces.<name>`, listing what fails and telling the author to define that surface or
 * change the fields it was derived from.
 *
 * Derived code and diagram colors reach their targets by construction, so only overridden tokens
 * and the pairs they take part in are checked, plus the highlighted code line, which is always
 * checked. A translucent fill (a glass node on a gradient) is painted over every backdrop color
 * before text on it is measured.
 *
 * @param brand - The decoded brand with its surfaces completed, to tell overridden colors from
 *   inherited ones.
 * @param tokens - The resolved tokens.
 * @param derived - The surfaces the brand leaves out, which were derived.
 * @returns One error per failing pair, with a passing color in the fix where one exists, and a
 *   warning per waived pair that falls short of 4.5:1.
 */
export function checkContrast(
  brand: Brand,
  tokens: BrandTokens,
  derived: DerivedSurfaces = new Map(),
): ContrastResult {
  const surfaces = Object.values(tokens.surfaces);
  const colors = createColorResolver(brand.color.palette);
  const roles = surfaces.map((surface) => {
    const spec = Object.hasOwn(brand.color.surfaces, surface.name)
      ? (brand.color.surfaces[surface.name] ?? {})
      : {};
    const samples = backdropSamples({
      brand,
      name: surface.name,
      spec,
      colors,
      gradients: tokens.gradients,
    });
    return checkSurfaceRoles(brand, surface, derived, samples);
  });
  const themes = surfaces.flatMap((surface) => [
    ...checkTextColors(brand, surface),
    ...checkCode(brand, surface),
    ...checkDiagram(brand, surface),
  ]);
  const diffWarnings = surfaces.flatMap((surface) => checkDiffLines(brand, surface).warnings);
  return {
    errors: [...roles.flatMap((result) => result.errors), ...themes],
    warnings: [...roles.flatMap((result) => result.warnings), ...diffWarnings],
  };
}

/**
 * Checks the text colors of a surface (`text.accent`, `text.positive`, `text.negative`): each must
 * reach 4.5:1 on every backdrop color and on the chart plate, since the kit sets small text in them
 * (eyebrows, links, deltas, badges). They are derived to pass, so this fails only for a surface
 * whose `fg` does not read on its own backdrop either; the role pairs report that too.
 *
 * @param brand - The decoded brand, for the field paths in messages.
 * @param surface - The resolved surface.
 */
export function checkTextColors(brand: Brand, surface: SurfaceTokens): BrandProblem[] {
  const backgrounds = textBackgrounds(surface.backdrop, surface.data.plate);
  return TEXT_TONES.flatMap((tone) => {
    const color = surface.text[tone];
    const ratio = worstContrast(fromHex(color), backgrounds);
    if (ratio >= TEXT_CONTRAST) {
      return [];
    }

    return [
      {
        path: rolePath(brand, surface.name, tone),
        message:
          `On the ${surface.name} surface, no ${tone} color for small text reaches ` +
          `${TEXT_CONTRAST}:1 on every background (the best, ${color}, has ` +
          `${formatRatio(ratio)}), so eyebrows, links and deltas in it cannot be read.`,
        fix:
          `Give the ${surface.name} surface a background that ${tone} text or \`fg\` reads on ` +
          `at ${TEXT_CONTRAST}:1, or a ${tone} color that does.`,
      },
    ];
  });
}

/**
 * Checks one role pair on one surface against the worst of its backgrounds. Derived surfaces are
 * built and verified with this same check, so they pass exactly when the build would accept them.
 *
 * @param brand - The decoded brand, for waivers and the field paths in messages.
 * @param surface - The surface's roles and backdrop.
 * @param pair - The role pair and its minimum.
 * @param samples - The colors the surface's mesh shows where its glows overlap (see
 *   `backdropSamples`), measured along with the backdrop.
 * @returns Nothing when the pair passes, else one result, waived or not.
 */
export function checkRolePair(
  brand: Brand,
  surface: SurfaceColors,
  pair: Pair,
  samples: readonly Rgba[] = [],
): PairResult[] {
  const color = fromHex(surface.roles[pair.color]);
  const backgrounds = backgroundsFor(surface, pair.on, samples);
  const worst = backgrounds
    .map((background) => ({ background, ratio: contrastRatio(color, background) }))
    .sort((a, b) => a.ratio - b.ratio)[0];
  if (worst === undefined || worst.ratio >= pair.minimum) {
    return [];
  }

  const waiver = findWaiver(brand, surface.name, pair);
  const where = pair.on === 'bg' && surface.gradient !== undefined ? 'the gradient' : pair.on;
  const shortfall =
    `${pair.color} ${surface.roles[pair.color]} on ${where} ` +
    `${formatHex(worst.background)} has contrast ${formatRatio(worst.ratio)}`;
  const measured = `On the ${surface.name} surface, ${shortfall}`;
  const fixInput = {
    role: pair.color,
    color,
    backgrounds,
    other: rolePath(brand, surface.name, pair.on),
  };
  if (waiver !== undefined && worst.ratio >= GRAPHIC_CONTRAST) {
    const problem = {
      path: rolePath(brand, surface.name, pair.color),
      message: `${measured}, below ${pair.minimum}:1 for ${pair.use}; waived: ${waiver.reason}`,
      fix: 'Use it only for large text (24px and up), or raise the contrast and drop the waiver.',
    };
    return [{ problem, waived: true, measured: `${shortfall} (waived)` }];
  }

  const minimum = waiver === undefined ? pair.minimum : GRAPHIC_CONTRAST;
  const needs = `${pair.use} needs ${minimum}:1`;
  const problem = {
    path: rolePath(brand, surface.name, pair.color),
    message: `${measured}; ${needs}` + (waiver === undefined ? '.' : ' even with its waiver.'),
    fix: contrastFix({ ...fixInput, minimum }),
  };
  return [{ problem, waived: false, measured: `${shortfall}; ${needs}` }];
}

/**
 * Every role pair on one surface. An authored surface reports each failing pair at the field that
 * sets it; a derived surface reports its failing pairs together as one problem.
 *
 * @param brand - The decoded brand.
 * @param surface - The resolved surface.
 * @param derived - The derived surfaces and what each was derived from.
 * @param samples - The colors the surface's mesh shows, sampled.
 */
function checkSurfaceRoles(
  brand: Brand,
  surface: SurfaceTokens,
  derived: DerivedSurfaces,
  samples: readonly Rgba[],
): ContrastResult {
  const results = ROLE_PAIRS.flatMap((pair) => checkRolePair(brand, surface, pair, samples));
  const failing = results.filter((result) => !result.waived);
  const warnings = results.filter((result) => result.waived).map(({ problem }) => problem);
  const source = derived.get(surface.name);
  if (source === undefined) {
    return { errors: failing.map(({ problem }) => problem), warnings };
  }

  const path = `color.surfaces.${surface.name}`;
  return {
    errors: failing.length === 0 ? [] : [derivedSurfaceProblem(surface.name, source, failing)],
    warnings: warnings.map((warning) => ({ ...warning, path })),
  };
}

/**
 * The one problem for a derived surface whose colors still fail after derivation.
 *
 * @param name - The surface name.
 * @param source - The brand fields it was derived from.
 * @param failing - Its failing pairs.
 */
export function derivedSurfaceProblem(
  name: string,
  source: string,
  failing: readonly PairResult[],
): BrandProblem {
  const shown = failing.slice(0, DERIVED_PAIRS_SHOWN).map((result) => result.measured);
  const more = failing.length - shown.length;
  const rest = more > 0 ? `; and ${more} more` : '';
  return {
    path: `color.surfaces.${name}`,
    message:
      `The brand does not define the ${name} surface, and the one derived from ${source} ` +
      `fails: ${shown.join('; ')}${rest}.`,
    fix: `Define \`color.surfaces.${name}\` with roles that pass, or change ${source}.`,
  };
}

/**
 * The waiver that covers a role pair on a surface: one naming the same roles and either this
 * surface or no surface.
 *
 * @param brand - The decoded brand.
 * @param surface - The surface name.
 * @param pair - The role pair.
 * @returns The first matching waiver, or `undefined` when none applies.
 */
function findWaiver(brand: Brand, surface: string, pair: Pair): ContrastWaiver | undefined {
  return (brand.color.waivers ?? []).find(
    (waiver) =>
      waiver.color === pair.color &&
      waiver.on === pair.on &&
      (waiver.surface === undefined || waiver.surface === surface),
  );
}

/**
 * The opaque colors a role pair's background can take on a surface: the backdrop and the mesh
 * samples for `bg`, else the role painted over each of them.
 *
 * @param surface - The surface's roles and backdrop.
 * @param role - The role the pair sits on.
 * @param samples - The colors the surface's mesh shows, sampled.
 */
function backgroundsFor(surface: SurfaceColors, role: Role, samples: readonly Rgba[]): Rgba[] {
  const backdrop = [...surface.backdrop.map(fromHex), ...samples];
  if (role === 'bg') {
    return backdrop;
  }

  const layer = fromHex(surface.roles[role]);
  return backdrop.map((color) => compositeOver(layer, color));
}

/**
 * Where a code or diagram token's color comes from on a surface: the surface's own override, the
 * brand-wide override, or neither when it is derived.
 *
 * @param brand - The decoded brand.
 * @param surface - The surface name.
 * @param section - `code` or `diagram`.
 * @param token - The token.
 * @returns The field path of the override in effect, or `undefined` for a derived token.
 */
function overridePath(
  brand: Brand,
  surface: string,
  section: 'code' | 'diagram',
  token: CodeToken | DiagramToken,
): string | undefined {
  const own: Readonly<Record<string, string | undefined>> | undefined =
    brand.color.surfaces[surface]?.[section];
  if (own?.[token] !== undefined) {
    return `color.surfaces.${surface}.${section}.${token}`;
  }

  const shared: Readonly<Record<string, string | undefined>> | undefined = brand[section];
  return shared?.[token] === undefined ? undefined : `${section}.${token}`;
}

/**
 * The code tokens that are backgrounds of the code area or of a line, not text colors.
 */
const CODE_LINE_TOKENS: ReadonlySet<CodeToken> = new Set([
  'background',
  'highlight',
  'added',
  'removed',
]);

/**
 * Checks the code theme on one surface: each text token against the code background when either one
 * is overridden, and the code text on the highlighted line always.
 *
 * @param brand - The decoded brand, to tell overridden tokens from derived ones.
 * @param surface - The resolved surface.
 */
function checkCode(brand: Brand, surface: SurfaceTokens): BrandProblem[] {
  const { code } = surface;
  const background = fromHex(code.background);
  const backgroundPath = overridePath(brand, surface.name, 'code', 'background');
  const textTokens = CODE_TOKENS.filter((token) => !CODE_LINE_TOKENS.has(token));
  const problems = textTokens.flatMap((token) => {
    const path = overridePath(brand, surface.name, 'code', token) ?? backgroundPath;
    if (path === undefined) {
      return [];
    }

    return checkThemePair({
      label: `code ${token}`,
      path,
      surface: surface.name,
      color: code[token],
      backgrounds: [background],
      minimum: TEXT_CONTRAST,
    });
  });
  return [
    ...problems,
    ...checkLineHighlight(brand, surface),
    ...checkDiffLines(brand, surface).errors,
  ];
}

/**
 * The two tints of changed code lines, in the order their messages list them.
 */
type DiffToken = 'added' | 'removed';

/**
 * The diff tints, checked in this order.
 */
const DIFF_TOKENS: readonly DiffToken[] = ['added', 'removed'];

/**
 * Checks the tints of added and removed code lines on one surface: the code text reads on each
 * (4.5:1), and each stands apart from the code background and from the other, so a diff keeps its
 * meaning on every surface, a saturated gradient included.
 *
 * Derived tints meet all three by construction (`diffTints`), so only a tint the brand sets can
 * fail here, and the problem names that field. The one exception is a code text color that reads on
 * so few colors near the code background that no two tints exist; that is reported once, at the
 * code colors, not at tints the author never wrote.
 *
 * @param brand - The decoded brand, for the path of an overridden tint.
 * @param surface - The resolved surface.
 */
function checkDiffLines(
  brand: Brand,
  surface: SurfaceTokens,
): { errors: BrandProblem[]; warnings: BrandProblem[] } {
  const { code } = surface;
  const overridden = {
    added: overridePath(brand, surface.name, 'code', 'added'),
    removed: overridePath(brand, surface.name, 'code', 'removed'),
  };
  /**
   * The field to name for a tint: its override, else the surface's code section.
   */
  const pathOf = (token: DiffToken): string =>
    overridden[token] ?? `color.surfaces.${surface.name}.code.${token}`;
  const errors: BrandProblem[] = [];
  const warnings: BrandProblem[] = [];
  for (const token of DIFF_TOKENS) {
    errors.push(...checkTintText(surface, token, pathOf(token)));
    warnings.push(...checkTintBackground(surface, token, pathOf(token)));
  }

  if (oklabDistance(fromHex(code.added), fromHex(code.removed)) < DIFF_TINT_MIN_DISTANCE) {
    const pairToken: DiffToken =
      overridden.added === undefined && overridden.removed !== undefined ? 'removed' : 'added';
    warnings.push({
      path: pathOf(pairToken),
      message:
        `On the ${surface.name} surface, added lines (${code.added}) and removed lines ` +
        `(${code.removed}) are tinted almost alike, so a diff loses its meaning.`,
      fix: 'Override the two tints with colors further apart, or leave both out to derive them.',
    });
  }

  if (overridden.added !== undefined || overridden.removed !== undefined) {
    return { errors, warnings };
  }

  if (errors.length === 0 && warnings.length === 0) {
    return { errors, warnings };
  }

  return { errors: [], warnings: [derivedDiffWarning(brand, surface)] };
}

/**
 * The code text must read on one added or removed line tint (4.5:1).
 *
 * @param surface - The resolved surface.
 * @param token - Which tint is checked.
 * @param path - The field the problem names.
 * @returns Nothing when the text reads on the tint, else one problem.
 */
function checkTintText(surface: SurfaceTokens, token: DiffToken, path: string): BrandProblem[] {
  const { code } = surface;
  const ratio = contrastRatio(fromHex(code.foreground), fromHex(code[token]));
  if (ratio >= TEXT_CONTRAST) {
    return [];
  }

  return [
    {
      path,
      message:
        `On the ${surface.name} surface, code foreground ${code.foreground} on an ${token} ` +
        `line ${code[token]} has contrast ${formatRatio(ratio)}; it needs ${TEXT_CONTRAST}:1.`,
      fix: `Use a lighter or darker ${token} tint, or leave it out to derive one.`,
    },
  ];
}

/**
 * A line tint must stand apart from the code background, or a changed line does not show.
 *
 * @param surface - The resolved surface.
 * @param token - Which tint is checked.
 * @param path - The field the problem names.
 * @returns Nothing when the tint is far enough from the background, else one warning.
 */
function checkTintBackground(
  surface: SurfaceTokens,
  token: DiffToken,
  path: string,
): BrandProblem[] {
  const { code } = surface;
  const distance = oklabDistance(fromHex(code[token]), fromHex(code.background));
  if (distance >= DIFF_TINT_MIN_DISTANCE) {
    return [];
  }

  return [
    {
      path,
      message:
        `On the ${surface.name} surface, the ${token} line tint ${code[token]} is too close to ` +
        `the code background ${code.background} to show that the line changed.`,
      fix:
        `Give the ${token} tint more of the ${token === 'added' ? 'positive' : 'negative'} ` +
        'hue, or leave it out to derive one.',
    },
  ];
}

/**
 * The warning for a derived surface whose code text leaves no room for the diff tints. It names the
 * code colors, since the author never wrote the tints.
 *
 * @param brand - The decoded brand, for the path of an overridden code color.
 * @param surface - The resolved surface.
 */
function derivedDiffWarning(brand: Brand, surface: SurfaceTokens): BrandProblem {
  const { code } = surface;
  const codePath =
    overridePath(brand, surface.name, 'code', 'foreground') ??
    overridePath(brand, surface.name, 'code', 'background') ??
    `color.surfaces.${surface.name}.code`;
  return {
    path: codePath,
    message:
      `On the ${surface.name} surface, the code text ${code.foreground} reads on so few ` +
      `colors near the code background ${code.background} that no added and removed line ` +
      'tints stand apart from it and from each other.',
    fix:
      'Give the code text more contrast with the code background (a darker or lighter ' +
      '`code.foreground` or `code.background`), or set `code.added` and `code.removed`.',
  };
}

/**
 * Code text must stay readable on a highlighted line; the fix moves the line's color.
 */
function checkLineHighlight(brand: Brand, surface: SurfaceTokens): BrandProblem[] {
  const { code } = surface;
  const highlight = fromHex(code.highlight);
  const foreground = fromHex(code.foreground);
  const ratio = contrastRatio(foreground, highlight);
  if (ratio >= TEXT_CONTRAST) {
    return [];
  }

  const path =
    overridePath(brand, surface.name, 'code', 'highlight') ??
    overridePath(brand, surface.name, 'code', 'foreground') ??
    `color.surfaces.${surface.name}.code.highlight`;
  const suggestion = formatHex(
    ensureContrastOnAll(highlight, [compositeOver(foreground, highlight)], TEXT_CONTRAST),
  );
  return [
    {
      path,
      message:
        `On the ${surface.name} surface, code foreground ${code.foreground} on the highlighted ` +
        `line ${code.highlight} has contrast ${formatRatio(ratio)}; it needs ${TEXT_CONTRAST}:1.`,
      fix: `Use a highlight with more contrast against the code text, such as "${suggestion}".`,
    },
  ];
}

/**
 * A diagram color pair: the text or mark token, what it sits on, and its minimum.
 */
type DiagramPair = {
  /**
   * The token that carries the text or mark.
   */
  token: DiagramToken;

  /**
   * The fill it sits on, or `undefined` for the slide's backdrop.
   */
  on: DiagramToken | undefined;

  /**
   * The lowest WCAG contrast ratio that passes.
   */
  minimum: number;
};

/**
 * The diagram pairs that carry text or marks: node and highlight text on their fills and labels at
 * 4.5:1, edges and packets on the backdrop at 3:1.
 */
const DIAGRAM_PAIRS: readonly DiagramPair[] = [
  { token: 'node-text', on: 'node', minimum: TEXT_CONTRAST },
  { token: 'highlight-text', on: 'highlight', minimum: TEXT_CONTRAST },
  { token: 'label', on: undefined, minimum: TEXT_CONTRAST },
  { token: 'edge', on: undefined, minimum: GRAPHIC_CONTRAST },
  { token: 'packet', on: undefined, minimum: GRAPHIC_CONTRAST },
];

/**
 * Checks the diagram pairs on one surface that involve an overridden token, with each fill painted
 * over every backdrop color first.
 *
 * @param brand - The decoded brand.
 * @param surface - The resolved surface.
 * @returns Nothing when the brand overrides no diagram token in these pairs.
 */
function checkDiagram(brand: Brand, surface: SurfaceTokens): BrandProblem[] {
  const { diagram } = surface;
  const backdrop = surface.backdrop.map(fromHex);
  return DIAGRAM_PAIRS.flatMap((pair) => {
    const path =
      overridePath(brand, surface.name, 'diagram', pair.token) ??
      (pair.on === undefined ? undefined : overridePath(brand, surface.name, 'diagram', pair.on));
    if (path === undefined) {
      return [];
    }

    return checkThemePair({
      label: `diagram ${pair.token}`,
      path,
      surface: surface.name,
      color: diagram[pair.token],
      backgrounds: pair.on === undefined ? backdrop : paintOver(diagram[pair.on], backdrop),
      minimum: pair.minimum,
    });
  });
}

/**
 * A code or diagram theme color and the opaque colors it may sit on.
 */
type ThemePair = {
  /**
   * The token as named in messages, such as `code keyword`.
   */
  label: string;

  /**
   * The brand field that sets the token, such as `code.keyword`.
   */
  path: string;

  /**
   * The surface name, for the message.
   */
  surface: string;

  /**
   * The token's color.
   */
  color: Hex;

  /**
   * The opaque colors behind it.
   */
  backgrounds: readonly Rgba[];

  /**
   * The lowest WCAG contrast ratio that passes.
   */
  minimum: number;
};

/**
 * Checks one theme color against the worst of its backgrounds. When the color comes from a
 * brand-wide override, the fix says how to keep it elsewhere and replace it on this surface only.
 *
 * @param pair - The color, its backgrounds and its minimum.
 * @returns Nothing when it passes, else one problem whose fix suggests a passing color.
 */
function checkThemePair(pair: ThemePair): BrandProblem[] {
  const color = fromHex(pair.color);
  const ratio = worstContrast(color, pair.backgrounds);
  if (ratio >= pair.minimum) {
    return [];
  }

  const worst = [...pair.backgrounds].sort(
    (a, b) => contrastRatio(color, a) - contrastRatio(color, b),
  )[0];
  const suggestion = formatHex(ensureContrastOnAll(color, pair.backgrounds, pair.minimum));
  const token = pair.path.split('.').slice(-2).join('.');
  const local = `color.surfaces.${pair.surface}.${token}`;
  const scope = pair.path === local ? '' : ` on this surface (set it as ${local})`;
  return [
    {
      path: pair.path,
      message:
        `On the ${pair.surface} surface, ${pair.label} ${pair.color} on ` +
        `${worst === undefined ? 'its background' : formatHex(worst)} has contrast ` +
        `${formatRatio(ratio)}; it needs ${pair.minimum}:1.`,
      fix: `Use a color with more contrast${scope}, such as "${suggestion}".`,
    },
  ];
}

/**
 * What {@link contrastFix} needs to suggest a passing color.
 */
type ContrastFixInput = {
  /**
   * The role that falls short.
   */
  role: Role;

  /**
   * Its current color.
   */
  color: Rgba;

  /**
   * Every opaque color it may sit on.
   */
  backgrounds: readonly Rgba[];

  /**
   * The lowest WCAG contrast ratio that passes.
   */
  minimum: number;

  /**
   * The path of the background role, the other thing the author could change.
   */
  other: string;
};

/**
 * Suggests a color for the role that passes on every background, when one exists.
 */
function contrastFix(input: ContrastFixInput): string {
  const candidate = ensureContrastOnAll(input.color, input.backgrounds, input.minimum);
  if (worstContrast(candidate, input.backgrounds) < input.minimum) {
    return `No single ${input.role} color passes on every background; change ${input.other}.`;
  }

  const suggestion = formatHex(candidate);
  return `Change ${input.role} to a color such as "${suggestion}", or change ${input.other}.`;
}

/**
 * The field that sets a role on a surface: the surface's override, or the base role.
 */
function rolePath(brand: Brand, surface: string, role: Role): string {
  const spec = brand.color.surfaces[surface];
  if (role === 'bg' && spec?.gradient !== undefined && spec.bg === undefined) {
    return `gradients.${spec.gradient}`;
  }

  return spec?.[role] === undefined ? `color.roles.${role}` : `color.surfaces.${surface}.${role}`;
}

/**
 * A contrast ratio as authors read it, to two decimals: `3.92:1`.
 *
 * @param ratio - The ratio, 1 or more.
 */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}
