import type { SlideRule } from '#lint/types.ts';

import { chartsOn, chartTag } from '#lint/rules/chart-facts.ts';

/**
 * Kinds that show change over time, which one point cannot.
 */
const TREND_KINDS = new Set(['line', 'area']);

/**
 * A chart that draws nothing (every value missing, or no rows), or a line or area chart with a
 * single point, which shows no trend. Both render without an error, so the slide looks finished
 * while it says nothing.
 */
export const chartEmptyRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-empty',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step, where every mark is shown.
   */
  scope: 'slide',

  /**
   * An empty chart is a broken slide.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A chart draws no marks, or a line or area chart has a single point.',

  /**
   * Reports each chart with no marks, and each line or area chart of one point.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot).flatMap((chart) => {
      if (chart.marks === 0) {
        return [
          {
            message:
              `${chartTag(chart.kind)} draws no marks: ` +
              'every value is missing or the data has no rows.',
            fix:
              `Check the data and the field names in ${slide.file}: ` +
              '`x` and `y` must name fields ' +
              'that hold numbers (text such as "n/a" counts as missing), ' +
              'and the rows must not be empty.',
            selector: chart.element.selector,
          },
        ];
      }

      if (TREND_KINDS.has(chart.kind) && chart.categories === 1) {
        return [
          {
            message: `${chartTag(chart.kind)} has a single point, which shows no trend.`,
            fix:
              `Show the one value as a <BigNumber> in ${slide.file} ` +
              '(or two values as a <Comparison>), ' +
              'or give the chart the earlier points it compares against.',
            selector: chart.element.selector,
          },
        ];
      }

      return [];
    }),
};
