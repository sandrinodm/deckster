import { CHART_INFOS, CHART_TYPES, chartPropNames } from '#charts/chart-catalog.ts';
import { REVEAL_BY } from '#charts/frame/reveal.ts';

/**
 * One typo is allowed for every this many letters of an unknown prop name.
 */
const LETTERS_PER_TYPO = 3;

/**
 * How many leading letters a misspelt `reveal` value must share with a real one for the check to
 * suggest it, as in `category` for `categories`.
 */
const REVEAL_PREFIX_LETTERS = 3;

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
 * @throws Error naming the unknown prop, the prop it most likely means, and the chart's props; for
 *   a `reveal` the chart cannot build, what is wrong with it and how to write it; or, for an `at`
 *   that is not a step, where it is written and what to write instead.
 */
export function checkProps(name: string, props: object): void {
  const info = CHART_INFOS.find((entry) => entry.name === name);
  if (info === undefined) {
    return;
  }

  checkSteps(name, props);

  const known = chartPropNames(info);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'reveal' && known.includes(key) && value !== undefined) {
      checkReveal(name, value);
    }

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
 * Fails when a chart's `reveal` is not one it can build. Left unchecked, a `from` below 1 reaches
 * the step registry as a step of 0 and fails there as a `<Step at>` the slide never wrote, a
 * missing `from` puts every mark at a step that is not a number, and a misspelt `by` quietly builds
 * by category. The object's fields are the ones the catalog lists under `types.RevealOption`.
 *
 * @param chart - The component's tag.
 * @param reveal - The `reveal` the slide passed.
 * @throws Error quoting the `reveal` as written, what is wrong with it and how to write it.
 */
export function checkReveal(chart: string, reveal: unknown): void {
  const written = `\`${revealSource(reveal)}\` on ${chart}`;
  const forms =
    `Write ${REVEAL_BY.map((by) => `\`reveal="${by}"\``).join(' or ')} to build from step 1, ` +
    'or `reveal={{ by: "categories", from: 2 }}` to start at a later step.';
  if (typeof reveal === 'string') {
    checkRevealBy(written, reveal, forms);
    return;
  }

  if (typeof reveal !== 'object' || reveal === null || Array.isArray(reveal)) {
    throw new Error(`${written} is not a way to build a chart. ${forms}`);
  }

  checkRevealObject(written, reveal, forms);
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

/**
 * Fails when an `at` on the chart, a series, the highlight or an annotation is not a step. Left
 * unchecked, the value reaches the step registry and fails there as a `<Step at>` the slide never
 * wrote, which sends the author looking for a step that is not on the page.
 *
 * @param chart - The component's tag.
 * @param props - The props the slide passed.
 * @throws Error naming the `at` as written, what it belongs to, and how to write it.
 */
function checkSteps(chart: string, props: object): void {
  const { at, y, highlight, annotations } = props as {
    at?: unknown;
    y?: unknown;
    highlight?: unknown;
    annotations?: unknown;
  };
  checkStep(at, `on ${chart}`, 'the whole chart');
  for (const series of Array.isArray(y) ? y : [y]) {
    if (isRecord(series)) {
      const field = typeof series['field'] === 'string' ? ` "${series['field']}"` : '';
      checkStep(series['at'], `on the series${field} of ${chart}`, 'the series');
    }
  }

  if (isRecord(highlight)) {
    checkStep(highlight['at'], `in the \`highlight\` of ${chart}`, 'the highlight');
  }

  if (Array.isArray(annotations)) {
    for (const [index, note] of annotations.entries()) {
      if (isRecord(note)) {
        const type = typeof note['type'] === 'string' ? ` (${note['type']})` : '';
        const where = `on annotation ${index + 1}${type} of ${chart}`;
        checkStep(note['at'], where, 'the annotation');
      }
    }
  }
}

/**
 * Fails when one `at` is given and is not a whole number of 1 or more.
 *
 * @param at - The value written, `undefined` when there is none.
 * @param where - Where it is written, as a phrase: `on the series "a" of BarChart`.
 * @param what - What it reveals: `the series`, `the highlight`.
 * @throws Error quoting the value and where it is written, saying what step 0 is and what to write.
 */
function checkStep(at: unknown, where: string, what: string): void {
  if (at === undefined || (typeof at === 'number' && Number.isInteger(at) && at >= 1)) {
    return;
  }

  const written = typeof at === 'number' ? String(at) : JSON.stringify(at);
  const always =
    what === 'the highlight'
      ? 'Leave `at` out to highlight from the start'
      : `Leave \`at\` out to show ${what} from the start`;
  throw new Error(
    `\`at: ${written}\` ${where} is not a step: \`at\` is the step ${what} comes in at, a whole ` +
      'number of 1 or more, and step 0 is the slide before any step. ' +
      `${always}, or write \`at: 1\` for the first step.`,
  );
}

/**
 * Whether a value is a plain object whose fields can be read.
 *
 * @param value - Any value.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A `reveal` as a slide writes it, for messages: `reveal="series"` or `reveal={{ by: "categories",
 * from: 0 }}`.
 *
 * @param reveal - The value the slide passed.
 */
function revealSource(reveal: unknown): string {
  if (typeof reveal === 'string') {
    return `reveal=${JSON.stringify(reveal)}`;
  }

  if (typeof reveal === 'object' && reveal !== null && !Array.isArray(reveal)) {
    // Numbers print as written: `JSON.stringify` would turn `NaN` into `null`.
    const fields = Object.entries(reveal).map(
      ([key, value]) =>
        `${key}: ${typeof value === 'number' ? String(value) : JSON.stringify(value)}`,
    );
    return `reveal={{ ${fields.join(', ')} }}`;
  }

  return `reveal={${JSON.stringify(reveal) ?? String(reveal)}}`;
}

/**
 * Fails when the object form of a `reveal` names a field the catalog does not list, or its `by` or
 * `from` cannot build. The fields are the ones the catalog lists under `types.RevealOption`.
 *
 * @param written - The `reveal` as written and the chart, for the message.
 * @param reveal - The object the slide passed.
 * @param forms - How to write a `reveal`, for the message.
 * @throws Error naming the field, the value or the missing `from`, and how to write it.
 */
function checkRevealObject(written: string, reveal: object, forms: string): void {
  const fields = Object.keys(CHART_TYPES['RevealOption'] ?? {});
  for (const key of Object.keys(reveal)) {
    if (!fields.includes(key)) {
      const guess = closestProp(key, fields);
      const hint = guess === undefined ? '.' : `; did you mean \`${guess}\`?`;
      throw new Error(
        `${written}: \`${key}\` is not a field of \`reveal\`${hint} Its fields are: ` +
          `${fields.join(', ')}, described under \`types.RevealOption\` in \`deck charts --json\`.`,
      );
    }
  }

  const { by, from } = reveal as { by?: unknown; from?: unknown };
  checkRevealBy(written, by, forms);
  const what = by === 'series' ? 'series' : 'category';
  if (from === undefined) {
    throw new Error(
      `${written} has no \`from\`. Write \`reveal="${String(by)}"\` to bring the first ${what} ` +
        `in at step 1, or add \`from\` with the step it comes in at, 1 or more.`,
    );
  }

  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) {
    throw new Error(
      `${written}: \`from\` is the step the first ${what} comes in at, a whole number of 1 or ` +
        'more; step 0 is the slide before any step, which shows the axes and the caption. ' +
        `Write \`reveal="${String(by)}"\` to bring the first ${what} in at step 1, or a larger ` +
        '`from` to start later.',
    );
  }
}

/**
 * Fails when a `reveal` names something to build by that is not in {@link REVEAL_BY}.
 *
 * @param written - The `reveal` as written and the chart, for the message.
 * @param by - The string form, or the object's `by`.
 * @param forms - How to write a `reveal`, for the message.
 * @throws Error naming the value, the closest one there is, and how to write a `reveal`.
 */
function checkRevealBy(written: string, by: unknown, forms: string): void {
  if (typeof by === 'string' && (REVEAL_BY as readonly string[]).includes(by)) {
    return;
  }

  // The two values start with different letters, so a misspelling keeps the first few letters
  // of the one it means (`category`, `Serie`).
  const start =
    typeof by === 'string' ? by.slice(0, REVEAL_PREFIX_LETTERS).toLowerCase() : undefined;
  const guess =
    start === undefined ? undefined : REVEAL_BY.find((value) => value.startsWith(start));
  const hint = guess === undefined ? '' : ` Did you mean "${guess}"?`;
  const named = by === undefined ? 'does not say what to build by' : 'cannot build by that';
  throw new Error(
    `${written} ${named}: a chart builds by ` +
      `${REVEAL_BY.map((value) => `"${value}"`).join(' or ')}.${hint} ${forms}`,
  );
}
