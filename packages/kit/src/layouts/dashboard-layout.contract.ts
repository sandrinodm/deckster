import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { DATA_HINT, DataField } from '#layouts/chart-layout.contract.ts';
import {
  CHROME_HINT,
  chromeField,
  EYEBROW_HINT,
  EyebrowField,
  REVEAL_HINT,
  RevealField,
  textField,
} from '#layouts/layout-fields.ts';

/**
 * The fewest panels: a single chart belongs in the chart layout.
 */
export const MIN_DASHBOARD_PANELS = 2;

/**
 * The most panels: four make a two-by-two grid.
 */
export const MAX_DASHBOARD_PANELS = 4;

/**
 * The longest panel heading, in characters, for two panels.
 */
export const DASHBOARD_PANEL_TITLE_MAX_CHARS = 24;

/**
 * The longest panel heading, in characters, for three or four panels.
 */
export const DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE = 18;

/**
 * The longest takeaway title, in characters, kept to one line above the plots.
 */
export const DASHBOARD_TITLE_MAX_CHARS = 50;

/**
 * One panel's short heading; its chart comes from the same position in the body.
 */
const DashboardPanel = Schema.Struct({
  title: textField(DASHBOARD_PANEL_TITLE_MAX_CHARS, 'a panel title'),
});

/**
 * One decoded panel heading from a dashboard's frontmatter.
 */
export type DashboardPanelEntry = typeof DashboardPanel.Type;

/**
 * The contract of dashboard: two to four small charts supporting one takeaway.
 */
export const dashboardLayoutContract = defineLayoutContract({
  name: 'dashboard',
  description:
    'Two to four small charts or number components under one takeaway title: two side by side, ' +
    'three in a row, or four in a two-by-two grid. List each short heading in `panels:` and put ' +
    'one kit chart or number component per panel in the body, in that order. ' +
    "Each panel's title names the measure, unit and period. With four panels, use at most two " +
    'plotted charts; fill the other panels with BigNumber, Progress or Sparkline. ' +
    'With three or four panels omit chart captions, and keep a unit or percent/currency format ' +
    'on every chart. In three or four panels keep area and line chart units short or put ' +
    'the full unit in the panel heading. Highlight the same subject in every panel (as `highlight="2026"` in both ' +
    'charts), or only in the panel the title is about. Put shared sources in <Footnote>. ' +
    '`reveal: true` keeps headings and rules visible and reveals one plot per step; the shared ' +
    'source stays visible throughout. A Table may have up to four data rows and three columns, ' +
    'in two panels only. Use chart for one detailed plot or a chart with an aside; ' +
    'if every panel is a number, use stats. Use separate slides for different conclusions.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    panels: Schema.Array(DashboardPanel).check(
      Schema.isMinLength(MIN_DASHBOARD_PANELS, {
        message: `Expected at least ${MIN_DASHBOARD_PANELS} panels`,
      }),
      Schema.isMaxLength(MAX_DASHBOARD_PANELS, {
        message: `Expected at most ${MAX_DASHBOARD_PANELS} panels`,
      }),
    ),
    data: DataField,
    reveal: RevealField,
    chrome: chromeField(true),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    panels:
      `List ${MIN_DASHBOARD_PANELS} to ${MAX_DASHBOARD_PANELS} panels, each with a \`title\` of ` +
      `up to ${DASHBOARD_PANEL_TITLE_MAX_CHARS} characters ` +
      `(${DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE} with three or four panels). ` +
      'Each title names the measure, unit and period. Write one direct component per heading. ' +
      'With four panels use at most two plotted charts and BigNumber, Progress or Sparkline ' +
      'for the rest.',
    data: DATA_HINT,
    reveal:
      `${REVEAL_HINT} Headings and rules stay visible; only plots reveal, ` +
      'with the source always visible.',
    chrome: CHROME_HINT,
  },
  title: { required: true, maxChars: DASHBOARD_TITLE_MAX_CHARS },
  slots: {
    body: {
      description:
        'Exactly one direct kit chart or number component per panel, in heading order. ' +
        "Each panel's title names the measure, unit and period. Use one series and at most four " +
        'categories with labels up to 11 characters in two panels; with three or four panels use ' +
        'at most three categories and seven-character labels. LineChart and AreaChart x labels ' +
        'are periods of up to four characters (Mar, Q3, 2026). With three or four panels keep ' +
        'area and line chart units short or put the full unit in the panel heading; with three ' +
        'panels keep the largest value to nine characters including the unit (800 trees, ' +
        '1.5K), using K or M for thousands. With four panels allow at most ' +
        'two plotted charts (BarChart, LineChart, AreaChart, Donut and similar); use BigNumber, ' +
        'Progress or Sparkline in the remaining panels. With two or four panels set Donut center="none"; ' +
        'keep shares and labels outside the ring. A Sparkline belongs beside numbers, not as a ' +
        "panel's only plot. Keep number values to eight characters and number labels to 18 " +
        'characters with three or four panels. Omit captions with three or four panels; in two ' +
        'panels captions may use up to 32 characters. Keep unit= or a percent/currency ' +
        'format on every chart. A Table may have up to four data rows and three columns, ' +
        'two panels only; keep its headers and labels to 11 characters. ' +
        'Use units on its columns. ' +
        'Avoid annotations and individual sources. ' +
        'Do not wrap components in prose, divs or Steps; use `reveal: true` for builds. ' +
        'If every panel is a number, use stats.',
      required: true,
      accepts: ['chart', 'number', 'table', 'component'],
    },
    footnote: {
      description: 'The shared source or caveat on the bottom line.',
      accepts: ['text'],
    },
  },
  budget: { footnote: { maxWords: 16 } },
  variants: [
    {
      name: 'three or four panels',
      when: { counts: { panels: { min: 3, max: 4 } } },
      budget: {},
      fields: { 'panels[].title': { maxChars: DASHBOARD_PANEL_TITLE_MAX_CHARS_DENSE } },
    },
  ],
  pptx: {
    type: 'title-only',
    placeholders: [{ kind: 'title', from: { selector: '.kit-title' } }],
  },
  example: {
    frontmatter: {
      title: 'More trees survive when neighbours water them',
      eyebrow: 'Eastgate pilot',
      panels: [{ title: 'Survival, %, 2026' }, { title: 'Warden cover, %, 2026' }],
    },
    body: [
      '<BigNumber value={94} unit="%" label="trees alive after summer" />',
      '',
      '<Progress value={86} target={90} label="blocks with a warden" ' +
        'caption="Blocks covered, %, 2026" />',
      '',
      '<Footnote>Larkfield pilot survey, September 2026.</Footnote>',
      '',
      '<Notes>',
      'Read survival first, then the watering cover that supports it.',
      '</Notes>',
      '',
    ].join('\n'),
  },
});
