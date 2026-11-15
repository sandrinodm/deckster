import { CHART_LIMITS } from '@deckster/kit/chart-catalog';

import type { SlideRule } from '#lint/types.ts';

import { chartsOn, chartTag } from '#lint/rules/chart-facts.ts';

/**
 * From this many series a chart needs a highlight to say which one the point is about (the kit's
 * chart limits).
 */
const SERIES_NEEDING_FOCUS = CHART_LIMITS.seriesNeedingHighlight;

/**
 * From this many categories a chart needs a highlight to say which one the point is about (the
 * kit's chart limits).
 */
const CATEGORIES_NEEDING_FOCUS = CHART_LIMITS.categoriesNeedingHighlight;

/**
 * Kinds that carry their emphasis in their own form (a number, a sequential scale, a sparkline).
 */
const EXEMPT = new Set(['sparkline', 'big-number', 'pictogram', 'heatmap']);

/**
 * A chart with several series or many categories that highlights nothing: the audience has seconds
 * and no cue where to look, and it usually means the takeaway was not decided.
 */
export const chartNoHighlightRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-no-highlight',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step, where a highlight at a step is on.
   */
  scope: 'slide',

  /**
   * A design warning.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'A chart with several series or many categories highlights nothing.',

  /**
   * Reports each busy chart without a highlight.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot)
      .filter(
        (chart) =>
          !EXEMPT.has(chart.kind) &&
          !chart.highlighted &&
          (chart.series >= SERIES_NEEDING_FOCUS || chart.categories >= CATEGORIES_NEEDING_FOCUS),
      )
      .map((chart) => ({
        message:
          `${chartTag(chart.kind)} draws ${chart.series} series ` +
          `over ${chart.categories} categories ` +
          'and highlights nothing.',
        fix:
          `Add \`highlight\` in ${slide.file} for the series, category or point ` +
          'the title is about ' +
          '(`highlight="EMEA"`, `highlight="max"`, `highlight={{ range: [...] }}`); ' +
          'the rest drops to the context color.',
        selector: chart.element.selector,
      })),
};
