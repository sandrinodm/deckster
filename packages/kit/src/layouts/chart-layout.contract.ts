import { deckCommand } from '@deckster/engine/command';
import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '#layouts/layout-fields.ts';

/**
 * The longest chart title, in characters: two lines at the smallest fit step in both brands.
 */
export const CHART_TITLE_MAX_CHARS = 90;

/**
 * One value of a data row in frontmatter: text, a number, a flag or nothing.
 */
const DataCell = Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null]);

/**
 * Named datasets a chart slide carries in its frontmatter, each a list of rows that a chart on the
 * slide names with `data="name"`.
 */
export const DataField = Schema.optionalKey(
  Schema.Record(Schema.String, Schema.Array(Schema.Record(Schema.String, DataCell))),
);

/**
 * How to fill the `data:` field.
 */
export const DATA_HINT =
  'List datasets by name, each a list of rows, and name one from a chart with ' +
  '`data="name"`: `data: { regions: [{ region: EMEA, revenue: 4.2 }] }`. Inline rows ' +
  '(data={[...]}) and imported JSON or CSV files work too.';

/**
 * The contract of the `chart` layout: a takeaway title over one chart, number or table.
 */
export const chartLayoutContract = defineLayoutContract({
  name: 'chart',
  description:
    'A title that states the takeaway, then one chart, big number or table filling the space ' +
    'under it: <BarChart>, <LineChart>, <Slope>, <Waterfall>, <BigNumber>, <Table> and the ' +
    'rest (`' +
    deckCommand() +
    ' charts`). Fill <Aside> with the "so what" (a key number or a sentence) to ' +
    "set it in a column beside the chart; put the source in <Footnote> or the chart's `source`. " +
    'Datasets may sit in the `data:` frontmatter. Use split when a chart needs a paragraph ' +
    'beside it, and stats for two to four plain numbers; ' +
    'use dashboard for two to four related measures.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    data: DataField,
    chrome: chromeField(true),
  }),
  hints: { eyebrow: EYEBROW_HINT, data: DATA_HINT, chrome: CHROME_HINT },
  title: { required: true, maxChars: CHART_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'One chart, number figure or table component, nothing else; it fills the region. Write ' +
        'the takeaway in `title:` ("Tickets fell 40% after the redesign"), and the measure, unit ' +
        "and period in the chart's `caption`.",
      required: true,
      accepts: ['chart', 'number', 'table', 'component'],
    },
    aside: {
      description:
        'The "so what" beside the chart: a ### heading or a key number and a sentence or two.',
      accepts: ['text', 'number'],
    },
    footnote: {
      description: 'The source and any caveat (sample, period), on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: {
    aside: { maxWords: 40 },
    footnote: { maxWords: 30 },
  },
  variants: [
    {
      name: 'with aside',
      when: { filled: ['aside'] },
      budget: { aside: { maxWords: 36 } },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: {
      title: 'Eastgate has a quarter of the city average shade',
      eyebrow: 'Canopy cover',
    },
    body: [
      '<BarChart',
      '  data={[',
      "    { district: 'Riverside', canopy: 34 },",
      "    { district: 'Northfield', canopy: 26 },",
      "    { district: 'City average', canopy: 21 },",
      "    { district: 'Eastgate', canopy: 9 },",
      '  ]}',
      '  format="percent"',
      '  highlight="Eastgate"',
      '  caption="Share of ground under tree crowns at noon, summer 2026"',
      '/>',
      '',
      '<Footnote>Source: Larkfield summer aerial survey, 2026.</Footnote>',
      '',
      '<Notes>',
      'Point at Eastgate first, then at the city average: the gap is the argument.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
