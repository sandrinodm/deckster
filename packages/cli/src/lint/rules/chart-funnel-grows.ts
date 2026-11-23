import type { SlideRule } from '#lint/types.ts';

import { chartsOn } from '#lint/rules/chart-facts.ts';

/**
 * A funnel with a stage that holds more than the stage before it: a funnel's stages only shrink, so
 * the order is wrong or the data is not a funnel, and the chart would print a share over 100%.
 */
export const chartFunnelGrowsRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-funnel-grows',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step.
   */
  scope: 'slide',

  /**
   * The chart renders; it is probably the wrong order or the wrong form.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A <Funnel> has a stage that holds more than the stage before it.',

  /**
   * Reports each funnel with a growing stage, naming the stages.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot)
      .filter((chart) => chart.growth.length > 0)
      .map((chart) => ({
        message:
          `<Funnel> grows at ${quoteStages(chart.growth)}: ` +
          'a stage holds more than the one before it.',
        fix:
          `A funnel's stages must shrink. Check the stage order and the counts in ${slide.file}, ` +
          'or show the stages as a <BarChart> when they are not steps of one flow.',
        selector: chart.element.selector,
      })),
};

/**
 * The stage names in quotes, separated by commas: `"Leads", "Trials"`.
 *
 * @param stages - The names of the stages that grow.
 */
function quoteStages(stages: readonly string[]): string {
  return stages.map((stage) => `"${stage}"`).join(', ');
}
