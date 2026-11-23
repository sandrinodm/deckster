import type { SlideRule } from '#lint/types.ts';

import { chartsOn, chartTag } from '#lint/rules/chart-facts.ts';

/**
 * Kinds whose series are not colored series: a heatmap's rows, a table's columns.
 */
const EXEMPT = new Set(['heatmap', 'table']);

/**
 * A chart with more colored series than the brand has distinct data colors: past them, series fall
 * back to the context color and no reader can hold the mapping. Series a highlight drops to the
 * context color do not count (`data-chart-colored`), so one highlighted line among nine is fine.
 */
export const chartTooManySeriesRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-too-many-series',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step, where every series is shown.
   */
  scope: 'slide',

  /**
   * The chart still renders; it is hard to read.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description:
    "A chart draws more series in their own color than the brand's categorical palette has colors.",

  /**
   * Reports each chart whose colored series outnumber the palette.
   */
  check: ({ snapshot, brand, slide }) => {
    const limit = brand.surface.data.categorical.length;
    return chartsOn(snapshot)
      .filter((chart) => !EXEMPT.has(chart.kind) && (chart.colored ?? chart.series) > limit)
      .map((chart) => {
        const colored = chart.colored ?? chart.series;
        const highlight = chart.highlighted
          ? 'or narrow the highlight to the one or two series the title is about'
          : 'or highlight one and let the rest be context (`highlight="..."`)';
        return {
          message:
            `${chartTag(chart.kind)} draws ${colored} series in their own color; ` +
            `the brand has ${limit} distinct data colors.`,
          fix:
            `Cut the series in ${slide.file} to the ones the point needs, ` +
            'fold the rest into "Other", ' +
            `${highlight}, or split it into small multiples.`,
          selector: chart.element.selector,
        };
      });
  },
};
