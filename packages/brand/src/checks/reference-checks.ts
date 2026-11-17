import type { BackgroundLayer } from '#schema/background-schema.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { Corner } from '#schema/primitives.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { ROLE_PAIRS } from '#checks/contrast-checks.ts';
import { TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { checkDiagramNames } from '#checks/diagram-checks.ts';
import { ROLE_NAMES } from '#schema/color-schema.ts';
import { PLAIN_TREATMENT, withPlainTreatment } from '#schema/identity-schema.ts';
import {
  FAMILY_ROLES,
  GENERIC_FAMILIES,
  TYPE_STEPS,
  type FontFamily,
} from '#schema/typography-schema.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * Fewest categorical colors a chart palette needs; fewer cannot tell three series apart.
 */
export const MIN_CATEGORICAL_COLORS = 3;

/**
 * Most categorical colors; beyond this, charts should highlight one series instead.
 */
export const MAX_CATEGORICAL_COLORS = 12;

/**
 * Fewest steps in a sequential or diverging palette.
 */
export const MIN_RAMP_COLORS = 3;

/**
 * Color names that Tailwind classes such as `bg-<name>-500` share with roles, type steps and data
 * palettes; a palette with one of these names would make `text-<name>` ambiguous.
 */
const RESERVED_PALETTE_NAMES = new Set<string>([
  ...ROLE_NAMES,
  ...TYPE_STEPS,
  'data',
  'sequential',
  'diverging',
  'context',
  'code',
  'diagram',
]);

/**
 * Fontsource's variable packages share this scope; every other Fontsource package is static.
 */
const VARIABLE_FONTSOURCE_PREFIX = '@fontsource-variable/';

/**
 * How messages name a logo variant, shared by the surface and default checks.
 */
const LOGO_VARIANT = 'logo variant';

/**
 * Checks that the names a brand uses refer to things it defines: required surfaces, gradients and
 * logo variants named by surfaces, defaults, the transition's easing and duration, and font weights
 * the font sources can supply, and the kinds, cards and families the `diagram` section names. Also
 * catches palette names that collide with Tailwind class names and chrome elements placed in the
 * same corner.
 *
 * @param brand - The decoded brand.
 * @returns Every problem found; empty when all references resolve.
 */
export function checkReferences(brand: Brand): BrandProblem[] {
  return [
    ...checkSurfaces(brand),
    ...checkDefaults(brand),
    ...checkPaletteNames(brand),
    ...checkFamilies(brand),
    ...checkChromeCorners(brand),
    ...checkDataLengths(brand),
    ...checkWaivers(brand),
    ...checkDiagramNames(brand),
  ];
}

/**
 * A waiver must name a 4.5:1 pair the checks know, on a surface the brand has.
 */
function checkWaivers(brand: Brand): BrandProblem[] {
  const waivable = ROLE_PAIRS.filter((pair) => pair.minimum === TEXT_CONTRAST);
  const pairs = waivable.map((pair) => `${pair.color} on ${pair.on}`);
  return (brand.color.waivers ?? []).flatMap((waiver, index) => {
    const path = `color.waivers[${index}]`;
    const known = waivable.some((pair) => pair.color === waiver.color && pair.on === waiver.on);
    const pairProblems = known
      ? []
      : [
          {
            path,
            message: `${waiver.color} on ${waiver.on} is not a pair that needs 4.5:1.`,
            fix: `Waive one of: ${pairs.join(', ')}.`,
          },
        ];
    return [
      ...pairProblems,
      ...checkName(waiver.surface, Object.keys(brand.color.surfaces), {
        path: `${path}.surface`,
        what: 'surface',
      }),
    ];
  });
}

/**
 * The gradient surface must name a gradient, and every surface's gradient and logo must exist.
 *
 * @param brand - The decoded brand.
 */
function checkSurfaces(brand: Brand): BrandProblem[] {
  const { surfaces } = brand.color;
  const gradientSurface =
    surfaces.gradient !== undefined && surfaces.gradient.gradient === undefined
      ? [
          {
            path: 'color.surfaces.gradient.gradient',
            message: 'The gradient surface does not name a gradient.',
            fix: `Set \`gradient\` to one of the brand's gradients: ${gradientNames(brand)}.`,
          },
        ]
      : [];
  const references = Object.entries(surfaces).flatMap(([name, surface]) => [
    ...checkName(surface.gradient, Object.keys(brand.gradients), {
      path: `color.surfaces.${name}.gradient`,
      what: 'gradient',
    }),
    ...(hasLogo(brand)
      ? checkName(surface.logo, Object.keys(brand.logo.variants), {
          path: `color.surfaces.${name}.logo`,
          what: LOGO_VARIANT,
        })
      : []),
    ...(surface.background ?? []).flatMap((layer, index) =>
      checkLayerNames(brand, layer, `color.surfaces.${name}.background[${index}]`),
    ),
  ]);
  return [...gradientSurface, ...references];
}

/**
 * A background layer's gradient and treatment must exist.
 *
 * @param brand - The decoded brand.
 * @param layer - The layer as written.
 * @param path - The layer's path, such as `color.surfaces.photo.background[0]`.
 */
function checkLayerNames(brand: Brand, layer: BackgroundLayer, path: string): BrandProblem[] {
  if (layer.type === 'gradient') {
    return checkName(layer.gradient, Object.keys(brand.gradients), {
      path: `${path}.gradient`,
      what: 'gradient',
    });
  }

  if (layer.type === 'image') {
    return checkName(layer.treatment, treatmentNames(brand), {
      path: `${path}.treatment`,
      what: 'image treatment',
    });
  }

  return [];
}

/**
 * Whether the brand has a logo: at least one variant with a file. A brand without one writes
 * `logo.variants: {}` and `chrome.logo.show: false`, and no logo is drawn anywhere.
 *
 * @param brand - The decoded brand.
 */
function hasLogo(brand: Brand): boolean {
  return Object.keys(brand.logo.variants).length > 0;
}

/**
 * A brand with no logo variant that still asks the chrome to show its logo.
 *
 * @param brand - The decoded brand.
 */
function missingLogo(brand: Brand): BrandProblem[] {
  if (!brand.chrome.logo.show) {
    return [];
  }

  return [
    {
      path: 'chrome.logo.show',
      message: 'The chrome shows the logo, but `logo.variants` has none.',
      fix:
        'Add the logo under `logo.variants` (an SVG or PNG in the brand folder), or set ' +
        '`chrome.logo.show: false` for a brand without one; no placeholder is drawn.',
    },
  ];
}

/**
 * The brand's gradient names for a fix, or a hint to add one when it has none.
 *
 * @param brand - The decoded brand.
 */
function gradientNames(brand: Brand): string {
  const names = Object.keys(brand.gradients);
  return names.length === 0
    ? 'none are defined yet, so add one under `gradients`'
    : names.join(', ');
}

/**
 * The default logo variant and image treatment, and the transition's duration and easing, must name
 * entries the brand defines.
 *
 * @param brand - The decoded brand.
 */
function checkDefaults(brand: Brand): BrandProblem[] {
  const { motion } = brand;
  return [
    ...(hasLogo(brand)
      ? checkName(brand.logo.default, Object.keys(brand.logo.variants), {
          path: 'logo.default',
          what: LOGO_VARIANT,
        })
      : missingLogo(brand)),
    ...checkName(brand.imagery.default, treatmentNames(brand), {
      path: 'imagery.default',
      what: 'image treatment',
    }),
    ...checkPlainTreatment(brand),
    ...checkName(motion.transition.duration, Object.keys(motion.durations), {
      path: 'motion.transition.duration',
      what: 'duration',
    }),
    ...checkName(motion.transition.easing, Object.keys(motion.easings), {
      path: 'motion.transition.easing',
      what: 'easing',
    }),
  ];
}

/**
 * The names of a brand's image treatments, with the `plain` one every brand has.
 *
 * @param brand - The decoded brand.
 */
function treatmentNames(brand: Brand): string[] {
  return Object.keys(withPlainTreatment(brand.imagery.treatments, { type: 'none' }));
}

/**
 * A brand that defines `plain` must define it as no treatment, since slides name it to show a
 * picture as it is in every brand.
 *
 * @param brand - The decoded brand.
 */
function checkPlainTreatment(brand: Brand): BrandProblem[] {
  const plain = brand.imagery.treatments[PLAIN_TREATMENT];
  if (plain === undefined || plain.type === 'none') {
    return [];
  }

  return [
    {
      path: `imagery.treatments.${PLAIN_TREATMENT}`,
      message:
        `"${PLAIN_TREATMENT}" is the treatment every brand has for a picture drawn as it is, so ` +
        `it cannot be a ${plain.type} treatment.`,
      fix:
        `Give this treatment another name, such as "soft", and leave "${PLAIN_TREATMENT}" out ` +
        "(every brand has it) or define it as `{ type: 'none' }`.",
    },
  ];
}

/**
 * Palette names become Tailwind class names, so they must not reuse a role, type step or data
 * palette name.
 *
 * @param brand - The decoded brand.
 */
function checkPaletteNames(brand: Brand): BrandProblem[] {
  return Object.keys(brand.color.palette)
    .filter((name) => RESERVED_PALETTE_NAMES.has(name))
    .map((name) => ({
      path: `color.palette.${name}`,
      message:
        `"${name}" is also a role, type step or data palette name, so its classes would ` +
        'clash.',
      fix: `Rename the palette, for example to "${name}-scale" or a color word such as "ink".`,
    }));
}

/**
 * Checks each family's fallback list and font source, and that every type step's weight and style,
 * and every diagram card's title weight, is one its family loads.
 *
 * @param brand - The decoded brand.
 */
function checkFamilies(brand: Brand): BrandProblem[] {
  const { families, scale } = brand.typography;
  const fallbacks = FAMILY_ROLES.flatMap((role) => checkFallback(role, families[role]));
  const weights = TYPE_STEPS.flatMap((step) => {
    const spec = scale[step];
    const family = families[spec.family];
    return checkWeight(family, {
      weight: spec.weight,
      style: spec.style ?? 'normal',
      path: `typography.scale.${step}.weight`,
    });
  });
  const sources = FAMILY_ROLES.flatMap((role) => checkSourceShape(role, families[role]));
  return [...fallbacks, ...sources, ...weights, ...checkCardTitleWeights(brand)];
}

/**
 * Each diagram card's title weight must be one its title family loads, after the card inherits its
 * title from the brand's `default` card and the `title` step. A card whose own entry writes neither
 * a title family nor a weight sets the title its `default` card (or the `title` step) does, which
 * is checked there; a title family that does not exist is reported by the diagram name checks.
 *
 * @param brand - The decoded brand.
 */
function checkCardTitleWeights(brand: Brand): BrandProblem[] {
  const cards = brand.diagram?.cards ?? {};
  const inherited = cards['default']?.title ?? {};
  const step = brand.typography.scale.title;
  return Object.entries(cards).flatMap(([name, card]) => {
    const own = card.title ?? {};
    if (own.family === undefined && own.weight === undefined) {
      return [];
    }

    const title = { ...inherited, ...own };
    const role = FAMILY_ROLES.find((candidate) => candidate === (title.family ?? step.family));
    if (role === undefined) {
      return [];
    }

    const field = own.weight === undefined ? 'family' : 'weight';
    return checkWeight(brand.typography.families[role], {
      weight: title.weight ?? step.weight,
      style: 'normal',
      path: `diagram.cards.${name}.title.${field}`,
    });
  });
}

/**
 * A fallback list must end in a generic family, so text never renders in the browser default.
 *
 * @param role - The family role, for the field path.
 * @param family - The family.
 */
function checkFallback(role: string, family: FontFamily): BrandProblem[] {
  const last = family.fallback.at(-1);
  if (last !== undefined && GENERIC_FAMILIES.has(last)) {
    return [];
  }

  return [
    {
      path: `typography.families.${role}.fallback`,
      message: 'The fallback list does not end in a generic family.',
      fix:
        'End it with a generic family, for example ' +
        '`["ui-sans-serif", "system-ui", "sans-serif"]`.',
    },
  ];
}

/**
 * A Fontsource source must match its package kind: a variable package takes no `weights`, a static
 * one needs at least one weight and takes no `axes`. Other sources pass.
 *
 * @param role - The family role, for the field path.
 * @param family - The family.
 * @returns At most one problem.
 */
function checkSourceShape(role: string, family: FontFamily): BrandProblem[] {
  const { source } = family;
  if (source.kind !== 'fontsource') {
    return [];
  }

  const path = `typography.families.${role}.source`;
  const isVariable = source.package.startsWith(VARIABLE_FONTSOURCE_PREFIX);
  if (isVariable && source.weights !== undefined) {
    return [
      {
        path: `${path}.weights`,
        message: `${source.package} is a variable font, so it has every weight already.`,
        fix: 'Remove `weights`; use `axes` to pick a file set such as "wght" or "full".',
      },
    ];
  }

  if (!isVariable && (source.weights === undefined || source.weights.length === 0)) {
    return [
      {
        path: `${path}.weights`,
        message: `${source.package} is a static font, so it needs the weights to load.`,
        fix: 'List the weights the type scale uses, for example `weights: [400, 600]`.',
      },
    ];
  }

  return !isVariable && source.axes !== undefined
    ? [
        {
          path: `${path}.axes`,
          message: `${source.package} is a static font and has no variable axes.`,
          fix: 'Remove `axes`, or switch to the @fontsource-variable package.',
        },
      ]
    : [];
}

/**
 * A weight and style set in a family must be loadable, or the browser fakes bold and italic.
 *
 * @param family - The family the text is set in.
 * @param set - The weight and style, and the field to report a problem at.
 */
function checkWeight(
  family: FontFamily,
  set: { weight: number; style: 'normal' | 'italic'; path: string },
): BrandProblem[] {
  const { weight, style } = set;
  const available = availableFaces(family);
  if (available === undefined) {
    return [];
  }

  const covered = available.some(
    (face) => face.style === style && weight >= face.weights[0] && weight <= face.weights[1],
  );
  if (covered) {
    return [];
  }

  return [
    {
      path: set.path,
      message:
        `Weight ${weight} (${style}) is not loaded for ${family.family}, so the browser would ` +
        'fake it.',
      fix: "Load that weight and style in the family's source, or pick a loaded weight.",
    },
  ];
}

/**
 * One style a source loads and the weights it covers.
 */
type AvailableFace = {
  /**
   * The font style of the files.
   */
  style: 'normal' | 'italic';

  /**
   * The lowest and highest weight covered; equal for a static file.
   */
  weights: readonly [number, number];
};

/**
 * The weights and styles a source loads; `undefined` when it cannot be known without the files.
 */
function availableFaces(family: FontFamily): AvailableFace[] | undefined {
  const { source } = family;
  switch (source.kind) {
    case 'system':
    case 'unavailable': {
      return undefined;
    }

    case 'files': {
      return source.files.map((file) => ({
        style: file.style ?? 'normal',
        weights: typeof file.weight === 'number' ? [file.weight, file.weight] : file.weight,
      }));
    }

    case 'fontsource': {
      if (source.package.startsWith(VARIABLE_FONTSOURCE_PREFIX)) {
        return undefined;
      }

      const styles = source.styles ?? ['normal'];
      return styles.flatMap((style) =>
        (source.weights ?? []).map((weight) => ({ style, weights: [weight, weight] as const })),
      );
    }
  }
}

/**
 * The page number, footer and logo that are shown must each sit in their own corner.
 *
 * @param brand - The decoded brand.
 * @returns One problem per element that shares a corner with an earlier one.
 */
function checkChromeCorners(brand: Brand): BrandProblem[] {
  const { chrome, logo } = brand;
  const placed: { name: string; corner: Corner; path: string }[] = [
    ...(chrome.pageNumber.show
      ? [
          {
            name: 'page number',
            corner: chrome.pageNumber.corner,
            path: 'chrome.pageNumber.corner',
          },
        ]
      : []),
    ...(chrome.footer.show
      ? [{ name: 'footer', corner: chrome.footer.corner, path: 'chrome.footer.corner' }]
      : []),
    ...(chrome.logo.show
      ? [{ name: 'logo', corner: logo.placement.corner, path: 'logo.placement.corner' }]
      : []),
  ];
  return placed.flatMap((item, index) => {
    const earlier = placed.slice(0, index).find((other) => other.corner === item.corner);
    if (earlier === undefined) {
      return [];
    }

    return [
      {
        path: item.path,
        message: `The ${item.name} and the ${earlier.name} are both placed ${item.corner}.`,
        fix: 'Give each chrome element its own corner, or hide one of them.',
      },
    ];
  });
}

/**
 * The categorical palette must have a usable number of colors, the sequential at least the ramp
 * minimum, and the diverging an odd number of at least that many, so it has one midpoint. The same
 * holds for each list a surface replaces.
 *
 * @param brand - The decoded brand.
 */
function checkDataLengths(brand: Brand): BrandProblem[] {
  return [
    ...checkPaletteLengths(brand.color.data, 'color.data'),
    ...Object.entries(brand.color.surfaces).flatMap(([name, surface]) =>
      checkPaletteLengths(surface.data ?? {}, `color.surfaces.${name}.data`),
    ),
  ];
}

/**
 * The palettes whose lengths {@link checkPaletteLengths} checks; a surface may leave any out.
 */
type DataLists = {
  /**
   * Series colors, the most used first.
   */
  readonly categorical?: readonly string[] | undefined;

  /**
   * A ramp from low to high.
   */
  readonly sequential?: readonly string[] | undefined;

  /**
   * A ramp through a neutral midpoint.
   */
  readonly diverging?: readonly string[] | undefined;
};

/**
 * Checks the length of each palette given: the brand's own lists, or the lists a surface replaces,
 * which charts on that surface use instead and so need the same counts.
 *
 * @param data - The lists; one left out is not checked.
 * @param path - Where the lists live, such as `color.data` or `color.surfaces.inverse.data`.
 */
function checkPaletteLengths(data: DataLists, path: string): BrandProblem[] {
  const { categorical, sequential, diverging } = data;
  const problems: BrandProblem[] = [];
  if (
    categorical !== undefined &&
    (categorical.length < MIN_CATEGORICAL_COLORS || categorical.length > MAX_CATEGORICAL_COLORS)
  ) {
    problems.push({
      path: `${path}.categorical`,
      message: `Has ${categorical.length} colors.`,
      fix:
        `List ${MIN_CATEGORICAL_COLORS} to ${MAX_CATEGORICAL_COLORS} colors, ` +
        'the most used first.',
    });
  }

  if (sequential !== undefined && sequential.length < MIN_RAMP_COLORS) {
    problems.push({
      path: `${path}.sequential`,
      message: `Has ${sequential.length} colors.`,
      fix: `List at least ${MIN_RAMP_COLORS} colors from low to high.`,
    });
  }

  if (
    diverging !== undefined &&
    (diverging.length < MIN_RAMP_COLORS || diverging.length % 2 === 0)
  ) {
    problems.push({
      path: `${path}.diverging`,
      message: `Has ${diverging.length} colors; a diverging palette needs a single midpoint.`,
      fix: 'List an odd number of colors, at least 3, with the neutral midpoint in the middle.',
    });
  }

  return problems;
}

/**
 * A name a field refers to must be one of the known names; the fix suggests the closest one.
 *
 * @param name - The name used, or `undefined` when the field is left out, which passes.
 * @param known - The names that exist.
 * @param where - The field path and what the name identifies, for the message.
 */
function checkName(
  name: string | undefined,
  known: readonly string[],
  where: { path: string; what: string },
): BrandProblem[] {
  if (name === undefined || known.includes(name)) {
    return [];
  }

  return [
    {
      path: where.path,
      message: `There is no ${where.what} named "${name}".`,
      fix: pickFrom(name, known, where.what),
    },
  ];
}
