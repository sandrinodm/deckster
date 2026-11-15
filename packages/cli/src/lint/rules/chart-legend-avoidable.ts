import type { SlideRule } from '#lint/types.ts';

import { chartsOn, chartTag } from '#lint/rules/chart-facts.ts';

/**
 * A chart with a legend it does not need: the series could be labeled directly (at line ends, on
 * bars, beside slices), which saves the eye a trip to the key and back.
 */
export const chartLegendAvoidableRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-legend-avoidable',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step.
   */
  scope: 'slide',

  /**
   * A design warning.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'A chart shows a legend where direct labels would name the series.',

  /**
   * Reports each chart whose legend was forced on although it could label directly.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot)
      .filter((chart) => chart.legend && chart.legendAvoidable)
      .map((chart) => ({
        message: `${chartTag(chart.kind)} shows a legend, but its series can be labeled directly.`,
        fix:
          `Remove \`legend\` from the chart in ${slide.file}; ` +
          'it labels each series where it ends.',
        selector: chart.element.selector,
      })),
};
