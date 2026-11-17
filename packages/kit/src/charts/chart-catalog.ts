import type { ChartKind, NativeChartType } from '#charts/chart-spec.ts';

import { CHART_SPEC_ATTRIBUTE, CHART_SPEC_VERSION } from '#charts/chart-spec.ts';
import { REVEAL_BY } from '#charts/frame/reveal.ts';

/**
 * The kinds of message a figure is chosen for, from "what am I saying" in the presentation skill's
 * decision guide.
 */
export const CHART_MESSAGES = [
  'single number',
  'comparison',
  'ranking',
  'trend',
  'change between two points',
  'part-to-whole',
  'distribution',
  'correlation',
  'flow',
  'exact values',
] as const;

/**
 * One of {@link CHART_MESSAGES}.
 */
export type ChartMessage = (typeof CHART_MESSAGES)[number];

/**
 * One prop of a chart component, as `deck charts --json` prints it.
 */
export type ChartPropInfo = {
  /**
   * The TypeScript type, in short.
   */
  type: string;

  /**
   * Whether a slide must set it.
   */
  required: boolean;

  /**
   * The value when left out, or `null` when it has none or it depends on the data.
   */
  default: unknown;

  /**
   * What it does, as a sentence.
   */
  description: string;
};

/**
 * One chart or figure component, as `deck charts --json` prints it.
 */
export type ChartInfo = {
  /**
   * The MDX tag.
   */
  name: string;

  /**
   * The `kind` its spec and `data-chart` attribute carry.
   */
  kind: ChartKind;

  /**
   * When to reach for it, in one line.
   */
  useWhen: string;

  /**
   * The messages it is the right form for.
   */
  messages: readonly ChartMessage[];

  /**
   * When not to use it, and what to use instead.
   */
  avoid: string;

  /**
   * The shape of the data it takes.
   */
  data: string;

  /**
   * How it draws a missing value (`null`, an empty cell, text that is not a number).
   */
  nulls: string;

  /**
   * The shared props it takes, by name: each is described once in the catalog's `shared`.
   */
  shared: readonly SharedPropName[];

  /**
   * Its own props, by name. A name in neither `shared` nor here is not a prop: the component throws
   * an error naming the closest one.
   */
  props: Readonly<Record<string, ChartPropInfo>>;

  /**
   * The numbers `deck lint` holds it to, from {@link CHART_LIMITS}: the most categories, slices or
   * series it reads well with, and from how many it needs a highlight.
   */
  limits: Readonly<Record<string, number | string>>;

  /**
   * A minimal MDX example.
   */
  example: string;

  /**
   * What screen readers get, and what to check.
   */
  accessibility: string;

  /**
   * The native PowerPoint object PPTX export can build from its spec, or `null`.
   */
  native: NativeChartType | null;
};

/**
 * The catalog `deck charts --json` prints.
 */
export type ChartCatalog = {
  /**
   * The props several charts share, described once; each chart's `shared` names the ones it takes.
   */
  shared: Readonly<Record<SharedPropName, ChartPropInfo>>;

  /**
   * The fields of the objects props take: `RowStat`, `ProgressItem`, `TableColumn`, `SeriesInput`,
   * `FormatOptions`, the object forms of `highlight` and `reveal`, and each `Annotation` type.
   */
  types: Readonly<Record<string, Readonly<Record<string, ChartPropInfo>>>>;

  /**
   * Every component.
   */
  charts: readonly ChartInfo[];

  /**
   * The components for each kind of message, in catalog order (the order of `charts`), not ranked.
   */
  messages: Readonly<Record<ChartMessage, readonly string[]>>;

  /**
   * How the shared props work: highlight, annotations, format, labels, steps, data.
   */
  insight: Readonly<Record<string, string>>;

  /**
   * Where each figure's serialisable description is.
   */
  spec: { attribute: string; module: string; version: number };
};

/**
 * The numbers `deck lint`'s chart rules hold charts to, in one place: the rules import them and
 * `deck charts --json` prints them per chart.
 */
export const CHART_LIMITS = {
  /**
   * The most categories each kind reads well with on a slide (`chart-too-many-categories`); kinds
   * left out have no limit (a line's points in time, a heatmap's cells).
   */
  categories: {
    /**
     * Bars, each labeled.
     */
    bar: 12,

    /**
     * Steps between two totals.
     */
    waterfall: 10,

    /**
     * Stages.
     */
    funnel: 7,

    /**
     * Items, each labeled on both sides.
     */
    slope: 10,

    /**
     * Stats in a row.
     */
    'stat-row': 4,

    /**
     * Table rows.
     */
    table: 8,
  } as Readonly<Partial<Record<ChartKind, number>>>,

  /**
   * The most slices a donut has (`chart-pie-slices`).
   */
  slices: 5,

  /**
   * From this many series a chart needs a highlight (`chart-no-highlight`).
   */
  seriesNeedingHighlight: 3,

  /**
   * From this many categories a chart needs a highlight (`chart-no-highlight`).
   */
  categoriesNeedingHighlight: 6,

  /**
   * The most series drawn in their own color: the brand's categorical palette
   * (`chart-too-many-series`), counted without the series a highlight drops to context.
   */
  coloredSeries: 'the brand palette size',
} as const;

/**
 * A prop with a description and no default.
 *
 * @param type - The type in short.
 * @param description - What it does.
 * @param options - Whether it is required and its default.
 */
function prop(
  type: string,
  description: string,
  options: { required?: boolean; default?: unknown } = {},
): ChartPropInfo {
  return {
    type,
    required: options.required ?? false,
    default: options.default ?? null,
    description,
  };
}

/**
 * The props several charts share, described once.
 */
export const SHARED_PROPS = {
  /**
   * The step that reveals the whole figure.
   */
  at: prop('number', 'The step that reveals the whole figure; shown from the start when left out.'),

  /**
   * The line above the plot.
   */
  caption: prop(
    'string',
    'The measure, unit and period above the plot ("Tickets per month, 2026"); ' +
      'the slide title states the takeaway.',
  ),

  /**
   * The source line.
   */
  source: prop('string', 'Where the data comes from, set under the plot.'),

  /**
   * The accessible name.
   */
  label: prop('string', 'The accessible name; built from the data when left out.'),

  /**
   * The rows.
   */
  data: prop(
    'Row[] | string',
    'Rows inline (data={[...]}), imported from a JSON or CSV file in the deck ' +
      "folder, or the name of a dataset in the slide's `data:` frontmatter. Two " +
      'rows for the same category (and series) throw.',
    { required: true },
  ),

  /**
   * The highlight.
   */
  highlight: prop(
    'string | string[] | Highlight',
    'What the chart is about. A series name, else a category (or max, min, ' +
      'first, last), several, or a `Highlight` object (see `types.Highlight`); ' +
      "everything else drops to the brand's context color. `at` turns it on at " +
      'a step.',
  ),

  /**
   * The annotations.
   */
  annotations: prop(
    'Annotation[]',
    'Callouts, reference lines, shaded ranges and brackets as objects with a ' +
      '`type` of `callout`, `reference`, `range` or `bracket`; their fields are ' +
      'under `types` as `Annotation.callout`, `Annotation.reference`, ' +
      '`Annotation.range` and `Annotation.bracket`. Each takes `at`.',
  ),

  /**
   * The number format.
   */
  format: prop(
    '"number" | "standard" | "compact" | "currency" | "percent" | "delta" | ' +
      '"percent-delta" | "currency-delta" | FormatOptions',
    "How values are written, over the brand's number style (compact, its " +
      'currency and locale). Percent values are already in percent: 34 is 34%. ' +
      '`digits` fixes the fraction digits; without it currency in full writes ' +
      'cents or none (never one decimal), and a value under 1 keeps a ' +
      'significant digit.',
  ),

  /**
   * The unit.
   */
  unit: prop(
    'string',
    'The unit after each value: "ms", "°C", "h", "trees". A scale unit (K, M, ' +
      'B) sits tight and keeps a currency sign: unit="M" with currency writes ' +
      '$1.2M.',
  ),

  /**
   * The value labels.
   */
  labels: prop(
    '"auto" | "all" | "highlight" | "ends" | "none"',
    'Which values are labeled on the marks. `auto` labels every value when ' +
      'few enough to read (and drops the value axis), else the highlighted ' +
      'ones.',
    { default: 'auto' },
  ),

  /**
   * The legend.
   */
  legend: prop(
    'boolean',
    'Force the legend on or off. Charts label series directly and show a ' +
      'legend only when they cannot (grouped and stacked bars); with a ' +
      'highlight the legend names the highlighted series and "everything else".',
  ),
} as const;

/**
 * The name of a shared prop.
 */
export type SharedPropName = keyof typeof SHARED_PROPS;

/**
 * The frame props every figure takes.
 */
const FRAME: readonly SharedPropName[] = ['at', 'caption', 'source', 'label'];

/**
 * The shared props of the categorical charts that take all of them.
 */
const ALL_SHARED: readonly SharedPropName[] = Object.keys(SHARED_PROPS) as SharedPropName[];

/**
 * The fields of categorical data.
 */
const FIELD_PROPS = {
  /**
   * The category field.
   */
  x: prop('string', 'The category field; the first text field when left out.'),

  /**
   * The value fields.
   */
  y: prop(
    'string | SeriesInput | (string | SeriesInput)[]',
    'The value field or fields, one series each (see `types.SeriesInput`); ' +
      '`at` reveals a series at a step. Every number field when left out.',
  ),

  /**
   * The series field.
   */
  series: prop(
    'string',
    'For long data, the field whose values name the series (then `y` is the one value field).',
  ),
} as const;

/**
 * The values `reveal` builds by, as a TypeScript union of string literals.
 */
const REVEAL_BY_TYPE = REVEAL_BY.map((by) => `"${by}"`).join(' | ');

/**
 * The step reveal option.
 */
const REVEAL_PROP = prop(
  `${REVEAL_BY_TYPE} | RevealOption`,
  'Build the marks in steps, one series or one category per step. A string starts at step 1; ' +
    'the object form (see `types.RevealOption`) starts at `from`, a later step.',
);

/**
 * The `relative` prop of the number figures, with its one default.
 */
const RELATIVE_PROP = prop(
  'boolean',
  'Write the change from `from` as a percentage of it, or in the unit ' +
    '(`false`). The default is a percentage, except for values in percent ' +
    '(unit "%" or format "percent"), whose change is written in points: "+7 ' +
    'pts". A change across zero is always written in the unit.',
  { default: 'true; false for values in percent' },
);

/**
 * `annotations` for the charts that take only callouts and reference lines.
 */
const POINT_ANNOTATIONS = prop(
  'Annotation[]',
  "Callouts on a point (`type: 'callout'`, fields in " +
    "`types['Annotation.callout']`) and reference lines across the plot " +
    "(`type: 'reference'`, fields in `types['Annotation.reference']`); ranges " +
    'and brackets throw here. Each takes `at`.',
);

/**
 * The fields of the objects props take, described for `deck charts --json`.
 */
export const CHART_TYPES: Readonly<Record<string, Readonly<Record<string, ChartPropInfo>>>> = {
  /**
   * One stat of a StatRow.
   */
  RowStat: {
    value: prop(
      'number | string',
      'The number, formatted by the brand, or text as it should read.',
      {
        required: true,
      },
    ),
    label: prop('string', 'What it counts, in a few words.', { required: true }),
    delta: prop(
      'string',
      'The change as written ("+12% since 2025"); computed from `from` when that is given.',
    ),
    from: prop('number', 'The value it is compared with, for a computed delta.'),
    relative: RELATIVE_PROP,
    better: prop('"up" | "down"', 'Which way is good news, for a computed delta.', {
      default: 'up',
    }),
    tone: prop(
      '"positive" | "negative" | "neutral"',
      'Whether the change is good news; from `better` and the sign when left out.',
    ),
    trend: prop(
      '"up" | "down" | "flat"',
      'Which way the change points, for a delta written without a sign.',
    ),
    spark: prop('number[]', 'Recent values, oldest first, drawn as a sparkline under the label.'),
    highlight: prop('boolean', 'The stat the point rests on: an accent rule and the accent color.'),
    format: prop('Format', "How this stat's number is written, over the row's."),
    unit: prop(
      'string',
      "This stat's unit, over the row's; it resets the row's format style " +
        'unless it is a scale (K, M, B).',
    ),
  },

  /**
   * One bar of a Progress.
   */
  ProgressItem: {
    label: prop('string', 'What is measured.', { required: true }),
    value: prop(
      'number',
      'How far it has come; past `max` the track runs on and marks where the whole ended.',
      {
        required: true,
      },
    ),
    max: prop('number', 'The whole.', { default: 100 }),
    target: prop('number', 'The goal, marked on the track.'),
    unit: prop(
      'string',
      "This bar's unit, over the figure's; it resets the figure's format style.",
    ),
    format: prop('Format', "How this bar's numbers are written, over the figure's."),
    highlight: prop('boolean', 'The bar the point is about, when there are several.'),
  },

  /**
   * One column of a Table.
   */
  TableColumn: {
    key: prop('string', 'The field.', { required: true }),
    label: prop('string', 'The header; the field name when left out.'),
    format: prop(
      'Format',
      "How the column's numbers are written; exact (as many digits as the data has) when left out.",
    ),
    unit: prop('string', 'The unit after each number.'),
    bar: prop('boolean', 'Draw an in-cell bar to scale from zero.', { default: false }),
    align: prop('"left" | "right"', 'The alignment; numbers right, text left when left out.'),
  },

  /**
   * One value field of a categorical chart, in its object form.
   */
  SeriesInput: {
    field: prop('string', "The field that holds the series' values.", { required: true }),
    label: prop(
      'string',
      'The name the chart labels the series with; the field name when left out.',
    ),
    at: prop('number', 'The step that reveals the series.'),
  },

  /**
   * A format spelled out.
   */
  FormatOptions: {
    style: prop(
      '"number" | "currency" | "percent"',
      '`percent` values are in percent already (34 is 34%); `currency` adds the currency sign.',
    ),
    notation: prop('"standard" | "compact"', '`compact` writes 1.2M; `standard` every digit.'),
    currency: prop('string', 'An ISO 4217 currency code, such as `EUR`.'),
    digits: prop('number', 'Exactly this many fraction digits, 0 to 4.'),
    signed: prop('boolean', 'Always show the sign, for changes: `+12`.'),
  },

  /**
   * The object form of `highlight` on the categorical charts.
   */
  Highlight: {
    series: prop('string | string[]', 'Series to keep in color.'),
    category: prop('string | string[]', 'Categories to keep in color (or max, min, first, last).'),
    point: prop('{ series?, category } | { series?, category }[]', 'Single points.'),
    range: prop(
      '[string, string]',
      'A stretch of categories, `[first, last]`, both ends inclusive. On a line ' +
        'chart it covers the segments between consecutive highlighted points, so ' +
        'the line is drawn heavier and in color from the first category to the ' +
        'last; every segment outside it, including the one after the last ' +
        'category, stays muted. A range of one category colors no segment (use ' +
        '`category` for a single point).',
    ),
    at: prop(
      'number',
      'The step that turns the highlight on; the chart shows its own colors before it.',
    ),
  },

  /**
   * The object form of `reveal` on the categorical charts, for a build that starts after step 1.
   */
  RevealOption: {
    by: prop(REVEAL_BY_TYPE, 'What each step adds: one series, or one category, in data order.', {
      required: true,
    }),
    from: prop(
      'number',
      'The step the first one comes in at, a whole number of 1 or more (step 0 is the slide ' +
        'before any step); each next one comes a step later. Series with their own `at` keep it.',
      { required: true },
    ),
  },

  /**
   * A callout annotation.
   */
  'Annotation.callout': {
    type: prop('"callout"', 'Tells annotations apart.', { required: true }),
    x: prop('string | number', 'The category (a point name, on a Scatter) it points at.', {
      required: true,
    }),
    label: prop('string', 'The text, a few words: "Redesign ships".', { required: true }),
    series: prop(
      'string',
      'The series whose point it marks; the highlighted or first series (on a ' +
        'Slope, the `to` field).',
    ),
    y: prop('number', "A value to point at instead of the series' value."),
    at: prop('number', 'The step that reveals it.'),
  },

  /**
   * A reference line annotation.
   */
  'Annotation.reference': {
    type: prop('"reference"', 'Tells annotations apart.', { required: true }),
    value: prop('number', 'The value on the value axis.', { required: true }),
    label: prop(
      'string',
      'The text at its end, such as "Target"; the formatted value is added after it.',
    ),
    at: prop('number', 'The step that reveals it.'),
  },

  /**
   * A shaded range annotation.
   */
  'Annotation.range': {
    type: prop('"range"', 'Tells annotations apart.', { required: true }),
    from: prop('string | number', 'The first category of the span.', { required: true }),
    to: prop('string | number', 'The last category of the span.', { required: true }),
    label: prop('string', 'The text above the span.'),
    at: prop('number', 'The step that reveals it.'),
  },

  /**
   * A bracket annotation.
   */
  'Annotation.bracket': {
    type: prop('"bracket"', 'Tells annotations apart.', { required: true }),
    from: prop('string | number', 'The category of the first point.', { required: true }),
    to: prop('string | number', 'The category of the second point.', { required: true }),
    series: prop('string', 'The series; the highlighted or first series.'),
    label: prop('string', 'The text; the change between the two values when left out.'),
    relative: prop(
      'boolean',
      'Write the change as a percentage of the first value, or in the unit. A ' +
        'change across zero (or from near zero) is always in the unit.',
      { default: true },
    ),
    better: prop('"up" | "down"', "Which way is good news, for the label's color.", {
      default: 'up',
    }),
    at: prop('number', 'The step that reveals it.'),
  },
};

/**
 * Every chart and figure component the kit registers, with when to use it.
 */
export const CHART_INFOS: readonly ChartInfo[] = [
  {
    name: 'BigNumber',
    kind: 'big-number',
    useWhen:
      'One number is the message ("we cut onboarding to 3 days"); it beats a ' +
      'chart of one or two bars.',
    messages: ['single number'],
    avoid: 'A number without the comparison that gives it meaning; add `from` or `context`.',
    data: 'No rows: `value` (number or text), `label`, and `from` or `delta` for the change.',
    nulls: 'No rows; `value` is required.',
    shared: ['at', 'caption', 'source', 'format', 'unit'],
    props: {
      value: prop(
        'number | string',
        'The number, formatted by the brand, or text as it should read ("3 in 10").',
        { required: true },
      ),
      label: prop('string', 'What it counts, in about six words.', { required: true }),
      context: prop('string', 'The comparison in a line: "down from 14 days in 2025".'),
      from: prop('number', 'The value it is compared with; the change is written as the delta.'),
      delta: prop('string', 'The change as written, when not computed from `from`.'),
      tone: prop(
        '"positive" | "negative" | "neutral"',
        'Whether the change is good news; from `better` and the sign when left out.',
      ),
      better: prop('"up" | "down"', "Which way is good news, for the delta's color.", {
        default: 'up',
      }),
      relative: RELATIVE_PROP,
      trend: prop('number[]', 'Recent values for a sparkline set against the figure.'),
    },
    limits: {},
    example:
      '<BigNumber value={3} unit="days" label="from signup to a live workspace" ' +
      'from={14} better="down" relative={false} />',
    accessibility:
      'The figure, label, delta and context are text; the summary reads them in order.',
    native: null,
  },
  {
    name: 'StatRow',
    kind: 'stat-row',
    useWhen:
      'Two to four headline numbers that belong together, each with its change ' +
      'and an optional sparkline.',
    messages: ['single number', 'comparison'],
    avoid:
      'More than four numbers (use a Table) or numbers in different units that ' +
      'the audience must compare.',
    data: 'No rows: `stats`, a list of `RowStat` (see `types.RowStat`).',
    nulls: 'No rows; each stat needs a `value`.',
    shared: [...FRAME, 'format', 'unit'],
    props: {
      stats: prop(
        'RowStat[]',
        'Two to four stats; set `highlight: true` on the one the point rests on.',
        { required: true },
      ),
    },
    limits: { stats: CHART_LIMITS.categories['stat-row'] ?? 4 },
    example:
      "<StatRow stats={[{ value: 38, unit: '%', label: 'fewer tickets', " +
      "highlight: true }, { value: 2.5, unit: 'h', label: 'first reply', from: " +
      "14, better: 'down' }]} />",
    accessibility:
      'Every value and label is text; sparklines are decoration (`aria-hidden`) ' +
      'beside the numbers they trend.',
    native: null,
  },
  {
    name: 'Comparison',
    kind: 'comparison',
    useWhen: 'Two values, before and after or A against B, where the difference is the message.',
    messages: ['comparison', 'change between two points'],
    avoid: 'Several items changing between two points: use Slope.',
    data:
      'No rows: `from` and `to`, each { value, label }. A value below zero is drawn from a zero ' +
      'line both bars share, towards the start edge, so a loss never reads as a gain.',
    nulls: 'No rows; both values are required.',
    shared: [...FRAME, 'format', 'unit'],
    props: {
      from: prop('{ value: number; label: string }', 'The value before, or the first.', {
        required: true,
      }),
      to: prop(
        '{ value: number; label: string }',
        'The value after, or the second: the one the point is about.',
        { required: true },
      ),
      better: prop('"up" | "down"', 'Which way is good news.', { default: 'up' }),
      relative: RELATIVE_PROP,
    },
    limits: {},
    example:
      "<Comparison from={{ value: 14, label: '2025' }} to={{ value: 2.5, label: " +
      '\'October 2026\' }} unit="h" better="down" />',
    accessibility:
      'Both values, their labels and the change are text; the bars to scale are decoration.',
    native: 'bar',
  },
  {
    name: 'BarChart',
    kind: 'bar',
    useWhen:
      'Compare categories or rank them: sorted horizontal bars for long labels, ' +
      'columns for a few periods.',
    messages: ['comparison', 'ranking', 'trend'],
    avoid:
      'One or two bars (use BigNumber or Comparison), or before/after for many items (use Slope).',
    data:
      'Rows with a category field and one or more number fields (wide), or ' +
      'category, series and value fields (long).',
    nulls:
      'A missing value draws no bar and no label; the category keeps its place. ' +
      'A chart with no values at all is reported by `deck lint` (chart-empty).',
    shared: ALL_SHARED,
    props: {
      ...FIELD_PROPS,
      orientation: prop(
        '"auto" | "vertical" | "horizontal"',
        'Columns or bars; `auto` turns horizontal when labels do not fit under columns.',
        { default: 'auto' },
      ),
      stacked: prop('boolean', 'Stack the series instead of grouping them.', { default: false }),
      sort: prop(
        'boolean | "ascending" | "descending"',
        'Sort by value, largest first for `true`; "Other" stays last.',
        { default: false },
      ),
      min: prop(
        'number',
        'The axis minimum: above zero only with `truncate` (drawn with an axis ' +
          'break, the value axis and an "Axis starts at" note); lint reports it ' +
          'otherwise.',
      ),
      max: prop('number', 'The axis maximum.'),
      truncate: prop('boolean', 'Allow `min` above zero, with a break across every bar.', {
        default: false,
      }),
      reveal: REVEAL_PROP,
    },
    limits: {
      categories: CHART_LIMITS.categories.bar ?? 12,
      seriesNeedingHighlight: CHART_LIMITS.seriesNeedingHighlight,
      categoriesNeedingHighlight: CHART_LIMITS.categoriesNeedingHighlight,
      coloredSeries: CHART_LIMITS.coloredSeries,
    },
    example:
      '<BarChart data={regions} x="region" y="revenue" format="currency" sort highlight="EMEA" />',
    accessibility:
      'Named "Bar chart of <series> by <field>"; the summary gives each series\' ' +
      'highest and lowest category and what is highlighted.',
    native: 'bar',
  },
  {
    name: 'LineChart',
    kind: 'line',
    useWhen:
      'Change over time: one line, or one highlighted among muted context ' +
      'lines, each labeled at its end.',
    messages: ['trend'],
    avoid:
      'More than about five lines without a highlight (spaghetti), two measures ' +
      'on two axes, or a single point (use BigNumber).',
    data:
      'Rows in time order with a time field and one number field per line (or ' +
      'long rows with `series`).',
    nulls:
      'A missing value breaks the line there (a gap, never a zero); a line that ' +
      'stops early is labeled where it stops.',
    shared: ALL_SHARED,
    props: {
      ...FIELD_PROPS,
      zero: prop(
        'boolean',
        'Start the value axis at zero; otherwise it hugs the data and says where it starts.',
        { default: false },
      ),
      min: prop('number', 'A fixed axis minimum.'),
      max: prop('number', 'A fixed axis maximum.'),
      reveal: REVEAL_PROP,
    },
    limits: {
      seriesNeedingHighlight: CHART_LIMITS.seriesNeedingHighlight,
      categoriesNeedingHighlight: CHART_LIMITS.categoriesNeedingHighlight,
      coloredSeries: CHART_LIMITS.coloredSeries,
      points: 2,
    },
    example:
      "<LineChart data={tickets} x=\"month\" y={['2025', '2026']} " +
      "highlight=\"2026\" annotations={[{ type: 'callout', x: 'Jun', label: " +
      "'Redesign ships' }]} />\nRange highlight, muting the rest of the line: " +
      '<LineChart data={tickets} x="month" y="2026" highlight={{ range: [\'Jun\', ' +
      "'Sep'] }} />",
    accessibility: "The summary gives each line's first and last value and what is highlighted.",
    native: 'line',
  },
  {
    name: 'AreaChart',
    kind: 'area',
    useWhen:
      'A trend whose size matters (volume, backlog), or a composition over time when stacked.',
    messages: ['trend', 'part-to-whole'],
    avoid:
      'Comparing several series (use LineChart); only the bottom stacked series ' +
      'and the total read well.',
    data: 'As LineChart.',
    nulls:
      'A missing value leaves a gap in its area; stacked, the stack breaks at ' +
      'that category for that series and every series above it (never drawn as ' +
      'zero).',
    shared: ALL_SHARED,
    props: {
      ...FIELD_PROPS,
      stacked: prop('boolean', 'Stack the areas; put the series that matters first.', {
        default: false,
      }),
      min: prop('number', 'Ignored below zero: areas start at zero.'),
      max: prop('number', 'A fixed axis maximum.'),
      reveal: REVEAL_PROP,
    },
    limits: {
      seriesNeedingHighlight: CHART_LIMITS.seriesNeedingHighlight,
      coloredSeries: CHART_LIMITS.coloredSeries,
      points: 2,
    },
    example:
      '<AreaChart data={replies} x="week" y="hours" unit="h" annotations={[{ ' +
      "type: 'reference', value: 4, label: 'Target' }]} />",
    accessibility: 'As LineChart.',
    native: 'area',
  },
  {
    name: 'Slope',
    kind: 'slope',
    useWhen: 'Change between two points for several items: who rose and who fell, at a glance.',
    messages: ['change between two points', 'comparison'],
    avoid: 'Grouped bars for the same data; more than about ten items.',
    data: 'Rows with an item field and two number fields (`from` and `to`).',
    nulls: 'Every item needs both values: a missing one throws an error naming the item.',
    shared: [...FRAME, 'data', 'highlight', 'format', 'unit'],
    props: {
      x: FIELD_PROPS.x,
      from: prop('string', "The first value's field; the first number field when left out."),
      to: prop('string', "The second value's field."),
      fromLabel: prop('string', "The left column's heading."),
      toLabel: prop('string', "The right column's heading."),
      better: prop('"up" | "down"', 'Which way is good news.', { default: 'up' }),
      tone: prop('boolean', 'Color items by better or worse instead of the lead color.', {
        default: false,
      }),
      zero: prop('boolean', 'Start the scale at zero.', { default: false }),
      annotations: POINT_ANNOTATIONS,
    },
    limits: {
      categories: CHART_LIMITS.categories.slope ?? 10,
      categoriesNeedingHighlight: CHART_LIMITS.categoriesNeedingHighlight,
    },
    example:
      '<Slope data={teams} x="team" from="2025" to="2026" better="down" tone ' +
      "highlight={['Billing', 'Payroll']} />",
    accessibility: "The summary lists every item's two values.",
    native: 'line',
  },
  {
    name: 'Donut',
    kind: 'donut',
    useWhen:
      'Part of a whole when one or two parts matter ("more than half"), five slices at most.',
    messages: ['part-to-whole'],
    avoid: 'More than five slices or close values (use sorted bars); two donuts side by side.',
    data: 'Rows with a name field and a value field.',
    nulls: 'A missing or negative value is a slice of zero: it draws nothing and counts as 0%.',
    shared: [...FRAME, 'data', 'highlight', 'format', 'unit'],
    props: {
      x: FIELD_PROPS.x,
      y: prop('string', 'The value field; the first number field when left out.'),
      center: prop('"share" | "total" | "none" | string', 'The figure in the centre.', {
        default: null,
      }),
      centerLabel: prop('string', 'The line under the centre figure.'),
    },
    limits: { slices: CHART_LIMITS.slices },
    example:
      '<Donut data={channels} x="channel" y="conversations" highlight="Chat" ' +
      'centerLabel="on chat" />',
    accessibility: "The summary gives the total and every slice's share.",
    native: 'doughnut',
  },
  {
    name: 'Pictogram',
    kind: 'pictogram',
    useWhen: 'A proportion that should feel human: "3 in 10", risk, reach.',
    messages: ['part-to-whole', 'single number'],
    avoid: 'Precise shares or totals above 100 units.',
    data: 'No rows: `value` filled units of `total`.',
    nulls: 'No rows; `value` is required.',
    shared: ['at', 'caption', 'source'],
    props: {
      value: prop('number', 'How many units are filled.', { required: true }),
      total: prop('number', 'How many units there are, at most 100.', { default: 10 }),
      label: prop('string', 'What the filled units are.', { required: true }),
      shape: prop('"person" | "circle" | "square"', "The unit's shape.", { default: 'person' }),
      columns: prop(
        'number',
        'Units per row; chosen from the room when left out (10 or 20 for totals divisible by ten).',
      ),
    },
    limits: { total: 100 },
    example: '<Pictogram value={3} total={10} label="questions now end in the help centre" />',
    accessibility: 'Named and summarised as "3 in 10 <label>".',
    native: null,
  },
  {
    name: 'Progress',
    kind: 'progress',
    useWhen: 'Progress toward a goal, one bar or a short list, with the target marked.',
    messages: ['single number', 'part-to-whole'],
    avoid: 'Gauges and speedometers.',
    data: 'No rows: `value`, `max`, `target`, `label`, or `items` (see `types.ProgressItem`).',
    nulls: 'No rows; each bar needs a `value`. A value past `max` shows the overshoot.',
    shared: ['at', 'caption', 'source', 'format', 'unit'],
    props: {
      value: prop('number', 'How far it has come, for a single bar.'),
      max: prop('number', 'The whole.', { default: 100 }),
      target: prop('number', 'The goal, marked on the track.'),
      label: prop('string', 'What is measured, for a single bar.'),
      items: prop('ProgressItem[]', 'Several bars instead of one.'),
    },
    limits: {},
    example:
      '<Progress value={31} target={40} unit="%" label="of questions solved by self-serve" />',
    accessibility: 'Every value, maximum and goal is in the summary.',
    native: 'bar',
  },
  {
    name: 'Waterfall',
    kind: 'waterfall',
    useWhen:
      'How a total builds up or breaks down between two totals (a bridge: last year to this year).',
    messages: ['flow', 'comparison'],
    avoid: 'A stacked bar with many colors.',
    data:
      'Rows with a step name and a change; total rows (named in `totals`) hold ' +
      'a level, or none for the running total.',
    nulls:
      'A total with no value is the running total; a change with no value ' +
      'counts as no change and is labeled "—".',
    shared: [...FRAME, 'data', 'highlight', 'annotations', 'format', 'unit'],
    props: {
      x: FIELD_PROPS.x,
      y: prop('string', 'The change field; the first number field when left out.'),
      totals: prop('string[]', 'The steps that are totals; the first step when left out.'),
      better: prop(
        '"up" | "down"',
        'Which way is good news, for rises and falls ("down" for costs). Steps ' +
          'keep their tone colors; `highlight` mutes the changes it does not name, ' +
          'never the totals.',
        { default: 'up' },
      ),
      reveal: prop(
        `${REVEAL_BY_TYPE} | RevealOption`,
        'Build the bridge in steps: the totals and the step names show from the start, then ' +
          '`"categories"` brings in one change per step and `"series"` all of them at once. A ' +
          'string starts at step 1; the object form (see `types.RevealOption`) starts at `from`.',
      ),
    },
    limits: { categories: CHART_LIMITS.categories.waterfall ?? 10 },
    example:
      '<Waterfall data={bridge} x="step" y="cost" totals={[\'2025\', \'2026\']} ' +
      'better="down" format="currency" />',
    accessibility:
      'The summary walks the steps from the first total to the last with every change.',
    native: 'bar',
  },
  {
    name: 'Funnel',
    kind: 'funnel',
    useWhen:
      'Drop-off through ordered stages, where the share that carries on between ' +
      'stages is the point.',
    messages: ['flow'],
    avoid: 'Unordered categories (use BarChart), or stages that grow (`deck lint` warns).',
    data: 'Rows in stage order with a stage name and a count.',
    nulls:
      'A stage with no count draws an outlined "no data" slot, and the shares ' +
      'into and out of it are "—".',
    shared: [...FRAME, 'data', 'highlight', 'format', 'unit'],
    props: {
      x: FIELD_PROPS.x,
      y: prop('string', 'The count field.'),
      reveal: prop(
        `${REVEAL_BY_TYPE} | RevealOption`,
        'Build the funnel in steps: `"categories"` brings in one stage per step with the share ' +
          'that carried on into it, `"series"` the whole funnel at once. A string starts at step ' +
          '1; the object form (see `types.RevealOption`) starts at `from`.',
      ),
    },
    limits: { categories: CHART_LIMITS.categories.funnel ?? 7 },
    example: '<Funnel data={journey} x="stage" y="people" highlight="Opened an article" />',
    accessibility: "The summary gives every stage's count and the share that carried on.",
    native: 'bar',
  },
  {
    name: 'Scatter',
    kind: 'scatter',
    useWhen:
      'The relationship between two measures, with the notable points labeled ' +
      'and an optional trend.',
    messages: ['correlation', 'distribution'],
    avoid: 'Dual-axis lines for two measures.',
    data: 'Rows with two number fields and a name field (and a group field for `series`).',
    nulls: 'A row missing either value is left out.',
    shared: ['at', 'caption', 'source', 'data', 'highlight', 'format', 'unit'],
    props: {
      x: prop('string', 'The x field; the first number field.'),
      y: prop('string', 'The y field; the second number field.'),
      label: prop(
        'string',
        'The field naming each point, for highlights, callouts and labels (not ' +
          'the accessible name here).',
      ),
      series: prop('string', 'The field grouping points into colored series.'),
      xLabel: prop('string', 'What x measures, at the end of the x axis.'),
      yLabel: prop('string', 'What y measures, at the top of the y axis.'),
      xFormat: prop('Format', "How x values are written (format and unit are y's)."),
      xUnit: prop('string', 'The unit after x values.'),
      trend: prop('boolean', 'Draw the least-squares trend line, clipped to the plot.', {
        default: false,
      }),
      zero: prop('boolean', 'Start both axes at zero.', { default: false }),
      annotations: POINT_ANNOTATIONS,
    },
    limits: {},
    example:
      '<Scatter data={squads} x="hours" y="csat" label="squad" trend ' +
      'highlight={[\'Billing\']} xLabel="Hours to resolve" yLabel="Rated good, %" ' +
      '/>',
    accessibility:
      "The summary gives the number of points, the trend's direction and the " +
      'highlighted points with values.',
    native: 'scatter',
  },
  {
    name: 'Heatmap',
    kind: 'heatmap',
    useWhen:
      'A pattern across two dimensions (weekday by hour), with the cell that matters outlined.',
    messages: ['distribution', 'comparison'],
    avoid: 'Exact values to compare (use a Table).',
    data: 'Long rows with a column field, a row field and a value field.',
    nulls: 'A missing cell is drawn empty, outside the color scale.',
    shared: [...FRAME, 'data', 'format', 'unit'],
    props: {
      x: prop('string', 'The column field.'),
      y: prop('string', 'The row field.'),
      value: prop('string', 'The value field.'),
      highlight: prop('{ x?, y? } | { x?, y? }[]', 'Cells (or a whole row or column) to outline.'),
      scale: prop('[string, string]', 'The words at the ends of the scale legend.', {
        default: ['Fewer', 'More'],
      }),
    },
    limits: {},
    example:
      '<Heatmap data={load} x="hour" y="day" value="tickets" highlight={{ x: ' +
      "'9–12', y: 'Mon' }} />",
    accessibility:
      'The summary gives the range and the highest cell; values are printed in cells with room.',
    native: null,
  },
  {
    name: 'Sparkline',
    kind: 'sparkline',
    useWhen:
      'A trend as context beside a number, in an aside or a sentence; StatRow ' +
      'and BigNumber have their own.',
    messages: ['trend'],
    avoid: 'A trend that is the message (use LineChart).',
    data: '`values` (numbers, oldest first) or rows with one number field.',
    nulls: 'A missing value breaks the line there.',
    shared: [...FRAME, 'format', 'unit'],
    props: {
      values: prop('number[]', 'The values, oldest first.'),
      data: prop('Row[] | string', 'Rows instead of values.'),
      y: prop('string', 'The field of the rows to draw.'),
      highlight: prop('"last" | "max" | "min"', 'The point to mark and label.', {
        default: 'last',
      }),
      value: prop('boolean', 'Write the marked value at the end.', { default: true }),
      height: prop('number', 'The height in canvas pixels.', { default: 80 }),
    },
    limits: {},
    example: '<Sparkline values={[9, 7.2, 5.8, 4.9, 3.6, 2.5]} unit="h" />',
    accessibility: 'Summarised as its first and last value.',
    native: 'line',
  },
  {
    name: 'Table',
    kind: 'table',
    useWhen:
      'Exact values, lookups or mixed units, about five rows by four columns, ' +
      'with the row that matters emphasized.',
    messages: ['exact values', 'comparison'],
    avoid: 'A pattern across many values (use a chart); the full dataset (put it in the appendix).',
    data:
      'Rows; `columns` picks and labels fields (see `types.TableColumn`). ' +
      'Numbers are written exactly (no rounding) unless a format sets `digits`; ' +
      'pass numbers, not text such as "31%", so they align and format.',
    nulls: 'A missing cell is left empty.',
    shared: [...FRAME, 'data', 'format'],
    props: {
      columns: prop('(string | TableColumn)[]', 'The columns in order; every field when left out.'),
      highlight: prop(
        '{ row?, column?, cell? }',
        "Rows (by first-column text or index), a column or cells, marked the brand's way.",
      ),
    },
    limits: { rows: CHART_LIMITS.categories.table ?? 8 },
    example:
      "<Table data={plans} columns={['plan', { key: 'cost', format: 'currency', " +
      "bar: true }]} highlight={{ row: 'Team' }} />",
    accessibility: 'A real table with header cells; the summary lists the rows.',
    native: 'table',
  },
];

/**
 * Every prop a chart takes: the shared ones it names and its own.
 *
 * @param info - The chart's catalog entry.
 * @returns The prop names, shared first.
 */
export function chartPropNames(info: ChartInfo): string[] {
  return [...new Set([...info.shared, ...Object.keys(info.props)])];
}

/**
 * The catalog: every component, the components for each message, how the insight props work and
 * where the serialisable description lives.
 *
 * @returns The catalog `deck charts --json` prints.
 */
export function chartCatalog(): ChartCatalog {
  const messages = Object.fromEntries(
    CHART_MESSAGES.map((message) => [
      message,
      CHART_INFOS.filter((info) => info.messages.includes(message)).map((info) => info.name),
    ]),
  ) as Record<ChartMessage, string[]>;
  return {
    shared: SHARED_PROPS,
    types: CHART_TYPES,
    charts: CHART_INFOS,
    messages,
    insight: {
      title:
        'The slide title states the takeaway ("Tickets fell 38% after the ' +
        'redesign"); the chart proves it. Put the measure, unit and period in ' +
        '`caption`.',
      props:
        'Each chart takes the shared props its `shared` names and its own ' +
        '`props`; any other prop name throws an error naming the closest one ' +
        '("`value` is not a prop of BarChart; did you mean `y`?").',
      highlight: SHARED_PROPS.highlight.description,
      annotations: SHARED_PROPS.annotations.description,
      labels:
        'Charts label directly (line ends, bar tips, slices) and show a legend ' +
        'only when they cannot.',
      honesty:
        'Bars and areas start at zero; a bar axis above zero needs `truncate` and ' +
        'draws a break, its value axis and an "Axis starts at" note. Lines may ' +
        'zoom and say where the axis starts.',
      steps:
        '`at` on a chart, on a series in `y`, on `highlight` and on each ' +
        'annotation reveals it at a step, from step 1 (step 0 is the slide before any step); ' +
        '`reveal` builds by series or category, and on a Waterfall builds the changes between ' +
        'totals that show from the start. ' +
        'The last step is the complete chart, which static mode and export show.',
      data: SHARED_PROPS.data.description,
      nulls:
        "Each chart's `nulls` says how it draws a missing value (null, an empty " +
        'CSV cell, text that is not a number).',
      format: SHARED_PROPS.format.description,
      relative: RELATIVE_PROP.description,
      limits:
        "Each chart's `limits` are the numbers `deck lint` holds it to; " +
        "`coloredSeries` is the brand's categorical palette size, counted without " +
        'series a highlight mutes.',
    },
    spec: {
      attribute: CHART_SPEC_ATTRIBUTE,
      module: '@deckster/kit/chart-spec',
      version: CHART_SPEC_VERSION,
    },
  };
}
