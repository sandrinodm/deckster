import { CHART_INFOS, chartPropNames } from '#charts/chart-catalog.ts';

/**
 * One typo is allowed for every this many letters of an unknown prop name.
 */
const LETTERS_PER_TYPO = 3;

/**
 * Names authors reach for that a chart calls something else, with the prop they mean.
 */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  /**
   * The value field of a categorical chart.
   */
  value: ['y', 'values'],

  /**
   * Several value fields.
   */
  values: ['y', 'value'],

  /**
   * The category field.
   */
  category: ['x'],

  /**
   * The category field, plural.
   */
  categories: ['x'],

  /**
   * A field name, as some libraries call it.
   */
  field: ['y', 'x'],

  /**
   * The highlight, as a flag.
   */
  highlighted: ['highlight'],

  /**
   * The highlight, plural.
   */
  highlights: ['highlight'],

  /**
   * The unit, plural.
   */
  units: ['unit'],

  /**
   * A title belongs to the slide; the chart's line above the plot is its caption.
   */
  title: ['caption'],

  /**
   * A subtitle is the caption.
   */
  subtitle: ['caption'],

  /**
   * The source line.
   */
  sources: ['source'],

  /**
   * An annotation, singular.
   */
  annotation: ['annotations'],

  /**
   * Callouts are annotations.
   */
  callouts: ['annotations'],

  /**
   * Stacking.
   */
  stack: ['stacked'],

  /**
   * Sorting.
   */
  sorted: ['sort'],

  /**
   * Bars or columns.
   */
  horizontal: ['orientation'],

  /**
   * Bars or columns.
   */
  vertical: ['orientation'],

  /**
   * The accessible name.
   */
  name: ['label'],

  /**
   * The accessible name.
   */
  ariaLabel: ['label'],

  /**
   * The number format.
   */
  numberFormat: ['format'],

  /**
   * Fraction digits live in the format.
   */
  digits: ['format'],

  /**
   * Colours follow the highlight and the brand.
   */
  color: ['highlight'],

  /**
   * Colours follow the highlight and the brand.
   */
  colors: ['highlight'],

  /**
   * The series field of long data.
   */
  group: ['series'],

  /**
   * The value axis minimum.
   */
  yMin: ['min'],

  /**
   * The value axis maximum.
   */
  yMax: ['max'],

  /**
   * The goal of a progress bar.
   */
  goal: ['target'],
};

/**
 * Fails when a chart is given a prop it does not take: a misspelt or borrowed name would otherwise
 * draw a wrong chart that looks right. `data-*` attributes (the dev server's source stamps) and
 * `children` pass.
 *
 * @param name - The component's tag, as the catalog names it.
 * @param props - The props the slide passed.
 * @throws Error naming the unknown prop, the prop it most likely means, and the chart's props.
 */
export function checkProps(name: string, props: object): void {
  const info = CHART_INFOS.find((entry) => entry.name === name);
  if (info === undefined) {
    return;
  }

  const known = chartPropNames(info);
  for (const key of Object.keys(props)) {
    if (known.includes(key) || key === 'children' || key.startsWith('data-')) {
      continue;
    }

    const guess = closestProp(key, known);
    const hint = guess === undefined ? '' : ` did you mean \`${guess}\`?`;
    throw new Error(
      `\`${key}\` is not a prop of ${name};${hint} Its props are: ${known.join(', ')}. ` +
        '`deck charts --json` describes each one.',
    );
  }
}

/**
 * The prop an unknown name most likely means: a known synonym, else the nearest name by edit
 * distance, ignoring case, as long as it is at most a third of the name's letters off (and at least
 * one).
 *
 * @param key - The unknown name.
 * @param known - The chart's props.
 */
export function closestProp(key: string, known: readonly string[]): string | undefined {
  const synonym = (Object.hasOwn(SYNONYMS, key) ? SYNONYMS[key] : undefined)?.find((candidate) =>
    known.includes(candidate),
  );
  if (synonym !== undefined) {
    return synonym;
  }

  const lower = key.toLowerCase();
  const scored = known
    .map((candidate) => ({ candidate, distance: editDistance(lower, candidate.toLowerCase()) }))
    .toSorted((a, b) => a.distance - b.distance);
  const best = scored[0];
  const allowed = Math.max(1, Math.floor(key.length / LETTERS_PER_TYPO));
  if (best === undefined || best.distance > allowed) {
    return undefined;
  }

  return best.candidate;
}

/**
 * The Levenshtein distance between two words.
 *
 * @param a - One word.
 * @param b - The other.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      current.push(
        Math.min(
          (previous[j + 1] ?? 0) + 1,
          (current[j] ?? 0) + 1,
          (previous[j] ?? 0) + (a[i] === b[j] ? 0 : 1),
        ),
      );
    }

    previous = current;
  }

  return previous[b.length] ?? 0;
}

/**
 * Checks at compile time that a list names every prop of a component's props type and nothing else,
 * so the catalog test can compare the catalog with what the component declares.
 *
 * @returns A function that takes the list and returns it.
 */
export function propNames<Props>(): <const Names extends readonly (keyof Props & string)[]>(
  names: Names & ([Exclude<keyof Props & string, Names[number]>] extends [never] ? unknown : never),
) => Names {
  return (names) => names;
}
