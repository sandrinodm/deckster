import { CHART_LIMITS } from '@deckster/kit/chart-catalog';

import type { SlideRule } from '#lint/types.ts';

import { chartsOn } from '#lint/rules/chart-facts.ts';

/**
 * The most slices a donut keeps readable: people judge "about a quarter" well, fine differences
 * badly. From the kit's chart limits, which `deck charts --json` prints.
 */
const MAX_SLICES = CHART_LIMITS.slices;

/**
 * A donut with more than five slices.
 */
export const chartPieSlicesRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'chart-pie-slices',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Checked once, on the last step.
   */
  scope: 'slide',

  /**
   * The chart still renders; the wrong form for the data.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: `A <Donut> has more than ${MAX_SLICES} slices.`,

  /**
   * Reports each donut over the limit.
   */
  check: ({ snapshot, slide }) =>
    chartsOn(snapshot)
      .filter((chart) => (chart.slices ?? 0) > MAX_SLICES)
      .map((chart) => ({
        message:
          `<Donut> has ${chart.slices ?? 0} slices; ` +
          `past ${MAX_SLICES} the angles cannot be compared.`,
        fix:
          `In ${slide.file}, fold the small slices into "Other", or use a sorted <BarChart> ` +
          '(parts need not sum visually), or a <Pictogram> for one share.',
        selector: chart.element.selector,
      })),
};
