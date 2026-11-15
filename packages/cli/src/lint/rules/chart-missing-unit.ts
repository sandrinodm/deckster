import type { SlideRule } from '#lint/types.ts';

import { chartsOn, chartTag } from '#lint/rules/chart-facts.ts';

/**
 * A chart whose values carry no unit: no `unit`, no currency or percent format and no caption
 * naming the measure. "4.2" of what?
 */
export const chartMissingUnitRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-missing-unit',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step.
   */
  scope: 'slide',

  /**
   * A warning: some counts need no unit, but the measure still needs naming.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: "A chart's values have no unit and no caption naming the measure.",

  /**
   * Reports each chart without a unit.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot)
      .filter((chart) => !chart.unit)
      .map((chart) => ({
        message:
          `${chartTag(chart.kind)} shows values without a unit ` +
          'or a caption naming the measure.',
        fix:
          `In ${slide.file}, add \`unit="ms"\` (or a currency or percent \`format\`), ` +
          'or a `caption` with the measure, unit and period: ' +
          '"Open tickets at the end of each week, 2026".',
        selector: chart.element.selector,
      })),
};
