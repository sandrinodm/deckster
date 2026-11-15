import type { DerivedSurfaces } from '#checks/contrast-checks.ts';
import type { BrandTokens, DataTokens, Hex, SurfaceTokens } from '#resolve/brand-tokens.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { GRAPHIC_CONTRAST } from '#checks/contrast-thresholds.ts';
import {
  closeness,
  COMFORTABLE_ADJACENT_DELTA_E,
  CONTEXT_CONTRAST,
  CONTEXT_CONTRAST_RANGE,
  describeCloseness,
  MIN_ADJACENT_DELTA_E,
  MIN_ADJACENT_DELTA_E_CVD,
  MIN_DIVERGING_ENDS_DELTA_E,
} from '#checks/data-thresholds.ts';
import { deltaE, lightness, simulateColorVision } from '#color/color-vision.ts';
import { formatHex, fromHex, type Rgba } from '#color/color.ts';
import { contrastRatio, ensureContrast } from '#color/contrast.ts';
import { DEFAULT_SURFACE } from '#schema/color-schema.ts';

/**
 * A problem path inside one of the brand's lists, capturing the list's name.
 */
const BRAND_LIST_PATH_PATTERN = /^color\.data\.(\w+).*$/;

/**
 * The deficiencies under which a diverging palette's two ends must stay apart.
 */
const RED_GREEN_DEFICIENCIES = ['protanopia', 'deuteranopia'] as const;

/**
 * The data lists a surface carries.
 */
type ListName = keyof DataTokens;

/**
 * Data palette failures, and neighbours that pass but are closer than is comfortable.
 */
export type DataPaletteResult = {
  /**
   * Problems that fail the build.
   */
  errors: BrandProblem[];

  /**
   * Neighbours that are distinguishable but closer than is comfortable; reported only.
   */
  warnings: BrandProblem[];
};

/**
 * Where a surface's list comes from: the surface's own list, the brand's list as written, or the
 * brand's list adjusted in lightness for the surface's chart plate.
 */
type Provenance = 'own' | 'brand' | 'fitted';

/**
 * Checks the data palettes on every surface, against the chart plate charts draw there (which is
 * the background on a solid surface whose text reaches 10:1 on it).
 *
 * Categorical colors reach 3:1 (WCAG 1.4.11 for marks) and neighbours stay distinguishable with
 * normal vision and under simulated protanopia, deuteranopia and tritanopia; sequential palettes
 * change lightness in one direction; diverging palettes move away from the midpoint on both sides
 * and keep their ends apart under red-green deficiencies; the context color is visible but quieter
 * than any series.
 *
 * The brand's own lists are checked once, on the default surface, at `color.data.*`. On every other
 * surface a list the surface writes is checked at `color.surfaces.<name>.data.*`, and a brand list
 * that was adjusted for the surface (see `fitCategorical`) is checked there too, reported as
 * adjusted so the author knows to write that surface's list. Adjusted lists are not checked while
 * the brand's own list fails, which would only repeat the problem.
 *
 * @param brand - The decoded brand with its surfaces completed, to see which surfaces write which
 *   lists.
 * @param tokens - The resolved tokens.
 * @param derived - The derived surfaces, which the messages call derived.
 * @returns Errors, and warnings for neighbours between the failing and comfortable distances.
 */
export function checkDataPalettes(
  brand: Brand,
  tokens: BrandTokens,
  derived: DerivedSurfaces = new Map(),
): DataPaletteResult {
  const base = tokens.surfaces[DEFAULT_SURFACE];
  const own = base === undefined ? emptyResult() : checkBrandLists(brand, tokens.data, base);
  const failing = new Set(
    own.errors.map((problem) => problem.path.replace(BRAND_LIST_PATH_PATTERN, '$1')),
  );
  const surfaces = Object.values(tokens.surfaces).filter((surface) => surface !== base);
  const results = [
    own,
    ...surfaces.map((surface) =>
      checkSurfaceLists({ brand, data: tokens.data, surface, derived, failing }),
    ),
  ];
  return {
    errors: results.flatMap((result) => result.errors),
    warnings: [
      ...results.flatMap((result) => result.warnings),
      ...Object.values(tokens.surfaces).flatMap((surface) => checkContextReadable(brand, surface)),
    ],
  };
}

/**
 * Warns about a surface whose context color stays under {@link CONTEXT_CONTRAST} on its plate:
 * context data is thin lines and muted marks, which fade under it. The resolver fits the brand's
 * context color to every plate, so this fires for a context color a surface writes itself, or for a
 * brand color no lightness of whose hue reaches it. Colors outside the failing band are left to the
 * errors.
 *
 * @param brand - The decoded brand, to see which surfaces write their own context color.
 * @param surface - The resolved surface.
 * @returns One warning, or none.
 */
export function checkContextReadable(brand: Brand, surface: SurfaceTokens): BrandProblem[] {
  const hex = surface.data.context;
  const ratio = contrastRatio(fromHex(hex), fromHex(surface.data.plate));
  if (ratio >= CONTEXT_CONTRAST || ratio < CONTEXT_CONTRAST_RANGE.minimum) {
    return [];
  }

  const written = brand.color.surfaces[surface.name]?.data?.context !== undefined;
  return [
    {
      path: written ? `color.surfaces.${surface.name}.data.context` : 'color.data.context',
      message:
        `${hex} has contrast ${ratio.toFixed(2)}:1 on ${plateName(surface)}; context lines and ` +
        `muted marks fade under ${CONTEXT_CONTRAST}:1.`,
      fix: written
        ? `Use a low-chroma neutral between ${CONTEXT_CONTRAST}:1 and ` +
          `${CONTEXT_CONTRAST_RANGE.maximum}:1 against that plate, or leave the surface's ` +
          "context out so the brand's is fitted to it."
        : `Use a context color whose hue reaches ${CONTEXT_CONTRAST}:1 on that plate at some ` +
          'lightness, or set the surface its own context color.',
    },
  ];
}

/**
 * The brand's own lists, as used on the default surface: every check, at `color.data.*`, except for
 * lists the default surface replaces, which are checked at the surface's path.
 *
 * @param brand - The decoded brand.
 * @param data - The brand's own lists.
 * @param surface - The default surface.
 */
function checkBrandLists(
  brand: Brand,
  data: DataTokens,
  surface: SurfaceTokens,
): DataPaletteResult {
  const replaced = brand.color.surfaces[surface.name]?.data ?? {};
  const brandResult = checkLists({
    data,
    plate: fromHex(surface.data.plate),
    where: plateName(surface),
    paths: listPaths('color.data', (list) => replaced[list] === undefined),
  });
  const ownResult = checkLists({
    data: surface.data,
    plate: fromHex(surface.data.plate),
    where: plateName(surface),
    paths: listPaths(`color.surfaces.${surface.name}.data`, (list) => replaced[list] !== undefined),
  });
  return merge([brandResult, ownResult]);
}

/**
 * What checking one surface's lists needs.
 */
type SurfaceListsInput = {
  /**
   * The decoded brand.
   */
  brand: Brand;

  /**
   * The brand's own lists.
   */
  data: DataTokens;

  /**
   * The surface.
   */
  surface: SurfaceTokens;

  /**
   * The derived surfaces.
   */
  derived: DerivedSurfaces;

  /**
   * The brand lists that already fail on the default surface.
   */
  failing: ReadonlySet<string>;
};

/**
 * One surface's lists that differ from the brand's: the ones it writes, every check at their path,
 * and the ones adjusted for its plate, grouped into one problem per list.
 *
 * @param input - The surface and what it depends on.
 */
function checkSurfaceLists(input: SurfaceListsInput): DataPaletteResult {
  const { brand, data, surface, derived, failing } = input;
  const written = brand.color.surfaces[surface.name]?.data ?? {};
  const prefix = `color.surfaces.${surface.name}.data`;
  /**
   * Where the surface's list comes from.
   */
  const provenance = (list: ListName): Provenance => {
    if (written[list] !== undefined) {
      return 'own';
    }

    return sameList(surface.data[list], data[list]) ? 'brand' : 'fitted';
  };
  const plate = fromHex(surface.data.plate);
  const where = plateName(surface);
  const own = checkLists({
    data: surface.data,
    plate,
    where,
    paths: listPaths(prefix, (list) => provenance(list) === 'own'),
  });
  const fitted = (['categorical', 'context'] as const)
    .filter((list) => provenance(list) === 'fitted' && !failing.has(list))
    .map((list) => {
      const result = checkLists({
        data: surface.data,
        plate,
        where,
        paths: { [list]: `${prefix}.${list}` },
      });
      return groupFitted({ result, list, surface, derived: derived.has(surface.name) });
    });
  return merge([own, ...fitted]);
}

/**
 * What checking a set of lists against one plate needs.
 */
type ListsInput = {
  /**
   * The lists as used on the surface.
   */
  data: DataTokens;

  /**
   * The opaque plate the lists are drawn on.
   */
  plate: Rgba;

  /**
   * The plate as named in messages.
   */
  where: string;

  /**
   * The path of each list to check; lists without one are skipped.
   */
  paths: Partial<Record<ListName, string>>;
};

/**
 * Runs every check the given lists ask for against one plate.
 *
 * @param input - The lists, the plate and the paths of the lists to check.
 */
function checkLists(input: ListsInput): DataPaletteResult {
  const { data, plate, where, paths } = input;
  const categorical = checkCategoricalList(data.categorical, plate, paths.categorical, where);
  const sequential =
    paths.sequential === undefined ? [] : checkSequential(data.sequential, paths.sequential);
  const diverging =
    paths.diverging === undefined ? [] : checkDiverging(data.diverging, paths.diverging);
  const context =
    paths.context === undefined ? [] : checkContext(data.context, plate, paths.context, where);
  return {
    errors: [...categorical.errors, ...sequential, ...diverging, ...context],
    warnings: categorical.warnings,
  };
}

/**
 * The categorical palette's checks against one plate: each color's contrast with the plate, and its
 * distance from the color before it. A palette left out of the paths is not checked.
 *
 * @param colors - The categorical palette, in chart order.
 * @param plate - The opaque plate.
 * @param path - The palette's field path, or `undefined` when it is not checked here.
 * @param where - The plate as named in messages.
 */
function checkCategoricalList(
  colors: readonly Hex[],
  plate: Rgba,
  path: string | undefined,
  where: string,
): DataPaletteResult {
  if (path === undefined) {
    return emptyResult();
  }

  const neighbours = checkNeighbours(colors, path);
  return {
    errors: [...checkCategoricalContrast(colors, plate, path, where), ...neighbours.errors],
    warnings: neighbours.warnings,
  };
}

/**
 * What grouping an adjusted list's problems needs.
 */
type FittedInput = {
  /**
   * The checks of the adjusted list.
   */
  result: DataPaletteResult;

  /**
   * Which list it is.
   */
  list: 'categorical' | 'context';

  /**
   * The surface it was adjusted for.
   */
  surface: SurfaceTokens;

  /**
   * Whether the surface itself was derived.
   */
  derived: boolean;
};

/**
 * Turns the problems of a list adjusted for a surface into one error and one warning at most,
 * saying the brand's list was adjusted and telling the author to write the surface's own.
 *
 * @param input - The checks, the list and the surface.
 */
function groupFitted(input: FittedInput): DataPaletteResult {
  const { result, list, surface } = input;
  const path = `color.surfaces.${surface.name}.data.${list}`;
  const kind = input.derived ? 'derived ' : '';
  const intro =
    `On the ${kind}${surface.name} surface, color.data.${list} was adjusted in lightness for ` +
    `the chart plate ${surface.data.plate} and is now [${listColors(surface.data, list)}]`;
  const fix =
    `Set ${path} to colors made for that surface, or set ` +
    `color.surfaces.${surface.name}.data.plate to a darker or lighter plate with more room.`;
  /**
   * One grouped problem from several, or none.
   */
  const group = (problems: readonly BrandProblem[], verdict: string): BrandProblem[] =>
    problems.length === 0
      ? []
      : [
          {
            path,
            message: `${intro}, but ${verdict}: ${messages(problems)}`,
            fix,
          },
        ];
  return {
    errors: group(result.errors, 'it still fails'),
    warnings: group(result.warnings, 'some neighbours are close'),
  };
}

/**
 * Several problems' messages as one paragraph.
 */
function messages(problems: readonly BrandProblem[]): string {
  return problems.map((problem) => problem.message).join(' ');
}

/**
 * The colors of a list as text, for messages.
 */
function listColors(data: DataTokens, list: 'categorical' | 'context'): string {
  return list === 'context' ? data.context : data.categorical.join(', ');
}

/**
 * The plate as messages name it: the background where the plate is the background.
 *
 * @param surface - The surface.
 */
function plateName(surface: SurfaceTokens): string {
  const kind = surface.data.plate === surface.roles.bg ? 'background' : 'chart plate';
  return `the ${surface.name} ${kind} ${surface.data.plate}`;
}

/**
 * The path of each list under a prefix, for the lists a filter keeps.
 *
 * @param prefix - Such as `color.data`.
 * @param keep - Which lists to check.
 */
function listPaths(
  prefix: string,
  keep: (list: ListName) => boolean,
): Partial<Record<ListName, string>> {
  const lists: ListName[] = ['categorical', 'sequential', 'diverging', 'context'];
  return Object.fromEntries(lists.filter(keep).map((list) => [list, `${prefix}.${list}`]));
}

/**
 * Whether two lists (or two single colors) are the same.
 */
function sameList(a: DataTokens[ListName], b: DataTokens[ListName]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Several results as one.
 */
function merge(results: readonly DataPaletteResult[]): DataPaletteResult {
  return {
    errors: results.flatMap((result) => result.errors),
    warnings: results.flatMap((result) => result.warnings),
  };
}

/**
 * A result with nothing in it.
 */
function emptyResult(): DataPaletteResult {
  return { errors: [], warnings: [] };
}

/**
 * Each categorical color must reach 3:1 against the plate, the WCAG minimum for marks.
 *
 * @param colors - The categorical palette.
 * @param plate - The opaque plate.
 * @param path - The palette's field path, indexed per color in problems.
 * @param where - The plate as named in messages.
 * @returns One problem per failing color, each suggesting a passing shade.
 */
function checkCategoricalContrast(
  colors: readonly Hex[],
  plate: Rgba,
  path: string,
  where: string,
): BrandProblem[] {
  return colors.flatMap((hex, index) => {
    const ratio = contrastRatio(fromHex(hex), plate);
    if (ratio >= GRAPHIC_CONTRAST) {
      return [];
    }

    const suggestion = formatHex(ensureContrast(fromHex(hex), plate, GRAPHIC_CONTRAST));
    return [
      {
        path: `${path}[${index}]`,
        message:
          `${hex} has contrast ${ratio.toFixed(2)}:1 on ${where}; ` +
          `chart marks need ${GRAPHIC_CONTRAST}:1.`,
        fix: `Use a shade with more contrast, such as "${suggestion}".`,
      },
    ];
  });
}

/**
 * Compares every categorical color with the one before it: too close under any vision is an error,
 * and close with normal vision but above the failing distance is a warning.
 *
 * @param colors - The categorical palette, in chart order.
 * @param path - The palette's field path, indexed per color in problems.
 */
function checkNeighbours(colors: readonly Hex[], path: string): DataPaletteResult {
  const errors: BrandProblem[] = [];
  const warnings: BrandProblem[] = [];
  for (const [index, hex] of colors.entries()) {
    const previous = colors[index - 1];
    if (previous === undefined) {
      continue;
    }

    const failing = closeness(previous, hex, minimums(MIN_ADJACENT_DELTA_E));
    if (failing.length > 0) {
      errors.push({
        path: `${path}[${index}]`,
        message:
          `${hex} is too close to its neighbour ${previous} under ` +
          `${describeCloseness(failing)}.`,
        fix: neighbourFix(colors, index, MIN_ADJACENT_DELTA_E),
      });
      continue;
    }

    const tight = closeness(previous, hex, minimums(COMFORTABLE_ADJACENT_DELTA_E));
    if (tight.length > 0) {
      warnings.push({
        path: `${path}[${index}]`,
        message:
          `${hex} and its neighbour ${previous} are close under ` + `${describeCloseness(tight)}.`,
        fix: neighbourFix(colors, index, COMFORTABLE_ADJACENT_DELTA_E),
      });
    }
  }

  return { errors, warnings };
}

/**
 * The neighbour distances to reach: the given one with normal vision, the deficiency minimum under
 * each simulated deficiency.
 */
function minimums(normal: number): { normal: number; deficient: number } {
  return { normal, deficient: MIN_ADJACENT_DELTA_E_CVD };
}

/**
 * Suggests moving the color to another position so every neighbour clears the given normal-vision
 * distance (and the deficiency minimum), else a general fix.
 */
function neighbourFix(colors: readonly Hex[], index: number, minimumNormal: number): string {
  for (const other of colors.keys()) {
    if (other === index || other === index - 1) {
      continue;
    }

    const swapped = [...colors];
    [swapped[index], swapped[other]] = [colors[other] ?? '', colors[index] ?? ''];
    const passes = swapped
      .slice(1)
      .every(
        (hex, offset) =>
          closeness(swapped[offset] ?? hex, hex, minimums(minimumNormal)).length === 0,
      );
    if (passes) {
      return `Swap it with position ${other} (${colors[other]}); then every neighbour passes.`;
    }
  }

  return (
    'Replace one of the two colors with one that differs in lightness as well as hue; no ' +
    'reordering separates every neighbour.'
  );
}

/**
 * A sequential palette's lightness must rise or fall at every step.
 *
 * @param colors - The palette, from low to high.
 * @param path - The palette's field path.
 */
function checkSequential(colors: readonly Hex[], path: string): BrandProblem[] {
  const values = colors.map((hex) => lightness(fromHex(hex)));
  if (isStrictlyMonotonic(values)) {
    return [];
  }

  return [
    {
      path,
      message: 'Lightness does not change in one direction from the first color to the last.',
      fix:
        'Order the colors from lightest to darkest (or darkest to lightest), one hue ' +
        'throughout.',
    },
  ];
}

/**
 * A diverging palette's lightness must move away from its middle color on both sides, and its two
 * ends must stay apart under red-green deficiencies.
 *
 * @param colors - The palette, from one end through the midpoint to the other.
 * @param path - The palette's field path.
 */
function checkDiverging(colors: readonly Hex[], path: string): BrandProblem[] {
  const middle = Math.floor(colors.length / 2);
  const values = colors.map((hex) => lightness(fromHex(hex)));
  const midpoint = values[middle] ?? 0;
  const distances = values.map((value) => Math.abs(value - midpoint));
  const left = distances.slice(0, middle + 1);
  const right = distances.slice(middle).reverse();
  const problems: BrandProblem[] = [];
  if (!isStrictlyMonotonic(left) || !isStrictlyMonotonic(right)) {
    problems.push({
      path,
      message: 'Lightness does not move steadily away from the midpoint on both sides.',
      fix: 'Put the neutral midpoint in the middle and make each arm stronger toward its end.',
    });
  }

  const first = colors[0];
  const last = colors.at(-1);
  if (first === undefined || last === undefined) {
    return problems;
  }

  const merged = RED_GREEN_DEFICIENCIES.filter((vision) => {
    const a = simulateColorVision(fromHex(first), vision);
    const b = simulateColorVision(fromHex(last), vision);
    return deltaE(a, b) < MIN_DIVERGING_ENDS_DELTA_E;
  });
  if (merged.length > 0) {
    problems.push({
      path,
      message: `The ends ${first} and ${last} look alike under ${merged.join(' and ')}.`,
      fix: 'Pair hues that survive red-green deficiencies, such as orange against blue.',
    });
  }

  return problems;
}

/**
 * The context color must be visible against the plate but quieter than a series.
 *
 * @param hex - The context color.
 * @param plate - The opaque plate.
 * @param path - The color's field path.
 * @param where - The plate as named in messages.
 */
function checkContext(hex: Hex, plate: Rgba, path: string, where: string): BrandProblem[] {
  const ratio = contrastRatio(fromHex(hex), plate);
  const { minimum, maximum } = CONTEXT_CONTRAST_RANGE;
  if (ratio >= minimum && ratio < maximum) {
    return [];
  }

  const direction = ratio < minimum ? 'too faint to see' : 'as strong as a series';
  return [
    {
      path,
      message: `${hex} has contrast ${ratio.toFixed(2)}:1 on ${where}, ${direction}.`,
      fix:
        `Use a low-chroma neutral between ${CONTEXT_CONTRAST}:1 and ${maximum}:1 against the ` +
        'background.',
    },
  ];
}

/**
 * Whether every value is greater than the one before, or every value smaller. A list of fewer than
 * two values passes.
 *
 * @param values - The values in order.
 */
function isStrictlyMonotonic(values: readonly number[]): boolean {
  const steps = values.slice(1).map((value, index) => value - (values[index] ?? value));
  return steps.every((step) => step > 0) || steps.every((step) => step < 0);
}
