import type { SlideRule } from '#lint/types.ts';

import { chartsOn, chartTag } from '#lint/rules/chart-facts.ts';

/**
 * A bar chart asked to start its axis above zero without `truncate`. Bar length encodes the value,
 * so a cut axis exaggerates differences even for viewers told about it; the chart draws from zero
 * instead and this rule names the fix.
 */
export const chartTruncatedAxisRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-truncated-axis',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step.
   */
  scope: 'slide',

  /**
   * A misleading axis fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'A bar chart sets `min` above zero without `truncate`, so its bars would lie.',

  /**
   * Reports each bar chart whose truncation was refused.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot)
      .filter((chart) => chart.axis === 'refused')
      .map((chart) => ({
        message:
          `${chartTag(chart.kind)} sets \`min\` above zero; ` +
          'bars start at zero, so the chart draws from zero.',
        fix:
          `In ${slide.file}, remove \`min\`, or show the values with a <LineChart> or dots, ` +
          'which may zoom. Add `truncate` only if the cut is essential: ' +
          'the chart then draws an axis break.',
        selector: chart.element.selector,
      })),
};
